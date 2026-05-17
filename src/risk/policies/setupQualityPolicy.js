import { clamp } from "../../utils/math.js";

function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

function getStrategyFitGuardFloor(strategySummary = {}, botMode = "paper") {
  const activeStrategy = strategySummary.activeStrategy || "";
  const family = strategySummary.family || "";
  if (botMode === "paper") {
    if (activeStrategy === "liquidity_sweep") return 0.46;
    if (activeStrategy === "orderbook_imbalance") return 0.4;
    if (activeStrategy === "range_grid_reversion" || family === "range_grid") return 0.48;
    if (["zscore_reversion", "vwap_reversion"].includes(activeStrategy) || family === "mean_reversion") return 0.47;
  }
  return 0.5;
}

function normalizeRelativeStrength(relativeStrength = 0) {
  return clamp((safeValue(relativeStrength, 0) + 0.01) / 0.03, 0, 1);
}

export function buildSetupQualityAssessment({
  config = {},
  score = {},
  threshold = 0,
  strategySummary = {},
  signalQualitySummary = {},
  confidenceBreakdown = {},
  dataQualitySummary = {},
  acceptanceQuality = 0,
  replenishmentQuality = 0,
  relativeStrengthComposite = 0,
  leadershipTailwindScore = 0.5,
  lateFollowerRisk = 0,
  copycatBreakoutRisk = 0,
  downsideVolDominance = 0,
  timeframeSummary = {},
  pairHealthSummary = {},
  venueConfirmationSummary = {},
  marketConditionSummary = {},
  marketStateSummary = {},
  regimeSummary = {}
} = {}) {
  const edgeToThreshold = safeValue(score.probability, 0) - safeValue(threshold, 0);
  const strategyFit = safeValue(strategySummary.fitScore, 0);
  const strategyFitGuardFloor = getStrategyFitGuardFloor(strategySummary, config.botMode || "paper");
  const strategyBlockerCount = Array.isArray(strategySummary.blockers) ? strategySummary.blockers.length : 0;
  const relativeStrengthScore = normalizeRelativeStrength(relativeStrengthComposite);
  const conditionConfidence = clamp(safeValue(marketConditionSummary.conditionConfidence, 0.5), 0, 1);
  const conditionRisk = clamp(safeValue(marketConditionSummary.conditionRisk, 0.5), 0, 1);
  const hostilePhase = ["late_crowded", "late_distribution"].includes(marketStateSummary.phase || "");
  const hostileRegime = ["high_vol", "breakout"].includes(regimeSummary.regime || "");
  const strategyContextPenalty = strategyBlockerCount ? Math.min(0.12, 0.04 + strategyBlockerCount * 0.02) : 0;
  const strategyFitPenalty = Math.max(0, strategyFitGuardFloor - strategyFit) * 0.12;
  const qualityScore = clamp(
    0.14 +
      Math.max(0, edgeToThreshold + 0.03) * 2.4 * 0.16 +
      strategyFit * 0.17 +
      safeValue(signalQualitySummary.overallScore, 0) * 0.16 +
      safeValue(confidenceBreakdown.overallConfidence, 0) * 0.14 +
      safeValue(dataQualitySummary.overallScore, 0) * 0.1 +
      clamp(acceptanceQuality, 0, 1) * 0.08 +
      clamp(replenishmentQuality, 0, 1) * 0.06 +
      relativeStrengthScore * 0.05 +
      clamp(leadershipTailwindScore, 0, 1) * 0.04 +
      safeValue(timeframeSummary.alignmentScore, 0) * 0.05 +
      conditionConfidence * 0.04 +
      safeValue(pairHealthSummary.score, 0.5) * 0.04 +
      Math.max(0, 1 - conditionRisk) * 0.03 -
      Math.max(0, conditionRisk - 0.48) * 0.06 -
      clamp(lateFollowerRisk, 0, 1) * 0.06 -
      clamp(copycatBreakoutRisk, 0, 1) * 0.05 -
      Math.max(0, downsideVolDominance) * 0.08 -
      strategyFitPenalty -
      strategyContextPenalty -
      (hostilePhase ? 0.06 : 0) -
      (hostileRegime ? 0.03 : 0) -
      ((venueConfirmationSummary.status || "") === "blocked" ? 0.08 : 0),
    0,
    1
  );
  const cautionScore = safeValue(config.tradeQualityCautionScore, 0.58);
  const minScore = safeValue(config.tradeQualityMinScore, 0.47);
  let tier = qualityScore >= 0.72 ? "elite" : qualityScore >= cautionScore ? "good" : qualityScore >= minScore ? "watch" : "weak";
  if (strategyBlockerCount > 0 || strategyFit < strategyFitGuardFloor) {
    tier = tier === "elite" || tier === "good" ? "watch" : tier;
  }
  if (strategyBlockerCount >= 2 && strategyFit < Math.max(0.18, strategyFitGuardFloor - 0.08)) {
    tier = "weak";
  }
  return {
    score: num(qualityScore, 4),
    tier,
    edgeToThreshold: num(edgeToThreshold, 4),
    relativeStrengthScore: num(relativeStrengthScore, 4),
    hostilePhase,
    hostileRegime,
    regimeFit: num(strategyFit, 4),
    strategyFitGuardFloor: num(strategyFitGuardFloor, 4),
    strategyBlockerCount,
    conditionConfidence: num(conditionConfidence, 4),
    conditionRisk: num(conditionRisk, 4),
    signalQuality: num(safeValue(signalQualitySummary.overallScore, 0), 4),
    executionReadiness: num(safeValue(confidenceBreakdown.executionConfidence, 0), 4),
    acceptanceQuality: num(acceptanceQuality, 4),
    replenishmentQuality: num(replenishmentQuality, 4),
    leadershipTailwindScore: num(leadershipTailwindScore, 4),
    lateFollowerRisk: num(lateFollowerRisk, 4),
    copycatBreakoutRisk: num(copycatBreakoutRisk, 4)
  };
}
