import { scoreIndicatorRegimeFit } from "../strategy/indicatorRegimeScoring.js";
import { clamp } from "../utils/math.js";

export const CRYPTO_MARKET_REGIMES = Object.freeze({
  BTC_LED_TREND: "btc_led_trend",
  ETH_LED_TREND: "eth_led_trend",
  ALT_ROTATION: "alt_rotation",
  RANGE_CHOP: "range_chop",
  LIQUIDITY_VACUUM: "liquidity_vacuum",
  CRASH_RISK: "crash_risk",
  NEWS_SHOCK: "news_shock"
});

const DEFAULT_ROUTING = Object.freeze({
  [CRYPTO_MARKET_REGIMES.BTC_LED_TREND]: {
    allowedSetupFamilies: ["trend_following", "trend_pullback", "breakout_retest", "market_structure"],
    blockedSetupFamilies: ["range_grid"],
    sizeMultiplier: 0.9,
    confidencePenalty: 0.03,
    reason: "BTC leadership and trend strength favor continuation/retest diagnostics."
  },
  [CRYPTO_MARKET_REGIMES.ETH_LED_TREND]: {
    allowedSetupFamilies: ["trend_following", "trend_pullback", "breakout_retest", "market_structure"],
    blockedSetupFamilies: ["range_grid"],
    sizeMultiplier: 0.88,
    confidencePenalty: 0.04,
    reason: "ETH leadership and trend strength favor continuation/retest diagnostics."
  },
  [CRYPTO_MARKET_REGIMES.ALT_ROTATION]: {
    allowedSetupFamilies: ["breakout_retest", "trend_following", "market_structure", "liquidity_sweep_reclaim"],
    blockedSetupFamilies: ["range_grid"],
    sizeMultiplier: 0.82,
    confidencePenalty: 0.06,
    reason: "Alt breadth/rotation supports selective momentum diagnostics."
  },
  [CRYPTO_MARKET_REGIMES.RANGE_CHOP]: {
    allowedSetupFamilies: ["mean_reversion", "vwap_reclaim", "range_grid"],
    blockedSetupFamilies: ["breakout_chase"],
    sizeMultiplier: 0.65,
    confidencePenalty: 0.12,
    reason: "Choppy/range conditions favor reversion diagnostics and reduce breakout confidence."
  },
  [CRYPTO_MARKET_REGIMES.LIQUIDITY_VACUUM]: {
    allowedSetupFamilies: ["protective_exit_review", "vwap_reclaim"],
    blockedSetupFamilies: ["breakout", "range_grid", "market_chase"],
    sizeMultiplier: 0.42,
    confidencePenalty: 0.22,
    reason: "Weak depth or unstable spreads increase execution and false-breakout risk."
  },
  [CRYPTO_MARKET_REGIMES.CRASH_RISK]: {
    allowedSetupFamilies: ["protective_exit_review", "risk_off_observe"],
    blockedSetupFamilies: ["breakout", "trend_following", "range_grid", "mean_reversion"],
    sizeMultiplier: 0.25,
    confidencePenalty: 0.32,
    reason: "Crash-risk conditions require conservative diagnostics and protection-first posture."
  },
  [CRYPTO_MARKET_REGIMES.NEWS_SHOCK]: {
    allowedSetupFamilies: ["protective_exit_review", "risk_off_observe"],
    blockedSetupFamilies: ["breakout", "trend_following", "range_grid", "mean_reversion"],
    sizeMultiplier: 0.3,
    confidencePenalty: 0.3,
    reason: "News shock conditions require caution until event risk decays."
  }
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : fallback;
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function deriveSignals({
  marketState = {},
  trendState = {},
  leadershipContext = {},
  volatilitySummary = {},
  orderbookDelta = {},
  universeSummary = {},
  newsSummary = {},
  derivativesContext = {},
  features = {}
} = {}) {
  const leader = text(
    leadershipContext.leader ||
      leadershipContext.leadingAsset ||
      leadershipContext.marketLeader ||
      leadershipContext.dominantAsset ||
      universeSummary.leader
  );
  const btcLeadership = finite(leadershipContext.btcLeadershipScore ?? leadershipContext.btcStrength ?? leadershipContext.btcRelativeStrength, 0);
  const ethLeadership = finite(leadershipContext.ethLeadershipScore ?? leadershipContext.ethStrength ?? leadershipContext.ethRelativeStrength, 0);
  const altRotation = finite(universeSummary.altRotationScore ?? universeSummary.rotationScore ?? leadershipContext.altRotationScore, 0);
  const altBreadth = finite(universeSummary.altBreadthScore ?? universeSummary.breadthScore ?? marketState.altBreadthScore, 0);
  const trendStrength = finite(trendState.trendStrength ?? trendState.trendScore ?? marketState.trendStrength ?? features.trendStrength, 0);
  const trendDirection = text(trendState.direction ?? trendState.trendDirection ?? marketState.trendDirection);
  const choppiness = finite(features.choppinessIndex ?? marketState.choppinessIndex ?? marketState.choppiness ?? trendState.choppiness, 50);
  const volatilityStress = finite(volatilitySummary.stressScore ?? volatilitySummary.volatilityStress ?? marketState.volatilityStress, 0);
  const crashRisk = finite(marketState.crashRiskScore ?? marketState.crashRisk ?? volatilitySummary.crashRiskScore, 0);
  const riskOff = finite(marketState.riskOffScore ?? marketState.riskOff ?? leadershipContext.riskOffScore, 0);
  const spreadBps = finite(orderbookDelta.spreadBps ?? marketState.spreadBps ?? features.spreadBps, 0);
  const depthConfidence = finite(orderbookDelta.depthConfidence ?? orderbookDelta.bookDepthConfidence ?? marketState.depthConfidence, 0.7);
  const bookThinness = finite(orderbookDelta.thinBookScore ?? orderbookDelta.liquidityVacuumScore ?? marketState.liquidityVacuumScore, 0);
  const liquidationRisk = finite(derivativesContext.liquidationRisk?.score ?? derivativesContext.liquidationRisk ?? marketState.liquidationRiskScore, 0);
  const newsRisk = finite(newsSummary.shockLevel ?? newsSummary.newsShockScore ?? newsSummary.riskScore ?? marketState.newsRiskScore, 0);

  return {
    leader,
    btcLeadership,
    ethLeadership,
    altRotation,
    altBreadth,
    trendStrength,
    trendDirection,
    choppiness,
    volatilityStress,
    crashRisk,
    riskOff,
    spreadBps,
    depthConfidence,
    bookThinness,
    liquidationRisk,
    newsRisk,
    explicitNewsShock: bool(newsSummary.activeShock ?? newsSummary.manualReviewRecommended ?? marketState.newsShock),
    explicitCrashRisk: bool(marketState.crashRiskActive ?? volatilitySummary.crashRiskActive),
    explicitLiquidityVacuum: bool(orderbookDelta.liquidityVacuum ?? marketState.liquidityVacuum)
  };
}

function selectRegime(signals) {
  if (signals.explicitNewsShock || signals.newsRisk >= 0.78) {
    return CRYPTO_MARKET_REGIMES.NEWS_SHOCK;
  }
  if (signals.explicitCrashRisk || signals.crashRisk >= 0.72 || signals.riskOff >= 0.78 || (signals.volatilityStress >= 0.82 && signals.liquidationRisk >= 0.55)) {
    return CRYPTO_MARKET_REGIMES.CRASH_RISK;
  }
  if (
    signals.explicitLiquidityVacuum ||
    signals.bookThinness >= 0.7 ||
    signals.depthConfidence <= 0.28 ||
    signals.spreadBps >= 45
  ) {
    return CRYPTO_MARKET_REGIMES.LIQUIDITY_VACUUM;
  }
  if ((signals.leader === "btc" || signals.leader === "btcusdt" || signals.btcLeadership >= 0.62) && signals.trendStrength >= 0.5 && signals.riskOff < 0.58) {
    return CRYPTO_MARKET_REGIMES.BTC_LED_TREND;
  }
  if ((signals.leader === "eth" || signals.leader === "ethusdt" || signals.ethLeadership >= 0.62) && signals.trendStrength >= 0.5 && signals.riskOff < 0.58) {
    return CRYPTO_MARKET_REGIMES.ETH_LED_TREND;
  }
  if ((signals.altRotation >= 0.62 || signals.altBreadth >= 0.64) && signals.riskOff < 0.55 && signals.volatilityStress < 0.75) {
    return CRYPTO_MARKET_REGIMES.ALT_ROTATION;
  }
  return CRYPTO_MARKET_REGIMES.RANGE_CHOP;
}

function buildWarnings(signals, input) {
  const warnings = [];
  if (!input || Object.keys(input).length === 0) {
    warnings.push("missing_crypto_regime_inputs");
  }
  if (!input?.marketState) {
    warnings.push("missing_market_state");
  }
  if (!input?.trendState) {
    warnings.push("missing_trend_state");
  }
  if (!input?.leadershipContext) {
    warnings.push("missing_leadership_context");
  }
  if (!input?.orderbookDelta) {
    warnings.push("missing_orderbook_delta");
  }
  if (signals.spreadBps >= 45) {
    warnings.push("spread_extreme");
  }
  if (signals.depthConfidence <= 0.28) {
    warnings.push("depth_confidence_low");
  }
  if (signals.choppiness >= 65) {
    warnings.push("choppiness_high");
  }
  return [...new Set(warnings)];
}

export function routeCryptoMarketRegime(input = {}) {
  const signals = deriveSignals(input);
  const regime = selectRegime(signals);
  const routing = DEFAULT_ROUTING[regime] || DEFAULT_ROUTING[CRYPTO_MARKET_REGIMES.RANGE_CHOP];
  const warnings = buildWarnings(signals, input);
  const indicatorRegimeSummary = scoreIndicatorRegimeFit({
    features: input.features || {},
    regime: regime.includes("trend") ? "trend" : regime === CRYPTO_MARKET_REGIMES.RANGE_CHOP ? "range" : regime,
    setupType: routing.allowedSetupFamilies[0] || "unknown"
  });
  const confidencePenalty = clamp(routing.confidencePenalty + finite(indicatorRegimeSummary.confidencePenalty, 0) * 0.45, 0, 0.75);
  const sizeMultiplier = clamp(routing.sizeMultiplier * finite(indicatorRegimeSummary.sizeHintMultiplier, 1), 0.15, 1);
  const degraded = warnings.some((item) => item.startsWith("missing_"));

  return {
    status: degraded ? "degraded" : "ready",
    regime,
    allowedSetupFamilies: [...routing.allowedSetupFamilies],
    blockedSetupFamilies: [...routing.blockedSetupFamilies],
    sizeMultiplier,
    confidencePenalty,
    confidence: clamp(1 - confidencePenalty - (degraded ? 0.18 : 0), 0, 1),
    warnings: [...new Set([...warnings, ...indicatorRegimeSummary.warnings])],
    reasons: [routing.reason],
    indicatorRegimeSummary,
    diagnosticsOnly: true,
    shadowOnly: true,
    hardSafetyUnchanged: true,
    entryPermissionChanged: false,
    signals: {
      leader: signals.leader || "unknown",
      btcLeadership: signals.btcLeadership,
      ethLeadership: signals.ethLeadership,
      altRotation: signals.altRotation,
      altBreadth: signals.altBreadth,
      trendStrength: signals.trendStrength,
      choppiness: signals.choppiness,
      volatilityStress: signals.volatilityStress,
      crashRisk: signals.crashRisk,
      riskOff: signals.riskOff,
      spreadBps: signals.spreadBps,
      depthConfidence: signals.depthConfidence,
      bookThinness: signals.bookThinness,
      liquidationRisk: signals.liquidationRisk,
      newsRisk: signals.newsRisk
    }
  };
}

export function buildCryptoRegimeRouterSummary(input = {}) {
  return routeCryptoMarketRegime(input);
}
