import { buildWatchlistCoverageBalancer } from "../src/runtime/watchlistCoverageBalancer.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function sample(symbol, count, extra = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${symbol}-${index}`,
    symbol,
    cluster: extra.cluster || "majors",
    regime: extra.regime || "trend",
    strategyFamily: extra.strategyFamily || "breakout"
  }));
}

export async function registerWatchlistCoverageBalancerTests({ runCheck, assert }) {
  await runCheck("watchlist coverage balancer handles empty watchlist", async () => {
    const summary = buildWatchlistCoverageBalancer({ watchlist: [], samples: [] });
    assert.equal(summary.status, "empty_watchlist");
    assert.ok(summary.warnings.includes("empty_watchlist"));
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("watchlist coverage balancer detects over-sampled symbol", async () => {
    const summary = buildWatchlistCoverageBalancer({
      watchlist: ["BTCUSDT", "ETHUSDT"],
      samples: [...sample("BTCUSDT", 30), ...sample("ETHUSDT", 2)],
      targetSamplesPerSymbol: 5,
      oversampleMultiplier: 2
    });
    assert.ok(summary.overSampledSymbols.includes("BTCUSDT"));
    assert.ok(summary.warnings.includes("oversampled_symbols_detected"));
  });

  await runCheck("watchlist coverage balancer suggests under-sampled healthy symbol for paper scan only", async () => {
    const summary = buildWatchlistCoverageBalancer({
      watchlist: ["BTCUSDT", "SOLUSDT"],
      samples: sample("BTCUSDT", 12),
      symbolHealth: {
        SOLUSDT: { dataQualityScore: 0.9, status: "healthy" }
      },
      targetSamplesPerSymbol: 5
    });
    assert.ok(summary.underSampledSymbols.includes("SOLUSDT"));
    assert.equal(summary.paperScanEmphasis[0].symbol, "SOLUSDT");
    assert.equal(summary.paperOnly, true);
    assert.equal(summary.liveUniverseChanged, false);
  });

  await runCheck("watchlist coverage balancer blocks low data quality from paper trust", async () => {
    const summary = buildWatchlistCoverageBalancer({
      watchlist: ["XRPUSDT"],
      samples: [],
      symbolHealth: {
        XRPUSDT: { dataQualityScore: 0.3, staleSources: ["candles"] }
      },
      targetSamplesPerSymbol: 5
    });
    const row = summary.symbols.find((item) => item.symbol === "XRPUSDT");
    assert.equal(row.trustedForPaperLearning, false);
    assert.equal(row.paperScanSuggested, false);
    assert.ok(summary.lowTrustSymbols.includes("XRPUSDT"));
  });

  await runCheck("watchlist coverage balancer keeps live universe unchanged", async () => {
    const summary = buildWatchlistCoverageBalancer({
      botMode: "live",
      watchlist: ["ADAUSDT"],
      samples: [],
      symbolHealth: { ADAUSDT: { dataQualityScore: 0.95 } }
    });
    assert.equal(summary.diagnosticsOnly, true);
    assert.equal(summary.paperOnly, false);
    assert.equal(summary.liveUniverseChanged, false);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("watchlist coverage dashboard fallback is safe", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.watchlistCoverageSummary.status, "empty_watchlist");
    const summary = buildWatchlistCoverageBalancer({
      watchlist: ["BNBUSDT"],
      samples: sample("BNBUSDT", 1),
      targetSamplesPerSymbol: 2
    });
    const normalized = normalizeDashboardSnapshotPayload({ watchlistCoverageSummary: summary });
    assert.equal(normalized.watchlistCoverageSummary.watchlistCount, 1);
    assert.equal(normalized.watchlistCoverageSummary.liveUniverseChanged, false);
  });
}
