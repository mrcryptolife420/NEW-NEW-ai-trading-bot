import { normalizeQuantity } from "../binance/symbolFilters.js";
import { nowIso } from "../utils/time.js";
import {
  sleep,
  safeNumber,
  roundNumber,
  safeUpper,
  isRetriableExchangeError,
  averageTradePrice,
  isActiveExchangeOrderStatus,
  toAssetMap
} from "./liveBrokerRuntime.js";

export const AUTO_RECONCILE_DECISION = {
  SAFE_AUTOFIX: "SAFE_AUTOFIX",
  TRANSIENT_RETRY: "TRANSIENT_RETRY",
  NEEDS_MANUAL_REVIEW: "NEEDS_MANUAL_REVIEW"
};

function isDemoPaperMode(config = {}) {
  return (config.botMode || "paper") === "paper" && `${config.paperExecutionVenue || ""}`.toLowerCase() === "binance_demo_spot";
}

function hasUnsellableDustResidual(evidence = {}) {
  return Boolean(evidence.unsellableDustResidual);
}

function venueFlatForDemoPaper(evidence = {}, config = {}) {
  if (!isDemoPaperMode(config)) {
    return Boolean(evidence.noVenuePosition);
  }
  return Boolean(evidence.noVenuePosition || evidence.unsellableDustResidual);
}

function nextPriceMismatchStage(position = {}) {
  const nextCount = Math.max(1, Math.round(safeNumber(position.priceMismatchEscalationCount, 0)) + 1);
  if (nextCount >= 3) {
    return { count: nextCount, stage: "manual_review" };
  }
  if (nextCount >= 2) {
    return { count: nextCount, stage: "protect_only" };
  }
  return { count: nextCount, stage: "warning" };
}

export function getAutoReconcileConfig(config = {}) {
  return {
    enabled: config.enableAutoReconcile !== false,
    retryCount: Math.max(0, Math.round(safeNumber(config.autoReconcileRetryCount, 2))),
    retryDelayMs: Math.max(0, Math.round(safeNumber(config.autoReconcileRetryDelayMs, 1200))),
    qtyMismatchTolerance: Math.max(0, safeNumber(config.qtyMismatchTolerance, 0)),
    priceMismatchToleranceBps: Math.max(0, safeNumber(config.priceMismatchToleranceBps, 35)),
    maxAutoFixNotional: Math.max(1, safeNumber(config.maxAutoFixNotional, 750)),
    dryRun: Boolean(config.autoReconcileDryRun)
  };
}

export async function fetchReconcileCollection(fetcher, fallback = []) {
  try {
    const value = await fetcher();
    return {
      items: Array.isArray(value) ? value : fallback,
      error: null
    };
  } catch (error) {
    return {
      items: fallback,
      error
    };
  }
}

export async function fetchRecentTrades(client, symbol, limit = 8) {
  if (!client?.getMyTrades || !symbol) {
    return { trades: [], error: null };
  }
  try {
    const trades = await client.getMyTrades(symbol, { limit });
    return {
      trades: Array.isArray(trades) ? trades : [],
      error: null
    };
  } catch (error) {
    return {
      trades: [],
      error
    };
  }
}

export async function fetchReconcileRetrySnapshot(broker, symbol, runtime) {
  const account = await broker.client.getAccountInfo(true);
  const openOrdersResult = broker.client.getOpenOrders
    ? await fetchReconcileCollection(() => broker.client.getOpenOrders(), [])
    : { items: [], error: null };
  const openOrderListsResult = broker.client.getOpenOrderLists
    ? await fetchReconcileCollection(() => broker.client.getOpenOrderLists(), [])
    : { items: [], error: null };
  const recentTradesResult = await fetchRecentTrades(broker.client, symbol, 8);
  return {
    assetMap: toAssetMap(account),
    trackedOpenOrders: [...(openOrdersResult.items || [])],
    openOrderLists: [...(openOrderListsResult.items || [])],
    recentTrades: recentTradesResult.trades || [],
    marketSnapshot: null,
    snapshotErrors: [
      openOrdersResult.error ? { source: "open_orders", error: openOrdersResult.error.message } : null,
      openOrderListsResult.error ? { source: "open_order_lists", error: openOrderListsResult.error.message } : null,
      recentTradesResult.error ? { source: "recent_trades", error: recentTradesResult.error.message } : null
    ].filter(Boolean),
    fetchedAt: nowIso(),
    runtime
  };
}

export function summarizeReconcileEvidence(evidence = {}) {
  return {
    runtimeQuantity: roundNumber(evidence.runtimeQuantity || 0, 8),
    exchangeQuantity: roundNumber(evidence.exchangeQuantity || 0, 8),
    exchangeTotalQuantity: roundNumber(evidence.exchangeTotalQuantity || 0, 8),
    exchangeLockedQuantity: roundNumber(evidence.exchangeLockedQuantity || 0, 8),
    exchangeFreeQuantity: roundNumber(evidence.exchangeFreeQuantity || 0, 8),
    protectedQuantity: roundNumber(evidence.protectedQuantity || 0, 8),
    managedComparisonQuantity: roundNumber(evidence.managedComparisonQuantity || 0, 8),
    unmanagedResidualQuantity: roundNumber(evidence.unmanagedResidualQuantity || 0, 8),
    freeResidualExplainable: Boolean(evidence.freeResidualExplainable),
    quantityComparisonBasis: evidence.quantityComparisonBasis || "total",
    quantityDiff: roundNumber(evidence.quantityDiff || 0, 8),
    quantityTolerance: roundNumber(evidence.quantityTolerance || 0, 8),
    qtyWithinTolerance: Boolean(evidence.qtyWithinTolerance),
    priceMismatchBps: roundNumber(evidence.priceMismatchBps, 2, null),
    openOrderCount: evidence.openOrderCount || 0,
    unexpectedOrderCount: evidence.unexpectedOrderCount || 0,
    unexpectedSides: [...(evidence.unexpectedSides || [])],
    protectiveListCount: evidence.protectiveListCount || 0,
    recentTradeCount: evidence.recentTradeCount || 0,
    recentTradeWindowActive: Boolean(evidence.recentTradeWindowActive),
    recentTradeAgeMs: evidence.recentTradeAgeMs == null ? null : Math.max(0, Math.round(evidence.recentTradeAgeMs)),
    recentProtectivePartialFill: Boolean(evidence.recentProtectivePartialFill),
    recentAvgBuyPrice: roundNumber(evidence.recentAvgBuyPrice, 6, null),
    snapshotPartial: Boolean(evidence.snapshotPartial),
    snapshotErrors: [...(evidence.snapshotErrors || [])],
    hasVenuePosition: Boolean(evidence.hasVenuePosition),
    noVenuePosition: Boolean(evidence.noVenuePosition),
    effectiveVenueFlat: Boolean(evidence.effectiveVenueFlat),
    sellableQuantity: roundNumber(evidence.sellableQuantity || 0, 8),
    referenceExitPrice: roundNumber(evidence.referenceExitPrice, 6, null),
    sellableNotional: roundNumber(evidence.sellableNotional || 0, 4),
    unsellableDustResidual: Boolean(evidence.unsellableDustResidual),
    protectionMissing: Boolean(evidence.protectionMissing),
    missingLinkedProtection: Boolean(evidence.missingLinkedProtection),
    runtimeNotional: roundNumber(evidence.runtimeNotional || 0, 2),
    autoFixNotionalEligible: Boolean(evidence.autoFixNotionalEligible),
    marketMid: roundNumber(evidence.marketMid, 6, null),
    marketBid: roundNumber(evidence.marketBid, 6, null),
    marketAsk: roundNumber(evidence.marketAsk, 6, null),
    localMarkPrice: roundNumber(evidence.localMarkPrice, 6, null),
    markPriceDriftBps: roundNumber(evidence.markPriceDriftBps, 2, null)
  };
}

export function buildFlatPositionResolutionDiagnostics(broker, {
  position,
  evidence = {},
  fetchedAt = nowIso()
} = {}) {
  const modeSupported = isDemoPaperMode(broker?.config || {});
  const checks = {
    modeSupported,
    snapshotFresh: !evidence.snapshotPartial && !evidence.syncError,
    venueFlat: venueFlatForDemoPaper(evidence, broker?.config || {}),
    openOrdersClear: (evidence.openOrderCount || 0) === 0,
    unexpectedOrdersClear: (evidence.unexpectedOrderCount || 0) === 0,
    protectiveListsClear: (evidence.protectiveListCount || 0) === 0
  };
  const denialReasons = [];
  if (!checks.modeSupported) {
    denialReasons.push({
      code: "unsupported_mode",
      detail: "Deze operator-close is alleen toegestaan in paper mode met binance_demo_spot."
    });
  }
  if (!checks.snapshotFresh) {
    denialReasons.push({
      code: "stale_snapshot_retry_needed",
      detail: "Fresh Binance demo truth is onvolledig of bevat fetch-errors; probeer opnieuw."
    });
  }
  if (!checks.venueFlat) {
    denialReasons.push({
      code: "still_has_venue_balance",
      detail: "De venue toont nog sellable asset-quantity boven tolerance voor dit symbool."
    });
  }
  if (!checks.unexpectedOrdersClear) {
    denialReasons.push({
      code: "contradictory_open_order_state",
      detail: "Er staan nog onverwachte open orders die lokale flat-close onveilig maken."
    });
  } else if (!checks.openOrdersClear) {
    denialReasons.push({
      code: "still_has_open_orders",
      detail: "Er staan nog open orders op de venue voor dit symbool."
    });
  }
  if (!checks.protectiveListsClear) {
    denialReasons.push({
      code: "still_has_open_order_list",
      detail: "Er staat nog een actieve protective order list op de venue."
    });
  }
  const allowed = denialReasons.length === 0;
  const status = allowed ? "safe_flat_confirmed" : denialReasons[0].code;
  return {
    allowed,
    status,
    checkedAt: fetchedAt,
    symbol: position?.symbol || null,
    positionId: position?.id || null,
    evidenceSummary: summarizeReconcileEvidence(evidence),
    checks,
    denialReasons,
    detail: allowed
      ? hasUnsellableDustResidual(evidence)
        ? "Venue is effectief flat: alleen onsellable dust residual zonder open orders of protective order list."
        : "Venue flat confirmed: geen positie, geen open orders en geen actieve protective order list."
      : denialReasons[0]?.detail || "Venue truth staat lokale flat-close niet toe.",
    venueQuantity: roundNumber(evidence.exchangeQuantity || 0, 8),
    venueTotalQuantity: roundNumber(evidence.exchangeTotalQuantity || 0, 8),
    openOrderCount: evidence.openOrderCount || 0,
    unexpectedOrderCount: evidence.unexpectedOrderCount || 0,
    protectiveListCount: evidence.protectiveListCount || 0,
    unsellableDustResidual: Boolean(evidence.unsellableDustResidual),
    quantityTolerance: roundNumber(evidence.quantityTolerance || 0, 8),
    snapshotErrors: [...(evidence.snapshotErrors || [])].slice(0, 3),
    marketMid: roundNumber(evidence.marketMid, 6, null)
  };
}

function appendReconcileHistory(position, result = {}) {
  const checkedAt = result.checkedAt || nowIso();
  const historyLimit = Math.max(4, Math.round(safeNumber(result.historyLimit, position.reconcileHistoryLimit || 8)));
  const current = Array.isArray(position.reconcileRetryHistory) ? position.reconcileRetryHistory : [];
  const nextEntry = {
    at: checkedAt,
    decision: result.decision || null,
    reason: result.reason || null,
    action: result.action || null,
    error: result.error || null,
    confidence: Number.isFinite(result.reconcileConfidence) ? roundNumber(result.reconcileConfidence, 4) : null,
    classification: result.reconcileClassification || null,
    autonomyState: result.reconcileAutonomyState || null,
    attemptCount: Math.max(1, Math.round(safeNumber(result.attemptCount, position.autoReconcileAttemptCount || 1))),
    confirmationSampleCount: Math.max(0, Math.round(safeNumber(result.reconcileConfirmationSampleCount, 0))),
    stableConfirmationCount: Math.max(0, Math.round(safeNumber(result.reconcileStableConfirmationCount, 0))),
    cooldownUntil: result.cooldownUntil || null,
    autoResolvedAt: result.autoResolvedAt || null
  };
  const previous = current[current.length - 1] || null;
  const duplicate =
    previous &&
    previous.at === nextEntry.at &&
    previous.decision === nextEntry.decision &&
    previous.reason === nextEntry.reason &&
    previous.action === nextEntry.action &&
    previous.autonomyState === nextEntry.autonomyState;
  const history = duplicate ? current : [...current, nextEntry].slice(-historyLimit);
  position.reconcileRetryHistory = history;
  const retryCount = history.filter((item) => item.decision === AUTO_RECONCILE_DECISION.TRANSIENT_RETRY).length;
  const manualReviewCount = history.filter((item) => item.decision === AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW).length;
  const autoResolvedCount = history.filter((item) => item.action && /auto|refresh|adopt|rebuild/i.test(item.action)).length;
  const latest = history[history.length - 1] || null;
  const escalated = [...history].reverse().find((item) => item.decision === AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW) || null;
  position.reconcileRetrySummary = {
    eventCount: history.length,
    retryCount,
    manualReviewCount,
    autoResolvedCount,
    latestAt: latest?.at || null,
    latestAction: latest?.action || null,
    latestDecision: latest?.decision || null,
    latestReason: latest?.reason || null,
    latestClassification: latest?.classification || null,
    escalatedAt: escalated?.at || null,
    escalatedAfterAttempts: escalated?.attemptCount || null,
    recentReasons: [...new Set(history.map((item) => item.reason).filter(Boolean))].slice(-3)
  };
}

export function updatePositionReconcileStatus(position, result = {}) {
  const previousDecision = safeUpper(position.autoReconcileDecision || "");
  const previousReason = position.reconcileReason || null;
  const previousEvidence = position.reconcileEvidence || null;
  position.lastReconcileCheckAt = result.checkedAt || nowIso();
  position.autoReconcileDecision = result.decision || previousDecision || null;
  position.autoReconcileAttemptCount = result.attemptCount || 1;
  position.lastAutoReconcileAction = result.action || null;
  position.lastAutoReconcileError = result.error || null;
  position.reconcileConfidence = Number.isFinite(result.reconcileConfidence) ? roundNumber(result.reconcileConfidence, 4) : (position.reconcileConfidence ?? null);
  position.reconcileClassification = result.reconcileClassification || position.reconcileClassification || null;
  position.reconcileAutonomyState = result.reconcileAutonomyState || position.reconcileAutonomyState || null;
  position.reconcileConfirmationSampleCount = result.reconcileConfirmationSampleCount || position.reconcileConfirmationSampleCount || 0;
  position.reconcileStableConfirmationCount = result.reconcileStableConfirmationCount || position.reconcileStableConfirmationCount || 0;
  if (result.autoResolvedAt) {
    position.lastAutoResolvedAt = result.autoResolvedAt;
  }
  if (result.cooldownUntil) {
    position.reconcileCooldownUntil = result.cooldownUntil;
  } else if (result.clearCooldown) {
    position.reconcileCooldownUntil = null;
  }
  const preserveEvidence = result.decision === AUTO_RECONCILE_DECISION.TRANSIENT_RETRY
    && Boolean(position.reconcileRequired)
    && previousReason
    && previousDecision === AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW;
  if (!preserveEvidence) {
    position.reconcileReason = result.resetReason ? null : (result.reason || previousReason || null);
    position.reconcileEvidence = result.resetEvidence ? null : (result.evidenceSummary || previousEvidence || null);
  }
  appendReconcileHistory(position, {
    ...result,
    checkedAt: position.lastReconcileCheckAt,
    decision: position.autoReconcileDecision,
    reason: position.reconcileReason,
    reconcileClassification: position.reconcileClassification,
    reconcileAutonomyState: position.reconcileAutonomyState,
    reconcileConfidence: position.reconcileConfidence,
    reconcileConfirmationSampleCount: position.reconcileConfirmationSampleCount,
    reconcileStableConfirmationCount: position.reconcileStableConfirmationCount
  });
}

export function markPositionForManualReview(position, result = {}) {
  position.manualReviewRequired = true;
  position.reconcileRequired = true;
  position.operatorMode = "protect_only";
  position.lifecycleState = "manual_review";
  if (result.reason !== "large_price_mismatch") {
    position.priceMismatchEscalationCount = 0;
  }
  updatePositionReconcileStatus(position, result);
}

export function markPositionForRetry(position, result = {}) {
  position.manualReviewRequired = Boolean(position.manualReviewRequired);
  position.reconcileRequired = true;
  position.operatorMode = "protect_only";
  position.lifecycleState = position.manualReviewRequired ? "manual_review" : "reconcile_required";
  if (result.reason !== "large_price_mismatch") {
    position.priceMismatchEscalationCount = 0;
  }
  updatePositionReconcileStatus(position, result);
}

export function markPositionProtectOnly(position, result = {}) {
  position.reconcileRequired = true;
  position.manualReviewRequired = false;
  position.operatorMode = "protect_only";
  position.lifecycleState = "protect_only";
  updatePositionReconcileStatus(position, result);
}

export function clearPositionReconcileFlags(position, result = {}) {
  position.manualReviewRequired = false;
  position.reconcileRequired = false;
  position.operatorMode = "normal";
  position.priceMismatchEscalationCount = 0;
  if (!position.lifecycleState || ["reconcile_required", "manual_review", "protect_only", "protection_pending"].includes(position.lifecycleState)) {
    position.lifecycleState = position.protectiveOrderListId ? "protected" : "open";
  }
  updatePositionReconcileStatus(position, {
    ...result,
    clearCooldown: true,
    error: null
  });
}

export async function resolveFlatManualReviewPosition(broker, {
  position,
  runtime,
  rules,
  getMarketSnapshot,
  note = null,
  at = nowIso()
} = {}) {
  let baseSnapshot;
  try {
    baseSnapshot = await fetchReconcileRetrySnapshot(broker, position.symbol, runtime);
  } catch (error) {
    return {
      allowed: false,
      closedTrade: null,
      diagnostics: {
        allowed: false,
        status: "stale_snapshot_retry_needed",
        checkedAt: at,
        symbol: position?.symbol || null,
        positionId: position?.id || null,
        evidenceSummary: null,
        checks: {
          modeSupported: isDemoPaperMode(broker?.config || {}),
          snapshotFresh: false,
          venueFlat: false,
          openOrdersClear: false,
          unexpectedOrdersClear: false,
          protectiveListsClear: false
        },
        denialReasons: [{
          code: "stale_snapshot_retry_needed",
          detail: `Fresh Binance demo truth ophalen faalde: ${error.message}`
        }],
        detail: `Fresh Binance demo truth ophalen faalde: ${error.message}`,
        snapshotErrors: [{ source: "account_info", error: error.message }]
      },
      focusedReconcileRefresh: null,
      audit: {
        decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
        reason: "stale_snapshot_retry_needed",
        action: "operator_flat_close_denied",
        applied: false,
        dryRun: false,
        auditOnly: false,
        evidenceSummary: null,
        note: note || null,
        checkedAt: at
      }
    };
  }
  const marketSnapshot = typeof getMarketSnapshot === "function"
    ? await getMarketSnapshot(position.symbol).catch(() => null)
    : null;
  const evidence = collectReconcileEvidence(broker, {
    position,
    rules,
    assetMap: baseSnapshot.assetMap,
    trackedOpenOrders: baseSnapshot.trackedOpenOrders,
    openOrderLists: baseSnapshot.openOrderLists,
    recentTrades: baseSnapshot.recentTrades,
    marketSnapshot,
    snapshotErrors: baseSnapshot.snapshotErrors,
    fetchedAt: baseSnapshot.fetchedAt,
    attemptCount: 1
  });
  const diagnostics = buildFlatPositionResolutionDiagnostics(broker, {
    position,
    evidence,
    fetchedAt: baseSnapshot.fetchedAt
  });
  if (!diagnostics.allowed) {
    return {
      allowed: false,
      closedTrade: null,
      diagnostics,
      focusedReconcileRefresh: null,
      audit: {
        decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
        reason: diagnostics.status,
        action: "operator_flat_close_denied",
        applied: false,
        dryRun: false,
        auditOnly: false,
        evidenceSummary: diagnostics.evidenceSummary,
        note: note || null,
        checkedAt: at
      }
    };
  }
  const warnings = [];
  const resolvedAsDust = Boolean(diagnostics?.unsellableDustResidual);
  const result = await applySafeReconcileAutofix(broker, {
    position,
    runtime,
    rules,
    decision: {
      decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
      reason: resolvedAsDust ? "confirmed_flat_unsellable_dust" : "confirmed_flat_local_close",
      action: "resolve_flat_manual_review_position",
      autofixKind: resolvedAsDust ? "confirmed_flat_unsellable_dust" : "confirmed_flat_local_close",
      shouldRetry: false,
      evidenceSummary: diagnostics.evidenceSummary,
      warningIssue: "operator_resolve_flat_manual_review_position",
      tradeReason: "operator_resolve_flat_manual_review_position",
      tradeExitSource: "operator_flat_close_reconcile",
      reconcileConfidence: 1,
      reconcileClassification: resolvedAsDust ? "unsellable_dust_residual" : "safe_flat_confirmed",
      reconcileAutonomyState: "operator_flat_resolution"
    },
    evidence,
    warnings,
    getMarketSnapshot,
    settings: getAutoReconcileConfig(broker.config)
  });
  const refreshSnapshot = await fetchReconcileRetrySnapshot(broker, position.symbol, runtime);
  const refreshMarketSnapshot = typeof getMarketSnapshot === "function"
    ? await getMarketSnapshot(position.symbol).catch(() => null)
    : null;
  const refreshEvidence = collectReconcileEvidence(broker, {
    position,
    rules,
    assetMap: refreshSnapshot.assetMap,
    trackedOpenOrders: refreshSnapshot.trackedOpenOrders,
    openOrderLists: refreshSnapshot.openOrderLists,
    recentTrades: refreshSnapshot.recentTrades,
    marketSnapshot: refreshMarketSnapshot,
    snapshotErrors: refreshSnapshot.snapshotErrors,
    fetchedAt: refreshSnapshot.fetchedAt,
    attemptCount: 1
  });
  return {
    allowed: true,
    closedTrade: result.closedTrade || null,
    cleanupTarget: result.cleanupTarget || null,
    diagnostics,
    warnings,
    audit: {
      ...(result.audit || {}),
      note: note || null,
      checkedAt: at
    },
    focusedReconcileRefresh: buildFlatPositionResolutionDiagnostics(broker, {
      position,
      evidence: refreshEvidence,
      fetchedAt: refreshSnapshot.fetchedAt
    })
  };
}

export function collectReconcileEvidence(broker, {
  position,
  rules,
  assetMap,
  trackedOpenOrders,
  openOrderLists,
  recentTrades,
  marketSnapshot = null,
  snapshotErrors = [],
  syncError = null,
  attemptCount = 1,
  fetchedAt = nowIso()
}) {
  const runtimeQuantity = safeNumber(position.quantity, 0);
  const assetBalance = assetMap?.[rules.baseAsset] || {};
  const totalBalance = safeNumber(assetBalance.total, 0);
  const lockedBalance = safeNumber(assetBalance.locked, 0);
  const freeBalance = safeNumber(assetBalance.free, 0);
  const exchangeTotalQuantity = normalizeQuantity(totalBalance, rules, "floor", false) || 0;
  const exchangeLockedQuantity = normalizeQuantity(lockedBalance, rules, "floor", false) || 0;
  const exchangeFreeQuantity = normalizeQuantity(freeBalance, rules, "floor", false) || 0;
  const quantityTolerance = Math.max(rules.minQty || 0, getAutoReconcileConfig(broker.config).qtyMismatchTolerance || 0, 1e-9);
  const symbolOpenOrders = (trackedOpenOrders || []).filter((order) => order?.symbol === position.symbol);
  const exchangeProtectiveLists = broker.getOpenProtectiveOrderListsForSymbol(openOrderLists, position.symbol);
  const hasProtectionContext = Boolean(position.protectiveOrderListId) || exchangeProtectiveLists.length > 0;
  const protectedQuantity = hasProtectionContext ? exchangeLockedQuantity : 0;
  const lockedQuantityDiff = exchangeLockedQuantity - runtimeQuantity;
  const lockedMatchesRuntime = exchangeLockedQuantity > 0 && Math.abs(lockedQuantityDiff) <= quantityTolerance;
  const freeResidualExplainable = hasProtectionContext && lockedMatchesRuntime && exchangeFreeQuantity > quantityTolerance;
  const managedComparisonQuantity = freeResidualExplainable
    ? exchangeLockedQuantity
    : (hasProtectionContext && exchangeLockedQuantity > 0 && exchangeFreeQuantity <= quantityTolerance)
      ? exchangeLockedQuantity
      : exchangeTotalQuantity;
  const quantityComparisonBasis = freeResidualExplainable
    ? "locked_protected_with_free_residual"
    : (managedComparisonQuantity === exchangeLockedQuantity && hasProtectionContext)
      ? "locked_protected"
      : "total_balance";
  const unmanagedResidualQuantity = Math.max(0, exchangeTotalQuantity - managedComparisonQuantity);
  const exchangeQuantity = managedComparisonQuantity;
  const quantityDiff = managedComparisonQuantity - runtimeQuantity;
  const absQuantityDiff = Math.abs(quantityDiff);
  const qtyWithinTolerance = absQuantityDiff <= quantityTolerance;
  const openOrderListIds = new Set((openOrderLists || []).map((item) => item.orderListId).filter((value) => value != null));
  const expectedProtectiveOrderIds = new Set((position.protectiveOrders || []).map((item) => Number(item?.orderId || 0)).filter(Boolean));
  const unexpectedManagedOrders = symbolOpenOrders.filter((order) => {
    const orderId = Number(order?.orderId || 0);
    const orderListId = Number(order?.orderListId || 0) || null;
    if (expectedProtectiveOrderIds.has(orderId)) {
      return false;
    }
    if (position.protectiveOrderListId && orderListId && orderListId === position.protectiveOrderListId) {
      return false;
    }
    return isActiveExchangeOrderStatus(order?.status);
  });
  const recentTradeWindowMs = Math.min(
    Math.max(30_000, safeNumber(broker.config.exchangeTruthRecentFillLookbackMinutes, 30) * 60_000),
    180_000
  );
  const latestRecentTradeAtMs = (recentTrades || []).reduce((latest, trade) => {
    const timestamp = safeNumber(trade.time || trade.transactTime, Number.NaN);
    if (!Number.isFinite(timestamp)) {
      return latest;
    }
    return Number.isFinite(latest) ? Math.max(latest, timestamp) : timestamp;
  }, Number.NaN);
  const recentTradeAgeMs = Number.isFinite(latestRecentTradeAtMs) ? Math.max(0, Date.now() - latestRecentTradeAtMs) : null;
  const lastProtectivePartialFillMs = position.lastProtectivePartialFillAt
    ? new Date(position.lastProtectivePartialFillAt).getTime()
    : Number.NaN;
  const recentProtectivePartialFill = Number.isFinite(lastProtectivePartialFillMs)
    && Math.max(0, Date.now() - lastProtectivePartialFillMs) <= recentTradeWindowMs;
  const recentAvgBuyPrice = averageTradePrice(recentTrades, "BUY");
  const priceMismatchBps = recentAvgBuyPrice && safeNumber(position.entryPrice, 0) > 0
    ? Math.abs((recentAvgBuyPrice - safeNumber(position.entryPrice, 0)) / Math.max(safeNumber(position.entryPrice, 0), 1e-9)) * 10_000
    : null;
  const marketMid = safeNumber(
    marketSnapshot?.book?.mid,
    safeNumber(
      ((safeNumber(marketSnapshot?.book?.bid, Number.NaN) + safeNumber(marketSnapshot?.book?.ask, Number.NaN)) / 2),
      safeNumber(marketSnapshot?.market?.lastPrice, Number.NaN)
    )
  );
  const marketBid = safeNumber(marketSnapshot?.book?.bid, null);
  const marketAsk = safeNumber(marketSnapshot?.book?.ask, null);
  const referenceExitPrice = safeNumber(
    marketBid,
    safeNumber(
      marketMid,
      safeNumber(
        recentAvgBuyPrice,
        safeNumber(position.entryPrice, Number.NaN)
      )
    )
  );
  const sellableQuantity = normalizeQuantity(managedComparisonQuantity, rules, "floor", true) || 0;
  const sellableNotional = Number.isFinite(referenceExitPrice) && referenceExitPrice > 0
    ? sellableQuantity * referenceExitPrice
    : 0;
  const unsellableDustResidual =
    runtimeQuantity > quantityTolerance
    && managedComparisonQuantity > 0
    && quantityDiff < -quantityTolerance
    && ((sellableQuantity <= 0) || sellableNotional < safeNumber(rules.minNotional, 0))
    && symbolOpenOrders.length === 0
    && exchangeProtectiveLists.length === 0
    && unexpectedManagedOrders.length === 0;
  const localMarkPrice = safeNumber(position.lastMarkedPrice, safeNumber(position.currentPrice, Number.NaN));
  const markPriceDriftBps = Number.isFinite(marketMid) && marketMid > 0 && Number.isFinite(localMarkPrice) && localMarkPrice > 0
    ? Math.abs((marketMid - localMarkPrice) / Math.max(localMarkPrice, 1e-9)) * 10_000
    : null;
  const runtimeNotional = Math.max(
    safeNumber(position.notional, Number.NaN),
    runtimeQuantity * Math.max(safeNumber(position.entryPrice, 0), safeNumber(position.lastMarkedPrice, 0))
  );
  return {
    symbol: position.symbol,
    fetchedAt,
    attemptCount,
    runtimeQuantity,
    exchangeQuantity,
    exchangeTotalQuantity,
    exchangeLockedQuantity,
    exchangeFreeQuantity,
    protectedQuantity,
    managedComparisonQuantity,
    unmanagedResidualQuantity,
    freeResidualExplainable,
    quantityComparisonBasis,
    quantityDiff,
    quantityTolerance,
    qtyWithinTolerance,
    priceMismatchBps,
    openOrderCount: symbolOpenOrders.length,
    unexpectedOrderCount: unexpectedManagedOrders.length,
    unexpectedOrders: unexpectedManagedOrders.map((item) => ({
      orderId: item.orderId || null,
      side: safeUpper(item.side || null),
      status: safeUpper(item.status || null)
    })).slice(0, 4),
    unexpectedSides: [...new Set(unexpectedManagedOrders.map((item) => safeUpper(item.side)).filter(Boolean))],
    protectiveListCount: exchangeProtectiveLists.length,
    exchangeProtectiveLists,
    openOrderListIds,
    recentTradeCount: (recentTrades || []).length,
    recentTradeWindowActive: Boolean(recentTradeAgeMs != null && recentTradeAgeMs <= recentTradeWindowMs),
    recentTradeAgeMs,
    recentTrades,
    recentProtectivePartialFill,
      recentAvgBuyPrice,
      snapshotPartial: (snapshotErrors || []).length > 0,
      snapshotErrors: (snapshotErrors || []).slice(0, 3),
      hasVenuePosition: managedComparisonQuantity > 0,
      noVenuePosition: managedComparisonQuantity <= 0,
      effectiveVenueFlat: venueFlatForDemoPaper({
        noVenuePosition: managedComparisonQuantity <= 0,
        unsellableDustResidual
      }, broker.config),
      sellableQuantity,
      referenceExitPrice: Number.isFinite(referenceExitPrice) && referenceExitPrice > 0 ? referenceExitPrice : null,
      sellableNotional,
      unsellableDustResidual,
      protectionMissing: !position.protectiveOrderListId && exchangeProtectiveLists.length === 0,
    missingLinkedProtection: Boolean(position.protectiveOrderListId) && !openOrderListIds.has(position.protectiveOrderListId),
    runtimeNotional,
    autoFixNotionalEligible: runtimeNotional <= getAutoReconcileConfig(broker.config).maxAutoFixNotional,
    marketMid,
    marketBid,
    marketAsk,
    localMarkPrice,
    markPriceDriftBps,
    syncError
  };
}

function getDemoPaperReconcileConfig(config = {}) {
  return {
    confirmationSamples: Math.max(2, Math.round(safeNumber(config.demoPaperReconcileConfirmationSamples, 3))),
    confirmationDelayMs: Math.max(150, Math.round(safeNumber(config.demoPaperReconcileConfirmationDelayMs, 450))),
    minConfidence: Math.min(0.98, Math.max(0.55, safeNumber(config.demoPaperReconcileMinConfidence, 0.78))),
    autoClearQuorum: Math.max(2, Math.round(safeNumber(config.demoPaperReconcileAutoClearQuorum, 2))),
    markDriftToleranceBps: Math.max(10, safeNumber(config.demoPaperMarkDriftToleranceBps, 45)),
    recentFillGraceMs: Math.max(1_000, Math.round(safeNumber(config.demoPaperRecentFillGraceMs, 18_000))),
    stablePriceToleranceBps: Math.max(5, safeNumber(config.demoPaperStablePriceToleranceBps, 18))
  };
}

function averageNumbers(values = []) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }
  return filtered.reduce((total, value) => total + value, 0) / filtered.length;
}

function bpsDelta(left, right) {
  const a = safeNumber(left, Number.NaN);
  const b = safeNumber(right, Number.NaN);
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(b) || b <= 0) {
    return null;
  }
  return Math.abs((a - b) / Math.max(b, 1e-9)) * 10_000;
}

function maxPairwiseBps(values = []) {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  if (filtered.length < 2) {
    return 0;
  }
  let maxBps = 0;
  for (let index = 1; index < filtered.length; index += 1) {
    maxBps = Math.max(maxBps, bpsDelta(filtered[index - 1], filtered[index]) || 0);
  }
  return maxBps;
}

function classifyDemoPaperMismatchSample(position, evidence = {}, settings = {}, demoSettings = {}) {
  if (evidence.unexpectedSides?.includes("BUY") || evidence.unexpectedOrderCount > 0 || evidence.protectiveListCount > 1) {
    return "contradictory_open_order_state";
  }
  if (hasUnsellableDustResidual(evidence)) {
    return "unsellable_dust_residual";
  }
  if (!evidence.qtyWithinTolerance || (evidence.noVenuePosition && !evidence.recentTradeWindowActive)) {
    return "hard_inventory_conflict";
  }
  if (evidence.protectionMissing || evidence.missingLinkedProtection) {
    return "recoverable_missing_protection";
  }
  if (Number.isFinite(evidence.priceMismatchBps) && evidence.priceMismatchBps > settings.priceMismatchToleranceBps) {
    if (evidence.recentTradeWindowActive && Number.isFinite(evidence.recentAvgBuyPrice) && evidence.recentAvgBuyPrice > 0) {
      return "recent_fill_not_yet_reflected";
    }
    if (Number.isFinite(evidence.recentAvgBuyPrice) && evidence.recentAvgBuyPrice > 0) {
      return "stale_local_entry_reference";
    }
  }
  if (Number.isFinite(evidence.markPriceDriftBps) && evidence.markPriceDriftBps > demoSettings.markDriftToleranceBps) {
    return "stale_local_mark_state";
  }
  return "safe_demo_price_drift";
}

async function fetchDemoPaperConfirmationSample(broker, {
  position,
  runtime,
  rules,
  getMarketSnapshot,
  attemptCount = 1
} = {}) {
  const retrySnapshot = await fetchReconcileRetrySnapshot(broker, position.symbol, runtime);
  let marketSnapshot = null;
  let marketSnapshotError = null;
  if (typeof getMarketSnapshot === "function") {
    try {
      marketSnapshot = await getMarketSnapshot(position.symbol);
    } catch (error) {
      marketSnapshotError = error;
    }
  }
  const evidence = collectReconcileEvidence(broker, {
    position,
    rules,
    assetMap: retrySnapshot.assetMap,
    trackedOpenOrders: retrySnapshot.trackedOpenOrders,
    openOrderLists: retrySnapshot.openOrderLists,
    recentTrades: retrySnapshot.recentTrades,
    marketSnapshot,
    snapshotErrors: [
      ...(retrySnapshot.snapshotErrors || []),
      marketSnapshotError ? { source: "market_snapshot", error: marketSnapshotError.message } : null
    ].filter(Boolean),
    syncError: null,
    attemptCount,
    fetchedAt: retrySnapshot.fetchedAt
  });
  return {
    evidence,
    marketSnapshot,
    mismatchType: classifyDemoPaperMismatchSample(position, evidence, getAutoReconcileConfig(broker.config), getDemoPaperReconcileConfig(broker.config))
  };
}

function buildDemoPaperReconcileConfidence(position, samples = [], settings = {}, demoSettings = {}) {
  const count = Math.max(1, samples.length);
  const mismatchCounts = new Map();
  for (const sample of samples) {
    mismatchCounts.set(sample.mismatchType, (mismatchCounts.get(sample.mismatchType) || 0) + 1);
  }
  const dominantMismatchType = [...mismatchCounts.entries()]
    .sort((left, right) => right[1] - left[1] || `${left[0]}`.localeCompare(`${right[0]}`))[0]?.[0] || "safe_demo_price_drift";
  const stableConfirmationCount = mismatchCounts.get(dominantMismatchType) || 0;
  const quantityConsistency = samples.filter((sample) => sample.evidence.qtyWithinTolerance).length / count;
  const orderConsistency = samples.filter((sample) => !sample.evidence.unexpectedOrderCount && !sample.evidence.unexpectedSides.includes("BUY")).length / count;
  const protectionConsistency = samples.filter((sample) => sample.evidence.protectiveListCount <= 1).length / count;
  const snapshotCompleteness = samples.filter((sample) => !sample.evidence.snapshotPartial).length / count;
  const marketValidationSupport = samples.filter((sample) => Number.isFinite(sample.evidence.marketMid) && sample.evidence.marketMid > 0).length / count;
  const recentTradeSupport = samples.filter((sample) => Number.isFinite(sample.evidence.recentAvgBuyPrice) && sample.evidence.recentAvgBuyPrice > 0).length / count;
  const stabilitySupport = stableConfirmationCount / count;
  const entryReferenceValues = samples.map((sample) => sample.evidence.recentAvgBuyPrice);
  const markValues = samples.map((sample) => sample.evidence.marketMid);
  const stableEntryReference = maxPairwiseBps(entryReferenceValues) <= demoSettings.stablePriceToleranceBps;
  const stableMarketState = maxPairwiseBps(markValues) <= demoSettings.stablePriceToleranceBps;
  const score = Math.min(1, Math.max(0,
    quantityConsistency * 0.28 +
    orderConsistency * 0.18 +
    protectionConsistency * 0.16 +
    snapshotCompleteness * 0.12 +
    stabilitySupport * 0.14 +
    recentTradeSupport * 0.06 +
    marketValidationSupport * 0.06
  ));
  return {
    score,
    dominantMismatchType,
    stableConfirmationCount,
    quantityConsistency,
    orderConsistency,
    protectionConsistency,
    snapshotCompleteness,
    marketValidationSupport,
    recentTradeSupport,
    stabilitySupport,
    stableEntryReference,
    stableMarketState,
    targetEntryPrice: averageNumbers(entryReferenceValues),
    targetMarkPrice: averageNumbers(markValues),
    minRecentTradeAgeMs: samples.reduce((lowest, sample) => {
      const age = sample.evidence.recentTradeAgeMs;
      if (!Number.isFinite(age)) {
        return lowest;
      }
      return Number.isFinite(lowest) ? Math.min(lowest, age) : age;
    }, Number.NaN)
  };
}

async function maybeResolveDemoPaperAutonomy(broker, {
  position,
  runtime,
  rules,
  initialDecision,
  initialEvidence,
  getMarketSnapshot
} = {}) {
  if (!isDemoPaperMode(broker.config)) {
    return { decision: initialDecision, evidence: initialEvidence };
  }
  const supportedReasons = new Set([
    "large_price_mismatch",
    "exchange_truth_verified",
    "recent_fill_pending",
    "missing_protection",
    "stale_local_protection_link",
    "exchange_protection_detected_without_local_link"
  ]);
  if (!supportedReasons.has(initialDecision.reason) && !position.reconcileRequired && !position.manualReviewRequired) {
    return { decision: initialDecision, evidence: initialEvidence };
  }
  const settings = getAutoReconcileConfig(broker.config);
  const demoSettings = getDemoPaperReconcileConfig(broker.config);
  const samples = [];
  for (let attempt = 1; attempt <= demoSettings.confirmationSamples; attempt += 1) {
    if (attempt > 1) {
      await sleep(demoSettings.confirmationDelayMs);
    }
    samples.push(await fetchDemoPaperConfirmationSample(broker, {
      position,
      runtime,
      rules,
      getMarketSnapshot,
      attemptCount: attempt
    }));
    if (["hard_inventory_conflict", "contradictory_open_order_state"].includes(samples.at(-1)?.mismatchType)) {
      break;
    }
  }
  const confidence = buildDemoPaperReconcileConfidence(position, samples, settings, demoSettings);
  const latestEvidence = samples.at(-1)?.evidence || initialEvidence;
  const baseDecision = {
    ...initialDecision,
    evidenceSummary: summarizeReconcileEvidence(latestEvidence),
    reconcileConfidence: roundNumber(confidence.score, 4),
    reconcileClassification: confidence.dominantMismatchType,
    reconcileAutonomyState: "demo_confirmation_pending",
    reconcileConfirmationSampleCount: samples.length,
    reconcileStableConfirmationCount: confidence.stableConfirmationCount,
    targetEntryPrice: confidence.targetEntryPrice,
    targetMarkPrice: confidence.targetMarkPrice
  };
  if (confidence.dominantMismatchType === "unsellable_dust_residual" && confidence.score >= demoSettings.minConfidence && confidence.stableConfirmationCount >= demoSettings.autoClearQuorum) {
    return {
      decision: {
        ...baseDecision,
        decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
        reason: "confirmed_flat_unsellable_dust",
        action: "mark_closed_from_unsellable_dust",
        autofixKind: "confirmed_flat_unsellable_dust",
        shouldRetry: false,
        reconcileAutonomyState: "auto_heal_ready"
      },
      evidence: latestEvidence
    };
  }
  if (["contradictory_open_order_state", "hard_inventory_conflict"].includes(confidence.dominantMismatchType)) {
    return {
      decision: {
        ...baseDecision,
        decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
        reason: confidence.dominantMismatchType,
        action: "manual_review_required",
        autofixKind: "none",
        shouldRetry: false,
        reconcileAutonomyState: "manual_review_required"
      },
      evidence: latestEvidence
    };
  }
  if (confidence.dominantMismatchType === "recoverable_missing_protection" && confidence.score >= demoSettings.minConfidence && confidence.stableConfirmationCount >= demoSettings.autoClearQuorum) {
    return {
      decision: {
        ...baseDecision,
        decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
        reason: "recoverable_missing_protection",
        action: latestEvidence.protectiveListCount === 1 ? "adopt_exchange_protection" : "rebuild_and_revalidate_protection",
        autofixKind: latestEvidence.protectiveListCount === 1 ? "adopt_exchange_protection" : "rebuild_and_revalidate_protection",
        shouldRetry: false,
        requiresProtectionRevalidation: true,
        reconcileAutonomyState: "auto_heal_ready"
      },
      evidence: latestEvidence
    };
  }
  if (confidence.dominantMismatchType === "recent_fill_not_yet_reflected") {
    if (Number.isFinite(confidence.minRecentTradeAgeMs) && confidence.minRecentTradeAgeMs <= demoSettings.recentFillGraceMs) {
      return {
        decision: {
          ...baseDecision,
          decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
          reason: "recent_fill_not_yet_reflected",
          action: "retry_exchange_snapshot",
          autofixKind: "none",
          shouldRetry: true,
          reconcileAutonomyState: "awaiting_fresh_fill_confirmation"
        },
        evidence: latestEvidence
      };
    }
    if (confidence.score >= demoSettings.minConfidence && confidence.stableEntryReference && confidence.stableConfirmationCount >= demoSettings.autoClearQuorum) {
      return {
        decision: {
          ...baseDecision,
          decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
          reason: "stale_local_entry_reference",
          action: "refresh_entry_reference_from_recent_fills",
          autofixKind: "refresh_entry_reference_from_recent_fills",
          shouldRetry: false,
          reconcileAutonomyState: "auto_heal_ready"
        },
        evidence: latestEvidence
      };
    }
  }
  if (confidence.dominantMismatchType === "stale_local_entry_reference" && confidence.score >= demoSettings.minConfidence && confidence.stableEntryReference && confidence.stableConfirmationCount >= demoSettings.autoClearQuorum) {
    return {
      decision: {
        ...baseDecision,
        decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
        reason: "stale_local_entry_reference",
        action: "refresh_entry_reference_from_recent_fills",
        autofixKind: "refresh_entry_reference_from_recent_fills",
        shouldRetry: false,
        reconcileAutonomyState: "auto_heal_ready"
      },
      evidence: latestEvidence
    };
  }
  if (confidence.dominantMismatchType === "stale_local_mark_state" && confidence.score >= demoSettings.minConfidence && confidence.stableMarketState && confidence.stableConfirmationCount >= demoSettings.autoClearQuorum) {
    return {
      decision: {
        ...baseDecision,
        decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
        reason: "stale_local_mark_state",
        action: "refresh_local_mark_state",
        autofixKind: "refresh_local_mark_state",
        shouldRetry: false,
        reconcileAutonomyState: "auto_heal_ready"
      },
      evidence: latestEvidence
    };
  }
  if (confidence.dominantMismatchType === "safe_demo_price_drift" && confidence.score >= Math.max(demoSettings.minConfidence, 0.82) && confidence.stableConfirmationCount >= demoSettings.autoClearQuorum) {
    return {
      decision: {
        ...baseDecision,
        decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
        reason: "safe_demo_price_drift",
        action: "auto_clear_after_quorum",
        autofixKind: "auto_clear_after_quorum",
        shouldRetry: false,
        reconcileAutonomyState: "auto_heal_ready"
      },
      evidence: latestEvidence
    };
  }
  return {
    decision: {
      ...baseDecision,
      reconcileAutonomyState: confidence.dominantMismatchType === "recent_fill_not_yet_reflected"
        ? "awaiting_fresh_fill_confirmation"
        : "protect_only_retry"
    },
    evidence: latestEvidence
  };
}

export function classifyReconcileDecision(broker, position, evidence = {}, settings = getAutoReconcileConfig(broker.config)) {
  const evidenceSummary = summarizeReconcileEvidence(evidence);
  if (evidence.syncError) {
    if (isRetriableExchangeError(evidence.syncError)) {
      return {
        decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
        reason: "position_sync_retryable_error",
        action: "retry_exchange_snapshot",
        autofixKind: "none",
        shouldRetry: true,
        evidenceSummary
      };
    }
    return {
      decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
      reason: "position_sync_failed",
      action: "manual_review_required",
      autofixKind: "none",
      shouldRetry: false,
      error: evidence.syncError.message,
      evidenceSummary
    };
  }
  if (evidence.snapshotPartial) {
    return {
      decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
      reason: "partial_exchange_snapshot",
      action: "retry_exchange_snapshot",
      autofixKind: "none",
      shouldRetry: true,
      evidenceSummary
    };
  }
  if (evidence.recentProtectivePartialFill) {
    return {
      decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
      reason: "recent_protective_partial_fill",
      action: "retry_exchange_snapshot",
      autofixKind: "none",
      shouldRetry: true,
      evidenceSummary
    };
  }
  if (evidence.unexpectedSides.includes("BUY")) {
    return {
      decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
      reason: "side_mismatch_detected",
      action: "manual_review_required",
      autofixKind: "none",
      shouldRetry: false,
      evidenceSummary
    };
  }
    if (evidence.unexpectedOrderCount > 0) {
      return {
        decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
        reason: "unexpected_open_order_for_managed_position",
        action: "manual_review_required",
        autofixKind: "none",
        shouldRetry: false,
        evidenceSummary
      };
    }
    if (isDemoPaperMode(broker.config) && hasUnsellableDustResidual(evidence)) {
      return {
        decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
        reason: "confirmed_flat_unsellable_dust",
        action: "mark_closed_from_unsellable_dust",
        autofixKind: "confirmed_flat_unsellable_dust",
        shouldRetry: false,
        evidenceSummary
      };
    }
    if (Number.isFinite(evidence.priceMismatchBps) && evidence.priceMismatchBps > settings.priceMismatchToleranceBps) {
      return {
        decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
        reason: "large_price_mismatch",
        action: "manual_review_required",
      autofixKind: "none",
      shouldRetry: false,
      evidenceSummary
    };
  }
  if (evidence.noVenuePosition) {
    if (evidence.recentTradeWindowActive) {
      return {
        decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
        reason: "recent_fill_pending",
        action: "retry_exchange_snapshot",
        autofixKind: "none",
        shouldRetry: true,
        evidenceSummary
      };
    }
    if (evidence.openOrderCount > 0 || evidence.protectiveListCount > 0) {
      return {
        decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
        reason: "contradictory_flat_with_open_orders",
        action: "manual_review_required",
        autofixKind: "none",
        shouldRetry: false,
        evidenceSummary
      };
    }
    return {
      decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
      reason: "confirmed_flat_local_close",
      action: "mark_closed_from_exchange_truth",
      autofixKind: "confirmed_flat_local_close",
      shouldRetry: false,
      evidenceSummary
    };
  }
  if (!evidence.autoFixNotionalEligible) {
    return {
      decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
      reason: "autofix_notional_above_cap",
      action: "manual_review_required",
      autofixKind: "none",
      shouldRetry: false,
      evidenceSummary
    };
  }
  const absQuantityDiff = Math.abs(evidence.quantityDiff || 0);
  if (absQuantityDiff > (evidence.quantityTolerance || 0)) {
    return {
      decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
      reason: "large_qty_mismatch",
      action: "manual_review_required",
      autofixKind: "none",
      shouldRetry: false,
      evidenceSummary
    };
  }
  if (evidence.protectiveListCount > 1) {
    return {
      decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
      reason: "multiple_protective_order_lists_detected",
      action: "manual_review_required",
      autofixKind: "none",
      shouldRetry: false,
      evidenceSummary
    };
  }
  if (evidence.missingLinkedProtection && evidence.protectiveListCount === 1) {
    return {
      decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
      reason: "stale_local_protection_link",
      action: "adopt_exchange_protection",
      autofixKind: "adopt_exchange_protection",
      shouldRetry: false,
      evidenceSummary
    };
  }
  if (!position.protectiveOrderListId && evidence.protectiveListCount === 1) {
    return {
      decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
      reason: "exchange_protection_detected_without_local_link",
      action: "adopt_exchange_protection",
      autofixKind: "adopt_exchange_protection",
      shouldRetry: false,
      evidenceSummary
    };
  }
  if (broker.config.enableExchangeProtection && (evidence.protectionMissing || evidence.missingLinkedProtection)) {
    return {
      decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
      reason: evidence.missingLinkedProtection ? "stale_local_protection_link" : "missing_protection",
      action: evidence.protectiveListCount === 1 ? "adopt_exchange_protection" : "rebuild_missing_protection",
      autofixKind: evidence.protectiveListCount === 1 ? "adopt_exchange_protection" : "missing_protection",
      shouldRetry: false,
      evidenceSummary
    };
  }
  if (absQuantityDiff > 0 && evidence.qtyWithinTolerance) {
    return {
      decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
      reason: "minor_qty_drift",
      action: "align_local_quantity",
      autofixKind: "minor_qty_drift",
      shouldRetry: false,
      evidenceSummary
    };
  }
  return {
    decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
    reason: "exchange_truth_verified",
    action: "verify_only",
    autofixKind: "none",
    shouldRetry: false,
    evidenceSummary
  };
}

export async function applySafeReconcileAutofix(broker, { position, runtime, rules, decision, evidence, warnings, getMarketSnapshot, settings }) {
  if (settings.dryRun) {
    markPositionForRetry(position, {
      decision: decision.decision,
      reason: decision.reason,
      evidenceSummary: decision.evidenceSummary,
      attemptCount: evidence.attemptCount,
      action: "dry_run_skipped_autofix"
    });
    warnings.push({ symbol: position.symbol, issue: "auto_reconcile_dry_run", reason: decision.reason });
    return { closedTrade: null, audit: { ...decision, applied: false, dryRun: true } };
  }
  if (["refresh_entry_reference_from_recent_fills", "refresh_local_mark_state", "demo_price_mismatch_resolved", "auto_clear_after_quorum"].includes(decision.autofixKind)) {
    const nextEntryPrice = safeNumber(decision.targetEntryPrice, safeNumber(evidence.recentAvgBuyPrice, Number.NaN));
    const nextMarkPrice = safeNumber(decision.targetMarkPrice, safeNumber(evidence.marketMid, Number.NaN));
    const quantity = Math.max(0, safeNumber(position.quantity, 0));
    if (decision.autofixKind === "refresh_entry_reference_from_recent_fills" && Number.isFinite(nextEntryPrice) && nextEntryPrice > 0 && quantity > 0) {
      position.entryPrice = nextEntryPrice;
      position.notional = quantity * nextEntryPrice;
      position.totalCost = Math.max(0, position.notional + safeNumber(position.entryFee, 0));
    }
    if (Number.isFinite(nextMarkPrice) && nextMarkPrice > 0) {
      position.lastMarkedPrice = nextMarkPrice;
      position.currentPrice = nextMarkPrice;
    }
    clearPositionReconcileFlags(position, {
      decision: decision.decision,
      reason: decision.reason,
      evidenceSummary: decision.evidenceSummary,
      attemptCount: evidence.attemptCount,
      action: decision.action || decision.autofixKind,
      resetReason: true,
      resetEvidence: true,
      reconcileConfidence: decision.reconcileConfidence,
      reconcileClassification: decision.reconcileClassification,
      reconcileAutonomyState: "auto_cleared",
      reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
      reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount,
      autoResolvedAt: nowIso()
    });
    warnings.push({
      symbol: position.symbol,
      issue: decision.autofixKind === "refresh_entry_reference_from_recent_fills"
        ? "auto_reconcile_entry_reference_refreshed"
        : decision.autofixKind === "refresh_local_mark_state"
          ? "auto_reconcile_mark_state_refreshed"
          : "auto_reconcile_cleared_after_quorum",
      confidence: decision.reconcileConfidence ?? null,
      classification: decision.reconcileClassification || decision.reason || null
    });
    return { closedTrade: null, audit: { ...decision, applied: true, dryRun: false } };
  }
  if (["confirmed_flat_local_close", "confirmed_flat_unsellable_dust"].includes(decision.autofixKind)) {
    const marketSnapshot = await getMarketSnapshot(position.symbol).catch(() => null);
    broker.clearProtectiveOrderState(position, "ALL_DONE");
    clearPositionReconcileFlags(position, {
      decision: decision.decision,
      reason: decision.reason,
      evidenceSummary: decision.evidenceSummary,
      attemptCount: evidence.attemptCount,
      action: decision.action || decision.autofixKind,
      reconcileConfidence: decision.reconcileConfidence,
      reconcileClassification: decision.reconcileClassification,
      reconcileAutonomyState: decision.reconcileAutonomyState || "auto_cleared",
      reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
      reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount,
      autoResolvedAt: nowIso(),
      resetReason: true,
      resetEvidence: true
    });
    const closedTrade = broker.buildSyntheticReconcileCloseTrade(
      position,
      marketSnapshot,
      decision.evidenceSummary,
      {
        reason: decision.tradeReason || (decision.autofixKind === "confirmed_flat_unsellable_dust"
          ? "exchange_reconcile_confirmed_flat_dust"
          : "exchange_reconcile_confirmed_flat"),
        exitSource: decision.tradeExitSource || "exchange_reconcile_autofix"
      }
    );
    runtime.openPositions = runtime.openPositions.filter((item) => item.id !== position.id);
    warnings.push({
      symbol: position.symbol,
      issue: decision.warningIssue || (decision.autofixKind === "confirmed_flat_unsellable_dust"
        ? "auto_reconcile_confirmed_flat_unsellable_dust"
        : "auto_reconcile_confirmed_flat_local_close")
    });
    return {
      closedTrade,
      cleanupTarget: {
        symbol: position.symbol,
        positionId: position.id || null,
        reason: decision.reason || decision.autofixKind,
        venueFlatConfirmed: venueFlatForDemoPaper(evidence, broker.config),
        openOrdersClear: safeNumber(evidence.openOrderCount, 0) === 0,
        protectiveListsClear: safeNumber(evidence.protectiveListCount, 0) === 0,
        unsellableDustResidual: Boolean(evidence.unsellableDustResidual)
      },
      audit: { ...decision, applied: true, dryRun: false }
    };
  }
  if (decision.autofixKind === "minor_qty_drift") {
    const runtimeQuantity = Math.max(safeNumber(position.quantity, 0), 1e-9);
    const targetQuantity = Math.max(0, safeNumber(evidence.exchangeQuantity, 0));
    const quantityRatio = targetQuantity / runtimeQuantity;
    position.quantity = targetQuantity;
    position.totalCost = Math.max(0, safeNumber(position.totalCost, 0) * quantityRatio);
    position.notional = Math.max(0, safeNumber(position.entryPrice, 0) * targetQuantity);
    position.entryFee = Math.max(0, safeNumber(position.entryFee, 0) * quantityRatio);
    clearPositionReconcileFlags(position, {
      decision: decision.decision,
      reason: decision.reason,
      evidenceSummary: decision.evidenceSummary,
      attemptCount: evidence.attemptCount,
      action: "aligned_local_quantity"
    });
    warnings.push({
      symbol: position.symbol,
      issue: "auto_reconcile_minor_qty_drift_aligned",
      runtimeQuantity: evidence.runtimeQuantity,
      exchangeQuantity: evidence.exchangeQuantity
    });
    return { closedTrade: null, audit: { ...decision, applied: true, dryRun: false } };
  }
  if (decision.autofixKind === "adopt_exchange_protection") {
    broker.attachProtectiveOrderState(position, evidence.exchangeProtectiveLists[0]);
    if (decision.requiresProtectionRevalidation && isDemoPaperMode(broker.config)) {
      const postSnapshot = await fetchReconcileRetrySnapshot(broker, position.symbol, runtime);
      const postMarketSnapshot = typeof getMarketSnapshot === "function"
        ? await getMarketSnapshot(position.symbol).catch(() => null)
        : null;
      const postEvidence = collectReconcileEvidence(broker, {
        position,
        rules,
        assetMap: postSnapshot.assetMap,
        trackedOpenOrders: postSnapshot.trackedOpenOrders,
        openOrderLists: postSnapshot.openOrderLists,
        recentTrades: postSnapshot.recentTrades,
        marketSnapshot: postMarketSnapshot,
        snapshotErrors: postSnapshot.snapshotErrors,
        fetchedAt: postSnapshot.fetchedAt,
        attemptCount: (evidence.attemptCount || 1) + 1
      });
      if (postEvidence.protectiveListCount !== 1 || postEvidence.unexpectedOrderCount > 0 || !postEvidence.qtyWithinTolerance) {
        markPositionForRetry(position, {
          decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
          reason: "protection_revalidation_pending",
          evidenceSummary: summarizeReconcileEvidence(postEvidence),
          attemptCount: postEvidence.attemptCount,
          action: "protection_revalidation_pending",
          reconcileConfidence: decision.reconcileConfidence,
          reconcileClassification: "recoverable_missing_protection",
          reconcileAutonomyState: "protect_only_retry",
          reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
          reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount
        });
        warnings.push({ symbol: position.symbol, issue: "auto_reconcile_protection_revalidation_pending" });
        return {
          closedTrade: null,
          audit: {
            ...decision,
            decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
            reason: "protection_revalidation_pending",
            applied: false,
            dryRun: false,
            evidenceSummary: summarizeReconcileEvidence(postEvidence)
          }
        };
      }
    }
    clearPositionReconcileFlags(position, {
      decision: decision.decision,
      reason: decision.reason,
      evidenceSummary: decision.evidenceSummary,
      attemptCount: evidence.attemptCount,
      action: "adopted_exchange_protection",
      reconcileConfidence: decision.reconcileConfidence,
      reconcileClassification: decision.reconcileClassification,
      reconcileAutonomyState: "auto_cleared",
      reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
      reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount,
      autoResolvedAt: nowIso()
    });
    warnings.push({
      symbol: position.symbol,
      issue: "auto_reconcile_protection_adopted",
      orderListId: evidence.exchangeProtectiveLists[0]?.orderListId || null
    });
    warnings.push({
      symbol: position.symbol,
      issue: "protective_order_state_adopted_from_exchange",
      orderListId: evidence.exchangeProtectiveLists[0]?.orderListId || null
    });
    return { closedTrade: null, audit: { ...decision, applied: true, dryRun: false } };
  }
  if (["missing_protection", "rebuild_and_revalidate_protection"].includes(decision.autofixKind)) {
    const runtimeQuantity = Math.max(safeNumber(position.quantity, 0), 1e-9);
    const targetQuantity = Math.max(0, safeNumber(evidence.exchangeQuantity, 0));
    const absQuantityDiff = Math.abs(safeNumber(evidence.quantityDiff, 0));
    if (targetQuantity > 0 && absQuantityDiff > 0 && evidence.qtyWithinTolerance) {
      const quantityRatio = targetQuantity / runtimeQuantity;
      position.quantity = targetQuantity;
      position.totalCost = Math.max(0, safeNumber(position.totalCost, 0) * quantityRatio);
      position.notional = Math.max(0, safeNumber(position.entryPrice, 0) * targetQuantity);
      position.entryFee = Math.max(0, safeNumber(position.entryFee, 0) * quantityRatio);
    }
    if (evidence.exchangeProtectiveLists?.length === 1) {
      broker.attachProtectiveOrderState(position, evidence.exchangeProtectiveLists[0]);
    } else {
      // Fetch current market snapshot so the geometry validator can check TP/SL
      // against the real current price before we attempt to submit to the exchange.
      let marketSnapshot = null;
      try {
        marketSnapshot = await getMarketSnapshot(position.symbol);
      } catch (snapshotError) {
        broker.logger?.warn?.("Market snapshot unavailable for protective rebuild preflight", {
          symbol: position.symbol,
          error: snapshotError.message
        });
      }
      try {
        await broker.ensureProtectiveOrder(position, rules, runtime, "protective_rebuild", marketSnapshot);
      } catch (protectError) {
        // Geometry preflight rejection (our validator) or Binance -2010 "prices not correct":
        // do NOT propagate — that would crash startup. Instead, mark the position for
        // operator review and emit full diagnostics so the issue is visible.
        const isBinance2010 = protectError?.payload?.code === -2010 || String(protectError?.message || "").includes("-2010");
        const isGeometryError = Boolean(protectError?.protectiveOcoGeometryInvalid);
        if (isGeometryError || isBinance2010) {
          broker.logger?.warn?.("Protective rebuild blocked: invalid OCO geometry at reconcile time — position marked protect_only", {
            symbol: position.symbol,
            takeProfitPrice: protectError?.takeProfitPrice ?? position.takeProfitPrice,
            stopTriggerPrice: protectError?.stopTriggerPrice ?? position.stopLossPrice,
            stopLimitPrice: protectError?.stopLimitPrice ?? null,
            currentMid: protectError?.currentMid ?? marketSnapshot?.book?.mid ?? null,
            currentBid: protectError?.currentBid ?? marketSnapshot?.book?.bid ?? null,
            currentAsk: protectError?.currentAsk ?? marketSnapshot?.book?.ask ?? null,
            lifecycleState: position.lifecycleState,
            issues: protectError?.issues ?? [],
            error: protectError.message
          });
          broker.clearProtectiveOrderState(position);
          position.reconcileRequired = true;
          position.operatorMode = "protect_only";
          position.lifecycleState = "reconcile_required";
          const diagnosticWarning = {
            symbol: position.symbol,
            issue: "protective_rebuild_geometry_invalid",
            code: protectError?.code || "PROTECTIVE_OCO_GEOMETRY_INVALID",
            takeProfitPrice: protectError?.takeProfitPrice ?? position.takeProfitPrice,
            stopTriggerPrice: protectError?.stopTriggerPrice ?? position.stopLossPrice,
            stopLimitPrice: protectError?.stopLimitPrice ?? null,
            currentMid: protectError?.currentMid ?? marketSnapshot?.book?.mid ?? null,
            currentBid: protectError?.currentBid ?? marketSnapshot?.book?.bid ?? null,
            currentAsk: protectError?.currentAsk ?? marketSnapshot?.book?.ask ?? null,
            lifecycleState: position.lifecycleState,
            error: protectError.message
          };
          warnings.push(diagnosticWarning);
          updatePositionReconcileStatus(position, {
            decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
            reason: "protective_rebuild_geometry_invalid",
            evidenceSummary: decision.evidenceSummary,
            attemptCount: evidence.attemptCount,
            action: "protection_blocked_geometry_invalid"
          });
          return {
            closedTrade: null,
            audit: {
              ...decision,
              decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
              reason: "protective_rebuild_geometry_invalid",
              autofixKind: "missing_protection",
              applied: false,
              protectionBlocked: true,
              dryRun: false,
              auditOnly: false,
              evidenceSummary: decision.evidenceSummary
            }
          };
        }
        // Unexpected error: re-throw so the caller can handle it.
        throw protectError;
      }
    }
    if (decision.requiresProtectionRevalidation && isDemoPaperMode(broker.config)) {
      const postSnapshot = await fetchReconcileRetrySnapshot(broker, position.symbol, runtime);
      const postMarketSnapshot = typeof getMarketSnapshot === "function"
        ? await getMarketSnapshot(position.symbol).catch(() => null)
        : null;
      const postEvidence = collectReconcileEvidence(broker, {
        position,
        rules,
        assetMap: postSnapshot.assetMap,
        trackedOpenOrders: postSnapshot.trackedOpenOrders,
        openOrderLists: postSnapshot.openOrderLists,
        recentTrades: postSnapshot.recentTrades,
        marketSnapshot: postMarketSnapshot,
        snapshotErrors: postSnapshot.snapshotErrors,
        fetchedAt: postSnapshot.fetchedAt,
        attemptCount: (evidence.attemptCount || 1) + 1
      });
      if ((postEvidence.protectiveListCount <= 0 && broker.config.enableExchangeProtection) || postEvidence.protectiveListCount > 1 || postEvidence.unexpectedOrderCount > 0 || !postEvidence.qtyWithinTolerance) {
        markPositionForRetry(position, {
          decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
          reason: "protection_revalidation_pending",
          evidenceSummary: summarizeReconcileEvidence(postEvidence),
          attemptCount: postEvidence.attemptCount,
          action: "protection_revalidation_pending",
          reconcileConfidence: decision.reconcileConfidence,
          reconcileClassification: "recoverable_missing_protection",
          reconcileAutonomyState: "protect_only_retry",
          reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
          reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount
        });
        warnings.push({ symbol: position.symbol, issue: "auto_reconcile_protection_revalidation_pending" });
        return {
          closedTrade: null,
          audit: {
            ...decision,
            decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
            reason: "protection_revalidation_pending",
            applied: false,
            dryRun: false,
            evidenceSummary: summarizeReconcileEvidence(postEvidence)
          }
        };
      }
    }
    clearPositionReconcileFlags(position, {
      decision: decision.decision,
      reason: decision.reason,
      evidenceSummary: decision.evidenceSummary,
      attemptCount: evidence.attemptCount,
      action: "recovered_position_protection",
      reconcileConfidence: decision.reconcileConfidence,
      reconcileClassification: decision.reconcileClassification,
      reconcileAutonomyState: "auto_cleared",
      reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
      reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount,
      autoResolvedAt: nowIso()
    });
    warnings.push({ symbol: position.symbol, issue: "auto_reconcile_protection_restored" });
    warnings.push({
      symbol: position.symbol,
      issue: evidence.exchangeProtectiveLists?.length === 1
        ? "protective_order_state_adopted_from_exchange"
        : "protective_order_rebuilt"
    });
    return { closedTrade: null, audit: { ...decision, applied: true, dryRun: false } };
  }
  clearPositionReconcileFlags(position, {
    decision: decision.decision,
    reason: decision.reason,
    evidenceSummary: decision.evidenceSummary,
    attemptCount: evidence.attemptCount,
    action: "verify_only",
    resetReason: true,
    resetEvidence: true,
    reconcileConfidence: decision.reconcileConfidence,
    reconcileClassification: decision.reconcileClassification,
    reconcileAutonomyState: decision.reconcileAutonomyState || "auto_cleared",
    reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
    reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount,
    autoResolvedAt: nowIso()
  });
  return { closedTrade: null, audit: { ...decision, applied: true, dryRun: false } };
}

export async function resolvePositionReconcileDecision(broker, {
  position,
  runtime,
  rules,
  baseSnapshot,
  getMarketSnapshot,
  warnings,
  auditOnly = false
}) {
  const settings = getAutoReconcileConfig(broker.config);
  const nowMs = Date.now();
  const cooldownUntilMs = position.reconcileCooldownUntil ? new Date(position.reconcileCooldownUntil).getTime() : Number.NaN;
  if (Number.isFinite(cooldownUntilMs) && cooldownUntilMs > nowMs) {
    const evidenceSummary = summarizeReconcileEvidence(position.reconcileEvidence || {});
    const result = {
      decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
      reason: position.reconcileReason || "reconcile_cooldown_active",
      action: "cooldown_wait",
      autofixKind: "none",
      shouldRetry: false,
      evidenceSummary
    };
    if (!auditOnly) {
      markPositionForRetry(position, {
        decision: result.decision,
        reason: result.reason,
        evidenceSummary,
        attemptCount: position.autoReconcileAttemptCount || 1,
        action: "cooldown_wait",
        cooldownUntil: position.reconcileCooldownUntil || null
      });
    }
    return { closedTrade: null, audit: { ...result, applied: false, cooldownActive: true, dryRun: auditOnly, auditOnly } };
  }

  let snapshot = {
    ...baseSnapshot,
    recentTrades: baseSnapshot.recentTrades || []
  };
  let syncError = null;
  if (!auditOnly) {
    try {
      const trade = await broker.syncPosition(position, runtime);
      if (trade) {
        return {
          closedTrade: trade,
          audit: {
            decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
            reason: "protective_fill_recovered",
            action: "closed_from_protective_fill",
            autofixKind: "protective_fill",
            applied: true,
            dryRun: false,
            auditOnly: false,
            evidenceSummary: null
          }
        };
      }
    } catch (error) {
      syncError = error;
    }
  }

  let evidence = null;
  let decision = null;
  const maxAttempts = settings.enabled ? Math.max(1, settings.retryCount + 1) : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    evidence = collectReconcileEvidence(broker, {
      position,
      rules,
      assetMap: snapshot.assetMap,
      trackedOpenOrders: snapshot.trackedOpenOrders,
      openOrderLists: snapshot.openOrderLists,
      recentTrades: snapshot.recentTrades,
      snapshotErrors: snapshot.snapshotErrors,
      syncError,
      attemptCount: attempt,
      fetchedAt: snapshot.fetchedAt
    });
    decision = classifyReconcileDecision(broker, position, evidence, settings);
    if (decision.decision !== AUTO_RECONCILE_DECISION.TRANSIENT_RETRY || attempt >= maxAttempts) {
      break;
    }
    await sleep(settings.retryDelayMs);
    snapshot = await fetchReconcileRetrySnapshot(broker, position.symbol, runtime);
    syncError = null;
  }

  if (isDemoPaperMode(broker.config)) {
    const autonomousResolution = await maybeResolveDemoPaperAutonomy(broker, {
      position,
      runtime,
      rules,
      initialDecision: decision,
      initialEvidence: evidence,
      getMarketSnapshot
    });
    decision = autonomousResolution.decision;
    evidence = autonomousResolution.evidence || evidence;
  }

  if (decision.decision === AUTO_RECONCILE_DECISION.SAFE_AUTOFIX) {
    if (auditOnly) {
      return {
        closedTrade: null,
        audit: { ...decision, applied: false, dryRun: true, auditOnly: true }
      };
    }
    return applySafeReconcileAutofix(broker, {
      position,
      runtime,
      rules,
      decision,
      evidence,
      warnings,
      getMarketSnapshot,
      settings
    });
  }
  if (
    isDemoPaperMode(broker.config) &&
    decision.reason === "large_price_mismatch"
  ) {
    const priceMismatchStage = nextPriceMismatchStage(position);
    if (auditOnly) {
      return {
        closedTrade: null,
        audit: {
          ...decision,
          applied: false,
          dryRun: true,
          auditOnly: true,
          escalationStage: priceMismatchStage.stage,
          escalationCount: priceMismatchStage.count
        }
      };
    }
    position.priceMismatchEscalationCount = priceMismatchStage.count;
    if (priceMismatchStage.stage === "warning") {
      markPositionForRetry(position, {
        decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
        reason: decision.reason,
        evidenceSummary: decision.evidenceSummary,
        attemptCount: evidence?.attemptCount || 1,
        action: "price_mismatch_warning",
        reconcileConfidence: decision.reconcileConfidence,
        reconcileClassification: decision.reconcileClassification,
        reconcileAutonomyState: decision.reconcileAutonomyState,
        reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
        reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount
      });
      warnings.push({
        symbol: position.symbol,
        issue: "auto_reconcile_price_mismatch_warning",
        reason: decision.reason,
        escalationCount: priceMismatchStage.count
      });
      return {
        closedTrade: null,
        audit: {
          ...decision,
          decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
          applied: false,
          dryRun: false,
          escalationStage: priceMismatchStage.stage,
          escalationCount: priceMismatchStage.count
        }
      };
    }
    if (priceMismatchStage.stage === "protect_only") {
      markPositionProtectOnly(position, {
        decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
        reason: decision.reason,
        evidenceSummary: decision.evidenceSummary,
        attemptCount: evidence?.attemptCount || 1,
        action: "price_mismatch_protect_only",
        reconcileConfidence: decision.reconcileConfidence,
        reconcileClassification: decision.reconcileClassification,
        reconcileAutonomyState: decision.reconcileAutonomyState,
        reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
        reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount
      });
      warnings.push({
        symbol: position.symbol,
        issue: "auto_reconcile_price_mismatch_protect_only",
        reason: decision.reason,
        escalationCount: priceMismatchStage.count
      });
      return {
        closedTrade: null,
        audit: {
          ...decision,
          decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
          applied: false,
          dryRun: false,
          escalationStage: priceMismatchStage.stage,
          escalationCount: priceMismatchStage.count
        }
      };
    }
    markPositionForManualReview(position, {
      decision: decision.decision,
      reason: decision.reason,
      evidenceSummary: decision.evidenceSummary,
      attemptCount: evidence?.attemptCount || 1,
      action: "manual_review_required",
      error: decision.error || null,
      reconcileConfidence: decision.reconcileConfidence,
      reconcileClassification: decision.reconcileClassification,
      reconcileAutonomyState: "manual_review_required",
      reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
      reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount
    });
    warnings.push({
      symbol: position.symbol,
      issue: "auto_reconcile_manual_review_required",
      reason: decision.reason,
      escalationCount: priceMismatchStage.count
    });
    return {
      closedTrade: null,
      audit: {
        ...decision,
        applied: false,
        dryRun: false,
        escalationStage: priceMismatchStage.stage,
        escalationCount: priceMismatchStage.count
      }
    };
  }
  if (decision.decision === AUTO_RECONCILE_DECISION.TRANSIENT_RETRY) {
    const demoPaperScopedRetry = isDemoPaperMode(broker.config) && (
      ["recent_fill_pending", "recent_fill_not_yet_reflected", "protection_revalidation_pending", "partial_exchange_snapshot", "recent_protective_partial_fill"].includes(decision.reason) ||
      ["awaiting_fresh_fill_confirmation", "protect_only_retry"].includes(decision.reconcileAutonomyState)
    );
    if (auditOnly) {
      return {
        closedTrade: null,
        audit: {
          ...decision,
          decision: demoPaperScopedRetry ? AUTO_RECONCILE_DECISION.TRANSIENT_RETRY : AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
          applied: false,
          retriesExhausted: !demoPaperScopedRetry,
          dryRun: true,
          auditOnly: true
        }
      };
    }
    const cooldownUntil = new Date(Date.now() + Math.max(settings.retryDelayMs, 15_000)).toISOString();
    if (demoPaperScopedRetry) {
      markPositionForRetry(position, {
        decision: AUTO_RECONCILE_DECISION.TRANSIENT_RETRY,
        reason: decision.reason,
        evidenceSummary: decision.evidenceSummary,
        attemptCount: evidence?.attemptCount || maxAttempts,
        action: "retry_pending_confirmation",
        cooldownUntil,
        reconcileConfidence: decision.reconcileConfidence,
        reconcileClassification: decision.reconcileClassification,
        reconcileAutonomyState: decision.reconcileAutonomyState || "protect_only_retry",
        reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
        reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount
      });
      warnings.push({ symbol: position.symbol, issue: "auto_reconcile_retry_pending", reason: decision.reason });
      return {
        closedTrade: null,
        audit: {
          ...decision,
          applied: false,
          retriesExhausted: false,
          dryRun: false,
          auditOnly: false
        }
      };
    }
    markPositionForRetry(position, {
      decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
      reason: decision.reason,
      evidenceSummary: decision.evidenceSummary,
      attemptCount: evidence?.attemptCount || maxAttempts,
      action: "retry_exhausted",
      cooldownUntil,
      reconcileConfidence: decision.reconcileConfidence,
      reconcileClassification: decision.reconcileClassification,
      reconcileAutonomyState: "retry_exhausted",
      reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
      reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount
    });
    warnings.push({ symbol: position.symbol, issue: "auto_reconcile_retry_exhausted", reason: decision.reason });
    return {
      closedTrade: null,
      audit: {
        ...decision,
        decision: AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW,
        applied: false,
        retriesExhausted: true,
        dryRun: false,
        auditOnly: false
      }
    };
  }
  if (auditOnly) {
    return {
      closedTrade: null,
      audit: { ...decision, applied: false, dryRun: true, auditOnly: true }
    };
  }
  markPositionForManualReview(position, {
    decision: decision.decision,
    reason: decision.reason,
    evidenceSummary: decision.evidenceSummary,
    attemptCount: evidence?.attemptCount || 1,
    action: "manual_review_required",
    error: decision.error || null,
    reconcileConfidence: decision.reconcileConfidence,
    reconcileClassification: decision.reconcileClassification,
    reconcileAutonomyState: "manual_review_required",
    reconcileConfirmationSampleCount: decision.reconcileConfirmationSampleCount,
    reconcileStableConfirmationCount: decision.reconcileStableConfirmationCount
  });
  if ((evidence?.unexpectedOrderCount || 0) > 0 || decision.reason === "unexpected_open_order_for_managed_position") {
    warnings.push({ symbol: position.symbol, issue: "unexpected_open_order_for_managed_position" });
  }
  if (decision.reason === "multiple_protective_order_lists_detected") {
    warnings.push({ symbol: position.symbol, issue: "multiple_protective_order_lists_detected" });
  }
  warnings.push({ symbol: position.symbol, issue: "auto_reconcile_manual_review_required", reason: decision.reason });
  return { closedTrade: null, audit: { ...decision, applied: false, dryRun: false } };
}
