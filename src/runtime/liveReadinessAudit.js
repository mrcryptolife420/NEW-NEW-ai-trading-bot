import { isCriticalAlert } from "./alertSeverity.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function add(list, reason, condition) {
  if (condition) list.push(reason);
}

export function buildLiveReadinessAudit({
  config = {},
  doctor = {},
  runtimeState = {},
  riskSummary = {},
  exchangeSummary = {},
  promotionDossier = {},
  rollbackWatch = {}
} = {}) {
  const alerts = arr(runtimeState.alerts || doctor.alerts || riskSummary.alerts);
  const intents = arr(runtimeState.orderLifecycle?.executionIntentLedger?.unresolvedIntentIds || runtimeState.unresolvedIntents);
  const blockingReasons = [];
  const warnings = [];
  add(blockingReasons, "missing_live_ack", config.liveTradingAcknowledged !== "I_UNDERSTAND_LIVE_TRADING_RISK");
  add(blockingReasons, "missing_live_credentials", !config.binanceApiKey || !config.binanceApiSecret);
  add(blockingReasons, "exchange_protection_disabled", !config.enableExchangeProtection);
  add(blockingReasons, "critical_alert_active", alerts.some(isCriticalAlert));
  add(blockingReasons, "unresolved_execution_intents", intents.length > 0);
  add(blockingReasons, "reconcile_required", Boolean(exchangeSummary.reconcileRequired || riskSummary.reconcileRequired || runtimeState.exchangeTruth?.reconcileRequired));
  add(blockingReasons, "exchange_truth_freeze", Boolean(exchangeSummary.freezeEntries || runtimeState.exchangeTruth?.freezeEntries));
  add(blockingReasons, "rollback_recommended", rollbackWatch.status === "rollback_recommended");
  if (!["canary_candidate", "ready"].includes(promotionDossier.status)) {
    blockingReasons.push("insufficient_promotion_dossier");
  }
  if (promotionDossier.status === "canary_candidate") {
    warnings.push("Promotion dossier supports canary review only; no automatic live activation.");
  }
  if (doctor.status === "degraded" || doctor.readiness?.status === "degraded") {
    warnings.push("Doctor/readiness is degraded.");
  }

  const status = blockingReasons.length
    ? "blocked"
    : promotionDossier.status === "canary_candidate"
      ? "canary_only"
      : warnings.length
        ? "not_ready"
        : "ready";
  return {
    status,
    blockingReasons,
    warnings,
    requiredActions: blockingReasons.map((reason) => `resolve_${reason}`),
    evidence: {
      botMode: config.botMode || "paper",
      operatorMode: config.operatorMode || "active",
      promotionStatus: promotionDossier.status || "unknown",
      rollbackStatus: rollbackWatch.status || "unknown",
      unresolvedIntentCount: intents.length,
      criticalAlertCount: alerts.filter(isCriticalAlert).length
    },
    autoLivePromotionAllowed: false
  };
}
