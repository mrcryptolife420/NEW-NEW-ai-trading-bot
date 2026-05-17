function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function highSeverity(alert = {}) {
  return ["critical", "page_now", "high"].includes(`${alert.severity || alert.level || ""}`.toLowerCase());
}

function reconcileClass(exchangeSafety = {}) {
  if (exchangeSafety.manualReviewRequired || exchangeSafety.autoReconcileStatus === "manual_review_required") return "manual_review_required";
  if (exchangeSafety.reconcileRequired) return "position_mismatch";
  if (exchangeSafety.staleExchangeTruth || exchangeSafety.exchangeTruthStale) return "stale_exchange_truth";
  if (exchangeSafety.paperLifecyclePending) return "paper_lifecycle_pending";
  if (exchangeSafety.status === "clean" || exchangeSafety.status === "ready") return "clean";
  return exchangeSafety.status ? "critical_unknown" : "clean";
}

export function buildCapitalProtectionDrills({
  capitalGovernor = {},
  capitalPolicy = {},
  portfolioStress = {},
  panicPlan = {},
  positions = []
} = {}) {
  const drills = [
    {
      id: "daily_loss_lock",
      status: capitalGovernor.dailyLossLimitBreached || capitalGovernor.dailyLossLockActive ? "would_lock" : "pass",
      reason: capitalGovernor.dailyLossReason || null
    },
    {
      id: "red_day_streak_lock",
      status: finite(capitalGovernor.redDayStreak, 0) >= finite(capitalGovernor.maxRedDayStreak, 3) ? "would_lock" : "pass",
      reason: capitalGovernor.redDayStreak ? `red_day_streak:${capitalGovernor.redDayStreak}` : null
    },
    {
      id: "concentration_breach",
      status: arr(capitalGovernor.exposureBreaches || capitalPolicy.exposureBreaches).length ? "would_freeze_entries" : "pass",
      reason: arr(capitalGovernor.exposureBreaches || capitalPolicy.exposureBreaches)[0]?.reason || null
    },
    {
      id: "portfolio_stress",
      status: ["danger", "critical", "blocked"].includes(`${portfolioStress.status || ""}`) ? "would_freeze_entries" : "pass",
      reason: portfolioStress.worstScenario || portfolioStress.reason || null
    },
    {
      id: "panic_flatten_plan",
      status: arr(panicPlan.positionsToClose).length || arr(positions).some((position) => position.panicFlattenRequired) ? "plan_required" : "pass",
      reason: arr(panicPlan.positionsToClose)[0]?.reason || null
    }
  ];
  return {
    version: 1,
    status: drills.some((drill) => drill.status !== "pass") ? "review_required" : "pass",
    dryRun: true,
    drills,
    liveSafetyImpact: "negative_only"
  };
}

export function buildLiveIncidentCommandState({
  config = {},
  readiness = {},
  livePreflight = {},
  exchangeSafety = {},
  capitalGovernor = {},
  capitalPolicy = {},
  alerts = {},
  operatorActions = {},
  rollbackWatch = {},
  canaryGate = {},
  incidentSummary = {},
  panicPlan = {},
  positions = [],
  nowIso = new Date().toISOString()
} = {}) {
  const alertItems = arr(alerts.items || alerts.alerts || alerts);
  const criticalAlerts = alertItems.filter(highSeverity);
  const reconcile = reconcileClass(exchangeSafety);
  const blockedActions = arr(operatorActions.items || operatorActions.actions).filter((item) => item.blocking || item.safetyBlocking);
  const capitalDrills = buildCapitalProtectionDrills({ capitalGovernor, capitalPolicy, panicPlan, positions });
  const reasons = [
    ...(readiness.status === "blocked" ? ["readiness_blocked"] : []),
    ...(livePreflight.allowed === false || livePreflight.status === "blocked" ? ["live_preflight_blocked"] : []),
    ...(reconcile !== "clean" ? [`reconcile_${reconcile}`] : []),
    ...(criticalAlerts.length ? ["critical_alerts_active"] : []),
    ...(blockedActions.length ? ["blocking_operator_actions"] : []),
    ...(capitalDrills.status !== "pass" ? ["capital_protection_review"] : []),
    ...(rollbackWatch.rollbackRequired ? ["rollback_required"] : []),
    ...(canaryGate.allowed === false ? ["canary_blocked"] : [])
  ];
  const state = reasons.includes("rollback_required")
    ? "exit_only"
    : reasons.includes("live_preflight_blocked")
      ? "live_locked"
      : reasons.includes("reconcile_manual_review_required") || reasons.includes("blocking_operator_actions")
        ? "operator_review"
        : reasons.includes("capital_protection_review")
          ? "entry_freeze"
          : reasons.includes("critical_alerts_active")
            ? "degraded"
            : reasons.length
              ? "watch"
              : "normal";
  return {
    version: 1,
    state,
    generatedAt: nowIso,
    mode: config.botMode || "paper",
    severity: criticalAlerts.some((alert) => `${alert.severity}` === "page_now" || `${alert.severity}` === "critical")
      ? "critical"
      : state === "normal"
        ? "info"
        : "warning",
    reasons,
    affectedSymbols: [
      ...new Set([
        ...arr(exchangeSafety.blockedSymbols).map((item) => item.symbol || item),
        ...arr(positions).filter((position) => position.manualReviewRequired || position.reconcileRequired).map((position) => position.symbol)
      ].filter(Boolean))
    ],
    reconcile: {
      class: reconcile,
      status: exchangeSafety.status || "unknown",
      manualReviewRequired: reconcile === "manual_review_required"
    },
    allowedActions: state === "normal"
      ? ["observe", "run_cycle"]
      : state === "live_locked"
        ? ["run_live_preflight", "stay_paper"]
        : state === "exit_only"
          ? ["review_rollback", "protect_positions"]
          : ["observe", "acknowledge_alerts", "run_reconcile_review"],
    deniedActions: state === "normal" ? [] : ["open_new_live_entries_without_review"],
    capitalDrills,
    alertLifecycle: {
      active: alertItems.length,
      critical: criticalAlerts.length,
      blockingActions: blockedActions.length
    },
    incidentReport: {
      count: incidentSummary.count || 0,
      latest: arr(incidentSummary.reports)[0] || null
    },
    runbook: {
      id: `live_${state}`,
      nextAction: state === "normal" ? "continue_monitoring" : "review_allowed_actions_before_mutation"
    },
    liveSafetyImpact: "negative_only"
  };
}

