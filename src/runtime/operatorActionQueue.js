import { normalizeAlertSeverity } from "./alertSeverity.js";

const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
});

const SAFETY_BLOCKING_PATTERNS = [
  "exchange_safety",
  "exchange_truth",
  "reconcile",
  "protection",
  "protective",
  "manual_review",
  "unresolved_execution_intent"
];

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = `${value}`.trim();
  return text || null;
}

function timestampOrNow(value, nowIso) {
  const text = stringOrNull(value);
  if (!text) return nowIso;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : nowIso;
}

function resolveDedupeKey(alert = {}) {
  return stringOrNull(alert.dedupeKey || alert.id || alert.code || alert.reason || alert.title || alert.message) || "operator_action";
}

function resolveRecommendedAction(alert = {}) {
  const explicit = stringOrNull(alert.recommendedAction || alert.action || alert.nextAction);
  if (explicit) return explicit;
  const key = `${resolveDedupeKey(alert)} ${alert.reason || ""}`.toLowerCase();
  if (key.includes("exchange") || key.includes("reconcile")) return "run_exchange_safety_status_and_reconcile_plan";
  if (key.includes("protection") || key.includes("protective")) return "inspect_or_rebuild_protection_using_safe_reconcile_flow";
  if (key.includes("manual_review")) return "complete_manual_review_before_new_entries";
  if (key.includes("stale")) return "refresh_runtime_readmodel_or_feed_snapshot";
  return "inspect_alert_context";
}

function resolveUrgency(severity) {
  if (severity === "critical") return "immediate";
  if (severity === "high") return "soon";
  if (severity === "medium") return "normal";
  return "low";
}

function isSafetyBlockingAction(alert = {}, severity = "medium") {
  if (severity !== "critical") return false;
  const text = [
    alert.id,
    alert.code,
    alert.reason,
    alert.title,
    alert.message,
    alert.action,
    alert.recommendedAction,
    alert.dedupeKey
  ].map((value) => `${value || ""}`.toLowerCase()).join(" ");
  return SAFETY_BLOCKING_PATTERNS.some((pattern) => text.includes(pattern));
}

export function normalizeOperatorAction(alert = {}, { nowIso = new Date().toISOString() } = {}) {
  const severity = normalizeAlertSeverity(alert);
  const dedupeKey = resolveDedupeKey(alert);
  const resolved = Boolean(alert.resolvedAt || alert.resolved || alert.active === false);
  const blocking = Boolean(alert.blocking ?? isSafetyBlockingAction(alert, severity));
  return {
    id: stringOrNull(alert.id || alert.actionId || dedupeKey),
    dedupeKey,
    title: stringOrNull(alert.title || alert.message || alert.reason) || "Operator action",
    reason: stringOrNull(alert.reason || alert.code || alert.id) || dedupeKey,
    severity,
    urgency: stringOrNull(alert.urgency) || resolveUrgency(severity),
    blocking,
    recommendedAction: resolveRecommendedAction(alert),
    createdAt: timestampOrNow(alert.createdAt || alert.generatedAt || alert.at, nowIso),
    lastSeenAt: timestampOrNow(alert.lastSeenAt || alert.updatedAt || alert.generatedAt || alert.at, nowIso),
    resolvedAt: alert.resolvedAt || null,
    source: stringOrNull(alert.source) || "operator_alert",
    symbol: stringOrNull(alert.symbol)
  };
}

export function buildOperatorActionQueue({ alerts = [], existing = [], nowIso = new Date().toISOString(), limit = 20 } = {}) {
  const candidates = [...arr(existing), ...arr(alerts)].map((alert) => normalizeOperatorAction(alert, { nowIso }));
  const byKey = new Map();
  for (const action of candidates) {
    const previous = byKey.get(action.dedupeKey);
    if (!previous) {
      byKey.set(action.dedupeKey, action);
      continue;
    }
    const previousRank = SEVERITY_RANK[previous.severity] ?? 2;
    const nextRank = SEVERITY_RANK[action.severity] ?? 2;
    byKey.set(action.dedupeKey, {
      ...previous,
      ...action,
      createdAt: previous.createdAt < action.createdAt ? previous.createdAt : action.createdAt,
      severity: nextRank >= previousRank ? action.severity : previous.severity,
      urgency: nextRank >= previousRank ? action.urgency : previous.urgency,
      blocking: previous.blocking || action.blocking,
      resolvedAt: action.resolvedAt || previous.resolvedAt || null
    });
  }
  const items = [...byKey.values()].sort((left, right) => {
    const rankDiff = (SEVERITY_RANK[right.severity] ?? 2) - (SEVERITY_RANK[left.severity] ?? 2);
    if (rankDiff !== 0) return rankDiff;
    return `${right.lastSeenAt}`.localeCompare(`${left.lastSeenAt}`);
  });
  const activeItems = items.filter((item) => !item.resolvedAt);
  const blockingItems = activeItems.filter((item) => item.blocking);
  const criticalBlockingItems = blockingItems.filter((item) => item.severity === "critical");
  return {
    status: criticalBlockingItems.length
      ? "blocked"
      : blockingItems.length
        ? "action_required"
        : activeItems.length
          ? "watch"
          : "clear",
    generatedAt: nowIso,
    totalCount: items.length,
    activeCount: activeItems.length,
    blockingCount: blockingItems.length,
    criticalBlockingCount: criticalBlockingItems.length,
    items: items.slice(0, Math.max(1, Number(limit) || 20)),
    nextAction: criticalBlockingItems[0]?.recommendedAction || blockingItems[0]?.recommendedAction || activeItems[0]?.recommendedAction || "monitor"
  };
}

export function hasBlockingOperatorActions(queue = {}) {
  return Number(queue.criticalBlockingCount || 0) > 0 ||
    arr(queue.items).some((item) => item.blocking && normalizeAlertSeverity(item) === "critical" && !item.resolvedAt);
}
