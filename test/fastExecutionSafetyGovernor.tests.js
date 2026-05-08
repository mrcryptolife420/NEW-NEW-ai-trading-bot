import { evaluateFastExecutionSafety } from "../src/risk/fastExecutionSafetyGovernor.js";

export function registerFastExecutionSafetyGovernorTests({ runCheck, assert }) {
  runCheck("fast execution safety governor allows clean candidate", () => {
    const result = evaluateFastExecutionSafety({
      config: { fastExecutionMaxSignalsPerMinute: 3, fastExecutionMaxSignalsPerSymbolPerDay: 2 },
      candidate: { symbol: "BTCUSDT" },
      now: "2026-05-08T10:00:00.000Z"
    });
    assert.equal(result.allow, true);
    assert.equal(result.liveBehaviorChanged, false);
  });

  runCheck("fast execution safety governor blocks per-minute cap", () => {
    const result = evaluateFastExecutionSafety({
      config: { fastExecutionMaxSignalsPerMinute: 2 },
      candidate: { symbol: "BTCUSDT" },
      recentFastEntries: [
        { symbol: "ETHUSDT", at: "2026-05-08T09:59:30.000Z" },
        { symbol: "SOLUSDT", at: "2026-05-08T09:59:50.000Z" }
      ],
      now: "2026-05-08T10:00:00.000Z"
    });
    assert.equal(result.allow, false);
    assert.equal(result.reasonCodes.includes("fast_entry_rate_limit"), true);
  });

  runCheck("fast execution safety governor blocks per-symbol daily cap", () => {
    const result = evaluateFastExecutionSafety({
      config: { fastExecutionMaxSignalsPerMinute: 10, fastExecutionMaxSignalsPerSymbolPerDay: 2 },
      candidate: { symbol: "BTCUSDT" },
      recentFastEntries: [
        { symbol: "BTCUSDT", at: "2026-05-08T01:00:00.000Z" },
        { symbol: "BTCUSDT", at: "2026-05-08T02:00:00.000Z" }
      ],
      now: "2026-05-08T10:00:00.000Z"
    });
    assert.equal(result.allow, false);
    assert.equal(result.reasonCodes.includes("fast_symbol_daily_limit"), true);
  });

  runCheck("fast execution safety governor blocks cooldown triggers", () => {
    const result = evaluateFastExecutionSafety({
      config: { fastExecutionCooldownMs: 30000 },
      candidate: { symbol: "BTCUSDT" },
      recentFailures: [{ symbol: "BTCUSDT", at: "2026-05-08T09:59:45.000Z" }],
      slippageEvents: [{ symbol: "BTCUSDT", spike: true, at: "2026-05-08T09:59:50.000Z" }],
      staleDataEvents: [{ symbol: "BTCUSDT", at: "2026-05-08T09:59:55.000Z" }],
      ambiguousIntents: [{ symbol: "BTCUSDT", at: "2026-05-08T09:59:58.000Z" }],
      now: "2026-05-08T10:00:00.000Z"
    });
    assert.equal(result.allow, false);
    assert.equal(result.reasonCodes.includes("fast_failed_entry_cooldown"), true);
    assert.equal(result.reasonCodes.includes("fast_slippage_spike_cooldown"), true);
    assert.equal(result.reasonCodes.includes("fast_stale_data_cooldown"), true);
    assert.equal(result.reasonCodes.includes("fast_ambiguous_intent_cooldown"), true);
  });

  runCheck("fast execution safety governor stops under health exchange or request pressure", () => {
    const result = evaluateFastExecutionSafety({
      candidate: { symbol: "BTCUSDT" },
      health: { circuitOpen: true },
      exchangeSafety: { warning: true },
      requestBudget: { usedWeight1mPct: 0.95 }
    });
    assert.equal(result.allow, false);
    assert.equal(result.reasonCodes.includes("health_circuit_open"), true);
    assert.equal(result.reasonCodes.includes("exchange_safety_warning"), true);
    assert.equal(result.reasonCodes.includes("request_weight_pressure"), true);
  });
}
