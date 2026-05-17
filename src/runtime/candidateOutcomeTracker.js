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

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "") ?? null;
}

function text(value, fallback = null) {
  return typeof value === "string" && value.trim().length ? value.trim() : fallback;
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

function resolveDataLineage(decision = {}) {
  const lineage = decision.dataLineage ||
    decision.inputLineage ||
    decision.sourceLineage ||
    decision.learningLineage ||
    {};
  const marketSnapshot = decision.marketSnapshot || decision.market || {};
  const featureSnapshot = decision.featureSnapshot || decision.features || {};
  return {
    decisionCreatedAt: text(firstDefined(decision.createdAt, decision.timestamp, decision.at)),
    marketDataAt: text(firstDefined(
      lineage.marketDataAt,
      lineage.marketUpdatedAt,
      decision.marketDataAt,
      decision.marketUpdatedAt,
      marketSnapshot.updatedAt,
      marketSnapshot.at
    )),
    featureDataAt: text(firstDefined(
      lineage.featureDataAt,
      lineage.featuresAt,
      decision.featureDataAt,
      decision.featuresAt,
      featureSnapshot.updatedAt,
      featureSnapshot.at
    )),
    orderBookAt: text(firstDefined(lineage.orderBookAt, decision.orderBookAt, decision.orderBook?.updatedAt, decision.orderBook?.lastUpdateAt)),
    newsAt: text(firstDefined(lineage.newsAt, decision.newsAt, decision.newsSummary?.updatedAt)),
    sentimentAt: text(firstDefined(lineage.sentimentAt, decision.sentimentAt, decision.sentimentSummary?.updatedAt)),
    featuresHash: text(firstDefined(lineage.featuresHash, lineage.featureHash, decision.featuresHash, decision.featureHash)),
    configHash: text(firstDefined(lineage.configHash, decision.configHash, decision.configSnapshotHash)),
    modelVersion: text(firstDefined(lineage.modelVersion, decision.modelVersion, decision.modelSummary?.version)),
    sources: unique([
      ...arr(lineage.sources),
      lineage.source,
      decision.source,
      marketSnapshot.source,
      featureSnapshot.source
    ])
  };
}

function resolveDataQuality(decision = {}) {
  const freshness = decision.candidateFreshness || decision.freshness || {};
  const diagnostics = decision.entryDiagnostics || {};
  return {
    dataFreshnessStatus: text(firstDefined(freshness.dataFreshnessStatus, decision.dataFreshnessStatus), "unknown"),
    marketDataAgeMs: finite(firstDefined(freshness.marketDataAgeMs, decision.marketDataAgeMs, diagnostics.marketDataAgeMs)),
    featureAgeMs: finite(firstDefined(freshness.featureAgeMs, decision.featureAgeMs, diagnostics.featureAgeMs)),
    spreadBps: finite(firstDefined(decision.spreadBps, diagnostics.spreadBps, decision.marketSnapshot?.spreadBps)),
    slippageBps: finite(firstDefined(decision.slippageBps, diagnostics.slippageBps)),
    probability: finite(decision.probability),
    threshold: finite(decision.threshold),
    expectedNetEdgePct: finite(firstDefined(decision.expectedNetEdgePct, decision.netEdgePct, decision.edgePct)),
    setupQuality: finite(firstDefined(decision.setupQuality, decision.qualityScore, decision.strategySummary?.setupQuality))
  };
}

function learningWeightFor({ hardSafetyReasons = [], dataLineage = {}, dataQuality = {} } = {}) {
  if (arr(hardSafetyReasons).length) return 0;
  let weight = 1;
  const freshness = `${dataQuality.dataFreshnessStatus || ""}`.toLowerCase();
  if (["stale", "expired"].includes(freshness)) weight *= 0.5;
  const marketDataAgeMs = finite(dataQuality.marketDataAgeMs);
  if (marketDataAgeMs != null && marketDataAgeMs > 300000) weight *= 0.25;
  else if (marketDataAgeMs != null && marketDataAgeMs > 60000) weight *= 0.5;
  if (!dataLineage.marketDataAt) weight *= 0.8;
  if (!dataLineage.featuresHash && !dataLineage.configHash) weight *= 0.85;
  return Math.max(0, Number(weight.toFixed(3)));
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
  const dataLineage = resolveDataLineage(decision);
  const dataQuality = resolveDataQuality(decision);
  const learningWeight = learningWeightFor({ hardSafetyReasons, dataLineage, dataQuality });
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
    dataLineage,
    dataQuality,
    learningWeight,
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
  const lineageCoverage = {
    withMarketDataAt: 0,
    withFeatureDataAt: 0,
    withFeaturesHash: 0,
    withConfigHash: 0,
    staleDataCount: 0,
    missingLineageCount: 0,
    totalLearningWeight: 0
  };

  for (const record of items) {
    const label = record.label || record.outcome || "unknown_veto";
    counts[label] = (counts[label] || 0) + 1;
    if (record.hardSafetyBlocked || arr(record.hardSafetyReasons).length) {
      hardSafetyCount += 1;
    }
    const lineage = record.dataLineage || {};
    const quality = record.dataQuality || {};
    if (lineage.marketDataAt) lineageCoverage.withMarketDataAt += 1;
    if (lineage.featureDataAt) lineageCoverage.withFeatureDataAt += 1;
    if (lineage.featuresHash) lineageCoverage.withFeaturesHash += 1;
    if (lineage.configHash) lineageCoverage.withConfigHash += 1;
    if (["stale", "expired"].includes(`${quality.dataFreshnessStatus || ""}`.toLowerCase())) {
      lineageCoverage.staleDataCount += 1;
    }
    if (!lineage.marketDataAt && !lineage.featureDataAt && !lineage.featuresHash && !lineage.configHash) {
      lineageCoverage.missingLineageCount += 1;
    }
    lineageCoverage.totalLearningWeight += finite(record.learningWeight, 0);
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
    lineageCoverage: {
      ...lineageCoverage,
      averageLearningWeight: items.length ? Number((lineageCoverage.totalLearningWeight / items.length).toFixed(3)) : 0
    },
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
