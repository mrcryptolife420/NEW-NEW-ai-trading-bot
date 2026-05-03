import { average, clamp } from "../utils/math.js";

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function add(list, id, score, reason) {
  if (Math.abs(score) < 0.001) {
    return;
  }
  list.push({ id, score: clamp(score, -1, 1), reason });
}

export function scoreIndicatorRegimeFit({ features = {}, regime = "range", setupType = "unknown" } = {}) {
  const supportingIndicators = [];
  const conflictingIndicators = [];
  const warnings = [];
  const resolvedRegime = `${regime || "range"}`.toLowerCase();
  const resolvedSetup = `${setupType || "unknown"}`.toLowerCase();

  const rsi = num(features.rsi14 ?? features.rsi, 50);
  const mfi = num(features.mfi14 ?? features.mfi, 50);
  const stoch = num(features.stochRsiK ?? features.stochRsi, 50);
  const emaSlope = num(features.emaSlopeScore ?? features.emaTrendSlopePct ?? features.emaSlopeStack?.score, 0);
  const donchian = num(features.donchianBreakoutScore ?? features.structureBreakScore ?? features.bosStrengthScore, 0);
  const choppiness = num(features.choppinessIndex ?? features.choppiness, 50);
  const atrPctile = num(features.atrPercentile?.percentile ?? features.atrPercentile, 0.5);
  const squeezeExpansion = num(features.squeezeExpansionScore ?? features.bollingerKeltnerSqueeze?.expansionScore, 0);
  const cvdDivergence = num(features.cvdDivergenceScore ?? features.orderflowDivergence ?? 0, 0);
  const obvDivergence = features.obvDivergence?.direction || features.obvDivergenceDirection || "none";
  const spreadPctile = num(features.spreadPercentile?.percentile ?? features.spreadPercentile, 0.5);
  const slippageConfidence = num(features.slippageConfidenceScore?.confidence ?? features.slippageConfidenceScore?.score ?? features.slippageConfidence, 0.65);
  const missingFeatureKeys = [
    features.rsi14 ?? features.rsi,
    features.mfi14 ?? features.mfi,
    features.emaSlopeScore ?? features.emaTrendSlopePct ?? features.emaSlopeStack?.score,
    features.donchianBreakoutScore ?? features.structureBreakScore ?? features.bosStrengthScore,
    features.choppinessIndex ?? features.choppiness
  ].filter((value) => value == null).length;

  if (missingFeatureKeys >= 4) {
    warnings.push("indicator_features_sparse");
  }

  if (["range", "mean_reversion"].includes(resolvedRegime) || resolvedSetup.includes("reversion")) {
    const oscillatorFit = average([
      rsi < 38 ? 0.22 : rsi > 68 ? -0.18 : 0.05,
      mfi < 35 ? 0.18 : mfi > 75 ? -0.16 : 0.03,
      stoch < 25 ? 0.14 : stoch > 82 ? -0.12 : 0.02
    ], 0);
    add(oscillatorFit >= 0 ? supportingIndicators : conflictingIndicators, "range_oscillators", oscillatorFit, "RSI/MFI/Stoch RSI carry more weight in range setups.");
  }

  if (["trend", "trend_up", "breakout", "breakout_release"].includes(resolvedRegime) || resolvedSetup.includes("breakout") || resolvedSetup.includes("trend")) {
    add(emaSlope >= 0 ? supportingIndicators : conflictingIndicators, "ema_slope_stack", emaSlope * 0.35, "EMA slope stack supports trend/breakout setups.");
    add(donchian >= 0 ? supportingIndicators : conflictingIndicators, "donchian_bos", donchian * 0.3, "Donchian/BOS confirmation supports expansion setups.");
  }

  if (resolvedSetup.includes("breakout") && choppiness >= 62) {
    add(conflictingIndicators, "high_choppiness", -0.22, "High choppiness lowers breakout confidence.");
  }
  if (atrPctile >= 0.9) {
    warnings.push("atr_percentile_extreme");
    add(conflictingIndicators, "extreme_atr_percentile", -0.18, "Extreme ATR percentile should lower entry confidence and size.");
  }
  if (squeezeExpansion > 0.35) {
    warnings.push("squeeze_expansion_watch_only");
    add(supportingIndicators, "squeeze_expansion", 0.12, "Squeeze expansion is a breakout watch signal, not automatic entry permission.");
  }
  if (cvdDivergence > 0.4 || obvDivergence === "bearish") {
    warnings.push("orderflow_divergence_conflict");
    add(conflictingIndicators, "orderflow_divergence", -0.16, "CVD/OBV divergence conflicts with continuation quality.");
  } else if (obvDivergence === "bullish") {
    add(supportingIndicators, "obv_bullish_divergence", 0.08, "OBV bullish divergence supports reclaim/reversion diagnostics.");
  }
  if (spreadPctile >= 0.85) {
    warnings.push("spread_percentile_high");
    add(conflictingIndicators, "spread_percentile", -0.12, "High spread percentile lowers execution confidence.");
  }
  if (slippageConfidence < 0.4) {
    warnings.push("slippage_confidence_low");
    add(conflictingIndicators, "slippage_confidence", -0.12, "Weak slippage confidence lowers execution confidence.");
  }

  const supportScore = supportingIndicators.reduce((total, item) => total + Math.max(0, item.score), 0);
  const conflictScore = conflictingIndicators.reduce((total, item) => total + Math.abs(Math.min(0, item.score)), 0);
  const confidencePenalty = clamp(
    conflictScore * 0.28 +
      (atrPctile >= 0.9 ? 0.08 : 0) +
      (spreadPctile >= 0.85 ? 0.05 : 0) +
      (slippageConfidence < 0.4 ? 0.05 : 0) +
      (missingFeatureKeys >= 4 ? 0.04 : 0),
    0,
    0.45
  );
  const sizeHintMultiplier = clamp(
    1 -
      conflictScore * 0.35 -
      (atrPctile >= 0.9 ? 0.2 : 0) -
      (spreadPctile >= 0.85 ? 0.1 : 0) -
      (slippageConfidence < 0.4 ? 0.1 : 0),
    0.35,
    1
  );
  return {
    score: clamp(0.5 + supportScore - conflictScore, 0, 1),
    supportingIndicators: supportingIndicators.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 8),
    conflictingIndicators: conflictingIndicators.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 8),
    warnings,
    sizeHintMultiplier,
    confidencePenalty
  };
}
