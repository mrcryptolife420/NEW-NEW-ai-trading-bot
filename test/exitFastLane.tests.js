import {
  buildExitFastLanePlan,
  summarizeExitFastLaneLatency
} from "../src/runtime/exitFastLane.js";

export function registerExitFastLaneTests({ runCheck, assert }) {
  runCheck("exit fast lane prioritizes open positions with missing protection", () => {
    const plan = buildExitFastLanePlan({
      now: "2026-05-08T10:00:00.000Z",
      openPositions: [
        { id: "p1", symbol: "BTCUSDT", exitRiskScore: 0.5 },
        { id: "p2", symbol: "ETHUSDT", exitRiskScore: 0.2 }
      ],
      streamEvents: [
        { symbol: "BTCUSDT", updatedAt: "2026-05-08T09:59:59.000Z", exitRiskScore: 0.8 },
        { symbol: "ETHUSDT", updatedAt: "2026-05-08T09:59:59.000Z" }
      ],
      protectionStates: [
        { symbol: "BTCUSDT", protected: true, updatedAt: "2026-05-08T09:59:59.000Z" },
        { symbol: "ETHUSDT", protected: false, updatedAt: "2026-05-08T09:59:59.000Z" }
      ]
    });
    assert.equal(plan.status, "active");
    assert.equal(plan.positions[0].symbol, "ETHUSDT");
    assert.equal(plan.positions[0].runProtectionCheck, true);
    assert.equal(plan.nextSymbols.includes("ETHUSDT"), true);
  });

  runCheck("exit fast lane runs exit checks only on fresh high-risk stream events", () => {
    const plan = buildExitFastLanePlan({
      now: "2026-05-08T10:00:00.000Z",
      openPositions: [{ symbol: "SOLUSDT", exitRiskScore: 0.1 }],
      streamEvents: [{ symbol: "SOLUSDT", updatedAt: "2026-05-08T09:59:59.500Z", exitRiskScore: 0.75 }],
      protectionStates: [{ symbol: "SOLUSDT", protected: true, updatedAt: "2026-05-08T09:59:59.500Z" }]
    });
    assert.equal(plan.positions[0].runExitCheck, true);
    assert.equal(plan.positions[0].reasons.includes("high_exit_risk"), true);
  });

  runCheck("exit fast lane keeps stale streams observable without unsafe action", () => {
    const plan = buildExitFastLanePlan({
      now: "2026-05-08T10:00:00.000Z",
      openPositions: [{ symbol: "XRPUSDT", exitRiskScore: 0.9 }],
      streamEvents: [{ symbol: "XRPUSDT", updatedAt: "2026-05-08T09:59:50.000Z", exitRiskScore: 0.9 }],
      protectionStates: [{ symbol: "XRPUSDT", protected: true, updatedAt: "2026-05-08T09:59:59.000Z" }]
    });
    assert.equal(plan.positions[0].runExitCheck, false);
    assert.equal(plan.positions[0].reasons.includes("exit_stream_stale"), true);
    assert.equal(plan.liveBehaviorChanged, false);
  });

  runCheck("exit fast lane latency summary is finite and fallback-safe", () => {
    const summary = summarizeExitFastLaneLatency({
      decisions: [
        {
          symbol: "BTCUSDT",
          signalAt: "2026-05-08T10:00:00.000Z",
          checkedAt: "2026-05-08T10:00:01.250Z",
          protectionCheckedAt: "2026-05-08T10:00:01.500Z"
        },
        { symbol: "ETHUSDT" }
      ],
      now: "2026-05-08T10:00:02.000Z"
    });
    assert.equal(summary.status, "measured");
    assert.equal(summary.maxExitDelayMs, 1250);
    assert.equal(summary.maxProtectionLatencyMs, 1500);
  });
}
