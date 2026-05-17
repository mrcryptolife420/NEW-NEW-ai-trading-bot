import { buildNoTradeTimeline, summarizeNoTradeTimelines } from "../src/runtime/noTradeTimeline.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerNoTradeTimelineTests({ runCheck, assert }) {
  await runCheck("no-trade timeline separates data model execution and dashboard blockers", async () => {
    const dataTimeline = buildNoTradeTimeline({
      candidate: {
        symbol: "BTCUSDT",
        decisionId: "d1",
        rootBlocker: "quality_quorum_degraded",
        dataQuality: { status: "degraded", staleSources: ["book"] }
      },
      tradingPathHealth: { staleSources: ["book"] },
      readmodelSummary: { status: "ready", counts: { paperCandidates: 4, paperTrades: 1 } },
      dashboardFreshness: { ageMs: 5_000 }
    });
    assert.equal(dataTimeline.status, "ready");
    assert.equal(dataTimeline.finalStage, "data");
    assert.equal(dataTimeline.timeline.find((item) => item.stage === "data").status, "blocked");

    const modelTimeline = buildNoTradeTimeline({
      candidate: { symbol: "ETHUSDT", blockedReason: "model_confidence_too_low", confidence: 0.41, threshold: 0.62 }
    });
    assert.equal(modelTimeline.finalStage, "model");
    assert.equal(modelTimeline.modelConfidenceRootCause.primaryDriver, "model_probability_below_threshold");

    const executionTimeline = buildNoTradeTimeline({
      candidate: { symbol: "SOLUSDT", blockerReasons: ["execution_cost_too_high"], execution: { spreadBps: 44 } }
    });
    assert.equal(executionTimeline.finalStage, "execution");
    assert.equal(executionTimeline.nextSafeAction, "inspect_execution_costs_intents_and_cooldowns");
    const duplicateTimeline = buildNoTradeTimeline({
      candidate: { symbol: "DOGEUSDT", rootBlocker: "position_already_open" }
    });
    assert.equal(duplicateTimeline.finalStage, "execution");

    const summary = summarizeNoTradeTimelines([dataTimeline, modelTimeline, executionTimeline]);
    assert.equal(summary.count, 3);
    assert.equal(summary.byStage.data, 1);
    assert.equal(summary.byStage.model, 1);
    assert.equal(summary.byStage.execution, 1);
    assert.equal(summary.byNextSafeAction.inspect_execution_costs_intents_and_cooldowns, 1);
    const unknownTimeline = buildNoTradeTimeline({ candidate: { symbol: "XRPUSDT", rootBlocker: "unmapped_reason" } });
    assert.equal(unknownTimeline.finalStage, "insufficient_evidence");
    assert.equal(unknownTimeline.missingEvidenceReason, "no_classified_blocker_or_rejection_reason");
    assert.equal(unknownTimeline.nextSafeAction, "collect_candidate_blocker_evidence");
  });

  await runCheck("no-trade timeline marks governance and safety blockers as explicit stages", async () => {
    const governanceTimeline = buildNoTradeTimeline({
      candidate: { symbol: "BNBUSDT", rootBlocker: "committee_veto", governance: { status: "blocked" } }
    });
    assert.equal(governanceTimeline.finalStage, "governance");
    assert.equal(governanceTimeline.timeline.find((item) => item.stage === "governance").status, "blocked");
    assert.deepEqual(governanceTimeline.blockingStages, ["governance"]);
    assert.equal(governanceTimeline.nextSafeAction, "inspect_governance_veto_and_meta_gate");

    const safetyTimeline = buildNoTradeTimeline({
      candidate: { symbol: "ADAUSDT" },
      tradingPathHealth: {
        blockingReasons: ["exchange_safety_blocked"],
        exchangeSafetyStatus: "blocked"
      }
    });
    assert.equal(safetyTimeline.topBlocker, "exchange_safety_blocked");
    assert.equal(safetyTimeline.finalStage, "safety");
    assert.equal(safetyTimeline.timeline.find((item) => item.stage === "safety").status, "blocked");
    assert.equal(safetyTimeline.nextSafeAction, "inspect_exchange_safety_and_reconcile_state");

    const summary = summarizeNoTradeTimelines([governanceTimeline, safetyTimeline]);
    assert.equal(summary.byStage.governance, 1);
    assert.equal(summary.byStage.safety, 1);
    assert.equal(summary.blockingStages.governance, 1);
    assert.equal(summary.blockingStages.safety, 1);
    assert.equal(summary.byNextSafeAction.inspect_governance_veto_and_meta_gate, 1);
    assert.equal(summary.byNextSafeAction.inspect_exchange_safety_and_reconcile_state, 1);
  });

  await runCheck("dashboard normalizer exposes no-trade timeline fallback", async () => {
    const minimal = normalizeDashboardSnapshotPayload({});
    assert.equal(minimal.noTradeTimelineSummary.status, "empty");
    const normalized = normalizeDashboardSnapshotPayload({
      decisionDiagnostics: { noTradeTimelineSummary: { status: "ready", count: 2, byStage: { data: 2 } } }
    });
    assert.equal(normalized.noTradeTimelineSummary.status, "ready");
    assert.equal(normalized.noTradeTimelineSummary.byStage.data, 2);
  });
}
