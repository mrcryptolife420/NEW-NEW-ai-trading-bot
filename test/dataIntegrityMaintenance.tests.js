import path from "node:path";
import { appendJsonLine } from "../src/utils/fs.js";
import {
  RECORDER_FRAME_SCHEMA_VERSION,
  getSchemaVersion,
  isSchemaVersionSupported,
  withSchemaVersion
} from "../src/storage/schemaVersion.js";
import { migrateRecord } from "../src/storage/migrations/index.js";
import { auditRecorderFrames } from "../src/storage/recorderIntegrityAudit.js";
import { buildRecorderAuditSummary, buildStorageAuditSummary, buildStorageRetentionReport } from "../src/storage/storageAudit.js";
import { buildReplayContext, compareReplayOutput, hashReplayInput } from "../src/runtime/replayDeterminism.js";
import { createDeterministicId, createSeededRandom } from "../src/utils/seeded.js";
import { scoreDataFreshness } from "../src/runtime/dataFreshnessScore.js";
import { evaluateDatasetQuality } from "../src/runtime/datasetQualityGate.js";
import { validateBacktestResult } from "../src/backtest/backtestIntegrity.js";
import { buildReplayPackManifest } from "../src/runtime/replayPackManifest.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerDataIntegrityMaintenanceTests({
  runCheck,
  assert,
  fs,
  os,
  runCli
}) {
  await runCheck("schema version helpers handle missing supported unsupported and non-object inputs", async () => {
    assert.equal(getSchemaVersion({ schemaVersion: 8 }), 8);
    assert.equal(getSchemaVersion({}), 0);
    assert.equal(getSchemaVersion(null), 0);
    assert.equal(isSchemaVersionSupported({ schemaVersion: 8 }, [7, 8]), true);
    assert.equal(isSchemaVersionSupported({ schemaVersion: 9 }, [7, 8]), false);
    assert.deepEqual(withSchemaVersion("legacy", 3), { schemaVersion: 3, value: "legacy" });
  });

  await runCheck("storage migrations provide no-op current safe legacy and future handling", async () => {
    const current = migrateRecord({ schemaVersion: RECORDER_FRAME_SCHEMA_VERSION, frameType: "decision" }, { kind: "recorder_frame" });
    assert.equal(current.status, "current");
    const legacy = migrateRecord({ frameType: "decision" }, { kind: "recorder_frame", now: "2026-01-01T00:00:00.000Z" });
    assert.equal(legacy.status, "migrated");
    assert.equal(legacy.record.schemaVersion, RECORDER_FRAME_SCHEMA_VERSION);
    assert.ok(legacy.warnings.includes("missing_schema_version_assumed_legacy"));
    const future = migrateRecord({ schemaVersion: 999 }, { kind: "recorder_frame" });
    assert.equal(future.status, "unsupported_future_version");
    const corrupt = migrateRecord(null, { kind: "trade" });
    assert.equal(corrupt.status, "fallback");
    assert.equal(corrupt.error, "record_not_object");
  });

  await runCheck("recorder integrity audit classifies ok warning degraded and corrupt frames", async () => {
    const ok = auditRecorderFrames({
      frames: [{
        schemaVersion: RECORDER_FRAME_SCHEMA_VERSION,
        frameType: "decision",
        at: "2026-01-01T00:00:00.000Z",
        decisionId: "d1",
        configHash: "hash",
        recordQuality: { score: 0.9 }
      }]
    });
    assert.equal(ok.status, "ok");
    const warning = auditRecorderFrames({
      frames: [{
        schemaVersion: RECORDER_FRAME_SCHEMA_VERSION,
        frameType: "decision",
        at: "2026-01-01T00:00:00.000Z",
        decisionId: "d1",
        recordQuality: { score: 0.2 }
      }]
    });
    assert.equal(warning.status, "warning");
    assert.ok(warning.issues.some((issue) => issue.code === "missing_config_hash"));
    const degraded = auditRecorderFrames({ frames: [{ schemaVersion: RECORDER_FRAME_SCHEMA_VERSION, frameType: "mystery", at: "bad" }] });
    assert.equal(degraded.status, "degraded");
    const corrupt = auditRecorderFrames({
      frames: [
        { schemaVersion: RECORDER_FRAME_SCHEMA_VERSION, frameType: "trade", at: "2026-01-01T00:00:00.000Z", tradeId: "t1", configHash: "hash" },
        { schemaVersion: RECORDER_FRAME_SCHEMA_VERSION, frameType: "trade", at: "2026-01-01T00:01:00.000Z", tradeId: "t1", configHash: "hash" }
      ]
    });
    assert.equal(corrupt.status, "corrupt");
    assert.ok(corrupt.issues.some((issue) => issue.code === "duplicate_id"));
  });

  await runCheck("replay determinism hashes stable inputs and reports drift", async () => {
    const input = { seed: "s1", configHash: "cfg", decision: { decisionId: "d1" }, marketSnapshot: { close: 1 }, recorderFrame: { id: "f1" } };
    const first = hashReplayInput(buildReplayContext(input));
    const second = hashReplayInput(buildReplayContext(input));
    const changedSeed = hashReplayInput(buildReplayContext({ ...input, seed: "s2" }));
    const changedConfig = hashReplayInput(buildReplayContext({ ...input, configHash: "cfg2" }));
    assert.equal(first.hash, second.hash);
    assert.notEqual(first.hash, changedSeed.hash);
    assert.notEqual(first.hash, changedConfig.hash);
    assert.equal(compareReplayOutput({ expectedHash: first, actualHash: second }).deterministic, true);
    assert.ok(buildReplayContext({}).warnings.includes("missing_decision"));
  });

  await runCheck("seeded replay helpers produce deterministic sequences and safe ids", async () => {
    const left = createSeededRandom("abc");
    const right = createSeededRandom("abc");
    const other = createSeededRandom("def");
    assert.equal(left(), right());
    assert.notEqual(left(), other());
    assert.match(createDeterministicId("Replay Pack", "seed", 1), /^replay_pack_[a-f0-9]{12}$/);
  });

  await runCheck("data freshness scoring handles fresh stale degraded and unknown states", async () => {
    const now = "2026-01-01T01:00:00.000Z";
    const fresh = scoreDataFreshness({
      now,
      marketUpdatedAt: "2026-01-01T00:59:00.000Z",
      newsUpdatedAt: "2026-01-01T00:30:00.000Z",
      recorderUpdatedAt: "2026-01-01T00:58:00.000Z",
      streamUpdatedAt: "2026-01-01T00:59:30.000Z"
    });
    assert.equal(fresh.status, "fresh");
    assert.equal(scoreDataFreshness({}).status, "unknown");
    const stale = scoreDataFreshness({ now, marketUpdatedAt: "2026-01-01T00:00:00.000Z", streamUpdatedAt: "2026-01-01T00:59:30.000Z" });
    assert.equal(stale.status, "stale");
    const degraded = scoreDataFreshness({ now, marketUpdatedAt: "2026-01-01T00:00:00.000Z", recorderUpdatedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(degraded.status, "degraded");
  });

  await runCheck("dataset quality gate blocks corrupt data and separates weak usable strong datasets", async () => {
    assert.equal(evaluateDatasetQuality({ recorderAudit: { status: "corrupt" } }).status, "blocked");
    assert.equal(evaluateDatasetQuality({ recorderAudit: { status: "ok" }, freshness: { status: "degraded" }, sampleCounts: { total: 5 }, sourceCoverage: { coverageRatio: 0.5 } }).status, "weak");
    assert.equal(evaluateDatasetQuality({ recorderAudit: { status: "ok" }, freshness: { status: "fresh" }, sampleCounts: { total: 100 }, sourceCoverage: { coverageRatio: 0.8 } }).status, "strong");
    assert.equal(evaluateDatasetQuality({ recorderAudit: { status: "ok" }, freshness: { status: "fresh" }, sampleCounts: { total: 30 }, sourceCoverage: { coverageRatio: 0.7 } }).status, "usable");
  });

  await runCheck("backtest integrity detects missing hashes impossible metrics and future trades", async () => {
    const ok = validateBacktestResult({
      result: {
        tradeCount: 1,
        trades: [{
          id: "t1",
          exitAt: "2026-01-01T00:00:00.000Z",
          featureTimestamp: "2026-01-01T00:00:00.000Z",
          feeBps: 10,
          slippageBps: 2
        }],
        realizedPnl: 10
      },
      configHash: "cfg",
      dataHash: "data",
      now: "2026-01-02T00:00:00.000Z"
    });
    assert.equal(ok.status, "ok");
    const bad = validateBacktestResult({
      result: { tradeCount: 2, trades: [{ id: "t1", exitAt: "2026-02-01T00:00:00.000Z" }], realizedPnl: Infinity },
      now: "2026-01-02T00:00:00.000Z"
    });
    assert.equal(bad.status, "corrupt");
    assert.ok(bad.issues.some((issue) => issue.code === "trade_count_mismatch"));
    assert.ok(bad.issues.some((issue) => issue.code === "nan_metric"));
    assert.ok(bad.issues.some((issue) => issue.code === "future_trade_timestamp"));

    const empty = validateBacktestResult({
      result: { tradeCount: 0, trades: [] },
      configHash: "cfg",
      dataHash: "data"
    });
    assert.equal(empty.status, "ok");

    const missingCostModel = validateBacktestResult({
      result: {
        configHash: "cfg",
        dataHash: "data",
        tradeCount: 1,
        trades: [{ id: "no-cost", exitAt: "2026-01-01T00:00:00.000Z", featureTimestamp: "2026-01-01T00:00:00.000Z" }]
      },
      now: "2026-01-02T00:00:00.000Z"
    });
    assert.equal(missingCostModel.status, "warning");
    assert.ok(missingCostModel.issues.some((issue) => issue.code === "missing_fee_metrics_warning"));
    assert.ok(missingCostModel.issues.some((issue) => issue.code === "missing_slippage_metrics_warning"));
  });

  await runCheck("replay pack manifest is stable and warns on missing or duplicate samples", async () => {
    const base = { packType: "bad_veto", samples: [{ id: "s1" }], configHash: "cfg", dataHash: "data", seed: "seed", createdAt: "2026-01-01T00:00:00.000Z" };
    const first = buildReplayPackManifest(base);
    const second = buildReplayPackManifest({ ...base, createdAt: "2026-01-02T00:00:00.000Z" });
    assert.equal(first.manifestId, second.manifestId);
    const empty = buildReplayPackManifest({ samples: [] });
    assert.ok(empty.warnings.includes("missing_samples"));
    const duplicate = buildReplayPackManifest({ samples: [{ id: "s1" }, { id: "s1" }], configHash: "cfg", dataHash: "data" });
    assert.ok(duplicate.warnings.includes("duplicate_sample_ids"));
  });

  await runCheck("storage and recorder audit helpers read local source-of-truth safely", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "data-integrity-"));
    await fs.writeFile(path.join(root, "runtime.json"), "{}\n", "utf8");
    await fs.writeFile(path.join(root, "journal.json"), "{}\n", "utf8");
    const decisionDir = path.join(root, "feature-store", "decisions");
    await fs.mkdir(decisionDir, { recursive: true });
    await appendJsonLine(path.join(decisionDir, "2026-01-01.jsonl"), {
      schemaVersion: RECORDER_FRAME_SCHEMA_VERSION,
      frameType: "decision",
      at: "2026-01-01T00:00:00.000Z",
      decisionId: "d1",
      configHash: "cfg",
      recordQuality: { score: 1 }
    });
    const storage = await buildStorageAuditSummary({ runtimeDir: root });
    const recorder = await buildRecorderAuditSummary({ runtimeDir: root });
    assert.equal(storage.status, "ok");
    assert.equal(recorder.status, "ok");
    assert.equal(recorder.countsByType.decision, 1);
    const retention = await buildStorageRetentionReport({ runtimeDir: root });
    assert.equal(retention.readOnly, true);
    assert.equal(retention.autoDelete, false);
    assert.ok(retention.familySummaries.some((item) => item.family === "runtime_snapshots"));
    assert.ok(retention.familySummaries.some((item) => item.family === "recorder_frames"));
    assert.equal(retention.cleanupPlan.readOnly, true);
    assert.equal(retention.cleanupPlan.autoDelete, false);
    assert.equal(retention.archivePlan.readOnly, true);
    assert.equal(retention.archivePlan.autoDelete, false);
    assert.equal(retention.archivePlan.backupRequired, true);
    assert.equal(retention.archivePlan.backupEvidence.requiredBeforeArchive, true);
    assert.equal(retention.archivePlan.restoreTestEvidence.requiredBeforeArchive, true);
    assert.ok(retention.archivePlan.postArchiveValidation.includes("run_ops_readiness"));
    assert.equal(retention.archiveBatchManifest.manualOnly, true);
    assert.equal(retention.restorePrecheck.restoreTestTimestamp, null);
    assert.ok(retention.archiveBatchManifest.protectedFiles.includes("runtime.json"));
    assert.equal(retention.restorePrecheck.readOnly, true);
    assert.equal(retention.restorePrecheck.backupEvidenceRequired, true);
    assert.ok(retention.restorePrecheck.requiredBeforeCleanup.includes("restore_test_recent"));
  });

  await runCheck("dashboard normalizer keeps data integrity summaries optional", async () => {
    const minimal = normalizeDashboardSnapshotPayload({});
    assert.equal(minimal.storageAuditSummary.status, "unavailable");
    assert.equal(minimal.recorderIntegritySummary.status, "unavailable");
    assert.equal(minimal.dataFreshnessSummary.status, "unknown");
    assert.equal(minimal.datasetQualitySummary.status, "blocked");
    assert.equal(minimal.replayDeterminismSummary.status, "unavailable");
  });

  await runCheck("storage recorder and replay manifest CLI commands are read-only", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "data-cli-"));
    const runtimeDir = path.join(root, "runtime");
    const { StateStore } = await import("../src/storage/stateStore.js");
    const store = new StateStore(runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    runtime.latestDecisions = [{ decisionId: "d1", symbol: "BTCUSDT" }];
    await store.saveRuntime(runtime);
    const lines = [];
    const previousLog = console.log;
    console.log = (line) => lines.push(line);
    try {
      const config = { runtimeDir, projectRoot: root, configHash: "cfg" };
      const logger = { info() {}, warn() {}, error() {}, debug() {} };
      await runCli({ command: "storage:audit", args: [], config, logger, processState: { exitCode: undefined } });
      await runCli({ command: "storage:retention", args: [], config, logger, processState: { exitCode: undefined } });
      await runCli({ command: "recorder:audit", args: [], config, logger, processState: { exitCode: undefined } });
      await runCli({ command: "replay:manifest", args: ["--type", "operator_review"], config, logger, processState: { exitCode: undefined } });
    } finally {
      console.log = previousLog;
    }
    assert.equal(JSON.parse(lines[0]).readOnly, true);
    assert.equal(JSON.parse(lines[1]).autoDelete, false);
    assert.ok(["ok", "warning"].includes(JSON.parse(lines[2]).status));
    assert.equal(JSON.parse(lines[3]).packType, "operator_review");
  });
}
