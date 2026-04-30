import { BinanceClient } from "../src/binance/client.js";
import { TradingBot } from "../src/runtime/tradingBot.js";
import { buildRestArchitectureAudit, scanRestCallers } from "../src/runtime/restArchitectureAudit.js";

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

    assert.equal(attempts, 1);
    assert.deepEqual(first, second);
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
}
