import { buildModelConfidenceRootCause } from "./modelConfidenceRootCause.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return `${value || ""}`.toLowerCase();
}

function firstNonEmpty(values = []) {
  return values.find((value) => typeof value === "string" && value.trim().length) || null;
}

const NEXT_SAFE_ACTION_BY_STAGE = {
  data: "inspect_data_quality_and_feed_sources",
  setup: "inspect_setup_quality_and_strategy_context",
  model: "inspect_model_confidence_and_calibration",
  risk: "inspect_risk_sizing_and_portfolio_limits",
  governance: "inspect_governance_veto_and_meta_gate",
  safety: "inspect_exchange_safety_and_reconcile_state",
  execution: "inspect_execution_costs_intents_and_cooldowns",
  storage_dashboard: "inspect_persistence_readmodel_dashboard_state",
  insufficient_evidence: "collect_candidate_blocker_evidence"
};

function collectReasons(candidate = {}, decision = {}) {
  return [
    candidate.rootBlocker,
    candidate.primaryRootBlocker,
    candidate.blockedReason,
    decision.rootBlocker,
    decision.primaryRootBlocker,
    decision.blockedReason,
    ...arr(candidate.reasons),
    ...arr(candidate.blockerReasons),
    ...arr(candidate.rejectionReasons),
    ...arr(decision.reasons),
    ...arr(decision.blockerReasons),
    ...arr(decision.rejectionReasons),
    ...arr(candidate.riskVerdict?.rejections).map((item) => item?.code),
    ...arr(decision.riskVerdict?.rejections).map((item) => item?.code)
  ].filter(Boolean).map((reason) => `${reason}`);
}

export function inferNoTradeStage(reason = "") {
  const value = text(reason);
  if (/quality|stale|data|quorum|market_snapshot|stream|local_book|rest|feed|lineage/.test(value)) return "data";
  if (/setup|structure|strategy_context|relative|breakout|anti_chop|trend|regime_mismatch/.test(value)) return "setup";
  if (/model_confidence|calibration|confidence|probability|score/.test(value)) return "model";
  if (/risk|exposure|drawdown|loss_streak|portfolio|capital|correlation/.test(value)) return "risk";
  if (/spread|slippage|execution|intent|cost|min_notional|order|fill|position_already_open|duplicate|cooldown/.test(value)) return "execution";
  if (/dashboard|readmodel|storage|persist|journal|recorder/.test(value)) return "storage_dashboard";
  if (/exchange_safety|manual_review|reconcile|unresolved|preflight|live_ack/.test(value)) return "safety";
  if (/meta|committee|governance|veto|canary/.test(value)) return "governance";
  return "insufficient_evidence";
}

function stageRecord(stage, status, reason, detail = {}) {
  return { stage, status, reason: reason || null, detail: obj(detail) };
}

function firstStageReason(reasons = [], stage) {
  return arr(reasons).find((reason) => inferNoTradeStage(reason) === stage) || null;
}

function hasStageReason(reasons = [], stage) {
  return Boolean(firstStageReason(reasons, stage));
}

function nextSafeActionForStage(stage) {
  return NEXT_SAFE_ACTION_BY_STAGE[stage] || NEXT_SAFE_ACTION_BY_STAGE.insufficient_evidence;
}

function buildOperatorLine({ symbol = null, finalStage = "unknown", topBlocker = null, timeline = [] } = {}) {
  const stageSummary = timeline.map((item) => `${item.stage}:${item.status}`).join(" -> ");
  return [
    symbol || "unknown_symbol",
    finalStage || "unknown",
    topBlocker || "no_blocker",
    stageSummary || "no_timeline"
  ].join(" | ");
}

export function buildNoTradeTimeline({
  candidate = {},
  decision = null,
  tradingPathHealth = {},
  readmodelSummary = {},
  dashboardFreshness = {},
  now = new Date().toISOString(),
  botMode = "paper"
} = {}) {
  const decisionSource = obj(decision || candidate);
  const reasons = collectReasons(candidate, decisionSource);
  const tradingPathReasons = arr(tradingPathHealth.blockingReasons).map((reason) => `${reason}`);
  const timelineReasons = [...reasons, ...tradingPathReasons];
  const topBlocker = firstNonEmpty(reasons) || firstNonEmpty(tradingPathReasons) || null;
  const finalStage = topBlocker ? inferNoTradeStage(topBlocker) : "insufficient_evidence";
  const readmodelCounts = obj(readmodelSummary.counts);
  const dashboardAgeMs = Number(dashboardFreshness.ageMs ?? dashboardFreshness.snapshotAgeMs);
  const dashboardStale = Boolean(dashboardFreshness.stale || dashboardFreshness.staleReason) ||
    (Number.isFinite(dashboardAgeMs) && dashboardAgeMs > 60_000);
  const modelRootCause = buildModelConfidenceRootCause({
    candidate,
    decision: decisionSource,
    dataQuality: candidate.dataQuality || decisionSource.dataQuality,
    execution: candidate.execution || decisionSource.execution,
    botMode
  });
  const timeline = [
    stageRecord("data", hasStageReason(timelineReasons, "data") || arr(tradingPathHealth.staleSources).length ? "blocked" : "passed", firstStageReason(timelineReasons, "data") || arr(tradingPathHealth.staleSources)[0] || null, { staleSources: arr(tradingPathHealth.staleSources), feedStatus: tradingPathHealth.feedStatus || null }),
    stageRecord("setup", hasStageReason(timelineReasons, "setup") ? "blocked" : "passed", firstStageReason(timelineReasons, "setup"), { setupType: candidate.setupType || decisionSource.setupType || null }),
    stageRecord("model", hasStageReason(timelineReasons, "model") ? "blocked" : modelRootCause.status === "ready" ? "warning" : "passed", firstStageReason(timelineReasons, "model") || modelRootCause.primaryDriver || null, { primaryDriver: modelRootCause.primaryDriver, drivers: modelRootCause.drivers }),
    stageRecord("governance", hasStageReason(timelineReasons, "governance") ? "blocked" : "passed", firstStageReason(timelineReasons, "governance"), { gateStatus: candidate.governance?.status || decisionSource.governance?.status || null }),
    stageRecord("risk", hasStageReason(timelineReasons, "risk") ? "blocked" : "passed", firstStageReason(timelineReasons, "risk"), { riskStatus: candidate.riskVerdict?.status || decisionSource.riskVerdict?.status || null }),
    stageRecord("safety", hasStageReason(timelineReasons, "safety") ? "blocked" : "passed", firstStageReason(timelineReasons, "safety"), { exchangeSafetyStatus: tradingPathHealth.exchangeSafetyStatus || tradingPathHealth.exchangeSafety?.status || null, botMode }),
    stageRecord("execution", hasStageReason(timelineReasons, "execution") ? "blocked" : "passed", firstStageReason(timelineReasons, "execution"), { executionStatus: candidate.execution?.status || decisionSource.execution?.status || null }),
    stageRecord("storage_dashboard", dashboardStale || readmodelSummary.status === "degraded" ? "warning" : "passed", dashboardStale ? "dashboard_snapshot_stale" : readmodelSummary.status === "degraded" ? "readmodel_degraded" : null, { dashboardAgeMs: Number.isFinite(dashboardAgeMs) ? dashboardAgeMs : null, readmodelStatus: readmodelSummary.status || null, paperCandidates: readmodelCounts.paperCandidates ?? null, paperTrades: readmodelCounts.paperTrades ?? null })
  ];
  const symbol = candidate.symbol || decisionSource.symbol || null;
  const decisionId = candidate.decisionId || decisionSource.decisionId || decisionSource.id || null;
  const blockingStages = timeline.filter((item) => item.status === "blocked").map((item) => item.stage);
  const nextSafeAction = topBlocker && finalStage !== "insufficient_evidence"
    ? nextSafeActionForStage(finalStage)
    : nextSafeActionForStage("insufficient_evidence");
  return {
    status: topBlocker ? "ready" : "empty",
    generatedAt: now,
    symbol,
    decisionId,
    topBlocker,
    finalStage,
    rootCauseCategory: finalStage,
    dominantLayer: finalStage,
    blockingStages,
    timeline,
    operatorLine: buildOperatorLine({ symbol, finalStage, topBlocker, timeline }),
    modelConfidenceRootCause: modelRootCause,
    missingEvidenceReason: finalStage === "insufficient_evidence" ? "no_classified_blocker_or_rejection_reason" : null,
    nextSafeAction,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function summarizeNoTradeTimelines(records = []) {
  const timelines = arr(records).map((item) => item?.timeline ? item : buildNoTradeTimeline({ candidate: item }));
  const byStage = {};
  const byNextSafeAction = {};
  const blockingStages = {};
  for (const item of timelines) {
    const stage = item.finalStage || "insufficient_evidence";
    byStage[stage] = (byStage[stage] || 0) + 1;
    const action = item.nextSafeAction || nextSafeActionForStage(stage);
    byNextSafeAction[action] = (byNextSafeAction[action] || 0) + 1;
    for (const blockedStage of arr(item.blockingStages)) {
      blockingStages[blockedStage] = (blockingStages[blockedStage] || 0) + 1;
    }
  }
  return {
    status: timelines.length ? "ready" : "empty",
    count: timelines.length,
    byStage,
    byNextSafeAction,
    blockingStages,
    top: Object.entries(byStage).map(([stage, count]) => ({ stage, count })).sort((left, right) => right.count - left.count).slice(0, 8),
    operatorLines: timelines.map((item) => item.operatorLine).filter(Boolean).slice(0, 8),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
