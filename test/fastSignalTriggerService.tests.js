import { evaluateFastSignalTrigger } from "../src/runtime/fastSignalTriggerService.js";
import { runFastPreflightRisk } from "../src/risk/fastPreflightRisk.js";

export function registerFastSignalTriggerServiceTests({ runCheck, assert }) {
  runCheck("fast signal trigger queues fresh paper threshold cross", () => {
    const result = evaluateFastSignalTrigger({
      config: {
        botMode: "paper",
        fastExecutionEnabled: true,
        fastExecutionPaperOnly: true,
        fastExecutionCandidateTtlMs: 5000,
        fastExecutionMinDataFreshnessMs: 1500,
        fastExecutionLatencyBudgetMs: 250,
        maxOpenPositions: 5,
        maxTotalExposureFraction: 1,
        maxSpreadBps: 10,
        fastExecutionMaxSignalsPerMinute: 3,
        fastExecutionMaxSignalsPerSymbolPerDay: 2
      },
      previousWatchItem: { symbol: "BTCUSDT", probability: 0.69, threshold: 0.7 },
      candidate: {
        id: "btc-fast",
        symbol: "BTCUSDT",
        probability: 0.71,
        threshold: 0.7,
        marketUpdatedAt: "2026-05-08T09:59:59.500Z",
        featuresHash: "features-fast",
        currentExposureFraction: 0.1,
        proposedExposureFraction: 0.05,
        spreadBps: 4
      },
      riskVerdict: { allow: true },
      now: "2026-05-08T10:00:00.000Z"
    });
    assert.equal(result.status, "queued");
    assert.equal(result.queue.length, 1);
    assert.equal(result.queueItem.source, "near_threshold_cross");
    assert.equal(result.queueItem.latencyBudgetMs, 250);
    assert.equal(result.queueItem.traceContext.featuresHash, "features-fast");
    assert.equal(result.queueItem.traceContext.dataFreshnessStatus, "fresh");
    assert.equal(result.auditEvent.type, "fast_signal_trigger");
    assert.equal(result.liveBehaviorChanged, false);
  });

  runCheck("fast signal trigger blocks live paper-only path", () => {
    const result = evaluateFastSignalTrigger({
      config: { botMode: "live", fastExecutionEnabled: true, fastExecutionPaperOnly: true },
      previousWatchItem: { symbol: "BTCUSDT", probability: 0.69, threshold: 0.7 },
      candidate: { symbol: "BTCUSDT", probability: 0.72, threshold: 0.7 }
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reasonCodes.includes("fast_execution_paper_only"), true);
  });

  runCheck("fast signal trigger blocks stale candidate before queue", () => {
    const result = evaluateFastSignalTrigger({
      config: { botMode: "paper", fastExecutionEnabled: true, fastExecutionCandidateTtlMs: 5000, fastExecutionMinDataFreshnessMs: 1500 },
      previousWatchItem: { symbol: "ETHUSDT", probability: 0.69, threshold: 0.7 },
      candidate: {
        symbol: "ETHUSDT",
        probability: 0.72,
        threshold: 0.7,
        marketUpdatedAt: "2026-05-08T09:59:50.000Z"
      },
      now: "2026-05-08T10:00:00.000Z"
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reasonCodes.includes("market_data_stale"), true);
  });

  runCheck("fast preflight blocks max exposure and live guardrail failures", () => {
    const result = runFastPreflightRisk({
      config: { maxOpenPositions: 5, maxTotalExposureFraction: 0.25, maxSpreadBps: 10 },
      candidate: {
        symbol: "SOLUSDT",
        currentExposureFraction: 0.22,
        proposedExposureFraction: 0.05,
        spreadBps: 2,
        liveGuardrailFail: true
      },
      riskVerdict: { allow: true },
      marketSnapshot: { marketDataAgeMs: 100 }
    });
    assert.equal(result.allow, false);
    assert.equal(result.reasonCodes.includes("max_exposure_exceeded"), true);
    assert.equal(result.reasonCodes.includes("live_guardrail_fail"), true);
  });
}
