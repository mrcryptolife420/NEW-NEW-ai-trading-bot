import { buildVetoReplayCoverage } from "../src/runtime/vetoReplayCoverage.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerVetoReplayCoverageTests({ runCheck, assert }) {
  await runCheck("veto replay coverage prioritizes bad veto for replay", async () => {
    const summary = buildVetoReplayCoverage({
      decisions: [{
        decisionId: "d1",
        symbol: "BTCUSDT",
        rootBlocker: "model_confidence_too_low",
        reasons: ["model_confidence_too_low"],
        referencePrice: 100
      }],
      futureMarketPathsByDecisionId: {
        d1: {
          maxFavorableMovePct: 0.03,
          maxAdverseMovePct: -0.003,
          closeReturnPct: 0.015,
          horizonMinutes: 60
        }
      }
    });

    assert.equal(summary.status, "ready");
    assert.equal(summary.vetoOutcomeSummary.counts.bad_veto, 1);
    assert.equal(summary.replayPackQueue[0].packType, "bad_veto");
    assert.equal(summary.hardSafetyRelaxationAllowed, false);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("veto replay coverage reports replay traces when present", async () => {
    const summary = buildVetoReplayCoverage({
      outcomeRecords: [{ observationId: "o1", label: "good_veto", confidence: 0.8 }],
      replayTraces: [{
        id: "r1",
        symbol: "ETHUSDT",
        status: "ready",
        json: JSON.stringify({ packType: "reconcile_uncertainty", decisionId: "d2" })
      }]
    });

    assert.equal(summary.replayTraceCount, 1);
    assert.equal(summary.coverageStatus, "covered");
    assert.equal(summary.replayTraceSummary.byStatus.ready, 1);
    assert.equal(summary.replayPackQueue[0].packType, "reconcile_uncertainty");
  });

  await runCheck("veto replay coverage marks unknown outcomes when future path is missing", async () => {
    const summary = buildVetoReplayCoverage({
      decisions: [{ decisionId: "d3", symbol: "SOLUSDT", rootBlocker: "quality_quorum_degraded", referencePrice: 100 }]
    });

    assert.equal(summary.vetoOutcomeSummary.counts.unknown_veto, 1);
    assert.ok(summary.warnings.includes("unknown_veto_outcomes_require_future_path"));
    assert.ok(summary.warnings.includes("replay_traces_missing"));
  });

  await runCheck("veto replay coverage dashboard fallback is safe", async () => {
    const summary = buildVetoReplayCoverage({
      outcomeRecords: [{ observationId: "o2", label: "bad_veto", confidence: 0.82 }]
    });
    const normalized = normalizeDashboardSnapshotPayload({
      learningAnalytics: { vetoReplayCoverageSummary: summary }
    });
    const fallback = normalizeDashboardSnapshotPayload({});

    assert.equal(normalized.vetoReplayCoverageSummary.outcomeCount, 1);
    assert.equal(fallback.vetoReplayCoverageSummary.coverageStatus, "missing");
    assert.equal(fallback.vetoReplayCoverageSummary.liveBehaviorChanged, false);
  });
}
