import {
  anchoredVwap,
  atrPercentile,
  bollingerKeltnerSqueeze,
  emaSlopeStack,
  obvDivergence,
  orderBookImbalanceStability,
  relativeVolume,
  spreadPercentile,
  vwapZScore
} from "../src/strategy/advancedIndicators.js";
import { scoreIndicatorRegimeFit } from "../src/strategy/indicatorRegimeScoring.js";
import { buildSetupThesis } from "../src/strategy/setupThesis.js";
import { buildExitPlanHint } from "../src/strategy/exitPlanHints.js";
import { buildPortfolioCrowdingSummary } from "../src/risk/portfolioCrowding.js";
import { applyPostReconcileEntryLimits } from "../src/risk/postReconcileEntryLimits.js";
import { buildBacktestQualityMetrics } from "../src/backtest/backtestMetrics.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function candles(count = 120, { trend = 0.1, volume = 100 } = {}) {
  let price = 100;
  return Array.from({ length: count }, (_, index) => {
    const open = price;
    price = Math.max(1, price + trend + Math.sin(index / 5) * 0.25);
    const close = price;
    return {
      open,
      high: Math.max(open, close) + 0.6,
      low: Math.min(open, close) - 0.6,
      close,
      volume: volume + (index % 10) * 8
    };
  });
}

function assertFiniteTree(assert, value, path = "value") {
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, `${path} must be finite`);
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assertFiniteTree(assert, child, `${path}.${key}`);
  }
}

export async function registerTradingQualityUpgradeTests({ runCheck, assert }) {
  await runCheck("advanced indicators are fallback-safe for empty short normal and extreme input", async () => {
    const normal = candles();
    const extreme = candles(80, { trend: 8, volume: 1_000_000 });
    const outputs = [
      anchoredVwap([], 0),
      anchoredVwap(normal, 10),
      emaSlopeStack([], [8, 21, 55]),
      emaSlopeStack(normal.map((candle) => candle.close)),
      relativeVolume(normal, 20),
      relativeVolume(extreme, 20),
      bollingerKeltnerSqueeze(normal),
      atrPercentile(normal, 14, 100),
      vwapZScore(normal, 50),
      obvDivergence(normal, 20),
      spreadPercentile(12, [3, 4, 5, 8, 10, 12, 15, 18, 21, 25]),
      orderBookImbalanceStability([
        { bidDepth: 100, askDepth: 80 },
        { bidDepth: 105, askDepth: 82 },
        { bidDepth: 98, askDepth: 76 },
        { bidDepth: 101, askDepth: 78 },
        { bidDepth: 103, askDepth: 79 }
      ])
    ];
    for (const output of outputs) {
      assertFiniteTree(assert, output);
    }
    assert.equal(outputs[1].status, "ready");
    assert.equal(outputs[11].status, "ready");
  });

  await runCheck("regime scoring distinguishes trend range breakout and high volatility risks", async () => {
    const trend = scoreIndicatorRegimeFit({
      regime: "trend",
      setupType: "trend_continuation",
      features: { emaSlopeScore: 0.7, donchianBreakoutScore: 0.4, atrPercentile: 0.45 }
    });
    const range = scoreIndicatorRegimeFit({
      regime: "range",
      setupType: "mean_reversion",
      features: { rsi14: 32, mfi14: 30, stochRsiK: 18, choppinessIndex: 58 }
    });
    const breakout = scoreIndicatorRegimeFit({
      regime: "breakout",
      setupType: "breakout_retest",
      features: { emaSlopeScore: 0.4, donchianBreakoutScore: 0.6, choppinessIndex: 35, squeezeExpansionScore: 0.5 }
    });
    const highVol = scoreIndicatorRegimeFit({
      regime: "high_vol",
      setupType: "breakout_retest",
      features: { atrPercentile: 0.96, choppinessIndex: 70, cvdDivergenceScore: 0.6 }
    });
    assert.equal(trend.score > 0.5, true);
    assert.equal(range.supportingIndicators.some((item) => item.id === "range_oscillators"), true);
    assert.equal(breakout.warnings.includes("squeeze_expansion_watch_only"), true);
    assert.equal(highVol.score < 0.5, true);
    assert.equal(highVol.warnings.includes("atr_percentile_extreme"), true);
  });

  await runCheck("setup thesis supports all requested setup types", async () => {
    for (const setupType of ["trend_continuation", "breakout_retest", "mean_reversion", "liquidity_sweep_reclaim", "vwap_reclaim"]) {
      const thesis = buildSetupThesis({
        setupType,
        regime: "range",
        features: {
          emaSlopeScore: 0.4,
          relativeStrength: 0.2,
          rsi14: 32,
          vwapZScore: { zScore: -1.4 },
          donchianBreakoutScore: 0.5,
          retestQuality: 0.6,
          liquiditySweepScore: 0.7,
          reclaimScore: 0.65
        },
        orderBook: { spreadBps: 8, bookPressure: 0.1 }
      });
      assert.equal(thesis.setupType, setupType);
      assert.equal(typeof thesis.thesis, "string");
      assert.equal(Array.isArray(thesis.invalidatesIf), true);
      assert.equal(Number.isFinite(thesis.entryQuality), true);
    }
  });

  await runCheck("exit plan hints match setup-specific invalidation logic", async () => {
    assert.equal(buildExitPlanHint({ setupType: "trend_continuation" }).trailActivationHint, "activate_only_after_favorable_move");
    assert.equal(buildExitPlanHint({ setupType: "mean_reversion" }).partialTakeProfitHint, "take_partial_near_vwap_or_range_mid");
    assert.equal(buildExitPlanHint({ setupType: "breakout_retest" }).hardInvalidation, "retest_low_lost");
    assert.equal(buildExitPlanHint({ setupType: "liquidity_sweep_reclaim" }).hardInvalidation, "sweep_low_lost");
    assert.equal(buildExitPlanHint({ setupType: "vwap_reclaim" }).hardInvalidation, "vwap_reclaim_lost");
  });

  await runCheck("portfolio crowding supports multiple positions while blocking duplicate symbol", async () => {
    const empty = buildPortfolioCrowdingSummary({ openPositions: [], candidate: { symbol: "BTCUSDT", strategyFamily: "trend" } });
    const mixed = buildPortfolioCrowdingSummary({
      openPositions: [{ symbol: "ETHUSDT", cluster: "majors", strategyFamily: "trend", regime: "trend", notional: 100 }],
      candidate: { symbol: "SOLUSDT", cluster: "alts", strategyFamily: "breakout", regime: "breakout", quoteAmount: 50 }
    });
    const crowded = buildPortfolioCrowdingSummary({
      openPositions: [
        { symbol: "ETHUSDT", cluster: "majors", strategyFamily: "trend", regime: "trend", notional: 100 },
        { symbol: "BNBUSDT", cluster: "majors", strategyFamily: "trend", regime: "trend", notional: 80 },
        { symbol: "SOLUSDT", cluster: "majors", strategyFamily: "trend", regime: "trend", notional: 70 }
      ],
      candidate: { symbol: "XRPUSDT", cluster: "majors", strategyFamily: "trend", regime: "trend" }
    });
    const duplicate = buildPortfolioCrowdingSummary({
      openPositions: [{ symbol: "BTCUSDT", cluster: "majors" }],
      candidate: { symbol: "BTCUSDT", cluster: "majors" }
    });
    assert.equal(empty.crowdingRisk, "low");
    assert.equal(mixed.sameSymbolBlocked, false);
    assert.equal(["medium", "high", "blocked"].includes(crowded.crowdingRisk), true);
    assert.equal(duplicate.sameSymbolBlocked, true);
    assert.equal(duplicate.crowdingRisk, "blocked");
  });

  await runCheck("post reconcile remains multi-position compatible", async () => {
    const config = {
      botMode: "live",
      maxOpenPositions: 5,
      postReconcileMaxOpenPositions: 2,
      postReconcileMaxNewEntriesPerCycle: 1,
      postReconcileMaxTotalExposureMultiplier: 0.5,
      postReconcileLiveSizeMultiplier: 0.25,
      postReconcilePaperSizeMultiplier: 0.5
    };
    const second = applyPostReconcileEntryLimits({
      config,
      probationState: { active: true },
      proposedEntry: { botMode: "live" },
      openPositions: [{ symbol: "ETHUSDT" }],
      entriesThisCycle: 0
    });
    const third = applyPostReconcileEntryLimits({
      config,
      probationState: { active: true },
      proposedEntry: { botMode: "live" },
      openPositions: [{ symbol: "ETHUSDT" }, { symbol: "BNBUSDT" }],
      entriesThisCycle: 0
    });
    const normal = applyPostReconcileEntryLimits({
      config,
      probationState: { status: "completed" },
      proposedEntry: { botMode: "live" },
      openPositions: [{ symbol: "ETHUSDT" }, { symbol: "BNBUSDT" }, { symbol: "SOLUSDT" }],
      entriesThisCycle: 0
    });
    const red = applyPostReconcileEntryLimits({
      config,
      probationState: { active: true, exchangeSafetyRed: true },
      proposedEntry: { botMode: "live" },
      openPositions: [],
      entriesThisCycle: 0
    });
    assert.equal(second.allowed, true);
    assert.equal(third.blockedReason, "post_reconcile_max_positions_reached");
    assert.equal(normal.maxOpenPositionsDuringProbation, 5);
    assert.equal(red.blockedReason, "exchange_safety_blocked");
  });

  await runCheck("backtest quality metrics are finite and handle empty samples", async () => {
    const empty = buildBacktestQualityMetrics([]);
    const metrics = buildBacktestQualityMetrics([
      { returnPct: 0.03, rMultiple: 1.5, feeBps: 10, slippageBps: 5 },
      { returnPct: -0.01, rMultiple: -0.5, feeBps: 10, slippageBps: 8 },
      { returnPct: 0.02, rMultiple: 1, feeBps: 10, slippageBps: 4 }
    ]);
    assertFiniteTree(assert, empty);
    assertFiniteTree(assert, metrics);
    assert.equal(empty.sampleSizeWarning, true);
    assert.equal(metrics.winRate > 0.6, true);
    assert.equal(metrics.profitFactor > 1, true);
  });

  await runCheck("dashboard normalizer keeps trading quality summary optional", async () => {
    const normalized = normalizeDashboardSnapshotPayload({});
    assert.equal(normalized.tradingQualitySummary.portfolioCrowdingRisk, "unknown");
    const withSummary = normalizeDashboardSnapshotPayload({
      tradingQualitySummary: { topSetupType: "breakout_retest", portfolioCrowdingRisk: "medium" }
    });
    assert.equal(withSummary.tradingQualitySummary.topSetupType, "breakout_retest");
  });
}
