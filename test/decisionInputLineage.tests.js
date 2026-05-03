import {
  buildDecisionInputLineage,
  buildDecisionInputLineageSummary,
  compareDecisionInputLineage
} from "../src/runtime/decisionInputLineage.js";
import { normalizeDecisionForAudit } from "../src/runtime/decisionContract.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerDecisionInputLineageTests({ runCheck, assert }) {
  await runCheck("decision input lineage marks fresh complete inputs traceable", async () => {
    const lineage = buildDecisionInputLineage({
      decision: { decisionId: "d1", createdAt: "2026-05-03T10:00:00.000Z" },
      features: { featureSetId: "core-v1", computedAt: "2026-05-03T10:00:00.000Z" },
      configHash: "cfg-1",
      dataHash: "data-1",
      marketSnapshot: { updatedAt: "2026-05-03T10:00:00.000Z" },
      now: "2026-05-03T10:01:00.000Z"
    });
    assert.equal(lineage.status, "fresh");
    assert.equal(lineage.featureSetId, "core-v1");
    assert.equal(lineage.configHash, "cfg-1");
    assert.equal(lineage.dataHash, "data-1");
    assert.equal(lineage.liveSafetyImpact, "diagnostic_only");
    assert.match(lineage.replayInputHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(lineage.warnings, []);
  });

  await runCheck("decision input lineage flags stale source timestamps without live relief", async () => {
    const lineage = buildDecisionInputLineage({
      featureSetId: "core-v1",
      configHash: "cfg",
      dataHash: "data",
      marketSnapshotAt: "2026-05-03T09:00:00.000Z",
      featureComputedAt: "2026-05-03T09:00:00.000Z",
      now: "2026-05-03T10:00:00.000Z",
      staleAfterMs: 60_000
    });
    assert.equal(lineage.status, "stale");
    assert.ok(lineage.warnings.includes("stale_market_snapshot"));
    assert.ok(lineage.warnings.includes("stale_feature_computation"));
    assert.equal(lineage.liveSafetyImpact, "diagnostic_only");
  });

  await runCheck("decision input lineage handles missing timestamps as incomplete", async () => {
    const lineage = buildDecisionInputLineage({
      featureSetId: "core-v1",
      configHash: "cfg",
      dataHash: "data",
      now: "2026-05-03T10:00:00.000Z"
    });
    assert.equal(lineage.status, "incomplete");
    assert.ok(lineage.warnings.includes("missing_market_snapshot_timestamp"));
    assert.ok(lineage.warnings.includes("missing_feature_computed_timestamp"));
  });

  await runCheck("decision input lineage detects config and replay hash drift", async () => {
    const expected = buildDecisionInputLineage({
      featureSetId: "core-v1",
      configHash: "cfg-a",
      dataHash: "data",
      marketSnapshotAt: "2026-05-03T10:00:00.000Z",
      featureComputedAt: "2026-05-03T10:00:00.000Z",
      now: "2026-05-03T10:01:00.000Z"
    });
    const actual = buildDecisionInputLineage({
      featureSetId: "core-v1",
      configHash: "cfg-b",
      dataHash: "data",
      marketSnapshotAt: "2026-05-03T10:00:00.000Z",
      featureComputedAt: "2026-05-03T10:00:00.000Z",
      now: "2026-05-03T10:01:00.000Z"
    });
    const comparison = compareDecisionInputLineage({ expected, actual });
    assert.equal(comparison.matched, false);
    assert.ok(comparison.differences.includes("config_hash_changed"));
    assert.ok(comparison.differences.includes("replay_input_hash_changed"));
  });

  await runCheck("decision contract and dashboard expose lineage fallbacks", async () => {
    const decision = normalizeDecisionForAudit({
      decisionId: "d1",
      symbol: "BTCUSDT",
      configHash: "cfg",
      featureSetId: "core-v1",
      dataHash: "data",
      marketSnapshotAt: "2026-05-03T10:00:00.000Z",
      featureComputedAt: "2026-05-03T10:00:00.000Z",
      now: "2026-05-03T10:01:00.000Z"
    });
    assert.equal(decision.inputLineage.status, "fresh");

    const summary = buildDecisionInputLineageSummary([decision.inputLineage, { status: "stale", warnings: ["stale_market_snapshot"] }]);
    assert.equal(summary.status, "stale");
    assert.equal(summary.total, 2);
    assert.equal(summary.counts.fresh, 1);
    assert.ok(summary.warnings.includes("stale_market_snapshot"));

    const normalized = normalizeDashboardSnapshotPayload({});
    assert.equal(normalized.decisionInputLineageSummary.status, "unavailable");
    assert.equal(normalized.decisionInputLineageSummary.total, 0);
  });
}
