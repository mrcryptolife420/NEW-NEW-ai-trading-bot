import { BinanceClient } from "../src/binance/client.js";
import { TradingBot } from "../src/runtime/tradingBot.js";
import { buildRestArchitectureAudit, scanRestCallers } from "../src/runtime/restArchitectureAudit.js";
import { buildRestBudgetGovernorSummary } from "../src/runtime/restBudgetGovernor.js";
import { buildMarketScannerUniverse } from "../src/runtime/marketScanner.js";

function makeHeaders(values = {}) {
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [`${key}`.toLowerCase(), `${value}`])
  );
  return {
    get(name) {
      return normalized[`${name}`.toLowerCase()] ?? null;
    },
    entries() {
      return Object.entries(normalized);
    }
  };
}

function buildCandles(limit = 60, startPrice = 100) {
  return Array.from({ length: limit }, (_, index) => ({
    openTime: 1_700_000_000_000 + index * 60_000,
    open: startPrice + index * 0.1,
    high: startPrice + index * 0.1 + 0.2,
    low: startPrice + index * 0.1 - 0.2,
    close: startPrice + index * 0.1 + 0.05,
    volume: 10 + index,
    closeTime: 1_700_000_000_000 + (index + 1) * 60_000 - 1
  }));
}

function toRawKlines(candles = []) {
  return candles.map((candle) => ([
    candle.openTime,
    `${candle.open}`,
    `${candle.high}`,
    `${candle.low}`,
    `${candle.close}`,
    `${candle.volume}`,
    candle.closeTime
  ]));
}

function buildFakeBot({
  config,
  candles,
  client,
  stream
}) {
  const bot = {
    config,
    client,
    stream,
    marketCache: {},
    klineCache: {},
    restFallbackState: {},
    logger: { warn() {}, info() {}, error() {} },
    health: { validateSnapshot() { return []; } },
    recordEvent() {},
    getKlineCacheBucket: TradingBot.prototype.getKlineCacheBucket,
    setCachedKlineSeries: TradingBot.prototype.setCachedKlineSeries,
    getCachedKlineSeries: TradingBot.prototype.getCachedKlineSeries,
    mergeCandleSeries: TradingBot.prototype.mergeCandleSeries,
    getRestFallbackKey: TradingBot.prototype.getRestFallbackKey,
    getRestFallbackMinMs: TradingBot.prototype.getRestFallbackMinMs,
    shouldUseRestFallback: TradingBot.prototype.shouldUseRestFallback,
    rememberRestFallback: TradingBot.prototype.rememberRestFallback,
    getKlineSeries: TradingBot.prototype.getKlineSeries,
    getTimeframeSnapshot: TradingBot.prototype.getTimeframeSnapshot,
    getMarketSnapshot: TradingBot.prototype.getMarketSnapshot
  };
  bot.setCachedKlineSeries("BTCUSDT", config.klineInterval, candles);
  return bot;
}

export async function registerBinanceRestArchitectureTests({
  runCheck,
  assert,
  makeConfig,
  fs,
  path,
  os
}) {
  await runCheck("binance client tracks request weight and backs off on 429", async () => {
    let attempts = 0;
    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      baseUrl: "https://api.binance.com",
      requestWeightBackoffMaxMs: 1,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            ok: false,
            status: 429,
            headers: makeHeaders({
              "x-mbx-used-weight-1m": "5601",
              "x-mbx-used-weight": "42"
            }),
            async text() {
              return JSON.stringify({ code: -1003, msg: "Too much request weight used." });
            }
          };
        }
        return {
          ok: true,
          status: 200,
          headers: makeHeaders({
            "x-mbx-used-weight-1m": "1200",
            "x-mbx-used-weight": "18"
          }),
          async text() {
            return JSON.stringify({ ok: true });
          }
        };
      }
    });
    const payload = await client.publicRequest("GET", "/api/v3/ping", {}, { caller: "test.request_weight" });
    const state = client.getRateLimitState();

    assert.deepEqual(payload, { ok: true });
    assert.equal(attempts, 2);
    assert.ok(state.totalRateLimitHits >= 1);
    assert.ok(state.usedWeight1m >= 1200);
    assert.equal(state.topRestCallers["test.request_weight"].count, 2);
    assert.ok(state.topRestCallers["test.request_weight"].weight >= 2);
  });

  await runCheck("binance client blocks private order mutations in internal paper mode before REST", async () => {
    let fetchCalls = 0;
    const warnings = [];
    const client = new BinanceClient({
      apiKey: "key",
      apiSecret: "secret",
      baseUrl: "https://api.binance.com",
      botMode: "paper",
      paperExecutionVenue: "internal",
      logger: {
        warn(message, ctx) {
          warnings.push({ message, ctx });
        }
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return {
          ok: true,
          status: 200,
          headers: makeHeaders(),
          async text() {
            return JSON.stringify({ orderId: 1 });
          }
        };
      }
    });

    await assert.rejects(
      () => client.placeOrder({ symbol: "BTCUSDT", side: "BUY", type: "MARKET", quantity: "0.01" }),
      (error) => {
        assert.equal(error.code, "PRIVATE_ORDER_MUTATION_BLOCKED");
        assert.equal(error.blockedReason, "non_live_private_order_mutation");
        assert.equal(error.botMode, "paper");
        assert.equal(error.paperExecutionVenue, "internal");
        assert.equal(error.symbol, "BTCUSDT");
        return true;
      }
    );
    assert.equal(fetchCalls, 0);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].ctx.action, "placeOrder");
  });

  await runCheck("binance client allows private order mutations only for paper demo spot endpoint", async () => {
    let fetchCalls = 0;
    const client = new BinanceClient({
      apiKey: "key",
      apiSecret: "secret",
      baseUrl: "https://demo-api.binance.com",
      botMode: "paper",
      paperExecutionVenue: "binance_demo_spot",
      fetchImpl: async (url, init) => {
        fetchCalls += 1;
        assert.equal(init.method, "POST");
        assert.ok(url.includes("/api/v3/order"));
        return {
          ok: true,
          status: 200,
          headers: makeHeaders(),
          async text() {
            return JSON.stringify({ orderId: 7, status: "FILLED" });
          }
        };
      }
    });

    const response = await client.placeOrder({ symbol: "BTCUSDT", side: "BUY", type: "MARKET", quantity: "0.01" });
    assert.equal(response.orderId, 7);
    assert.equal(fetchCalls, 1);
  });

  await runCheck("binance client emits request-weight update callbacks", async () => {
    const updates = [];
    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      baseUrl: "https://api.binance.com",
      onRequestWeightUpdate(update) {
        updates.push(update);
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: makeHeaders({
          "x-mbx-used-weight-1m": "99",
          "x-mbx-used-weight": "7"
        }),
        async text() {
          return JSON.stringify({ ok: true });
        }
      })
    });
    await client.publicRequest("GET", "/api/v3/ping", {}, { caller: "test.callback" });
    assert.ok(updates.length >= 1);
    assert.equal(updates.at(-1).state.usedWeight1m, 99);
    assert.equal(updates.at(-1).state.topRestCallers["test.callback"].count, 1);
    assert.ok(updates.at(-1).state.topRestCallers["test.callback"].weight >= 1);
  });

  await runCheck("binance client hard-pauses requests on 418 until ban expiry", async () => {
    let attempts = 0;
    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      baseUrl: "https://api.binance.com",
      fetchImpl: async () => {
        attempts += 1;
        return {
          ok: false,
          status: 418,
          headers: makeHeaders({
            "x-mbx-used-weight-1m": "6100"
          }),
          async text() {
            return JSON.stringify({
              code: -1003,
              msg: "Way too much request weight used; IP banned until 4102444800000."
            });
          }
        };
      }
    });

    await assert.rejects(
      () => client.publicRequest("GET", "/api/v3/ping", {}, { caller: "test.ip_ban" }),
      /Way too much request weight used/
    );
    await assert.rejects(
      () => client.publicRequest("GET", "/api/v3/time", {}, { caller: "test.ip_ban_followup" }),
      /Binance REST banned until/
    );

    const state = client.getRateLimitState();
    assert.equal(attempts, 1);
    assert.equal(state.banActive, true);
    assert.ok(state.banUntil >= 4_102_444_800_000);
  });

  await runCheck("exchange info responses are cached instead of re-fetched every caller loop", async () => {
    let attempts = 0;
    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      baseUrl: "https://api.binance.com",
      exchangeInfoCacheMs: 60_000,
      fetchImpl: async () => {
        attempts += 1;
        return {
          ok: true,
          status: 200,
          headers: makeHeaders(),
          async text() {
            return JSON.stringify({ symbols: [{ symbol: "BTCUSDT" }] });
          }
        };
      }
    });

    const first = await client.getExchangeInfo([], { requestMeta: { caller: "watchlist.exchange_info" } });
    const second = await client.getExchangeInfo([], { requestMeta: { caller: "startup.exchange_info" } });
    const state = client.getRateLimitState();

    assert.equal(attempts, 1);
    assert.deepEqual(first, second);
    assert.equal(state.topRestCallers["watchlist.exchange_info"].cacheMisses, 1);
    assert.equal(state.topRestCallers["startup.exchange_info"].cacheHits, 1);
  });

  await runCheck("exchange info concurrent callers share single in-flight request", async () => {
    let attempts = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      baseUrl: "https://api.binance.com",
      fetchImpl: async () => {
        attempts += 1;
        await gate;
        return {
          ok: true,
          status: 200,
          headers: makeHeaders(),
          async text() {
            return JSON.stringify({ symbols: [{ symbol: "BTCUSDT" }] });
          }
        };
      }
    });
    const first = client.getExchangeInfo([], { requestMeta: { caller: "startup.exchange_info" } });
    const second = client.getExchangeInfo([], { requestMeta: { caller: "watchlist.exchange_info" } });
    release();
    const results = await Promise.all([first, second]);
    const state = client.getRateLimitState();
    assert.equal(attempts, 1);
    assert.deepEqual(results[0], results[1]);
    assert.equal(state.topRestCallers["startup.exchange_info"].cacheMisses, 1);
    assert.equal(state.topRestCallers["watchlist.exchange_info"].coalescedCount, 1);
  });

  await runCheck("scanner universe ticker concurrent callers share single in-flight request", async () => {
    let tickerCalls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const client = {
      baseUrl: "https://api.binance.com",
      cacheEvents: [],
      noteCacheDiagnostics(event) {
        this.cacheEvents.push(event);
      },
      async getExchangeInfo() {
        return { symbols: [{ symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT" }] };
      },
      async publicRequest() {
        tickerCalls += 1;
        await gate;
        return [{ symbol: "BTCUSDT", quoteVolume: "1000000", count: 100 }];
      }
    };
    const first = buildMarketScannerUniverse({ client, config: {}, symbols: ["BTCUSDT"] });
    const second = buildMarketScannerUniverse({ client, config: {}, symbols: ["BTCUSDT"] });
    release();
    const results = await Promise.all([first, second]);
    assert.equal(tickerCalls, 1);
    assert.equal(results[0].entries[0].symbol, "BTCUSDT");
    assert.equal(results[1].entries[0].symbol, "BTCUSDT");
    assert.equal(client.cacheEvents.some((event) => event.type === "cache_miss" && event.cacheKey === "universe_ticker_24hr"), true);
    assert.equal(client.cacheEvents.some((event) => event.type === "coalesced" && event.cacheKey === "universe_ticker_24hr"), true);
  });

  await runCheck("futures public context calls are cached and coalesced as read-only market context", async () => {
    let attempts = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      baseUrl: "https://api.binance.com",
      futuresPublicCacheMs: 60_000,
      fetchImpl: async () => {
        attempts += 1;
        await gate;
        return {
          ok: true,
          status: 200,
          headers: makeHeaders(),
          async text() {
            return JSON.stringify({ openInterest: "123" });
          }
        };
      }
    });
    const first = client.getFuturesOpenInterest("BTCUSDT");
    const second = client.getFuturesOpenInterest("BTCUSDT");
    release();
    const results = await Promise.all([first, second]);
    const third = await client.getFuturesOpenInterest("BTCUSDT");
    const state = client.getRateLimitState();
    const caller = "futures_public:GET /fapi/v1/openInterest";

    assert.equal(attempts, 1);
    assert.deepEqual(results[0], third);
    assert.equal(state.topRestCallers[caller].cacheMisses, 1);
    assert.equal(state.topRestCallers[caller].coalescedCount, 1);
    assert.equal(state.topRestCallers[caller].cacheHits, 1);
  });

  await runCheck("market snapshots can be built from stream candles and local book without REST polling", async () => {
    let klineCalls = 0;
    let bookTickerCalls = 0;
    let orderBookCalls = 0;
    const candles = buildCandles(80, 100);
    const config = makeConfig({
      enableCrossTimeframeConsensus: false,
      enableDailyTimeframe: false,
      enableVolumeProfile: false,
      klineInterval: "1m",
      klineLimit: 80,
      enableLocalOrderBook: true,
      restMarketDataFallbackMinMs: 60_000,
      restTimeframeFallbackMinMs: 60_000
    });
    const bot = buildFakeBot({
      config,
      candles,
      client: {
        getRateLimitState() {
          return { backoffActive: false, banActive: false };
        },
        async getKlines() {
          klineCalls += 1;
          return toRawKlines(candles);
        },
        async getBookTicker() {
          bookTickerCalls += 1;
          return { bidPrice: "100.0", askPrice: "100.1" };
        },
        async getOrderBook() {
          orderBookCalls += 1;
          return { bids: [["100.0", "4"]], asks: [["100.1", "4"]] };
        }
      },
      stream: {
        getKlineSnapshot(symbol, interval, limit) {
          return {
            interval,
            candles: candles.slice(-limit),
            count: Math.min(limit, candles.length),
            warm: true
          };
        },
        seedKlines() {},
        getSymbolStreamFeatures() {
          return {
            latestBookTicker: { bid: 100, ask: 100.1, mid: 100.05 },
            tradeFlowImbalance: 0.08,
            microTrend: 0.04,
            recentTradeCount: 12,
            orderflowDelta: { delta: 1.4 }
          };
        },
        getOrderBookSnapshot() {
          return {
            synced: true,
            depthAgeMs: 0,
            bestBid: 100,
            bestAsk: 100.1,
            mid: 100.05,
            bids: [[100, 4]],
            asks: [[100.1, 4]],
            queueImbalance: 0.11,
            queueRefreshScore: 0.18,
            resilienceScore: 0.22
          };
        }
      }
    });

    const snapshot = await TradingBot.prototype.getMarketSnapshot.call(bot, "BTCUSDT");
    assert.equal(klineCalls, 0);
    assert.equal(bookTickerCalls, 0);
    assert.equal(orderBookCalls, 0);
    assert.equal(snapshot.book.bookSource, "local_book");
    assert.equal(snapshot.candles.length, 80);
  });

  await runCheck("kline REST fallback is throttled instead of hammering in a hot loop", async () => {
    let klineCalls = 0;
    const candles = buildCandles(40, 200);
    const config = makeConfig({
      klineInterval: "5m",
      klineLimit: 40,
      restMarketDataFallbackMinMs: 60_000,
      restTimeframeFallbackMinMs: 60_000
    });
    const bot = buildFakeBot({
      config,
      candles: [],
      client: {
        getRateLimitState() {
          return { backoffActive: false, banActive: false };
        },
        async getKlines() {
          klineCalls += 1;
          return toRawKlines(candles);
        }
      },
      stream: {
        getKlineSnapshot() {
          return null;
        },
        seedKlines() {}
      }
    });

    const first = await TradingBot.prototype.getKlineSeries.call(bot, "BTCUSDT", "5m", 40, {
      requestKey: "test.hot_loop.primary",
      fallbackKind: "market"
    });
    const second = await TradingBot.prototype.getKlineSeries.call(bot, "BTCUSDT", "5m", 40, {
      requestKey: "test.hot_loop.primary",
      fallbackKind: "market"
    });

    assert.equal(klineCalls, 1);
    assert.equal(first.length, 40);
    assert.equal(second.length, 40);
  });

  await runCheck("rest architecture audit classifies stream and cached REST paths", async () => {
    const audit = buildRestArchitectureAudit({
      config: makeConfig({
        enableEventDrivenData: true,
        enableLocalOrderBook: true,
        restMarketDataFallbackMinMs: 60_000
      }),
      requestBudget: {
        status: "ready",
        topCallers: [{ caller: "spot:GET:/api/v3/klines", count: 3 }]
      }
    });
    assert.equal(audit.status, "stream_first");
    assert.ok(audit.hotspots.some((item) => item.id === "klines" && item.streamReplacement));
    assert.ok(audit.hotspots.some((item) => item.id === "exchange_info" && item.cachePolicy));
    assert.equal(audit.topRestCallers[0].caller, "spot:GET:/api/v3/klines");
  });

  await runCheck("request budget summary groups hot scanner callers with cache recommendations", async () => {
    const summary = buildRestBudgetGovernorSummary({
      rateLimitState: {
        topRestCallers: {
          "scanner.deep_book": { count: 3420, weight: 17100, cacheHits: 5, cacheMisses: 5, coalescedCount: 3 },
          "scanner.universe.ticker_24hr": { count: 114, weight: 9120, cacheHits: 9, cacheMisses: 1, coalescedCount: 4 },
          "startup.exchange_info": { count: 40, weight: 4720, cacheHits: 2, cacheMisses: 1, coalescedCount: 1 }
        }
      },
      config: { requestWeightWarnThreshold1m: 4800 },
      streamStatus: { public: { connected: true } }
    });
    const deepBook = summary.topCallers.find((item) => item.caller === "scanner.deep_book");
    const ticker = summary.topCallers.find((item) => item.caller === "scanner.universe.ticker_24hr");
    const exchangeInfo = summary.topCallers.find((item) => item.caller === "startup.exchange_info");
    assert.equal(deepBook.restClass, "public_market_depth");
    assert.equal(deepBook.cacheRecommendation.action, "prefer_local_book_or_cached_book_ticker");
    assert.equal(deepBook.cacheTelemetry.cacheKey, "market_depth_or_book_ticker");
    assert.equal(deepBook.cacheTelemetry.coalesceWindowMs, 5000);
    assert.equal(deepBook.cacheTelemetry.cacheHitRatio, 0.5);
    assert.equal(deepBook.cacheTelemetry.coalescedCount, 3);
    assert.equal(deepBook.cacheTelemetry.fallbackReason, "hot_public_depth_rest_suppressed");
    assert.equal(deepBook.cacheHitRatio, 0.5);
    assert.equal(deepBook.cacheMisses, 5);
    assert.equal(deepBook.coalescedCount, 3);
    assert.equal(deepBook.fallbackReason, "hot_public_depth_rest_suppressed");
    assert.equal(ticker.cacheRecommendation.action, "coalesce_universe_ticker_scan");
    assert.equal(exchangeInfo.cacheRecommendation.action, "reuse_exchange_info_cache");
    assert.ok(summary.cacheTelemetry.some((item) => item.cacheKey === "universe_ticker_24hr"));
    assert.ok(summary.recommendedActions.some((item) => item.includes("Coalesce universe ticker")));
  });

  await runCheck("request budget summary converts legacy hot REST callers into actionable cache telemetry", async () => {
    const summary = buildRestBudgetGovernorSummary({
      rateLimitState: {
        topRestCallers: {
          "scanner.deep_book": { count: 10, weight: 5000 },
          "futures_public:GET /futures/data/openInterestHist": { count: 7, weight: 7 }
        }
      },
      config: { requestWeightWarnThreshold1m: 4800 },
      streamStatus: { public: { connected: true } }
    });
    const deepBook = summary.topCallers.find((item) => item.caller === "scanner.deep_book");
    const futures = summary.topCallers.find((item) => item.caller.includes("openInterestHist"));
    assert.equal(deepBook.cacheTelemetry.cacheHitRatio, 0);
    assert.equal(deepBook.cacheTelemetry.cacheMisses, 10);
    assert.equal(deepBook.cacheTelemetry.telemetryStatus, "legacy_rest_observed_without_cache_event");
    assert.equal(deepBook.cacheHitRatio, 0);
    assert.equal(deepBook.cacheMisses, 10);
    assert.equal(deepBook.telemetryStatus, "legacy_rest_observed_without_cache_event");
    assert.equal(deepBook.fallbackReason, "legacy_rest_without_cache_event");
    assert.equal(futures.restClass, "public_derivatives_context");
    assert.equal(futures.cacheTelemetry.cacheKey, "futures_public_context");
    assert.equal(futures.cacheTelemetry.cacheHitRatio, 0);
    assert.ok(summary.recommendedActions.some((item) => item.includes("futures-public context")));
  });

  await runCheck("rest architecture static scan classifies code callers", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-rest-scan-"));
    const srcDir = path.join(projectRoot, "src", "runtime");
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, "scanner.js"), `
      async function getKlines() { return []; }
      await client.getKlines("BTCUSDT", "1m", 100);
      await client.getBookTicker("BTCUSDT");
      await client.getExchangeInfo([]);
    `);
    const scan = await scanRestCallers({ projectRoot });
    assert.equal(scan.status, "ready");
    assert.equal(scan.familyCounts.klines, 1);
    assert.equal(scan.familyCounts.book_ticker, 1);
    assert.equal(scan.familyCounts.exchange_info, 1);
    assert.ok(scan.callers.every((caller) => caller.role === "runtime_call" || caller.role === "reference"));
  });

  await runCheck("rest architecture static scan ignores generated dist directories", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-rest-scan-dist-"));
    await fs.mkdir(path.join(projectRoot, "src", "runtime"), { recursive: true });
    await fs.mkdir(path.join(projectRoot, "src", "dist-new-20260508-214435"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, "src", "runtime", "scanner.js"),
      "await client.getKlines(\"BTCUSDT\", \"1m\", 100);\n"
    );
    await fs.writeFile(
      path.join(projectRoot, "src", "dist-new-20260508-214435", "scanner.js"),
      "await client.getBookTicker(\"BTCUSDT\");\n"
    );
    const scan = await scanRestCallers({ projectRoot });
    assert.equal(scan.familyCounts.klines, 1);
    assert.equal(scan.familyCounts.book_ticker || 0, 0);
    assert.equal(scan.callers.some((caller) => caller.file.includes("dist-new")), false);
  });
}
