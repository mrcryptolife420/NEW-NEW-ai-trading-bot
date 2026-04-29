import path from "node:path";
import { MarketHistoryStore } from "../storage/marketHistoryStore.js";
import { runBacktest } from "./backtestRunner.js";

function parseDateMs(value, fallback = null) {
  if (value == null || value === "") {
    return fallback;
  }
  const ms = new Date(`${value}`.length === 10 ? `${value}T00:00:00.000Z` : `${value}`).getTime();
  return Number.isFinite(ms) ? ms : fallback;
}

function quoteAssetFromSymbol(symbol = "", fallback = "USDT") {
  for (const quote of ["USDT", "FDUSD", "USDC", "BTC", "ETH", "BNB"]) {
    if (`${symbol}`.endsWith(quote)) {
      return quote;
    }
  }
  return fallback;
}

function baseAssetFromSymbol(symbol = "", quoteAsset = "USDT") {
  return `${symbol}`.endsWith(quoteAsset) ? `${symbol}`.slice(0, -quoteAsset.length) : `${symbol}`;
}

function buildReplayExchangeInfo(symbol, quoteAsset = "USDT") {
  return {
    symbols: [
      {
        symbol,
        status: "TRADING",
        baseAsset: baseAssetFromSymbol(symbol, quoteAsset),
        quoteAsset,
        filters: [
          { filterType: "PRICE_FILTER", minPrice: "0.00000001", maxPrice: "100000000", tickSize: "0.00000001" },
          { filterType: "LOT_SIZE", minQty: "0.000001", maxQty: "100000000", stepSize: "0.000001" },
          { filterType: "MARKET_LOT_SIZE", minQty: "0.000001", maxQty: "100000000", stepSize: "0.000001" },
          { filterType: "MIN_NOTIONAL", minNotional: "1" }
        ],
        defaultSelfTradePreventionMode: "NONE",
        allowedSelfTradePreventionModes: ["NONE"]
      }
    ]
  };
}

function buildTrace({ symbol, candles = [], result = {}, status = "ready" }) {
  const first = candles[0] || null;
  const last = candles.at(-1) || null;
  return {
    id: `market-replay:${symbol}:${first?.openTime || "empty"}:${last?.closeTime || "empty"}`,
    symbol,
    status,
    at: new Date().toISOString(),
    candleCount: candles.length,
    range: {
      from: first?.openTime ? new Date(first.openTime).toISOString() : null,
      to: last?.closeTime ? new Date(last.closeTime).toISOString() : null
    },
    summary: {
      tradeCount: result.tradeCount || 0,
      realizedPnl: result.realizedPnl || 0,
      winRate: result.winRate || 0,
      maxDrawdownPct: result.maxDrawdownPct || 0,
      averagePnlPct: result.averagePnlPct || 0
    },
    diagnostics: {
      noLiveOrders: true,
      source: "local_market_history",
      engine: "marketReplayEngine"
    }
  };
}

export async function runMarketReplay({
  config,
  logger = null,
  symbol,
  from = null,
  to = null,
  interval = null,
  historyStore = null,
  candles = null
} = {}) {
  const replaySymbol = `${symbol || config?.watchlist?.[0] || "BTCUSDT"}`.toUpperCase();
  const replayInterval = interval || config.klineInterval || "15m";
  const startTime = parseDateMs(from, null);
  const endTime = parseDateMs(to, null);
  const store = historyStore || new MarketHistoryStore({
    rootDir: config.historyDir || path.join(config.projectRoot || process.cwd(), "data", "history"),
    logger
  });
  if (!candles) {
    await store.init();
  }
  const replayCandles = (candles || await store.getCandles({
    symbol: replaySymbol,
    interval: replayInterval,
    startTime,
    endTime
  })).filter((candle) => Number.isFinite(Number(candle?.openTime)) && Number.isFinite(Number(candle?.close)));

  if (!replayCandles.length) {
    return {
      status: "empty_history",
      symbol: replaySymbol,
      interval: replayInterval,
      candleCount: 0,
      trades: [],
      blockedSetups: [],
      equityCurve: [],
      trace: buildTrace({ symbol: replaySymbol, candles: [], status: "empty_history" }),
      warnings: ["No local candles found for replay range. Run history download/backfill first."]
    };
  }

  const quoteAsset = config.baseQuoteAsset || quoteAssetFromSymbol(replaySymbol, "USDT");
  const replayClient = {
    async getExchangeInfo() {
      return buildReplayExchangeInfo(replaySymbol, quoteAsset);
    }
  };
  const result = await runBacktest({
    config: {
      ...config,
      baseQuoteAsset: quoteAsset,
      backtestCandleLimit: replayCandles.length,
      klineInterval: replayInterval
    },
    logger,
    symbol: replaySymbol,
    client: replayClient,
    historyStore: store,
    candles: replayCandles
  });

  return {
    status: "ready",
    symbol: replaySymbol,
    interval: replayInterval,
    candleCount: replayCandles.length,
    from: replayCandles[0]?.openTime ? new Date(replayCandles[0].openTime).toISOString() : null,
    to: replayCandles.at(-1)?.closeTime ? new Date(replayCandles.at(-1).closeTime).toISOString() : null,
    trades: result.recentTrades || [],
    blockedSetups: result.blockedSetupLifecycle?.recent || [],
    equityCurve: result.equityCurve || [],
    performance: result,
    trace: buildTrace({ symbol: replaySymbol, candles: replayCandles, result }),
    warnings: []
  };
}

export function parseMarketReplayArgs(args = [], config = {}) {
  const options = {
    symbol: null,
    from: null,
    to: null,
    interval: config.klineInterval || "15m"
  };
  for (const arg of args || []) {
    const value = `${arg || ""}`.trim();
    if (!value) {
      continue;
    }
    if (value.startsWith("--from=")) {
      options.from = value.slice("--from=".length);
    } else if (value.startsWith("--to=")) {
      options.to = value.slice("--to=".length);
    } else if (value.startsWith("--interval=")) {
      options.interval = value.slice("--interval=".length) || options.interval;
    } else if (!options.symbol) {
      options.symbol = value.toUpperCase();
    }
  }
  options.symbol = options.symbol || config.watchlist?.[0] || "BTCUSDT";
  return options;
}
