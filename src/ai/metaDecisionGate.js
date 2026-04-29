import { clamp } from "../utils/math.js";
import { sameUtcDay } from "../utils/time.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function avg(values = []) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function round(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function classifyMetaFilterCategory(id = "") {
  const normalized = `${id || ""}`.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("leadership") || normalized.includes("rotation")) {
    return "context_quality";
  }
  if (normalized.includes("copycat") || normalized.includes("follower")) {
    return "entry_timing";
  }
  if (normalized.includes("global") || normalized.includes("breadth")) {
    return "context_quality";
  }
  if (normalized.includes("execution") || normalized.includes("liquidity") || normalized.includes("spread")) {
    return "execution";
  }
  if (normalized.includes("volatility")) {
    return "volatility";
  }
  if (normalized.includes("breakout") || normalized.includes("extension")) {
    return "entry_timing";
  }
  if (normalized.includes("regime") || normalized.includes("context")) {
    return "context_quality";
  }
  if (normalized.includes("event")) {
    return "event";
  }
  if (normalized.includes("correlation")) {
    return "correlation";
  }
  if (normalized.includes("session")) {
    return "session";
  }
  return "other";
}

function buildMetaComponent({ id, score, cautionFloor, rejectFloor, detail, cautionReason, rejectReason }) {
  const normalizedScore = clamp(safeNumber(score, 0), 0, 1);
  const status = normalizedScore < rejectFloor
    ? "reject"
    : normalizedScore < cautionFloor
      ? "caution"
      : "pass";
  return {
    id,
    category: classifyMetaFilterCategory(id),
    score: round(normalizedScore, 4),
    status,
    detail: detail || null,
    reason: status === "reject"
      ? rejectReason
      : status === "caution"
        ? cautionReason
        : null
  };
}

function buildMetaFilterAssessment({
  config,
  score = {},
  strategySummary = {},
  marketSnapshot = {},
  newsSummary = {},
  announcementSummary = {},
  marketStructureSummary = {},
  volatilitySummary = {},
  calendarSummary = {},
  sessionSummary = {},
  portfolioSummary = {},
  timeframeSummary = {},
  pairHealthSummary = {},
  onChainLiteSummary = {},
  divergenceSummary = {},
  metaNeuralSummary = {},
  globalMarketContextSummary = {},
  historyConfidence = 0,
  symbolTrades = []
} = {}) {
  const market = marketSnapshot?.market || {};
  const book = marketSnapshot?.book || {};
  const spreadBps = safeNumber(book.spreadBps, 0);
  const expectedSlip = safeNumber(book.entryEstimate?.touchSlippageBps, 0);
  const depthConfidence = safeNumber(book.depthConfidence || book.localBook?.depthConfidence, 0);
  const breakoutFocused =
    ["breakout", "trend_following", "market_structure", "orderflow"].includes(strategySummary.family || "") ||
    strategySummary.activeStrategy === "market_structure_break";
  const continuationFocused =
    breakoutFocused ||
    ["trend_following", "orderflow"].includes(strategySummary.family || "") ||
    ["ema_trend", "market_structure_break"].includes(strategySummary.activeStrategy || "");
  const globalRiskRegime = `${globalMarketContextSummary?.riskRegime || "unknown"}`.trim().toLowerCase();
  const globalMarketMomentum = `${globalMarketContextSummary?.marketMomentum || "unknown"}`.trim().toLowerCase();
  const globalStablecoinSignal = `${globalMarketContextSummary?.stablecoinSignal || "unknown"}`.trim().toLowerCase();
  const globalBtcDominanceSignal = `${globalMarketContextSummary?.btcDominanceSignal || "unknown"}`.trim().toLowerCase();
  const globalContextReliable = `${globalMarketContextSummary?.dataQuality || "unavailable"}`.trim().toLowerCase() !== "unavailable";
  const breadthCoverage = Math.max(
    0,
    Math.min(
      1,
      safeNumber(onChainLiteSummary.coverage, 0) || safeNumber(onChainLiteSummary.confidence, 0)
    )
  );
  const marketBreadthScore = safeNumber(onChainLiteSummary.marketBreadthScore, 0.5);
  const majorsMomentumScore = safeNumber(onChainLiteSummary.majorsMomentumScore, 0.5);
  const altLiquidityScore = safeNumber(onChainLiteSummary.altLiquidityScore, 0.5);
  const breakoutReferenceTrades = breakoutFocused
    ? symbolTrades.filter((trade) => {
        const family = trade.strategyFamily || trade.entryRationale?.strategy?.family || null;
        return ["breakout", "trend_following", "market_structure", "orderflow"].includes(family || "");
      })
    : [];
  const recentBreakoutFailureRate = breakoutReferenceTrades.length >= 4
    ? breakoutReferenceTrades.filter((trade) => safeNumber(trade.netPnlPct, 0) <= 0).length / breakoutReferenceTrades.length
    : null;
  const breakoutFollowThroughScore = safeNumber(market.breakoutFollowThroughScore, 0.5);
  const vwapGapPct = Math.abs(safeNumber(market.vwapGapPct, 0));
  const closeLocation = safeNumber(market.closeLocation, 0.5);
  const bollingerPosition = safeNumber(market.bollingerPosition, 0.5);
  const leadershipScore = clamp(safeNumber(market.leadershipScore, 0.5), 0, 1);
  const relativeAccelerationScore = clamp(safeNumber(market.relativeAccelerationScore, 0.5), 0, 1);
  const leadershipTailwindScore = clamp(safeNumber(market.leadershipTailwindScore, 0.5), 0, 1);
  const lateFollowerRisk = clamp(safeNumber(market.lateFollowerRisk, 0), 0, 1);
  const copycatBreakoutRisk = clamp(safeNumber(market.copycatBreakoutRisk, 0), 0, 1);
  const leadershipState = `${market.leadershipState || "neutral"}`.trim().toLowerCase();
  const clusterRotationState = `${market.clusterRotationState || "neutral"}`.trim().toLowerCase();
  const sectorRotationState = `${market.sectorRotationState || "neutral"}`.trim().toLowerCase();
  const leadershipRank = Number.isFinite(market.leadershipRank) ? Math.max(1, Number(market.leadershipRank)) : null;
  const executionQualityScore = clamp(
    0.42 + depthConfidence * 0.34 - expectedSlip / 11 - spreadBps / 110,
    0,
    1
  );
  const volatilityLiquidityScore = clamp(
    0.82 -
      Math.max(0, safeNumber(volatilitySummary.riskScore, 0) - 0.28) * 0.9 -
      Math.max(0, safeNumber(volatilitySummary.ivPremium, 0) - 6) * 0.01 -
      Math.max(0, spreadBps - Math.max(config.maxSpreadBps || 0, 6)) / 50,
    0,
    1
  );
  const entryExtensionScore = clamp(
    0.88 -
      Math.max(0, vwapGapPct - 0.006) * 34 -
      Math.max(0, closeLocation - 0.84) * 0.95 -
      Math.max(0, bollingerPosition - 0.88) * 0.75,
    0,
    1
  );
  const regimeConsistencyScore = clamp(
    0.36 +
      Math.max(0, safeNumber(strategySummary.fitScore, 0) - 0.42) * 0.34 +
      Math.max(0, safeNumber(timeframeSummary.alignmentScore, 0.5) - 0.5) * 0.28 +
      Math.max(0, safeNumber(pairHealthSummary.score, 0.5) - 0.5) * 0.16 +
      Math.max(0, safeNumber(marketStructureSummary.signalScore, 0)) * 0.14 +
      Math.max(0, safeNumber(metaNeuralSummary.probability, 0.5) - 0.5) * 0.12 -
      Math.max(0, safeNumber(marketStructureSummary.longSqueezeScore, 0) - 0.45) * 0.16,
    0,
    1
  );
  const globalRegimeQualityScore = globalContextReliable
    ? clamp(
        (continuationFocused ? 0.58 : 0.6) +
          (continuationFocused && globalRiskRegime === "risk_on" ? 0.12 : 0) +
          (continuationFocused && globalMarketMomentum === "bullish" ? 0.1 : 0) +
          (continuationFocused && globalStablecoinSignal === "risk_on" ? 0.08 : 0) -
          (continuationFocused && globalRiskRegime === "defensive" ? 0.24 : 0) -
          (continuationFocused && globalStablecoinSignal === "risk_off" ? 0.16 : 0) -
          (continuationFocused && globalMarketMomentum === "bearish" ? 0.12 : 0) -
          (continuationFocused && globalBtcDominanceSignal === "btc_leading" ? 0.05 : 0) +
          (!continuationFocused && globalRiskRegime === "defensive" ? 0.04 : 0) -
          (!continuationFocused && globalMarketMomentum === "bearish" ? 0.03 : 0),
        0,
        1
      )
    : 0.58;
  const breadthAlignmentScore = breadthCoverage > 0.2
    ? clamp(
        (continuationFocused ? 0.34 : 0.5) +
          marketBreadthScore * (continuationFocused ? 0.28 : 0.14) +
          majorsMomentumScore * (continuationFocused ? 0.2 : 0.1) +
          altLiquidityScore * (continuationFocused ? 0.14 : 0.08) +
          Math.max(0, breakoutFollowThroughScore - 0.4) * (continuationFocused ? 0.12 : 0.04) -
          Math.max(0, 0.45 - marketBreadthScore) * (continuationFocused ? 0.34 : 0.08) -
          Math.max(0, 0.42 - majorsMomentumScore) * (continuationFocused ? 0.2 : 0.06) -
          Math.max(0, 0.4 - altLiquidityScore) * (continuationFocused ? 0.14 : 0.04),
        0,
        1
      )
    : 0.58;
  const leaderRotationContextScore = clamp(
    0.34 +
      leadershipScore * 0.2 +
      relativeAccelerationScore * 0.18 +
      leadershipTailwindScore * 0.18 +
      (clusterRotationState === "leading" ? 0.08 : clusterRotationState === "cooling" ? -0.06 : 0) +
      (sectorRotationState === "leading" ? 0.04 : sectorRotationState === "cooling" ? -0.03 : 0) +
      (leadershipState === "leader" ? 0.08 : leadershipState === "laggard" ? -0.1 : 0) -
      lateFollowerRisk * 0.24 -
      copycatBreakoutRisk * 0.23,
    0,
    1
  );
  const eventContextScore = clamp(
    0.94 -
      safeNumber(newsSummary.riskScore, 0) * 0.34 -
      safeNumber(announcementSummary.riskScore, 0) * 0.28 -
      safeNumber(calendarSummary.riskScore, 0) * 0.26,
    0,
    1
  );
  const correlationPressureScore = clamp(
    0.86 -
      Math.max(0, safeNumber(portfolioSummary.maxCorrelation, 0) - 0.55) * 0.92 -
      ((divergenceSummary?.leadBlocker?.status || "") === "blocked" ? 0.26 : 0) -
      Math.max(0, safeNumber(divergenceSummary.averageScore, 0) - safeNumber(config.divergenceAlertScore, 0.45)) * 0.26,
    0,
    1
  );
  const sessionQualityScore = clamp(
    0.9 -
      safeNumber(sessionSummary.riskScore, 0) * 0.6 -
      (sessionSummary.lowLiquidity ? 0.18 : 0),
    0,
    1
  );
  const breakoutReliabilityScore = breakoutFocused
    ? clamp(
        0.44 +
          breakoutFollowThroughScore * 0.34 -
          safeNumber(recentBreakoutFailureRate, 0.45) * 0.3,
        0,
        1
      )
    : 0.62;
  const components = [
    buildMetaComponent({
      id: "execution_quality",
      score: executionQualityScore,
      cautionFloor: 0.5,
      rejectFloor: 0.34,
      detail: `spread ${spreadBps.toFixed(2)}bps | slip ${expectedSlip.toFixed(2)}bps | depth ${depthConfidence.toFixed(2)}`,
      cautionReason: "meta_followthrough_execution_caution",
      rejectReason: "meta_followthrough_execution_reject"
    }),
    buildMetaComponent({
      id: "volatility_liquidity",
      score: volatilityLiquidityScore,
      cautionFloor: 0.48,
      rejectFloor: 0.3,
      detail: `vol ${safeNumber(volatilitySummary.riskScore, 0).toFixed(2)} | iv ${safeNumber(volatilitySummary.ivPremium, 0).toFixed(2)}`,
      cautionReason: "meta_followthrough_volatility_caution",
      rejectReason: "meta_followthrough_volatility_reject"
    }),
    buildMetaComponent({
      id: "entry_extension",
      score: entryExtensionScore,
      cautionFloor: 0.48,
      rejectFloor: 0.3,
      detail: `vwap ${vwapGapPct.toFixed(4)} | close ${closeLocation.toFixed(2)} | bb ${bollingerPosition.toFixed(2)}`,
      cautionReason: "meta_followthrough_extension_caution",
      rejectReason: "meta_followthrough_extension_reject"
    }),
    buildMetaComponent({
      id: "regime_consistency",
      score: regimeConsistencyScore,
      cautionFloor: 0.5,
      rejectFloor: 0.34,
      detail: `fit ${safeNumber(strategySummary.fitScore, 0).toFixed(2)} | tf ${safeNumber(timeframeSummary.alignmentScore, 0.5).toFixed(2)} | pair ${safeNumber(pairHealthSummary.score, 0.5).toFixed(2)}`,
      cautionReason: "meta_followthrough_regime_caution",
      rejectReason: "meta_followthrough_regime_reject"
    }),
    buildMetaComponent({
      id: "global_regime_quality",
      score: globalRegimeQualityScore,
      cautionFloor: 0.5,
      rejectFloor: 0.34,
      detail: globalContextReliable
        ? `regime ${globalRiskRegime} | momentum ${globalMarketMomentum} | stablecoin ${globalStablecoinSignal} | btc ${globalBtcDominanceSignal}`
        : "global context unavailable",
      cautionReason: "meta_followthrough_global_regime_caution",
      rejectReason: "meta_followthrough_global_regime_reject"
    }),
    buildMetaComponent({
      id: "breadth_alignment",
      score: breadthAlignmentScore,
      cautionFloor: continuationFocused ? 0.48 : 0.44,
      rejectFloor: continuationFocused ? 0.3 : 0.26,
      detail: breadthCoverage > 0.2
        ? `breadth ${marketBreadthScore.toFixed(2)} | majors ${majorsMomentumScore.toFixed(2)} | alt liq ${altLiquidityScore.toFixed(2)}`
        : "breadth context unavailable",
      cautionReason: "meta_followthrough_breadth_caution",
      rejectReason: "meta_followthrough_breadth_reject"
    }),
    buildMetaComponent({
      id: "leader_rotation_context",
      score: leaderRotationContextScore,
      cautionFloor: continuationFocused ? 0.5 : 0.46,
      rejectFloor: continuationFocused ? 0.32 : 0.28,
      detail: `state ${leadershipState} | rank ${leadershipRank || "-"} | cluster ${clusterRotationState} | accel ${relativeAccelerationScore.toFixed(2)} | follower ${lateFollowerRisk.toFixed(2)} | copycat ${copycatBreakoutRisk.toFixed(2)}`,
      cautionReason: "meta_followthrough_leadership_caution",
      rejectReason: "meta_followthrough_leadership_reject"
    }),
    buildMetaComponent({
      id: "event_context",
      score: eventContextScore,
      cautionFloor: 0.52,
      rejectFloor: 0.34,
      detail: `news ${safeNumber(newsSummary.riskScore, 0).toFixed(2)} | notices ${safeNumber(announcementSummary.riskScore, 0).toFixed(2)} | calendar ${safeNumber(calendarSummary.riskScore, 0).toFixed(2)}`,
      cautionReason: "meta_followthrough_event_caution",
      rejectReason: "meta_followthrough_event_reject"
    }),
    buildMetaComponent({
      id: "correlation_pressure",
      score: correlationPressureScore,
      cautionFloor: 0.5,
      rejectFloor: 0.34,
      detail: `corr ${safeNumber(portfolioSummary.maxCorrelation, 0).toFixed(2)} | divergence ${safeNumber(divergenceSummary.averageScore, 0).toFixed(2)}`,
      cautionReason: "meta_followthrough_correlation_caution",
      rejectReason: "meta_followthrough_correlation_reject"
    }),
    buildMetaComponent({
      id: "session_quality",
      score: sessionQualityScore,
      cautionFloor: 0.5,
      rejectFloor: 0.34,
      detail: `session risk ${safeNumber(sessionSummary.riskScore, 0).toFixed(2)}`,
      cautionReason: "meta_followthrough_session_caution",
      rejectReason: "meta_followthrough_session_reject"
    }),
    buildMetaComponent({
      id: "breakout_reliability",
      score: breakoutReliabilityScore,
      cautionFloor: breakoutFocused ? 0.5 : 0,
      rejectFloor: breakoutFocused ? 0.32 : 0,
      detail: breakoutFocused
        ? `follow-through ${breakoutFollowThroughScore.toFixed(2)} | failure ${(safeNumber(recentBreakoutFailureRate, 0) * 100).toFixed(0)}%`
        : "neutral",
      cautionReason: "meta_followthrough_breakout_caution",
      rejectReason: "meta_followthrough_breakout_reject"
    })
  ];
  const rejectBuckets = components.filter((item) => item.status === "reject");
  const cautionBuckets = components.filter((item) => item.status === "caution");
  const reasonCategories = [...new Set([...rejectBuckets, ...cautionBuckets].map((item) => item.category))];
  const primaryBucket = [...rejectBuckets, ...cautionBuckets]
    .sort((left, right) => left.score - right.score)[0] || null;
  const confidence = clamp(
    0.26 +
      historyConfidence * 0.2 +
      (depthConfidence > 0 ? 0.12 : 0) +
      (timeframeSummary.enabled ? 0.08 : 0) +
      (newsSummary.coverage ? 0.06 : 0) +
      (strategySummary.activeStrategy ? 0.08 : 0) +
      (pairHealthSummary.score != null ? 0.06 : 0),
    0.2,
    0.94
  );
  const scoreValue = clamp(
    components.reduce((total, item) => total + item.score * ({
      execution_quality: 0.14,
      volatility_liquidity: 0.1,
      entry_extension: 0.12,
      regime_consistency: 0.12,
      global_regime_quality: 0.1,
      breadth_alignment: 0.1,
      leader_rotation_context: 0.12,
      event_context: 0.08,
      correlation_pressure: 0.06,
      session_quality: 0.04,
      breakout_reliability: 0.02
    }[item.id] ?? 0.06), 0),
    0,
    1
  );
  const decision =
    confidence >= Math.max(0.5, safeNumber(config.metaMinConfidence, 0.42) - 0.02) &&
    scoreValue < 0.3 &&
    rejectBuckets.length >= 2
      ? "block"
      : confidence >= Math.max(0.34, safeNumber(config.metaMinConfidence, 0.42) - 0.08) &&
          (scoreValue < 0.44 || rejectBuckets.length >= 1 || cautionBuckets.length >= 3)
        ? "caution"
        : "pass";
  return {
    decision,
    score: round(scoreValue, 4),
    confidence: round(confidence, 4),
    primaryReason: primaryBucket?.reason || null,
    reasonCategories,
    components: components.map((item) => ({
      id: item.id,
      category: item.category,
      status: item.status,
      score: item.score,
      detail: item.detail
    })),
    reasons: [...new Set([...rejectBuckets, ...cautionBuckets].map((item) => item.reason).filter(Boolean))],
    recentBreakoutFailureRate: recentBreakoutFailureRate == null ? null : round(recentBreakoutFailureRate, 4)
  };
}

function recentTrades(journal, predicate) {
  return [...(journal?.trades || [])]
    .filter((trade) => trade.exitAt && predicate(trade))
    .slice(-30);
}

function sameDayTrades(journal, nowIso) {
  return [...(journal?.trades || [])].filter((trade) => {
    const reference = trade.exitAt || trade.entryAt;
    return reference ? sameUtcDay(reference, nowIso) : false;
  });
}

export class MetaDecisionGate {
  constructor(config) {
    this.config = config;
  }

  evaluate({
    symbol,
    score,
    marketSnapshot,
    newsSummary = {},
    announcementSummary = {},
    marketStructureSummary = {},
    marketSentimentSummary = {},
    volatilitySummary = {},
    calendarSummary = {},
    committeeSummary = {},
    strategySummary = {},
    sessionSummary = {},
    driftSummary = {},
    selfHealState = {},
    portfolioSummary = {},
    timeframeSummary = {},
    pairHealthSummary = {},
    onChainLiteSummary = {},
    globalMarketContextSummary = {},
    divergenceSummary = {},
    metaNeuralSummary = {},
    journal,
    nowIso
  }) {
    const symbolTrades = recentTrades(journal, (trade) => trade.symbol === symbol);
    const strategyTrades = recentTrades(journal, (trade) => {
      const strategyId = trade.strategyAtEntry || trade.strategyDecision?.activeStrategy || trade.entryRationale?.strategy?.activeStrategy;
      return strategyId && strategyId === strategySummary.activeStrategy;
    });
    const todayTrades = sameDayTrades(journal, nowIso);
    const todayLoss = todayTrades.reduce((total, trade) => total + Math.min(0, trade.pnlQuote || 0), 0);
    const dailyLossFraction = Math.abs(Math.min(0, todayLoss)) / Math.max(this.config.startingCash || 1, 1);
    const todayTradeCount = todayTrades.length;
    const liveTrades = (journal?.trades || []).filter((trade) => trade.exitAt && trade.brokerMode === "live");
    const canaryActive = this.config.botMode === "live" && this.config.enableCanaryLiveMode && liveTrades.length < this.config.canaryLiveTradeCount;
    const tradeQualityMinScore = safeNumber(this.config.tradeQualityMinScore, 0.47);
    const tradeQualityCautionScore = safeNumber(this.config.tradeQualityCautionScore, 0.58);
    const primarySignalStrength = clamp(
      0.22 +
        Math.max(0, safeNumber(score.probability, 0.5) - safeNumber(this.config.modelThreshold, 0.5)) * 1.55 +
        safeNumber(score.confidence, 0) * 0.18 +
        safeNumber(score.calibrationConfidence, 0) * 0.14 +
        Math.max(0, safeNumber(strategySummary.fitScore, 0) - 0.42) * 0.32 +
        Math.max(0, safeNumber(committeeSummary.agreement, 0) - 0.35) * 0.12 +
        Math.max(0, safeNumber(committeeSummary.netScore, 0)) * 0.14,
      0,
      1
    );

    const historicalEdge =
      avg(symbolTrades.map((trade) => safeNumber(trade.netPnlPct, 0))) * 8 +
      avg(strategyTrades.map((trade) => safeNumber(trade.netPnlPct, 0))) * 10;
    const historyConfidence = clamp(
      Math.log1p(symbolTrades.length + strategyTrades.length) / Math.log(18),
      0,
      1
    );
    const positiveScore =
      (score.probability - this.config.modelThreshold) * 1.2 +
      safeNumber(committeeSummary.netScore, 0) * 0.38 +
      safeNumber(committeeSummary.agreement, 0) * 0.24 +
      safeNumber(strategySummary.fitScore, 0) * 0.3 +
      safeNumber(newsSummary.reliabilityScore, 0) * 0.12 +
      Math.max(0, safeNumber(marketSnapshot?.book?.bookPressure, 0)) * 0.14 +
      Math.max(0, safeNumber(marketStructureSummary.signalScore, 0)) * 0.18 +
      Math.max(0, safeNumber(marketSentimentSummary.contrarianScore, 0)) * 0.1 +
      Math.max(0, safeNumber(pairHealthSummary.score, 0.5) - 0.5) * 0.26 +
      Math.max(0, safeNumber(timeframeSummary.alignmentScore, 0.5) - 0.5) * 0.24 +
      Math.max(0, safeNumber(onChainLiteSummary.liquidityScore, 0) - 0.35) * 0.16 +
      Math.max(0, safeNumber(metaNeuralSummary.probability, 0.5) - 0.5) * 0.32 +
      Math.max(0, historicalEdge);
    const negativeScore =
      Math.max(0, safeNumber(newsSummary.riskScore, 0) - 0.45) * 0.34 +
      Math.max(0, safeNumber(announcementSummary.riskScore, 0) - 0.35) * 0.28 +
      Math.max(0, safeNumber(calendarSummary.riskScore, 0) - 0.35) * 0.24 +
      Math.max(0, safeNumber(volatilitySummary.riskScore, 0) - 0.42) * 0.22 +
      Math.max(0, safeNumber(driftSummary.severity, 0) - 0.2) * 0.34 +
      Math.max(0, safeNumber(sessionSummary.riskScore, 0) - 0.35) * 0.2 +
      Math.max(0, safeNumber(portfolioSummary.maxCorrelation, 0) - 0.55) * 0.2 +
      Math.max(0, safeNumber(marketStructureSummary.longSqueezeScore, 0) - 0.35) * 0.16 +
      Math.max(0, safeNumber(marketStructureSummary.crowdingBias, 0)) * 0.08 +
      Math.max(0, 0.48 - safeNumber(timeframeSummary.alignmentScore, 0.5)) * 0.22 +
      Math.max(0, 0.5 - safeNumber(pairHealthSummary.score, 0.5)) * 0.2 +
      Math.max(0, safeNumber(onChainLiteSummary.stressScore, 0) - 0.35) * 0.16 +
      Math.max(0, 0.5 - safeNumber(metaNeuralSummary.probability, 0.5)) * 0.34;
    const baseMetaScore = clamp(0.5 + positiveScore - negativeScore, 0, 1);
    const neuralBlend = clamp(safeNumber(metaNeuralSummary.confidence, 0) * 0.26, 0, 0.26);
    const metaScore = clamp(baseMetaScore * (1 - neuralBlend) + safeNumber(metaNeuralSummary.probability, baseMetaScore) * neuralBlend, 0, 1);
    const metaConfidence = clamp(
      0.24 +
        historyConfidence * 0.34 +
        (newsSummary.coverage ? 0.08 : 0) +
        (committeeSummary.agreement ? 0.12 : 0) +
        (strategySummary.activeStrategy ? 0.1 : 0) +
        (marketSnapshot?.book?.depthConfidence ? 0.08 : 0) +
        (timeframeSummary.enabled ? 0.06 : 0) +
        Math.min(0.12, safeNumber(metaNeuralSummary.confidence, 0) * 0.14),
      0.18,
      0.96
    );

    const expectedSlip = safeNumber(marketSnapshot?.book?.entryEstimate?.touchSlippageBps || 0);
    const spreadBps = safeNumber(marketSnapshot?.book?.spreadBps || 0);
    const depthConfidence = safeNumber(marketSnapshot?.book?.depthConfidence || marketSnapshot?.book?.localBook?.depthConfidence || 0);
    const executionReadiness = clamp(0.42 + depthConfidence * 0.3 - expectedSlip / 12 - spreadBps / 120, 0, 1);
    const qualityScore = clamp(
      0.4 +
        (score.calibrationConfidence || 0) * 0.16 +
        (score.confidence || 0) * 0.12 +
        Math.max(0, safeNumber(strategySummary.fitScore, 0) - 0.45) * 0.34 +
        Math.max(0, safeNumber(committeeSummary.agreement, 0) - 0.3) * 0.18 +
        executionReadiness * 0.16 +
        historyConfidence * 0.08 +
        Math.max(0, safeNumber(timeframeSummary.alignmentScore, 0) - 0.4) * 0.12 +
        Math.max(0, safeNumber(pairHealthSummary.score, 0.5) - 0.45) * 0.1 +
        Math.max(0, safeNumber(metaNeuralSummary.probability, 0.5) - 0.5) * 0.18 +
        safeNumber(metaNeuralSummary.confidence, 0) * 0.08 -
        negativeScore * 0.22,
      0,
      1
    );
    const qualityBand = qualityScore >= 0.68 ? "prime" : qualityScore >= tradeQualityCautionScore ? "good" : qualityScore >= tradeQualityMinScore ? "watch" : "weak";
    const lowTimeframeAlignmentCaution =
      timeframeSummary.enabled &&
      safeNumber(timeframeSummary.alignmentScore, 1) < 0.42;
    const metaFilter = buildMetaFilterAssessment({
      config: this.config,
      score,
      strategySummary,
      marketSnapshot,
      newsSummary,
      announcementSummary,
      marketStructureSummary,
      volatilitySummary,
      calendarSummary,
      sessionSummary,
      portfolioSummary,
      timeframeSummary,
      pairHealthSummary,
      divergenceSummary,
      metaNeuralSummary,
      globalMarketContextSummary,
      historyConfidence,
      symbolTrades
    });
    const strongPaperAlphaContext =
      this.config.botMode === "paper" &&
      primarySignalStrength >= 0.66 &&
      safeNumber(score.probability, 0) >= Math.max(safeNumber(this.config.modelThreshold, 0.52) + 0.08, 0.62) &&
      safeNumber(strategySummary.fitScore, 0) >= 0.62 &&
      safeNumber(timeframeSummary.alignmentScore, 0.5) >= 0.58 &&
      safeNumber(pairHealthSummary.score, 0.5) >= 0.56 &&
      safeNumber(newsSummary.riskScore, 0) <= 0.28 &&
      safeNumber(announcementSummary.riskScore, 0) <= 0.18 &&
      safeNumber(calendarSummary.riskScore, 0) <= 0.22 &&
      safeNumber(portfolioSummary.maxCorrelation, 0) <= 0.78 &&
      safeNumber(metaNeuralSummary.probability, 0.5) >= 0.46;
    const strongPaperMetaCautionRelief =
      strongPaperAlphaContext &&
      metaFilter.decision === "caution" &&
      (metaFilter.reasons || []).length <= 2 &&
      !(metaFilter.reasonCategories || []).some((category) =>
        ["context_quality", "entry_timing"].includes(category)
      ) &&
      !(metaFilter.components || []).some((component) =>
        [
          "global_regime_quality",
          "breadth_alignment",
          "leader_rotation_context",
          "breakout_reliability"
        ].includes(component.id) && component.status !== "pass"
      ) &&
      !(metaFilter.reasons || []).some((reason) =>
        ["meta_followthrough_event_reject", "meta_followthrough_execution_reject", "meta_followthrough_correlation_reject"].includes(reason)
      );

    const budgetPressure = clamp(todayTradeCount / Math.max(this.config.maxEntriesPerDay || 1, 1), 0, 1.4);
    const dailyBudgetFactor = clamp(
      1 - dailyLossFraction / Math.max(this.config.maxDailyDrawdown || 0.01, 0.01) * 0.65 - budgetPressure * 0.18,
      this.config.dailyRiskBudgetFloor,
      1
    );
    const canarySizeMultiplier = canaryActive ? this.config.canaryLiveSizeMultiplier : 1;
    const pairHealthMultiplier = clamp(0.82 + safeNumber(pairHealthSummary.score, 0.5) * 0.3, 0.65, 1.08);
    const timeframeMultiplier = clamp(0.78 + safeNumber(timeframeSummary.alignmentScore, 0.5) * 0.34, 0.7, 1.08);
    const divergencePenalty = (divergenceSummary?.leadBlocker?.status || "") === "blocked"
      ? 0.78
      : (divergenceSummary?.averageScore || 0) >= this.config.divergenceAlertScore
        ? 0.9
        : 1;
    const sizeMultiplier = clamp(
      (0.56 + metaScore * 0.58) *
        (0.82 + historyConfidence * 0.16) *
        (0.82 + qualityScore * 0.12) *
        dailyBudgetFactor *
        canarySizeMultiplier *
        pairHealthMultiplier *
        timeframeMultiplier *
        divergencePenalty *
        (selfHealState.lowRiskOnly ? 0.9 : 1),
      0.16,
      1.12
    );

    const reasons = [];
    if (metaConfidence >= this.config.metaMinConfidence && metaScore < this.config.metaBlockScore) {
      reasons.push("meta_gate_reject");
    } else if (metaScore < this.config.metaCautionScore || lowTimeframeAlignmentCaution) {
      reasons.push("meta_gate_caution");
    }
    if (safeNumber(metaNeuralSummary.confidence, 0) >= this.config.metaMinConfidence && safeNumber(metaNeuralSummary.probability, 0.5) < this.config.metaBlockScore) {
      reasons.push("meta_neural_reject");
    } else if (safeNumber(metaNeuralSummary.confidence, 0) >= this.config.metaMinConfidence - 0.06 && safeNumber(metaNeuralSummary.probability, 0.5) < this.config.metaCautionScore) {
      reasons.push("meta_neural_caution");
    }
    if (qualityScore < tradeQualityMinScore) {
      reasons.push("trade_quality_reject");
    } else if (qualityScore < tradeQualityCautionScore) {
      reasons.push("trade_quality_caution");
    }
    if (metaFilter.decision === "block") {
      reasons.push("meta_followthrough_reject");
    } else if (metaFilter.decision === "caution" && !strongPaperMetaCautionRelief) {
      reasons.push("meta_followthrough_caution");
    }
    if ((pairHealthSummary.quarantined || false)) {
      reasons.push("pair_health_quarantine");
    }
    if ((timeframeSummary.blockerReasons || []).length) {
      reasons.push(...timeframeSummary.blockerReasons);
    }
    if ((divergenceSummary?.leadBlocker?.status || "") === "blocked") {
      reasons.push("live_paper_divergence_guard");
    }
    if (dailyBudgetFactor < 0.999) {
      reasons.push("daily_risk_budget_scaled");
    }
    if (canaryActive) {
      reasons.push("canary_live_sizing");
    }
    if (todayTradeCount >= this.config.maxEntriesPerDay) {
      reasons.push("daily_entry_budget_reached");
    }

    const action =
      reasons.includes("meta_gate_reject") || reasons.includes("meta_neural_reject") || reasons.includes("trade_quality_reject") || reasons.includes("meta_followthrough_reject") || reasons.includes("pair_health_quarantine") || reasons.includes("live_paper_divergence_guard") || todayTradeCount >= this.config.maxEntriesPerDay
        ? "block"
        : reasons.includes("meta_gate_caution") || reasons.includes("meta_neural_caution") || reasons.includes("trade_quality_caution") || reasons.includes("meta_followthrough_caution")
          ? "caution"
          : "pass";
    const hasDirectCautionGate = reasons.includes("meta_gate_caution") || reasons.includes("trade_quality_caution");
    const hasNeuralOnlyCaution = !hasDirectCautionGate && reasons.includes("meta_neural_caution");
    const hasFollowThroughOnlyCaution =
      !hasDirectCautionGate &&
      !hasNeuralOnlyCaution &&
      reasons.includes("meta_followthrough_caution");

    const strongPaperCautionOnly =
      strongPaperAlphaContext &&
      action === "caution" &&
      !reasons.some((reason) => reason.endsWith("_reject")) &&
      reasons.every((reason) => [
        "meta_gate_caution",
        "meta_neural_caution",
        "trade_quality_caution",
        "meta_followthrough_caution",
        "daily_risk_budget_scaled",
        "canary_live_sizing"
      ].includes(reason));
    const thresholdPenalty =
      action === "block"
        ? 0.055 + Math.max(0, tradeQualityMinScore - qualityScore) * 0.03
        : action === "caution"
          ? (
            strongPaperCautionOnly
              ? 0.005 + Math.max(0, tradeQualityCautionScore - qualityScore) * 0.012
              :
            hasNeuralOnlyCaution
              ? safeNumber(this.config.metaNeuralCautionThresholdPenalty, 0.008)
              : hasFollowThroughOnlyCaution
                ? 0.014 + Math.max(0, 0.48 - metaFilter.score) * 0.025
              : 0.018 + Math.max(0, tradeQualityCautionScore - qualityScore) * 0.03
          )
          : 0;

    return {
      action,
      score: Number(metaScore.toFixed(4)),
      confidence: Number(metaConfidence.toFixed(4)),
      qualityScore: Number(qualityScore.toFixed(4)),
      qualityBand,
      qualityReasons: [
        `execution:${executionReadiness.toFixed(3)}`,
        `history:${historyConfidence.toFixed(3)}`,
        `spread:${spreadBps.toFixed(2)}`,
        `expected_slip:${expectedSlip.toFixed(2)}`,
        `pair:${safeNumber(pairHealthSummary.score, 0.5).toFixed(3)}`,
        `tf:${safeNumber(timeframeSummary.alignmentScore, 0.5).toFixed(3)}`
      ],
      thresholdPenalty: Number(thresholdPenalty.toFixed(4)),
      sizeMultiplier: Number(sizeMultiplier.toFixed(4)),
      dailyBudgetFactor: Number(dailyBudgetFactor.toFixed(4)),
      dailyLossFraction: Number(dailyLossFraction.toFixed(4)),
      dailyTradeCount: todayTradeCount,
      canaryActive,
      canaryTradesRemaining: canaryActive
        ? Math.max(0, this.config.canaryLiveTradeCount - liveTrades.length)
        : 0,
      canarySizeMultiplier: Number(canarySizeMultiplier.toFixed(4)),
      historyConfidence: Number(historyConfidence.toFixed(4)),
      primarySignalStrength: round(primarySignalStrength, 4),
      pairHealthScore: Number(safeNumber(pairHealthSummary.score, 0.5).toFixed(4)),
      timeframeAlignment: Number(safeNumber(timeframeSummary.alignmentScore, 0.5).toFixed(4)),
      neuralProbability: Number(safeNumber(metaNeuralSummary.probability, 0.5).toFixed(4)),
      neuralConfidence: Number(safeNumber(metaNeuralSummary.confidence, 0).toFixed(4)),
      metaFilter,
      neuralDrivers: [...(metaNeuralSummary.contributions || [])].slice(0, 4),
      notes: [
        `meta_score:${metaScore.toFixed(3)}`,
        `meta_conf:${metaConfidence.toFixed(3)}`,
        `quality:${qualityScore.toFixed(3)}`,
        `primary_signal:${primarySignalStrength.toFixed(3)}`,
        `meta_filter:${metaFilter.decision}:${metaFilter.score.toFixed(3)}`,
        `daily_budget:${dailyBudgetFactor.toFixed(3)}`,
        `canary:${canaryActive}`,
        `symbol_hist:${symbolTrades.length}`,
        `strategy_hist:${strategyTrades.length}`,
        `pair_health:${safeNumber(pairHealthSummary.score, 0.5).toFixed(3)}`,
        `tf_align:${safeNumber(timeframeSummary.alignmentScore, 0.5).toFixed(3)}`,
        `global_regime:${globalMarketContextSummary?.riskRegime || "unknown"}`,
        `breadth:${safeNumber(onChainLiteSummary.marketBreadthScore, 0.5).toFixed(3)}`
      ],
      reasons
    };
  }
}
