import { executeDecisionPipeline } from "../src/runtime/decisionPipeline.js";

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
    const executionAudit = auditLog.events.find((item) => item.kind === "execution_result");
    assert.deepEqual(executionAudit.reasonCodes, ["max_total_exposure"]);
  });
}
