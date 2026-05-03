import crypto from "node:crypto";
import { validateProtectiveSellOcoGeometry } from "./liveBroker.js";
import { listExecutionIntents } from "./executionIntentLedger.js";
import { nowIso } from "../utils/time.js";

const DEFAULT_MIN_CONFIDENCE = 0.78;
const DEFAULT_MAX_ACTIONS = 5;
const ACTIVE_ORDER_STATUSES = new Set(["NEW", "PARTIALLY_FILLED", "PENDING_NEW", "EXECUTING"]);
const ACTIVE_LIST_STATUSES = new Set(["EXEC_STARTED", "EXECUTING", "NEW", "PARTIALLY_FILLED"]);
const UNRESOLVED_INTENT_KINDS = new Set(["entry", "protection"]);

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, safeNumber(value, min)));
}

function normalizeSymbol(symbol) {
  return `${symbol || ""}`.trim().toUpperCase();
}

function inferBaseAsset(symbol, rules = {}) {
  const explicit = rules.baseAsset || rules.base || rules.baseAssetName;
  if (explicit) {
    return `${explicit}`.trim().toUpperCase();
  }
  const normalized = normalizeSymbol(symbol);
  for (const quote of ["USDT", "FDUSD", "USDC", "BUSD", "BTC", "ETH", "BNB"]) {
    if (normalized.endsWith(quote) && normalized.length > quote.length) {
      return normalized.slice(0, -quote.length);
    }
  }
  return normalized.replace(/USDT$/, "");
}

function normalizeBalances(accountSnapshot = {}) {
  const balances = {};
  const source = accountSnapshot?.balances || accountSnapshot?.assets || accountSnapshot?.assetMap || {};
  if (Array.isArray(source)) {
    for (const item of source) {
      const asset = `${item?.asset || item?.a || ""}`.trim().toUpperCase();
      if (!asset) continue;
      const free = safeNumber(item.free ?? item.f ?? item.available, 0);
      const locked = safeNumber(item.locked ?? item.l ?? item.hold, 0);
      balances[asset] = { free, locked, total: free + locked };
    }
  } else {
    for (const [assetKey, item] of Object.entries(obj(source))) {
      const asset = `${item?.asset || assetKey || ""}`.trim().toUpperCase();
      if (!asset) continue;
      if (typeof item === "number") {
        balances[asset] = { free: item, locked: 0, total: item };
      } else {
        const free = safeNumber(item.free ?? item.available ?? item.total, 0);
        const locked = safeNumber(item.locked ?? item.hold, 0);
        balances[asset] = { free, locked, total: safeNumber(item.total, free + locked) };
      }
    }
  }
  return balances;
}

function getBalanceForSymbol(accountSnapshot, symbol, rules = {}) {
  const baseAsset = inferBaseAsset(symbol, rules);
  const balance = normalizeBalances(accountSnapshot)[baseAsset] || { free: 0, locked: 0, total: 0 };
  return { baseAsset, ...balance };
}

function getSymbolRules(symbolRules = {}, symbol) {
  const normalized = normalizeSymbol(symbol);
  return obj(symbolRules?.[normalized] || symbolRules?.[symbol] || {});
}

function activeOrdersForSymbol(openOrders = [], symbol) {
  const normalized = normalizeSymbol(symbol);
  return arr(openOrders).filter((order) => {
    const orderSymbol = normalizeSymbol(order?.symbol);
    const status = `${order?.status || ""}`.trim().toUpperCase();
    return orderSymbol === normalized && (!status || ACTIVE_ORDER_STATUSES.has(status));
  });
}

function activeOrderListsForSymbol(openOrderLists = [], symbol) {
  const normalized = normalizeSymbol(symbol);
  return arr(openOrderLists).filter((list) => {
    const listSymbol = normalizeSymbol(list?.symbol);
    const status = `${list?.listStatusType || list?.listOrderStatus || list?.status || ""}`.trim().toUpperCase();
    return listSymbol === normalized && (!status || ACTIVE_LIST_STATUSES.has(status));
  });
}

function hasProtectiveEvidence({ position = {}, openOrders = [], openOrderLists = [] } = {}) {
  const symbol = normalizeSymbol(position.symbol);
  const lists = activeOrderListsForSymbol(openOrderLists, symbol);
  const sellOrders = activeOrdersForSymbol(openOrders, symbol)
    .filter((order) => `${order?.side || ""}`.trim().toUpperCase() === "SELL");
  return Boolean(position.protectiveOrderListId || position.ocoOrderListId || lists.length || sellOrders.length);
}

function getRecentTrades(recentTradesBySymbol = {}, symbol) {
  const normalized = normalizeSymbol(symbol);
  if (Array.isArray(recentTradesBySymbol)) {
    return recentTradesBySymbol.filter((trade) => normalizeSymbol(trade?.symbol) === normalized);
  }
  return arr(recentTradesBySymbol?.[normalized] || recentTradesBySymbol?.[symbol] || []);
}

function hasRecentSellEvidence(trades = []) {
  return arr(trades).some((trade) => {
    const side = `${trade?.side || (trade?.isBuyer === false ? "SELL" : "")}`.trim().toUpperCase();
    const status = `${trade?.status || trade?.orderStatus || "FILLED"}`.trim().toUpperCase();
    return side === "SELL" && (!status || status === "FILLED" || status === "PARTIALLY_FILLED");
  });
}

function recentTradesContradictOpenState(trades = []) {
  return arr(trades).some((trade) => {
    const status = `${trade?.status || trade?.orderStatus || ""}`.trim().toUpperCase();
    return ["UNKNOWN", "EXPIRED", "REJECTED"].includes(status) || Boolean(trade?.ambiguous || trade?.unknownStatus);
  });
}

function resolveFreshness({ config = {}, accountSnapshot = {}, userStreamSnapshot = {} } = {}) {
  const requireFresh = config.autoReconcileRequireFreshStreamOrRest !== false;
  const streamFresh = Boolean(
    userStreamSnapshot?.fresh ||
    userStreamSnapshot?.status === "fresh" ||
    userStreamSnapshot?.connected === true && userStreamSnapshot?.stale !== true
  );
  const restFresh = Boolean(
    accountSnapshot?.fresh ||
    accountSnapshot?.status === "fresh" ||
    accountSnapshot?.updatedAt ||
    accountSnapshot?.lastUpdatedAt ||
    accountSnapshot?.serverTime
  );
  const stale = Boolean(userStreamSnapshot?.stale || accountSnapshot?.stale);
  return {
    requireFresh,
    streamFresh,
    restFresh,
    stale,
    sufficient: !requireFresh || ((streamFresh || restFresh) && !stale)
  };
}

function userRestConflict(userStreamSnapshot = {}, accountSnapshot = {}) {
  if (userStreamSnapshot?.conflict || accountSnapshot?.conflict) {
    return true;
  }
  const streamBalances = normalizeBalances(userStreamSnapshot?.accountSnapshot || userStreamSnapshot);
  const restBalances = normalizeBalances(accountSnapshot);
  for (const [asset, streamBalance] of Object.entries(streamBalances)) {
    const restBalance = restBalances[asset];
    if (!restBalance) continue;
    if (Math.abs(safeNumber(streamBalance.total, 0) - safeNumber(restBalance.total, 0)) > 1e-8) {
      return true;
    }
  }
  return false;
}

function getMarketMid(snapshot = {}) {
  return safeNumber(
    snapshot?.book?.mid ??
    snapshot?.mid ??
    snapshot?.markPrice ??
    snapshot?.price ??
    snapshot?.lastPrice,
    0
  );
}

function buildGeometryValidation({ position = {}, rules = {}, marketSnapshot = {}, config = {} } = {}) {
  const currentMid = getMarketMid(marketSnapshot);
  const stopTriggerPrice = safeNumber(position.stopLossPrice ?? position.stopPrice ?? position.stopTriggerPrice, 0);
  const buffer = Math.max(0, safeNumber(config.liveStopLimitBufferPct, 0.002));
  const stopLimitPrice = safeNumber(position.stopLimitPrice, stopTriggerPrice > 0 ? stopTriggerPrice * (1 - buffer) : 0);
  const takeProfitPrice = safeNumber(position.takeProfitPrice ?? position.targetPrice ?? position.takeProfit, 0);
  return validateProtectiveSellOcoGeometry({
    takeProfitPrice,
    stopTriggerPrice,
    stopLimitPrice,
    currentMid,
    currentBid: safeNumber(marketSnapshot?.book?.bid ?? marketSnapshot?.bid, 0) || null,
    currentAsk: safeNumber(marketSnapshot?.book?.ask ?? marketSnapshot?.ask, 0) || null,
    symbol: position.symbol,
    lifecycleState: position.lifecycleState || null
  });
}

function positionHasBlockingState(position = {}) {
  return Boolean(position.reconcileRequired || position.manualReviewRequired)
    || ["manual_review", "reconcile_required"].includes(`${position.lifecycleState || ""}`.toLowerCase());
}

function isPositionProtected(position = {}) {
  if (position.quantity <= 0) return true;
  if (position.protectiveOrderListId || position.ocoOrderListId) return true;
  const state = `${position.lifecycleState || ""}`.toLowerCase();
  return ["protected", "protect_only", "intentionally_unmanaged"].includes(state)
    || position.operatorMode === "protect_only"
    || position.intentionalUnmanaged === true;
}

function buildAction(type, symbol, patch = {}) {
  return {
    actionId: `auto-reconcile:${type}:${symbol || "global"}:${crypto.randomUUID()}`,
    type,
    symbol: symbol || null,
    ...patch
  };
}

function summarizeBlockingPositions(positions = []) {
  return arr(positions)
    .filter((position) => positionHasBlockingState(position) || !isPositionProtected(position))
    .map((position) => ({
      symbol: normalizeSymbol(position.symbol) || null,
      positionId: position.id || null,
      reconcileRequired: Boolean(position.reconcileRequired),
      manualReviewRequired: Boolean(position.manualReviewRequired),
      lifecycleState: position.lifecycleState || null,
      protected: isPositionProtected(position)
    }));
}

function planStatus({ actions, manualReviewRequired, blockingReasons, entryUnlockEligible }) {
  if (manualReviewRequired) return "needs_manual_review";
  if (blockingReasons.length && !actions.length) return "blocked";
  if (actions.some((action) => action.type === "rebuild_protective_order")) return "needs_protective_rebuild";
  if (actions.length) return "can_auto_fix";
  return entryUnlockEligible ? "nothing_to_do" : "blocked";
}

function resolveAutoReconcileConfig(config = {}) {
  const minConfidence = Math.max(DEFAULT_MIN_CONFIDENCE, safeNumber(config.autoReconcileMinConfidence, DEFAULT_MIN_CONFIDENCE));
  return {
    enabled: config.autoReconcileEnabled ?? config.enableAutoReconcile ?? true,
    allowFlatClose: config.autoReconcileAllowFlatClose !== false,
    allowProtectiveRebuild: config.autoReconcileAllowProtectiveRebuild !== false,
    minConfidence,
    requireFreshStreamOrRest: config.autoReconcileRequireFreshStreamOrRest !== false,
    maxActionsPerRun: Math.max(1, Math.round(safeNumber(config.autoReconcileMaxActionsPerRun, DEFAULT_MAX_ACTIONS))),
    liveStopLimitBufferPct: safeNumber(config.liveStopLimitBufferPct, 0.002)
  };
}

export function buildAutoReconcilePlan({
  config = {},
  runtime = {},
  positions = runtime.openPositions || [],
  accountSnapshot = {},
  openOrders = [],
  openOrderLists = [],
  recentTradesBySymbol = {},
  userStreamSnapshot = {},
  marketSnapshots = runtime.latestMarketSnapshots || {},
  symbolRules = {}
} = {}) {
  const settings = resolveAutoReconcileConfig(config);
  const actions = [];
  const blockingReasons = [];
  const evidence = {
    checkedAt: nowIso(),
    positionsChecked: arr(positions).length,
    blockingPositions: [],
    freshEvidence: resolveFreshness({ config: settings, accountSnapshot, userStreamSnapshot }),
    conflicts: []
  };
  let confidence = 0.96;
  let manualReviewRequired = false;

  if (!settings.enabled) {
    return {
      status: "blocked",
      entryUnlockEligible: false,
      actions: [],
      blockingReasons: ["auto_reconcile_disabled"],
      evidence,
      confidence: 0,
      manualReviewRequired: true
    };
  }

  if (!evidence.freshEvidence.sufficient) {
    blockingReasons.push("fresh_exchange_evidence_required");
    confidence = Math.min(confidence, 0.45);
  }
  if (userRestConflict(userStreamSnapshot, accountSnapshot)) {
    blockingReasons.push("rest_user_stream_conflict");
    evidence.conflicts.push("rest_user_stream_conflict");
    manualReviewRequired = true;
    confidence = Math.min(confidence, 0.35);
  }

  for (const position of arr(positions)) {
    if (!position?.symbol) continue;
    const symbol = normalizeSymbol(position.symbol);
    const rules = getSymbolRules(symbolRules, symbol);
    const quantity = safeNumber(position.quantity, 0);
    const minQty = Math.max(0, safeNumber(rules.minQty, 0));
    const dustThreshold = Math.max(minQty, safeNumber(rules.dustThresholdQty ?? rules.stepSize, 0), 1e-9);
    const balance = getBalanceForSymbol(accountSnapshot, symbol, rules);
    const symbolOrders = activeOrdersForSymbol(openOrders, symbol);
    const symbolLists = activeOrderListsForSymbol(openOrderLists, symbol);
    const recentTrades = getRecentTrades(recentTradesBySymbol, symbol);
    const protectedEvidence = hasProtectiveEvidence({ position, openOrders, openOrderLists });
    const localOpen = quantity > dustThreshold;
    const exchangeOpen = balance.total > dustThreshold;
    const exchangeFlat = balance.total <= dustThreshold;
    const manualReasons = [];
    const positionEvidence = {
      symbol,
      positionId: position.id || null,
      localQuantity: quantity,
      baseAsset: balance.baseAsset,
      exchangeBaseTotal: balance.total,
      openOrderCount: symbolOrders.length,
      openOrderListCount: symbolLists.length,
      protectedEvidence,
      recentTradeCount: recentTrades.length
    };

    if (recentTradesContradictOpenState(recentTrades)) {
      manualReasons.push("unknown_or_ambiguous_recent_trade_status");
    }
    if (symbolOrders.some((order) => `${order?.status || ""}`.toUpperCase() === "PARTIALLY_FILLED")) {
      manualReasons.push("partial_fill_without_final_status");
    }
    if (symbolOrders.length && !symbolOrders.every((order) => `${order?.side || ""}`.toUpperCase() === "SELL")) {
      manualReasons.push("unexpected_open_order_side");
    }
    if (localOpen && exchangeOpen && Math.abs(quantity - balance.total) > Math.max(dustThreshold, safeNumber(config.qtyMismatchTolerance, 0))) {
      manualReasons.push("account_balance_mismatch_above_tolerance");
    }

    if (manualReasons.length) {
      manualReviewRequired = true;
      confidence = Math.min(confidence, 0.4);
      blockingReasons.push(...manualReasons.map((reason) => `${symbol}:${reason}`));
      evidence.blockingPositions.push({ ...positionEvidence, manualReasons });
      actions.push(buildAction("manual_review", symbol, {
        positionId: position.id || null,
        reasons: manualReasons,
        evidence: positionEvidence
      }));
      continue;
    }

    if (position.reconcileRequired && localOpen && exchangeOpen && protectedEvidence && evidence.freshEvidence.sufficient) {
      actions.push(buildAction("clear_local_reconcile_flag", symbol, {
        positionId: position.id || null,
        reason: "exchange_account_and_protection_match_local_state",
        evidence: positionEvidence
      }));
      continue;
    }

    if (settings.allowFlatClose && localOpen && exchangeFlat && !symbolOrders.length && !symbolLists.length && hasRecentSellEvidence(recentTrades) && evidence.freshEvidence.sufficient) {
      actions.push(buildAction("mark_position_flat_confirmed", symbol, {
        positionId: position.id || null,
        reason: "exchange_flat_no_orders_recent_sell_evidence",
        evidence: positionEvidence
      }));
      continue;
    }

    if (localOpen && exchangeOpen && !protectedEvidence) {
      if (!config.enableExchangeProtection) {
        manualReviewRequired = true;
        blockingReasons.push(`${symbol}:exchange_protection_disabled`);
        actions.push(buildAction("manual_review", symbol, {
          positionId: position.id || null,
          reasons: ["exchange_protection_disabled"],
          evidence: positionEvidence
        }));
        continue;
      }
      if (!settings.allowProtectiveRebuild) {
        blockingReasons.push(`${symbol}:protective_rebuild_disabled`);
        confidence = Math.min(confidence, 0.55);
        continue;
      }
      const marketSnapshot = obj(marketSnapshots?.[symbol] || marketSnapshots?.[position.symbol] || position.marketSnapshot || {});
      const validation = buildGeometryValidation({ position, rules, marketSnapshot, config: settings });
      if (!validation.valid) {
        manualReviewRequired = true;
        confidence = Math.min(confidence, 0.42);
        blockingReasons.push(`${symbol}:protective_oco_geometry_invalid`);
        actions.push(buildAction("manual_review", symbol, {
          positionId: position.id || null,
          reasons: ["protective_oco_geometry_invalid"],
          geometry: validation,
          evidence: positionEvidence
        }));
        continue;
      }
      actions.push(buildAction("rebuild_protective_order", symbol, {
        positionId: position.id || null,
        reason: "open_position_missing_protective_order",
        geometry: validation,
        evidence: positionEvidence
      }));
      continue;
    }

    if (positionHasBlockingState(position)) {
      blockingReasons.push(`${symbol}:manual_or_reconcile_state_requires_review`);
      evidence.blockingPositions.push(positionEvidence);
      confidence = Math.min(confidence, 0.6);
    }
  }

  if (actions.length > settings.maxActionsPerRun) {
    blockingReasons.push("auto_reconcile_action_limit_reached");
    actions.length = settings.maxActionsPerRun;
  }

  if (confidence < settings.minConfidence) {
    blockingReasons.push("auto_reconcile_confidence_below_minimum");
    if (!actions.some((action) => action.type === "manual_review")) {
      actions.push(buildAction("manual_review", null, {
        reasons: ["auto_reconcile_confidence_below_minimum"],
        evidence: { confidence, minConfidence: settings.minConfidence }
      }));
    }
    manualReviewRequired = true;
  }

  const entryUnlockEligible = !manualReviewRequired
    && blockingReasons.length === 0
    && actions.every((action) => ["clear_local_reconcile_flag", "clear_exchange_safety_block"].includes(action.type))
    && arr(positions).every((position) => !positionHasBlockingState(position) || actions.some((action) =>
      action.type === "clear_local_reconcile_flag" && action.positionId === position.id
    ));

  const hasExistingSafetyBlock = Boolean(
    runtime.exchangeTruth?.freezeEntries ||
    runtime.exchangeSafety?.freezeEntries ||
    runtime.exchangeSafety?.globalFreezeEntries ||
    runtime.exchangeSafety?.status === "blocked"
  );
  if (entryUnlockEligible && (hasExistingSafetyBlock || actions.length > 0)) {
    actions.push(buildAction("clear_exchange_safety_block", null, {
      reason: "auto_reconcile_evidence_supports_entry_unlock",
      evidence: { freshEvidence: evidence.freshEvidence }
    }));
  }

  evidence.blockingPositions = evidence.blockingPositions.length
    ? evidence.blockingPositions
    : summarizeBlockingPositions(positions);

  return {
    status: planStatus({ actions, manualReviewRequired, blockingReasons, entryUnlockEligible }),
    entryUnlockEligible,
    actions,
    blockingReasons: [...new Set(blockingReasons)],
    evidence,
    confidence: clamp(confidence),
    manualReviewRequired
  };
}

export function evaluateExchangeSafetyUnlock({
  plan = {},
  runtime = {},
  alerts = runtime.alerts || runtime.ops?.alerts?.items || [],
  intents = listExecutionIntents(runtime, { unresolvedOnly: true }),
  positions = runtime.openPositions || []
} = {}) {
  const stillBlockedReasons = [];
  const criticalAlerts = arr(alerts).filter((alert) => `${alert?.severity || ""}`.toLowerCase() === "critical");
  const unresolvedIntents = arr(intents).filter((intent) => UNRESOLVED_INTENT_KINDS.has(`${intent?.kind || ""}`.toLowerCase()));
  const blockingPositions = arr(positions).filter((position) => positionHasBlockingState(position) || !isPositionProtected(position));

  if (!plan.entryUnlockEligible) stillBlockedReasons.push("auto_reconcile_plan_not_unlock_eligible");
  if (arr(plan.blockingReasons).length) stillBlockedReasons.push(...arr(plan.blockingReasons));
  if (criticalAlerts.length) stillBlockedReasons.push("critical_alert_active");
  if (unresolvedIntents.length) stillBlockedReasons.push("unresolved_execution_intent");
  for (const position of blockingPositions) {
    stillBlockedReasons.push(`${normalizeSymbol(position.symbol) || "position"}:${position.manualReviewRequired ? "manual_review_required" : position.reconcileRequired ? "reconcile_required" : "unprotected_position"}`);
  }

  const requiresManualReview = Boolean(plan.manualReviewRequired)
    || criticalAlerts.length > 0
    || blockingPositions.some((position) => position.manualReviewRequired);
  const canUnlockEntries = stillBlockedReasons.length === 0 && !requiresManualReview;
  return {
    canUnlockEntries,
    unlockReasons: canUnlockEntries ? ["exchange_truth_consistent", "no_unresolved_reconcile_or_intents", "positions_protected_or_flat"] : [],
    stillBlockedReasons: [...new Set(stillBlockedReasons)],
    requiresManualReview
  };
}

export function explainExchangeSafetyBlock({
  runtimeState = {},
  positions = runtimeState.openPositions || [],
  intents = listExecutionIntents(runtimeState, { unresolvedOnly: true }),
  alerts = runtimeState.alerts || runtimeState.ops?.alerts?.items || [],
  exchangeSummary = runtimeState.exchangeSafety || runtimeState.exchangeTruth || {}
} = {}) {
  const blockingReasons = [];
  const requiredEvidence = [];
  const criticalAlerts = arr(alerts).filter((alert) => `${alert?.severity || ""}`.toLowerCase() === "critical");
  const unresolvedIntents = arr(intents).filter((intent) => UNRESOLVED_INTENT_KINDS.has(`${intent?.kind || ""}`.toLowerCase()));
  const blockingPositions = arr(positions).filter((position) => positionHasBlockingState(position) || !isPositionProtected(position));
  const exchangeBlocked = Boolean(
    runtimeState.exchangeTruth?.freezeEntries ||
    runtimeState.exchangeSafety?.freezeEntries ||
    runtimeState.exchangeSafety?.globalFreezeEntries ||
    runtimeState.exchangeSafety?.status === "blocked" ||
    exchangeSummary.freezeEntries ||
    exchangeSummary.globalFreezeEntries ||
    exchangeSummary.status === "blocked"
  );

  if (exchangeBlocked) {
    blockingReasons.push("exchange_safety_blocked");
    requiredEvidence.push("fresh_account_snapshot", "fresh_open_orders_or_user_stream_truth", "recent_trade_consistency");
  }
  if (criticalAlerts.length) {
    blockingReasons.push("critical_alert_active");
    requiredEvidence.push("critical_alert_resolved");
  }
  if (unresolvedIntents.length) {
    blockingReasons.push("unresolved_execution_intent");
    requiredEvidence.push("execution_intent_resolved_or_expired");
  }
  for (const position of blockingPositions) {
    const symbol = normalizeSymbol(position.symbol) || "position";
    const reason = position.manualReviewRequired
      ? "manual_review_required"
      : position.reconcileRequired
        ? "reconcile_required"
        : "unprotected_position";
    blockingReasons.push(`${symbol}:${reason}`);
    if (reason === "unprotected_position") {
      requiredEvidence.push(`${symbol}:protective_order_or_explicit_unmanaged_state`);
    } else {
      requiredEvidence.push(`${symbol}:reconcile_evidence`);
    }
  }

  const uniqueReasons = [...new Set(blockingReasons)];
  const uniqueEvidence = [...new Set(requiredEvidence)];
  const staleBlockerSuspected = exchangeBlocked
    && uniqueReasons.length === 1
    && !blockingPositions.length
    && !criticalAlerts.length
    && !unresolvedIntents.length
    && !arr(exchangeSummary.blockingReasons).length
    && !exchangeSummary.manualReviewRequired
    && !exchangeSummary.reconcileRequired;
  const entryBlocked = uniqueReasons.length > 0;
  const safeNextAction = !entryBlocked
    ? "entries_can_resume_if_risk_allows"
    : staleBlockerSuspected
      ? "run_reconcile_plan_to_confirm_stale_blocker"
      : unresolvedIntents.length
        ? "resolve_or_wait_for_execution_intents"
        : criticalAlerts.length
          ? "resolve_critical_alerts"
          : blockingPositions.some((position) => !isPositionProtected(position) && !position.reconcileRequired && !position.manualReviewRequired)
            ? "rebuild_or_verify_protection"
            : "run_reconcile_plan_or_manual_review";

  return {
    entryBlocked,
    blockingReasons: uniqueReasons,
    staleBlockerSuspected,
    requiredEvidence: uniqueEvidence,
    safeNextAction,
    blockingPositions: summarizeBlockingPositions(blockingPositions)
  };
}

function findPosition(runtime = {}, action = {}) {
  return arr(runtime.openPositions).find((position) =>
    (action.positionId && position.id === action.positionId) ||
    normalizeSymbol(position.symbol) === normalizeSymbol(action.symbol)
  ) || null;
}

function appendAudit(runtime = {}, audit = {}) {
  runtime.exchangeSafety = runtime.exchangeSafety || {};
  runtime.exchangeTruth = runtime.exchangeTruth || {};
  runtime.exchangeSafety.autoReconcileActionTrail = [
    audit,
    ...arr(runtime.exchangeSafety.autoReconcileActionTrail)
  ].slice(0, 50);
  runtime.exchangeTruth.autoReconcileAudits = [
    {
      checkedAt: audit.timestamp,
      symbol: audit.symbol,
      action: audit.type,
      result: audit.result,
      evidence: audit.evidence
    },
    ...arr(runtime.exchangeTruth.autoReconcileAudits)
  ].slice(0, 50);
}

export async function runAutoReconcilePlan({ broker = null, runtime = {}, plan = {}, logger = null } = {}) {
  const results = [];
  for (const action of arr(plan.actions)) {
    const timestamp = nowIso();
    const position = findPosition(runtime, action);
    const before = position ? {
      reconcileRequired: Boolean(position.reconcileRequired),
      manualReviewRequired: Boolean(position.manualReviewRequired),
      lifecycleState: position.lifecycleState || null,
      quantity: safeNumber(position.quantity, 0),
      protectiveOrderListId: position.protectiveOrderListId || null
    } : null;
    let result = "skipped";
    let error = null;
    try {
      if (action.type === "clear_local_reconcile_flag" && position) {
        if (broker?.clearPositionReconcileFlags) {
          broker.clearPositionReconcileFlags(position, { reason: action.reason, evidenceSummary: action.evidence });
        } else {
          position.reconcileRequired = false;
          position.manualReviewRequired = false;
          position.lifecycleState = position.protectiveOrderListId ? "protected" : "open";
          position.lastAutoReconcileAction = action.type;
          position.lastAutoReconcileAt = timestamp;
        }
        result = "applied";
      } else if (action.type === "mark_position_flat_confirmed" && position) {
        position.autoReconcileFlatConfirmedAt = timestamp;
        position.closedAt = position.closedAt || timestamp;
        position.closeReason = position.closeReason || "auto_reconcile_flat_confirmed";
        position.quantity = 0;
        position.reconcileRequired = false;
        position.manualReviewRequired = false;
        position.lifecycleState = "closed";
        runtime.autoReconcileLocalClosures = [
          { symbol: position.symbol, positionId: position.id || null, at: timestamp, evidence: action.evidence },
          ...arr(runtime.autoReconcileLocalClosures)
        ].slice(0, 50);
        runtime.openPositions = arr(runtime.openPositions).filter((item) => item !== position && item.id !== position.id);
        result = "applied";
      } else if (action.type === "rebuild_protective_order" && position) {
        if (!broker?.ensureProtectiveOrder) {
          result = "skipped_broker_method_unavailable";
        } else {
          const rules = broker.symbolRules?.[action.symbol] || broker.symbolRules?.[position.symbol] || {};
          const marketSnapshot = runtime.latestMarketSnapshots?.[action.symbol] || runtime.latestMarketSnapshots?.[position.symbol] || null;
          await broker.ensureProtectiveOrder(position, rules, runtime, "auto_reconcile_protective_rebuild", marketSnapshot);
          result = "applied";
        }
      } else if (action.type === "clear_exchange_safety_block") {
        runtime.exchangeTruth = {
          ...(runtime.exchangeTruth || {}),
          freezeEntries: false,
          status: "ready",
          lastAutoReconcileUnlockAt: timestamp
        };
        runtime.exchangeSafety = {
          ...(runtime.exchangeSafety || {}),
          status: "ready",
          freezeEntries: false,
          globalFreezeEntries: false,
          globalFreezeReason: null,
          lastAutoReconcileUnlockAt: timestamp
        };
        runtime.postReconcileProbation = {
          ...(runtime.postReconcileProbation || {}),
          active: true,
          status: "active",
          startedAt: runtime.postReconcileProbation?.startedAt || timestamp,
          reason: action.reason || "auto_reconcile_unlock",
          entriesThisCycle: 0,
          lastUnlockAt: timestamp
        };
        runtime.exchangeSafety.postReconcileProbation = runtime.postReconcileProbation;
        result = "applied";
      } else if (action.type === "manual_review") {
        result = "manual_review_required";
      }
    } catch (caught) {
      error = caught?.message || "auto_reconcile_action_failed";
      result = "failed";
      logger?.warn?.("Auto reconcile action failed", { type: action.type, symbol: action.symbol, error });
    }
    const afterPosition = findPosition(runtime, action);
    const audit = {
      actionId: action.actionId,
      type: action.type,
      symbol: action.symbol || null,
      before,
      after: afterPosition ? {
        reconcileRequired: Boolean(afterPosition.reconcileRequired),
        manualReviewRequired: Boolean(afterPosition.manualReviewRequired),
        lifecycleState: afterPosition.lifecycleState || null,
        quantity: safeNumber(afterPosition.quantity, 0),
        protectiveOrderListId: afterPosition.protectiveOrderListId || null
      } : null,
      evidence: action.evidence || null,
      result,
      error,
      timestamp
    };
    appendAudit(runtime, audit);
    results.push(audit);
  }
  return {
    status: results.some((item) => item.result === "failed") ? "partial_failure" : "completed",
    appliedCount: results.filter((item) => item.result === "applied").length,
    manualReviewRequired: Boolean(plan.manualReviewRequired) || results.some((item) => item.result === "manual_review_required"),
    results
  };
}

export function buildExchangeSafetyStatus({ plan = {}, unlock = {}, runtime = {} } = {}) {
  const blockingPositions = summarizeBlockingPositions(runtime.openPositions || []);
  return {
    status: unlock.canUnlockEntries ? "ready" : (plan.status || "unknown"),
    entryBlocked: !unlock.canUnlockEntries,
    autoReconcileStatus: plan.status || "unknown",
    blockingPositions,
    nextAction: plan.actions?.[0]?.type || (unlock.canUnlockEntries ? "entries_can_resume" : "manual_review"),
    entryUnlockEligible: Boolean(plan.entryUnlockEligible && unlock.canUnlockEntries),
    blockingReasons: arr(unlock.stillBlockedReasons).length ? unlock.stillBlockedReasons : arr(plan.blockingReasons),
    confidence: Number.isFinite(plan.confidence) ? plan.confidence : null,
    manualReviewRequired: Boolean(plan.manualReviewRequired || unlock.requiresManualReview)
  };
}
