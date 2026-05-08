import { buildOperatorNote } from "./operatorNotes.js";

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function routeNotification({ event = {}, config = {}, lastSent = {} } = {}) {
  const minSeverity = config.notificationMinSeverity || "medium";
  const severity = event.severity || "info";
  const allowed = (SEVERITY_RANK[severity] ?? 0) >= (SEVERITY_RANK[minSeverity] ?? 2);
  const key = `${event.type || "event"}:${event.symbol || ""}`;
  const rateLimitMs = Number(config.notificationRateLimitMs) || 60000;
  const now = Number(event.now) || Date.now();
  const rateLimited = Number(lastSent[key] || 0) + rateLimitMs > now;
  const safePayload = buildOperatorNote({ type: "notification", text: event.message || event.type || "event" });
  return {
    deliver: allowed && !rateLimited,
    channels: allowed && !rateLimited ? (config.notificationChannels || ["local_log"]) : [],
    severity,
    rateLimited,
    safePayload,
    tradingBlockedOnFailure: false
  };
}
