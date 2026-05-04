import { buildStablecoinRisk } from "../src/market/stablecoinRisk.js";
import { routeCryptoMarketRegime, CRYPTO_MARKET_REGIMES } from "../src/runtime/cryptoRegimeRouter.js";
import { buildSafetySnapshot } from "../src/runtime/safetySnapshot.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerStablecoinRiskTests({ runCheck, assert }) {
  const now = "2026-05-04T12:00:00.000Z";

  await runCheck("stablecoin risk reports normal peg without live relief", async () => {
    const summary = buildStablecoinRisk({
      now,
      quoteAssets: ["USDT", "USDC"],
      priceSources: {
        USDT: { price: 1.0002, updatedAt: now, source: "reference" },
        USDC: { price: 0.9998, updatedAt: now, source: "reference" }
      }
    });

    assert.equal(summary.stablecoinRisk, "normal");
    assert.equal(summary.manualReviewRecommended, false);
    assert.equal(summary.entryPenalty, 0);
    assert.equal(summary.safety.forceSellAllowed, false);
    assert.equal(summary.safety.forceUnlockAllowed, false);
    assert.equal(summary.safety.liveThresholdReliefAllowed, false);
  });

  await runCheck("stablecoin risk flags mild depeg and quote spread stress", async () => {
    const summary = buildStablecoinRisk({
      now,
      quoteAssets: ["USDT"],
      priceSources: { USDT: { price: 0.9978, updatedAt: now } },
      spreadSources: { USDT: { spreadBps: 22, volumeZ: 3.4 } }
    });

    assert.equal(summary.stablecoinRisk, "mild");
    assert.ok(summary.affectedQuotes.includes("USDT"));
    assert.ok(summary.depegBps >= 20);
    assert.ok(summary.warnings.includes("stablecoin_spread_widening"));
    assert.ok(summary.warnings.includes("abnormal_stablecoin_volume"));
    assert.ok(summary.entryPenalty > 0);
  });

  await runCheck("stablecoin risk recommends manual review on severe depeg headline", async () => {
    const summary = buildStablecoinRisk({
      now,
      quoteAssets: ["FDUSD"],
      priceSources: { FDUSD: { price: 0.987, updatedAt: now } },
      headlines: [{ title: "FDUSD redemption halt sparks depeg concerns" }]
    });

    assert.equal(summary.stablecoinRisk, "severe");
    assert.equal(summary.manualReviewRecommended, true);
    assert.ok(summary.warnings.includes("depeg_or_redemption_headline"));
    assert.ok(summary.entryPenalty >= 0.45);
  });

  await runCheck("stablecoin risk handles missing data without making live safer claims", async () => {
    const summary = buildStablecoinRisk({ now, quoteAssets: ["USDT"] });

    assert.equal(summary.status, "degraded");
    assert.equal(summary.stablecoinRisk, "unknown");
    assert.ok(summary.warnings.includes("missing_price_source"));
    assert.ok(summary.entryPenalty > 0);
    assert.equal(summary.safety.forceUnlockAllowed, false);
  });

  await runCheck("stablecoin risk flags stale price source", async () => {
    const summary = buildStablecoinRisk({
      now,
      quoteAssets: ["USDC"],
      priceSources: { USDC: { price: 1, updatedAt: "2026-05-04T11:30:00.000Z" } },
      config: { stablecoinRiskStaleMs: 5 * 60_000 }
    });

    assert.equal(summary.manualReviewRecommended, true);
    assert.ok(summary.warnings.includes("stale_price_source"));
    assert.ok(summary.staleSources.some((source) => source.startsWith("USDC")));
  });

  await runCheck("stablecoin risk feeds safety snapshot and crypto regime diagnostics only", async () => {
    const stablecoinRiskSummary = buildStablecoinRisk({
      now,
      quoteAssets: ["USDT"],
      priceSources: { USDT: { price: 0.989, updatedAt: now } }
    });
    const safety = buildSafetySnapshot({
      config: { operatorMode: "active" },
      operatorMode: { mode: "active" },
      liveReadiness: { status: "ready" },
      stablecoinRiskSummary
    });
    const regime = routeCryptoMarketRegime({
      marketState: { riskOffScore: 0.1 },
      trendState: { trendStrength: 0.8 },
      leadershipContext: { leader: "BTC", btcLeadershipScore: 0.9 },
      orderbookDelta: { spreadBps: 4, depthConfidence: 0.8 },
      stablecoinRiskSummary
    });
    const dashboard = normalizeDashboardSnapshotPayload({ marketContext: { stablecoinRiskSummary } });

    assert.ok(safety.topRisks.includes("stablecoin_quote_asset_risk"));
    assert.equal(regime.regime, CRYPTO_MARKET_REGIMES.CRASH_RISK);
    assert.ok(regime.warnings.includes("stablecoin_quote_asset_stress"));
    assert.equal(regime.entryPermissionChanged, false);
    assert.equal(dashboard.stablecoinRiskSummary.stablecoinRisk, stablecoinRiskSummary.stablecoinRisk);
  });
}
