import { buildCrossExchangeDivergence } from "../src/market/crossExchangeDivergence.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";
import { buildTradingPathHealth } from "../src/runtime/tradingPathHealth.js";

export async function registerCrossExchangeDivergenceTests({ runCheck, assert }) {
  const now = "2026-05-05T10:00:00.000Z";

  await runCheck("cross-exchange divergence reports aligned prices", async () => {
    const summary = buildCrossExchangeDivergence({
      symbol: "BTCUSDT",
      now,
      marketSnapshot: { book: { bid: 9999, ask: 10001 } },
      referencePrices: [
        { venue: "coinbase", mid: 10002, updatedAt: now },
        { venue: "kraken", mid: 9998, updatedAt: now }
      ]
    });

    assert.equal(summary.priceSanityStatus, "aligned");
    assert.equal(summary.referenceCount, 2);
    assert.ok((summary.divergenceBps || 0) < 5);
    assert.equal(summary.entryPenalty, 0);
    assert.equal(summary.safety.externalProviderRequired, false);
    assert.equal(summary.safety.liveThresholdReliefAllowed, false);
  });

  await runCheck("cross-exchange divergence flags severe Binance-local divergence", async () => {
    const summary = buildCrossExchangeDivergence({
      symbol: "ETHUSDT",
      now,
      binancePrice: { mid: 1100, updatedAt: now },
      referencePrices: [
        { venue: "coinbase", mid: 1000, updatedAt: now },
        { venue: "kraken", mid: 1001, updatedAt: now }
      ],
      config: { crossExchangeSevereDivergenceBps: 55 }
    });

    assert.equal(summary.priceSanityStatus, "diverged");
    assert.ok(summary.warnings.includes("severe_cross_exchange_divergence"));
    assert.equal(summary.manualReviewRecommended, true);
    assert.ok(summary.entryPenalty > 0);
  });

  await runCheck("cross-exchange divergence degrades on stale references", async () => {
    const summary = buildCrossExchangeDivergence({
      symbol: "SOLUSDT",
      now,
      binancePrice: { mid: 100, updatedAt: now },
      referencePrices: [
        { venue: "coinbase", mid: 100.1, updatedAt: "2026-05-05T09:30:00.000Z" },
        { venue: "kraken", mid: 99.9, updatedAt: "2026-05-05T09:30:00.000Z" }
      ],
      config: { crossExchangeReferenceStaleMs: 5 * 60_000 }
    });

    assert.equal(summary.priceSanityStatus, "stale");
    assert.ok(summary.warnings.includes("stale_reference_price"));
    assert.equal(summary.staleSources.length, 2);
  });

  await runCheck("cross-exchange divergence handles missing references without external dependency", async () => {
    const summary = buildCrossExchangeDivergence({
      symbol: "BNBUSDT",
      now,
      binancePrice: { mid: 600, updatedAt: now },
      referencePrices: []
    });

    assert.equal(summary.priceSanityStatus, "unavailable");
    assert.equal(summary.referenceCount, 0);
    assert.ok(summary.warnings.includes("missing_reference_prices"));
    assert.equal(summary.safety.externalProviderRequired, false);
  });

  await runCheck("cross-exchange divergence filters outlier reference prices", async () => {
    const summary = buildCrossExchangeDivergence({
      symbol: "XRPUSDT",
      now,
      binancePrice: { mid: 1, updatedAt: now },
      referencePrices: [
        { venue: "coinbase", mid: 1.001, updatedAt: now },
        { venue: "kraken", mid: 0.999, updatedAt: now },
        { venue: "bad-feed", mid: 1.45, updatedAt: now }
      ],
      config: { crossExchangeOutlierBps: 300 }
    });

    assert.equal(summary.priceSanityStatus, "aligned");
    assert.equal(summary.referenceCount, 2);
    assert.ok(summary.outlierReferences.includes("bad-feed"));
    assert.ok(summary.warnings.includes("outlier_reference_filtered"));
  });

  await runCheck("price sanity summary is dashboard and trading path fallback-safe", async () => {
    const summary = buildCrossExchangeDivergence({
      symbol: "BTCUSDT",
      now,
      binancePrice: { mid: 110, updatedAt: now },
      referencePrices: [
        { venue: "coinbase", mid: 100, updatedAt: now },
        { venue: "kraken", mid: 100, updatedAt: now }
      ]
    });
    const dashboard = normalizeDashboardSnapshotPayload({ marketContext: { priceSanitySummary: summary } });
    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        lastCycleAt: "2026-05-05T09:59:30.000Z",
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-05T09:59:40.000Z" } },
        latestDecisions: [{ symbol: "BTCUSDT" }]
      },
      dashboardSnapshot: { generatedAt: "2026-05-05T09:59:50.000Z", topDecisions: [{ symbol: "BTCUSDT" }] },
      feedSummary: { status: "ready", symbolsRequested: 1, symbolsReady: 1, missingSymbols: [], staleSources: [] },
      readmodelSummary: { status: "ready", rebuiltAt: "2026-05-05T09:58:00.000Z" },
      priceSanitySummary: summary
    });

    assert.equal(dashboard.priceSanitySummary.priceSanityStatus, "diverged");
    assert.ok(health.blockingReasons.includes("price_sanity_diverged"));
    assert.ok(health.staleSources.includes("price_sanity_diverged"));
  });
}
