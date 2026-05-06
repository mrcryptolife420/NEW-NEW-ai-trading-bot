import { buildDashboardEvidenceDrilldown } from "../src/runtime/dashboardEvidenceDrilldown.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";
import { normalizeFrontendPollingHealth } from "../src/runtime/tradingPathHealth.js";

export async function registerDashboardEvidenceDrilldownTests({ runCheck, assert }) {
  await runCheck("dashboard evidence drilldown handles empty runtime without crash", async () => {
    const summary = buildDashboardEvidenceDrilldown({});
    const normalized = normalizeDashboardSnapshotPayload({});

    assert.equal(summary.status, "empty");
    assert.equal(summary.count, 0);
    assert.equal(summary.liveBehaviorChanged, false);
    assert.equal(normalized.paperDecisionEvidenceDrilldown.status, "empty");
  });

  await runCheck("dashboard evidence drilldown keeps exchange safety dominant", async () => {
    const summary = buildDashboardEvidenceDrilldown({
      decisions: [{ decisionId: "d1", symbol: "BTCUSDT", approved: true, topEvidence: [{ id: "trend", score: 0.8 }] }],
      exchangeSafetySummary: {
        status: "blocked",
        entryBlocked: true,
        blockingReasons: ["exchange_truth_freeze"],
        nextAction: "run_reconcile_plan"
      }
    });

    assert.equal(summary.status, "safety_blocked");
    assert.equal(summary.items[0].state, "safety_blocked");
    assert.equal(summary.items[0].exchangeSafety.dominant, true);
    assert.ok(summary.items[0].warnings.includes("exchange_safety_dominates"));
  });

  await runCheck("dashboard evidence drilldown shows fresh paper candidate evidence chain", async () => {
    const summary = buildDashboardEvidenceDrilldown({
      decisions: [{
        decisionId: "d2",
        symbol: "ETHUSDT",
        setupType: "breakout_retest",
        approved: true,
        topEvidence: [{ id: "reclaim", score: 0.7, reason: "retest reclaimed" }],
        setupThesis: { primaryReason: "breakout retest reclaimed", invalidatesIf: ["close_below_retest_low"] },
        expectedNetEdge: { status: "positive", expectancyScore: 0.32 },
        portfolioCrowding: { crowdingRisk: "low", sizeMultiplier: 1 }
      }],
      tradingPathHealth: { status: "active" }
    });

    assert.equal(summary.status, "ready");
    assert.equal(summary.items[0].setupType, "breakout_retest");
    assert.equal(summary.items[0].setupThesis.primaryReason, "breakout retest reclaimed");
    assert.equal(summary.items[0].evidenceFor[0].id, "reclaim");
    assert.equal(summary.items[0].netEdge.status, "positive");
  });

  await runCheck("dashboard evidence drilldown separates stale dashboard from entry permission", async () => {
    const summary = buildDashboardEvidenceDrilldown({
      decisions: [{ decisionId: "d3", symbol: "SOLUSDT", approved: true }],
      tradingPathHealth: { status: "stale" }
    });

    assert.equal(summary.status, "stale");
    assert.equal(summary.items[0].warnings.includes("dashboard_or_feed_stale"), true);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("dashboard evidence drilldown normalizer keeps old snapshot fallback compatibility", async () => {
    const summary = buildDashboardEvidenceDrilldown({
      dashboardSnapshot: {
        topDecisions: [{ decisionId: "d4", symbol: "BNBUSDT", rootBlocker: "model_confidence_too_low" }]
      }
    });
    const normalized = normalizeDashboardSnapshotPayload({ paperDecisionEvidenceDrilldown: summary });

    assert.equal(summary.items[0].rootBlocker, "model_confidence_too_low");
    assert.equal(normalized.paperDecisionEvidenceDrilldown.count, 1);
    assert.equal(normalized.paperDecisionEvidenceDrilldown.diagnosticsOnly, true);
  });

  await runCheck("dashboard evidence drilldown frontend polling error clears after success", async () => {
    const now = Date.parse("2026-05-06T10:00:00.000Z");
    const failed = normalizeFrontendPollingHealth({
      now,
      lastSnapshotError: "network_error",
      lastSuccessfulSnapshotAt: "2026-05-06T09:59:00.000Z",
      expectedIntervalMs: 10_000
    });
    const recovered = normalizeFrontendPollingHealth({
      now,
      lastSnapshotError: "network_error",
      lastSuccessfulSnapshotAt: "2026-05-06T10:00:00.000Z",
      expectedIntervalMs: 10_000
    });

    assert.equal(failed.healthy, false);
    assert.equal(recovered.healthy, true);
    assert.equal(recovered.lastSnapshotError, null);
  });
}
