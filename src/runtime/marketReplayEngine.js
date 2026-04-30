import path from "node:path";
import { MarketHistoryStore } from "../storage/marketHistoryStore.js";
import { ReadModelStore } from "../storage/readModelStore.js";
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

function buildHistoryActionPlan({ symbol, interval, from, to, status = "missing" }) {
  const args = [
    "npm run download-history",
    "--",
    symbol,
    interval
  ];
  const backfillArgs = {
    symbol,
    interval,
    from: from || null,
    to: to || null
  };
  const recommendedCommand = args.join(" ");
  const validationCommand = `npm run replay:market -- ${symbol}${from ? ` --from=${from}` : ""}${to ? ` --to=${to}` : ""}${interval ? ` --interval=${interval}` : ""}`;
  return {
    status,
    symbol,
    interval,
    from: from || null,
    to: to || null,
    blocking: status === "missing_history",
    coverageTarget: ">= 95% candle coverage and no material gaps for the replay window",
    backfillArgs,
    autoBackfillPlan: {
      safe: true,
      mutatesLiveState: false,
      placesOrders: false,
      source: "local_history_only",
      command: recommendedCommand,
      validationCommand,
      note: "Backfill schrijft alleen lokale candle-history; replay blijft read-only voor trading state."
    },
    recommendedCommand,
    validationCommand,
    steps: [
      { order: 1, action: "backfill_local_history", command: recommendedCommand },
      { order: 2, action: "validate_replay_window", command: validationCommand },
      { order: 3, action: "review_replay_outputs", fields: ["trades", "blockedSetups", "equityCurve", "rootBlockers", "exitQuality"] }
    ],
    note: "Replay gebruikt alleen lokale history; backfill history voordat je conclusies uit empty_history trekt."
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

async function buildHistoryReadiness({ store, symbol, interval, startTime, endTime, candles }) {
  if (!store?.verifySeries) {
    return {
      status: candles.length ? "unknown" : "missing",
      candleCount: candles.length,
      warnings: candles.length ? ["history_store_verification_unavailable"] : ["no_local_candles"]
    };
  }
  const verification = await store.verifySeries({ symbol, interval }).catch((error) => ({
    status: "degraded",
    error: error?.message || "history_verification_failed"
  }));
  const selected = candles.filter((candle) => {
    const openTime = Number(candle.openTime);
    return (!Number.isFinite(startTime) || openTime >= startTime) && (!Number.isFinite(endTime) || openTime <= endTime);
  });
  const warnings = [];
  if (!selected.length) warnings.push("no_local_candles");
  if (verification.stale) warnings.push("history_stale");
  if ((verification.gapCount || 0) > 0) warnings.push("history_gaps_present");
  if ((verification.coverageRatio ?? 1) < 0.85) warnings.push("history_low_coverage");
  return {
    status: warnings.length ? "degraded" : "ready",
    candleCount: selected.length,
    coverageRatio: verification.coverageRatio ?? null,
    gapCount: verification.gapCount || 0,
    stale: Boolean(verification.stale),
    partitionCount: verification.partitionCount || 0,
    warnings
  };
}

async function persistReplayTrace({ config, trace, persistTrace = false, logger = null }) {
  if (!persistTrace || !config?.runtimeDir || !trace) {
    return null;
  }
  const store = new ReadModelStore({ runtimeDir: config.runtimeDir, logger });
  try {
    await store.init();
    return store.upsertReplayTrace(trace);
  } catch (error) {
    logger?.warn?.("Market replay trace persistence failed", { error: error?.message });
    return null;
  } finally {
    store.close();
  }
}

export async function runMarketReplay({
  config,
  logger = null,
  symbol,
  from = null,
  to = null,
  interval = null,
  historyStore = null,
  candles = null,
  persistTrace = false
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
  const historyReadiness = await buildHistoryReadiness({
    store,
    symbol: replaySymbol,
    interval: replayInterval,
    startTime,
    endTime,
    candles: replayCandles
  });

  if (!replayCandles.length) {
    const historyActionPlan = buildHistoryActionPlan({
      symbol: replaySymbol,
      interval: replayInterval,
      from,
      to,
      status: "missing_history"
    });
    const trace = {
      ...buildTrace({ symbol: replaySymbol, candles: [], status: "empty_history" }),
      historyReadiness,
      historyActionPlan
    };
    await persistReplayTrace({ config, trace, persistTrace, logger });
    return {
      status: "empty_history",
      symbol: replaySymbol,
      interval: replayInterval,
      candleCount: 0,
      trades: [],
      blockedSetups: [],
      equityCurve: [],
      historyReadiness,
      historyActionPlan,
      trace,
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

  const trace = {
    ...buildTrace({ symbol: replaySymbol, candles: replayCandles, result }),
    historyReadiness,
    policyReplay: {
      available: true,
      source: "backtestRunner",
      includesSignalRiskIntentExecution: true,
      note: "Replay gebruikt dezelfde backtest decision path en blijft orderloos/offline."
    }
  };
  await persistReplayTrace({ config, trace, persistTrace, logger });

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
    historyReadiness,
    historyActionPlan: historyReadiness.status === "ready"
      ? { status: "ready", note: "Local history coverage is sufficient for this replay window." }
      : buildHistoryActionPlan({ symbol: replaySymbol, interval: replayInterval, from, to, status: "improve_history" }),
    trace,
    warnings: historyReadiness.warnings || []
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
