import { buildLiquidityAwareStopLimitGap } from "../src/execution/stopLimitGap.js";

function assertFiniteTree(assert, value, path = "value") {
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, `${path} must be finite`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assertFiniteTree(assert, child, `${path}.${key}`);
  }
}

export async function registerStopLimitGapTests({ runCheck, assert }) {
  await runCheck("liquidity-aware stop-limit gap keeps liquid symbols near base buffer", async () => {
    const result = buildLiquidityAwareStopLimitGap({
      baseBufferPct: 0.002,
      spreadBps: 4,
      atrPct: 0.003,
      depthConfidence: 0.9,
      slippageConfidence: 0.9
    });
    assert.equal(result.bufferPct, 0.002);
    assert.equal(result.liquidityProfile, "liquid");
    assert.equal(result.reasons.includes("base_gap"), true);
    assert.equal(result.diagnosticOnly, true);
    assertFiniteTree(assert, result);
  });

  await runCheck("liquidity-aware stop-limit gap widens for illiquid thin books", async () => {
    const result = buildLiquidityAwareStopLimitGap({
      baseBufferPct: 0.002,
      spreadBps: 45,
      atrPct: 0.006,
      depthConfidence: 0.22,
      slippageConfidenceScore: { confidence: 0.25 }
    });
    assert.equal(result.bufferPct > 0.006, true);
    assert.equal(result.liquidityProfile, "illiquid_or_fragile");
    assert.equal(result.reasons.includes("wide_spread_gap"), true);
    assert.equal(result.reasons.includes("thin_orderbook_gap"), true);
    assert.equal(result.reasons.includes("low_slippage_confidence_gap"), true);
    assertFiniteTree(assert, result);
  });

  await runCheck("liquidity-aware stop-limit gap widens for high volatility", async () => {
    const result = buildLiquidityAwareStopLimitGap({
      baseBufferPct: 0.002,
      spreadBps: 8,
      atrPct: 0.04,
      depthConfidence: 0.8,
      slippageConfidence: 0.75,
      maxBufferPct: 0.012
    });
    assert.equal(result.bufferPct, 0.0112);
    assert.equal(result.reasons.includes("high_atr_gap"), true);
    assert.equal(result.bufferPct <= result.maxBufferPct, true);
    assertFiniteTree(assert, result);
  });

  await runCheck("liquidity-aware stop-limit gap is fallback-safe for missing and extreme input", async () => {
    const missing = buildLiquidityAwareStopLimitGap({});
    const extreme = buildLiquidityAwareStopLimitGap({
      baseBufferPct: Number.NaN,
      spreadBps: Number.POSITIVE_INFINITY,
      atrPct: 99,
      depthConfidence: -5,
      slippageConfidence: Number.NaN,
      maxBufferPct: 0.01
    });
    assert.equal(missing.bufferPct, 0.002);
    assert.equal(extreme.bufferPct, 0.01);
    assertFiniteTree(assert, missing);
    assertFiniteTree(assert, extreme);
  });
}
