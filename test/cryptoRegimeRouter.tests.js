import { routeCryptoMarketRegime, CRYPTO_MARKET_REGIMES } from "../src/runtime/cryptoRegimeRouter.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerCryptoRegimeRouterTests({ runCheck, assert }) {
  await runCheck("crypto regime router detects BTC-led trend", async () => {
    const summary = routeCryptoMarketRegime({
      marketState: { riskOffScore: 0.1 },
      trendState: { trendStrength: 0.72, direction: "up" },
      leadershipContext: { leader: "BTC", btcLeadershipScore: 0.8 },
      orderbookDelta: { spreadBps: 6, depthConfidence: 0.8 },
      features: { emaSlopeScore: 0.7, donchianBreakoutScore: 0.5, choppinessIndex: 38 }
    });
    assert.equal(summary.regime, CRYPTO_MARKET_REGIMES.BTC_LED_TREND);
    assert.ok(summary.allowedSetupFamilies.includes("trend_following"));
    assert.ok(summary.blockedSetupFamilies.includes("range_grid"));
    assert.equal(summary.entryPermissionChanged, false);
    assert.equal(summary.hardSafetyUnchanged, true);
  });

  await runCheck("crypto regime router detects ETH-led trend", async () => {
    const summary = routeCryptoMarketRegime({
      marketState: { riskOffScore: 0.08 },
      trendState: { trendStrength: 0.68, direction: "up" },
      leadershipContext: { leader: "ETH", ethLeadershipScore: 0.79 },
      orderbookDelta: { spreadBps: 5, depthConfidence: 0.82 },
      features: { emaSlopeScore: 0.6, donchianBreakoutScore: 0.4 }
    });
    assert.equal(summary.regime, CRYPTO_MARKET_REGIMES.ETH_LED_TREND);
    assert.ok(summary.allowedSetupFamilies.includes("breakout_retest"));
    assert.ok(Number.isFinite(summary.sizeMultiplier));
  });

  await runCheck("crypto regime router detects alt rotation", async () => {
    const summary = routeCryptoMarketRegime({
      marketState: { riskOffScore: 0.18 },
      trendState: { trendStrength: 0.36 },
      leadershipContext: { altRotationScore: 0.72 },
      universeSummary: { altBreadthScore: 0.74 },
      orderbookDelta: { spreadBps: 10, depthConfidence: 0.7 },
      features: { squeezeExpansionScore: 0.5 }
    });
    assert.equal(summary.regime, CRYPTO_MARKET_REGIMES.ALT_ROTATION);
    assert.ok(summary.allowedSetupFamilies.includes("market_structure"));
    assert.ok(summary.warnings.includes("squeeze_expansion_watch_only"));
  });

  await runCheck("crypto regime router defaults ambiguous data to degraded range chop", async () => {
    const summary = routeCryptoMarketRegime({});
    assert.equal(summary.regime, CRYPTO_MARKET_REGIMES.RANGE_CHOP);
    assert.equal(summary.status, "degraded");
    assert.ok(summary.warnings.includes("missing_crypto_regime_inputs"));
    assert.ok(summary.confidence < 1);
  });

  await runCheck("crypto regime router detects liquidity vacuum", async () => {
    const summary = routeCryptoMarketRegime({
      marketState: { riskOffScore: 0.2 },
      trendState: { trendStrength: 0.6 },
      leadershipContext: { leader: "BTC", btcLeadershipScore: 0.8 },
      orderbookDelta: { spreadBps: 58, depthConfidence: 0.18, thinBookScore: 0.82 },
      features: { spreadPercentile: 0.95, slippageConfidence: 0.25 }
    });
    assert.equal(summary.regime, CRYPTO_MARKET_REGIMES.LIQUIDITY_VACUUM);
    assert.ok(summary.blockedSetupFamilies.includes("breakout"));
    assert.ok(summary.confidencePenalty > 0.2);
    assert.ok(summary.sizeMultiplier < 0.5);
  });

  await runCheck("crypto regime router detects crash risk before trend", async () => {
    const summary = routeCryptoMarketRegime({
      marketState: { riskOffScore: 0.84, crashRiskScore: 0.8 },
      trendState: { trendStrength: 0.75 },
      leadershipContext: { leader: "BTC", btcLeadershipScore: 0.9 },
      orderbookDelta: { spreadBps: 12, depthConfidence: 0.6 },
      derivativesContext: { liquidationRisk: 0.7 },
      volatilitySummary: { stressScore: 0.9 }
    });
    assert.equal(summary.regime, CRYPTO_MARKET_REGIMES.CRASH_RISK);
    assert.ok(summary.blockedSetupFamilies.includes("trend_following"));
    assert.ok(summary.allowedSetupFamilies.includes("protective_exit_review"));
  });

  await runCheck("crypto regime router detects news shock before other regimes", async () => {
    const summary = routeCryptoMarketRegime({
      marketState: { riskOffScore: 0.1 },
      trendState: { trendStrength: 0.72 },
      leadershipContext: { leader: "ETH", ethLeadershipScore: 0.8 },
      orderbookDelta: { spreadBps: 8, depthConfidence: 0.75 },
      newsSummary: { activeShock: true, shockLevel: 0.92 }
    });
    assert.equal(summary.regime, CRYPTO_MARKET_REGIMES.NEWS_SHOCK);
    assert.ok(summary.blockedSetupFamilies.includes("mean_reversion"));
    assert.equal(summary.diagnosticsOnly, true);
  });

  await runCheck("crypto regime router detects range chop with high choppiness", async () => {
    const summary = routeCryptoMarketRegime({
      marketState: { choppinessIndex: 72, riskOffScore: 0.1 },
      trendState: { trendStrength: 0.12 },
      leadershipContext: { leader: "none" },
      orderbookDelta: { spreadBps: 8, depthConfidence: 0.8 },
      features: { choppinessIndex: 72, rsi14: 34, mfi14: 32, stochRsiK: 20 }
    });
    assert.equal(summary.regime, CRYPTO_MARKET_REGIMES.RANGE_CHOP);
    assert.ok(summary.allowedSetupFamilies.includes("mean_reversion"));
    assert.ok(summary.warnings.includes("choppiness_high"));
  });

  await runCheck("dashboard normalizer keeps crypto regime router summary optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.cryptoRegimeRouterSummary.status, "unavailable");
    const nested = normalizeDashboardSnapshotPayload({
      marketContext: {
        cryptoRegimeRouterSummary: { status: "ready", regime: CRYPTO_MARKET_REGIMES.ALT_ROTATION }
      }
    });
    assert.equal(nested.cryptoRegimeRouterSummary.regime, CRYPTO_MARKET_REGIMES.ALT_ROTATION);
  });
}
