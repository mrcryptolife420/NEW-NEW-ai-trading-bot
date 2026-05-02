import { evaluateStrategySet } from "../src/strategy/strategyRouter.js";

function baseContext(makeConfig, overrides = {}) {
  const market = {
    close: 101.2,
    vwapGapPct: 0.0025,
    anchoredVwapGapPct: 0.0018,
    emaGap: 0.0035,
    emaTrendScore: 0.72,
    emaTrendSlopePct: 0.003,
    emaRibbonCompressionScore: 0.56,
    vwapBandPosition: -0.18,
    pullbackDepthPct: 0.009,
    localLow: 100.2,
    swingLowPrice: 100.1,
    closeLocation: 0.68,
    closeLocationQuality: 0.72,
    anchoredVwapAcceptanceScore: 0.74,
    anchoredVwapRejectionScore: 0.16,
    volumeAcceptanceScore: 0.66,
    breakoutFollowThroughScore: 0.58,
    obvSlope: 0.18,
    cvdTrendAlignment: 0.36,
    liquiditySweepScore: 0.28,
    bullishSweepScore: 0.35,
    trendPersistence: 0.76,
    trendMaturityScore: 0.45,
    trendExhaustionScore: 0.22,
    adx14: 28,
    dmiSpread: 0.16,
    supertrendDirection: 1,
    supertrendDistancePct: 0.005,
    momentum20: 0.006,
    trendStrength: 0.012,
    swingStructureScore: 0.64,
    relativeStrengthVsBtc: 0.004,
    relativeStrengthVsEth: 0.003,
    downsideRealizedVolPct: 0.008,
    upsideRealizedVolPct: 0.014,
    rsi14: 48,
    priceZScore: -0.12,
    volumeZ: 1.1,
    bearishPatternScore: 0.04,
    bullishPatternScore: 0.38,
    ...overrides.market
  };
  const book = {
    mid: market.close,
    bid: market.close - 0.01,
    ask: market.close + 0.01,
    spreadBps: 4.5,
    bookPressure: 0.24,
    weightedDepthImbalance: 0.18,
    replenishmentScore: 0.32,
    queueRefreshScore: 0.28,
    resilienceScore: 0.36,
    depthConfidence: 0.8,
    ...overrides.book
  };
  return {
    botMode: overrides.botMode || "paper",
    config: makeConfig({
      botMode: overrides.botMode || "paper",
      enablePullbackReclaimV2: true,
      enableRangeGridStrategy: false,
      ...overrides.config
    }),
    marketSnapshot: {
      market,
      book,
      stream: { tradeFlowImbalance: 0.26, ...(overrides.stream || {}) },
      timeframes: {
        higher: {
          market: {
            emaTrendScore: 0.75,
            supertrendDirection: 1,
            momentum20: 0.007,
            ...(overrides.higherMarket || {})
          }
        }
      }
    },
    streamFeatures: { tradeFlowImbalance: 0.26, ...(overrides.stream || {}) },
    regimeSummary: { regime: "trend", ...(overrides.regimeSummary || {}) },
    timeframeSummary: {
      enabled: true,
      higherBias: 0.24,
      alignmentScore: 0.72,
      directionAgreement: 0.78,
      ...(overrides.timeframeSummary || {})
    },
    marketStateSummary: {
      trendStateSummary: {
        uptrendScore: 0.82,
        dataConfidenceScore: 0.82,
        phase: "healthy_continuation",
        ...(overrides.trendStateSummary || {})
      }
    },
    marketSentimentSummary: { riskScore: 0.12, ...(overrides.marketSentimentSummary || {}) },
    globalMarketContextSummary: { riskScore: 0.08, btcShockScore: 0.06, ...(overrides.globalMarketContextSummary || {}) },
    onChainLiteSummary: { riskOffScore: 0.08, ...(overrides.onChainLiteSummary || {}) },
    newsSummary: { riskScore: 0 },
    announcementSummary: { riskScore: 0 },
    calendarSummary: { riskScore: 0 },
    volatilitySummary: { riskScore: 0 },
    marketStructureSummary: {},
    exchangeCapabilitiesSummary: {},
    qualityQuorumSummary: {},
    venueConfirmationSummary: {}
  };
}

export async function registerPullbackReclaimV2Tests({ runCheck, assert, makeConfig }) {
  await runCheck("pullback reclaim v2 rewards aligned reclaim pullbacks", () => {
    const summary = evaluateStrategySet(baseContext(makeConfig));
    const strategy = summary.strategyMap.trend_pullback_reclaim;
    assert.ok(strategy.metrics.pullbackDepthPct > 0);
    assert.ok(strategy.metrics.reclaimStrength > 0.55);
    assert.ok(strategy.metrics.htfAlignment > 0.62);
    assert.ok(strategy.metrics.invalidationDistancePct > 0);
    assert.equal(strategy.blockers.includes("pullback_not_to_mean"), false);
    assert.equal(strategy.blockers.includes("failed_reclaim"), false);
    assert.equal(strategy.blockers.includes("btc_shock"), false);
  });

  await runCheck("pullback reclaim v2 blocks failed reclaim and bearish flow", () => {
    const summary = evaluateStrategySet(baseContext(makeConfig, {
      market: {
        close: 100.7,
        vwapGapPct: -0.004,
        anchoredVwapGapPct: -0.005,
        emaGap: -0.002,
        closeLocation: 0.42,
        closeLocationQuality: 0.26,
        anchoredVwapAcceptanceScore: 0.28,
        anchoredVwapRejectionScore: 0.72,
        cvdTrendAlignment: -0.32,
        bearishPatternScore: 0.46
      },
      book: { mid: 100.7, bid: 100.69, ask: 100.71, bookPressure: -0.28 },
      stream: { tradeFlowImbalance: -0.24 }
    }));
    const strategy = summary.strategyMap.trend_pullback_reclaim;
    assert.ok(strategy.blockers.includes("failed_reclaim"));
    assert.ok(strategy.metrics.reclaimStrength < 0.5);
  });

  await runCheck("pullback reclaim v2 blocks BTC shock and high spread", () => {
    const summary = evaluateStrategySet(baseContext(makeConfig, {
      market: {
        btcShockScore: 0.7,
        relativeStrengthVsBtc: -0.035
      },
      globalMarketContextSummary: { riskScore: 0.68, btcShockScore: 0.72 },
      onChainLiteSummary: { riskOffScore: 0.68 },
      book: { spreadBps: 18 }
    }));
    const strategy = summary.strategyMap.trend_pullback_reclaim;
    assert.ok(strategy.blockers.includes("btc_shock"));
    assert.ok(strategy.blockers.includes("spread_too_high_for_pullback"));
  });

  await runCheck("pullback reclaim v2 keeps live/base behavior unchanged when flag is off", () => {
    const summary = evaluateStrategySet(baseContext(makeConfig, {
      botMode: "live",
      config: { enablePullbackReclaimV2: false },
      market: {
        closeLocation: 0.4,
        anchoredVwapRejectionScore: 0.72
      },
      globalMarketContextSummary: { riskScore: 0.8, btcShockScore: 0.8 },
      book: { spreadBps: 20 }
    }));
    const strategy = summary.strategyMap.trend_pullback_reclaim;
    assert.equal(strategy.blockers.includes("failed_reclaim"), false);
    assert.equal(strategy.blockers.includes("btc_shock"), false);
    assert.equal(strategy.blockers.includes("spread_too_high_for_pullback"), false);
    assert.equal(Object.hasOwn(strategy.metrics, "pullbackDepthPct"), false);
  });
}
