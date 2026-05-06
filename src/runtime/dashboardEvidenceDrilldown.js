import { buildCandidateExplainability } from "./candidateExplainability.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function text(value, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value) {
  return value === true;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function topReason(summary = {}, fallback = "unknown") {
  const source = objectOrFallback(summary, {});
  return text(
    source.reason ||
      source.rootBlocker ||
      source.dominantBlocker ||
      source.mainConflict ||
      source.status ||
      arr(source.blockingReasons)[0] ||
      arr(source.warnings)[0],
    fallback
  );
}

function classifyState({ exchangeSafety, tradingPathHealth, candidate, featureQuality }) {
  if (exchangeSafety.entryBlocked || arr(exchangeSafety.blockingReasons).length) return "safety_blocked";
  if (tradingPathHealth.status === "stale" || tradingPathHealth.status === "inactive") return "dashboard_or_feed_stale";
  if (featureQuality.status && !["ready", "clean", "usable", "ok"].includes(featureQuality.status)) return "bad_data";
  if (candidate.blocker || arr(candidate.topConflicts).length) return "no_alpha_or_blocked";
  if (candidate.approved) return "paper_candidate_ready";
  return "unknown";
}

function buildDecisionDrilldown(decision = {}, context = {}) {
  const source = objectOrFallback(decision, {});
  const candidate = buildCandidateExplainability(source);
  const exchangeSafety = objectOrFallback(
    source.exchangeSafetySummary ||
      source.exchangeSafety ||
      context.exchangeSafetySummary ||
      context.exchangeSafety,
    {}
  );
  const tradingPathHealth = objectOrFallback(context.tradingPathHealth || source.tradingPathHealth, {});
  const featureQuality = objectOrFallback(
    source.dataQualityScore ||
      source.dataQuality ||
      source.featureQuality ||
      context.dataQualityScoreSummary,
    {}
  );
  const setupThesis = objectOrFallback(source.setupThesis || source.thesis || source.tradeThesis, {});
  const netEdge = objectOrFallback(
    source.netEdgeGate ||
      source.expectedNetEdge ||
      source.paperNetEdgeCalibration ||
      context.paperNetEdgeCalibrationSummary,
    {}
  );
  const portfolioCrowding = objectOrFallback(
    source.portfolioCrowding ||
      source.portfolioCrowdingSummary ||
      context.portfolioCrowdingSummary,
    {}
  );
  const rootBlocker = text(
    firstDefined(source.rootBlocker, candidate.blocker, exchangeSafety.rootBlocker, arr(exchangeSafety.blockingReasons)[0]),
    null
  );
  const state = classifyState({ exchangeSafety, tradingPathHealth, candidate, featureQuality });
  const evidenceFor = [
    ...arr(candidate.topEvidence),
    ...arr(setupThesis.evidenceFor).map((reason) => ({ id: text(reason), score: 0.3, reason: text(reason) }))
  ].slice(0, 8);
  const evidenceAgainst = [
    ...arr(candidate.topConflicts),
    ...arr(setupThesis.evidenceAgainst).map((reason) => ({ id: text(reason), score: -0.3, reason: text(reason) }))
  ].slice(0, 8);
  const exchangeSafetyDominant = exchangeSafety.entryBlocked === true || arr(exchangeSafety.blockingReasons).length > 0;

  return {
    decisionId: source.decisionId || source.id || null,
    symbol: candidate.symbol,
    setupType: candidate.setupType,
    approved: bool(source.approved) || candidate.approved,
    state,
    rootBlocker,
    featureQuality: {
      status: text(featureQuality.status || featureQuality.quality || featureQuality.dataQualityStatus, "unknown"),
      score: firstDefined(featureQuality.score, featureQuality.dataQualityScore, null),
      missingFeatures: arr(featureQuality.missingFeatures || featureQuality.missing),
      staleFeatures: arr(featureQuality.staleFeatures || featureQuality.staleSources)
    },
    setupThesis: {
      primaryReason: text(setupThesis.primaryReason || setupThesis.thesis || source.primaryReason, "unavailable"),
      invalidatesIf: arr(setupThesis.invalidatesIf),
      requiredConfirmation: arr(setupThesis.requiredConfirmation)
    },
    netEdge: {
      status: text(netEdge.status || netEdge.gateStatus, "unknown"),
      score: firstDefined(netEdge.score, netEdge.netEdgeScore, netEdge.expectancyScore, null),
      reason: topReason(netEdge, "net_edge_unavailable")
    },
    portfolioCrowding: {
      risk: text(portfolioCrowding.crowdingRisk || portfolioCrowding.risk, "unknown"),
      sizeMultiplier: firstDefined(portfolioCrowding.sizeMultiplier, null),
      reasons: arr(portfolioCrowding.reasons)
    },
    exchangeSafety: {
      dominant: exchangeSafetyDominant,
      entryBlocked: exchangeSafetyDominant,
      status: text(exchangeSafety.status, exchangeSafetyDominant ? "blocked" : "unknown"),
      blockingReasons: arr(exchangeSafety.blockingReasons),
      nextAction: text(exchangeSafety.nextAction || exchangeSafety.safeNextAction, exchangeSafetyDominant ? "run_reconcile_plan" : "none")
    },
    evidenceFor,
    evidenceAgainst,
    warnings: [
      ...arr(candidate.warnings),
      ...(exchangeSafetyDominant ? ["exchange_safety_dominates"] : []),
      ...(tradingPathHealth.status === "stale" ? ["dashboard_or_feed_stale"] : [])
    ],
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function buildDashboardEvidenceDrilldown({
  decisions = [],
  runtimeState = {},
  dashboardSnapshot = {},
  exchangeSafetySummary = null,
  tradingPathHealth = null,
  limit = 12
} = {}) {
  const runtime = objectOrFallback(runtimeState, {});
  const dashboard = objectOrFallback(dashboardSnapshot, {});
  const sourceDecisions = arr(decisions).length
    ? arr(decisions)
    : arr(runtime.latestDecisions || runtime.topDecisions || dashboard.topDecisions || dashboard.decisions);
  const context = {
    exchangeSafetySummary: exchangeSafetySummary || dashboard.exchangeSafetySummary || runtime.exchangeSafetySummary || runtime.exchangeSafety,
    tradingPathHealth: tradingPathHealth || dashboard.tradingPathHealth || runtime.tradingPathHealth,
    dataQualityScoreSummary: dashboard.dataQualityScoreSummary || runtime.dataQualityScoreSummary,
    paperNetEdgeCalibrationSummary: dashboard.paperNetEdgeCalibrationSummary || runtime.paperNetEdgeCalibrationSummary,
    portfolioCrowdingSummary: dashboard.portfolioCrowdingSummary || runtime.portfolioCrowdingSummary
  };
  const items = sourceDecisions.slice(0, Math.max(0, Number.isFinite(limit) ? Math.trunc(limit) : 12)).map((decision) => buildDecisionDrilldown(decision, context));
  const safetyBlocked = items.some((item) => item.exchangeSafety.dominant) || arr(context.exchangeSafetySummary?.blockingReasons).length > 0;
  const stale = context.tradingPathHealth?.status === "stale" || context.tradingPathHealth?.status === "inactive";
  const stateCounts = items.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {});

  return {
    status: safetyBlocked ? "safety_blocked" : stale ? "stale" : items.length ? "ready" : "empty",
    count: items.length,
    items,
    stateCounts,
    operatorCanDistinguish: {
      noAlpha: Boolean(stateCounts.no_alpha_or_blocked),
      badData: Boolean(stateCounts.bad_data),
      safetyBlocked,
      dashboardStale: stale
    },
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
