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

  await runCheck("bootstrap warnings initialize runtime service state lazily", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-bootstrap-warning-"));
    const bot = new TradingBot({ config: makeConfig({ runtimeDir }), logger: { info() {}, warn() {}, error() {}, debug() {} } });
    bot.runtime = undefined;

    bot.noteBootstrapWarning("market_history_storage_degraded", new Error("storage degraded"), "2026-04-21T10:00:00.000Z");

    assert.equal(bot.runtime.service.initWarnings.length, 1);
    assert.equal(bot.runtime.service.initWarnings[0].type, "market_history_storage_degraded");
  });
}
