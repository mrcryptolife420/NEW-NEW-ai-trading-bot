import crypto from "node:crypto";
import { LocalOrderBookEngine } from "../market/localOrderBook.js";
import { getOrderflowDelta, recordAggTrade } from "../market/orderbookDelta.js";
import { mapWithConcurrency } from "../utils/async.js";

function toCombinedStreamPath(streams) {
  return `stream?streams=${streams.join("/")}`;
}

export function buildPublicStreamNames({
  symbols = [],
  klineIntervals = [],
  enableLocalOrderBook = false
} = {}) {
  return unique(symbols).flatMap((symbol) => {
    const lower = `${symbol}`.trim().toLowerCase();
    if (!lower) {
      return [];
    }
    const base = [`${lower}@bookTicker`, `${lower}@trade`];
    if (enableLocalOrderBook) {
      base.push(`${lower}@depth@100ms`);
    }
    for (const interval of unique(klineIntervals)) {
      base.push(`${lower}@kline_${interval}`);
    }
    return base;
  });
}

export function chunkPublicStreams(streams = [], maxStreamsPerConnection = 180) {
  const normalized = unique(streams.map((stream) => `${stream || ""}`.trim()).filter(Boolean));
  const size = Math.max(1, Math.floor(Number(maxStreamsPerConnection || 180)));
  const chunks = [];
  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size));
  }
  return chunks;
}

function parseIntervalToMs(interval = "") {
  const match = `${interval || ""}`.trim().match(/^(\d+)([mhdw])$/i);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1] || 0);
  const unit = match[2].toLowerCase();
  const multipliers = {
    m: 60_000,
    h: 60 * 60_000,
    d: 24 * 60 * 60_000,
    w: 7 * 24 * 60 * 60_000
  };
  return amount * (multipliers[unit] || 0);
}

function createRollingStats(limit = 200) {
  return {
    limit,
    items: [],
    push(item) {
      this.items.push(item);
      if (this.items.length > this.limit) {
        this.items.shift();
      }
    }
  };
}

function normalizeForceOrder(payload) {
  const order = payload?.o || payload || {};
  const quantity = Number(order.q || order.l || 0);
  const price = Number(order.ap || order.p || 0);
  const notional = quantity * price;
  return {
    symbol: order.s || payload?.s || null,
    side: order.S || payload?.S || null,
    quantity,
    price,
    notional,
    eventTime: payload?.E || order.T || Date.now()
  };
}

function flattenUserPayload(payload) {
  if (payload?.event) {
    return payload.event;
  }
  return payload;
}

function normalizeExecutionReport(event) {
  return {
    eventType: event.e,
    symbol: event.s,
    side: event.S,
    orderType: event.o,
    executionType: event.x,
    status: event.X,
    orderId: Number(event.i || 0),
    clientOrderId: event.c,
    orderListId: Number(event.g || 0) || null,
    quantity: Number(event.q || 0),
    executedQty: Number(event.z || 0),
    lastExecutedQty: Number(event.l || 0),
    price: Number(event.p || 0),
    lastPrice: Number(event.L || 0),
    cumulativeQuoteQty: Number(event.Z || 0),
    lastQuoteQty: Number(event.Y || 0),
    maker: Boolean(event.m),
    onBook: Boolean(event.w),
    workingTime: Number(event.W || 0),
    creationTime: Number(event.O || event.T || 0),
    transactTime: Number(event.T || event.E || Date.now()),
    selfTradePreventionMode: event.V || event.selfTradePreventionMode || null,
    preventedMatchId: event.v ?? event.preventedMatchId ?? null,
    preventedQuantity: Number(event.A ?? event.preventedQuantity ?? 0),
    lastPreventedQuantity: Number(event.B ?? event.lastPreventedQuantity ?? 0),
    usedSor: Boolean(event.uS ?? event.usedSor ?? false),
    workingFloor: event.k ?? event.workingFloor ?? null,
    pegPriceType: event.gP ?? event.pegPriceType ?? null,
    pegOffsetType: event.gOT ?? event.pegOffsetType ?? null,
    pegOffsetValue: event.gOV ?? event.pegOffsetValue ?? null,
    peggedPrice: Number(event.gp ?? event.peggedPrice ?? 0),
    strategyId: event.j ?? event.strategyId ?? null,
    strategyType: event.J ?? event.strategyType ?? null,
    tradeId: event.t != null ? Number(event.t) : null,
    commission: Number(event.n || 0),
    commissionAsset: event.N || null,
    raw: event,
    at: new Date(event.E || Date.now()).toISOString()
  };
}

function normalizeListStatusEvent(event) {
  return {
    eventType: event.e,
    symbol: event.s || null,
    orderListId: Number(event.g || 0) || null,
    contingencyType: event.c || null,
    listStatusType: event.l || null,
    listOrderStatus: event.L || null,
    listClientOrderId: event.C || null,
    rejectReason: event.r || null,
    transactTime: Number(event.T || event.E || Date.now()),
    orders: Array.isArray(event.O) ? event.O.map((item) => ({
      symbol: item?.s || event.s || null,
      orderId: Number(item?.i || 0) || null,
      clientOrderId: item?.c || null
    })) : [],
    raw: event,
    at: new Date(event.E || Date.now()).toISOString()
  };
}


function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoAgeMs(value, referenceMs = Date.now()) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? Math.max(0, referenceMs - ms) : null;
}

function isDemoSpotEnvironment(client) {
  return `${client?.baseUrl || ""}`.includes("demo-api.binance.com");
}

function isUserStreamListenKeyUnsupported(error) {
  return error?.status === 410;
}

function toUserStreamError(message, payload = null) {
  const error = new Error(message);
  error.payload = payload;
  return error;
}

function shutdownSocket(socket) {
  if (!socket) {
    return;
  }
  try {
    if (typeof socket.terminate === "function") {
      socket.terminate();
      return;
    }
    if (typeof socket.close === "function") {
      socket.close();
    }
  } catch {
    // ignore local websocket shutdown failures
  }
}

function shouldUsePrivateUserStream(config = {}) {
  return Boolean(config?.binanceApiKey) && (
    config?.botMode === "live" ||
    config?.paperExecutionVenue === "binance_demo_spot"
  );
}

function getWebSocketAvailability() {
  return {
    available: typeof WebSocket !== "undefined",
    reason: typeof WebSocket === "undefined" ? "global_websocket_unavailable" : null
  };
}

function toEventTimeMs(value) {
  if (value == null) {
    return Number.NaN;
  }
  if (typeof value === "number") {
    return value;
  }
  return new Date(value).getTime();
}

function summarizeExecutionEvents(events = []) {
  const tradeEvents = events.filter((event) => event.executionType === "TRADE");
  const makerQty = tradeEvents.reduce((total, event) => total + (event.maker ? event.lastExecutedQty : 0), 0);
  const takerQty = tradeEvents.reduce((total, event) => total + (!event.maker ? event.lastExecutedQty : 0), 0);
  const preventedQuantity = events.reduce((total, event) => total + (event.preventedQuantity || 0) + (event.lastPreventedQuantity || 0), 0);
  const workingTimes = events.map((event) => Number(event.workingTime || 0)).filter((value) => value > 0);
  const transactTimes = events.map((event) => Number(event.transactTime || 0)).filter((value) => value > 0);
  const orderStart = workingTimes.length ? Math.min(...workingTimes) : transactTimes.length ? Math.min(...transactTimes) : 0;
  const orderEnd = transactTimes.length ? Math.max(...transactTimes) : 0;
  const workingTimeMs = orderStart && orderEnd && orderEnd >= orderStart ? orderEnd - orderStart : 0;

  return {
    eventCount: events.length,
    makerQty,
    takerQty,
    makerFillRatio: makerQty + takerQty ? makerQty / (makerQty + takerQty) : 0,
    takerFillRatio: makerQty + takerQty ? takerQty / (makerQty + takerQty) : 0,
    preventedQuantity,
    preventedMatchIds: unique(events.map((event) => event.preventedMatchId)),
    usedSor: events.some((event) => event.usedSor),
    workingFloors: unique(events.map((event) => event.workingFloor)),
    pegPriceType: [...events].reverse().find((event) => event.pegPriceType)?.pegPriceType || null,
    pegOffsetType: [...events].reverse().find((event) => event.pegOffsetType)?.pegOffsetType || null,
    pegOffsetValue: [...events].reverse().find((event) => event.pegOffsetValue != null)?.pegOffsetValue ?? null,
    peggedPrice: [...events].reverse().find((event) => event.peggedPrice)?.peggedPrice || 0,
    selfTradePreventionMode: [...events].reverse().find((event) => event.selfTradePreventionMode)?.selfTradePreventionMode || null,
    workingTimeMs,
    strategyIds: unique(events.map((event) => event.strategyId)),
    executionTypes: unique(events.map((event) => event.executionType))
  };
}

export class StreamCoordinator {
  constructor({ client, config, logger }) {
    this.client = client;
    this.config = config;
    this.logger = logger;
    this.orderBook = new LocalOrderBookEngine({ client, config, logger });
    this.state = {
      enabled: config.enableEventDrivenData,
      marketDataMode: config.enableLocalOrderBook ? "json_depth_local_book" : "ticker_trade_only",
      publicStreamConnected: false,
      futuresStreamConnected: false,
      userStreamConnected: false,
      unavailableReason: null,
      lastPublicMessageAt: null,
      lastFuturesMessageAt: null,
      lastUserMessageAt: null,
      lastError: null,
      listenKey: null,
      userStreamTransport: null,
      userStreamSubscriptionId: null,
      publicStreamConnectionCount: 0,
      publicStreamChunkCount: 0,
      publicStreamStreamCount: 0,
      publicStreamMaxStreamsPerConnection: Math.max(1, Number(config.publicStreamMaxStreamsPerConnection || 180)),
      publicStreamStaleMs: Math.max(15_000, Number(config.publicStreamStaleMs || 90_000)),
      publicStreamMonitorIntervalMs: Math.max(5_000, Number(config.publicStreamMonitorIntervalMs || 30_000)),
      restartHealth: {
        public: {
          attempts: 0,
          failures: 0,
          lastReason: null,
          lastAttemptAt: null,
          lastRestartAt: null,
          lastFailureAt: null,
          lastError: null,
          stalled: false
        },
        futures: {
          attempts: 0,
          failures: 0,
          lastReason: null,
          lastAttemptAt: null,
          lastRestartAt: null,
          lastFailureAt: null,
          lastError: null,
          stalled: false
        },
        user: {
          attempts: 0,
          failures: 0,
          lastReason: null,
          lastAttemptAt: null,
          lastRestartAt: null,
          lastFailureAt: null,
          lastError: null,
          stalled: false
        }
      },
      localBook: this.orderBook.getSummary(),
      symbols: {}
    };
    this.publicSocket = null;
    this.publicSockets = new Set();
    this.publicOpenSockets = new Set();
    this.publicSocketMeta = new Map();
    this.futuresSocket = null;
    this.userSocket = null;
    this.keepAliveTimer = null;
    this.streamHealthTimer = null;
    this.restartTimers = {
      public: null,
      futures: null,
      user: null
    };
    this.publicRestartPromise = Promise.resolve();
    this.futuresRestartPromise = Promise.resolve();
    this.userRestartPromise = Promise.resolve();
    this.isClosing = false;
    this.klineIntervals = unique([
      config.klineInterval,
      config.enableCrossTimeframeConsensus ? config.lowerTimeframeInterval : null,
      config.enableCrossTimeframeConsensus ? config.higherTimeframeInterval : null,
      config.enableDailyTimeframe ? (config.higherTimeframeIntervalDaily || "1d") : null
    ]);
    this.setWatchlist(config.watchlist);
    this.setLocalBookUniverse(config.watchlist.slice(0, config.localBookMaxSymbols || config.universeMaxSymbols || config.watchlist.length));
  }

  createSymbolState() {
    return {
      bookTicker: null,
      trades: createRollingStats(this.config.streamTradeBufferSize),
      liquidations: createRollingStats(80),
      userEvents: createRollingStats(120),
      listStatusEvents: createRollingStats(80),
      klines: {}
    };
  }

  getKlineIntervals() {
    return [...this.klineIntervals];
  }

  getKlineBufferLimit(interval = null) {
    const intervalLabel = `${interval || ""}`.trim();
    if (intervalLabel === `${this.config.higherTimeframeIntervalDaily || "1d"}`) {
      return Math.max(60, Number(this.config.higherTimeframeLimitDaily || 120));
    }
    if (intervalLabel === `${this.config.higherTimeframeInterval || ""}`) {
      return Math.max(60, Number(this.config.higherTimeframeLimit || 120));
    }
    if (intervalLabel === `${this.config.lowerTimeframeInterval || ""}`) {
      return Math.max(60, Number(this.config.lowerTimeframeLimit || 120));
    }
    if (intervalLabel === `${this.config.klineInterval || ""}`) {
      return Math.max(80, Number(this.config.klineLimit || 180));
    }
    return Math.max(80, Number(this.config.klineLimit || 180));
  }

  upsertKline(symbol, interval, candle = {}) {
    const bucket = this.state.symbols[symbol];
    if (!bucket || !interval) {
      return;
    }
    const normalized = {
      openTime: Number(candle.openTime || candle.t || 0),
      open: Number(candle.open || candle.o || 0),
      high: Number(candle.high || candle.h || 0),
      low: Number(candle.low || candle.l || 0),
      close: Number(candle.close || candle.c || 0),
      volume: Number(candle.volume || candle.v || 0),
      closeTime: Number(candle.closeTime || candle.T || 0),
      isClosed: candle.isClosed ?? candle.x ?? false
    };
    if (!Number.isFinite(normalized.openTime) || normalized.openTime <= 0) {
      return;
    }
    const current = bucket.klines[interval] || {
      interval,
      candles: [],
      lastEventTime: null
    };
    const nextCandles = [...(current.candles || [])];
    const existingIndex = nextCandles.findIndex((item) => Number(item.openTime || 0) === normalized.openTime);
    if (existingIndex >= 0) {
      nextCandles[existingIndex] = normalized;
    } else {
      nextCandles.push(normalized);
      nextCandles.sort((left, right) => Number(left.openTime || 0) - Number(right.openTime || 0));
    }
    const limit = this.getKlineBufferLimit(interval);
    if (nextCandles.length > limit) {
      nextCandles.splice(0, nextCandles.length - limit);
    }
    bucket.klines[interval] = {
      interval,
      candles: nextCandles,
      lastEventTime: normalized.closeTime || normalized.openTime
    };
  }

  seedKlines(symbol, interval, candles = []) {
    if (!symbol || !interval || !Array.isArray(candles) || !candles.length || !this.state.symbols[symbol]) {
      return;
    }
    for (const candle of candles) {
      this.upsertKline(symbol, interval, candle);
    }
  }

  getKlineSnapshot(symbol, interval, limit = null) {
    const bucket = this.state.symbols[symbol];
    const series = bucket?.klines?.[interval];
    if (!series) {
      return null;
    }
    const candles = [...(series.candles || [])];
    const normalizedLimit = Math.max(1, Number(limit || candles.length));
    const selected = candles.slice(-normalizedLimit);
    const lastCandle = selected.at(-1) || null;
    const intervalMs = parseIntervalToMs(interval);
    const stalenessMs = lastCandle?.closeTime && intervalMs
      ? Math.max(0, Date.now() - Number(lastCandle.closeTime || 0))
      : null;
    return {
      interval,
      candles: selected,
      count: selected.length,
      lastEventTime: series.lastEventTime || null,
      stalenessMs,
      warm: selected.length >= Math.min(normalizedLimit, Math.max(24, Math.floor(normalizedLimit * 0.35)))
    };
  }

  getBookTickerMaxAgeMs() {
    return Math.max(250, Number(this.config.maxDepthEventAgeMs || 15_000));
  }

  buildLocalBookTicker(localBook) {
    const eventTimeMs = toEventTimeMs(localBook?.lastEventAt);
    if (!localBook?.bestBid || !localBook?.bestAsk || !Number.isFinite(eventTimeMs) || (Date.now() - eventTimeMs) > this.getBookTickerMaxAgeMs()) {
      return null;
    }
    return {
      bid: localBook.bestBid,
      ask: localBook.bestAsk,
      bidQty: localBook.bids?.[0]?.[1] || 0,
      askQty: localBook.asks?.[0]?.[1] || 0,
      mid: localBook.mid,
      eventTime: localBook.lastEventAt
    };
  }

  getFreshBookTicker(bookTicker, localBook) {
    const eventTimeMs = toEventTimeMs(bookTicker?.eventTime);
    if (bookTicker?.bid && bookTicker?.ask && Number.isFinite(eventTimeMs) && (Date.now() - eventTimeMs) <= this.getBookTickerMaxAgeMs()) {
      return bookTicker;
    }
    return this.buildLocalBookTicker(localBook);
  }

  clearPublicBookTickers() {
    for (const bucket of Object.values(this.state.symbols || {})) {
      bucket.bookTicker = null;
    }
  }

  setWatchlist(symbols = []) {
    const normalized = unique(symbols.map((symbol) => `${symbol}`.trim().toUpperCase()));
    const previous = this.state.symbols || {};
    const previousSymbols = Object.keys(previous);
    const changed = normalized.length !== previousSymbols.length || normalized.some((symbol, index) => symbol !== previousSymbols[index]);
    this.config.watchlist = normalized;
    this.state.symbols = Object.fromEntries(normalized.map((symbol) => [symbol, previous[symbol] || this.createSymbolState()]));
    if (changed && (this.publicSocket || this.publicSockets?.size) && this.state.enabled) {
      void this.restartPublicStream("watchlist_update").catch((error) => {
        this.state.lastError = error.message;
        this.logger?.warn?.("Public market stream restart failed", { error: error.message });
      });
    }
  }

  setLocalBookUniverse(symbols = []) {
    const previousSymbols = this.orderBook.activeSymbols ? [...this.orderBook.activeSymbols] : [];
    this.orderBook.setActiveSymbols(symbols);
    this.state.localBook = this.orderBook.getSummary();
    const nextSymbols = this.orderBook.activeSymbols ? [...this.orderBook.activeSymbols] : [];
    const addedSymbols = nextSymbols.filter((symbol) => !previousSymbols.includes(symbol));
    if (addedSymbols.length && this.state.enabled && this.config.enableLocalOrderBook) {
      void this.primeLocalBooks(addedSymbols).catch((error) => {
        this.state.lastError = error.message;
        this.logger?.warn?.("Local order book reprime failed", { error: error.message, symbols: addedSymbols });
      });
    }
  }

  async primeLocalBooks(symbols = []) {
    const activeSymbols = unique((symbols || []).filter((symbol) => this.state.symbols[symbol]));
    if (!activeSymbols.length || !this.config.enableLocalOrderBook) {
      return [];
    }

    const results = await mapWithConcurrency(activeSymbols, this.config.marketSnapshotConcurrency || 4, async (symbol) => {
      try {
        await this.orderBook.ensurePrimed(symbol);
        return { symbol, ok: true };
      } catch (error) {
        this.logger?.warn?.("Local order book prime failed", { symbol, error: error.message });
        return { symbol, ok: false, error: error.message };
      }
    });

    this.state.localBook = this.orderBook.getSummary();
    return results;
  }

  getStatus() {
    this.state.localBook = this.orderBook.getSummary();
    const publicStreamChunks = this.getPublicStreamChunkStatus();
    return {
      enabled: this.state.enabled,
      marketDataMode: this.state.marketDataMode,
      publicStreamConnected: this.state.publicStreamConnected,
      futuresStreamConnected: this.state.futuresStreamConnected,
      userStreamConnected: this.state.userStreamConnected,
      unavailableReason: this.state.unavailableReason,
      lastPublicMessageAt: this.state.lastPublicMessageAt,
      lastFuturesMessageAt: this.state.lastFuturesMessageAt,
      lastUserMessageAt: this.state.lastUserMessageAt,
      lastError: this.state.lastError,
      userStreamSessionActive: Boolean(this.state.listenKey || this.state.userStreamSubscriptionId != null),
      userStreamTransport: this.state.userStreamTransport,
      publicStreamConnectionCount: this.state.publicStreamConnectionCount,
      publicStreamChunkCount: this.state.publicStreamChunkCount,
      publicStreamStreamCount: this.state.publicStreamStreamCount,
      publicStreamMaxStreamsPerConnection: this.state.publicStreamMaxStreamsPerConnection,
      publicStreamStaleMs: this.state.publicStreamStaleMs,
      publicStreamMonitorIntervalMs: this.state.publicStreamMonitorIntervalMs,
      publicStreamStaleChunkCount: publicStreamChunks.filter((chunk) => chunk.stale).length,
      publicStreamPendingChunkCount: publicStreamChunks.filter((chunk) => chunk.pending).length,
      publicStreamChunks,
      restartHealth: this.state.restartHealth,
      localBook: this.state.localBook
    };
  }

  getOrderBookSnapshot(symbol) {
    return this.orderBook.getSnapshot(symbol);
  }

  estimateFill(symbol, side, request) {
    return this.orderBook.estimateFill(symbol, side, request);
  }

  getOrderExecutionTelemetry(symbol, orderIds = []) {
    const bucket = this.state.symbols[symbol];
    if (!bucket) {
      return summarizeExecutionEvents([]);
    }
    const ids = new Set((orderIds || []).map((value) => Number(value || 0)).filter(Boolean));
    const events = bucket.userEvents.items.filter((event) => ids.size === 0 || ids.has(Number(event.orderId || 0)));
    return summarizeExecutionEvents(events);
  }


  getRecentExecutionReports(symbol, { orderIds = [], orderListId = null, maxAgeMs = 180_000 } = {}) {
    const bucket = this.state.symbols[symbol];
    if (!bucket) {
      return [];
    }
    const cutoff = Date.now() - Math.max(0, Number(maxAgeMs || 0));
    const ids = new Set((orderIds || []).map((value) => Number(value || 0)).filter(Boolean));
    return bucket.userEvents.items.filter((event) => {
      const eventTime = Number(event.transactTime || 0);
      if (eventTime && eventTime < cutoff) {
        return false;
      }
      if (ids.size > 0 && !ids.has(Number(event.orderId || 0))) {
        return false;
      }
      if (orderListId != null && Number(event.orderListId || 0) !== Number(orderListId)) {
        return false;
      }
      return true;
    });
  }

  getRecentListStatusEvents(symbol, { orderListId = null, maxAgeMs = 180_000 } = {}) {
    const bucket = this.state.symbols[symbol];
    if (!bucket) {
      return [];
    }
    const cutoff = Date.now() - Math.max(0, Number(maxAgeMs || 0));
    return bucket.listStatusEvents.items.filter((event) => {
      const eventTime = Number(event.transactTime || 0);
      if (eventTime && eventTime < cutoff) {
        return false;
      }
      if (orderListId != null && Number(event.orderListId || 0) !== Number(orderListId)) {
        return false;
      }
      return true;
    });
  }

  getSymbolStreamFeatures(symbol) {
    const bucket = this.state.symbols[symbol];
    const localBook = this.orderBook.getSnapshot(symbol);
    if (!bucket) {
      const latestBookTicker = this.buildLocalBookTicker(localBook);
      return {
        tradeFlowImbalance: 0,
        microTrend: 0,
        orderflowDelta: null,
        latestBookTicker,
        recentTradeCount: 0,
        liquidationCount: 0,
        liquidationNotional: 0,
        liquidationImbalance: 0,
        lastLiquidation: null,
        lastUserEvent: null,
        localBook
      };
    }

    const trades = bucket.trades.items;
    const latestBookTicker = this.getFreshBookTicker(bucket.bookTicker, localBook);
    const buyVolume = trades.reduce((total, trade) => total + (trade.isBuyerMaker ? 0 : trade.quantity), 0);
    const sellVolume = trades.reduce((total, trade) => total + (trade.isBuyerMaker ? trade.quantity : 0), 0);
    const totalVolume = buyVolume + sellVolume;
    const firstPrice = trades[0]?.price || latestBookTicker?.mid || 0;
    const lastPrice = trades.at(-1)?.price || latestBookTicker?.mid || 0;

    const liquidations = bucket.liquidations.items;
    const bullishLiquidations = liquidations.reduce((total, item) => total + (item.side === "BUY" ? item.notional : 0), 0);
    const bearishLiquidations = liquidations.reduce((total, item) => total + (item.side === "SELL" ? item.notional : 0), 0);
    const liquidationTotal = bullishLiquidations + bearishLiquidations;
    const orderflowDelta = this.config.enableAggtradeOrderflow
      ? getOrderflowDelta(symbol, this.config.aggtradeWindowSeconds)
      : null;

    return {
      tradeFlowImbalance: totalVolume ? (buyVolume - sellVolume) / totalVolume : 0,
      microTrend: firstPrice ? (lastPrice - firstPrice) / firstPrice : 0,
      orderflowDelta,
      latestBookTicker,
      recentTradeCount: trades.length,
      liquidationCount: liquidations.length,
      liquidationNotional: liquidationTotal,
      liquidationImbalance: liquidationTotal ? (bullishLiquidations - bearishLiquidations) / liquidationTotal : 0,
      lastLiquidation: liquidations.at(-1) || null,
      lastUserEvent: bucket.userEvents.items.at(-1) || null,
      localBook
    };
  }

  async waitForPublicStreamOpen(timeoutMs = 1500) {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (!this.state.publicStreamConnected && Date.now() < deadline) {
      await sleep(50);
    }
    return this.state.publicStreamConnected;
  }

  async waitForUserStreamOpen(timeoutMs = 1500) {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (!this.state.userStreamConnected && Date.now() < deadline) {
      await sleep(50);
    }
    return this.state.userStreamConnected;
  }

  getPublicStreamMaxStreamsPerConnection() {
    return Math.max(1, Math.floor(Number(this.config.publicStreamMaxStreamsPerConnection || 180)));
  }

  getPublicStreamStaleMs() {
    return Math.max(15_000, Number(this.config.publicStreamStaleMs || this.state.publicStreamStaleMs || 90_000));
  }

  getPublicStreamMonitorIntervalMs() {
    return Math.max(5_000, Number(this.config.publicStreamMonitorIntervalMs || this.state.publicStreamMonitorIntervalMs || 30_000));
  }

  getUserStreamStartupWaitMs() {
    return Math.max(0, Number(this.config.userStreamStartupWaitMs || 2_500));
  }

  updatePublicStreamConnectivity() {
    this.state.publicStreamConnectionCount = this.publicOpenSockets?.size || 0;
    this.state.publicStreamConnected = this.state.publicStreamConnectionCount > 0;
    this.publicSocket = this.publicSockets?.values?.().next?.().value || null;
    return this.state.publicStreamConnected;
  }

  getPublicStreamChunkStatus(referenceMs = Date.now()) {
    const staleMs = this.getPublicStreamStaleMs();
    return [...(this.publicSocketMeta || new Map()).values()]
      .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
      .map((meta) => {
        const messageAgeMs = isoAgeMs(meta.lastMessageAt, referenceMs);
        const openAgeMs = isoAgeMs(meta.openedAt || meta.createdAt, referenceMs);
        const pendingAgeMs = meta.openedAt ? null : isoAgeMs(meta.createdAt, referenceMs);
        const pending = !meta.openedAt;
        return {
          chunk: Number(meta.index || 0) + 1,
          streams: Number(meta.streams || 0),
          connected: Boolean(meta.openedAt),
          pending,
          createdAt: meta.createdAt || null,
          openedAt: meta.openedAt || null,
          lastMessageAt: meta.lastMessageAt || null,
          messageAgeMs,
          openAgeMs,
          pendingAgeMs,
          stale: Boolean(meta.openedAt && (messageAgeMs == null ? openAgeMs : messageAgeMs) > staleMs)
        };
      });
  }

  startStreamHealthMonitor() {
    if (this.streamHealthTimer || !this.state.enabled || !this.config.enableEventDrivenData) {
      return;
    }
    const intervalMs = this.getPublicStreamMonitorIntervalMs();
    this.streamHealthTimer = setInterval(() => {
      this.checkPublicStreamHealth().catch((error) => {
        this.state.lastError = error.message;
      });
    }, intervalMs);
    if (typeof this.streamHealthTimer.unref === "function") {
      this.streamHealthTimer.unref();
    }
  }

  stopStreamHealthMonitor() {
    if (this.streamHealthTimer) {
      clearInterval(this.streamHealthTimer);
      this.streamHealthTimer = null;
    }
  }

  async checkPublicStreamHealth(referenceMs = Date.now()) {
    if (this.isClosing || !this.state.enabled || !this.config.enableEventDrivenData) {
      return { action: "skipped", reason: "stream_disabled" };
    }
    const chunks = this.getPublicStreamChunkStatus(referenceMs);
    const openTimeoutMs = Math.max(this.getPublicStreamStaleMs(), Number(this.config.publicStreamStartupWaitMs || 3_500) + this.getStreamReconnectDelayMs());
    const pendingStale = chunks.filter((chunk) => chunk.pending && Number(chunk.pendingAgeMs || 0) > openTimeoutMs);
    const messageStale = chunks.filter((chunk) => chunk.stale);
    if (!pendingStale.length && !messageStale.length) {
      this.ensureRestartHealth("public").stalled = false;
      return { action: "ok", staleChunks: 0, pendingChunks: 0 };
    }
    const health = this.ensureRestartHealth("public");
    health.stalled = true;
    health.lastReason = pendingStale.length ? "public_stream_open_timeout" : "public_stream_stalled";
    health.lastError = pendingStale.length
      ? `${pendingStale.length} public stream chunk(s) did not open`
      : `${messageStale.length} public stream chunk(s) stopped receiving messages`;
    health.lastFailureAt = new Date(referenceMs).toISOString();
    this.logger?.warn?.("Public market stream health restart scheduled", {
      reason: health.lastReason,
      staleChunks: messageStale.length,
      pendingChunks: pendingStale.length,
      staleMs: this.getPublicStreamStaleMs()
    });
    void this.scheduleRestart("public", () => this.startPublicStream(), health.lastReason);
    return {
      action: "restart_scheduled",
      reason: health.lastReason,
      staleChunks: messageStale.length,
      pendingChunks: pendingStale.length
    };
  }

  getStreamReconnectDelayMs() {
    return Math.max(250, Number(this.config.streamReconnectDelayMs || 1_500));
  }

  clearRestartTimer(kind) {
    if (this.restartTimers[kind]) {
      clearTimeout(this.restartTimers[kind]);
      this.restartTimers[kind] = null;
    }
  }

  ensureRestartHealth(kind) {
    this.state.restartHealth = this.state.restartHealth || {};
    this.state.restartHealth[kind] = this.state.restartHealth[kind] || {
      attempts: 0,
      failures: 0,
      lastReason: null,
      lastAttemptAt: null,
      lastRestartAt: null,
      lastFailureAt: null,
      lastError: null,
      stalled: false
    };
    return this.state.restartHealth[kind];
  }

  noteRestartAttempt(kind, reason) {
    const health = this.ensureRestartHealth(kind);
    health.attempts = (health.attempts || 0) + 1;
    health.lastReason = reason || null;
    health.lastAttemptAt = new Date().toISOString();
    health.stalled = false;
    return health;
  }

  noteRestartSuccess(kind, reason) {
    const health = this.ensureRestartHealth(kind);
    health.lastReason = reason || health.lastReason || null;
    health.lastRestartAt = new Date().toISOString();
    health.lastError = null;
    health.stalled = false;
    return health;
  }

  noteRestartFailure(kind, reason, error) {
    const health = this.ensureRestartHealth(kind);
    health.failures = (health.failures || 0) + 1;
    health.lastReason = reason || health.lastReason || null;
    health.lastFailureAt = new Date().toISOString();
    health.lastError = error?.message || `${error || "unknown_restart_error"}`;
    health.stalled = true;
    return health;
  }

  scheduleRestart(kind, restart, reason) {
    const ws = getWebSocketAvailability();
    if (!ws.available) {
      this.state.unavailableReason = ws.reason;
    }
    if (this.isClosing || !this.state.enabled || !ws.available) {
      return Promise.resolve();
    }
    this.clearRestartTimer(kind);
    const delayMs = this.getStreamReconnectDelayMs();
    const promiseName = `${kind}RestartPromise`;
    this[promiseName] = this[promiseName]
      .catch(() => {})
      .then(() => new Promise((resolve) => {
        this.restartTimers[kind] = setTimeout(async () => {
          this.restartTimers[kind] = null;
          this.noteRestartAttempt(kind, reason);
          try {
            await restart();
            this.noteRestartSuccess(kind, reason);
            this.logger?.info?.(`${kind} stream restarted`, { reason, delayMs });
          } catch (error) {
            this.state.lastError = error.message;
            this.noteRestartFailure(kind, reason, error);
            const retryScheduled = !this.isClosing && this.state.enabled && getWebSocketAvailability().available;
            this.logger?.warn?.(`${kind} stream restart failed`, {
              reason,
              error: error.message,
              retryScheduled
            });
            if (retryScheduled) {
              void this.scheduleRestart(kind, restart, `${reason}_retry`);
            }
          } finally {
            resolve();
          }
        }, delayMs);
      }));
    return this[promiseName];
  }

  async init() {
    this.isClosing = false;
    const ws = getWebSocketAvailability();
    if (!ws.available) {
      this.state.unavailableReason = ws.reason;
    }
    if (!this.config.enableEventDrivenData || !ws.available) {
      return this.getStatus();
    }

    await this.startPublicStream();
    this.startStreamHealthMonitor();
    const startupWaitMs = Math.max(250, Number(this.config.publicStreamStartupWaitMs || 3_500));
    const publicConnected = await this.waitForPublicStreamOpen(startupWaitMs);
    if (!publicConnected) {
      this.logger?.warn?.("Public market stream did not confirm open during startup wait", {
        startupWaitMs,
        chunks: this.state.publicStreamChunkCount,
        streams: this.state.publicStreamStreamCount
      });
    }
    if (this.config.enableLocalOrderBook) {
      void (async () => {
        await this.waitForPublicStreamOpen(Math.max(250, Number(this.config.localBookBootstrapWaitMs || 0) + 500));
        return this.primeLocalBooks(this.orderBook.activeSymbols ? [...this.orderBook.activeSymbols] : []);
      })().catch(() => {
        // ignore background priming errors here; individual warnings are logged inside the engine
      });
    }
    await this.startFuturesStream();
    if (shouldUsePrivateUserStream(this.config)) {
      try {
        await this.startUserStream();
        const userStartupWaitMs = this.getUserStreamStartupWaitMs();
        if (userStartupWaitMs > 0 && !this.state.userStreamConnected) {
          await this.waitForUserStreamOpen(userStartupWaitMs);
        }
      } catch (error) {
        this.state.lastError = error.message;
        this.logger?.warn?.("User stream failed to start", { error: error.message });
      }
    }

    return this.getStatus();
  }

  handlePublicMessage(payload) {
    const stream = payload.stream || "";
    const data = payload.data || payload;
    const symbol = data.s || stream.split("@")[0]?.toUpperCase();
    if (!symbol || !this.state.symbols[symbol]) {
      return;
    }
    this.state.lastPublicMessageAt = new Date().toISOString();

    if (stream.includes("@bookTicker")) {
      const bid = Number(data.b || data.bidPrice || 0);
      const ask = Number(data.a || data.askPrice || 0);
      this.state.symbols[symbol].bookTicker = {
        bid,
        ask,
        bidQty: Number(data.B || data.bidQty || 0),
        askQty: Number(data.A || data.askQty || 0),
        mid: bid && ask ? (bid + ask) / 2 : bid || ask || 0,
        eventTime: data.E || Date.now()
      };
      return;
    }

    if (stream.includes("@depth")) {
      this.orderBook.handleDepthEvent(symbol, data);
      this.state.localBook = this.orderBook.getSummary();
      return;
    }

    if (stream.includes("@trade")) {
      if (this.config.enableAggtradeOrderflow) {
        recordAggTrade(symbol, {
          p: data.p || 0,
          q: data.q || 0,
          m: data.m,
          E: data.E || Date.now()
        });
      }
      this.state.symbols[symbol].trades.push({
        price: Number(data.p || 0),
        quantity: Number(data.q || 0),
        isBuyerMaker: Boolean(data.m),
        eventTime: data.E || Date.now()
      });
      return;
    }

    if (stream.includes("@kline_")) {
      const interval = data.k?.i || stream.split("@kline_")[1] || null;
      if (!interval) {
        return;
      }
      this.upsertKline(symbol, interval, {
        openTime: data.k?.t,
        open: data.k?.o,
        high: data.k?.h,
        low: data.k?.l,
        close: data.k?.c,
        volume: data.k?.v,
        closeTime: data.k?.T,
        isClosed: data.k?.x
      });
    }
  }

  handleFuturesMessage(payload) {
    const rawData = payload.data || payload;
    const records = Array.isArray(rawData) ? rawData : [rawData];
    for (const record of records) {
      const normalized = normalizeForceOrder(record);
      if (!normalized.symbol || !this.state.symbols[normalized.symbol]) {
        continue;
      }
      this.state.lastFuturesMessageAt = new Date().toISOString();
      this.state.symbols[normalized.symbol].liquidations.push({
        ...normalized,
        at: new Date(normalized.eventTime || Date.now()).toISOString()
      });
    }
  }

  handleUserMessage(payload) {
    const event = flattenUserPayload(payload);
    const eventType = event.e;
    this.state.lastUserMessageAt = new Date().toISOString();
    if (eventType === "executionReport") {
      const normalized = normalizeExecutionReport(event);
      const symbol = normalized.symbol;
      if (this.state.symbols[symbol]) {
        this.state.symbols[symbol].userEvents.push(normalized);
      }
      return;
    }
    if (eventType === "listStatus") {
      const normalized = normalizeListStatusEvent(event);
      const symbol = normalized.symbol;
      if (this.state.symbols[symbol]) {
        this.state.symbols[symbol].listStatusEvents.push(normalized);
      }
    }
  }

  async startPublicStream() {
    this.clearRestartTimer("public");
    const ws = getWebSocketAvailability();
    if (!ws.available) {
      this.state.unavailableReason = ws.reason;
      return;
    }
    await this.stopPublicStream();
    const streams = buildPublicStreamNames({
      symbols: this.config.watchlist,
      klineIntervals: this.klineIntervals,
      enableLocalOrderBook: this.config.enableLocalOrderBook
    });
    const chunks = chunkPublicStreams(streams, this.getPublicStreamMaxStreamsPerConnection());
    this.state.publicStreamStreamCount = streams.length;
    this.state.publicStreamChunkCount = chunks.length;
    this.state.publicStreamMaxStreamsPerConnection = this.getPublicStreamMaxStreamsPerConnection();
    if (!chunks.length) {
      this.updatePublicStreamConnectivity();
      return;
    }
    const baseUrl = this.client.getStreamBaseUrl();
    chunks.forEach((chunk, index) => {
      const socket = new WebSocket(`${baseUrl}/${toCombinedStreamPath(chunk)}`);
      this.publicSockets.add(socket);
      this.publicSocketMeta.set(socket, {
        index,
        streams: chunk.length,
        createdAt: new Date().toISOString(),
        openedAt: null,
        lastMessageAt: null
      });
      if (!this.publicSocket) {
        this.publicSocket = socket;
      }
      socket.addEventListener("open", () => {
        if (!this.publicSockets.has(socket)) {
          return;
        }
        this.publicOpenSockets.add(socket);
        const meta = this.publicSocketMeta.get(socket) || {};
        this.publicSocketMeta.set(socket, {
          ...meta,
          openedAt: new Date().toISOString()
        });
        this.updatePublicStreamConnectivity();
        this.state.unavailableReason = null;
        this.logger?.info?.("Public market stream chunk connected", {
          chunk: index + 1,
          chunks: chunks.length,
          streams: chunk.length,
          totalStreams: streams.length
        });
      });
      socket.addEventListener("message", (event) => {
        if (!this.publicSockets.has(socket)) {
          return;
        }
        try {
          const meta = this.publicSocketMeta.get(socket) || {};
          this.publicSocketMeta.set(socket, {
            ...meta,
            lastMessageAt: new Date().toISOString()
          });
          this.ensureRestartHealth("public").stalled = false;
          this.handlePublicMessage(JSON.parse(event.data));
        } catch (error) {
          this.state.lastError = error.message;
        }
      });
      socket.addEventListener("close", () => {
        if (!this.publicSockets.has(socket)) {
          return;
        }
        this.publicSockets.delete(socket);
        this.publicOpenSockets.delete(socket);
        this.publicSocketMeta.delete(socket);
        this.updatePublicStreamConnectivity();
        if (!this.state.publicStreamConnected) {
          this.clearPublicBookTickers();
        }
        void this.scheduleRestart("public", () => this.startPublicStream(), "socket_close");
      });
      socket.addEventListener("error", (error) => {
        if (!this.publicSockets.has(socket)) {
          return;
        }
        this.state.lastError = error.message || "public_stream_error";
        this.publicSockets.delete(socket);
        this.publicOpenSockets.delete(socket);
        this.publicSocketMeta.delete(socket);
        this.updatePublicStreamConnectivity();
        if (!this.state.publicStreamConnected) {
          this.clearPublicBookTickers();
        }
        void this.scheduleRestart("public", () => this.startPublicStream(), "socket_error");
      });
    });
  }

  async startFuturesStream() {
    this.clearRestartTimer("futures");
    const socket = new WebSocket(`${this.client.getFuturesStreamBaseUrl()}/stream?streams=!forceOrder@arr`);
    this.futuresSocket = socket;
    socket.addEventListener("open", () => {
      if (this.futuresSocket !== socket) {
        return;
      }
      this.state.futuresStreamConnected = true;
      this.logger?.info?.("Futures liquidation stream connected");
    });
    socket.addEventListener("message", (event) => {
      if (this.futuresSocket !== socket) {
        return;
      }
      try {
        this.handleFuturesMessage(JSON.parse(event.data));
      } catch (error) {
        this.state.lastError = error.message;
      }
    });
    socket.addEventListener("close", () => {
      if (this.futuresSocket !== socket) {
        return;
      }
      this.state.futuresStreamConnected = false;
      this.futuresSocket = null;
      void this.scheduleRestart("futures", () => this.startFuturesStream(), "socket_close");
    });
    socket.addEventListener("error", (error) => {
      if (this.futuresSocket !== socket) {
        return;
      }
      this.state.lastError = error.message || "futures_stream_error";
      this.state.futuresStreamConnected = false;
      this.futuresSocket = null;
      void this.scheduleRestart("futures", () => this.startFuturesStream(), "socket_error");
    });
  }

  async startUserStream() {
    if (isDemoSpotEnvironment(this.client)) {
      return this.startUserStreamViaWsApi();
    }
    try {
      return await this.startUserStreamViaListenKey();
    } catch (error) {
      if (isUserStreamListenKeyUnsupported(error)) {
        this.logger?.info?.("User data stream listenKey unsupported; falling back to WebSocket API subscription", {
          status: error.status
        });
        return this.startUserStreamViaWsApi();
      }
      throw error;
    }
  }

  resetUserStreamState() {
    this.state.userStreamConnected = false;
    this.state.listenKey = null;
    this.state.userStreamTransport = null;
    this.state.userStreamSubscriptionId = null;
  }

  closeExistingUserSocket() {
    this.clearRestartTimer("user");
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    const previousSocket = this.userSocket;
    if (previousSocket) {
      this.userSocket = null;
      try {
        previousSocket.close();
      } catch {
        // ignore local websocket close errors before reconnecting
      }
    }
  }

  async startUserStreamViaListenKey() {
    this.closeExistingUserSocket();
    this.resetUserStreamState();
    const listenKey = await this.client.createUserDataListenKey();
    this.state.listenKey = listenKey;
    this.state.userStreamTransport = "listen_key";
    const socket = new WebSocket(`${this.client.getStreamBaseUrl()}/ws/${listenKey}`);
    this.userSocket = socket;
    socket.addEventListener("open", () => {
      if (this.userSocket !== socket) {
        return;
      }
      this.state.userStreamConnected = true;
      this.logger?.info?.("User data stream connected");
    });
    socket.addEventListener("message", (event) => {
      if (this.userSocket !== socket) {
        return;
      }
      try {
        this.handleUserMessage(JSON.parse(event.data));
      } catch (error) {
        this.state.lastError = error.message;
      }
    });
    socket.addEventListener("close", () => {
      if (this.userSocket !== socket) {
        return;
      }
      this.state.userStreamConnected = false;
      if (this.state.listenKey === listenKey) {
        this.resetUserStreamState();
      }
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
      this.userSocket = null;
      if (shouldUsePrivateUserStream(this.config)) {
        void this.scheduleRestart("user", () => this.startUserStream(), "socket_close");
      }
    });
    socket.addEventListener("error", (error) => {
      if (this.userSocket !== socket) {
        return;
      }
      this.state.lastError = error.message || "user_stream_error";
      this.state.userStreamConnected = false;
      if (this.state.listenKey === listenKey) {
        this.resetUserStreamState();
      }
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
      this.userSocket = null;
      if (shouldUsePrivateUserStream(this.config)) {
        void this.scheduleRestart("user", () => this.startUserStream(), "socket_error");
      }
    });
    this.keepAliveTimer = setInterval(() => {
      this.client.keepAliveUserDataListenKey(listenKey).catch((error) => {
        this.state.lastError = error.message;
      });
    }, 30 * 60 * 1000);
  }

  async startUserStreamViaWsApi() {
    this.closeExistingUserSocket();
    this.resetUserStreamState();
    const requestId = crypto.randomUUID();
    const timestamp = Date.now();
    const params = {
      apiKey: this.client.apiKey,
      timestamp,
      recvWindow: this.client.recvWindow
    };
    const socket = new WebSocket(this.client.getWsApiBaseUrl());
    this.userSocket = socket;

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (handler, value) => {
        if (settled) {
          return;
        }
        settled = true;
        handler(value);
      };
      const timeout = setTimeout(() => {
        settle(reject, toUserStreamError("Timed out starting Binance WebSocket API user data stream."));
      }, 10_000);
      const cleanupPending = () => clearTimeout(timeout);
      const failAndReset = (error) => {
        this.state.lastError = error.message;
        this.resetUserStreamState();
        if (this.userSocket === socket) {
          this.userSocket = null;
        }
        cleanupPending();
        settle(reject, error);
      };

      socket.addEventListener("open", () => {
        if (this.userSocket !== socket) {
          return;
        }
        const signature = this.client.signWebSocketParams(params);
        socket.send(JSON.stringify({
          id: requestId,
          method: "userDataStream.subscribe.signature",
          params: {
            ...params,
            signature
          }
        }));
      });
      socket.addEventListener("message", (event) => {
        if (this.userSocket !== socket) {
          return;
        }
        try {
          const payload = JSON.parse(event.data);
          if (payload?.id === requestId) {
            if (Number(payload?.status || 0) !== 200) {
              throw toUserStreamError(payload?.error?.msg || payload?.msg || "Binance WebSocket API user stream subscription failed.", payload);
            }
            this.state.userStreamConnected = true;
            this.state.userStreamTransport = "ws_api";
            this.state.userStreamSubscriptionId = payload?.result?.subscriptionId ?? null;
            cleanupPending();
            this.logger?.info?.("User data stream connected via WebSocket API", {
              subscriptionId: this.state.userStreamSubscriptionId
            });
            settle(resolve, this.getStatus());
            return;
          }
          if (payload?.event || payload?.subscriptionId != null) {
            this.handleUserMessage(payload);
          }
        } catch (error) {
          failAndReset(error);
        }
      });
      socket.addEventListener("close", () => {
        if (this.userSocket !== socket) {
          return;
        }
        cleanupPending();
        const wasActive = this.state.userStreamConnected || this.state.userStreamSubscriptionId != null;
        this.resetUserStreamState();
        this.userSocket = null;
        if (!settled) {
          settle(reject, toUserStreamError("Binance WebSocket API user data stream closed before subscription completed."));
          return;
        }
        if (wasActive && shouldUsePrivateUserStream(this.config)) {
          void this.scheduleRestart("user", () => this.startUserStream(), "socket_close");
        }
      });
      socket.addEventListener("error", (eventError) => {
        if (this.userSocket !== socket) {
          return;
        }
        const error = toUserStreamError(eventError?.message || "user_stream_error");
        cleanupPending();
        if (!settled) {
          failAndReset(error);
          return;
        }
        this.state.lastError = error.message;
        this.resetUserStreamState();
        this.userSocket = null;
        if (shouldUsePrivateUserStream(this.config)) {
          void this.scheduleRestart("user", () => this.startUserStream(), "socket_error");
        }
      });
    });
  }

  async stopPublicStream() {
    this.clearRestartTimer("public");
    const sockets = new Set(this.publicSockets || []);
    if (this.publicSocket) {
      sockets.add(this.publicSocket);
    }
    this.publicSocket = null;
    this.publicSockets = new Set();
    this.publicOpenSockets = new Set();
    this.publicSocketMeta = new Map();
    this.updatePublicStreamConnectivity();
    this.clearPublicBookTickers();
    for (const socket of sockets) {
      socket.close();
    }
  }

  async restartPublicStream(reason = "watchlist_update") {
    this.clearRestartTimer("public");
    this.publicRestartPromise = this.publicRestartPromise.catch(() => {}).then(async () => {
      await this.stopPublicStream();
      const ws = getWebSocketAvailability();
      if (!ws.available) {
        this.state.unavailableReason = ws.reason;
      }
      if (!this.state.enabled || !ws.available || !this.config.watchlist.length) {
        return;
      }
      await this.startPublicStream();
      this.logger?.info?.("Public market stream restarted", {
        reason,
        symbols: this.config.watchlist.length,
        chunks: this.state.publicStreamChunkCount,
        streams: this.state.publicStreamStreamCount
      });
    });
    return this.publicRestartPromise;
  }

  async close() {
    this.isClosing = true;
    this.stopStreamHealthMonitor();
    this.clearRestartTimer("public");
    this.clearRestartTimer("futures");
    this.clearRestartTimer("user");
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    const publicSockets = new Set(this.publicSockets || []);
    if (this.publicSocket) {
      publicSockets.add(this.publicSocket);
    }
    const futuresSocket = this.futuresSocket;
    const userSocket = this.userSocket;
    this.publicSocket = null;
    this.publicSockets = new Set();
    this.publicOpenSockets = new Set();
    this.publicSocketMeta = new Map();
    this.futuresSocket = null;
    this.userSocket = null;
    const listenKey = this.state.listenKey;
    for (const publicSocket of publicSockets) {
      shutdownSocket(publicSocket);
    }
    shutdownSocket(futuresSocket);
    shutdownSocket(userSocket);
    this.updatePublicStreamConnectivity();
    this.state.futuresStreamConnected = false;
    this.resetUserStreamState();
    this.clearPublicBookTickers();
    if (listenKey) {
      try {
        await this.client.closeUserDataListenKey(listenKey);
      } catch {
        // ignore cleanup failures
      }
    }
  }
}
