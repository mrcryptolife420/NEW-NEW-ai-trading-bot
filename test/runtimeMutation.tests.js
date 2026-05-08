function makeDashboardStub(overrides = {}) {
  return {
    generatedAt: "2026-04-21T10:00:00.000Z",
    contract: { version: "v1", kind: "snapshot", shape: "dashboard_snapshot", dto: "dashboard_snapshot", schemaVersion: 2 },
    overview: { mode: "paper" },
    ops: { readiness: { status: "ready", reasons: [] }, manualReviewQueue: { pendingCount: 0, overdueCount: 0, items: [] } },
    snapshotMeta: { dto: { name: "dashboard_snapshot", schemaVersion: 2 }, performance: { sections: [] } },
    ...overrides
  };
}

export async function registerRuntimeMutationTests({
  runCheck,
  assert,
  fs,
  os,
  path,
  TradingBot,
  BotManager,
  makeConfig
}) {
  await runCheck("paper-trade lifecycle events persist with domain metadata", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-paper-lifecycle-"));
    const bot = new TradingBot({ config: makeConfig({ runtimeDir }), logger: { info() {}, warn() {}, error() {}, debug() {} } });
    bot.runtime = { signalFlow: {}, service: {}, openPositions: [] };
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.model = { getState() { return {}; } };
    bot.modelBackups = [];
    bot.stream = { getStatus() { return {}; } };
    bot.rlPolicy = { getState() { return {}; } };
    bot.dataRecorder = { getSummary() { return {}; } };
    bot.backupManager = { getSummary() { return {}; } };

    bot.notePaperTradeExecuted({
      candidate: { symbol: "BTCUSDT", strategySummary: "trend" },
      position: { id: "paper-1", symbol: "BTCUSDT", quantity: 0.1, entryPrice: 100, brokerMode: "paper" },
      at: "2026-04-21T10:00:00.000Z"
    });
    bot.notePaperTradePersisted({
      position: { id: "paper-1", symbol: "BTCUSDT", quantity: 0.1, entryPrice: 100, brokerMode: "paper" },
      at: "2026-04-21T10:01:00.000Z"
    });
    await bot.persist();

    const journal = await bot.store.loadJournal();
    const executedEvent = journal.events.find((item) => item.type === "paper_trade_executed");
    const persistedEvent = journal.events.find((item) => item.type === "paper_trade_persisted");
    assert.equal(executedEvent.category, "paper");
    assert.equal(executedEvent.scope, "lifecycle");
    assert.equal(persistedEvent.category, "paper");
  });

  await runCheck("bot manager reuses returned dashboard snapshots for operator mutations", async () => {
    const manager = new BotManager({ projectRoot: process.cwd(), logger: { warn() {}, error() {} } });
    let getDashboardSnapshotCalls = 0;
    manager.bot = {
      acknowledgeAlert: async () => makeDashboardStub({ overview: { mode: "paper", reused: true } }),
      getDashboardSnapshot: async () => {
        getDashboardSnapshotCalls += 1;
        return makeDashboardStub();
      }
    };
    manager.ensureBotReady = async () => {};
    manager.buildSnapshotFromDashboard = (dashboard) => ({ dashboard, manager: { readiness: dashboard.ops?.readiness || {} } });

    const result = await manager.acknowledgeAlert("alert-1", true, "ok");
    assert.equal(getDashboardSnapshotCalls, 0);
    assert.equal(result.dashboard.overview.reused, true);
  });

  await runCheck("bot manager applies GUI trade profiles to env and marks exact active profile", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-profile-apply-"));
    const envPath = path.join(projectRoot, ".env");
    await fs.writeFile(envPath, "BOT_MODE=paper\nCONFIG_PROFILE=paper-safe\nPAPER_MODE_PROFILE=demo_spot\nPAPER_EXECUTION_VENUE=binance_demo_spot\nBINANCE_API_BASE_URL=https://demo-api.binance.com\nBINANCE_FUTURES_API_BASE_URL=https://demo-fapi.binance.com\n", "utf8");
    const manager = new BotManager({ projectRoot, logger: { warn() {}, error() {} } });
    manager.config = {
      envPath,
      botMode: "paper",
      profile: { id: "paper-safe" },
      paperModeProfile: "sim",
      paperExecutionVenue: "internal"
    };
    manager.ensureBotReady = async () => {};
    manager.stopUnlocked = async () => ({});
    manager.reinitializeBot = async () => {};
    manager.getSnapshot = async () => ({ manager: { currentMode: "paper" }, dashboard: {} });

    const result = await manager.applyConfigProfile("paper-neural-learning");
    const written = await fs.readFile(envPath, "utf8");
    assert.equal(result.writeVerified, true);
    assert.match(written, /PAPER_MODE_PROFILE=learn/);
    assert.match(written, /NEURAL_SELF_TUNING_ENABLED=true/);
    assert.match(written, /BINANCE_API_BASE_URL=\n/);
    assert.match(written, /BINANCE_FUTURES_API_BASE_URL=\n/);

    const activeProfiles = (await manager.getConfigProfiles()).profiles.filter((profile) => profile.active);
    assert.deepEqual(activeProfiles.map((profile) => profile.id), ["paper-neural-learning"]);
  });

  await runCheck("bot manager honors user writable CODEX_BOT_ENV_PATH", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-project-env-root-"));
    const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-user-env-"));
    const userEnvPath = path.join(configDir, ".env");
    await fs.writeFile(path.join(projectRoot, ".env.example"), "BOT_MODE=paper\n", "utf8");
    await fs.writeFile(userEnvPath, "BOT_MODE=paper\nCONFIG_PROFILE=paper-safe\nPAPER_MODE_PROFILE=sim\nPAPER_EXECUTION_VENUE=internal\n", "utf8");
    const previous = process.env.CODEX_BOT_ENV_PATH;
    process.env.CODEX_BOT_ENV_PATH = userEnvPath;
    try {
      const manager = new BotManager({ projectRoot, logger: { warn() {}, error() {} } });
      manager.config = {
        envPath: userEnvPath,
        botMode: "paper",
        profile: { id: "paper-safe" },
        paperModeProfile: "sim",
        paperExecutionVenue: "internal"
      };
      manager.ensureBotReady = async () => {};
      manager.stopUnlocked = async () => ({});
      manager.reinitializeBot = async () => {};
      manager.getSnapshot = async () => ({ manager: { currentMode: "paper" }, dashboard: {} });

      const result = await manager.applyConfigProfile("beginner-paper-learning");
      const projectEnv = await fs.readFile(path.join(projectRoot, ".env.example"), "utf8");
      const userEnv = await fs.readFile(userEnvPath, "utf8");
      assert.equal(result.envPath, userEnvPath);
      assert.match(userEnv, /CONFIG_PROFILE=paper-learning/);
      assert.equal(projectEnv, "BOT_MODE=paper\n");
    } finally {
      if (previous === undefined) {
        delete process.env.CODEX_BOT_ENV_PATH;
      } else {
        process.env.CODEX_BOT_ENV_PATH = previous;
      }
    }
  });

  await runCheck("setup complete writes beginner profile and returns checks", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-setup-complete-"));
    const envPath = path.join(projectRoot, ".env");
    await fs.writeFile(envPath, "BOT_MODE=paper\nCONFIG_PROFILE=paper-safe\nPAPER_MODE_PROFILE=demo_spot\nPAPER_EXECUTION_VENUE=binance_demo_spot\nBINANCE_API_BASE_URL=https://demo-api.binance.com\nBINANCE_FUTURES_API_BASE_URL=https://demo-fapi.binance.com\n", "utf8");
    await fs.mkdir(path.join(projectRoot, "src", "dashboard", "public"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "src", "dashboard", "public", "index.html"), "", "utf8");
    await fs.writeFile(path.join(projectRoot, "src", "dashboard", "server.js"), "", "utf8");
    const manager = new BotManager({ projectRoot, logger: { warn() {}, error() {} } });
    manager.config = {
      envPath,
      botMode: "paper",
      profile: { id: "paper-safe" },
      paperModeProfile: "sim",
      paperExecutionVenue: "internal"
    };
    manager.ensureBotReady = async () => {};
    manager.stopUnlocked = async () => ({});
    manager.reinitializeBot = async () => {};
    manager.getSnapshot = async () => ({ manager: { currentMode: "paper" }, dashboard: {} });

    const result = await manager.completeSetup({ profileId: "beginner-paper-learning" });
    const written = await fs.readFile(envPath, "utf8");
    assert.equal(result.completed, true);
    assert.equal(result.checks.ok, true);
    assert.match(written, /CONFIG_PROFILE=paper-learning/);
    assert.match(written, /PAPER_EXPLORATION_ENABLED=true/);
    assert.match(written, /BINANCE_API_BASE_URL=\n/);
  });

  await runCheck("bootstrap warnings initialize runtime service state lazily", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-bootstrap-warning-"));
    const bot = new TradingBot({ config: makeConfig({ runtimeDir }), logger: { info() {}, warn() {}, error() {}, debug() {} } });
    bot.runtime = undefined;

    bot.noteBootstrapWarning("market_history_storage_degraded", new Error("storage degraded"), "2026-04-21T10:00:00.000Z");

    assert.equal(bot.runtime.service.initWarnings.length, 1);
    assert.equal(bot.runtime.service.initWarnings[0].type, "market_history_storage_degraded");
  });
}
