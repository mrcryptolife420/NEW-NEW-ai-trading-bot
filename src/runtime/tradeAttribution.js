import { buildTradeQualityReview } from "./reportBuilder.js";
import { featureGroup } from "../strategy/featureGovernance.js";
import { clamp } from "../utils/math.js";

const ATTRIBUTION_CATEGORIES = [
  "good_trade",
  "timing_problem",
  "regime_problem",
  "data_problem",
  "execution_problem",
  "risk_problem",
  "exit_problem",
  "mixed_problem",
  "uncertain"
];

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCategory(value) {
  return ATTRIBUTION_CATEGORIES.includes(value) ? value : "uncertain";
}

function topFeatureGroups(rawFeatures = {}, limit = 6) {
  const groups = new Map();
  for (const [name, rawValue] of Object.entries(rawFeatures || {})) {
    if (!Number.isFinite(rawValue)) {
      continue;
    }
    const group = featureGroup(name);
    const current = groups.get(group) || { group, weight: 0, featureCount: 0 };
    current.weight += Math.abs(rawValue);
    current.featureCount += 1;
    groups.set(group, current);
  }
  return [...groups.values()]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, limit)
    .map((item) => ({
      group: item.group,
      weight: num(item.weight),
      featureCount: item.featureCount
    }));
}

function buildScoreMap(trade = {}, review = {}) {
  const rationale = trade.entryRationale || {};
  const exitIntelligence = trade.exitIntelligenceSummary || {};
  const dataQuality = rationale.dataQuality || trade.dataQualitySummary || {};
  const signalEdge = safeNumber(rationale.probability, trade.probabilityAtEntry || 0.5) - safeNumber(rationale.threshold, 0.5);
  const executionQuality = clamp(safeNumber(trade.executionQualityScore, 0.5), 0, 1);
  const slippageDeltaBps = safeNumber(trade.entryExecutionAttribution?.slippageDeltaBps, 0);
  const captureEfficiency = clamp(safeNumber(trade.captureEfficiency, 0), -1, 1);
  const netPnlPct = safeNumber(trade.netPnlPct, 0);
  const pnlQuote = safeNumber(trade.pnlQuote, 0);
  const labelScore = clamp(safeNumber(trade.labelScore, 0.5), 0, 1);
  const dataConfidence = clamp(
    Math.max(
      safeNumber(dataQuality.overallScore, 0),
      safeNumber(dataQuality.trustScore, 0),
      safeNumber(rationale.confidenceBreakdown?.dataConfidence, 0)
    ) || 0.5,
    0,
    1
  );
  const structureFit = clamp(
    Math.max(
      safeNumber(rationale.strategy?.fitScore, 0),
      safeNumber(review.setupScore, 0),
      safeNumber(rationale.marketState?.dataConfidence, 0)
    ) || 0.5,
    0,
    1
  );
  const regimeConfidence = clamp(
    Math.max(
      safeNumber(rationale.regimeSummary?.confidence, 0),
      safeNumber(rationale.marketCondition?.conditionConfidence, 0)
    ) || 0.5,
    0,
    1
  );
  const riskPenalty = clamp(
    Math.max(
      safeNumber(rationale.marketCondition?.conditionRisk, 0),
      safeNumber(trade.adverseHeatScore, 0),
      Math.max(0, Math.abs(safeNumber(trade.maePct, 0)) * 18)
    ),
    0,
    1
  );
  const paperOutcome = trade.paperLearningOutcome?.outcome || null;
  const exitQuality = trade.paperLearningOutcome?.exitQuality || null;
  const riskQuality = trade.paperLearningOutcome?.riskQuality || null;
  const contextualExitReason = exitIntelligence.contextualPrimaryReason || exitIntelligence.reason || null;
  const structureDeterioration = clamp(safeNumber(exitIntelligence.structureDeterioration, 0), 0, 1);
  const executionFragility = clamp(safeNumber(exitIntelligence.executionFragility, 0), 0, 1);
  const timeDecayScore = clamp(safeNumber(exitIntelligence.timeDecayScore, 0), 0, 1);
  const executionDominancePenalty = executionQuality < 0.3 || slippageDeltaBps >= 5 ? 0.45 : 1;
  const positiveOutcomeScore = clamp(0.5 + Math.max(0, netPnlPct) * 18, 0, 1);
  const captureOutcomeScore = clamp(0.5 + captureEfficiency * 0.45, 0, 1);
  const negativeOutcomePenalty = pnlQuote < 0 || netPnlPct < 0
    ? clamp(Math.abs(Math.min(netPnlPct, 0)) * 18 + (captureEfficiency < 0 ? Math.abs(captureEfficiency) * 0.16 : 0), 0, 0.34)
    : 0;
  const exitDrag = clamp(
    Math.max(
      exitQuality === "weak" ? 0.8 : 0,
      paperOutcome === "early_exit" ? 0.75 : 0,
      paperOutcome === "late_exit" ? 0.72 : 0,
      review.verdict === "follow_through_failed" ? 0.58 : 0,
      captureEfficiency < 0.2 && safeNumber(trade.mfePct, 0) >= 0.01 ? 0.64 : 0
    ),
    0,
    1
  );

  return {
    good_trade: clamp(
      labelScore * 0.42 +
      executionQuality * 0.18 +
      positiveOutcomeScore * 0.14 +
      captureOutcomeScore * 0.1 +
      dataConfidence * 0.08 +
      Math.max(0, signalEdge) * 1.9 * 0.08 +
      regimeConfidence * 0.06 -
      negativeOutcomePenalty,
      0,
      1
    ),
    timing_problem: clamp(
      Math.max(0, safeNumber(trade.mfePct, 0) - Math.max(0, safeNumber(trade.netPnlPct, 0))) * 18 * 0.5 +
      (review.verdict === "follow_through_failed" ? 0.24 : 0) +
      (captureEfficiency < 0.3 && safeNumber(trade.mfePct, 0) >= 0.012 ? 0.2 : 0) +
      (signalEdge < 0.01 && structureFit >= 0.55 ? 0.12 : 0),
      0,
      1
    ),
    regime_problem: clamp(
      (regimeConfidence < 0.45 ? 0.24 : 0) +
      safeNumber(rationale.marketCondition?.conditionRisk, 0) * 0.34 +
      (review.verdict === "weak_setup" && structureFit < 0.48 ? 0.22 : 0) +
      ((trade.regimeAtEntry || rationale.regimeSummary?.regime || "") === "high_vol" && (trade.pnlQuote || 0) <= 0 ? 0.14 : 0),
      0,
      1
    ),
    data_problem: clamp(
      (dataQuality.status === "degraded" || dataQuality.status === "missing" ? 0.36 : 0) +
      (dataQuality.degradedButAllowed ? 0.18 : 0) +
      Math.max(0, 0.55 - dataConfidence) * 0.62 +
      ((dataQuality.missingCount || 0) > 0 ? 0.14 : 0),
      0,
      1
    ),
    execution_problem: clamp(
      Math.max(0, 0.54 - executionQuality) * 0.74 +
      Math.max(0, slippageDeltaBps - 2.5) / 8 * 0.22 +
      (review.verdict === "execution_drag" ? 0.24 : 0),
      0,
      1
    ),
    risk_problem: clamp(
      riskPenalty * 0.58 +
      ((trade.pnlQuote || 0) < 0 && Math.abs(safeNumber(trade.maePct, 0)) >= 0.018 ? 0.18 : 0) +
      (riskQuality === "weak" ? 0.22 : 0),
      0,
      1
    ),
    exit_problem: clamp(
      exitDrag * 0.68 * executionDominancePenalty +
      (exitQuality === "weak" ? 0.18 : 0) +
      (["time_stop", "manual_exit"].includes(trade.reason || "") && captureEfficiency < 0.28 ? 0.12 : 0) +
      (contextualExitReason === "edge_time_decay_exit" || timeDecayScore >= 0.64 ? 0.1 : 0) +
      (contextualExitReason === "structure_deterioration_exit" || structureDeterioration >= 0.62 ? 0.08 : 0) +
      (contextualExitReason === "exit_execution_fragility" || executionFragility >= 0.62 ? 0.1 : 0),
      0,
      1
    )
  };
}

function evidenceReasons(trade = {}, review = {}, scores = {}) {
  const reasons = [];
  const dataQuality = trade.entryRationale?.dataQuality || trade.dataQualitySummary || {};
  const exitIntelligence = trade.exitIntelligenceSummary || {};
  if ((scores.good_trade || 0) >= 0.55 && safeNumber(trade.pnlQuote, 0) >= 0 && safeNumber(trade.netPnlPct, 0) >= 0) {
    reasons.push("good_trade_quality");
  }
  if ((scores.timing_problem || 0) >= 0.38) {
    reasons.push("missed_follow_through");
  }
  if ((scores.regime_problem || 0) >= 0.38) {
    reasons.push("regime_fit_soft");
  }
  if ((scores.data_problem || 0) >= 0.38) {
    reasons.push("data_quality_soft");
  }
  if ((scores.execution_problem || 0) >= 0.38) {
    reasons.push("execution_drag");
  }
  if ((scores.risk_problem || 0) >= 0.38) {
    reasons.push("risk_heat_high");
  }
  if ((scores.exit_problem || 0) >= 0.38) {
    reasons.push("exit_capture_soft");
  }
  if ((scores.exit_problem || 0) >= 0.38 && exitIntelligence.contextualPrimaryReason) {
    reasons.push(exitIntelligence.contextualPrimaryReason);
  }
  if (review.verdict) {
    reasons.push(`review_${review.verdict}`);
  }
  if (dataQuality.status && dataQuality.status !== "healthy") {
    reasons.push(`data_${dataQuality.status}`);
  }
  return [...new Set(reasons)].slice(0, 8);
}

function chooseCategory(trade = {}, review = {}, scores = {}) {
  const ranked = Object.entries(scores)
    .sort((left, right) => right[1] - left[1]);
  const [topId, topScore] = ranked[0] || ["uncertain", 0];
  const secondScore = ranked[1]?.[1] || 0;
  const negativeOutcome = safeNumber(trade.pnlQuote, 0) < 0 || safeNumber(trade.netPnlPct, 0) < 0 || safeNumber(trade.captureEfficiency, 0) < 0;
  if (topId === "good_trade" && negativeOutcome) {
    const alternative = ranked.find(([id, score]) => id !== "good_trade" && score >= 0.26);
    if (alternative) {
      return alternative[0];
    }
    if (review.verdict === "acceptable" || review.verdict === "follow_through_failed") {
      return "mixed_problem";
    }
  }
  if (topId === "good_trade" && topScore >= 0.58 && topScore - secondScore >= 0.08) {
    return "good_trade";
  }
  if (topScore < 0.26) {
    return "uncertain";
  }
  if (topScore - secondScore <= 0.06 && secondScore >= 0.24) {
    return "mixed_problem";
  }
  return topId;
}

export function buildTradeLearningAttribution(trade = {}) {
  const review = buildTradeQualityReview(trade);
  const scores = buildScoreMap(trade, review);
  const category = normalizeCategory(chooseCategory(trade, review, scores));
  const topGroups = topFeatureGroups(trade.rawFeatures || {});
  const confidence = clamp(
    Math.max(...Object.values(scores), 0) * 0.72 +
      (category === "mixed_problem" ? 0.08 : 0.16) -
      (category === "uncertain" ? 0.18 : 0),
    0,
    1
  );
  return {
    category,
    confidence: num(confidence),
    reviewVerdict: review.verdict || null,
    labelScore: num(trade.labelScore || 0, 4),
    executionQualityScore: num(trade.executionQualityScore || 0, 4),
    captureEfficiency: num(trade.captureEfficiency || 0, 4),
    featureGroups: topGroups,
    scope: {
      family: trade.strategyFamily || trade.entryRationale?.strategy?.family || null,
      strategy: trade.strategyAtEntry || trade.entryRationale?.strategy?.activeStrategy || null,
      regime: trade.regimeAtEntry || trade.entryRationale?.regimeSummary?.regime || null,
      session: trade.sessionAtEntry || trade.entryRationale?.session?.session || null,
      condition: trade.marketConditionAtEntry || trade.entryRationale?.marketCondition?.conditionId || null
    },
    categoryScores: Object.fromEntries(
      Object.entries(scores).map(([key, value]) => [key, num(value)])
    ),
    reasons: evidenceReasons(trade, review, scores)
  };
}

export function resolveTradeLearningAttribution(trade = {}) {
  const stored = trade.learningAttribution || null;
  const rebuilt = buildTradeLearningAttribution(trade);
  if (!stored?.category) {
    return rebuilt;
  }
  const normalizedStored = summarizeLearningAttribution(stored);
  const negativeOutcome =
    safeNumber(trade.pnlQuote, 0) < 0 ||
    safeNumber(trade.netPnlPct, 0) < 0 ||
    safeNumber(trade.captureEfficiency, 0) < 0;
  if (
    negativeOutcome &&
    normalizedStored.category === "good_trade" &&
    rebuilt.category !== "good_trade"
  ) {
    return {
      ...rebuilt,
      normalizedFromStored: true,
      storedCategory: normalizedStored.category
    };
  }
  return {
    ...rebuilt,
    ...normalizedStored,
    normalizedFromStored: false,
    storedCategory: normalizedStored.category
  };
}

export function backfillTradeLearningAttributions(trades = []) {
  let updatedCount = 0;
  const updatedTrades = arr(trades).map((trade) => {
    const resolved = summarizeLearningAttribution(resolveTradeLearningAttribution(trade));
    const current = summarizeLearningAttribution(trade.learningAttribution || {});
    const changed =
      current.category !== resolved.category ||
      current.reviewVerdict !== resolved.reviewVerdict ||
      current.confidence !== resolved.confidence ||
      JSON.stringify(current.reasons || []) !== JSON.stringify(resolved.reasons || []) ||
      JSON.stringify(current.featureGroups || []) !== JSON.stringify(resolved.featureGroups || []) ||
      JSON.stringify(current.scope || {}) !== JSON.stringify(resolved.scope || {});
    if (!changed) {
      return trade;
    }
    updatedCount += 1;
    return {
      ...trade,
      learningAttribution: {
        category: resolved.category,
        confidence: resolved.confidence,
        reviewVerdict: resolved.reviewVerdict,
        reasons: arr(resolved.reasons || []).slice(0, 6),
        featureGroups: arr(resolved.featureGroups || []).slice(0, 4),
        scope: resolved.scope || {}
      }
    };
  });
  return {
    updatedTrades,
    updatedCount
  };
}

export function summarizeLearningAttribution(attribution = {}) {
  return {
    category: normalizeCategory(attribution.category),
    confidence: num(attribution.confidence || 0),
    reviewVerdict: attribution.reviewVerdict || null,
    reasons: arr(attribution.reasons || []).slice(0, 6),
    featureGroups: arr(attribution.featureGroups || []).slice(0, 4),
    scope: attribution.scope || {},
    normalizedFromStored: Boolean(attribution.normalizedFromStored),
    storedCategory: attribution.storedCategory || null
  };
}
