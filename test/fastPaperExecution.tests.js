import {
  buildFastPaperExecutionIntent,
  evaluateLiveFastApprovalGate
} from "../src/runtime/fastPaperExecution.js";

export function registerFastPaperExecutionTests({ runCheck, assert }) {
  runCheck("fast paper execution builds paper-only intent from queued trigger", () => {
    const result = buildFastPaperExecutionIntent({
      config: { botMode: "paper", fastExecutionPaperOnly: true },
      triggerResult: {
        status: "queued",
        symbol: "BTCUSDT",
        candidate: { id: "btc-1" },
        queueItem: { requiredChecks: ["fresh_market_data", "risk_verdict"] }
      },
      normalCycle: { allSymbolsCovered: true },
      now: "2026-05-08T10:00:00.000Z"
    });
    assert.equal(result.status, "paper_intent_ready");
    assert.equal(result.intent.type, "paper_fast_entry_intent");
    assert.equal(result.intent.paperOnly, true);
    assert.equal(result.normalCyclePreserved, true);
    assert.equal(result.liveBehaviorChanged, false);
  });

  runCheck("fast paper execution blocks live and missing normal-cycle coverage", () => {
    const result = buildFastPaperExecutionIntent({
      config: { botMode: "live", fastExecutionPaperOnly: true },
      triggerResult: { status: "queued", symbol: "ETHUSDT" },
      normalCycle: { allSymbolsCovered: false }
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reasonCodes.includes("paper_execution_only"), true);
    assert.equal(result.reasonCodes.includes("normal_cycle_coverage_missing"), true);
  });

  runCheck("live fast approval gate blocks without explicit approval and canary", () => {
    const gate = evaluateLiveFastApprovalGate({
      config: { botMode: "live", liveFastObserveOnly: false, fastExecutionPaperOnly: false },
      operatorApproval: { explicitApproval: false },
      canary: { status: "missing" },
      rollback: { status: "normal" },
      safety: { exchangeSafetyOk: true, liveReadinessOk: true }
    });
    assert.equal(gate.allowLiveFastExecution, false);
    assert.equal(gate.reasonCodes.includes("missing_operator_approval"), true);
    assert.equal(gate.reasonCodes.includes("missing_canary_approval"), true);
  });

  runCheck("live fast approval gate shuts down on rollback or safety pressure", () => {
    const gate = evaluateLiveFastApprovalGate({
      config: { botMode: "live", liveFastObserveOnly: false, fastExecutionPaperOnly: false },
      operatorApproval: { explicitApproval: true },
      canary: { status: "approved" },
      rollback: { status: "rollback_recommended" },
      safety: { exchangeSafetyOk: false, liveReadinessOk: false }
    });
    assert.equal(gate.allowLiveFastExecution, false);
    assert.equal(gate.rollbackSafetyShutdown, true);
    assert.equal(gate.reasonCodes.includes("rollback_recommended"), true);
    assert.equal(gate.reasonCodes.includes("live_safety_not_ready"), true);
  });
}
