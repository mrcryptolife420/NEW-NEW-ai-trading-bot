function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeUpper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMs(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function orderKey(order = {}) {
  return `${order.orderId || order.id || order.clientOrderId || order.clientOrderID || ""}`;
}

function orderSymbol(order = {}) {
  return safeUpper(order.symbol);
}

function isUnresolvedOrder(order = {}) {
  const status = safeUpper(order.status);
  if (!status) return true;
  return !["FILLED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED", "DONE", "COMPLETED", "FAILED"].includes(status);
}

function isProtectiveOrder(order = {}) {
  const side = safeUpper(order.side);
  const type = safeUpper(order.type || order.orderType || order.kind);
  const role = `${order.role || order.kind || order.intentKind || order.protectionKind || ""}`.toLowerCase();
  return side === "SELL" && (
    role.includes("protect") ||
    role.includes("oco") ||
    type.includes("STOP") ||
    type.includes("TAKE_PROFIT") ||
    type.includes("OCO")
  );
}

function isPaperOrder(order = {}) {
  const mode = `${order.brokerMode || order.mode || order.source || ""}`.toLowerCase();
  return mode.includes("paper") || order.paper === true;
}

function orderUpdatedMs(order = {}) {
  return parseMs(order.updatedAt || order.lastUpdatedAt || order.createdAt || order.time || order.transactTime);
}

function normalizeOpenOrder(order = {}) {
  return {
    orderId: order.orderId || order.id || null,
    clientOrderId: order.clientOrderId || order.clientOrderID || null,
    orderListId: order.orderListId ?? order.listId ?? null,
    symbol: orderSymbol(order),
    side: safeUpper(order.side),
    type: safeUpper(order.type || order.orderType || order.kind),
    status: safeUpper(order.status || "OPEN"),
    role: order.role || order.kind || null,
    source: order.source || "exchange_rest"
  };
}

function normalizeIntent(intent = {}) {
  const status = `${intent.status || ""}`.toLowerCase();
  const unresolved = ["pending", "submitted", "ambiguous"].includes(status);
  return {
    id: intent.id || intent.intentId || null,
    symbol: orderSymbol(intent),
    kind: intent.kind || "exchange_action",
    status: intent.status || "unknown",
    unresolved,
    protective: `${intent.kind || ""}`.toLowerCase().includes("protect"),
    entry: `${intent.kind || ""}`.toLowerCase().includes("entry")
  };
}

export function auditOrderLifecycle({
  localOrders = [],
  paperOrders = [],
  openOrders = [],
  openOrderLists = [],
  positions = [],
  intents = [],
  now = new Date().toISOString(),
  config = {}
} = {}) {
  const nowMs = parseMs(now);
  const staleMs = Math.max(60_000, finite(config.orderLifecycleStaleMs, 15 * 60_000));
  const local = [...arr(localOrders), ...arr(paperOrders)];
  const exchangeOrders = arr(openOrders).map(normalizeOpenOrder);
  const exchangeLists = arr(openOrderLists).map((list) => ({
    orderListId: list.orderListId ?? list.listId ?? null,
    symbol: orderSymbol(list),
    status: safeUpper(list.listStatusType || list.listOrderStatus || list.status || "EXECUTING"),
    orders: arr(list.orders).map(normalizeOpenOrder),
    source: list.source || "exchange_rest"
  }));
  const exchangeOrderKeys = new Set(exchangeOrders.map(orderKey).filter(Boolean));
  for (const list of exchangeLists) {
    for (const order of list.orders) {
      const key = orderKey(order);
      if (key) exchangeOrderKeys.add(key);
    }
  }
  const localOrderKeys = new Set(local.map(orderKey).filter(Boolean));
  const unresolvedIntents = arr(intents).map(normalizeIntent).filter((intent) => intent.unresolved);
  const issues = [];
  const lifecycleRecords = [];
  const paperMirrors = [];

  for (const order of local) {
    const key = orderKey(order);
    const matched = key ? exchangeOrderKeys.has(key) : false;
    const age = Number.isFinite(orderUpdatedMs(order)) && Number.isFinite(nowMs)
      ? Math.max(0, nowMs - orderUpdatedMs(order))
      : null;
    if (isPaperOrder(order)) {
      paperMirrors.push({
        orderId: key || null,
        symbol: orderSymbol(order),
        status: safeUpper(order.status || "PAPER"),
        unresolved: isUnresolvedOrder(order)
      });
      continue;
    }
    if (isUnresolvedOrder(order) && !matched) {
      const stale = age == null || age > staleMs;
      issues.push({
        type: stale ? "local_only_stale_order" : "local_only_unconfirmed_order",
        severity: stale ? "degraded" : "warning",
        symbol: orderSymbol(order),
        orderId: key || null,
        ageMs: age,
        blocksEntries: stale
      });
    }
    lifecycleRecords.push({
      orderId: key || null,
      symbol: orderSymbol(order),
      localStatus: safeUpper(order.status || "unknown"),
      exchangeMatched: matched,
      protective: isProtectiveOrder(order),
      paperMirror: false
    });
  }

  for (const order of exchangeOrders) {
    const key = orderKey(order);
    if (!key || !localOrderKeys.has(key)) {
      issues.push({
        type: "exchange_only_order",
        severity: isProtectiveOrder(order) ? "blocked" : "degraded",
        symbol: order.symbol,
        orderId: key || null,
        blocksEntries: true,
        protective: isProtectiveOrder(order)
      });
    }
  }

  for (const position of arr(positions)) {
    const symbol = orderSymbol(position);
    const open = position.open !== false && safeUpper(position.status || "OPEN") !== "CLOSED";
    if (!open) continue;
    const protectiveOrderId = position.protectiveOrderId || position.stopOrderId || position.takeProfitOrderId || null;
    const protectiveListId = position.protectiveOrderListId ?? position.orderListId ?? position.ocoOrderListId ?? null;
    const matchedOrder = protectiveOrderId && exchangeOrderKeys.has(`${protectiveOrderId}`);
    const matchedList = protectiveListId && exchangeLists.some((list) => `${list.orderListId}` === `${protectiveListId}`);
    const intentionallyUnmanaged = position.protectOnly === true || position.manualReviewRequired === true || position.unmanaged === true;
    if ((protectiveOrderId || protectiveListId) && !matchedOrder && !matchedList && !intentionallyUnmanaged) {
      issues.push({
        type: "unknown_protective_order",
        severity: "blocked",
        symbol,
        orderId: protectiveOrderId || null,
        orderListId: protectiveListId || null,
        blocksEntries: true,
        protective: true
      });
    }
  }

  for (const intent of unresolvedIntents) {
    issues.push({
      type: intent.protective ? "unresolved_protection_intent" : intent.entry ? "unresolved_entry_intent" : "unresolved_execution_intent",
      severity: "blocked",
      symbol: intent.symbol || null,
      intentId: intent.id,
      blocksEntries: true,
      protective: intent.protective
    });
  }

  const severityRank = { ok: 0, warning: 1, degraded: 2, blocked: 3 };
  const maxSeverity = issues.reduce((max, issue) => Math.max(max, severityRank[issue.severity] || 0), 0);
  const status = maxSeverity >= 3 ? "blocked" : maxSeverity === 2 ? "degraded" : maxSeverity === 1 ? "warning" : "ok";
  const entryBlocked = issues.some((issue) => issue.blocksEntries);
  return {
    status,
    entryBlocked,
    issues,
    counts: {
      localOrders: local.length,
      exchangeOpenOrders: exchangeOrders.length,
      exchangeOrderLists: exchangeLists.length,
      openPositions: arr(positions).length,
      unresolvedIntents: unresolvedIntents.length,
      paperMirrorOrders: paperMirrors.length
    },
    orphanedOrders: issues.filter((issue) => issue.type === "exchange_only_order"),
    localOnlyOrders: issues.filter((issue) => issue.type === "local_only_stale_order" || issue.type === "local_only_unconfirmed_order"),
    unknownProtectiveOrders: issues.filter((issue) => issue.type === "unknown_protective_order"),
    paperMirrors,
    lifecycleRecords,
    recommendedAction: entryBlocked
      ? "manual_review_order_lifecycle_before_new_entries"
      : status === "degraded"
        ? "inspect_order_lifecycle_evidence"
        : "monitor",
    diagnosticsOnly: true,
    liveMutationAdded: false,
    forceCancelAdded: false
  };
}
