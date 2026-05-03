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

  const supportScore = supportingIndicators.reduce((total, item) => total + Math.max(0, item.score), 0);
  const conflictScore = conflictingIndicators.reduce((total, item) => total + Math.abs(Math.min(0, item.score)), 0);
  return {
    score: clamp(0.5 + supportScore - conflictScore, 0, 1),
    supportingIndicators: supportingIndicators.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 8),
    conflictingIndicators: conflictingIndicators.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 8),
    warnings
  };
}
