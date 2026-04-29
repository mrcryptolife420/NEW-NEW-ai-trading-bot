function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

function average(values = [], fallback = 0) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) {
    return fallback;
  }
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSizingFactor(value, fallback = 1) {
  const numeric = safeValue(value, fallback);
  return numeric > 0 ? numeric : fallback;
}

function aggregateSizingGroup({
  id,
  label,
  factors = [],
  softness = 0.55,
  min = 0.2,
  max = 1.2,
  anchorFactor = 1
} = {}) {
  const normalizedFactors = factors
    .map((factor) => ({
      id: factor.id,
      value: normalizeSizingFactor(factor.value, 1),
      effect: num(normalizeSizingFactor(factor.value, 1) - 1, 4)
    }))
    .filter((factor) => Number.isFinite(factor.value));
  if (!normalizedFactors.length) {
    return {
      id,
      label: label || id,
      multiplier: 1,
      averageFactor: 1,
      productFactor: 1,
      dominantDrag: [],
      dominantBoost: [],
      factors: []
    };
  }
  const averageFactor = average(normalizedFactors.map((factor) => factor.value), 1);
  const productFactor = normalizedFactors.reduce((total, factor) => total * factor.value, 1);
  const multiplier = clamp(
    averageFactor * (1 - softness) + productFactor * softness,
    min,
    max
  );
  const normalizedAnchorFactor = normalizeSizingFactor(anchorFactor, 1);
  const anchoredMultiplier = clamp(
    multiplier * normalizedAnchorFactor,
    Math.min(min, normalizedAnchorFactor),
    max
  );
  return {
    id,
    label: label || id,
    multiplier: num(anchoredMultiplier, 4),
    averageFactor: num(averageFactor, 4),
    productFactor: num(productFactor, 4),
    anchorFactor: num(normalizedAnchorFactor, 4),
    dominantDrag: [...normalizedFactors]
      .filter((factor) => factor.value < 1)
      .sort((left, right) => left.value - right.value)
      .slice(0, 3),
    dominantBoost: [...normalizedFactors]
      .filter((factor) => factor.value > 1)
      .sort((left, right) => right.value - left.value)
      .slice(0, 2),
    factors: normalizedFactors
  };
}

export function buildGroupedSizingPlan({
  baseBudget = 0,
  groups = {},
  groupOrder = [],
  allowPaperSoftening = false
} = {}) {
  const orderedEntries = (groupOrder.length ? groupOrder : Object.keys(groups))
    .filter((key) => groups[key]);
  const resolvedGroups = orderedEntries.map((key) => {
    const group = groups[key] || {};
    const baseMin = safeValue(group.min, 0.2);
    const baseMax = safeValue(group.max, 1.2);
    const adjustedMin = allowPaperSoftening && group.paperMin !== undefined
      ? safeValue(group.paperMin, baseMin)
      : baseMin;
    const adjustedSoftness = allowPaperSoftening && group.paperSoftness !== undefined
      ? safeValue(group.paperSoftness, safeValue(group.softness, 0.55))
      : safeValue(group.softness, 0.55);
    return aggregateSizingGroup({
      id: key,
      label: group.label,
      factors: group.factors,
      softness: adjustedSoftness,
      min: adjustedMin,
      max: baseMax,
      anchorFactor: group.anchorFactor
    });
  });
  const combinedMultiplier = resolvedGroups.reduce(
    (total, group) => total * normalizeSizingFactor(group.multiplier, 1),
    1
  );
  return {
    baseBudget: num(baseBudget, 2),
    combinedMultiplier: num(combinedMultiplier, 4),
    rawQuoteAmount: Number.isFinite(baseBudget) ? num(baseBudget * combinedMultiplier, 2) : 0,
    groups: resolvedGroups,
    dominantGroupDrags: [...resolvedGroups]
      .filter((group) => safeValue(group.multiplier, 1) < 1)
      .sort((left, right) => safeValue(left.multiplier, 1) - safeValue(right.multiplier, 1))
      .slice(0, 3)
      .map((group) => ({
        id: group.id,
        label: group.label,
        multiplier: num(group.multiplier, 4),
        dominantDrag: group.dominantDrag
      })),
    dominantGroupBoosts: [...resolvedGroups]
      .filter((group) => safeValue(group.multiplier, 1) > 1)
      .sort((left, right) => safeValue(right.multiplier, 1) - safeValue(left.multiplier, 1))
      .slice(0, 2)
      .map((group) => ({
        id: group.id,
        label: group.label,
        multiplier: num(group.multiplier, 4),
        dominantBoost: group.dominantBoost
      }))
  };
}

export function buildSizingFactorBreakdown({
  sessionSizeMultiplier,
  driftSizeMultiplier,
  selfHealSizeMultiplier,
  metaSizeMultiplier,
  strategyMetaSizeMultiplier,
  venueSizeMultiplier,
  capitalGovernorSizeMultiplier,
  capitalLadderSizeMultiplier,
  retirementSizeMultiplier,
  executionCostSizeMultiplier,
  spotDowntrendPenalty,
  trendStateSizeMultiplier,
  offlineLearningSizeMultiplier,
  groupedSizing = null
}) {
  const sizingFactors = [
    { id: "session", value: sessionSizeMultiplier },
    { id: "drift", value: driftSizeMultiplier },
    { id: "self_heal", value: selfHealSizeMultiplier },
    { id: "meta", value: metaSizeMultiplier },
    { id: "strategy_meta", value: strategyMetaSizeMultiplier },
    { id: "venue", value: venueSizeMultiplier },
    { id: "capital_governor", value: capitalGovernorSizeMultiplier },
    { id: "capital_ladder", value: capitalLadderSizeMultiplier },
    { id: "retirement", value: retirementSizeMultiplier },
    { id: "execution_cost", value: executionCostSizeMultiplier },
    { id: "downtrend", value: spotDowntrendPenalty },
    { id: "trend_state", value: trendStateSizeMultiplier },
    { id: "offline_learning", value: offlineLearningSizeMultiplier }
  ].map((item) => ({
    ...item,
    effect: num((safeValue(item.value, 1) - 1), 4)
  }));
  return {
    dominantSizingDrag: [...sizingFactors]
      .filter((item) => item.value < 1)
      .sort((left, right) => left.value - right.value)
      .slice(0, 3),
    dominantSizingBoost: [...sizingFactors]
      .filter((item) => item.value > 1)
      .sort((left, right) => right.value - left.value)
      .slice(0, 2),
    groupedSizing: groupedSizing
      ? {
        baseBudget: num(groupedSizing.baseBudget, 2),
        combinedMultiplier: num(groupedSizing.combinedMultiplier, 4),
        rawQuoteAmount: num(groupedSizing.rawQuoteAmount, 2),
        dominantGroupDrags: groupedSizing.dominantGroupDrags || [],
        dominantGroupBoosts: groupedSizing.dominantGroupBoosts || [],
        groups: groupedSizing.groups || []
      }
      : null
  };
}
