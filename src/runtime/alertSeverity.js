const ALLOWED_SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);

export function normalizeAlertSeverity(alert = {}) {
  const raw = typeof alert === "string" ? alert : alert.severity || alert.level || alert.priority || "medium";
  const normalized = `${raw || "medium"}`.trim().toLowerCase();
  return ALLOWED_SEVERITIES.has(normalized) ? normalized : "medium";
}

export function isCriticalAlert(alert = {}) {
  return normalizeAlertSeverity(alert) === "critical";
}
