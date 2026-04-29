export async function registerHistoryOperationsTests({
  runCheck,
  assert,
  fs,
  os,
  path,
  MarketHistoryStore,
  loadConfig,
  runHistoryCommand
}) {
  await runCheck("market history store defers quarantine when rename is locked and removes the bad partition from coverage", async () => {
    const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-history-locked-"));
    const store = new MarketHistoryStore({
      rootDir: historyDir,
      renameFile: async () => {
        const error = new Error("locked");
        error.code = "EPERM";
        throw error;
      }
    });
    await store.init();
    await store.saveSeries({
      symbol: "BTCUSDT",
      interval: "1d",
      candles: [
        { openTime: Date.parse("2026-01-01T00:00:00.000Z"), closeTime: Date.parse("2026-01-01T23:59:59.000Z"), open: 100, high: 110, low: 95, close: 105, volume: 10 },
        { openTime: Date.parse("2026-02-01T00:00:00.000Z"), closeTime: Date.parse("2026-02-01T23:59:59.000Z"), open: 105, high: 112, low: 101, close: 109, volume: 11 }
      ]
    });
    await fs.writeFile(store.partitionPath("BTCUSDT", "1d", "2026-02"), "{\u0000broken", "utf8");

    const verification = await store.verifySeries({
      symbol: "BTCUSDT",
      interval: "1d",
      referenceNow: "2026-02-10T00:00:00.000Z"
    });

    assert.equal(verification.count, 1);
    assert.ok(verification.recovery.actions.some((item) => item.type === "partition_quarantine_deferred"));
    const manifest = await store.loadManifest({ symbol: "BTCUSDT", interval: "1d" });
    assert.equal(manifest.partitions.some((item) => item.id === "2026-02"), false);
  });

  await runCheck("history inspect command reports storage health and configured source", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-history-inspect-"));
    const historyDir = path.join(projectRoot, "custom-history");
    await fs.writeFile(path.join(projectRoot, ".env"), "HISTORY_DIR=./custom-history\n", "utf8");
    const config = await loadConfig(projectRoot);

    const result = await runHistoryCommand({
      config,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      args: ["inspect"]
    });

    assert.equal(result.command, "history inspect");
    assert.equal(result.historyDir, historyDir);
    assert.equal(result.historyDirSource, "env");
    assert.equal(result.storage.status, "ready");
    assert.equal(result.storage.writable, true);
  });

  await runCheck("history migrate command copies an existing history tree into the configured history root", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-history-migrate-"));
    const sourceDir = path.join(projectRoot, "legacy-history");
    const targetDir = path.join(projectRoot, "managed-history");
    const sourceStore = new MarketHistoryStore({ rootDir: sourceDir });
    await sourceStore.init();
    await sourceStore.saveSeries({
      symbol: "ETHUSDT",
      interval: "1d",
      candles: [
        { openTime: Date.parse("2026-04-20T00:00:00.000Z"), closeTime: Date.parse("2026-04-20T23:59:59.000Z"), open: 2000, high: 2100, low: 1990, close: 2050, volume: 12 }
      ]
    });
    await fs.writeFile(path.join(projectRoot, ".env"), "HISTORY_DIR=./managed-history\n", "utf8");
    const config = await loadConfig(projectRoot);

    const result = await runHistoryCommand({
      config,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      args: ["migrate", `--from=${sourceDir}`]
    });

    assert.equal(result.command, "history migrate");
    assert.ok(result.migration.copiedCount >= 1);
    const targetManifest = path.join(targetDir, "binance", "spot", "klines", "1d", "ETHUSDT", "manifest.json");
    const migratedManifest = JSON.parse(await fs.readFile(targetManifest, "utf8"));
    assert.equal(migratedManifest.symbol, "ETHUSDT");
    assert.equal(result.targetStorage.status, "ready");
  });
}
