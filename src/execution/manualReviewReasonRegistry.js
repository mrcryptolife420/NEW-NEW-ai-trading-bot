const REASON_DEFINITIONS = {
  manual_review_required: {
    severity: "medium",
    operatorAction: "review_reconcile_plan_before_mutation",
    dashboardLabel: "Manual review required"
  },
  exchange_truth_mismatch: {
    severity: "critical",
    operatorAction: "compare_exchange_truth_with_local_state",
    dashboardLabel: "Exchange truth mismatch"
  },
  unresolved_execution_intent: {
    severity: "high",
    operatorAction: "resolve_or_reconcile_execution_intent",
    dashboardLabel: "Unresolved execution intent"
  },
  protective_order_uncertain: {
    severity: "high",
    operatorAction: "verify_protective_order_coverage_before_entries",
    dashboardLabel: "Protective order uncertain"
  },
  position_reconcile_required: {
    severity: "medium",
    operatorAction: "run_read_only_reconcile_plan",
    dashboardLabel: "Position reconcile required"
  },
  unknown: {
    severity: "medium",
    operatorAction: "inspect_runtime_and_reconcile_context",
    dashboardLabel: "Manual review"
  }
};

export function listManualReviewReasons() {
  return Object.entries(REASON_DEFINITIONS).map(([id, value]) => ({ id, ...value }));
}

export function resolveManualReviewReason(reason = "unknown") {
  const id = `${reason || "unknown"}`.trim() || "unknown";
  const canonical = REASON_DEFINITIONS[id] ? id : "unknown";
  return { id: canonical, requestedId: id, canonical, ...REASON_DEFINITIONS[canonical] };
}

export function decorateManualReviewReason(reason = "unknown", extra = {}) {
  if (reason && typeof reason === "object" && !Array.isArray(reason)) {
    const resolved = resolveManualReviewReason(reason.reason || reason.id || "unknown");
    return { ...reason, ...extra, manualReview: { ...resolved, ...(reason.manualReview || {}) } };
  }
  return { ...resolveManualReviewReason(reason), ...extra };
}
