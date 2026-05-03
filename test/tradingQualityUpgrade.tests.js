import {
  anchoredVwap,
  atrPercentile,
  bollingerKeltnerSqueeze,
  emaSlopeStack,
  obvDivergence,
  orderBookImbalanceStability,
  relativeVolume,
  slippageConfidenceScore,
  spreadPercentile,
  vwapZScore
} from "../src/strategy/advancedIndicators.js";
import { scoreIndicatorRegimeFit } from "../src/strategy/indicatorRegimeScoring.js";
import { buildSetupThesis } from "../src/strategy/setupThesis.js";
import { buildExitPlanHint } from "../src/strategy/exitPlanHints.js";
import { buildPortfolioCrowdingSummary } from "../src/risk/portfolioCrowding.js";
import { applyPostReconcileEntryLimits } from "../src/risk/postReconcileEntryLimits.js";
import { buildBacktestQualityMetrics } from "../src/backtest/backtestMetrics.js";
import { validateBacktestResult } from "../src/backtest/backtestIntegrity.js";
import { buildLearningEvidenceRecord, summarizeLearningEvidence } from "../src/runtime/learningEvidencePipeline.js";
import { buildTradeThesis } from "../src/runtime/tradeThesis.js";
import { evaluateAntiOverfitGovernor } from "../src/ai/antiOverfitGovernor.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";
import { clampFinite, safeNumber, safeRatio } from "../src/utils/safeMath.js";

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
  await runCheck("safe math helpers keep missing zero and extreme values finite", async () => {
    const values = [
      safeNumber(Number.NaN, 4),
      safeNumber(Infinity, 3),
      safeNumber("12.5", 0),
      safeRatio(1, 0, 7),
      safeRatio(Number.POSITIVE_INFINITY, 2, 8),
      safeRatio(6, 3, 0),
      clampFinite(999, -2, 2, 0),
      clampFinite(Number.NaN, -2, 2, 1),
      clampFinite(0.5, Number.NaN, Number.POSITIVE_INFINITY, 0)
    ];
    for (const value of values) {
      assert.equal(Number.isFinite(value), true);
    }
    assert.equal(values[0], 4);
    assert.equal(values[3], 7);
    assert.equal(values[5], 2);
    assert.equal(values[6], 2);
    assert.equal(values[7], 1);
  });

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
      ]),
      slippageConfidenceScore({ expectedSlippageBps: 5, realizedSlippageBps: 7, spreadPercentile: 0.4, depthConfidence: 0.7, fillCompletionRatio: 1 })
    ];
    for (const output of outputs) {
      assertFiniteTree(assert, output);
    }
    assert.equal(outputs[1].status, "ready");
    assert.equal(outputs[11].status, "ready");
    assert.equal(outputs[12].status, "high");
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
    assert.equal(highVol.sizeHintMultiplier < 1, true);
    assert.equal(highVol.confidencePenalty > 0, true);
  });

  await runCheck("regime scoring is fallback-safe for missing features and unknown regime", async () => {
    const missing = scoreIndicatorRegimeFit({
      regime: "unknown_regime",
      setupType: "unknown_setup",
      features: {}
    });
    const executionConflict = scoreIndicatorRegimeFit({
      regime: "breakout",
      setupType: "breakout_retest",
      features: {
        emaSlopeScore: 0.2,
        donchianBreakoutScore: 0.3,
        spreadPercentile: { percentile: 0.94 },
        slippageConfidenceScore: { confidence: 0.25 }
      }
    });

    assertFiniteTree(assert, missing);
    assertFiniteTree(assert, executionConflict);
    assert.equal(missing.warnings.includes("indicator_features_sparse"), true);
    assert.equal(executionConflict.warnings.includes("spread_percentile_high"), true);
    assert.equal(executionConflict.warnings.includes("slippage_confidence_low"), true);
    assert.equal(executionConflict.sizeHintMultiplier < 1, true);
    assert.equal(executionConflict.confidencePenalty > 0, true);
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

  await runCheck("runtime trade thesis is setup-specific and remains secret-safe", async () => {
    for (const [family, activeStrategy, expectedSetup] of [
      ["trend_following", "trend_pullback_reclaim", "trend_continuation"],
      ["breakout", "breakout_retest", "breakout_retest"],
      ["mean_reversion", "vwap_reversion", "mean_reversion"],
      ["market_structure", "liquidity_sweep", "liquidity_sweep_reclaim"],
      ["range_grid", "range_grid_reversion", "range_grid"]
    ]) {
      const thesis = buildTradeThesis({
        decision: { createdAt: "2026-01-01T00:00:00.000Z", apiSecret: "do-not-leak" },
        strategySummary: { family, activeStrategy },
        marketSnapshot: { market: { rsi14: 32, rangeBoundaryRespectScore: 0.8, breakoutRetestQuality: 0.7, liquiditySweepScore: 0.8 } }
      });
      assert.equal(thesis.setupType, expectedSetup);
      assert.equal(Array.isArray(thesis.evidenceFor), true);
      assert.equal(Array.isArray(thesis.requiredConfirmation), true);
      assert.equal(Boolean(thesis.exitPlanHint?.hardInvalidation), true);
      assert.equal(JSON.stringify(thesis).includes("do-not-leak"), false);
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
      { returnPct: 0.03, rMultiple: 1.5, feeBps: 10, slippageBps: 5, entryAt: "2026-01-01T00:00:00.000Z", exitAt: "2026-01-01T01:00:00.000Z" },
      { returnPct: -0.01, rMultiple: -0.5, feeBps: 10, slippageBps: 8, entryAt: "2026-01-01T02:00:00.000Z", exitAt: "2026-01-01T02:30:00.000Z" },
      { returnPct: 0.02, rMultiple: 1, feeBps: 10, slippageBps: 4, entryAt: "2026-01-01T03:00:00.000Z", exitAt: "2026-01-01T03:45:00.000Z" }
    ]);
    assertFiniteTree(assert, empty);
    assertFiniteTree(assert, metrics);
    assert.equal(empty.sampleSizeWarning, true);
    assert.equal(metrics.winRate > 0.6, true);
    assert.equal(metrics.profitFactor > 1, true);
    assert.equal(metrics.exposureTime, 135);
  });

  await runCheck("backtest integrity warns on missing feature timestamps and NaN trade metrics", async () => {
    const result = validateBacktestResult({
      result: {
        configHash: "cfg",
        dataHash: "data",
        tradeCount: 1,
        trades: [{ id: "t1", exitAt: "2026-01-01T00:00:00.000Z", pnlPct: Number.NaN }]
      },
      now: "2026-01-02T00:00:00.000Z"
    });
    assert.equal(result.status, "degraded");
    assert.equal(result.issues.some((issue) => issue.code === "missing_feature_timestamp_lookahead_warning"), true);
    assert.equal(result.issues.some((issue) => issue.code === "nan_trade_metric"), true);
  });

  await runCheck("learning evidence pipeline connects thesis exit veto failure and replay priority", async () => {
    const win = buildLearningEvidenceRecord({
      decision: { decisionId: "d1", symbol: "BTCUSDT", strategySummary: { family: "trend_following" }, regime: "trend_up" },
      trade: { id: "t1", symbol: "BTCUSDT", pnlPct: 0.02, maximumFavorableExcursionPct: 0.025, exitEfficiencyPct: 0.8 },
      marketPath: { closeReturnPct: 0.02, maxFavorableMovePct: 0.025, maxAdverseMovePct: -0.003 }
    });
    const loss = buildLearningEvidenceRecord({
      decision: { decisionId: "d2", symbol: "ETHUSDT", reasons: ["late_entry"] },
      trade: { id: "t2", symbol: "ETHUSDT", pnlPct: -0.01, maximumFavorableExcursionPct: 0.02 }
    });
    const badVeto = buildLearningEvidenceRecord({
      decision: { decisionId: "d3", symbol: "SOLUSDT", reasons: ["model_confidence_too_low"] },
      futureMarketPath: { maxFavorableMovePct: 0.03, maxAdverseMovePct: -0.002, closeReturnPct: 0.015, horizonMinutes: 60 }
    });
    const reconcile = buildLearningEvidenceRecord({
      decision: { decisionId: "d4", symbol: "XRPUSDT", reasons: ["reconcile_required"] },
      reconcileSummary: { manualReviewRequired: true }
    });
    const missing = buildLearningEvidenceRecord({});
    const summary = summarizeLearningEvidence([win, loss, badVeto, reconcile, missing]);
    assert.equal(win.exitQuality.label, "good_exit");
    assert.equal(loss.failureMode.failureMode, "late_entry");
    assert.equal(badVeto.vetoOutcome.label, "bad_veto");
    assert.equal(reconcile.failureMode.failureMode, "reconcile_uncertainty");
    assert.equal(summary.status, "ready");
    assert.equal(summary.topReplayCandidates[0].packType, "reconcile_uncertainty");
  });

  await runCheck("anti-overfit governor blocks unsafe promotions and coupled risk increases", async () => {
    const lowSample = evaluateAntiOverfitGovernor({
      proposedChanges: [{ key: "model_threshold", delta: -0.02 }],
      evidence: { sampleSize: 5 }
    });
    const recentPaperSize = evaluateAntiOverfitGovernor({
      proposedChanges: [{ key: "size_multiplier", delta: 0.2 }],
      evidence: { source: "paper", recentPaperWinsOnly: true, sampleSize: 50 }
    });
    const paperLive = evaluateAntiOverfitGovernor({
      proposedChanges: [{ key: "strategy_profile", promoteTo: "live" }],
      evidence: { source: "paper", sampleSize: 100 }
    });
    const coupled = evaluateAntiOverfitGovernor({
      proposedChanges: [{ key: "model_threshold", delta: -0.01 }, { key: "position_size", delta: 0.1 }],
      evidence: { sampleSize: 100, source: "shadow" }
    });
    const calibration = evaluateAntiOverfitGovernor({
      proposedChanges: [{ key: "strategy_profile", promoteTo: "live" }],
      evidence: { source: "shadow", sampleSize: 100, calibrationDelta: 0.04 }
    });
    assert.equal(lowSample.reasons.includes("threshold_relax_low_samples"), true);
    assert.equal(recentPaperSize.reasons.includes("size_increase_recent_paper_wins_only"), true);
    assert.equal(paperLive.reasons.includes("paper_only_evidence_promoted_to_live"), true);
    assert.equal(coupled.reasons.includes("simultaneous_lower_threshold_and_bigger_size"), true);
    assert.equal(calibration.reasons.includes("parameter_promotion_calibration_worsened"), true);
  });

  await runCheck("dashboard normalizer keeps trading quality summary optional", async () => {
    const normalized = normalizeDashboardSnapshotPayload({});
    assert.equal(normalized.tradingQualitySummary.portfolioCrowdingRisk, "unknown");
    const withSummary = normalizeDashboardSnapshotPayload({
      tradingQualitySummary: { topSetupType: "breakout_retest", portfolioCrowdingRisk: "medium" },
      learningEvidenceSummary: { status: "ready", count: 2 },
      antiOverfitSummary: { status: "blocked", reasons: ["low_samples"] },
      backtestQualitySummary: { tradeCount: 3, sampleSizeWarning: true }
    });
    assert.equal(withSummary.tradingQualitySummary.topSetupType, "breakout_retest");
    assert.equal(withSummary.learningEvidenceSummary.status, "ready");
    assert.equal(withSummary.antiOverfitSummary.status, "blocked");
    assert.equal(withSummary.backtestQualitySummary.tradeCount, 3);
  });
}
