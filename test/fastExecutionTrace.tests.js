import {
  buildFastExecutionTrace,
  buildOperatorActionAudit
} from "../src/runtime/fastExecutionTrace.js";

export function registerFastExecutionTraceTests({ runCheck, assert }) {
  runCheck("fast execution trace stores preflight feature age latency and exit delay", () => {
    const trace = buildFastExecutionTrace({
      now: "2026-05-08T10:00:00.000Z",
      candidate: {
        id: "btc-1",
        symbol: "BTCUSDT",
        candidateFreshness: { dataFreshnessStatus: "fresh", marketDataAgeMs: 200, featureAgeMs: 900, expired: false }
      },
      trigger: { status: "queued", reasonCodes: [] },
      preflight: { allow: true, latencyMs: 44, reasonCodes: [] },
      featureCache: { groups: { fast: { ageMs: 200 }, medium: { ageMs: 900 } } },
      latency: { streamToSignalMs: 120, signalToRiskMs: 44, riskToIntentMs: 22, biggestBottleneck: "stream_to_signal" },
      exitFastLane: { exitDecisionDelayMs: 250 }
    });
    assert.equal(trace.preflight.under100ms, true);
    assert.equal(trace.featureAge.fast.ageMs, 200);
    assert.equal(trace.latency.biggestBottleneck, "stream_to_signal");
    assert.equal(trace.exitDecisionDelayMs, 250);
    assert.equal(trace.liveBehaviorChanged, false);
  });

  runCheck("fast execution trace audits expired candidates", () => {
    const trace = buildFastExecutionTrace({
      candidate: { symbol: "ETHUSDT", expired: true },
      trigger: { status: "blocked", reasonCodes: ["candidate_expired"] },
      preflight: { allow: false, latencyMs: 120, reasonCodes: ["market_data_stale"] }
    });
    assert.equal(trace.candidateExpired, true);
    assert.equal(trace.auditEvent.type, "fast_candidate_expired");
    assert.equal(trace.preflight.under100ms, false);
  });

  runCheck("operator action audit returns audit id without changing live behavior", () => {
    const audit = buildOperatorActionAudit({
      action: "pause_new_entries",
      target: "global",
      result: { status: "recorded", confirmationRequired: true, safetyImpact: "stricter" },
      now: "2026-05-08T10:00:00.000Z"
    });
    assert.match(audit.auditId, /^operator-action-pause_new_entries-/);
    assert.equal(audit.confirmationRequired, true);
    assert.equal(audit.liveBehaviorChanged, false);
  });
}
