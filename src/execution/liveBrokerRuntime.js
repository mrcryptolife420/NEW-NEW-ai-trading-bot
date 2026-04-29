import crypto from "node:crypto";
import { nowIso } from "../utils/time.js";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function roundNumber(value, decimals = 8, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(decimals)) : fallback;
}

export function safeUpper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

export function isRetriableExchangeError(error) {
  return ["AbortError", "TimeoutError"].includes(error?.name)
    || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNABORTED"].includes(error?.code)
    || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNABORTED"].includes(error?.cause?.code);
}

export function normalizeTradeSide(trade = {}) {
  if (typeof trade.isBuyer === "boolean") {
    return trade.isBuyer ? "BUY" : "SELL";
  }
  if (typeof trade.isBuyerMaker === "boolean") {
    return trade.isBuyerMaker ? "SELL" : "BUY";
  }
  return safeUpper(trade.side || trade.orderSide || "");
}

export function averageTradePrice(trades = [], side = null) {
  const filtered = (trades || []).filter((trade) => {
    if (!side) {
      return true;
    }
    return normalizeTradeSide(trade) === side;
  });
  const totalQty = filtered.reduce((sum, trade) => sum + safeNumber(trade.qty || trade.executedQty, 0), 0);
  if (!totalQty) {
    return null;
  }
  const totalQuote = filtered.reduce((sum, trade) => {
    const quoteQty = safeNumber(trade.quoteQty || trade.cummulativeQuoteQty, Number.NaN);
    if (Number.isFinite(quoteQty) && quoteQty > 0) {
      return sum + quoteQty;
    }
    return sum + safeNumber(trade.price, 0) * safeNumber(trade.qty || trade.executedQty, 0);
  }, 0);
  return totalQuote > 0 ? totalQuote / totalQty : null;
}

export function isActiveExchangeOrderStatus(status) {
  return ["NEW", "PARTIALLY_FILLED", "PENDING_NEW"].includes(`${status || ""}`.toUpperCase());
}

export function toAssetMap(account) {
  return Object.fromEntries(
    (account.balances || []).map((asset) => [
      asset.asset,
      {
        free: Number(asset.free || 0),
        locked: Number(asset.locked || 0),
        total: Number(asset.free || 0) + Number(asset.locked || 0)
      }
    ])
  );
}

export function ensureLifecycleJournal(runtime) {
  if (!runtime) {
    return null;
  }
  runtime.orderLifecycle = runtime.orderLifecycle || { lastUpdatedAt: null, positions: {}, recentTransitions: [], pendingActions: [], activeActions: {}, actionJournal: [] };
  runtime.orderLifecycle.activeActions = runtime.orderLifecycle.activeActions && typeof runtime.orderLifecycle.activeActions === "object"
    ? runtime.orderLifecycle.activeActions
    : {};
  runtime.orderLifecycle.actionJournal = Array.isArray(runtime.orderLifecycle.actionJournal)
    ? runtime.orderLifecycle.actionJournal
    : [];
  return runtime.orderLifecycle;
}

export function startLifecycleAction(runtime, action = {}) {
  const lifecycle = ensureLifecycleJournal(runtime);
  if (!lifecycle) {
    return null;
  }
  const id = action.id || crypto.randomUUID();
  lifecycle.activeActions[id] = {
    id,
    type: action.type || "exchange_action",
    symbol: action.symbol || null,
    positionId: action.positionId || null,
    status: "pending",
    stage: action.stage || "queued",
    severity: action.severity || "neutral",
    startedAt: nowIso(),
    updatedAt: nowIso(),
    detail: action.detail || null
  };
  return id;
}

export function touchLifecycleAction(runtime, actionId, patch = {}) {
  const lifecycle = ensureLifecycleJournal(runtime);
  if (!lifecycle || !actionId || !lifecycle.activeActions[actionId]) {
    return null;
  }
  lifecycle.activeActions[actionId] = {
    ...lifecycle.activeActions[actionId],
    ...patch,
    updatedAt: nowIso()
  };
  return lifecycle.activeActions[actionId];
}

export function finishLifecycleAction(runtime, actionId, patch = {}) {
  const lifecycle = ensureLifecycleJournal(runtime);
  if (!lifecycle || !actionId) {
    return null;
  }
  const active = lifecycle.activeActions[actionId] || { id: actionId };
  delete lifecycle.activeActions[actionId];
  lifecycle.actionJournal.unshift({
    ...active,
    ...patch,
    completedAt: nowIso(),
    updatedAt: nowIso(),
    status: patch.status || active.status || "completed"
  });
  lifecycle.actionJournal = lifecycle.actionJournal.slice(0, 80);
  return lifecycle.actionJournal[0];
}
