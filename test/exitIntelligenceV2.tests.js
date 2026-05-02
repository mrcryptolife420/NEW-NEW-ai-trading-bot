import { buildExitIntelligenceV2 } from "../src/risk/exitIntelligenceV2.js";

function makePosition(overrides = {}) {
  return {
    id: "pos-1",
    symbol: "BTCUSDT",
    entryAt: "2026-01-01T00:00:00.000Z",
    entryPrice: 100,
    quantity: 1,
    highestPrice: 100,
    lowestPrice: 100,
    stopLossPrice: 98,
    takeProfitPrice: 106,
    trailingStopPct: 0.012,
    maxHoldMinutes: 360,
    ...overrides
  };
}

function makeSnapshot(overrides = {}) {
  return {
    book: {
      mid: 100,
      spreadBps: 6,
      bookPressure: 0.2,
      weightedDepthImbalance: 0.2,
      depthConfidence: 0.8,
      ...(overrides.book || {})
    },
    market: {
      vwap: 99.5,
      structureLow: 98.5,
      structureHigh: 106,
      atrPct: 0.012,
      bullishPatternScore: 0.45,
      bearishPatternScore: 0.05,
      cvdTrendAlignment: 0.35,
      orderflowToxicityScore: 0.12,
      ...(overrides.market || {})
    }
  };
}

export async function registerExitIntelligenceV2Tests({ runCheck, assert, RiskManager, makeConfig }) {
  await runCheck("exit intelligence v2 trails early trend winners instead of forcing full exit", async () => {
    const summary = buildExitIntelligenceV2({
      position: makePosition({
        highestPrice: 105,
        stopLossPrice: 99,
        marketConditionAtEntry: "trend_up"
      }),
      currentPrice: 104,
      marketSnapshot: makeSnapshot({
        book: { mid: 104, bookPressure: 0.38, weightedDepthImbalance: 0.3 },
        market: {
          vwap: 102,
          structureLow: 101.2,
          structureHigh: 109,
          cvdTrendAlignment: 0.44,
          orderflowToxicityScore: 0.08,
          bearishPatternScore: 0.02
        }
      }),
      exitIntelligenceSummary: { continuationQuality: 0.74, tightenScore: 0.58 },
      config: makeConfig({ maxHoldMinutes: 360 }),
      nowIso: "2026-01-01T00:42:00.000Z"
    });

    assert.equal(summary.currentExitRecommendation, "trail");
    assert.equal(summary.fullExitScore < 0.72, true);
    assert.equal(summary.trailingProtectionScore >= 0.5, true);
    assert.equal(summary.suggestedStops.tightenedStopPrice > 99, true);
  });

  await runCheck("exit intelligence v2 exits failed breakouts with structure and VWAP loss", async () => {
    const summary = buildExitIntelligenceV2({
      position: makePosition({
        entryAt: "2026-01-01T00:00:00.000Z",
        highestPrice: 103,
        lowestPrice: 96.8,
        marketConditionAtEntry: "failed_breakout"
      }),
      currentPrice: 96.8,
      marketSnapshot: makeSnapshot({
        book: { mid: 96.8, bookPressure: -0.72, weightedDepthImbalance: -0.66, depthConfidence: 0.35 },
        market: {
          vwap: 100.2,
          structureLow: 99.1,
          structureHigh: 104,
          bearishBosActive: 1,
          bearishPatternScore: 0.72,
          cvdTrendAlignment: -0.7,
          orderflowDivergenceScore: -0.62,
          orderflowToxicityScore: 0.82,
          failedBreakoutScore: 0.8
        }
      }),
      marketStructureSummary: { signalScore: -0.35, riskScore: 0.86 },
      config: makeConfig({ maxHoldMinutes: 360 }),
      nowIso: "2026-01-01T00:35:00.000Z"
    });

    assert.equal(summary.currentExitRecommendation, "exit");
    assert.equal(summary.structureInvalidationScore >= 0.78, true);
    assert.equal(summary.vwapLossScore >= 0.55, true);
    assert.equal(summary.explanation.whyExit.includes("structure_or_breakout_context_is_invalidating"), true);
  });

  await runCheck("exit intelligence v2 flags stale positions for time-decay trim or exit review", async () => {
    const summary = buildExitIntelligenceV2({
      position: makePosition({
        entryAt: "2026-01-01T00:00:00.000Z",
        highestPrice: 101,
        stopLossPrice: 98.8,
        maxHoldMinutes: 90
      }),
      currentPrice: 100.1,
      marketSnapshot: makeSnapshot({ book: { mid: 100.1 }, market: { vwap: 100, structureLow: 99.2 } }),
      config: makeConfig({ maxHoldMinutes: 90 }),
      nowIso: "2026-01-01T02:00:00.000Z"
    });

    assert.equal(summary.timeDecayScore >= 0.72, true);
    assert.equal(["trim", "exit"].includes(summary.currentExitRecommendation), true);
    assert.equal(summary.explanation.whyTrim.includes("position_age_is_reducing_expected_edge"), true);
  });

  await runCheck("exit intelligence v2 reacts to orderbook and CVD reversal", async () => {
    const summary = buildExitIntelligenceV2({
      position: makePosition({ highestPrice: 102, stopLossPrice: 98.5 }),
      currentPrice: 100.4,
      marketSnapshot: makeSnapshot({
        book: { mid: 100.4, bookPressure: -0.86, weightedDepthImbalance: -0.74, depthConfidence: 0.28 },
        market: {
          vwap: 100,
          structureLow: 98.8,
          cvdTrendAlignment: -0.82,
          cvdDivergenceScore: -0.75,
          orderflowToxicityScore: 0.88,
          bearishPatternScore: 0.68
        }
      }),
      config: makeConfig(),
      nowIso: "2026-01-01T00:45:00.000Z"
    });

    assert.equal(summary.orderflowReversalScore >= 0.65, true);
    assert.equal(["trim", "exit"].includes(summary.currentExitRecommendation), true);
  });

  await runCheck("risk manager consumes exit intelligence v2 as conservative exit signal", async () => {
    const risk = new RiskManager(makeConfig({
      enableExitIntelligence: true,
      exitIntelligenceExitScore: 0.72,
      exitIntelligenceTrimScore: 0.6,
      maxHoldMinutes: 360
    }));
    const decision = risk.evaluateExit({
      position: makePosition({
        entryAt: "2026-01-01T00:00:00.000Z",
        highestPrice: 103,
        stopLossPrice: 94,
        takeProfitPrice: 115,
        marketConditionAtEntry: "failed_breakout"
      }),
      currentPrice: 96.5,
      marketSnapshot: makeSnapshot({
        book: { mid: 96.5, bookPressure: -0.74, weightedDepthImbalance: -0.7, depthConfidence: 0.3 },
        market: {
          vwap: 100.1,
          structureLow: 99.2,
          bearishBosActive: 1,
          bearishPatternScore: 0.76,
          cvdTrendAlignment: -0.78,
          orderflowToxicityScore: 0.84,
          failedBreakoutScore: 0.82
        }
      }),
      marketStructureSummary: { signalScore: -0.34, riskScore: 0.9 },
      newsSummary: {},
      announcementSummary: {},
      calendarSummary: {},
      exitIntelligenceSummary: { continuationQuality: 0.1 },
      nowIso: "2026-01-01T00:30:00.000Z"
    });

    assert.equal(decision.shouldExit, true);
    assert.equal(decision.reason.startsWith("exit_v2_"), true);
    assert.equal(decision.exitIntelligenceV2.currentExitRecommendation, "exit");
    assert.equal(decision.exitContext.exitV2.structureInvalidationScore >= 0.78, true);
  });
}
