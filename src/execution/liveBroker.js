import crypto from "node:crypto";
import {
  formatPrice,
  formatQuantity,
  normalizePrice,
  normalizeQuantity,
  resolveMarketBuyQuantity,
  resolveStpMode
} from "../binance/symbolFilters.js";
import { isBinanceMinNotionalFilterError, resolveAllowSyntheticMinNotionalExit } from "./minNotionalExit.js";
import { ExecutionEngine } from "./executionEngine.js";
import { nowIso } from "../utils/time.js";
import {
  sleep,
  safeNumber,
  roundNumber,
  safeUpper,
  isActiveExchangeOrderStatus,
  toAssetMap,
  startLifecycleAction,
  touchLifecycleAction,
  finishLifecycleAction
} from "./liveBrokerRuntime.js";
import {
  appendExecutionIntentStep,
  beginExecutionIntent,
  failExecutionIntent,
  flushExecutionIntentLedger,
  markExecutionIntentAmbiguous,
  resolveExecutionIntent,
  touchExecutionIntent
} from "./executionIntentLedger.js";
import {
  AUTO_RECONCILE_DECISION,
  buildFlatPositionResolutionDiagnostics,
  getAutoReconcileConfig,
  fetchReconcileCollection,
  fetchRecentTrades,
  fetchReconcileRetrySnapshot,
  summarizeReconcileEvidence,
  updatePositionReconcileStatus,
  markPositionForManualReview,
  markPositionForRetry,
  clearPositionReconcileFlags,
  collectReconcileEvidence,
  classifyReconcileDecision,
  applySafeReconcileAutofix,
  resolveFlatManualReviewPosition,
  resolvePositionReconcileDecision
} from "./liveBrokerReconcile.js";
import {
  buildEventShockContext,
  buildExitDiagnostics,
  buildLifecycleOutcome,
  buildLiquidityContextAtEntry,
  buildPortfolioOverlapAtEntry,
  buildStopPlanAtEntry
} from "./tradeAnalyticsContext.js";
import { summarizeTradeFees } from "./feeAccounting.js";
import { evaluateRestBudgetAllowance } from "../runtime/restBudgetGovernor.js";

function sumTradeCommissionsToQuote(trades, baseAsset, quoteAsset) {
  return summarizeTradeFees({ trades, baseAsset, quoteAsset }).feeQuote;
}

function sumTradeCommissionsInAsset(trades, asset) {
  return (trades || []).reduce((total, trade) => {
    const commission = Number(trade.commission || 0);
    if (!commission || trade.commissionAsset !== asset) {
      return total;
    }
    return total + commission;
  }, 0);
}

function buildRecoveredRationale(symbol) {
  return {
    summary: `${symbol} werd teruggevonden op de exchange en opnieuw onder beheer geplaatst.`,
    probability: null,
    strategy: null,
    confidence: null,
    threshold: null,
    rankScore: null,
    quoteAmount: null,
    spreadBps: null,
    newsSentiment: 0,
    newsRisk: 0,
    regimeSummary: { regime: "range", confidence: 0, bias: 0, reasons: [] },
    portfolioSummary: { sameClusterCount: 0, sameSectorCount: 0, maxCorrelation: 0, sizeMultiplier: 1, reasons: [], correlations: [] },
    streamSnapshot: { tradeFlowImbalance: 0, microTrend: 0, recentTradeCount: 0, latestBookTicker: null, lastUserEvent: null },
    executionPlan: null,
    transformer: null,
    committee: null,
    rlPolicy: null,
    topSignals: [],
    challengerSignals: [],
    checks: [],
    headlines: []
  };
}

function tradeKey(trade = {}, index = 0) {
  const stableParts = [
    trade.time ?? trade.transactTime ?? "",
    trade.price ?? "",
    trade.qty ?? trade.executedQty ?? "",
    trade.quoteQty ?? trade.cummulativeQuoteQty ?? "",
    trade.commission ?? "",
    trade.commissionAsset ?? ""
  ];
  const explicitId = trade.id ?? trade.tradeId ?? trade.orderId ?? null;
  if (explicitId != null) {
    return [explicitId, ...stableParts].join(":");
  }
  if (stableParts.some((part) => `${part}` !== "")) {
    return stableParts.join(":");
  }
  return `trade-${index}`;
}

function mergeTrades(existing = [], incoming = []) {
  const map = new Map();
  [...existing, ...incoming].forEach((trade, index) => {
    if (!trade || typeof trade !== "object") {
      return;
    }
    map.set(tradeKey(trade, index), trade);
  });
  return [...map.values()];
}

function sumTradeExecutedQuantity(trades = []) {
  return trades.reduce((total, trade) => total + Number(trade.qty || trade.executedQty || 0), 0);
}

function sumTradeQuoteQuantity(trades = []) {
  return trades.reduce((total, trade) => {
    const quoteQty = Number(trade.quoteQty || trade.cummulativeQuoteQty || 0);
    if (quoteQty > 0) {
      return total + quoteQty;
    }
    return total + (Number(trade.qty || trade.executedQty || 0) * Number(trade.price || 0));
  }, 0);
}

function normalizeExecution(execution) {
  const order = execution.order || {};
  const providedTrades = Array.isArray(execution.trades) ? execution.trades.filter(Boolean) : [];
  const fallbackTrades = Array.isArray(order.fills) ? order.fills.filter(Boolean) : [];
  const trades = providedTrades.length ? providedTrades : fallbackTrades;
  const tradeExecutedQty = sumTradeExecutedQuantity(trades);
  const tradeQuoteQty = sumTradeQuoteQuantity(trades);
  return {
    order: {
      ...order,
      executedQty: Math.max(Number(order.executedQty || 0), tradeExecutedQty),
      cummulativeQuoteQty: Math.max(Number(order.cummulativeQuoteQty || 0), tradeQuoteQty)
    },
    trades
  };
}

function flattenReplaceResponse(response) {
  if (!response) {
    return [];
  }
  return [
    response.cancelResponse,
    response.cancelResult,
    response.newOrderResponse,
    response.newOrderResult,
    response.amendedOrder,
    response
  ].filter(Boolean);
}

function resolveReplacementOrderId(response, fallbackOrderId = null) {
  return response?.newOrderResponse?.orderId
    || response?.newOrderResult?.orderId
    || response?.amendedOrder?.orderId
    || response?.orderId
    || fallbackOrderId
    || null;
}

function mergeExecutions(existing = [], incoming = []) {
  const map = new Map();
  for (const execution of [...existing, ...incoming]) {
    const normalized = normalizeExecution(execution);
    const orderId = normalized.order?.orderId;
    const key = orderId == null ? crypto.randomUUID() : `${orderId}`;
    map.set(key, normalized);
  }
  return [...map.values()];
}

function summarizeExecutions(executions = [], quoteAmount = 0) {
  const executedQuote = executions.reduce((total, item) => total + Number(item.order?.cummulativeQuoteQty || 0), 0);
  return {
    executions,
    remainingQuote: Math.max(0, quoteAmount - executedQuote)
  };
}

const EMPTY_NEWS = {
  coverage: 0,
  sentimentScore: 0,
  riskScore: 0,
  confidence: 0,
  headlines: [],
  dominantEventType: "general",
  eventBullishScore: 0,
  eventBearishScore: 0,
  eventRiskScore: 0,
  maxSeverity: 0,
  sourceQualityScore: 0
};

/**
 * Validates that a SELL OCO order has correct price geometry relative to the current market.
 *
 * Binance SELL OCO rules (error -2010 if violated):
 *   takeProfitPrice  > currentMid   (LIMIT_MAKER above market)
 *   currentMid       > stopTriggerPrice  (stop-loss below market)
 *   stopLimitPrice  <= stopTriggerPrice  (limit leg at or below trigger)
 *   all prices must be finite and > 0
 *
 * Returns { valid, issues[], diagnostics{} }.
 */
export function validateProtectiveSellOcoGeometry({
  takeProfitPrice,
  stopTriggerPrice,
  stopLimitPrice,
  currentMid,
  currentBid = null,
  currentAsk = null,
  symbol = null,
  lifecycleState = null
}) {
  const issues = [];
  if (!Number.isFinite(currentMid) || currentMid <= 0) {
    issues.push("currentMid_invalid");
  }
  if (!Number.isFinite(takeProfitPrice) || takeProfitPrice <= 0) {
    issues.push("takeProfitPrice_invalid");
  }
  if (!Number.isFinite(stopTriggerPrice) || stopTriggerPrice <= 0) {
    issues.push("stopTriggerPrice_invalid");
  }
  if (!Number.isFinite(stopLimitPrice) || stopLimitPrice <= 0) {
    issues.push("stopLimitPrice_invalid");
  }
  if (issues.length === 0) {
    if (takeProfitPrice <= currentMid) {
      issues.push("takeProfitPrice_not_above_market");
    }
    if (stopTriggerPrice >= currentMid) {
      issues.push("stopTriggerPrice_not_below_market");
    }
    if (stopLimitPrice > stopTriggerPrice) {
      issues.push("stopLimitPrice_above_stopTriggerPrice");
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    diagnostics: {
      symbol,
      takeProfitPrice,
      stopTriggerPrice,
      stopLimitPrice,
      currentMid,
      currentBid,
      currentAsk,
      lifecycleState
    }
  };
}

export class LiveBroker {
  constructor({ client, config, logger, symbolRules, stream = null }) {
    this.client = client;
    this.config = config;
    this.logger = logger;
    this.symbolRules = symbolRules;
    this.stream = stream;
    this.execution = new ExecutionEngine(config);
  }

  async openExecutionIntent(runtime, payload = {}) {
    const started = beginExecutionIntent(runtime, {
      brokerMode: this.config.botMode || "live",
      ...payload
    });
    if (started.intent) {
      await flushExecutionIntentLedger(runtime).catch(() => {});
    }
    return started;
  }

  async failExecutionIntent(runtime, intentId, patch = {}, step = null) {
    const intent = failExecutionIntent(runtime, intentId, patch, step);
    await flushExecutionIntentLedger(runtime).catch(() => {});
    return intent;
  }

  async resolveExecutionIntent(runtime, intentId, patch = {}, step = null) {
    const intent = resolveExecutionIntent(runtime, intentId, patch, step);
    await flushExecutionIntentLedger(runtime).catch(() => {});
    return intent;
  }

  async markExecutionIntentAmbiguous(runtime, intentId, patch = {}, step = null) {
    const intent = markExecutionIntentAmbiguous(runtime, intentId, patch, step);
    await flushExecutionIntentLedger(runtime).catch(() => {});
    return intent;
  }

  async noteExecutionIntentStep(runtime, intentId, step = {}, patch = {}) {
    const intent = touchExecutionIntent(runtime, intentId, patch, step);
    await flushExecutionIntentLedger(runtime).catch(() => {});
    return intent;
  }

  createDuplicateIntentError(symbol, kind, existingIntent = null) {
    const error = new Error(`Unresolved ${kind} intent already exists for ${symbol}.`);
    error.blockedReason = "execution_intent_unresolved";
    error.symbolScoped = true;
    error.intentId = existingIntent?.id || null;
    error.preventFurtherEntries = kind === "entry";
    return error;
  }

  async doctor(runtime) {
    const account = await this.client.getAccountInfo(true, {
      requestMeta: { caller: "live_broker.doctor.account_info" }
    });
    const openOrderLists = await this.client.getOpenOrderLists();
    const quoteAsset = this.config.baseQuoteAsset;
    const quoteBalance = account.balances.find((asset) => asset.asset === quoteAsset);
    return {
      mode: "live",
      canTrade: account.canTrade,
      accountType: account.accountType,
      permissions: account.permissions,
      quoteFree: Number(quoteBalance?.free || 0),
      openOrderLists: openOrderLists.length,
      runtimeOpenPositions: runtime.openPositions.length,
      requireSelfTradePrevention: account.requireSelfTradePrevention,
      preventSor: account.preventSor
    };
  }

  async getBalance() {
    const account = await this.client.getAccountInfo(true, {
      requestMeta: { caller: "live_broker.balance.account_info" }
    });
    const quoteBalance = account.balances.find((asset) => asset.asset === this.config.baseQuoteAsset);
    return { quoteFree: Number(quoteBalance?.free || 0) };
  }

  async getEquity(runtime, midPrices = {}, balanceSnapshot = null) {
    const balance = balanceSnapshot && Number.isFinite(balanceSnapshot.quoteFree)
      ? balanceSnapshot
      : await this.getBalance();
    const positionsValue = (runtime.openPositions || []).reduce((total, position) => {
      const mid = midPrices[position.symbol] || position.lastMarkedPrice || position.entryPrice;
      return total + position.quantity * mid;
    }, 0);
    return balance.quoteFree + positionsValue;
  }

  async buildProtectiveOrderParams(position, rules, marketSnapshot = null) {
    const quantity = normalizeQuantity(position.quantity, rules, "floor", false);
    if (!quantity) {
      throw new Error(`Unable to normalize protective quantity for ${position.symbol}.`);
    }
    const stopTriggerPrice = normalizePrice(position.stopLossPrice, rules, "round");
    const stopLimitPrice = normalizePrice(stopTriggerPrice * (1 - this.config.liveStopLimitBufferPct), rules, "floor");
    const takeProfitPrice = normalizePrice(position.takeProfitPrice, rules, "round");

    // Preflight geometry check: validate normalized prices against current market before submitting.
    // Stale or inverted TP/SL values cause Binance to return -2010 "relationship of prices not correct".
    if (marketSnapshot) {
      const currentMid = Number(marketSnapshot?.book?.mid ?? 0);
      const currentBid = Number(marketSnapshot?.book?.bid ?? 0) || null;
      const currentAsk = Number(marketSnapshot?.book?.ask ?? 0) || null;
      const validation = validateProtectiveSellOcoGeometry({
        takeProfitPrice,
        stopTriggerPrice,
        stopLimitPrice,
        currentMid,
        currentBid,
        currentAsk,
        symbol: position.symbol,
        lifecycleState: position.lifecycleState ?? null
      });
      if (!validation.valid) {
        const geomError = new Error(
          `Invalid protective SELL OCO geometry for ${position.symbol}: TP=${takeProfitPrice} mid=${currentMid} stop=${stopTriggerPrice} issues=${validation.issues.join(",")}`
        );
        geomError.code = "PROTECTIVE_OCO_GEOMETRY_INVALID";
        geomError.protectiveOcoGeometryInvalid = true;
        geomError.symbol = position.symbol;
        geomError.takeProfitPrice = takeProfitPrice;
        geomError.stopTriggerPrice = stopTriggerPrice;
        geomError.stopLimitPrice = stopLimitPrice;
        geomError.currentMid = currentMid;
        geomError.currentBid = currentBid;
        geomError.currentAsk = currentAsk;
        geomError.lifecycleState = position.lifecycleState ?? null;
        geomError.issues = validation.issues;
        throw geomError;
      }
    }

    const stpMode = resolveStpMode(this.config.stpMode, rules);
    return {
      symbol: position.symbol,
      side: "SELL",
      quantity: formatQuantity(quantity, rules, false),
      aboveType: "LIMIT_MAKER",
      abovePrice: formatPrice(takeProfitPrice, rules),
      belowType: "STOP_LOSS_LIMIT",
      belowStopPrice: formatPrice(stopTriggerPrice, rules),
      belowPrice: formatPrice(stopLimitPrice, rules),
      belowTimeInForce: "GTC",
      newOrderRespType: "RESULT",
      ...(stpMode && stpMode !== "NONE" ? { selfTradePreventionMode: stpMode } : {})
    };
  }

  async placeProtectiveOrder(position, rules, runtime = null, origin = "protective_build", marketSnapshot = null, intentId = null) {
    const actionId = startLifecycleAction(runtime, {
      type: origin,
      symbol: position.symbol,
      positionId: position.id || null,
      stage: "submit",
      detail: "protective_order"
    });
    try {
      if (intentId) {
        await this.noteExecutionIntentStep(runtime, intentId, {
          type: "submit_protective_order",
          status: "pending",
          detail: origin
        });
      }
      const orderList = await this.client.placeOrderListOco(await this.buildProtectiveOrderParams(position, rules, marketSnapshot));
      position.protectiveOrderListId = orderList.orderListId;
      position.protectiveListClientOrderId = orderList.listClientOrderId || null;
      position.protectiveOrders = orderList.orders || [];
      position.protectiveOrderStatus = orderList.listStatusType || orderList.listOrderStatus || "NEW";
      position.protectiveOrderPlacedAt = nowIso();
      position.reconcileRequired = false;
      position.lifecycleState = position.manualReviewRequired
        ? "manual_review"
        : position.operatorMode === "protect_only"
          ? "protect_only"
          : "protected";
      finishLifecycleAction(runtime, actionId, {
        status: "completed",
        stage: "protected",
        severity: "positive",
        detail: `order_list:${orderList.orderListId || "unknown"}`
      });
      if (intentId) {
        await this.resolveExecutionIntent(runtime, intentId, {
          detail: origin,
          protectiveOrderListId: orderList.orderListId || null
        }, {
          type: "protective_order_submitted",
          status: "completed",
          detail: `order_list:${orderList.orderListId || "unknown"}`
        });
      }
      return orderList;
    } catch (error) {
      finishLifecycleAction(runtime, actionId, {
        status: "failed",
        stage: "error",
        severity: "negative",
        error: error.message
      });
      if (intentId) {
        await this.failExecutionIntent(runtime, intentId, {
          error: error.message,
          detail: origin
        }, {
          type: "protective_order_failed",
          status: "failed",
          error: error.message
        });
      }
      throw error;
    }
  }

  async ensureProtectiveOrder(position, rules, runtime = null, origin = "protective_build", marketSnapshot = null, intentContext = null) {
    if (!this.config.enableExchangeProtection || position.protectiveOrderListId) {
      return null;
    }
    let intentId = intentContext?.intentId || null;
    if (!intentId && runtime) {
      const started = await this.openExecutionIntent(runtime, {
        kind: "protection",
        symbol: position.symbol,
        positionId: position.id || null,
        idempotencyKey: origin,
        detail: origin,
        origin
      });
      if (started.duplicateUnresolved) {
        throw this.createDuplicateIntentError(position.symbol, "protection", started.intent);
      }
      intentId = started.intent?.id || null;
    }
    return this.placeProtectiveOrder(position, rules, runtime, origin, marketSnapshot, intentId);
  }

  clearProtectiveOrderState(position, status = null) {
    position.protectiveOrderListId = null;
    position.protectiveListClientOrderId = null;
    position.protectiveOrders = [];
    position.protectiveOrderStatus = status;
    position.protectiveOrderPlacedAt = null;
    if (position.quantity > 0) {
      position.lifecycleState = position.manualReviewRequired
        ? "manual_review"
        : position.operatorMode === "protect_only"
          ? "protect_only"
          : "protection_pending";
    }
  }

  attachProtectiveOrderState(position, orderList, placedAt = position.protectiveOrderPlacedAt || nowIso()) {
    position.protectiveOrderListId = orderList?.orderListId || null;
    position.protectiveListClientOrderId = orderList?.listClientOrderId || null;
    position.protectiveOrders = Array.isArray(orderList?.orders) ? orderList.orders : [];
    position.protectiveOrderStatus = orderList?.listStatusType || orderList?.listOrderStatus || position.protectiveOrderStatus || "NEW";
    position.protectiveOrderPlacedAt = placedAt;
    position.reconcileRequired = false;
    position.lifecycleState = position.manualReviewRequired
      ? "manual_review"
      : position.operatorMode === "protect_only"
        ? "protect_only"
        : "protected";
  }

  getOpenProtectiveOrderListsForSymbol(openOrderLists = [], symbol) {
    return (openOrderLists || []).filter((item) => {
      const itemSymbol = `${item?.symbol || ""}`.trim().toUpperCase();
      const status = `${item?.listStatusType || item?.listOrderStatus || ""}`.toUpperCase();
      return item?.orderListId != null
        && itemSymbol === `${symbol || ""}`.trim().toUpperCase()
        && status !== "ALL_DONE"
        && status !== "ALL_DONE_REJECT";
    });
  }

  buildOrderRequestMeta(plan, rules, responseType = "RESULT", clientOrderId = null) {
    const stpMode = resolveStpMode(this.config.stpMode, rules);
    return {
      newOrderRespType: responseType,
      newClientOrderId: clientOrderId || undefined,
      strategyId: plan?.strategyId || undefined,
      strategyType: plan?.strategyType || undefined,
      ...(stpMode && stpMode !== "NONE" ? { selfTradePreventionMode: stpMode } : {})
    };
  }

  buildClientOrderId(symbol, scope = "entry") {
    const normalizedScope = `${scope || "req"}`.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 4) || "req";
    const normalizedSymbol = `${symbol || "sym"}`.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "sym";
    const token = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    return `cbx-${normalizedScope}-${normalizedSymbol}-${token}`.slice(0, 36);
  }

  isRetriableSubmitError(error) {
    return ["AbortError", "TimeoutError"].includes(error?.name)
      || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNABORTED"].includes(error?.code)
      || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNABORTED"].includes(error?.cause?.code);
  }

  getAutoReconcileConfig() {
    return getAutoReconcileConfig(this.config);
  }

  async fetchReconcileCollection(fetcher, fallback = []) {
    return fetchReconcileCollection(fetcher, fallback);
  }

  async fetchRecentTrades(symbol, limit = 8) {
    const allowance = evaluateRestBudgetAllowance({
      caller: "live_broker.reconcile.recent_trades",
      priority: "medium",
      rateLimitState: this.client?.getRateLimitState ? this.client.getRateLimitState() : null,
      config: this.config,
      streamPrimary: Boolean(this.stream?.getStatus?.().userStreamConnected)
    });
    if (!allowance.allow) {
      return {
        trades: [],
        error: new Error("recent_trades_skipped_request_weight_pressure"),
        reason: allowance.reason || "request_weight_pressure",
        skipped: true,
        pressure: allowance.pressure,
        usedWeight1m: allowance.usedWeight1m,
        restBudget: allowance
      };
    }
    return fetchRecentTrades(this.client, symbol, limit);
  }

  async fetchReconcileRetrySnapshot(symbol, runtime) {
    return fetchReconcileRetrySnapshot(this, symbol, runtime);
  }

  summarizeReconcileEvidence(evidence = {}) {
    return summarizeReconcileEvidence(evidence);
  }

  updatePositionReconcileStatus(position, result = {}) {
    return updatePositionReconcileStatus(position, result);
  }

  markPositionForManualReview(position, result = {}) {
    return markPositionForManualReview(position, result);
  }

  markPositionForRetry(position, result = {}) {
    return markPositionForRetry(position, result);
  }

  clearPositionReconcileFlags(position, result = {}) {
    return clearPositionReconcileFlags(position, result);
  }

  buildSyntheticReconcileCloseTrade(position, marketSnapshot = null, evidenceSummary = null, overrides = {}) {
    const exitPrice = safeNumber(
      marketSnapshot?.book?.mid,
      safeNumber(position.lastMarkedPrice, safeNumber(position.entryPrice, 0))
    );
    const quantity = safeNumber(position.quantity, 0);
    const totalCost = safeNumber(position.totalCost, quantity * safeNumber(position.entryPrice, 0));
    const proceeds = quantity * exitPrice;
    const pnlQuote = proceeds - totalCost;
    const netPnlPct = totalCost ? pnlQuote / totalCost : 0;
    const syntheticSnapshot = marketSnapshot || {
      book: {
        bid: exitPrice,
        ask: exitPrice,
        mid: exitPrice,
        spreadBps: position.latestSpreadBps || 0
      }
    };
    return {
      id: position.id,
      symbol: position.symbol,
      entryAt: position.entryAt,
      exitAt: nowIso(),
      entryPrice: position.entryPrice,
      exitPrice,
      quantity,
      totalCost,
      proceeds,
      pnlQuote,
      netPnlPct,
      mfePct: position.entryPrice ? Math.max(0, ((position.highestPrice || position.entryPrice) - position.entryPrice) / position.entryPrice) : 0,
      maePct: position.entryPrice ? Math.min(0, ((position.lowestPrice || position.entryPrice) - position.entryPrice) / position.entryPrice) : 0,
      executionQualityScore: 0,
      entryExecutionAttribution: position.entryExecutionAttribution || null,
      exitExecutionAttribution: this.execution.buildExecutionAttribution({
        plan: this.buildExitPlan(position, "exchange_reconcile_autofix"),
        marketSnapshot: syntheticSnapshot,
        side: "SELL",
        fillPrice: exitPrice,
        requestedQuoteAmount: position.notional || totalCost || 0,
        executedQuote: proceeds,
        executedQuantity: quantity,
        orderResponses: [],
        orderTelemetry: {},
      fillEstimate: syntheticSnapshot.book.exitEstimate || null,
        brokerMode: overrides.brokerMode || "live"
      }),
      regimeAtEntry: position.regimeAtEntry || "range",
      strategyAtEntry: position.strategyAtEntry || position.entryRationale?.strategy?.activeStrategy || null,
      entrySpreadBps: position.entrySpreadBps || 0,
      exitSpreadBps: syntheticSnapshot.book.spreadBps || 0,
      reason: overrides.reason || "exchange_reconcile_confirmed_flat",
      exchangeOrderId: null,
      rawFeatures: position.rawFeatures,
      newsSummary: position.newsSummary,
      entryRationale: position.entryRationale || null,
      strategyDecision: position.strategyDecision || position.entryRationale?.strategy || null,
      transformerDecision: position.transformerDecision || position.entryRationale?.transformer || null,
      committeeDecision: position.committeeDecision || position.entryRationale?.committee || null,
      executionPolicyDecision: position.executionPolicyDecision || position.entryRationale?.rlPolicy || null,
      exitSource: overrides.exitSource || "exchange_reconcile_autofix",
      brokerMode: overrides.brokerMode || "live",
      reconciledClosure: true,
      reconcileEvidence: evidenceSummary || null
    };
  }

  collectReconcileEvidence({
    position,
    rules,
    assetMap,
    trackedOpenOrders,
    openOrderLists,
    recentTrades,
    snapshotErrors = [],
    syncError = null,
    attemptCount = 1,
    fetchedAt = nowIso()
  }) {
    return collectReconcileEvidence(this, {
      position,
      rules,
      assetMap,
      trackedOpenOrders,
      openOrderLists,
      recentTrades,
      snapshotErrors,
      syncError,
      attemptCount,
      fetchedAt
    });
  }

  classifyReconcileDecision(position, evidence = {}, settings = this.getAutoReconcileConfig()) {
    return classifyReconcileDecision(this, position, evidence, settings);
  }

  buildFlatPositionResolutionDiagnostics(position, evidence = {}, options = {}) {
    return buildFlatPositionResolutionDiagnostics(this, {
      position,
      evidence,
      ...options
    });
  }

  async resolveFlatManualReviewPosition({
    position,
    runtime,
    getMarketSnapshot,
    note = null,
    at = nowIso()
  } = {}) {
    const rules = this.symbolRules?.[position?.symbol];
    if (!position || !rules) {
      throw new Error("Positie of symbol rules ontbreken voor flat-position resolve.");
    }
    return resolveFlatManualReviewPosition(this, {
      position,
      runtime,
      rules,
      getMarketSnapshot,
      note,
      at
    });
  }

  async applySafeReconcileAutofix({ position, runtime, rules, decision, evidence, warnings, getMarketSnapshot, settings }) {
    return applySafeReconcileAutofix(this, {
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

  async resolvePositionReconcileDecision({
    position,
    runtime,
    rules,
    baseSnapshot,
    getMarketSnapshot,
    warnings,
    auditOnly = false
  }) {
    return resolvePositionReconcileDecision(this, {
      position,
      runtime,
      rules,
      baseSnapshot,
      getMarketSnapshot,
      warnings,
      auditOnly
    });
  }

  async recoverSubmittedEntryOrder({ symbol, clientOrderId, quoteAmount, rules }) {
    if (!clientOrderId || !this.client.getOrder) {
      return null;
    }
    try {
      const recoveredOrder = await this.client.getOrder(symbol, { origClientOrderId: clientOrderId }, {
        requestMeta: { caller: "live_broker.recover_submitted_entry_order" }
      });
      if (!recoveredOrder?.orderId) {
        return null;
      }
      const orderType = `${recoveredOrder.type || ""}`.toUpperCase();
      if (orderType === "LIMIT_MAKER") {
        const settled = await this.settleMakerOrder({ symbol, orderId: recoveredOrder.orderId, quoteAmount, rules });
        return {
          executions: settled.executions || [],
          remainingQuote: settled.remainingQuote ?? quoteAmount,
          orderResponses: settled.order ? [settled.order] : []
        };
      }
      const settled = await this.settleTerminalOrder({
        symbol,
        order: recoveredOrder,
        defaultTrades: recoveredOrder.fills || []
      });
      const normalized = normalizeExecution({ order: settled.order, trades: settled.trades });
      const executedQuote = Number(normalized.order.cummulativeQuoteQty || 0);
      const executedQty = Number(normalized.order.executedQty || 0);
      return {
        executions: executedQuote > 0 || executedQty > 0 ? [normalized] : [],
        remainingQuote: Math.max(0, quoteAmount - executedQuote),
        orderResponses: [normalized.order]
      };
    } catch {
      return null;
    }
  }

  async placeMarketBuy({ symbol, quoteAmount, rules, plan, runtime = null, intentId = null }) {
    const clientOrderId = this.buildClientOrderId(symbol, "entry");
    let order;
    try {
      if (intentId) {
        await this.noteExecutionIntentStep(runtime, intentId, {
          type: "submit_market_buy",
          status: "submitted",
          detail: clientOrderId
        }, {
          status: "submitted",
          clientOrderId
        });
      }
      order = await this.client.placeOrder({
        symbol,
        side: "BUY",
        type: "MARKET",
        quoteOrderQty: Number(quoteAmount).toFixed(2),
        ...this.buildOrderRequestMeta(plan, rules, "FULL", clientOrderId)
      });
    } catch (error) {
      if (!this.isRetriableSubmitError(error)) {
        throw error;
      }
      const recovered = await this.recoverSubmittedEntryOrder({ symbol, clientOrderId, quoteAmount, rules });
      if (!recovered) {
        throw error;
      }
      if (intentId) {
        await this.noteExecutionIntentStep(runtime, intentId, {
          type: "recover_market_buy",
          status: "submitted",
          detail: clientOrderId
        });
      }
      return {
        executions: recovered.executions || [],
        remainingQuote: recovered.remainingQuote ?? 0,
        orderResponses: recovered.orderResponses || [],
        amendmentCount: 0,
        cancelReplaceCount: 0,
        keepPriorityCount: 0
      };
    }
    return {
      executions: [normalizeExecution({ order, trades: order.fills || [] })],
      remainingQuote: 0,
      orderResponses: [order],
      amendmentCount: 0,
      cancelReplaceCount: 0,
      keepPriorityCount: 0
    };
  }

  async settleMakerOrder({ symbol, orderId, quoteAmount, rules }) {
    const order = await this.client.getOrder(symbol, { orderId }, {
      requestMeta: { caller: "live_broker.settle_maker_order" }
    });
    const trades = await this.client.getMyTrades(symbol, { orderId, limit: 50 }, {
      requestMeta: { caller: "live_broker.settle_maker_order_trades" }
    }).catch(() => []);
    const normalized = normalizeExecution({ order, trades });
    const executedQuote = Number(normalized.order.cummulativeQuoteQty || 0);
    const executedQty = Number(normalized.order.executedQty || 0);
    return {
      executions: executedQuote > 0 || executedQty > 0 ? [normalized] : [],
      remainingQuote: Math.max(0, quoteAmount - executedQuote),
      order: normalized.order
    };
  }

  async placePeggedLimitMakerBuy({ symbol, quoteAmount, rules, marketSnapshot, plan, runtime = null, intentId = null }) {
    const referencePrice = marketSnapshot.book.bid || marketSnapshot.book.mid;
    const size = resolveMarketBuyQuantity(quoteAmount, referencePrice, rules);
    if (!size.valid || !referencePrice) {
      return this.placeMarketBuy({ symbol, quoteAmount, rules, plan });
    }

    const clientOrderId = this.buildClientOrderId(symbol, "peg");
    let order;
    try {
      if (intentId) {
        await this.noteExecutionIntentStep(runtime, intentId, {
          type: "submit_pegged_maker_buy",
          status: "submitted",
          detail: clientOrderId
        }, {
          status: "submitted",
          clientOrderId
        });
      }
      order = await this.client.placeOrder({
        symbol,
        side: "BUY",
        type: "LIMIT_MAKER",
        quantity: formatQuantity(size.quantity, rules, false),
        pegPriceType: plan.pegPriceType,
        ...(plan.pegOffsetType && plan.pegOffsetValue != null ? { pegOffsetType: plan.pegOffsetType, pegOffsetValue: plan.pegOffsetValue } : {}),
        ...this.buildOrderRequestMeta(plan, rules, "RESULT", clientOrderId)
      });
    } catch (error) {
      if (!this.isRetriableSubmitError(error)) {
        throw error;
      }
      const recovered = await this.recoverSubmittedEntryOrder({ symbol, clientOrderId, quoteAmount, rules });
      if (!recovered) {
        throw error;
      }
      if (intentId) {
        await this.noteExecutionIntentStep(runtime, intentId, {
          type: "recover_pegged_maker_buy",
          status: "submitted",
          detail: clientOrderId
        });
      }
      return {
        executions: recovered.executions || [],
        remainingQuote: recovered.remainingQuote ?? quoteAmount,
        orderResponses: recovered.orderResponses || [],
        amendmentCount: 0,
        cancelReplaceCount: 0,
        keepPriorityCount: 0
      };
    }

    let workingOrderId = order.orderId;
    const orderResponses = [order];
    let keepPriorityCount = 0;
    let amendmentCount = 0;
    let executions = [];
    try {
      await sleep(Math.max(1200, plan?.makerPatienceMs || 3500));
      let settled = await this.settleMakerOrder({ symbol, orderId: workingOrderId, quoteAmount, rules });
      executions = mergeExecutions(executions, settled.executions || []);
      const liveOrder = settled.order;
      const remainingQty = normalizeQuantity(Number(liveOrder.origQty || 0) - Number(liveOrder.executedQty || 0), rules, "floor", false);

      if ((liveOrder.status === "NEW" || liveOrder.status === "PARTIALLY_FILLED") && remainingQty && plan?.allowKeepPriority) {
        try {
          const shrinkQty = normalizeQuantity(Number(liveOrder.executedQty || 0) + Math.max(remainingQty * 0.5, rules.minQty || 0), rules, "floor", false);
          if (shrinkQty && shrinkQty < Number(liveOrder.origQty || 0)) {
            const amend = await this.client.amendOrderKeepPriority({
              symbol,
              orderId: workingOrderId,
              newQty: formatQuantity(shrinkQty, rules, false)
            });
            keepPriorityCount += 1;
            amendmentCount += 1;
            orderResponses.push(...flattenReplaceResponse(amend));
            if (intentId) {
              await this.noteExecutionIntentStep(runtime, intentId, {
                type: "keep_priority_amend",
                status: "submitted",
                detail: `order:${workingOrderId}`
              });
            }
            await sleep(650);
            settled = await this.settleMakerOrder({ symbol, orderId: workingOrderId, quoteAmount, rules });
            executions = mergeExecutions(executions, settled.executions || []);
          }
        } catch (error) {
          this.logger?.warn?.("Pegged keep-priority amend skipped", { symbol, error: error.message });
        }
      }

      try {
        if (isActiveExchangeOrderStatus(settled.order?.status)) {
          const cancel = await this.client.cancelOrder(symbol, { orderId: workingOrderId });
          orderResponses.push(cancel);
          if (intentId) {
            await this.noteExecutionIntentStep(runtime, intentId, {
              type: "cancel_order",
              status: "submitted",
              detail: `order:${workingOrderId}`
            });
          }
          settled = await this.settleMakerOrder({ symbol, orderId: workingOrderId, quoteAmount, rules });
          executions = mergeExecutions(executions, settled.executions || []);
        }
      } catch (error) {
        settled = await this.settleMakerOrder({ symbol, orderId: workingOrderId, quoteAmount, rules }).catch(() => settled);
        executions = mergeExecutions(executions, settled.executions || []);
        if (isActiveExchangeOrderStatus(settled.order?.status)) {
          const ambiguityError = new Error(`Pegged maker order for ${symbol} remained active after cancel failure: ${error.message}`);
          ambiguityError.pendingOrderId = workingOrderId;
          ambiguityError.orderResponses = [...orderResponses];
          ambiguityError.ambiguousExchangeState = true;
          throw ambiguityError;
        }
        this.logger?.warn?.("Pegged maker cancel failed after the order had already settled", { symbol, error: error.message });
      }

      return {
        ...settled,
        ...summarizeExecutions(executions, quoteAmount),
        orderResponses,
        amendmentCount,
        cancelReplaceCount: 0,
        keepPriorityCount
      };
    } catch (error) {
      error.pendingOrderId = error.pendingOrderId || workingOrderId;
      error.orderResponses = [...orderResponses];
      throw error;
    }
  }

  async placeLimitMakerBuy({ symbol, quoteAmount, rules, marketSnapshot, plan, runtime = null, intentId = null }) {
    const limitPrice = normalizePrice(marketSnapshot.book.bid || marketSnapshot.book.mid, rules, "floor");
    const size = resolveMarketBuyQuantity(quoteAmount, limitPrice || marketSnapshot.book.mid, rules);
    if (!size.valid || !limitPrice) {
      return this.placeMarketBuy({ symbol, quoteAmount, rules, plan });
    }

    const clientOrderId = this.buildClientOrderId(symbol, "maker");
    let order;
    try {
      if (intentId) {
        await this.noteExecutionIntentStep(runtime, intentId, {
          type: "submit_limit_maker_buy",
          status: "submitted",
          detail: clientOrderId
        }, {
          status: "submitted",
          clientOrderId
        });
      }
      order = await this.client.placeOrder({
        symbol,
        side: "BUY",
        type: "LIMIT_MAKER",
        quantity: formatQuantity(size.quantity, rules, false),
        price: formatPrice(limitPrice, rules),
        ...this.buildOrderRequestMeta(plan, rules, "RESULT", clientOrderId)
      });
    } catch (error) {
      if (!this.isRetriableSubmitError(error)) {
        throw error;
      }
      const recovered = await this.recoverSubmittedEntryOrder({ symbol, clientOrderId, quoteAmount, rules });
      if (!recovered) {
        throw error;
      }
      if (intentId) {
        await this.noteExecutionIntentStep(runtime, intentId, {
          type: "recover_limit_maker_buy",
          status: "submitted",
          detail: clientOrderId
        });
      }
      return {
        executions: recovered.executions || [],
        remainingQuote: recovered.remainingQuote ?? quoteAmount,
        orderResponses: recovered.orderResponses || [],
        amendmentCount: 0,
        cancelReplaceCount: 0,
        keepPriorityCount: 0
      };
    }

    let workingOrderId = order.orderId;
    const orderResponses = [order];
    let amendmentCount = 0;
    let cancelReplaceCount = 0;
    let keepPriorityCount = 0;
    let executions = [];
    const halfPatience = Math.max(1200, Math.round((plan?.makerPatienceMs || 3500) / 2));
    try {
      await sleep(halfPatience);
      let settled = await this.settleMakerOrder({ symbol, orderId: workingOrderId, quoteAmount, rules });
      executions = mergeExecutions(executions, settled.executions || []);
      const firstOrder = settled.order;
      const remainingQty = normalizeQuantity(Number(firstOrder.origQty || 0) - Number(firstOrder.executedQty || 0), rules, "floor", false);

      if ((firstOrder.status === "NEW" || firstOrder.status === "PARTIALLY_FILLED") && remainingQty) {
        const freshBook = await this.client.getBookTicker(symbol, {
          requestMeta: { caller: "live_broker.maker_refresh_book_ticker" }
        }).catch(() => null);
        const freshBid = freshBook ? normalizePrice(Number(freshBook.bidPrice || 0), rules, "floor") : null;
        const currentPrice = Number(firstOrder.price || 0);
        if (freshBid && freshBid !== currentPrice) {
          const replacementClientOrderId = this.buildClientOrderId(symbol, "refr");
          try {
            const replace = await this.client.cancelReplaceOrder({
              symbol,
              cancelOrderId: workingOrderId,
              cancelReplaceMode: "STOP_ON_FAILURE",
              side: "BUY",
              type: "LIMIT_MAKER",
              quantity: formatQuantity(remainingQty, rules, false),
              price: formatPrice(freshBid, rules),
              newClientOrderId: replacementClientOrderId,
              ...this.buildOrderRequestMeta(plan, rules)
            });
            cancelReplaceCount += 1;
            amendmentCount += 1;
            orderResponses.push(...flattenReplaceResponse(replace));
            if (intentId) {
              await this.noteExecutionIntentStep(runtime, intentId, {
                type: "cancel_replace_order",
                status: "submitted",
                detail: `order:${workingOrderId}`
              });
            }
            workingOrderId = resolveReplacementOrderId(replace, workingOrderId);
            await sleep(Math.max(800, (plan?.makerPatienceMs || 3500) - halfPatience));
            settled = await this.settleMakerOrder({ symbol, orderId: workingOrderId, quoteAmount, rules });
            executions = mergeExecutions(executions, settled.executions || []);
          } catch (error) {
            let recovered = null;
            if (this.isRetriableSubmitError(error)) {
              recovered = await this.recoverSubmittedEntryOrder({ symbol, clientOrderId: replacementClientOrderId, quoteAmount, rules });
            }
            if (recovered) {
              cancelReplaceCount += 1;
              amendmentCount += 1;
              orderResponses.push(...(recovered.orderResponses || []));
              if (intentId) {
                await this.noteExecutionIntentStep(runtime, intentId, {
                  type: "recover_cancel_replace_order",
                  status: "submitted",
                  detail: replacementClientOrderId
                });
              }
              workingOrderId = recovered.orderResponses?.[0]?.orderId || workingOrderId;
              settled = {
                executions: recovered.executions || [],
                remainingQuote: recovered.remainingQuote ?? quoteAmount,
                order: recovered.orderResponses?.[0] || settled.order
              };
              executions = mergeExecutions(executions, settled.executions || []);
            } else {
              const ambiguityError = new Error(`Limit maker refresh for ${symbol} could not confirm the replacement order after submit failure: ${error.message}`);
              ambiguityError.pendingOrderId = workingOrderId;
              ambiguityError.orderResponses = [...orderResponses];
              ambiguityError.ambiguousExchangeState = true;
              throw ambiguityError;
            }
          }
        } else if (firstOrder.status === "PARTIALLY_FILLED" && plan?.allowKeepPriority) {
          try {
            const shrinkQty = normalizeQuantity(Number(firstOrder.executedQty || 0) + Math.max(remainingQty * 0.5, rules.minQty || 0), rules, "floor", false);
            if (shrinkQty && shrinkQty < Number(firstOrder.origQty || 0)) {
              const amend = await this.client.amendOrderKeepPriority({
                symbol,
                orderId: workingOrderId,
                newQty: formatQuantity(shrinkQty, rules, false)
              });
              keepPriorityCount += 1;
              amendmentCount += 1;
              orderResponses.push(...flattenReplaceResponse(amend));
              if (intentId) {
                await this.noteExecutionIntentStep(runtime, intentId, {
                  type: "keep_priority_amend",
                  status: "submitted",
                  detail: `order:${workingOrderId}`
                });
              }
            }
          } catch (error) {
            this.logger?.warn?.("Keep-priority amend skipped", { symbol, error: error.message });
          }
        }
      }

      try {
        if (isActiveExchangeOrderStatus(settled.order?.status)) {
          const cancel = await this.client.cancelOrder(symbol, { orderId: workingOrderId });
          orderResponses.push(cancel);
          if (intentId) {
            await this.noteExecutionIntentStep(runtime, intentId, {
              type: "cancel_order",
              status: "submitted",
              detail: `order:${workingOrderId}`
            });
          }
          settled = await this.settleMakerOrder({ symbol, orderId: workingOrderId, quoteAmount, rules });
          executions = mergeExecutions(executions, settled.executions || []);
        }
      } catch (error) {
        settled = await this.settleMakerOrder({ symbol, orderId: workingOrderId, quoteAmount, rules }).catch(() => settled);
        executions = mergeExecutions(executions, settled.executions || []);
        if (isActiveExchangeOrderStatus(settled.order?.status)) {
          const ambiguityError = new Error(`Limit maker order for ${symbol} remained active after cancel failure: ${error.message}`);
          ambiguityError.pendingOrderId = workingOrderId;
          ambiguityError.orderResponses = [...orderResponses];
          ambiguityError.ambiguousExchangeState = true;
          throw ambiguityError;
        }
        this.logger?.warn?.("Limit maker cancel failed after the order had already settled", { symbol, error: error.message });
      }

      return {
        ...settled,
        ...summarizeExecutions(executions, quoteAmount),
        orderResponses,
        amendmentCount,
        cancelReplaceCount,
        keepPriorityCount
      };
    } catch (error) {
      error.pendingOrderId = error.pendingOrderId || workingOrderId;
      error.orderResponses = [...orderResponses];
      throw error;
    }
  }

  async collectPreventedMatches(symbol, orderIds = []) {
    if (!this.config.enableStpTelemetryQuery || !orderIds.length) {
      return { preventedQuantity: 0, preventedMatchIds: [], matches: [] };
    }
    const responses = await Promise.allSettled(
      orderIds.slice(0, this.config.stpTelemetryLimit).map((orderId) => this.client.getMyPreventedMatches(symbol, { orderId, limit: this.config.stpTelemetryLimit }))
    );
    const matches = responses.flatMap((result) => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
    const preventedQuantity = matches.reduce((total, item) => total + Number(item.makerPreventedQuantity || item.preventedQuantity || 0), 0);
    const preventedMatchIds = [...new Set(matches.map((item) => item.preventedMatchId).filter((value) => value != null))];
    return { preventedQuantity, preventedMatchIds, matches };
  }

  async collectOrderTelemetry(symbol, orderIds = []) {
    if (this.stream?.getOrderExecutionTelemetry) {
      await sleep(120);
    }
    const streamTelemetry = this.stream?.getOrderExecutionTelemetry?.(symbol, orderIds) || {};
    const prevented = await this.collectPreventedMatches(symbol, orderIds).catch(() => ({ preventedQuantity: 0, preventedMatchIds: [], matches: [] }));
    return {
      ...streamTelemetry,
      preventedQuantity: Number(streamTelemetry.preventedQuantity || 0) + Number(prevented.preventedQuantity || 0),
      preventedMatchIds: [...new Set([...(streamTelemetry.preventedMatchIds || []), ...(prevented.preventedMatchIds || [])])],
      preventedMatches: prevented.matches || []
    };
  }

  async settleTerminalOrder({ symbol, order, defaultTrades = [], attempts = 4, delayMs = 160 }) {
    let latestOrder = order;
    const pendingStatuses = new Set(["NEW", "PARTIALLY_FILLED", "PENDING_NEW"]);
    if (this.client.getOrder && latestOrder?.orderId) {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const status = `${latestOrder?.status || ""}`.toUpperCase();
        if (status && !pendingStatuses.has(status)) {
          break;
        }
        if (attempt > 0 || !status) {
          await sleep(delayMs * attempt || delayMs);
        }
        try {
          latestOrder = await this.client.getOrder(symbol, { orderId: latestOrder.orderId }, {
            requestMeta: { caller: "live_broker.settle_terminal_order" }
          });
        } catch (error) {
          this.logger?.warn?.("Terminal order settle failed", { symbol, orderId: latestOrder.orderId, error: error.message });
          break;
        }
      }
    }

    const fallbackTrades = Array.isArray(defaultTrades) ? [...defaultTrades] : [];
    let trades = fallbackTrades;
    if (this.client.getMyTrades && latestOrder?.orderId) {
      try {
        const fetchedTrades = await this.client.getMyTrades(symbol, { orderId: latestOrder.orderId, limit: 50 }, {
          requestMeta: { caller: "live_broker.settle_terminal_order_trades" }
        });
        trades = Array.isArray(fetchedTrades) && fetchedTrades.length ? fetchedTrades : fallbackTrades;
      } catch (error) {
        this.logger?.warn?.("Terminal order trade fetch failed", { symbol, orderId: latestOrder.orderId, error: error.message });
      }
    }
    const normalized = normalizeExecution({ order: latestOrder, trades });
    return { order: normalized.order, trades: normalized.trades };
  }

  isDustRemainder({ quantity, notional, rules }) {
    return quantity < Math.max(rules.minQty || 0, 1e-9) || notional < Math.max(rules.minNotional || 0, this.config.minTradeUsdt || 0);
  }

  getMinSellNotionalUsd(rules) {
    const rawMin = Number(rules?.minNotional || 0);
    const base = rawMin > 0 ? rawMin : 5;
    const bufferPct = Math.max(0, Number(this.config.minNotionalExitBufferPct ?? 0.02));
    return base * (1 + bufferPct);
  }

  isSyntheticMinNotionalExitAllowed() {
    return resolveAllowSyntheticMinNotionalExit(this.config);
  }

  async performSyntheticMinNotionalExit({
    position,
    rules,
    marketSnapshot,
    reason,
    runtime,
    lifecycleActionId,
    exitSource = "synthetic_below_min_notional",
    context = "exit"
  }) {
    const qty = normalizeQuantity(position.quantity, rules, "floor", true);
    if (!qty) {
      throw new Error(`Synthetic exit: unable to normalize quantity for ${position.symbol}.`);
    }
    const sellMid = Number(
      marketSnapshot?.book?.bid
        ?? marketSnapshot?.book?.mid
        ?? position.lastMarkedPrice
        ?? position.entryPrice
        ?? 0
    );
    if (!Number.isFinite(sellMid) || sellMid <= 0) {
      throw new Error(`Synthetic exit needs a valid mark price for ${position.symbol}.`);
    }
    const grossQuote = qty * sellMid;
    const feeBps = Math.max(0, Number(this.config.paperFeeBps || 0)) / 10000;
    const feeQuote = grossQuote * feeBps;
    const order = {
      orderId: `synthetic_${context}_${position.symbol}_${Date.now()}`,
      status: "FILLED",
      executedQty: qty,
      cummulativeQuoteQty: grossQuote,
      type: "MARKET"
    };
    const trades = [
      {
        qty,
        executedQty: qty,
        price: sellMid,
        commission: feeQuote,
        commissionAsset: rules.quoteAsset
      }
    ];
    const orderTelemetry = {};
    this.clearProtectiveOrderState(position);
    if (runtime?.openPositions?.length) {
      runtime.openPositions = runtime.openPositions.filter((item) => item.id !== position.id);
    }
    this.logger?.info?.("Synthetic exit below exchange min notional (bookkeeping)", {
      symbol: position.symbol,
      quantity: qty,
      grossQuote,
      context,
      exitSource
    });
    finishLifecycleAction(runtime, lifecycleActionId, {
      status: "completed",
      stage: "synthetic_below_min_notional",
      severity: "neutral",
      detail: `${reason || context}:${grossQuote.toFixed(4)}`
    });
    const trade = this.buildTradeFromOrder(position, order, trades, reason, exitSource, marketSnapshot, orderTelemetry);
    trade.syntheticBelowMinNotional = true;
    return trade;
  }

  buildEntryFromExecutions({ symbol, executions, rules, marketSnapshot, decision, score, rawFeatures, newsSummary, entryRationale, plan, orderResponses = [], orderTelemetry = {}, amendmentCount = 0, cancelReplaceCount = 0, keepPriorityCount = 0, requestedQuoteAmount = 0 }) {
    const normalized = executions.map(normalizeExecution);
    const grossQuantity = normalized.reduce((total, item) => total + Number(item.order.executedQty || 0), 0);
    const quoteSpent = normalized.reduce((total, item) => total + Number(item.order.cummulativeQuoteQty || 0), 0);
    const baseFeeQuantity = normalized.reduce((total, item) => total + sumTradeCommissionsInAsset(item.trades, rules.baseAsset), 0);
    const quantity = Math.max(0, grossQuantity - baseFeeQuantity);
    if (!quantity || !quoteSpent) {
      throw new Error("Live buy returned empty fills.");
    }
    const entryFeeSummary = summarizeTradeFees({
      trades: normalized.flatMap((item) => item.trades || []),
      baseAsset: rules.baseAsset,
      quoteAsset: rules.quoteAsset
    });
    if (entryFeeSummary.unconvertedCount > 0) {
      this.logger?.warn?.("Live entry fee has unconverted commission asset", {
        symbol,
        unconvertedCount: entryFeeSummary.unconvertedCount,
        breakdown: entryFeeSummary.breakdown
      });
    }
    const fee = entryFeeSummary.feeQuote;
    const averagePrice = quoteSpent / quantity;
    const executionQualityScore = normalized.reduce((total, item) => {
      const fillPrice = Number(item.order.cummulativeQuoteQty || 0) / Math.max(Number(item.order.executedQty || 0), 1e-9);
      return total + this.execution.buildExecutionQuality({ marketSnapshot, fillPrice, side: "BUY" });
    }, 0) / normalized.length;
    const entryExecutionAttribution = this.execution.buildExecutionAttribution({
      plan,
      marketSnapshot,
      side: "BUY",
      fillPrice: averagePrice,
      requestedQuoteAmount,
      executedQuote: quoteSpent,
      executedQuantity: quantity,
      orderResponses,
      orderTelemetry,
      fillEstimate: marketSnapshot.book.entryEstimate || null,
      amendmentCount,
      cancelReplaceCount,
      keepPriorityCount,
      brokerMode: "live"
    });

    const strategyAtEntry = decision.strategySummary?.activeStrategy || entryRationale?.strategy?.activeStrategy || null;
    const strategyFamily = decision.strategySummary?.family || entryRationale?.strategy?.family || null;
    const sessionAtEntry =
      decision.sessionSummary?.session ||
      decision.session?.session ||
      entryRationale?.session?.session ||
      entryRationale?.sessionSummary?.session ||
      null;
    const conditionIdAtEntry =
      entryRationale?.marketCondition?.conditionId ||
      decision.entryDiagnostics?.marketCondition?.id ||
      null;
    return {
      id: crypto.randomUUID(),
      symbol,
      entryAt: nowIso(),
      entryPrice: averagePrice,
      quantity,
      grossQuantity,
      baseFeeQuantity,
      notional: quoteSpent,
      totalCost: quoteSpent + fee,
      entryFee: fee,
      entryFeeQuote: fee,
      entryFeeQuoteStatus: entryFeeSummary.feeQuoteStatus,
      entryFeeAssetBreakdown: entryFeeSummary.breakdown,
      observedEntryFeeBps: entryFeeSummary.observedFeeBps,
      highestPrice: averagePrice,
      lowestPrice: averagePrice,
      lastMarkedPrice: marketSnapshot.book.mid,
      stopLossPrice: averagePrice * (1 - decision.stopLossPct),
      takeProfitPrice: averagePrice * (1 + decision.takeProfitPct),
      trailingStopPct: this.config.trailingStopPct,
      probabilityAtEntry: score.probability,
      regimeAtEntry: decision.regime || score.regime || "range",
      entrySpreadBps: marketSnapshot.book.spreadBps || 0,
      latestSpreadBps: marketSnapshot.book.spreadBps || 0,
      exchangeOrderIds: normalized.map((item) => item.order.orderId),
      rawFeatures,
      newsSummary,
      entryRationale: entryRationale || null,
      executionPlan: plan,
      entryExecutionAttribution,
      strategyAtEntry,
      strategyFamily,
      setupId: entryRationale?.setupId || [strategyAtEntry || "unknown_strategy", conditionIdAtEntry || "unknown_condition"].join("::"),
      setupIdSource: entryRationale?.setupId ? "explicit" : "composed_strategy_condition",
      setupFamily: strategyFamily,
      sessionAtEntry,
      marketConditionAtEntry: conditionIdAtEntry,
      conditionIdAtEntry,
      liquidityContextAtEntry: buildLiquidityContextAtEntry({ entryRationale, marketSnapshot, entrySpreadBps: marketSnapshot.book.spreadBps || 0 }),
      portfolioOverlapAtEntry: buildPortfolioOverlapAtEntry({ entryRationale, decision }),
      eventShockAtEntry: buildEventShockContext({
        newsSummary,
        exchangeSummary: entryRationale?.exchange || {},
        calendarSummary: entryRationale?.calendar || {},
        marketStructureSummary: entryRationale?.marketStructure || {},
        dominantEventType: entryRationale?.dominantEventType || newsSummary?.dominantEventType || null
      }),
      stopPlanAtEntry: buildStopPlanAtEntry({
        entryPrice: averagePrice,
        stopLossPrice: averagePrice * (1 - decision.stopLossPct),
        takeProfitPrice: averagePrice * (1 + decision.takeProfitPct),
        trailingStopPct: this.config.trailingStopPct,
        scaleOutTriggerPrice: averagePrice * (1 + (decision.scaleOutPlan?.triggerPct || this.config.scaleOutTriggerPct)),
        scaleOutFraction: decision.scaleOutPlan?.fraction || this.config.scaleOutFraction
      }),
      strategyDecision: decision.strategySummary || entryRationale?.strategy || null,
      transformerDecision: score.transformer || entryRationale?.transformer || null,
      committeeDecision: decision.committeeSummary || entryRationale?.committee || null,
      executionPolicyDecision: decision.rlAdvice || entryRationale?.rlPolicy || null,
      executionQualityScore,
      scaleOutTriggerPrice: averagePrice * (1 + (decision.scaleOutPlan?.triggerPct || this.config.scaleOutTriggerPct)),
      scaleOutFraction: decision.scaleOutPlan?.fraction || this.config.scaleOutFraction,
      scaleOutMinNotionalUsd: decision.scaleOutPlan?.minNotionalUsd || this.config.scaleOutMinNotionalUsd,
      scaleOutTrailOffsetPct: decision.scaleOutPlan?.trailOffsetPct || this.config.scaleOutTrailOffsetPct,
      scaleOutCompletedAt: null,
      scaleOutCount: 0,
      brokerMode: "live",
      lifecycleState: this.config.enableExchangeProtection ? "protection_pending" : "open",
      operatorMode: "normal",
      managementFailureCount: 0,
      manualReviewRequired: false,
      reconcileRequired: false
    };
  }

  async recoverPendingEntryExecutions({ symbol, orderId, quoteAmount, rules }) {
    if (!orderId) {
      return { executions: [], orderResponses: [] };
    }
    try {
      const settled = await this.settleMakerOrder({ symbol, orderId, quoteAmount, rules });
      return {
        executions: settled.executions || [],
        orderResponses: settled.order ? [settled.order] : []
      };
    } catch (error) {
      this.logger?.warn?.("Pending entry recovery failed", { symbol, orderId, error: error.message });
      return { executions: [], orderResponses: [] };
    }
  }

  async emergencyFlattenPosition({ position, rules, marketSnapshot, plan, reason = "entry_recovery_flatten" }) {
    const quantity = normalizeQuantity(position.quantity, rules, "floor", true);
    if (!quantity) {
      throw new Error(`Unable to normalize recovery sell quantity for ${position.symbol}.`);
    }
    const submittedOrder = await this.client.placeOrder({
      symbol: position.symbol,
      side: "SELL",
      type: "MARKET",
      quantity: formatQuantity(quantity, rules, true),
      ...this.buildOrderRequestMeta(plan || position.executionPlan || {}, rules, "FULL")
    });
    const settled = await this.settleTerminalOrder({
      symbol: position.symbol,
      order: submittedOrder,
      defaultTrades: submittedOrder.fills || []
    });
    const order = settled.order;
    const trades = settled.trades;
    const executedQty = Math.max(0, Math.min(Number(order.executedQty || 0), position.quantity || 0));
    const remainingQuantity = Math.max(0, (position.quantity || 0) - executedQty);
    const remainingNotional = remainingQuantity * (marketSnapshot?.book?.mid || position.entryPrice || 0);
    if (remainingQuantity > 0 && !this.isDustRemainder({ quantity: remainingQuantity, notional: remainingNotional, rules })) {
      throw new Error(`Recovery flatten for ${position.symbol} partially filled and left ${remainingQuantity} open.`);
    }
    const orderTelemetry = await this.collectOrderTelemetry(position.symbol, [order.orderId]).catch(() => ({}));
    const trade = this.buildTradeFromOrder(position, order, trades, reason, reason, marketSnapshot, orderTelemetry);
    trade.recoveredEntry = true;
    return trade;
  }

  async recoverPositionProtection(position, rules, runtime, origin = "protective_rebuild") {
    if (!position?.quantity || !this.config.enableExchangeProtection) {
      return { safeguarded: false, warning: null };
    }
    try {
      await this.ensureProtectiveOrder(position, rules, runtime, origin);
      return { safeguarded: true, warning: null };
    } catch (rebuildError) {
      this.logger?.warn?.("Protective order recovery failed", { symbol: position.symbol, error: rebuildError.message, origin });
      this.clearProtectiveOrderState(position);
      position.reconcileRequired = true;
      position.lifecycleState = "reconcile_required";
      return { safeguarded: false, warning: rebuildError.message };
    }
  }

  async enterPosition({ symbol, rules, quoteAmount, marketSnapshot, decision, score, rawFeatures, strategySummary, newsSummary, entryRationale, runtime }) {
    const entryActionId = startLifecycleAction(runtime, {
      type: "entry_open",
      symbol,
      stage: "submit"
    });
    const plan = decision.executionPlan || this.execution.buildEntryPlan({
      symbol,
      marketSnapshot,
      score,
      decision,
      regimeSummary: { regime: decision.regime || score.regime || "range" },
      strategySummary: strategySummary || decision.strategySummary || entryRationale?.strategy || {},
      portfolioSummary: decision.portfolioSummary || {}
    });
    const startedIntent = await this.openExecutionIntent(runtime, {
      kind: "entry",
      symbol,
      scope: "symbol",
      idempotencyKey: "entry",
      detail: plan.entryStyle || "entry_submit",
      origin: "enter_position"
    });
    if (startedIntent.duplicateUnresolved) {
      finishLifecycleAction(runtime, entryActionId, {
        status: "warning",
        stage: "blocked_duplicate_intent",
        severity: "negative",
        detail: startedIntent.intent?.id || "execution_intent_unresolved"
      });
      throw this.createDuplicateIntentError(symbol, "entry", startedIntent.intent);
    }
    const entryIntentId = startedIntent.intent?.id || null;

    let executions = [];
    let remainingQuote = quoteAmount;
    let orderResponses = [];
    let amendmentCount = 0;
    let cancelReplaceCount = 0;
    let keepPriorityCount = 0;
    const resolvedDecision = {
      ...decision,
      strategySummary: strategySummary || decision.strategySummary || entryRationale?.strategy || null
    };
    let orderTelemetry = {};
    let position = null;

    try {
      if (plan.entryStyle === "pegged_limit_maker") {
        const makerResult = await this.placePeggedLimitMakerBuy({ symbol, quoteAmount, rules, marketSnapshot, plan, runtime, intentId: entryIntentId });
        executions.push(...makerResult.executions);
        remainingQuote = makerResult.remainingQuote;
        orderResponses.push(...(makerResult.orderResponses || []));
        amendmentCount += makerResult.amendmentCount || 0;
        cancelReplaceCount += makerResult.cancelReplaceCount || 0;
        keepPriorityCount += makerResult.keepPriorityCount || 0;
      } else if (plan.entryStyle === "limit_maker") {
        const makerResult = await this.placeLimitMakerBuy({ symbol, quoteAmount, rules, marketSnapshot, plan, runtime, intentId: entryIntentId });
        executions.push(...makerResult.executions);
        remainingQuote = makerResult.remainingQuote;
        orderResponses.push(...(makerResult.orderResponses || []));
        amendmentCount += makerResult.amendmentCount || 0;
        cancelReplaceCount += makerResult.cancelReplaceCount || 0;
        keepPriorityCount += makerResult.keepPriorityCount || 0;
      }

      if (!executions.length || (remainingQuote >= Math.max(this.config.minTradeUsdt, rules.minNotional || 0) && plan.fallbackStyle !== "none")) {
        const marketResult = await this.placeMarketBuy({ symbol, quoteAmount: executions.length ? remainingQuote : quoteAmount, rules, plan, runtime, intentId: entryIntentId });
        executions.push(...marketResult.executions);
        remainingQuote = marketResult.remainingQuote;
        orderResponses.push(...(marketResult.orderResponses || []));
      }
      if (remainingQuote >= Math.max(this.config.minTradeUsdt, rules.minNotional || 0)) {
        this.logger?.warn?.("Entry left residual quote after fallback", { symbol, remainingQuote });
      }

      const orderIds = executions.map((item) => item.order.orderId).filter(Boolean);
      orderTelemetry = await this.collectOrderTelemetry(symbol, orderIds);
      touchLifecycleAction(runtime, entryActionId, { stage: "build_position" });
      position = this.buildEntryFromExecutions({
        symbol,
        executions,
        rules,
        marketSnapshot,
        decision: resolvedDecision,
        score,
        rawFeatures,
        newsSummary,
        entryRationale,
        plan,
        orderResponses,
        orderTelemetry,
        amendmentCount,
        cancelReplaceCount,
        keepPriorityCount,
        requestedQuoteAmount: quoteAmount
      });
      touchLifecycleAction(runtime, entryActionId, { stage: "protect_position", positionId: position.id });
      await this.ensureProtectiveOrder(position, rules, runtime, "protective_build");
      runtime.openPositions.push(position);
      finishLifecycleAction(runtime, entryActionId, {
        status: "completed",
        stage: "position_opened",
        severity: "positive",
        positionId: position.id,
        detail: position.protectiveOrderListId ? "protected" : "open_without_protection"
      });
      if (entryIntentId) {
        await this.resolveExecutionIntent(runtime, entryIntentId, {
          positionId: position.id,
          exchangeOrderIds: Array.isArray(position.exchangeOrderIds) ? [...position.exchangeOrderIds] : [],
          detail: position.protectiveOrderListId ? "protected" : "opened"
        }, {
          type: "entry_position_opened",
          status: "completed",
          detail: position.protectiveOrderListId ? "protected" : "opened"
        });
      }
      return position;
    } catch (error) {
      if (!executions.length && error.pendingOrderId) {
        const recovered = await this.recoverPendingEntryExecutions({
          symbol,
          orderId: error.pendingOrderId,
          quoteAmount,
          rules
        });
        executions.push(...(recovered.executions || []));
        orderResponses.push(...(error.orderResponses || []), ...(recovered.orderResponses || []));
      }

      if (!executions.length) {
        throw error;
      }

      position = position || this.buildEntryFromExecutions({
        symbol,
        executions,
        rules,
        marketSnapshot,
        decision: resolvedDecision,
        score,
        rawFeatures,
        newsSummary,
        entryRationale,
        plan,
        orderResponses,
        orderTelemetry,
        amendmentCount,
        cancelReplaceCount,
        keepPriorityCount,
        requestedQuoteAmount: quoteAmount
      });

      try {
        const recoveredTrade = await this.emergencyFlattenPosition({
          position,
          rules,
          marketSnapshot,
          plan
        });
        finishLifecycleAction(runtime, entryActionId, {
          status: "recovered",
          stage: "auto_flattened",
          severity: "neutral",
          positionId: position.id,
          detail: recoveredTrade.reason
        });
        const ambiguousExchangeState = Boolean(error.ambiguousExchangeState);
        const exposureError = new Error(
          ambiguousExchangeState
            ? `Live entry for ${symbol} auto-flattened known exposure after failure, but exchange state remains ambiguous: ${error.message}`
            : `Live entry for ${symbol} opened exchange exposure but was auto-flattened after failure: ${error.message}`
        );
        exposureError.preventFurtherEntries = true;
        exposureError.blockedReason = ambiguousExchangeState
          ? "entry_requires_runtime_recovery"
          : "entry_recovered_after_partial_fill";
        exposureError.recoveredTrade = recoveredTrade;
        if (ambiguousExchangeState) {
          exposureError.activeOrderId = error.pendingOrderId || null;
        }
        if (entryIntentId) {
          await this.markExecutionIntentAmbiguous(runtime, entryIntentId, {
            ambiguityReason: ambiguousExchangeState
              ? "entry_exchange_state_ambiguous"
              : "entry_recovered_after_partial_fill",
            error: exposureError.message,
            detail: symbol
          });
        }
        throw exposureError;
      } catch (flattenError) {
        if (flattenError?.preventFurtherEntries) {
          throw flattenError;
        }
        position.reconcileRequired = true;
        position.lifecycleState = "reconcile_required";
        runtime.openPositions.push(position);
        finishLifecycleAction(runtime, entryActionId, {
          status: "failed",
          stage: "reconcile_required",
          severity: "negative",
          positionId: position.id,
          error: flattenError.message,
          detail: error.message
        });
        const exposureError = new Error(`Live entry for ${symbol} opened exchange exposure and remains under runtime management after failure: ${error.message}. Recovery failed: ${flattenError.message}`);
        exposureError.preventFurtherEntries = true;
        exposureError.blockedReason = "entry_requires_runtime_recovery";
        exposureError.openPosition = position;
        exposureError.cleanupError = flattenError;
        if (entryIntentId) {
          await this.markExecutionIntentAmbiguous(runtime, entryIntentId, {
            ambiguityReason: "entry_requires_runtime_recovery",
            error: exposureError.message,
            positionId: position.id
          });
        }
        throw exposureError;
      }
    } finally {
      if (entryIntentId && !runtime?.orderLifecycle?.executionIntentLedger?.intents?.[entryIntentId]?.resolvedAt) {
        const intentStatus = runtime?.orderLifecycle?.executionIntentLedger?.intents?.[entryIntentId]?.status;
        if (!["completed", "failed", "ambiguous"].includes(`${intentStatus || ""}`.toLowerCase())) {
          await this.failExecutionIntent(runtime, entryIntentId, {
            error: "entry_closed_without_terminal_intent_resolution",
            detail: symbol
          });
        }
      }
      if (runtime?.orderLifecycle?.activeActions?.[entryActionId]) {
        finishLifecycleAction(runtime, entryActionId, {
          status: "failed",
          stage: "entry_error",
          severity: "negative"
        });
      }
    }
  }

  async cancelProtectiveOrders(position, { strict = false, runtime = null, origin = "protective_cancel" } = {}) {
    if (!position.protectiveOrderListId) {
      return null;
    }
    const startedIntent = await this.openExecutionIntent(runtime, {
      kind: "cancel",
      symbol: position.symbol,
      positionId: position.id || null,
      idempotencyKey: origin,
      detail: origin,
      origin
    });
    if (startedIntent.duplicateUnresolved) {
      throw this.createDuplicateIntentError(position.symbol, "cancel", startedIntent.intent);
    }
    const cancelIntentId = startedIntent.intent?.id || null;
    const actionId = startLifecycleAction(runtime, {
      type: origin,
      symbol: position.symbol,
      positionId: position.id || null,
      stage: "cancel"
    });
    try {
      const response = await this.client.cancelOrderList({ symbol: position.symbol, orderListId: position.protectiveOrderListId });
      if (cancelIntentId) {
        await this.noteExecutionIntentStep(runtime, cancelIntentId, {
          type: "cancel_protective_order_list",
          status: "submitted",
          detail: `${position.protectiveOrderListId}`
        });
      }
      const responseStatus = `${response?.listStatusType || response?.listOrderStatus || ""}`.toUpperCase();
      const protectiveOrders = Array.isArray(response?.orders) && response.orders.length
        ? response.orders
        : Array.isArray(position.protectiveOrders)
          ? position.protectiveOrders
          : [];
      if (responseStatus === "ALL_DONE" && protectiveOrders.length && this.client.getOrder) {
        for (const listOrder of protectiveOrders) {
          const outcome = await this.settleProtectiveOrderFill(
            position,
            runtime,
            Number(listOrder?.orderId || 0) || null,
            listOrder?.type || null
          );
          if (outcome?.closedTrade) {
            finishLifecycleAction(runtime, actionId, {
              status: "completed",
              stage: "closed_via_protective_fill",
              severity: "neutral",
              detail: outcome.closedTrade.reason || "exchange_protective_order"
            });
            return { response, closedTrade: outcome.closedTrade };
          }
          if (outcome?.partialFill) {
            finishLifecycleAction(runtime, actionId, {
              status: "warning",
              stage: "reconcile_required",
              severity: "negative",
              detail: "protective_partial_fill"
            });
            return { response, positionChanged: true, partialFill: outcome.partialFill };
          }
        }
      }
      if (responseStatus === "ALL_DONE" && !protectiveOrders.length) {
        const streamFill = this.getProtectiveFillFromStream(position);
        if (streamFill?.orderId) {
          const outcome = await this.settleProtectiveOrderFill(position, runtime, streamFill.orderId, streamFill.orderType);
          if (outcome?.closedTrade) {
            finishLifecycleAction(runtime, actionId, {
              status: "completed",
              stage: "closed_via_protective_fill",
              severity: "neutral",
              detail: outcome.closedTrade.reason || "exchange_protective_order"
            });
            return { response, closedTrade: outcome.closedTrade };
          }
          if (outcome?.partialFill) {
            finishLifecycleAction(runtime, actionId, {
              status: "warning",
              stage: "reconcile_required",
              severity: "negative",
              detail: "protective_partial_fill"
            });
            return { response, positionChanged: true, partialFill: outcome.partialFill };
          }
        }
        position.reconcileRequired = true;
        position.lifecycleState = "reconcile_required";
        position.lastManagementError = `Protective cancel state for ${position.symbol} was ambiguous; reconcile required.`;
        const ambiguousError = new Error(`Protective cancel state for ${position.symbol} is ambiguous.`);
        ambiguousError.ambiguousExchangeState = true;
        ambiguousError.blockedReason = "protective_cancel_state_ambiguous";
        finishLifecycleAction(runtime, actionId, {
          status: strict ? "failed" : "warning",
          stage: "reconcile_required",
          severity: "negative",
          error: ambiguousError.message
        });
        if (strict) {
          throw ambiguousError;
        }
        return { response, closedTrade: null, positionChanged: true, ambiguous: true };
      }
      this.clearProtectiveOrderState(position, "CANCELED");
      if (cancelIntentId) {
        await this.resolveExecutionIntent(runtime, cancelIntentId, {
          detail: "protective_canceled"
        });
      }
      finishLifecycleAction(runtime, actionId, {
        status: "completed",
        stage: "canceled",
        severity: "neutral"
      });
      return { response, closedTrade: null, positionChanged: false };
    } catch (error) {
      this.logger?.warn?.("Protective order-list cancel failed", { symbol: position.symbol, error: error.message });
      if (cancelIntentId) {
        await (strict
          ? this.markExecutionIntentAmbiguous(runtime, cancelIntentId, {
              ambiguityReason: "protective_cancel_state_ambiguous",
              error: error.message
            })
          : this.failExecutionIntent(runtime, cancelIntentId, {
              error: error.message,
              detail: origin
            }));
      }
      finishLifecycleAction(runtime, actionId, {
        status: strict ? "failed" : "warning",
        stage: "cancel_error",
        severity: "negative",
        error: error.message
      });
      if (strict) {
        throw error;
      }
      return null;
    }
  }

  buildExitPlan(position, exitSource = "bot_market_exit") {
    return {
      entryStyle: exitSource === "exchange_protective_order" ? "protective_order" : "market_exit",
      fallbackStyle: "none",
      preferMaker: false,
      usePeggedOrder: false,
      strategyId: position.executionPlan?.strategyId || null,
      strategyType: position.executionPlan?.strategyType || null,
      depthConfidence: position.entryExecutionAttribution?.depthConfidence || 0,
      queueImbalance: position.entryExecutionAttribution?.queueImbalance || 0,
      queueRefreshScore: position.entryExecutionAttribution?.queueRefreshScore || 0,
      resilienceScore: position.entryExecutionAttribution?.resilienceScore || 0,
      tradeFlow: 0,
      expectedImpactBps: 0,
      expectedSlippageBps: 0
    };
  }

  buildTradeFromOrder(position, order, trades, reason, exitSource, marketSnapshot = null, orderTelemetry = {}) {
    const rules = this.symbolRules[position.symbol];
    const executedQty = Number(order.executedQty || position.quantity);
    const quoteReceived = Number(order.cummulativeQuoteQty || 0);
    const averagePrice = executedQty ? quoteReceived / executedQty : position.lastMarkedPrice;
    const exitFeeSummary = summarizeTradeFees({
      trades,
      baseAsset: rules.baseAsset,
      quoteAsset: rules.quoteAsset
    });
    if (exitFeeSummary.unconvertedCount > 0) {
      this.logger?.warn?.("Live exit fee has unconverted commission asset", {
        symbol: position.symbol,
        orderId: order.orderId,
        unconvertedCount: exitFeeSummary.unconvertedCount,
        breakdown: exitFeeSummary.breakdown
      });
    }
    const fee = exitFeeSummary.feeQuote;
    const proceeds = quoteReceived - fee;
    const pnlQuote = proceeds - position.totalCost;
    const netPnlPct = position.totalCost ? pnlQuote / position.totalCost : 0;
    const syntheticSnapshot = marketSnapshot || {
      book: {
        bid: averagePrice,
        ask: averagePrice,
        mid: averagePrice,
        spreadBps: position.latestSpreadBps || 0
      }
    };
    const exitExecutionAttribution = this.execution.buildExecutionAttribution({
      plan: this.buildExitPlan(position, exitSource),
      marketSnapshot: syntheticSnapshot,
      side: "SELL",
      fillPrice: averagePrice,
      requestedQuoteAmount: position.notional || position.totalCost || 0,
      executedQuote: quoteReceived,
      executedQuantity: executedQty,
      orderResponses: [order],
      orderTelemetry,
      fillEstimate: syntheticSnapshot.book.exitEstimate || null,
      brokerMode: "live"
    });
    const mfePct = position.entryPrice ? Math.max(0, ((position.highestPrice || position.entryPrice) - position.entryPrice) / position.entryPrice) : 0;
    const maePct = position.entryPrice ? Math.min(0, ((position.lowestPrice || position.entryPrice) - position.entryPrice) / position.entryPrice) : 0;
    return {
      id: position.id,
      symbol: position.symbol,
      entryAt: position.entryAt,
      exitAt: nowIso(),
      entryPrice: position.entryPrice,
      exitPrice: averagePrice,
      quantity: executedQty,
      totalCost: position.totalCost,
      entryFee: position.entryFee || 0,
      entryFeeQuote: position.entryFeeQuote ?? position.entryFee ?? 0,
      entryFeeAssetBreakdown: position.entryFeeAssetBreakdown || [],
      observedEntryFeeBps: position.observedEntryFeeBps ?? null,
      proceeds,
      grossProceeds: quoteReceived,
      exitFee: fee,
      exitFeeQuote: fee,
      exitFeeQuoteStatus: exitFeeSummary.feeQuoteStatus,
      exitFeeAssetBreakdown: exitFeeSummary.breakdown,
      observedExitFeeBps: exitFeeSummary.observedFeeBps,
      pnlQuote,
      netPnlPct,
      mfePct,
      maePct,
      executionQualityScore: this.execution.buildExecutionQuality({ marketSnapshot: syntheticSnapshot, fillPrice: averagePrice, side: "SELL" }),
      entryExecutionAttribution: position.entryExecutionAttribution || null,
      exitExecutionAttribution,
      regimeAtEntry: position.regimeAtEntry || "range",
      strategyAtEntry: position.strategyAtEntry || position.entryRationale?.strategy?.activeStrategy || null,
      strategyFamily: position.strategyFamily || position.entryRationale?.strategy?.family || null,
      setupId: position.setupId || null,
      setupIdSource: position.setupIdSource || null,
      setupFamily: position.setupFamily || position.strategyFamily || null,
      sessionAtEntry: position.sessionAtEntry || null,
      marketConditionAtEntry: position.marketConditionAtEntry || position.conditionIdAtEntry || position.entryRationale?.marketCondition?.conditionId || null,
      conditionIdAtEntry: position.conditionIdAtEntry || position.marketConditionAtEntry || position.entryRationale?.marketCondition?.conditionId || null,
      entrySpreadBps: position.entrySpreadBps || 0,
      exitSpreadBps: syntheticSnapshot.book.spreadBps || 0,
      reason,
      exchangeOrderId: order.orderId,
      rawFeatures: position.rawFeatures,
      newsSummary: position.newsSummary,
      entryRationale: position.entryRationale || null,
      strategyDecision: position.strategyDecision || position.entryRationale?.strategy || null,
      transformerDecision: position.transformerDecision || position.entryRationale?.transformer || null,
      committeeDecision: position.committeeDecision || position.entryRationale?.committee || null,
      executionPolicyDecision: position.executionPolicyDecision || position.entryRationale?.rlPolicy || null,
      exitSource,
      brokerMode: "live",
      liquidityContextAtEntry: position.liquidityContextAtEntry || buildLiquidityContextAtEntry({
        entryRationale: position.entryRationale || {},
        marketSnapshot: syntheticSnapshot,
        entrySpreadBps: position.entrySpreadBps
      }),
      portfolioOverlapAtEntry: position.portfolioOverlapAtEntry || buildPortfolioOverlapAtEntry({ position, entryRationale: position.entryRationale || {} }),
      eventShockAtEntry: position.eventShockAtEntry || buildEventShockContext({
        newsSummary: position.newsSummary || {},
        exchangeSummary: position.entryRationale?.exchange || {},
        calendarSummary: position.entryRationale?.calendar || {},
        marketStructureSummary: position.entryRationale?.marketStructure || {},
        dominantEventType: position.entryRationale?.dominantEventType || position.newsSummary?.dominantEventType || null
      }),
      eventShockAtExit: buildEventShockContext({
        newsSummary: position.latestNewsSummary || position.newsSummary || {},
        exchangeSummary: position.latestExchangeSummary || {},
        calendarSummary: position.latestCalendarSummary || {},
        marketStructureSummary: position.latestMarketStructureSummary || {},
        dominantEventType:
          position.latestExchangeSummary?.dominantEventType ||
          position.latestNewsSummary?.dominantEventType ||
          null
      }),
      stopPlanAtEntry: position.stopPlanAtEntry || buildStopPlanAtEntry(position),
      exitDiagnostics: buildExitDiagnostics({
        position,
        exitPrice: averagePrice,
        reason,
        exitSource,
        netPnlPct,
        mfePct,
        maePct
      }),
      lifecycleOutcome: buildLifecycleOutcome({
        position,
        reason,
        exitSource
      })
    };
  }

  getProtectiveFillFromStream(position) {
    const orderIds = (position.protectiveOrders || []).map((item) => Number(item?.orderId || 0)).filter(Boolean);
    const events = this.stream?.getRecentExecutionReports?.(
      position.symbol,
      {
        orderIds,
        orderListId: position.protectiveOrderListId || null,
        maxAgeMs: this.config.orderStreamTruthMaxAgeMs || 180_000
      }
    ) || [];
    const filledEvent = [...events].reverse().find((event) => Number(event.orderId || 0) > 0 && (event.status === "FILLED" || (event.executionType === "TRADE" && Number(event.executedQty || 0) > 0)));
    if (!filledEvent) {
      return null;
    }
    return {
      orderId: Number(filledEvent.orderId || 0) || null,
      orderType: filledEvent.orderType || null,
      status: filledEvent.status || null,
      orderListId: filledEvent.orderListId || null,
      executionType: filledEvent.executionType || null
    };
  }

  async settleProtectiveOrderFill(position, runtime, orderId, fallbackOrderType = null) {
    if (!orderId || !this.client.getOrder) {
      return null;
    }
    const order = await this.client.getOrder(position.symbol, { orderId });
    const executedQty = Number(order?.executedQty || 0);
    const orderStatus = `${order?.status || ""}`.toUpperCase();
    if (orderStatus !== "FILLED" && executedQty <= 0) {
      return null;
    }
    const trades = this.client.getMyTrades
      ? await this.client.getMyTrades(position.symbol, { orderId, limit: 50 }).catch(() => [])
      : [];
    const orderTelemetry = await this.collectOrderTelemetry(position.symbol, [orderId]).catch(() => ({}));
    const remainingQuantity = Math.max(0, Number(position.quantity || 0) - executedQty);
    const fallbackMarkedPrice = Number(order?.price || order?.stopPrice || position.lastMarkedPrice || position.entryPrice || 0);
    const remainingNotional = remainingQuantity * Math.max(fallbackMarkedPrice, 0);
    const fullFill = orderStatus === "FILLED"
      || remainingQuantity <= 0
      || this.isDustRemainder({ quantity: remainingQuantity, notional: remainingNotional, rules: this.symbolRules[position.symbol] });
    if (fullFill) {
      runtime.openPositions = runtime.openPositions.filter((item) => item.id !== position.id);
      return {
        closedTrade: this.buildTradeFromOrder(
          position,
          order,
          trades,
          `${order?.type || fallbackOrderType || ""}`.includes("STOP") ? "protective_stop_loss" : "protective_take_profit",
          "exchange_protective_order",
          null,
          orderTelemetry
        ),
        partialFill: null
      };
    }
    const originalQuantity = Math.max(Number(position.quantity || 0), 1e-9);
    const proportion = executedQty / originalQuantity;
    const allocatedCost = Number(position.totalCost || 0) * proportion;
    position.quantity = remainingQuantity;
    position.totalCost = Math.max(0, Number(position.totalCost || 0) - allocatedCost);
    position.notional = Math.max(0, Number(position.entryPrice || 0) * position.quantity);
    position.entryFee = Math.max(0, Number(position.entryFee || 0) - Number(position.entryFee || 0) * proportion);
    position.lastMarkedPrice = fallbackMarkedPrice || position.lastMarkedPrice;
    this.clearProtectiveOrderState(position, "PARTIALLY_FILLED");
    position.reconcileRequired = true;
    position.lifecycleState = "reconcile_required";
    position.lastProtectivePartialFillAt = nowIso();
    position.lastManagementError = "Protective order partially filled for " + position.symbol + "; reconcile required.";
    return {
      closedTrade: null,
      partialFill: {
        orderId,
        executedQuantity: executedQty,
        remainingQuantity,
        reason: `${order?.type || fallbackOrderType || ""}`.includes("STOP") ? "protective_stop_loss_partial" : "protective_take_profit_partial"
      }
    };
  }

  async syncPosition(position, runtime) {
    if (!position.protectiveOrderListId) {
      return null;
    }
    const streamFill = this.getProtectiveFillFromStream(position);
    try {
      const orderList = await this.client.getOrderList({ orderListId: position.protectiveOrderListId });
      position.protectiveOrderStatus = orderList.listStatusType || orderList.listOrderStatus || position.protectiveOrderStatus;
      if (orderList.listStatusType !== "ALL_DONE" && orderList.listOrderStatus !== "ALL_DONE") {
        if (streamFill?.orderId) {
          const outcome = await this.settleProtectiveOrderFill(position, runtime, streamFill.orderId, streamFill.orderType);
          if (outcome?.closedTrade) {
            return outcome.closedTrade;
          }
          if (outcome?.partialFill) {
            return null;
          }
        }
        return null;
      }
      for (const listOrder of orderList.orders || []) {
        const order = await this.client.getOrder(position.symbol, { orderId: listOrder.orderId });
        if (order.status === "FILLED") {
          const trades = await this.client.getMyTrades(position.symbol, { orderId: order.orderId, limit: 50 });
          const orderTelemetry = await this.collectOrderTelemetry(position.symbol, [order.orderId]);
          runtime.openPositions = runtime.openPositions.filter((item) => item.id !== position.id);
          return this.buildTradeFromOrder(
            position,
            order,
            trades,
            order.type.includes("STOP") ? "protective_stop_loss" : "protective_take_profit",
            "exchange_protective_order",
            null,
            orderTelemetry
          );
        }
        if (`${order?.status || ""}`.toUpperCase() === "PARTIALLY_FILLED" && Number(order?.executedQty || 0) > 0) {
          const outcome = await this.settleProtectiveOrderFill(position, runtime, order.orderId, order.type);
          if (outcome?.closedTrade) {
            return outcome.closedTrade;
          }
          if (outcome?.partialFill) {
            return null;
          }
        }
      }
      if (streamFill?.orderId) {
        const recoveredTrade = await this.settleProtectiveOrderFill(position, runtime, streamFill.orderId, streamFill.orderType);
        if (recoveredTrade) {
          return recoveredTrade;
        }
      }
      this.clearProtectiveOrderState(position, orderList.listStatusType || orderList.listOrderStatus || "ALL_DONE");
      return null;
    } catch (error) {
      if (streamFill?.orderId) {
        const outcome = await this.settleProtectiveOrderFill(position, runtime, streamFill.orderId, streamFill.orderType).catch(() => null);
        if (outcome?.closedTrade) {
          return outcome.closedTrade;
        }
      }
      throw error;
    }
  }

  async reconcileRuntime({ runtime, getMarketSnapshot, auditOnly = false }) {
    const reconcileActionId = startLifecycleAction(runtime, {
      type: "exchange_reconcile",
      symbol: null,
      stage: "account_sync"
    });
    try {
      const account = await this.client.getAccountInfo(true, {
        requestMeta: { caller: "live_broker.reconcile.account_info" }
      });
      const assetMap = toAssetMap(account);
      let openOrdersResult = this.client.getOpenOrders
        ? await this.fetchReconcileCollection(() => this.client.getOpenOrders(undefined, {
          requestMeta: { caller: "live_broker.reconcile.open_orders" }
        }), [])
        : { items: [], error: null };
      let openOrderListsResult = this.client.getOpenOrderLists
        ? await this.fetchReconcileCollection(() => this.client.getOpenOrderLists(), [])
        : { items: [], error: null };
      const autoReconcileSettings = this.getAutoReconcileConfig();
      for (let retry = 0; retry < autoReconcileSettings.retryCount; retry += 1) {
        if (!openOrdersResult.error && !openOrderListsResult.error) {
          break;
        }
        await sleep(autoReconcileSettings.retryDelayMs);
        if (openOrdersResult.error && this.client.getOpenOrders) {
          openOrdersResult = await this.fetchReconcileCollection(() => this.client.getOpenOrders(undefined, {
            requestMeta: { caller: "live_broker.reconcile.open_orders_retry" }
          }), []);
        }
        if (openOrderListsResult.error && this.client.getOpenOrderLists) {
          openOrderListsResult = await this.fetchReconcileCollection(() => this.client.getOpenOrderLists(), []);
        }
      }
      let trackedOpenOrders = Array.isArray(openOrdersResult.items) ? [...openOrdersResult.items] : [];
      const openOrderLists = Array.isArray(openOrderListsResult.items) ? [...openOrderListsResult.items] : [];
      const openOrderListIds = new Set((openOrderLists || []).map((item) => item.orderListId).filter((value) => value != null));
      const closedTrades = [];
      const cleanupTargets = [];
      const recoveredPositions = [];
      const warnings = [];
      const ignoredDustSymbols = new Set();
      const autoReconcileAudits = [];
      const reconcileSnapshotErrors = [
        openOrdersResult.error ? { source: "open_orders", error: openOrdersResult.error.message } : null,
        openOrderListsResult.error ? { source: "open_order_lists", error: openOrderListsResult.error.message } : null
      ].filter(Boolean);
      const recentTradesBySymbol = new Map();
      if (this.client.getMyTrades) {
        const recentTradeResults = await Promise.allSettled(
          [...new Set((runtime.openPositions || []).map((position) => position.symbol).filter(Boolean))]
            .map(async (symbol) => ({
              symbol,
              ...(await this.fetchRecentTrades(symbol, 8))
            }))
        );
        for (const result of recentTradeResults) {
          if (result.status !== "fulfilled") {
            continue;
          }
          recentTradesBySymbol.set(result.value.symbol, {
            trades: result.value.trades || [],
            error: result.value.error || null
          });
        }
      }

    for (const position of [...runtime.openPositions]) {
      const rules = this.symbolRules[position.symbol];
      if (!rules) {
        continue;
      }
      const recentTradeResult = recentTradesBySymbol.get(position.symbol) || { trades: [], error: null };
      const reconcileResult = await this.resolvePositionReconcileDecision({
        position,
        runtime,
        rules,
        baseSnapshot: {
          assetMap,
          trackedOpenOrders,
          openOrderLists,
          recentTrades: recentTradeResult.trades || [],
          snapshotErrors: [
            ...reconcileSnapshotErrors,
            recentTradeResult.error ? { source: "recent_trades", error: recentTradeResult.error.message } : null
          ].filter(Boolean),
          fetchedAt: nowIso()
        },
        getMarketSnapshot,
        warnings,
        auditOnly
      });
      if (reconcileResult?.audit) {
        autoReconcileAudits.push({
          symbol: position.symbol,
          checkedAt: position.lastReconcileCheckAt || nowIso(),
          decision: reconcileResult.audit.decision || null,
          reason: reconcileResult.audit.reason || null,
          autofixKind: reconcileResult.audit.autofixKind || "none",
          applied: Boolean(reconcileResult.audit.applied),
          dryRun: Boolean(reconcileResult.audit.dryRun),
          auditOnly: Boolean(reconcileResult.audit.auditOnly),
          evidence: reconcileResult.audit.evidenceSummary || position.reconcileEvidence || null,
          confidence: Number.isFinite(reconcileResult.audit.reconcileConfidence) ? roundNumber(reconcileResult.audit.reconcileConfidence, 4) : null,
          classification: reconcileResult.audit.reconcileClassification || null,
          autonomyState: reconcileResult.audit.reconcileAutonomyState || null,
          confirmationSampleCount: reconcileResult.audit.reconcileConfirmationSampleCount || 0,
          stableConfirmationCount: reconcileResult.audit.reconcileStableConfirmationCount || 0,
          escalationStage: reconcileResult.audit.escalationStage || null,
          escalationCount: reconcileResult.audit.escalationCount || null,
          retryHistorySummary: position.reconcileRetrySummary || null
        });
        this.logger?.info?.("Auto reconcile decision", {
          symbol: position.symbol,
          decision: reconcileResult.audit.decision,
          reason: reconcileResult.audit.reason,
          autofixKind: reconcileResult.audit.autofixKind || "none",
          applied: Boolean(reconcileResult.audit.applied),
          dryRun: Boolean(reconcileResult.audit.dryRun),
          confidence: Number.isFinite(reconcileResult.audit.reconcileConfidence) ? roundNumber(reconcileResult.audit.reconcileConfidence, 4) : null,
          classification: reconcileResult.audit.reconcileClassification || null,
          autonomyState: reconcileResult.audit.reconcileAutonomyState || null,
          evidence: reconcileResult.audit.evidenceSummary || null
        });
      }
      if (reconcileResult?.closedTrade) {
        closedTrades.push(reconcileResult.closedTrade);
        if (reconcileResult.cleanupTarget) {
          cleanupTargets.push(reconcileResult.cleanupTarget);
        }
        continue;
      }
      if (reconcileResult?.audit?.evidenceSummary?.freeResidualExplainable) {
        warnings.push({
          symbol: position.symbol,
          issue: "managed_position_free_residual_ignored",
          quantity: reconcileResult.audit.evidenceSummary.unmanagedResidualQuantity,
          freeQuantity: reconcileResult.audit.evidenceSummary.exchangeFreeQuantity,
          lockedQuantity: reconcileResult.audit.evidenceSummary.exchangeLockedQuantity,
          runtimeQuantity: reconcileResult.audit.evidenceSummary.runtimeQuantity
        });
      }
    }

    for (const [symbol, rules] of Object.entries(this.symbolRules)) {
      if (runtime.openPositions.some((position) => position.symbol === symbol)) {
        continue;
      }
      const assetBalance = assetMap[rules.baseAsset]?.total || 0;
      const symbolOpenOrders = trackedOpenOrders.filter((order) => order?.symbol === symbol);
      const openSellOrders = symbolOpenOrders.filter((order) => `${order?.side || ""}`.toUpperCase() === "SELL");
      if (assetBalance < Math.max(rules.minQty || 0, 0)) {
        continue;
      }
      const marketSnapshot = await getMarketSnapshot(symbol);
      const normalizedQuantity = normalizeQuantity(assetBalance, rules, "floor", false) || 0;
      const unmanagedNotional = normalizedQuantity * Math.max(Number(marketSnapshot?.book?.mid || 0), 0);
      if (!normalizedQuantity || this.isDustRemainder({ quantity: normalizedQuantity, notional: unmanagedNotional, rules })) {
        ignoredDustSymbols.add(symbol);
        warnings.push({
          symbol,
          issue: "ignored_dust_balance",
          quantity: assetBalance,
          normalizedQuantity,
          notional: unmanagedNotional
        });
        continue;
      }
      if (openSellOrders.length) {
        warnings.push({
          symbol,
          issue: "orphaned_exit_order_with_balance",
          orderCount: openSellOrders.length,
          quantity: assetBalance
        });
        continue;
      }
      if (!this.config.allowRecoverUnsyncedPositions || auditOnly) {
        warnings.push({ symbol, issue: "unmanaged_balance_detected", quantity: assetBalance });
        continue;
      }
      const recoveredPosition = {
        id: crypto.randomUUID(),
        symbol,
        entryAt: nowIso(),
        entryPrice: marketSnapshot.book.mid,
        quantity: normalizedQuantity,
        notional: normalizedQuantity * marketSnapshot.book.mid,
        totalCost: normalizedQuantity * marketSnapshot.book.mid,
        entryFee: 0,
        highestPrice: marketSnapshot.book.mid,
        lowestPrice: marketSnapshot.book.mid,
        lastMarkedPrice: marketSnapshot.book.mid,
        stopLossPrice: marketSnapshot.book.mid * (1 - this.config.stopLossPct),
        takeProfitPrice: marketSnapshot.book.mid * (1 + this.config.takeProfitPct),
        trailingStopPct: this.config.trailingStopPct,
        probabilityAtEntry: null,
        regimeAtEntry: "range",
        rawFeatures: {},
        newsSummary: EMPTY_NEWS,
        entryRationale: buildRecoveredRationale(symbol),
        executionPlan: null,
        entryExecutionAttribution: null,
        strategyAtEntry: null,
        strategyDecision: null,
        transformerDecision: null,
        committeeDecision: null,
        executionPolicyDecision: null,
        brokerMode: "live",
        recovered: true,
        lifecycleState: this.config.enableExchangeProtection ? "protection_pending" : "recovered_open",
        operatorMode: "normal",
        managementFailureCount: 0,
        manualReviewRequired: false,
        reconcileRequired: false
      };
      runtime.openPositions.push(recoveredPosition);
      recoveredPositions.push(recoveredPosition);
      try {
        await this.ensureProtectiveOrder(recoveredPosition, rules, runtime, "protective_rebuild", marketSnapshot);
      } catch (error) {
        recoveredPosition.reconcileRequired = true;
        recoveredPosition.operatorMode = "protect_only";
        recoveredPosition.lifecycleState = "reconcile_required";
        const isBinance2010 = error?.payload?.code === -2010 || String(error?.message || "").includes("-2010");
        this.logger?.warn?.("Protective rebuild blocked for recovered position", {
          symbol,
          isBinance2010,
          isGeometryError: Boolean(error?.protectiveOcoGeometryInvalid),
          takeProfitPrice: error?.takeProfitPrice ?? recoveredPosition.takeProfitPrice,
          stopTriggerPrice: error?.stopTriggerPrice ?? recoveredPosition.stopLossPrice,
          currentMid: error?.currentMid ?? marketSnapshot?.book?.mid ?? null,
          error: error.message
        });
        warnings.push({
          symbol,
          issue: error?.protectiveOcoGeometryInvalid || isBinance2010
            ? "protective_rebuild_geometry_invalid"
            : "protective_order_for_recovered_position_failed",
          ...(error?.protectiveOcoGeometryInvalid || isBinance2010 ? {
            takeProfitPrice: error?.takeProfitPrice ?? recoveredPosition.takeProfitPrice,
            stopTriggerPrice: error?.stopTriggerPrice ?? recoveredPosition.stopLossPrice,
            stopLimitPrice: error?.stopLimitPrice ?? null,
            currentMid: error?.currentMid ?? marketSnapshot?.book?.mid ?? null,
            currentBid: error?.currentBid ?? marketSnapshot?.book?.bid ?? null,
            currentAsk: error?.currentAsk ?? marketSnapshot?.book?.ask ?? null
          } : {}),
          error: error.message
        });
      }
    }

    const restartRecoveryActive = Boolean(runtime.recovery?.uncleanShutdownDetected || runtime.recovery?.restoredFromBackupAt);
    if (!auditOnly && restartRecoveryActive && this.client.cancelOrder) {
      const runtimeSymbolsForCleanup = new Set((runtime.openPositions || []).map((position) => position.symbol));
      for (const order of [...trackedOpenOrders]) {
        const symbol = order?.symbol || null;
        const rules = symbol ? this.symbolRules[symbol] : null;
        if (!symbol || !rules || runtimeSymbolsForCleanup.has(symbol)) {
          continue;
        }
        const status = `${order?.status || ""}`.toUpperCase();
        const side = `${order?.side || ""}`.toUpperCase();
        const balance = assetMap[rules.baseAsset]?.total || 0;
        const activePendingStatus = ["NEW", "PARTIALLY_FILLED", "PENDING_NEW"].includes(status);
        const hasRecoverableBalance = balance >= Math.max(rules.minQty || 0, 0);
        const staleEntryOrder = side === "BUY" && activePendingStatus && !hasRecoverableBalance;
        const staleExitOrder = side === "SELL" && activePendingStatus && !hasRecoverableBalance;
        if (!staleEntryOrder && !staleExitOrder) {
          continue;
        }
        try {
          await this.client.cancelOrder(symbol, { orderId: order.orderId });
          trackedOpenOrders = trackedOpenOrders.filter((item) => !(item?.symbol === symbol && item?.orderId === order.orderId));
          warnings.push({ symbol, issue: staleEntryOrder ? "stale_untracked_entry_order_canceled" : "stale_untracked_exit_order_canceled" });
        } catch (error) {
          warnings.push({ symbol, issue: staleEntryOrder ? "stale_untracked_entry_order_cancel_failed" : "stale_untracked_exit_order_cancel_failed", error: error.message });
        }
      }
    }

      const runtimeSymbols = new Set((runtime.openPositions || []).map((position) => position.symbol));
      const exchangeSymbols = Object.entries(this.symbolRules)
        .filter(([symbol, rules]) => !ignoredDustSymbols.has(symbol) && (assetMap[rules.baseAsset]?.total || 0) >= Math.max(rules.minQty || 0, 0))
        .map(([symbol]) => symbol);
      const trackedTruthSymbols = [...new Set([...runtimeSymbols, ...exchangeSymbols, ...trackedOpenOrders.map((order) => order.symbol).filter(Boolean)])].slice(0, 12);
      const unmatchedOrderSymbols = [...new Set(trackedOpenOrders.map((order) => order.symbol).filter((symbol) => symbol && !runtimeSymbols.has(symbol)))];
      const staleProtectiveSymbols = warnings
        .filter((warning) => warning.issue === "protective_order_state_stale")
        .map((warning) => warning.symbol)
        .filter(Boolean);
      const orphanedSymbols = exchangeSymbols.filter((symbol) => !runtimeSymbols.has(symbol));
      const manualInterferenceSymbols = warnings
        .filter((warning) => ["orphaned_exit_order_with_balance", "unexpected_open_order_for_managed_position", "auto_reconcile_manual_review_required"].includes(warning.issue))
        .map((warning) => warning.symbol)
        .filter(Boolean);
      const missingRuntimeSymbols = warnings
        .filter((warning) => warning.issue === "runtime_position_missing_on_exchange")
        .map((warning) => warning.symbol)
        .filter(Boolean);
      const autoReconcileManualSymbols = autoReconcileAudits
        .filter((item) => item.decision === AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW)
        .map((item) => item.symbol)
        .filter(Boolean);
      const recentFillSymbols = [];
      if (this.client.getMyTrades) {
        const tradeLookbackMs = (this.config.exchangeTruthRecentFillLookbackMinutes || 30) * 60_000;
        const recentTradeResults = await Promise.allSettled(
          trackedTruthSymbols.map((symbol) => this.fetchRecentTrades(symbol, 8))
        );
        recentTradeResults.forEach((result, index) => {
          if (result.status !== "fulfilled") {
            return;
          }
          const hasRecentTrade = (result.value?.trades || []).some((trade) => {
            const tradeAt = Number(trade.time || trade.transactTime || 0);
            return Number.isFinite(tradeAt) && (Date.now() - tradeAt) <= tradeLookbackMs;
          });
          if (hasRecentTrade) {
            recentFillSymbols.push(trackedTruthSymbols[index]);
          }
        });
      }
      const mismatchCount = [...new Set([
        ...orphanedSymbols,
        ...missingRuntimeSymbols,
        ...unmatchedOrderSymbols,
        ...staleProtectiveSymbols,
        ...autoReconcileManualSymbols,
        ...recentFillSymbols,
        ...warnings
          .filter((warning) => [
            "protective_order_rebuild_failed",
            "protective_order_for_recovered_position_failed",
            "protective_order_state_stale",
            "position_sync_failed",
            "unmanaged_balance_detected",
            "stale_untracked_entry_order_cancel_failed",
            "stale_untracked_exit_order_cancel_failed",
            "multiple_protective_order_lists_detected",
            "orphaned_exit_order_with_balance",
            "unexpected_open_order_for_managed_position",
            "auto_reconcile_manual_review_required",
          ].includes(warning.issue))
          .map((warning) => warning.symbol)
          .filter(Boolean)
      ])].length;
      const binanceDemoPaper =
        this.config.botMode === "paper" && String(this.config.paperExecutionVenue || "").toLowerCase() === "binance_demo_spot";
      const freezeEntries = binanceDemoPaper
        ? false
        : mismatchCount >= (this.config.exchangeTruthFreezeMismatchCount || 2);
      const autoResolvedCount = autoReconcileAudits.filter((item) => item.applied).length;
      const manualRequiredCount = autoReconcileAudits.filter((item) => item.decision === AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW).length;
      const retryCount = autoReconcileAudits.filter((item) => item.decision === AUTO_RECONCILE_DECISION.TRANSIENT_RETRY).length;
      const averageAutoReconcileConfidence = autoReconcileAudits.length
        ? roundNumber(
            autoReconcileAudits.reduce((total, item) => total + safeNumber(item.confidence, 0), 0) / autoReconcileAudits.length,
            4
          )
        : null;
      const truthAt = nowIso();
      const exchangeTruth = {
        status: freezeEntries ? "blocked" : mismatchCount ? "degraded" : "healthy",
        freezeEntries,
        mismatchCount,
        runtimePositionCount: runtime.openPositions.length,
        exchangePositionCount: exchangeSymbols.length,
        openOrderCount: trackedOpenOrders.length,
        openOrderListCount: openOrderLists.length,
        lastReconciledAt: truthAt,
        lastHealthyAt: mismatchCount === 0 ? truthAt : runtime.exchangeTruth?.lastHealthyAt || null,
        orphanedSymbols,
        manualInterferenceSymbols,
        missingRuntimeSymbols,
        unmatchedOrderSymbols,
        staleProtectiveSymbols,
        recentFillSymbols,
        warnings: warnings.slice(0, 8),
        autoReconcileAudits: autoReconcileAudits.slice(0, 12),
        autoReconcileSummary: {
          autoResolvedCount,
          manualRequiredCount,
          retryCount,
          averageConfidence: averageAutoReconcileConfidence,
          topClassifications: [...new Map(
            autoReconcileAudits
              .filter((item) => item.classification)
              .map((item) => [item.classification, (autoReconcileAudits.filter((audit) => audit.classification === item.classification).length)])
          ).entries()]
            .sort((left, right) => right[1] - left[1] || `${left[0]}`.localeCompare(`${right[0]}`))
            .slice(0, 4)
            .map(([id, count]) => ({ id, count }))
        },
        notes: [
          mismatchCount
            ? `${mismatchCount} exchange/runtime mismatches vragen operator-aandacht.`
            : "Exchange en runtime inventory zijn in sync.",
          autoReconcileAudits.length
            ? `${autoResolvedCount} auto-reconcile actie(s) veilig toegepast, ${manualRequiredCount} geval(len) vereisen review en ${retryCount} blijven in retry/protect-only.`
            : "Geen auto-reconcile beslissingen in de laatste truth-pass.",
          orphanedSymbols.length
            ? `Onbeheerde exchange-symbolen: ${orphanedSymbols.join(", ")}.`
            : "Geen onbeheerde exchange-balansen gedetecteerd.",
          manualInterferenceSymbols.length
            ? `Handmatige of onverwachte exchange-orders vragen review voor: ${manualInterferenceSymbols.join(", ")}.`
            : "Geen unmanaged exit-orders gedetecteerd.",
          missingRuntimeSymbols.length
            ? `Runtime-posities missen op de exchange: ${missingRuntimeSymbols.join(", ")}.`
            : "Geen runtime-posities missen op de exchange.",
          unmatchedOrderSymbols.length
            ? `Open orders zonder runtime-positie: ${unmatchedOrderSymbols.join(", ")}.`
            : "Geen orphaned open orders gedetecteerd.",
          staleProtectiveSymbols.length
            ? `Protective-state werd herbouwd of gemarkeerd voor: ${staleProtectiveSymbols.join(", ")}.`
            : "Geen stale protective order states gedetecteerd.",
          recentFillSymbols.length
            ? `Recente fills in truth-window: ${recentFillSymbols.join(", ")}.`
            : "Geen zeer recente fills in truth-window."
        ]
      };

      finishLifecycleAction(runtime, reconcileActionId, {
        status: freezeEntries ? "warning" : "completed",
        stage: freezeEntries ? "degraded" : "healthy",
        severity: freezeEntries ? "negative" : "positive",
        detail: `mismatches:${mismatchCount}`
      });

      return {
        closedTrades,
        cleanupTargets,
        recoveredPositions,
        warnings,
        exchangeTruth,
        account: {
          canTrade: account.canTrade,
          accountType: account.accountType,
          permissions: account.permissions
        }
      };
    } catch (error) {
      finishLifecycleAction(runtime, reconcileActionId, {
        status: "failed",
        stage: "error",
        severity: "negative",
        error: error.message
      });
      throw error;
    }
  }

  async scaleOutPosition({ position, rules, marketSnapshot, fraction, reason, runtime = null }) {
    const startedIntent = await this.openExecutionIntent(runtime, {
      kind: "scale_out",
      symbol: position.symbol,
      positionId: position.id || null,
      idempotencyKey: reason || "scale_out",
      detail: reason || "scale_out",
      origin: "scale_out_position"
    });
    if (startedIntent.duplicateUnresolved) {
      throw this.createDuplicateIntentError(position.symbol, "scale_out", startedIntent.intent);
    }
    const scaleIntentId = startedIntent.intent?.id || null;
    const scaleOutActionId = startLifecycleAction(runtime, {
      type: "scale_out",
      symbol: position.symbol,
      positionId: position.id || null,
      stage: "submit"
    });
    try {
      const originalQuantity = Number(position.quantity || 0);
      const requestedFraction = Math.min(Math.max(fraction || this.config.scaleOutFraction, 0.05), 0.95);
      const requestedQuantity = normalizeQuantity(originalQuantity * requestedFraction, rules, "floor", true);
      if (!requestedQuantity || requestedQuantity >= originalQuantity) {
        throw new Error(`Unable to normalize scale-out quantity for ${position.symbol}.`);
      }
      const remainingQuantity = originalQuantity - requestedQuantity;
      const remainingNotional = remainingQuantity * (marketSnapshot.book.mid || position.entryPrice);
      const minRemainderNotional = Math.max(rules.minNotional || 0, this.config.scaleOutMinNotionalUsd || 0);
      const invalidRemainder =
        remainingQuantity < (rules.minQty || 0) || remainingNotional < minRemainderNotional;

      if (invalidRemainder) {
        const fullMid = Number(marketSnapshot.book.mid || position.entryPrice || 0);
        const fullNotional = originalQuantity * fullMid;
        const minSellUsd = this.getMinSellNotionalUsd(rules);
        if (fullNotional < minSellUsd && this.isSyntheticMinNotionalExitAllowed()) {
          const cancelProtection = await this.cancelProtectiveOrders(position, { strict: true, runtime, origin: "protective_cancel" });
          if (cancelProtection?.closedTrade) {
            finishLifecycleAction(runtime, scaleOutActionId, {
              status: "completed",
              stage: "closed_via_protective_fill",
              severity: "neutral",
              detail: cancelProtection.closedTrade.reason || reason || "exchange_protective_order"
            });
            return {
              closedTrade: cancelProtection.closedTrade,
              positionClosed: true,
              reason: cancelProtection.closedTrade.reason || reason || "exchange_protective_order"
            };
          }
          if (cancelProtection?.positionChanged) {
            const protectivePartialError = new Error(`Protective order for ${position.symbol} partially filled while canceling before scale-out.`);
            protectivePartialError.positionSafeguarded = true;
            protectivePartialError.blockedReason = "protective_partial_fill_requires_reconcile";
            throw protectivePartialError;
          }
          const closedTrade = await this.performSyntheticMinNotionalExit({
            position,
            rules,
            marketSnapshot,
            reason: `${reason || "scale_out"}_dust_remainder`,
            runtime,
            lifecycleActionId: scaleOutActionId,
            exitSource: "synthetic_below_min_notional",
            context: "scale_out"
          });
          return {
            closedTrade,
            positionClosed: true,
            reason: closedTrade.reason || reason || "synthetic_below_min_notional"
          };
        }
        throw new Error(`Scale-out would leave an invalid remainder for ${position.symbol}.`);
      }

      const cancelProtection = await this.cancelProtectiveOrders(position, { strict: true, runtime, origin: "protective_cancel" });
      if (cancelProtection?.closedTrade) {
        finishLifecycleAction(runtime, scaleOutActionId, {
          status: "completed",
          stage: "closed_via_protective_fill",
          severity: "neutral",
          detail: cancelProtection.closedTrade.reason || reason || "exchange_protective_order"
        });
        return {
          closedTrade: cancelProtection.closedTrade,
          positionClosed: true,
          reason: cancelProtection.closedTrade.reason || reason || "exchange_protective_order"
        };
      }
      if (cancelProtection?.positionChanged) {
        const protectivePartialError = new Error(`Protective order for ${position.symbol} partially filled while canceling before scale-out.`);
        protectivePartialError.positionSafeguarded = true;
        protectivePartialError.blockedReason = "protective_partial_fill_requires_reconcile";
        throw protectivePartialError;
      }

      const submittedOrder = await this.client.placeOrder({
        symbol: position.symbol,
        side: "SELL",
        type: "MARKET",
        quantity: formatQuantity(requestedQuantity, rules, true),
        ...this.buildOrderRequestMeta(position.executionPlan || {}, rules, "FULL")
      });
      if (scaleIntentId) {
        await this.noteExecutionIntentStep(runtime, scaleIntentId, {
          type: "submit_scale_out_order",
          status: "submitted",
          detail: position.symbol
        });
      }
      const settled = await this.settleTerminalOrder({
        symbol: position.symbol,
        order: submittedOrder,
        defaultTrades: submittedOrder.fills || []
      });
      const order = settled.order;
      const trades = settled.trades;
      const orderTelemetry = await this.collectOrderTelemetry(position.symbol, [order.orderId]);
      const executedQty = Math.max(0, Math.min(Number(order.executedQty || 0), requestedQuantity, originalQuantity));
      if (!executedQty) {
        throw new Error(`Scale-out order for ${position.symbol} returned no filled quantity.`);
      }
      const quoteReceived = Number(order.cummulativeQuoteQty || 0);
      const averagePrice = executedQty ? quoteReceived / executedQty : marketSnapshot.book.bid;
      const feeSummary = summarizeTradeFees({
        trades,
        baseAsset: rules.baseAsset,
        quoteAsset: rules.quoteAsset
      });
      const fee = feeSummary.feeQuote;
      const netProceeds = quoteReceived - fee;
      const proportion = executedQty / Math.max(originalQuantity, 1e-9);
      const allocatedCost = position.totalCost * proportion;
      const realizedPnl = netProceeds - allocatedCost;
      position.quantity = Math.max(0, originalQuantity - executedQty);
      position.totalCost = Math.max(0, position.totalCost - allocatedCost);
      position.notional = position.entryPrice * position.quantity;
      position.entryFee = Math.max(0, (position.entryFee || 0) - (position.entryFee || 0) * proportion);
      position.scaleOutCompletedAt = nowIso();
      position.scaleOutCount = (position.scaleOutCount || 0) + 1;
      position.lastMarkedPrice = marketSnapshot.book.mid;
      position.stopLossPrice = Math.max(position.stopLossPrice, position.entryPrice * (1 + (position.scaleOutTrailOffsetPct || this.config.scaleOutTrailOffsetPct)));
      this.clearProtectiveOrderState(position);

      let protectionWarning = null;
      try {
        await this.ensureProtectiveOrder(position, rules, runtime, "protective_rebuild");
      } catch (error) {
        protectionWarning = error.message;
        this.logger?.warn?.("Protective order rebuild after scale-out failed", { symbol: position.symbol, error: error.message });
        this.clearProtectiveOrderState(position);
        position.reconcileRequired = true;
        position.lifecycleState = "reconcile_required";
      }

      finishLifecycleAction(runtime, scaleOutActionId, {
        status: protectionWarning ? "warning" : "completed",
        stage: protectionWarning ? "protection_pending" : "scaled_out",
        severity: protectionWarning ? "negative" : "positive",
        detail: reason || "partial_take_profit"
      });

      const scaleOutEvent = {
        id: `${position.id}:scaleout:${Date.now()}`,
        positionId: position.id,
        symbol: position.symbol,
        at: nowIso(),
        fraction: proportion,
        quantity: executedQty,
        price: averagePrice,
        grossProceeds: quoteReceived,
        netProceeds,
        fee,
        feeQuote: fee,
        feeQuoteStatus: feeSummary.feeQuoteStatus,
        feeAssetBreakdown: feeSummary.breakdown,
        observedFeeBps: feeSummary.observedFeeBps,
        allocatedCost,
        realizedPnl,
        reason,
        brokerMode: "live",
        protectionWarning,
        executionAttribution: this.execution.buildExecutionAttribution({
          plan: this.buildExitPlan(position, "bot_partial_exit"),
          marketSnapshot,
          side: "SELL",
          fillPrice: averagePrice,
          requestedQuoteAmount: allocatedCost,
          executedQuote: quoteReceived,
          executedQuantity: executedQty,
          orderResponses: [order],
          orderTelemetry,
          fillEstimate: marketSnapshot.book.exitEstimate || null,
          brokerMode: "live"
        })
      };
      if (scaleIntentId) {
        await this.resolveExecutionIntent(runtime, scaleIntentId, {
          detail: reason || "scale_out"
        });
      }
      return scaleOutEvent;
    } catch (error) {
      if (scaleIntentId) {
        await this.failExecutionIntent(runtime, scaleIntentId, {
          error: error.message,
          detail: reason || "scale_out"
        });
      }
      let recovery = { safeguarded: false, warning: null };
      if (!position.protectiveOrderListId && (position.quantity || 0) > 0) {
        recovery = await this.recoverPositionProtection(position, rules, runtime, "protective_recover_after_scale_out_error");
      }
      finishLifecycleAction(runtime, scaleOutActionId, {
        status: recovery.safeguarded || recovery.warning ? "warning" : "failed",
        stage: recovery.warning ? "reconcile_required" : recovery.safeguarded ? "protected_after_error" : "error",
        severity: "negative",
        error: recovery.warning || error.message,
        detail: reason || "partial_take_profit"
      });
      error.positionSafeguarded = Boolean(recovery.safeguarded || recovery.warning);
      if (recovery.warning) {
        error.protectionWarning = recovery.warning;
      }
      throw error;
    }
  }

  async exitPosition({ position, rules, marketSnapshot, reason, runtime }) {
    const startedIntent = await this.openExecutionIntent(runtime, {
      kind: "exit",
      symbol: position.symbol,
      positionId: position.id || null,
      idempotencyKey: reason || "exit",
      detail: reason || "exit_position",
      origin: "exit_position"
    });
    if (startedIntent.duplicateUnresolved) {
      throw this.createDuplicateIntentError(position.symbol, "exit", startedIntent.intent);
    }
    const exitIntentId = startedIntent.intent?.id || null;
    const exitActionId = startLifecycleAction(runtime, {
      type: "exit_position",
      symbol: position.symbol,
      positionId: position.id || null,
      stage: "submit"
    });
    try {
      const quantity = normalizeQuantity(position.quantity, rules, "floor", true);
      if (!quantity) {
        throw new Error(`Unable to normalize sell quantity for ${position.symbol}.`);
      }
      const cancelProtection = await this.cancelProtectiveOrders(position, { strict: true, runtime, origin: "protective_cancel" });
      if (cancelProtection?.closedTrade) {
        finishLifecycleAction(runtime, exitActionId, {
          status: "completed",
          stage: "closed_via_protective_fill",
          severity: "neutral",
          detail: cancelProtection.closedTrade.reason || reason || "exchange_protective_order"
        });
        return cancelProtection.closedTrade;
      }
      if (cancelProtection?.positionChanged) {
        const protectivePartialError = new Error(`Protective order for ${position.symbol} partially filled while canceling before exit.`);
        protectivePartialError.positionSafeguarded = true;
        protectivePartialError.blockedReason = "protective_partial_fill_requires_reconcile";
        throw protectivePartialError;
      }
      const sellMid = Number(
        marketSnapshot?.book?.bid
          ?? marketSnapshot?.book?.mid
          ?? position.lastMarkedPrice
          ?? position.entryPrice
          ?? 0
      );
      const sellNotional = quantity * sellMid;
      const minSellUsd = this.getMinSellNotionalUsd(rules);
      if (sellNotional < minSellUsd && this.isSyntheticMinNotionalExitAllowed()) {
        this.logger?.warn?.("Synthetic exit: position below exchange min notional (pre-check)", {
          symbol: position.symbol,
          sellNotional,
          minSellUsd
        });
        return await this.performSyntheticMinNotionalExit({
          position,
          rules,
          marketSnapshot,
          reason,
          runtime,
          lifecycleActionId: exitActionId,
          exitSource: "synthetic_below_min_notional",
          context: "exit"
        });
      }

      let submittedOrder;
      try {
        submittedOrder = await this.client.placeOrder({
          symbol: position.symbol,
          side: "SELL",
          type: "MARKET",
          quantity: formatQuantity(quantity, rules, true),
          ...this.buildOrderRequestMeta(position.executionPlan || {}, rules, "FULL")
        });
        if (exitIntentId) {
          await this.noteExecutionIntentStep(runtime, exitIntentId, {
            type: "submit_exit_order",
            status: "submitted",
            detail: position.symbol
          });
        }
      } catch (orderError) {
        if (isBinanceMinNotionalFilterError(orderError) && this.isSyntheticMinNotionalExitAllowed()) {
          this.logger?.warn?.("Synthetic exit after MIN_NOTIONAL rejection from exchange", {
            symbol: position.symbol,
            code: orderError?.payload?.code
          });
          return await this.performSyntheticMinNotionalExit({
            position,
            rules,
            marketSnapshot,
            reason,
            runtime,
            lifecycleActionId: exitActionId,
            exitSource: "synthetic_below_min_notional",
            context: "exit"
          });
        }
        throw orderError;
      }
      const settled = await this.settleTerminalOrder({
        symbol: position.symbol,
        order: submittedOrder,
        defaultTrades: submittedOrder.fills || []
      });
      const order = settled.order;
      const trades = settled.trades;
      const orderTelemetry = await this.collectOrderTelemetry(position.symbol, [order.orderId]);
      const executedQty = Math.max(0, Math.min(Number(order.executedQty || 0), position.quantity));
      const remainingQuantity = Math.max(0, position.quantity - executedQty);
      const remainingNotional = remainingQuantity * (marketSnapshot.book.mid || position.entryPrice || 0);
      if (remainingQuantity > 0 && !this.isDustRemainder({ quantity: remainingQuantity, notional: remainingNotional, rules })) {
        const proportion = executedQty / Math.max(position.quantity, 1e-9);
        const allocatedCost = position.totalCost * proportion;
        position.quantity = remainingQuantity;
        position.totalCost = Math.max(0, position.totalCost - allocatedCost);
        position.notional = position.entryPrice * position.quantity;
        position.entryFee = Math.max(0, (position.entryFee || 0) - (position.entryFee || 0) * proportion);
        position.lastMarkedPrice = marketSnapshot.book.mid || position.lastMarkedPrice;
        let protectionWarning = null;
        try {
          await this.ensureProtectiveOrder(position, rules, runtime, "protective_rebuild");
        } catch (error) {
          protectionWarning = error.message;
          position.reconcileRequired = true;
          position.lifecycleState = "reconcile_required";
        }
        finishLifecycleAction(runtime, exitActionId, {
          status: "warning",
          stage: protectionWarning ? "reconcile_required" : "partial_fill_protected",
          severity: "negative",
          detail: `${reason || "bot_market_exit"}:${remainingQuantity}`
        });
        const partialExitError = new Error(`Exit order for ${position.symbol} partially filled; ${remainingQuantity} remains open.`);
        partialExitError.positionSafeguarded = true;
        partialExitError.remainingQuantity = remainingQuantity;
        partialExitError.executedQuantity = executedQty;
        partialExitError.protectionWarning = protectionWarning;
        throw partialExitError;
      }
      runtime.openPositions = runtime.openPositions.filter((item) => item.id !== position.id);
      finishLifecycleAction(runtime, exitActionId, {
        status: "completed",
        stage: "closed",
        severity: "positive",
        detail: reason || "bot_market_exit"
      });
      if (exitIntentId) {
        await this.resolveExecutionIntent(runtime, exitIntentId, {
          detail: reason || "bot_market_exit"
        });
      }
      return this.buildTradeFromOrder(position, order, trades, reason, "bot_market_exit", marketSnapshot, orderTelemetry);
    } catch (error) {
      if (exitIntentId) {
        await this.failExecutionIntent(runtime, exitIntentId, {
          error: error.message,
          detail: reason || "bot_market_exit"
        });
      }
      let recovery = { safeguarded: false, warning: null };
      if (!position.protectiveOrderListId && (position.quantity || 0) > 0) {
        recovery = await this.recoverPositionProtection(position, rules, runtime, "protective_recover_after_exit_error");
      }
      if (runtime?.orderLifecycle?.activeActions?.[exitActionId]) {
        finishLifecycleAction(runtime, exitActionId, {
          status: recovery.safeguarded || recovery.warning ? "warning" : "failed",
          stage: recovery.warning ? "reconcile_required" : recovery.safeguarded ? "protected_after_error" : "error",
          severity: "negative",
          error: recovery.warning || error.message,
          detail: reason || "bot_market_exit"
        });
      }
      error.positionSafeguarded = Boolean(error.positionSafeguarded || recovery.safeguarded || recovery.warning);
      if (!error.protectionWarning && recovery.warning) {
        error.protectionWarning = recovery.warning;
      }
      throw error;
    }
  }
}
