import { buildIndicatorFeaturePack } from "../src/strategy/indicatorFeatureRegistry.js";
import { computeMarketFeatures } from "../src/strategy/indicators.js";
import { buildFeatureVector } from "../src/strategy/features.js";
import { evaluateStrategySet } from "../src/strategy/strategyRouter.js";

function makeCandles({
  count = 90,
  start = "2026-01-01T00:00:00.000Z",
  intervalMinutes = 60,
  priceAt = (index) => 100 + index * 0.1,
  volumeAt = () => 1000
} = {}) {
  const startMs = Date.parse(start);
  return Array.from({ length: count }, (_, index) => {
    const close = priceAt(index);
    const open = index === 0 ? close : priceAt(index - 1);
    const high = Math.max(open, close) * 1.002;
    const low = Math.min(open, close) * 0.998;
    return {
      openTime: startMs + index * intervalMinutes * 60_000,
      open,
      high,
      low,
      close,
      volume: volumeAt(index)
    };
  });
}

function makeTrendExpansionCandles() {
  return makeCandles({
    count: 96,
    priceAt: (index) => {
      if (index < 62) {
        return 100 + Math.sin(index / 4) * 0.08;
      }
      return 100 + (index - 62) * 0.42 + Math.sin(index / 2) * 0.05;
    },
    volumeAt: (index) => index === 95 ? 2500 : 900 + (index % 8) * 20
  });
}

function makeBullishDivergenceCandles() {
  return makeCandles({
    count: 86,
    priceAt: (index) => {
      if (index < 32) {
        return 105 - index * 0.08;
      }
      if (index < 50) {
        return 102.5 + (index - 32) * 0.12;
      }
      if (index < 68) {
        return 104.8 - (index - 50) * 0.36;
      }
      if (index === 68) {
        return 98.1;
      }
      return 98.1 + (index - 68) * 0.22;
    },
    volumeAt: (index) => 1000 + (index % 5) * 30
  });
}

function makeHighVolOfVolCandles() {
  return makeCandles({
    count: 90,
    priceAt: (index) => {
      const baseline = 100 + index * 0.03;
      const alternating = index < 50 ? Math.sin(index / 5) * 0.08 : Math.sin(index) * (index % 2 === 0 ? 1.6 : 0.9);
      return baseline + alternating;
    },
    volumeAt: (index) => 900 + (index % 6) * 25
  });
}

function buildFreshPack(candles) {
  const lastOpenTime = candles.at(-1)?.openTime || Date.parse("2026-01-01T00:00:00.000Z");
  return buildIndicatorFeaturePack(candles, { now: new Date(lastOpenTime + 15 * 60_000) });
}

function baseRouterContext({ botMode = "paper", paperScoring = false } = {}) {
  const candles = makeTrendExpansionCandles();
  const market = computeMarketFeatures(candles);
  return {
    symbol: "BTCUSDT",
    botMode,
    config: {
      botMode,
      enableRangeGridStrategy: true,
      enableIndicatorFeatureRegistry: true,
      enableIndicatorRegistryPaperScoring: paperScoring
    },
    marketSnapshot: {
      market,
      book: {
        spreadBps: 4,
        depthConfidence: 0.7,
        replenishmentScore: 0.4,
        queueRefreshScore: 0.35,
        resilienceScore: 0.3,
        bookPressure: 0.25,
        weightedDepthImbalance: 0.2
      },
      stream: { tradeFlowImbalance: 0.25 }
    },
    regimeSummary: { regime: "trend" },
    newsSummary: { riskScore: 0.05, sentimentScore: 0.15, reliabilityScore: 0.8, confidence: 0.75 },
    announcementSummary: { riskScore: 0 },
    marketStructureSummary: { signalScore: 0.25, fundingRate: 0, openInterestChangePct: 0.01 },
    marketSentimentSummary: { riskScore: 0.05, contrarianScore: 0.05 },
    volatilitySummary: { riskScore: 0.1 },
    calendarSummary: { riskScore: 0 },
    marketConditionSummary: { conditionId: "trend_continuation" },
    sessionSummary: { session: "us" },
    exchangeCapabilities: { shortingEnabled: false }
  };
}

export async function registerIndicatorFeatureRegistryTests({ runCheck, assert }) {
  await runCheck("indicator feature registry computes EMA ribbon compression and expansion", async () => {
    const pack = buildFreshPack(makeTrendExpansionCandles());
    assert.equal(pack.status, "ready");
    assert.ok(pack.usedIndicators.includes("ema_ribbon"));
    assert.ok(pack.features.emaRibbonBullishScore > pack.features.emaRibbonBearishScore);
    assert.ok(pack.features.emaRibbonExpansionScore > 0);
    assert.ok(pack.features.emaRibbonCompressionScore >= 0 && pack.features.emaRibbonCompressionScore <= 1);
  });

  await runCheck("indicator feature registry computes VWAP bands with bounded position", async () => {
    const pack = buildFreshPack(makeTrendExpansionCandles());
    assert.ok(Number.isFinite(pack.features.vwapBandWidthPct));
    assert.ok(pack.features.vwapBandWidthPct > 0);
    assert.ok(pack.features.vwapBandPosition <= 1);
    assert.ok(pack.features.vwapBandPosition >= -1);
  });

  await runCheck("indicator feature registry detects RSI divergence from deterministic candles", async () => {
    const pack = buildFreshPack(makeBullishDivergenceCandles());
    assert.ok(pack.features.rsiBullishDivergenceScore > 0.05);
    assert.ok(pack.features.rsiBullishDivergenceScore >= pack.features.rsiBearishDivergenceScore);
  });

  await runCheck("indicator feature registry detects MACD histogram divergence from deterministic candles", async () => {
    const pack = buildFreshPack(makeBullishDivergenceCandles());
    assert.ok(pack.features.macdBullishDivergenceScore > 0.02);
    assert.ok(pack.features.macdBullishDivergenceScore >= pack.features.macdBearishDivergenceScore);
  });

  await runCheck("indicator feature registry computes relative volume by UTC hour", async () => {
    const candles = makeCandles({
      count: 97,
      priceAt: (index) => 100 + index * 0.04,
      volumeAt: (index) => index === 96 ? 2400 : 1000 + (index % 24 === 0 ? 30 : 0)
    });
    const pack = buildFreshPack(candles);
    assert.ok(pack.features.relativeVolumeByUtcHour > 1.8);
    assert.ok(pack.features.relativeVolumeByUtcHourZ > 0);
  });

  await runCheck("indicator feature registry scores volatility-of-volatility above quiet market", async () => {
    const quietCandles = makeCandles({ count: 90, priceAt: (index) => 100 + index * 0.03 });
    const quiet = buildFreshPack(quietCandles);
    const noisy = buildFreshPack(makeHighVolOfVolCandles());
    assert.ok(noisy.features.volatilityOfVolatilityScore > quiet.features.volatilityOfVolatilityScore);
  });

  await runCheck("indicator feature registry safely reports warmup and missing features", async () => {
    const pack = buildFreshPack(makeCandles({ count: 20 }));
    assert.equal(pack.status, "warmup");
    assert.ok(pack.missingIndicators.length > 0);
    assert.ok(pack.quality.missingFeatures.length > 0);
  });

  await runCheck("indicator registry features are exposed through market features and feature vector", async () => {
    const marketFeatures = computeMarketFeatures(makeTrendExpansionCandles());
    const vector = buildFeatureVector({
      symbolStats: {},
      marketFeatures,
      bookFeatures: {},
      newsSummary: {},
      regimeSummary: { regime: "trend" },
      strategySummary: { family: "trend_following" }
    });
    assert.equal(marketFeatures.indicatorRegistry.packId, "phase1_core_indicators");
    assert.ok(Number.isFinite(vector.ema_ribbon_expansion));
    assert.ok(Number.isFinite(vector.vwap_band_position));
    assert.ok(Number.isFinite(vector.rsi_divergence));
    assert.ok(Number.isFinite(vector.macd_histogram_divergence));
    assert.ok(Number.isFinite(vector.relative_volume_utc_hour));
    assert.ok(Number.isFinite(vector.volatility_of_volatility));
  });

  await runCheck("strategy router applies indicator registry scoring only in paper mode", async () => {
    const disabled = evaluateStrategySet(baseRouterContext({ botMode: "paper", paperScoring: false }));
    const paper = evaluateStrategySet(baseRouterContext({ botMode: "paper", paperScoring: true }));
    const live = evaluateStrategySet(baseRouterContext({ botMode: "live", paperScoring: true }));
    assert.equal(disabled.indicatorRegistry.paperScoringEnabled, false);
    assert.equal(paper.indicatorRegistry.paperScoringEnabled, true);
    assert.equal(live.indicatorRegistry.paperScoringEnabled, false);
    assert.ok(paper.strategyMap.trend_following.metrics.indicatorRegistry.applied);
    assert.ok(!live.strategyMap.trend_following.metrics.indicatorRegistry.applied);
    assert.ok(paper.strategyMap.trend_following.fitScore >= disabled.strategyMap.trend_following.fitScore);
    assert.equal(live.strategyMap.trend_following.fitScore, disabled.strategyMap.trend_following.fitScore);
  });
}
