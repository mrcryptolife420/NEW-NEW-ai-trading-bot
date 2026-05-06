import { buildStrategyEvidenceScorecards } from "./strategyEvidenceScorecard.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function num(value, digits = 4) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : 0;
}

function text(value, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function resolveStrategyId(item = {}) {
  const strategy = item.strategyAtEntry || item.strategy || item.strategySummary || {};
  if (typeof strategy === "string") return strategy;
  return text(strategy.id || strategy.strategy || strategy.activeStrategy || item.strategyId || item.activeStrategy, "unknown_strategy");
}

function resolveFamily(item = {}) {
  const strategy = item.strategyAtEntry || item.strategy || item.strategySummary || {};
  if (typeof strategy === "object") {
    return text(strategy.family || strategy.strategyFamily || item.strategyFamily || item.setupFamily || item.family, "unknown_family");
  }
  return text(item.strategyFamily || item.setupFamily || item.family, "unknown_family");
}

function resolveRegime(item = {}) {
  return text(item.regimeAtEntry || item.regime || item.marketRegime || item.regimeSummary?.regime, "unknown_regime");
}

function resolveSession(item = {}) {
  return text(item.sessionAtEntry || item.session || item.sessionSummary?.session, "unknown_session");
}

function resolveCluster(item = {}) {
  return text(item.symbolCluster || item.cluster || item.sector || item.symbol, "unknown_cluster");
}

function resolveActivationStage(item = {}) {
  return text(item.featureActivationStage || item.activationStage || item.featureActivation?.stage, "diagnostics_only");
}

function cohortKey(scope = {}) {
  return [
    scope.strategyId,
    scope.strategyFamily,
    scope.regime,
    scope.session,
    scope.symbolCluster,
    scope.activationStage
  ].join("|");
}

function buildScope(item = {}) {
  return {
    strategyId: resolveStrategyId(item),
    strategyFamily: resolveFamily(item),
    regime: resolveRegime(item),
    session: resolveSession(item),
    symbolCluster: resolveCluster(item),
    activationStage: resolveActivationStage(item)
  };
}

function ensureCohort(map, item = {}) {
  const scope = buildScope(item);
  const key = cohortKey(scope);
  if (!map.has(key)) {
    map.set(key, {
      id: key,
      ...scope,
      generatedCandidates: 0,
      blockedCandidates: 0,
      closedTrades: 0,
      wins: 0,
      losses: 0,
      badVetoCount: 0,
      goodVetoCount: 0,
      exitQualityCounts: {},
      executionDragValues: [],
      dataQualityWarnings: 0,
      pnlValues: [],
      recommendations: []
    });
  }
  return map.get(key);
}

function isPaper(item = {}) {
  const source = `${item.brokerMode || item.mode || item.source || item.tradeSource || "paper"}`.toLowerCase();
  return !source || source.includes("paper");
}

function addExitQuality(cohort, label) {
  const key = text(label, "unknown_exit_quality");
  cohort.exitQualityCounts[key] = (cohort.exitQualityCounts[key] || 0) + 1;
}

function finalizeCohort(cohort, { minSampleSize = 8 } = {}) {
  const sampleSize = cohort.closedTrades + cohort.generatedCandidates + cohort.badVetoCount + cohort.goodVetoCount;
  const tradeSampleSize = cohort.closedTrades;
  const badVetoRate = cohort.badVetoCount + cohort.goodVetoCount > 0
    ? cohort.badVetoCount / (cohort.badVetoCount + cohort.goodVetoCount)
    : 0;
  const winRate = tradeSampleSize ? cohort.wins / tradeSampleSize : 0;
  const avgPnl = cohort.pnlValues.length
    ? cohort.pnlValues.reduce((total, value) => total + value, 0) / cohort.pnlValues.length
    : 0;
  const executionDragBps = cohort.executionDragValues.length
    ? cohort.executionDragValues.reduce((total, value) => total + value, 0) / cohort.executionDragValues.length
    : 0;
  const evidenceStatus = sampleSize < minSampleSize
    ? "weak_evidence"
    : badVetoRate >= 0.4
      ? "bad_veto_heavy"
      : tradeSampleSize >= minSampleSize && avgPnl < -0.002
        ? "negative_edge_review"
        : tradeSampleSize >= minSampleSize && avgPnl > 0.002 && winRate >= 0.5
          ? "positive_paper_edge"
          : "monitor";
  const recommendation = evidenceStatus === "negative_edge_review"
    ? "review_or_quarantine_in_paper_only"
    : evidenceStatus === "bad_veto_heavy"
      ? "review_blocker_family_do_not_relax_hard_safety"
      : evidenceStatus === "weak_evidence"
        ? "collect_more_paper_samples"
        : "monitor";
  return {
    ...cohort,
    sampleSize,
    tradeSampleSize,
    winRate: num(winRate),
    avgNetPnl: num(avgPnl),
    badVetoRate: num(badVetoRate),
    executionDragBps: num(executionDragBps, 2),
    dataQualityWarningRate: num(sampleSize ? cohort.dataQualityWarnings / sampleSize : 0),
    evidenceStatus,
    recommendation,
    autoPromotionAllowed: false,
    autoRetirementAllowed: false,
    hardSafetyRelaxationAllowed: false
  };
}

export function buildPaperStrategyCohortScorecards({
  candidates = [],
  vetoOutcomes = [],
  trades = [],
  minSampleSize = 8
} = {}) {
  const cohorts = new Map();
  for (const candidate of arr(candidates).filter(isPaper)) {
    const cohort = ensureCohort(cohorts, candidate);
    cohort.generatedCandidates += 1;
    const blocked = candidate.approved === false || candidate.blocked === true || candidate.rootBlocker || candidate.blockedReason;
    if (blocked) cohort.blockedCandidates += 1;
    if (arr(candidate.dataQualityWarnings || candidate.dataQuality?.warnings).length || candidate.dataQualityScore?.learningEvidenceEligible === false) {
      cohort.dataQualityWarnings += 1;
    }
  }
  for (const outcome of arr(vetoOutcomes).filter(isPaper)) {
    const cohort = ensureCohort(cohorts, outcome);
    const label = outcome.outcomeLabel || outcome.label || outcome.vetoOutcome;
    if (label === "bad_veto") cohort.badVetoCount += 1;
    if (label === "good_veto") cohort.goodVetoCount += 1;
    if (arr(outcome.dataQualityWarnings).length) cohort.dataQualityWarnings += 1;
  }
  for (const trade of arr(trades).filter((item) => isPaper(item) && (item.closedAt || item.exitAt))) {
    const cohort = ensureCohort(cohorts, trade);
    const pnl = num(trade.netPnlPct ?? trade.pnlPct ?? trade.returnPct, 6);
    cohort.closedTrades += 1;
    cohort.pnlValues.push(pnl);
    if (pnl > 0) cohort.wins += 1;
    if (pnl < 0) cohort.losses += 1;
    addExitQuality(cohort, trade.exitQuality?.label || trade.exitQualityLabel || trade.learningOutcome?.exitQuality);
    const drag = Number(trade.executionDragBps ?? trade.entryExecutionAttribution?.slippageDeltaBps ?? trade.executionAttribution?.dragBps);
    if (Number.isFinite(drag)) cohort.executionDragValues.push(drag);
    if (arr(trade.dataQualityWarnings || trade.dataQuality?.warnings).length || trade.recordQuality?.score < 0.5) {
      cohort.dataQualityWarnings += 1;
    }
  }
  const cohortsList = [...cohorts.values()].map((cohort) => finalizeCohort(cohort, { minSampleSize }));
  const existingTradeScorecards = buildStrategyEvidenceScorecards({ trades: arr(trades), source: "paper", minSampleSize });
  return {
    status: cohortsList.length ? "ready" : "empty",
    count: cohortsList.length,
    weakEvidenceCount: cohortsList.filter((cohort) => cohort.evidenceStatus === "weak_evidence").length,
    badVetoHeavyCount: cohortsList.filter((cohort) => cohort.evidenceStatus === "bad_veto_heavy").length,
    negativeEdgeReviewCount: cohortsList.filter((cohort) => cohort.evidenceStatus === "negative_edge_review").length,
    cohorts: cohortsList.sort((left, right) => right.sampleSize - left.sampleSize).slice(0, 40),
    existingTradeScorecards,
    diagnosticsOnly: true,
    paperOnly: true,
    liveBehaviorChanged: false,
    autoPromotionAllowed: false,
    autoRetirementAllowed: false
  };
}
