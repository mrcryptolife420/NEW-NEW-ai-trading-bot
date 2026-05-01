import { buildStrategyLifecycleGovernance } from "../strategy/strategyLifecycleGovernance.js";

function titleize(value = "") {
  return `${value || ""}`.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const ACTION_LINKS = {
  status: { command: "npm run status", target: "status" },
  doctor: { command: "npm run doctor", target: "doctor" },
  force_reconcile_if_available: { command: "dashboard quick action: force reconcile", target: "dashboard" },
  review_capital_governor: { command: "npm run report", target: "report.capitalGovernor" },
  review_probe_lane: { command: "npm run report", target: "report.paperLearning" },
  replay_decision: { command: "npm run replay-decision -- <decisionId>", target: "read_model.decision_trace" },
  review_bad_veto_learning: { command: "npm run report", target: "report.badVetoLearning" },
  review_scorecards: { command: "npm run readmodel:dashboard", target: "read_model.scorecards" },
  request_budget: { command: "npm run request-budget", target: "read_model.requestBudget" },
  review_execution_feedback: { command: "npm run report", target: "report.executionFeedback" },
  review_symbol_filters: { command: "npm run doctor", target: "doctor.symbolFilters" },
  review_dashboard: { command: "npm run dashboard", target: "dashboard" }
};

function attachActionLinks(runbook = {}) {
  const actions = [...(runbook.safeActions || [])];
  return {
    ...runbook,
    actionLinks: actions
      .map((action) => ({ action, ...(ACTION_LINKS[action] || { command: null, target: null }) }))
      .filter((item) => item.command || item.target)
  };
}

export function buildOperatorActionResult({
  action,
  target = null,
  allowed = false,
  preflightChecks = [],
  denialReasons = [],
  changedState = {},
  rootBlockerBefore = null,
  rootBlockerAfter = null,
  nextRecommendedAction = null
} = {}) {
  const checks = Array.isArray(preflightChecks) ? preflightChecks : [];
  const denials = Array.isArray(denialReasons) ? denialReasons : [];
  const effectiveAllowed = Boolean(allowed) && denials.length === 0 && !checks.some((check) => check?.passed === false);
  const rootChanged = rootBlockerBefore !== rootBlockerAfter;
  return {
    action: action || "unknown",
    target,
    allowed: effectiveAllowed,
    preflightChecks: checks,
    denialReasons: denials,
    changedState: changedState || {},
    rootBlockerBefore: rootBlockerBefore || null,
    rootBlockerAfter: rootBlockerAfter || null,
    rootBlockerChanged: rootChanged,
    nextRecommendedAction: nextRecommendedAction || (effectiveAllowed
      ? "Refresh status/dashboard and verify root blocker cleared before taking another action."
      : "Resolve denial reasons first; do not force live actions around failed preflight checks.")
  };
}

export function buildOperatorRunbookForReason(reason, context = {}) {
  const code = `${reason || ""}`.trim();
  if (!code) {
    return attachActionLinks({
      id: "unknown",
      severity: "neutral",
      title: "Geen dominante blocker",
      action: "Blijf dashboard freshness, request budget en laatste cycle controleren.",
      safeActions: ["review_dashboard", "request_budget"]
    });
  }
  if (/exchange|reconcile|inventory|manual_review|health_circuit/.test(code)) {
    return attachActionLinks({
      id: code,
      severity: "negative",
      title: `${titleize(code)} oplossen`,
      action: "Voer eerst status/doctor/reconcile checks uit; forceer geen entries totdat exchange truth schoon is.",
      safeActions: ["status", "doctor", "force_reconcile_if_available"],
      forbiddenActions: ["ignore_exchange_truth", "force_live_entry"]
    });
  }
  if (/capital|budget|drawdown/.test(code)) {
    return attachActionLinks({
      id: code,
      severity: "warning",
      title: `${titleize(code)} beoordelen`,
      action: "Controleer capital governor, open exposure en probe-only herstel voordat je meer allocatie toestaat.",
      safeActions: ["review_capital_governor", "review_probe_lane"],
      forbiddenActions: ["raise_risk_without_evidence"]
    });
  }
  if (/model|confidence|committee|meta|quality/.test(code)) {
    return attachActionLinks({
      id: code,
      severity: "warning",
      title: `${titleize(code)} analyseren`,
      action: "Gebruik replay, bad-veto learning en scorecards; verander thresholds pas na voldoende paper evidence.",
      safeActions: ["replay_decision", "review_bad_veto_learning", "review_scorecards"],
      forbiddenActions: ["blind_threshold_lowering"]
    });
  }
  if (/size|notional|execution|slippage|spread/.test(code)) {
    return attachActionLinks({
      id: code,
      severity: "warning",
      title: `${titleize(code)} execution review`,
      action: "Controleer symbol filters, fee model, spread/slippage en execution feedback voordat entries groter worden.",
      safeActions: ["request_budget", "review_execution_feedback", "review_symbol_filters"],
      forbiddenActions: ["ignore_min_notional"]
    });
  }
  return attachActionLinks({
    id: code,
    severity: context.severity || "neutral",
    title: `${titleize(code)} review`,
    action: "Bekijk root blocker, latest replay trace en relevante scorecards voordat beleid wordt aangepast.",
    safeActions: ["review_dashboard", "replay_decision"],
    forbiddenActions: ["change_live_safety_without_review"]
  });
}

export function buildStrategyLifecycleDiagnostics(scorecards = []) {
  const cards = Array.isArray(scorecards) ? scorecards : [];
  const dangerous = cards.filter((card) => ["dangerous", "negative_edge"].includes(card.status));
  const positive = cards.filter((card) => card.status === "positive_edge");
  const rangeGridGovernance = buildStrategyLifecycleGovernance(cards);
  return {
    status: rangeGridGovernance.status === "paper_quarantine_active"
      ? "paper_quarantine_active"
      : dangerous.length
        ? "review_required"
        : positive.length
          ? "healthy_edges_present"
          : cards.length
            ? "observe"
            : "insufficient_evidence",
    dangerousCount: dangerous.length,
    positiveCount: positive.length,
    topDangerous: dangerous.slice(0, 5),
    promoteCandidates: positive.slice(0, 5),
    rangeGridGovernance,
    recommendedAction: dangerous.length
      ? "Review dangerous strategy/regime/session pairs before allowing more allocation."
      : positive.length
        ? "Keep positive strategies in observation until replay and execution feedback confirm."
        : "Collect more scoped evidence before lifecycle changes."
  };
}
