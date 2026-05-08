function ts(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value) {
  return new Date(value).toISOString();
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function buildImmediateEntryQueueItem({ symbol, candidateId = null, source = "stream_threshold_cross", now = new Date().toISOString(), ttlMs = 5000, requiredChecks = [] } = {}) {
  const normalizedSymbol = `${symbol || ""}`.trim().toUpperCase();
  const nowMs = ts(now) ?? Date.now();
  return {
    id: `fast-entry-${normalizedSymbol || "UNKNOWN"}-${iso(nowMs)}`,
    symbol: normalizedSymbol,
    candidateId: candidateId || normalizedSymbol || null,
    source,
    createdAt: iso(nowMs),
    expiresAt: iso(nowMs + Math.max(1, Number(ttlMs) || 5000)),
    requiredChecks: requiredChecks.length
      ? requiredChecks
      : ["fresh_market_data", "risk_verdict", "exposure_limit", "exchange_safety", "execution_budget"],
    status: normalizedSymbol ? "queued" : "blocked",
    blockedReason: normalizedSymbol ? null : "missing_symbol"
  };
}

export function enqueueImmediateEntry({ queue = [], item, unresolvedIntents = [], now = new Date().toISOString() } = {}) {
  const nowMs = ts(now) ?? Date.now();
  const cleanQueue = arr(queue).filter((entry) => {
    const expiresMs = ts(entry.expiresAt);
    return expiresMs == null || expiresMs >= nowMs;
  });
  if (!item?.symbol) {
    return { queue: cleanQueue, accepted: false, blockedReason: "missing_symbol", item: { ...item, status: "blocked", blockedReason: "missing_symbol" } };
  }
  if (cleanQueue.some((entry) => entry.symbol === item.symbol)) {
    return { queue: cleanQueue, accepted: false, blockedReason: "duplicate_symbol_queue_item", item: { ...item, status: "blocked", blockedReason: "duplicate_symbol_queue_item" } };
  }
  if (arr(unresolvedIntents).some((intent) => `${intent.symbol || ""}`.toUpperCase() === item.symbol && !["resolved", "failed", "cancelled"].includes(`${intent.status || ""}`.toLowerCase()))) {
    return { queue: cleanQueue, accepted: false, blockedReason: "unresolved_execution_intent", item: { ...item, status: "blocked", blockedReason: "unresolved_execution_intent" } };
  }
  const accepted = { ...item, status: "queued", blockedReason: null };
  return { queue: [...cleanQueue, accepted], accepted: true, blockedReason: null, item: accepted };
}

export function summarizeImmediateEntryQueue({ queue = [], now = new Date().toISOString() } = {}) {
  const nowMs = ts(now) ?? Date.now();
  const items = arr(queue).map((item) => {
    const createdMs = ts(item.createdAt) ?? nowMs;
    const expiresMs = ts(item.expiresAt) ?? createdMs;
    const expired = expiresMs < nowMs;
    return {
      ...item,
      expired,
      latencyMs: Math.max(0, nowMs - createdMs),
      remainingTtlMs: Math.max(0, expiresMs - nowMs),
      status: expired ? "expired" : item.status || "queued",
      blockedReason: expired ? "candidate_expired" : item.blockedReason || null
    };
  });
  return {
    status: items.length ? "active" : "empty",
    size: items.filter((item) => !item.expired).length,
    items,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
