import { buildFeatureVector } from "../src/strategy/features.js";
import { evaluateStrategySet } from "../src/strategy/strategyRouter.js";

function buildContext(makeConfig, overrides = {}) {
  const market = {
    close: 100.28,
    priorRangeHigh: 100,
    rangeHigh: 100,
    donchianUpper: 100,
    donchianLower: 95,
    donchianBreakoutPct: 0.004,
    breakoutPct: 0.004,
    breakoutFollowThroughScore: 0.78,
    volumeZ: 1.9,
    relativeVolumeByUtcHour: 1.48,
    volumeAcceptanceScore: 0.78,
    closeLocation: 0.68,
    closeLocationQuality: 0.72,
    bosStrengthScore: 0.72,
    bullishBosActive: 1,
    structureBreakScore: 0.68,
    fvgRespectScore: 0.62,
    cvdConfirmationScore: 0.72,
    cvdDivergenceScore: 0.12,
    orderflowToxicityScore: 0.18,
    atrPct: 0.01,
    realizedVolPct: 0.012,
    trendStrength: 0.01,
    emaGap: 0.003,
    momentum20: 0.006,
    adx14: 27,
    dmiSpread: 0.14,
    trendPersistence: 0.7,
    trendQualityScore: 0.7,
    swingStructureScore: 0.62,
    relativeStrengthVsBtc: 0.006,
    relativeStrengthVsEth: 0.004,
    anchoredVwapAcceptanceScore: 0.66,
    bearishPatternScore: 0.04,
    bullishPatternScore: 0.42,
    ...overrides.market
  };
  const book = {
    mid: market.close,
    ask: market.close + 0.01,
    bid: market.close - 0.01,
    spreadBps: 4.5,
    bookPressure: 0.28,
    weightedDepthImbalance: 0.2,
    depthConfidence: 0.82,
    replenishmentScore: 0.36,
    queueRefreshScore: 0.32,
    resilienceScore: 0.44,
    entryEstimate: { expectedImpactBps: 4 },
    ...overrides.book
  };
  return {
    botMode: overrides.botMode || "paper",
    config: makeConfig({
      botMode: overrides.botMode || "paper",
      enableBreakoutRetestStrategy: true,
      breakoutRetestPaperOnly: true,
      enableRangeGridStrategy: false,
      ...overrides.config
    }),
    marketSnapshot: {
      market,
      book,
      stream: {
        tradeFlowImbalance: 0.24,
        ...(overrides.stream || {})
      }
    },
    streamFeatures: {
      tradeFlowImbalance: 0.24,
      ...(overrides.stream || {})
    },
    regimeSummary: { regime: "breakout", ...(overrides.regimeSummary || {}) },
    marketConditionSummary: { conditionId: "breakout_release", ...(overrides.marketConditionSummary || {}) },
    newsSummary: { riskScore: 0 },
    announcementSummary: { riskScore: 0 },
    calendarSummary: { riskScore: 0 },
    marketSentimentSummary: { riskScore: 0 },
    volatilitySummary: { riskScore: 0 },
    marketStructureSummary: {},
    exchangeCapabilitiesSummary: {},
    qualityQuorumSummary: {},
    venueConfirmationSummary: {}
  };
}

export async function registerBreakoutRetestStrategyTests({ runCheck, assert, makeConfig }) {
  await runCheck("breakout retest selects clean retest reclaim in paper", () => {
    const context = buildContext(makeConfig);
    const summary = evaluateStrategySet(context);
    const retest = summary.strategyMap.breakout_retest;
    assert.equal(summary.activeStrategy, "breakout_retest");
    assert.ok(retest, "breakout retest strategy should be present when enabled");
    assert.ok(retest.metrics.breakoutLevel > 0);
    assert.ok(retest.metrics.retestDistancePct < 0.006);
    assert.ok(retest.metrics.reclaimScore > 0.6);
    assert.ok(retest.metrics.retestQuality > 0.55);
    assert.deepEqual(retest.blockers, []);

    const features = buildFeatureVector({
      symbolStats: {},
      marketFeatures: context.marketSnapshot.market,
      bookFeatures: context.marketSnapshot.book,
      strategySummary: summary,
      regimeSummary: { regime: "breakout" },
      newsSummary: {},
      now: new Date("2026-01-01T16:00:00.000Z")
    });
    assert.equal(features.strategy_breakout_retest, 1);
    assert.ok(features.breakout_retest_quality > 1.5);
    assert.ok(features.breakout_retest_reclaim > 1.5);
  });

  await runCheck("breakout retest flags fake breakout risk", () => {
    const summary = evaluateStrategySet(buildContext(makeConfig, {
      market: {
        close: 99.72,
        cvdDivergenceScore: 0.84,
        orderflowToxicityScore: 0.82,
        closeLocation: 0.42,
        closeLocationQuality: 0.28,
        bearishPatternScore: 0.58
      },
      book: {
        mid: 99.72,
        ask: 99.73,
        bid: 99.71,
        bookPressure: -0.34,
        weightedDepthImbalance: -0.26,
        depthConfidence: 0.42,
        spreadBps: 16
      },
      stream: { tradeFlowImbalance: -0.32 }
    }));
    const retest = summary.strategyMap.breakout_retest;
    assert.ok(retest.blockers.includes("reclaim_not_confirmed"));
    assert.ok(retest.blockers.includes("bearish_orderflow") || retest.blockers.includes("false_breakout_risk"));
    assert.ok(retest.metrics.falseBreakoutRisk > 0.35);
  });

  await runCheck("breakout retest blocks no-retest chase entries", () => {
    const summary = evaluateStrategySet(buildContext(makeConfig, {
      market: {
        close: 104,
        priorRangeHigh: 100,
        rangeHigh: 100,
        donchianUpper: 100,
        donchianBreakoutPct: 0.04,
        breakoutPct: 0.04,
        closeLocation: 0.94,
        breakoutFollowThroughScore: 0.88,
        volumeZ: 2.6,
        relativeVolumeByUtcHour: 1.8
      },
      book: {
        mid: 104,
        ask: 104.01,
        bid: 103.99
      }
    }));
    const retest = summary.strategyMap.breakout_retest;
    assert.ok(retest.blockers.includes("no_retest_chase_block"));
    assert.ok(retest.metrics.retestDistancePct > retest.metrics.maxRetestDistancePct);
  });

  await runCheck("breakout retest remains paper-only when configured", () => {
    const summary = evaluateStrategySet(buildContext(makeConfig, { botMode: "live" }));
    assert.equal(summary.strategyMap.breakout_retest, undefined);
  });
}
