const DEFAULT_REASON = {
  category: "other",
  plane: "other",
  severity: "low",
  severityLevel: 3,
  hardSafety: false,
  paperSoftEligible: false,
  paperCanRelax: false,
  probeEligible: false,
  liveBlocks: false,
  rootPriority: 500,
  dashboardLabel: null,
  operatorMessage: null,
  operatorAction: "observe"
};

const DEFINITIONS = {
  exchange_safety_blocked: { category: "safety", plane: "hard_safety", severity: "critical", hardSafety: true, rootPriority: 10, operatorAction: "resolve_exchange_safety" },
  exchange_truth_freeze: { category: "safety", plane: "hard_safety", severity: "critical", hardSafety: true, rootPriority: 5, operatorAction: "reconcile_exchange_truth" },
  exchange_safety_symbol_blocked: { category: "safety", plane: "hard_safety", severity: "critical", hardSafety: true, rootPriority: 12, operatorAction: "resolve_symbol_safety" },
  hard_inventory_drift: { category: "safety", plane: "hard_safety", severity: "critical", hardSafety: true, rootPriority: 8, operatorAction: "reconcile_inventory" },
  reconcile_required: { category: "safety", plane: "hard_safety", severity: "critical", hardSafety: true, rootPriority: 15, operatorAction: "force_reconcile" },
  lifecycle_attention_required: { category: "safety", plane: "hard_safety", severity: "high", hardSafety: true, rootPriority: 18, operatorAction: "review_lifecycle" },
  manual_review: { category: "safety", plane: "hard_safety", severity: "high", hardSafety: true, rootPriority: 20, operatorAction: "manual_review" },
  health_circuit_open: { category: "safety", plane: "hard_safety", severity: "critical", hardSafety: true, rootPriority: 16, operatorAction: "resolve_health_circuit" },

  model_confidence_too_low: { category: "quality", plane: "alpha", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 220, operatorAction: "review_model_confidence" },
  committee_veto: { category: "governance", plane: "permissioning", severity: "high", rootPriority: 130, operatorAction: "review_committee_veto" },
  committee_confidence_too_low: { category: "governance", plane: "permissioning", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 180, operatorAction: "review_committee_confidence" },
  committee_low_agreement: { category: "governance", plane: "permissioning", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 190, operatorAction: "review_committee_agreement" },
  capital_governor_blocked: { category: "governance", plane: "permissioning", severity: "high", rootPriority: 110, operatorAction: "review_capital_governor" },
  capital_governor_recovery: { category: "governance", plane: "permissioning", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 150, operatorAction: "review_recovery_budget" },
  capital_governor_cluster_budget: { category: "governance", plane: "permissioning", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 145, operatorAction: "review_cluster_budget" },
  capital_governor_family_budget: { category: "governance", plane: "permissioning", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 146, operatorAction: "review_family_budget" },

  trade_size_below_minimum: { category: "sizing", plane: "sizing", severity: "medium", rootPriority: 310, operatorAction: "review_size_floor" },
  trade_size_invalid: { category: "sizing", plane: "sizing", severity: "critical", rootPriority: 115, operatorAction: "review_sizing_bug" },
  execution_cost_budget_exceeded: { category: "execution", plane: "permissioning", severity: "medium", rootPriority: 205, operatorAction: "review_execution_costs" },
  cross_timeframe_misalignment: { category: "market", plane: "alpha", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 230, operatorAction: "review_timeframes" },
  higher_tf_conflict: { category: "market", plane: "alpha", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 225, operatorAction: "review_higher_timeframe" },
  session_blocked: { category: "market", plane: "permissioning", severity: "medium", rootPriority: 210, operatorAction: "review_session_filter" },
  entry_cooldown_active: { category: "governance", plane: "permissioning", severity: "low", rootPriority: 260, operatorAction: "wait_for_cooldown" },
  strategy_cooldown: { category: "governance", plane: "permissioning", severity: "low", rootPriority: 255, operatorAction: "review_strategy_cooldown" },
  self_heal_pause_entries: { category: "safety", plane: "permissioning", severity: "high", rootPriority: 90, operatorAction: "review_self_heal" },
  calibration_break: { category: "quality", plane: "alpha", severity: "high", rootPriority: 125, operatorAction: "review_calibration" },
  quality_quorum_degraded: { category: "quality", plane: "alpha", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 235, operatorAction: "review_quality_quorum" },
  paper_learning_daily_limit: { category: "learning", plane: "learning", severity: "low", rootPriority: 330, operatorAction: "review_paper_learning_limits" },
  paper_learning_probe_cap: { category: "learning", plane: "learning", severity: "low", rootPriority: 332, operatorAction: "review_probe_cap" },
  paper_learning_shadow_cap: { category: "learning", plane: "learning", severity: "low", rootPriority: 334, operatorAction: "review_shadow_cap" },
  meta_neural_caution: { category: "governance", plane: "permissioning", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 170, operatorAction: "review_meta_caution" },
  meta_followthrough_caution: { category: "quality", plane: "alpha", severity: "medium", paperSoftEligible: true, probeEligible: true, rootPriority: 240, operatorAction: "review_followthrough" },
  meta_followthrough_reject: { category: "quality", plane: "alpha", severity: "medium", rootPriority: 210, operatorAction: "review_followthrough" },
  meta_followthrough_extension_reject: { category: "quality", plane: "alpha", severity: "medium", rootPriority: 210, operatorAction: "review_followthrough" },
  range_grid_paper_quarantined: { category: "governance", plane: "permissioning", severity: "medium", rootPriority: 160, operatorAction: "review_range_grid_scorecard" },
  range_grid_paper_degraded: { category: "governance", plane: "permissioning", severity: "low", paperSoftEligible: true, probeEligible: false, rootPriority: 245, operatorAction: "review_range_grid_scorecard" },
  range_grid_low_stability: { category: "market", plane: "alpha", severity: "medium", rootPriority: 218, operatorAction: "review_range_stability" },
  range_grid_trend_expansion: { category: "market", plane: "alpha", severity: "medium", rootPriority: 216, operatorAction: "review_range_grid_regime" },
  orderflow_toxicity: { category: "execution", plane: "permissioning", severity: "medium", rootPriority: 206, operatorAction: "review_orderflow_toxicity" },
  orderflow_absorption: { category: "market", plane: "alpha", severity: "medium", rootPriority: 226, operatorAction: "review_orderflow_absorption" }
};

function humanize(code = "") {
  return `${code || "unknown"}`
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function severityToLevel(severity = "low") {
  switch (`${severity || ""}`.toLowerCase()) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
    default:
      return 3;
  }
}

function inferReasonDefinition(code = "") {
  const normalized = `${code || ""}`.trim().toLowerCase();
  if (!normalized) {
    return { ...DEFAULT_REASON, code: normalized, dashboardLabel: "Unknown" };
  }
  if (normalized.includes("exchange_safety") || normalized.includes("exchange_truth") || normalized.includes("reconcile")) {
    return { category: "safety", plane: "hard_safety", severity: "high", hardSafety: true, rootPriority: 40, operatorAction: "review_exchange_safety" };
  }
  if (normalized.includes("confidence") || normalized.includes("quality") || normalized.includes("setup") || normalized.includes("calibration")) {
    return { category: "quality", plane: "alpha", severity: "medium", rootPriority: 240, operatorAction: "review_signal_quality" };
  }
  if (normalized.includes("followthrough")) {
    return { category: "quality", plane: "alpha", severity: "medium", rootPriority: 240, operatorAction: "review_followthrough" };
  }
  if (normalized.includes("committee") || normalized.includes("governor") || normalized.includes("meta") || normalized.includes("retire")) {
    return { category: "governance", plane: "permissioning", severity: "medium", rootPriority: 180, operatorAction: "review_governance" };
  }
  if (normalized.includes("trade_size") || normalized.includes("minimum")) {
    return { category: "sizing", plane: "sizing", severity: "medium", rootPriority: 310, operatorAction: "review_sizing" };
  }
  if (normalized.includes("spread") || normalized.includes("execution") || normalized.includes("book") || normalized.includes("liquidity")) {
    return { category: "execution", plane: "permissioning", severity: "medium", rootPriority: 220, operatorAction: "review_execution" };
  }
  if (normalized.startsWith("paper_learning_") || normalized.includes("shadow")) {
    return { category: "learning", plane: "learning", severity: "low", rootPriority: 330, operatorAction: "review_paper_learning" };
  }
  return {};
}

export function getReasonDefinition(code = "") {
  const normalized = `${code || ""}`.trim().toLowerCase();
  const explicit = DEFINITIONS[normalized] || {};
  const inferred = inferReasonDefinition(normalized);
  const merged = { ...DEFAULT_REASON, ...inferred, ...explicit };
  const dashboardLabel = merged.dashboardLabel || humanize(normalized);
  const paperCanRelax = Boolean((explicit.paperCanRelax ?? inferred.paperCanRelax) ?? merged.paperSoftEligible);
  const liveBlocks = Boolean((explicit.liveBlocks ?? inferred.liveBlocks) ?? merged.hardSafety);
  return {
    ...merged,
    severityLevel: Number.isFinite(Number(explicit.severityLevel ?? inferred.severityLevel))
      ? Number(explicit.severityLevel ?? inferred.severityLevel)
      : severityToLevel(merged.severity),
    paperCanRelax,
    paperSoftEligible: Boolean(merged.paperSoftEligible ?? paperCanRelax),
    liveBlocks,
    code: normalized,
    dashboardLabel,
    operatorMessage: merged.operatorMessage || dashboardLabel
  };
}

export function classifyReasonCategory(code) {
  return getReasonDefinition(code).category;
}

export function classifyDecisionPlane(code) {
  return getReasonDefinition(code).plane;
}

export function getReasonSeverity(code) {
  return getReasonDefinition(code).severity;
}

export function getReasonSeverityLevel(code) {
  return getReasonDefinition(code).severityLevel;
}

export function isHardSafetyReason(code) {
  return Boolean(getReasonDefinition(code).hardSafety);
}

export function isPaperSoftEligible(code) {
  return Boolean(getReasonDefinition(code).paperSoftEligible);
}

export function canPaperRelaxReason(code) {
  return Boolean(getReasonDefinition(code).paperCanRelax);
}

export function isProbeEligibleReason(code) {
  return Boolean(getReasonDefinition(code).probeEligible);
}

export function reasonBlocksLive(code) {
  return Boolean(getReasonDefinition(code).liveBlocks);
}

export function getReasonRootPriority(code) {
  return Number(getReasonDefinition(code).rootPriority || DEFAULT_REASON.rootPriority);
}

export function getDashboardLabel(code) {
  return getReasonDefinition(code).dashboardLabel;
}

export function getOperatorAction(code) {
  return getReasonDefinition(code).operatorAction;
}

export function getOperatorMessage(code) {
  return getReasonDefinition(code).operatorMessage;
}

export function sortReasonsByRootPriority(reasons = []) {
  return [...new Set((Array.isArray(reasons) ? reasons : []).filter(Boolean))]
    .sort((left, right) => getReasonRootPriority(left) - getReasonRootPriority(right) || `${left}`.localeCompare(`${right}`));
}

export const REASON_REGISTRY_VERSION = 1;
