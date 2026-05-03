import { isCriticalAlert } from "./alertSeverity.js";

export const OPERATOR_MODES = Object.freeze(["active", "observe_only", "protect_only", "maintenance", "stopped"]);

export function normalizeOperatorMode(value = "active") {
  const normalized = `${value || "active"}`.trim().toLowerCase();
  return OPERATOR_MODES.includes(normalized) ? normalized : "active";
}

export function canOpenNewEntries(operatorMode) {
  return normalizeOperatorMode(operatorMode?.mode || operatorMode) === "active";
}

export function canManageExistingPositions(operatorMode) {
  return ["active", "protect_only", "maintenance"].includes(normalizeOperatorMode(operatorMode?.mode || operatorMode));
}

export function canRunReconcile(operatorMode) {
  return ["active", "protect_only", "maintenance"].includes(normalizeOperatorMode(operatorMode?.mode || operatorMode));
}

export function resolveOperatorMode({ config = {}, runtimeState = {}, alerts = [], manualOverride = null } = {}) {
  const configured = normalizeOperatorMode(manualOverride || runtimeState.operatorModeOverride || config.operatorMode || "active");
  const criticalAlert = alerts.some(isCriticalAlert);
  const lifecycleMode = runtimeState.lifecycle?.state || runtimeState.service?.state || null;
  let mode = configured;
  const reasons = [];
  if (lifecycleMode === "stopped" || runtimeState.stopped) {
    mode = "stopped";
    reasons.push("runtime_stopped");
  } else if (criticalAlert && mode === "active") {
    mode = "protect_only";
    reasons.push("critical_alert_protect_only");
  }
  return {
    mode,
    configuredMode: configured,
    manualOverride: manualOverride || runtimeState.operatorModeOverride || null,
    canOpenNewEntries: canOpenNewEntries(mode),
    canManageExistingPositions: canManageExistingPositions(mode),
    canRunReconcile: canRunReconcile(mode),
    reasons,
    note: mode === "active"
      ? "Operator mode allows entries if risk and safety gates also allow them."
      : "Operator mode restricts new entries; existing position safety actions remain scoped by mode."
  };
}
