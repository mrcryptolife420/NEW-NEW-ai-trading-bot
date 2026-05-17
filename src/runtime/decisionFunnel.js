import { getReasonDefinition, sortReasonsByRootPriority } from "../risk/reasonRegistry.js";

export const DECISION_FUNNEL_STAGES = [
  "market_data",
  "feature_build",
  "strategy_candidate",
  "model_score",
  "risk_gate",
  "execution_plan",
  "broker_attempt",
  "persistence",
  "dashboard_visibility"
];

const NEXT_SAFE_ACTION_BY_STAGE = {
  market_data: "inspect_data_quality_and_feed_sources",
  feature_build: "inspect_feature_generation_and_lineage",
  strategy_candidate: "inspect_strategy_candidate_generation",
  model_score: "inspect_model_confidence_and_thresholds",
  risk_gate: "inspect_risk_veto_and_sizing",
  execution_plan: "inspect_execution_plan_and_costs",
  broker_attempt: "inspect_broker_attempt_and_execution_errors",
  persistence: "inspect_journal_readmodel_persistence",
  dashboard_visibility: "inspect_dashboard_payload_and_frontend_polling",
  unknown: "collect_decision_funnel_evidence"
};

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(values = []) {
  return values.find((value) => typeof value === "string" && value.trim().length) || null;
}

function buildDecisionId(cycleId, symbol) {
  return `${cycleId || "cycle"}:${symbol || "unknown"}`;
}

function collectReasonCodes({ candidate = {}, decision = {}, entryAttempt = {} } = {}) {
  return [...new Set([
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
    ...arr(decision.riskVerdict?.rejections).map((item) => item?.code),
    ...arr(entryAttempt.blockedReasons),
    ...arr(entryAttempt.symbolBlockers).map((item) => item?.reason),
    ...arr(entryAttempt.entryErrors).map((item) => item?.code || item?.error || item?.err)
  ].filter(Boolean).map((value) => `${value}`))];
}

function stageForReason(reason = "") {
  const definition = getReasonDefinition(reason);
  const text = `${reason || ""}`.toLowerCase();
  if (definition.hardSafety || definition.category === "safety") return "risk_gate";
  if (definition.category === "execution" || /exec|order|fill|broker|slippage|spread|min_notional|cooldown|duplicate/.test(text)) return "broker_attempt";
  if (definition.category === "sizing" || definition.category === "governance" || definition.plane === "permissioning") return "risk_gate";
  if (definition.category === "quality" || /confidence|score|threshold|calibration|model/.test(text)) return "model_score";
  if (definition.category === "market" || /setup|strategy|regime|trend|breakout|feature/.test(text)) return "strategy_candidate";
  if (/data|stale|snapshot|feed|stream|quorum|lineage/.test(text)) return "market_data";
  if (/persist|journal|readmodel|storage/.test(text)) return "persistence";
  if (/dashboard|frontend|polling/.test(text)) return "dashboard_visibility";
  return "risk_gate";
}

function nextSafeActionForStage(stage) {
  return NEXT_SAFE_ACTION_BY_STAGE[stage] || NEXT_SAFE_ACTION_BY_STAGE.unknown;
}

function stageRecord(stage, status = "pending", reason = null, detail = {}) {
  return {
    stage,
    status,
    reason,
    nextSafeAction: status === "blocked" ? nextSafeActionForStage(stage) : null,
    detail
  };
}

function buildStageRecords({ candidates = [], selectedCandidate = null, entryAttempt = {}, primaryReason = null, blockedStage = null } = {}) {
  const opened = Boolean(entryAttempt.openedPosition);
  const selectedDecision = selectedCandidate?.decision || {};
  const allowed = Boolean(selectedDecision.allow || selectedDecision.riskVerdict?.allowed || entryAttempt.allowedCandidates > 0);
  const attempted = arr(entryAttempt.attemptedSymbols).length > 0 || entryAttempt.status === "executed" || opened;
  const candidateCount = arr(candidates).length;
  const stageStatuses = {};
  for (const stage of DECISION_FUNNEL_STAGES) {
    stageStatuses[stage] = "pending";
  }
  stageStatuses.market_data = candidateCount ? "passed" : "blocked";
  stageStatuses.feature_build = candidateCount ? "passed" : "pending";
  stageStatuses.strategy_candidate = candidateCount ? "passed" : "pending";
  stageStatuses.model_score = candidateCount ? "passed" : "pending";
  stageStatuses.risk_gate = allowed ? "passed" : candidateCount ? "blocked" : "pending";
  stageStatuses.execution_plan = allowed ? "passed" : "pending";
  stageStatuses.broker_attempt = opened ? "passed" : attempted ? "blocked" : "pending";
  stageStatuses.persistence = opened ? (entryAttempt.persisted === true ? "passed" : "pending") : "pending";
  stageStatuses.dashboard_visibility = opened ? (entryAttempt.dashboardVisible === true ? "passed" : "pending") : "pending";
  if (blockedStage) {
    for (const stage of DECISION_FUNNEL_STAGES) {
      if (stage === blockedStage) {
        stageStatuses[stage] = "blocked";
      } else if (DECISION_FUNNEL_STAGES.indexOf(stage) > DECISION_FUNNEL_STAGES.indexOf(blockedStage)) {
        stageStatuses[stage] = "pending";
      }
    }
  }
  return DECISION_FUNNEL_STAGES.map((stage) => stageRecord(
    stage,
    stageStatuses[stage],
    stage === blockedStage || (!candidateCount && stage === "market_data") ? primaryReason : null,
    {
      candidateCount,
      allowedCandidates: Number(entryAttempt.allowedCandidates || 0),
      attemptedSymbols: arr(entryAttempt.attemptedSymbols).length,
      opened
    }
  ));
}

export function enrichDecisionForFunnel({ cycleId, mode = "paper", candidate = {}, entryAttempt = {} } = {}) {
  const decision = candidate.decision || {};
  const reasonCodes = sortReasonsByRootPriority(collectReasonCodes({ candidate, decision, entryAttempt }));
  const primaryReason = reasonCodes[0] || (!decision.allow ? "no_allow_reason_recorded" : null);
  const stage = primaryReason ? stageForReason(primaryReason) : (decision.allow ? "execution_plan" : "strategy_candidate");
  return {
    ...candidate,
    decisionId: candidate.decisionId || decision.decisionId || buildDecisionId(cycleId, candidate.symbol),
    cycleId,
    mode,
    stage,
    primaryReason,
    reasonCodes,
    reasonCategories: Object.fromEntries(reasonCodes.map((reason) => [reason, getReasonDefinition(reason).category])),
    nextSafeAction: primaryReason ? nextSafeActionForStage(stage) : null
  };
}

export function buildDecisionFunnelEvidence({
  cycleId,
  mode = "paper",
  candidates = [],
  selectedCandidate = null,
  entryAttempt = {}
} = {}) {
  const candidateList = arr(candidates);
  const selected = selectedCandidate || candidateList.find((candidate) => candidate.symbol === entryAttempt.selectedSymbol) || candidateList[0] || null;
  const selectedDecision = selected?.decision || {};
  const selectedEvidence = selected ? enrichDecisionForFunnel({ cycleId, mode, candidate: selected, entryAttempt }) : null;
  const reasonCodes = selectedEvidence?.reasonCodes?.length
    ? selectedEvidence.reasonCodes
    : sortReasonsByRootPriority(collectReasonCodes({ candidate: selected || {}, decision: selectedDecision, entryAttempt }));
  const primaryReason = reasonCodes[0] || (!candidateList.length ? "no_candidates_created" : null);
  const firstBlockedStage = primaryReason
    ? (candidateList.length ? stageForReason(primaryReason) : "market_data")
    : null;
  const stages = buildStageRecords({ candidates: candidateList, selectedCandidate: selected, entryAttempt, primaryReason, blockedStage: firstBlockedStage });
  const blockedStages = stages.filter((stage) => stage.status === "blocked").map((stage) => stage.stage);
  const highestReachedStage = [...stages].reverse().find((stage) => stage.status === "passed")?.stage || "market_data";
  const opened = Boolean(entryAttempt.openedPosition);
  return {
    status: opened ? "executed" : firstBlockedStage ? "blocked" : candidateList.length ? "ready" : "empty",
    cycleId,
    mode,
    decisionId: selectedEvidence?.decisionId || buildDecisionId(cycleId, selected?.symbol),
    symbol: selected?.symbol || entryAttempt.selectedSymbol || null,
    stages,
    highestReachedStage,
    firstBlockedStage,
    blockedStages,
    primaryReason,
    reasonCodes,
    reasonCategories: Object.fromEntries(reasonCodes.map((reason) => [reason, getReasonDefinition(reason).category])),
    nextSafeAction: firstBlockedStage ? nextSafeActionForStage(firstBlockedStage) : "monitor_next_cycle",
    candidatesCreated: candidateList.length,
    viableCandidates: candidateList.filter((candidate) => candidate.decision?.allow).length,
    allowedCandidates: Number(entryAttempt.allowedCandidates || 0),
    skippedCandidates: Number(entryAttempt.skippedCandidates || 0),
    executionAttempts: arr(entryAttempt.attemptedSymbols).length,
    opened,
    selectedDecision: selectedEvidence,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
