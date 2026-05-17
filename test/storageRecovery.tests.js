export async function registerStorageRecoveryTests({
  runCheck,
  assert,
  fs,
  os,
  path,
  MarketHistoryStore,
  StateStore
}) {
  await runCheck("state store writes manifest-backed snapshot bundles and verifies hashes", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-state-manifest-"));
    const store = new StateStore(runtimeDir);
    await store.init();
    const manifest = await store.saveSnapshotBundle({
      runtime: { openPositions: [{ id: "pos-1", symbol: "BTCUSDT", entryAt: "2026-01-01T00:00:00.000Z", quantity: 0.01, entryPrice: 100 }] },
      journal: { trades: [{ id: "trade-1", symbol: "BTCUSDT", brokerMode: "paper" }] },
      model: { bias: 0.1, weights: { momentum: 1 } },
      modelBackups: [{ id: "backup-1" }]
    });
    assert.equal(manifest.files.length, 4);
    assert.equal(manifest.files.some((item) => item.path === "runtime.json" && item.role === "runtime"), true);
    const verification = await store.verifySnapshotManifest();
    assert.equal(verification.status, "ok");
    assert.equal(verification.errors.length, 0);
  });

  await runCheck("state store detects corrupted manifest bundle member and cleans incomplete staging files", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-state-corrupt-"));
    const store = new StateStore(runtimeDir);
    await store.init();
    await store.saveSnapshotBundle({
      runtime: { openPositions: [] },
      journal: { trades: [] },
      model: { bias: 0, weights: {} },
      modelBackups: []
    });
    await fs.writeFile(path.join(runtimeDir, "runtime.json"), "{\"schemaVersion\":7,\"openPositions\":[]}\n", "utf8");
    await fs.writeFile(path.join(runtimeDir, "runtime.json.staging-leftover.tmp"), "partial", "utf8");
    const verification = await store.verifySnapshotManifest();
    assert.equal(verification.status, "corrupt");
    assert.ok(verification.errors.some((item) => item.includes("runtime.json")));
    await store.init();
    const files = await fs.readdir(runtimeDir);
    assert.equal(files.some((item) => item.endsWith(".tmp")), false);
  });

  await runCheck("market history store quarantines corrupt manifests and rebuilds from valid partitions", async () => {
    const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-history-manifest-"));
    const store = new MarketHistoryStore({ rootDir: historyDir });
    await store.init();
    await store.saveSeries({
      symbol: "BTCUSDT",
      interval: "1d",
      candles: [
        { openTime: Date.parse("2026-01-01T00:00:00.000Z"), closeTime: Date.parse("2026-01-01T23:59:59.000Z"), open: 100, high: 110, low: 95, close: 105, volume: 10 },
        { openTime: Date.parse("2026-02-01T00:00:00.000Z"), closeTime: Date.parse("2026-02-01T23:59:59.000Z"), open: 105, high: 112, low: 101, close: 109, volume: 11 }
      ]
    });

    const manifestPath = store.seriesPath("BTCUSDT", "1d");
    await fs.writeFile(manifestPath, "{\u0000broken", "utf8");

    const verification = await store.verifySeries({ symbol: "BTCUSDT", interval: "1d", referenceNow: "2026-02-10T00:00:00.000Z" });
    assert.equal(verification.count, 2);
    assert.ok(verification.recovery.actionCount >= 2);
    assert.ok(verification.recovery.actions.some((item) => item.type === "manifest_quarantined"));
    assert.ok(verification.recovery.actions.some((item) => item.type === "manifest_rebuilt"));
    const quarantinedFiles = (await fs.readdir(path.dirname(manifestPath))).filter((item) => item.startsWith("manifest.json.corrupt-"));
    assert.ok(quarantinedFiles.length >= 1, "corrupt manifest should be quarantined");
  });

  await runCheck("market history store quarantines corrupt partitions and keeps surviving coverage", async () => {
    const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-history-partition-"));
    const store = new MarketHistoryStore({ rootDir: historyDir });
    await store.init();
    await store.saveSeries({
      symbol: "BTCUSDT",
      interval: "1d",
      candles: [
        { openTime: Date.parse("2026-01-01T00:00:00.000Z"), closeTime: Date.parse("2026-01-01T23:59:59.000Z"), open: 100, high: 110, low: 95, close: 105, volume: 10 },
        { openTime: Date.parse("2026-02-01T00:00:00.000Z"), closeTime: Date.parse("2026-02-01T23:59:59.000Z"), open: 105, high: 112, low: 101, close: 109, volume: 11 }
      ]
    });

    const corruptPartitionPath = store.partitionPath("BTCUSDT", "1d", "2026-02");
    await fs.writeFile(corruptPartitionPath, "{\u0000broken", "utf8");

    const verification = await store.verifySeries({ symbol: "BTCUSDT", interval: "1d", referenceNow: "2026-02-10T00:00:00.000Z" });
    assert.equal(verification.count, 1);
    assert.ok(verification.recovery.actions.some((item) => item.type === "partition_quarantined"));
    const manifest = await store.loadManifest({ symbol: "BTCUSDT", interval: "1d" });
    assert.equal(manifest.partitions.some((item) => item.id === "2026-02"), false);
  });
}
