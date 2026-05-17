import { executeDecisionPipeline } from "../src/runtime/decisionPipeline.js";
import { buildDecisionFunnelEvidence } from "../src/runtime/decisionFunnel.js";

function createAuditLogRecorder() {
  const events = [];
  return {
    events,
    async record(kind, payload) {
      events.push({ kind, ...payload });
    }
  };
}

export async function registerDecisionPipelineTests({ runCheck, assert }) {
  await runCheck("decision pipeline records signal risk intent and execution for allowed entries", async () => {
    const auditLog = createAuditLogRecorder();
    const bot = {
      config: { botMode: "paper" },
      auditLog,
      async openBestCandidate(candidates) {
        return {
          status: "executed",
          selectedSymbol: candidates[0].symbol,
          attemptedSymbols: [candidates[0].symbol],
          allowedCandidates: 1,
          skippedCandidates: 0,
          blockedReasons: [],
          entryErrors: [],
          openedPosition: { id: "paper-1", symbol: candidates[0].symbol }
        };
      }
    };
    const candidates = [{
      symbol: "BTCUSDT",
      score: { probability: 0.74 },
      decision: {
        allow: true,
        threshold: 0.55,
        opportunityScore: 0.81,
        quoteAmount: 150,
        riskVerdict: { allowed: true, rejections: [] }
      }
    }];
    const result = await executeDecisionPipeline(bot, {
      cycleAt: "2026-04-21T10:00:00.000Z",
      balance: 1000,
      candidates
    });
    assert.equal(result.signalDecision.symbol, "BTCUSDT");
    assert.equal(result.executionResult.status, "executed");
    assert.equal(result.decisionFunnel.status, "executed");
    assert.equal(result.decisionFunnel.highestReachedStage, "broker_attempt");
    assert.equal(result.signalDecision.decisionId, "2026-04-21T10:00:00.000Z:BTCUSDT");
    assert.equal(result.signalDecision.stage, "execution_plan");
    assert.equal(auditLog.events.length, 4);
    assert.deepEqual(auditLog.events.map((item) => item.kind), [
      "signal_decision",
      "risk_decision",
      "trade_intent",
      "execution_result"
    ]);
  });

  await runCheck("decision pipeline preserves canonical rejection reasons when execution is blocked", async () => {
    const auditLog = createAuditLogRecorder();
    const bot = {
      config: { botMode: "paper" },
      auditLog,
      async openBestCandidate(candidates) {
        return {
          status: "risk_blocked",
          selectedSymbol: candidates[0].symbol,
          attemptedSymbols: [candidates[0].symbol],
          allowedCandidates: 0,
          skippedCandidates: 1,
          blockedReasons: ["max_total_exposure"],
          entryErrors: []
        };
      }
    };
    const candidates = [{
      symbol: "ETHUSDT",
      score: { probability: 0.61 },
      decision: {
        allow: false,
        threshold: 0.58,
        riskVerdict: {
          allowed: false,
          rejections: [{ code: "max_total_exposure" }]
        },
        reasons: ["max_total_exposure"]
      }
    }];
    const result = await executeDecisionPipeline(bot, {
      cycleAt: "2026-04-21T11:00:00.000Z",
      balance: 1000,
      candidates
    });
    assert.equal(result.executionResult.status, "risk_blocked");
    assert.equal(result.riskVerdict.rejections[0].code, "max_total_exposure");
    assert.equal(result.decisionFunnel.status, "blocked");
    assert.equal(result.decisionFunnel.firstBlockedStage, "risk_gate");
    assert.equal(result.decisionFunnel.primaryReason, "max_total_exposure");
    assert.equal(result.decisionFunnel.nextSafeAction, "inspect_risk_veto_and_sizing");
    const executionAudit = auditLog.events.find((item) => item.kind === "execution_result");
    assert.deepEqual(executionAudit.reasonCodes, ["max_total_exposure"]);
  });

  await runCheck("decision funnel reports no candidates as market-data blocked evidence", async () => {
    const funnel = buildDecisionFunnelEvidence({
      cycleId: "cycle-empty",
      mode: "paper",
      candidates: [],
      entryAttempt: { status: "idle", blockedReasons: [] }
    });
    assert.equal(funnel.status, "blocked");
    assert.equal(funnel.firstBlockedStage, "market_data");
    assert.equal(funnel.primaryReason, "no_candidates_created");
    assert.equal(funnel.stages[0].stage, "market_data");
    assert.equal(funnel.stages[0].status, "blocked");
  });
}
