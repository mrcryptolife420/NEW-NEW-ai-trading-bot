import { simulateMicrostructureFill } from "../src/execution/microstructureFillSimulator.js";

function finiteResult(result) {
  return ["fillProbability", "expectedSlippageBps", "partialFillRatio", "timeoutRisk", "queueRisk", "liquidityScore"]
    .every((key) => Number.isFinite(result[key]));
}

export async function registerMicrostructureFillSimulatorTests({ runCheck, assert }) {
  await runCheck("microstructure fill simulator handles tight spread", async () => {
    const result = simulateMicrostructureFill({
      orderType: "limit_maker",
      notional: 100,
      spreadBps: 3,
      bookDepthUsd: 5000,
      candleVolumeUsd: 25000,
      volatilityPct: 0.008,
      latencyMs: 120
    });
    assert.equal(finiteResult(result), true);
    assert.ok(result.fillProbability > 0.7);
    assert.ok(result.expectedSlippageBps < 4);
    assert.equal(result.liveBehaviorChanged, false);
  });

  await runCheck("microstructure fill simulator penalizes wide spread", async () => {
    const result = simulateMicrostructureFill({
      orderType: "market",
      notional: 500,
      spreadBps: 65,
      bookDepthUsd: 3000,
      candleVolumeUsd: 20000,
      volatilityPct: 0.012,
      latencyMs: 200
    });
    assert.ok(result.expectedSlippageBps > 25);
    assert.ok(result.warnings.includes("wide_spread"));
  });

  await runCheck("microstructure fill simulator detects thin book partial fills", async () => {
    const result = simulateMicrostructureFill({
      orderType: "limit_ioc",
      notional: 5000,
      spreadBps: 18,
      bookDepthUsd: 700,
      candleVolumeUsd: 3000,
      volatilityPct: 0.015,
      latencyMs: 180
    });
    assert.ok(result.partialFillRatio < 0.75);
    assert.ok(result.warnings.includes("thin_liquidity"));
    assert.ok(result.warnings.includes("partial_fill_likely"));
  });

  await runCheck("microstructure fill simulator raises high volatility risk", async () => {
    const result = simulateMicrostructureFill({
      orderType: "market",
      notional: 400,
      spreadBps: 12,
      bookDepthUsd: 5000,
      candleVolumeUsd: 10000,
      volatilityPct: 0.07,
      latencyMs: 500
    });
    assert.ok(result.expectedSlippageBps > 12);
    assert.ok(result.warnings.includes("high_volatility"));
  });

  await runCheck("microstructure fill simulator detects maker timeout risk", async () => {
    const result = simulateMicrostructureFill({
      orderType: "maker_limit",
      notional: 1000,
      spreadBps: 40,
      bookDepthUsd: 1200,
      candleVolumeUsd: 3500,
      volatilityPct: 0.04,
      latencyMs: 2200,
      makerQueuePosition: 0.95
    });
    assert.ok(result.timeoutRisk >= 0.55);
    assert.ok(result.warnings.includes("timeout_risk_high"));
  });

  await runCheck("microstructure fill simulator is fallback-safe for missing input", async () => {
    const result = simulateMicrostructureFill({});
    assert.equal(finiteResult(result), true);
    assert.ok(result.warnings.includes("missing_order_size"));
    assert.ok(result.warnings.includes("missing_book_depth"));
    assert.ok(result.warnings.includes("missing_candle_volume"));
  });
}
