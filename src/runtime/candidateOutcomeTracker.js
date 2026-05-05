import { isHardSafetyReason, classifyReasonCategory } from "../risk/reasonRegistry.js";
import { buildVetoObservation, labelVetoOutcome } from "./vetoOutcome.js";

const DEFAULT_HORIZONS_MINUTES = [15, 60, 240];

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function unique(values) {
  return [...new Set(arr(values).filter((value) => typeof value === "string" && value.length))];
}

function resolveReasons(decision = {}) {
  return unique([
    ...arr(decision.reasons),
    ...arr(decision.blockerReasons),
    ...arr(decision.riskVerdict?.rejections).map((item) => item?.code),
    decision.rootBlocker,
    decision.primaryRootBlocker,
    decision.primaryReason
  ]);
}

function resolveStrategyFamily(decision = {}) {
  return decision.strategySummary?.family ||
    decision.strategy?.family ||
    decision.strategyFamily ||
    decision.family ||
    null;
}

function resolveStrategy(decision = {}) {
  return decision.strategySummary?.activeStrategy ||
    decision.strategy?.activeStrategy ||
    decision.strategyId ||
    decision.strategy ||
    null;
}

function resolveRegime(decision = {}) {
  return decision.regimeSummary?.regime ||
    decision.regime ||
    decision.marketRegime ||
    null;
}

function resolveFeatureQuality(decision = {}) {
  return decision.featureQuality ||
    decision.dataQuality ||
    decision.candidateQuality ||
    decision.entryDiagnostics?.featureQuality ||
    null;
}

function pathFromCandles({ observation = {}, futureCandles = [], horizonMinutes = null } = {}) {
  const candles = arr(futureCandles)
    .filter((candle) => finite(candle?.close ?? candle?.price) != null)
    .slice();
  const entryPrice = finite(observation.referencePrice, null) ||
    finite(candles[0]?.open ?? candles[0]?.close ?? candles[0]?.price, null);
  if (entryPrice == null || entryPrice <= 0 || !candles.length) {
    return null;
  }
  let maxHigh = entryPrice;
  let minLow = entryPrice;
  for (const candle of candles) {
    maxHigh = Math.max(maxHigh, finite(candle.high, finite(candle.close ?? candle.price, entryPrice)));
    minLow = Math.min(minLow, finite(candle.low, finite(candle.close ?? candle.price, entryPrice)));
  }
  const finalClose = finite(candles[candles.length - 1]?.close ?? candles[candles.length - 1]?.price, entryPrice);
  return {
    maxFavorableMovePct: (maxHigh - entryPrice) / entryPrice,
    maxAdverseMovePct: (minLow - entryPrice) / entryPrice,
    closeReturnPct: (finalClose - entryPrice) / entryPrice,
    horizonMinutes: finite(horizonMinutes, finite(candles.length, 0))
  };
}

export function buildCandidateOutcomeObservations(decision = {}, {
  horizonsMinutes = DEFAULT_HORIZONS_MINUTES,
  createdAt = null
} = {}) {
  const observation = buildVetoObservation(decision);
  const reasons = resolveReasons(decision);
  const hardSafetyReasons = reasons.filter(isHardSafetyReason);
  const blockerFamily = classifyReasonCategory(observation.rootBlocker || reasons[0] || "unknown");
  return arr(horizonsMinutes).map((horizonMinutes) => ({
    observationId: `${observation.id || observation.symbol || "candidate"}::${horizonMinutes}m`,
    decisionId: observation.id,
    symbol: observation.symbol,
    horizonMinutes: finite(horizonMinutes, 0),
    dueAt: createdAt || observation.createdAt || null,
    observation,
    blocker: observation.rootBlocker || reasons[0] || null,
    blockerFamily,
    reasons,
    hardSafetyReasons,
    hardSafetyBlocked: hardSafetyReasons.length > 0,
    strategy: resolveStrategy(decision),
    strategyFamily: resolveStrategyFamily(decision),
    regime: resolveRegime(decision),
    featureQuality: resolveFeatureQuality(decision),
    learningEligible: hardSafetyReasons.length === 0,
    relaxationAllowed: false
  }));
}

export function labelCandidateOutcome({
  observation = {},
  futureMarketPath = null,
  futureCandles = null
} = {}) {
  const path = futureMarketPath || pathFromCandles({
    observation: observation.observation || observation,
    futureCandles,
    horizonMinutes: observation.horizonMinutes
  });
  const veto = labelVetoOutcome({
    observation: observation.observation || observation,
    futureMarketPath: path || {}
  });
  const hardSafetyBlocked = Boolean(observation.hardSafetyBlocked || arr(observation.hardSafetyReasons).length);
  return {
    ...observation,
    outcome: veto.label,
    label: veto.label,
    confidence: veto.confidence,
    outcomeReasons: veto.reasons,
    futureMarketPath: path,
    learningEligible: Boolean(observation.learningEligible && !hardSafetyBlocked),
    relaxationAllowed: false,
    hardSafetyBlocked
  };
}

export function summarizeCandidateOutcomes(records = []) {
  const items = arr(records);
  const counts = {
    good_veto: 0,
    bad_veto: 0,
    neutral_veto: 0,
    unknown_veto: 0
  };
  let hardSafetyCount = 0;
  const badVetoByBlocker = new Map();
  const missedWinners = [];

  for (const record of items) {
    const label = record.label || record.outcome || "unknown_veto";
    counts[label] = (counts[label] || 0) + 1;
    if (record.hardSafetyBlocked || arr(record.hardSafetyReasons).length) {
      hardSafetyCount += 1;
    }
    if (label === "bad_veto") {
      const key = record.blocker || "unknown";
      const current = badVetoByBlocker.get(key) || { blocker: key, count: 0, strategyFamilies: new Set(), regimes: new Set() };
      current.count += 1;
      if (record.strategyFamily) current.strategyFamilies.add(record.strategyFamily);
      if (record.regime) current.regimes.add(record.regime);
      badVetoByBlocker.set(key, current);
      missedWinners.push({
        decisionId: record.decisionId,
        symbol: record.symbol,
        horizonMinutes: record.horizonMinutes,
        blocker: record.blocker,
        strategyFamily: record.strategyFamily,
        regime: record.regime,
        confidence: finite(record.confidence, 0)
      });
    }
  }

  return {
    status: items.length ? "ready" : "empty",
    count: items.length,
    counts,
    hardSafetyCount,
    hardSafetyRelaxationAllowed: false,
    missedWinnerSummary: {
      count: counts.bad_veto || 0,
      top: missedWinners.sort((left, right) => right.confidence - left.confidence).slice(0, 10)
    },
    badVetoSummary: {
      count: counts.bad_veto || 0,
      byBlocker: [...badVetoByBlocker.values()]
        .map((item) => ({
          blocker: item.blocker,
          count: item.count,
          strategyFamilies: [...item.strategyFamilies],
          regimes: [...item.regimes]
        }))
        .sort((left, right) => right.count - left.count)
    }
  };
}

export function buildCandidateOutcomeTrackerSummary({
  decisions = [],
  outcomes = [],
  horizonsMinutes = DEFAULT_HORIZONS_MINUTES
} = {}) {
  const queuedObservations = arr(decisions).flatMap((decision) =>
    buildCandidateOutcomeObservations(decision, { horizonsMinutes })
  );
  const summary = summarizeCandidateOutcomes(outcomes);
  return {
    status: queuedObservations.length || summary.count ? "ready" : "empty",
    queuedCount: queuedObservations.length,
    horizonsMinutes: arr(horizonsMinutes),
    queuedObservations,
    ...summary
  };
}

export const CANDIDATE_OUTCOME_TRACKER_VERSION = 1;
