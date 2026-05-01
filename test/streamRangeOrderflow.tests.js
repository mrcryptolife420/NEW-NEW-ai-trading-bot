import { buildSymbolRules } from "../src/binance/symbolFilters.js";
import { getMultiHorizonOrderflow, recordAggTrade, resetBuffer } from "../src/market/orderbookDelta.js";
import { RiskManager } from "../src/risk/riskManager.js";
import { buildRestBudgetGovernorSummary } from "../src/runtime/restBudgetGovernor.js";
import { computeMarketFeatures } from "../src/strategy/indicators.js";

function candlesFromCloses(closes = []) {
  return closes.map((close, index) => {
    const open = index ? closes[index - 1] : close;
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.2;
    return {
      openTime: Date.parse("2026-01-01T00:00:00.000Z") + index * 60_000,
      open,
      high,
      low,
      close,
      volume: 100 + index
    };
  });
}

function buildTestRules(symbol = "GRIDUSDT") {
  return buildSymbolRules({
    symbols: [{
      symbol,
      status: "TRADING",
      baseAsset: symbol.replace("USDT", ""),
      quoteAsset: "USDT",
      filters: [
        { filterType: "LOT_SIZE", minQty: "0.0001", maxQty: "100000", stepSize: "0.0001" },
        { filterType: "MIN_NOTIONAL", minNotional: "5" },
        { filterType: "PRICE_FILTER", minPrice: "0.01", maxPrice: "1000000", tickSize: "0.01" }
      ]
    }]
  })[symbol];
}

export async function registerStreamRangeOrderflowTests({ runCheck, assert, makeConfig }) {
  await runCheck("market features expose chop, Hurst and range stability diagnostics", async () => {
    const trending = computeMarketFeatures(candlesFromCloses(Array.from({ length: 80 }, (_, index) => 100 + index * 0.55)));
    const ranging = computeMarketFeatures(candlesFromCloses(Array.from({ length: 80 }, (_, index) => 100 + Math.sin(index / 2) * 1.2)));

    assert.ok(Number.isFinite(trending.choppinessIndex));
    assert.ok(Number.isFinite(trending.hurstExponent));
    assert.ok(Number.isFinite(trending.realizedSkew));
    assert.ok(Number.isFinite(trending.realizedKurtosis));
    assert.ok(ranging.rangeStabilityScore > trending.rangeStabilityScore);
    assert.ok(trending.hurstTrendScore >= 0);
  });

  await runCheck("orderflow v2 exposes agreement, impulse and adverse-selection diagnostics", async () => {
    resetBuffer("OFLOWUSDT");
    const now = Date.now();
    for (let index = 0; index < 36; index += 1) {
      recordAggTrade("OFLOWUSDT", {
        p: 100 + index * 0.001,
        q: 2,
        m: index < 30 ? false : true,
        E: now - (36 - index) * 10_000
      });
    }
    const orderflow = getMultiHorizonOrderflow("OFLOWUSDT", [60, 300, 900, 3600], {
      depthConfidence: 0.22,
      microTrend: 0.0001
    });

    assert.equal(orderflow.status, "ready");
    assert.ok(orderflow.agreementScore >= 0 && orderflow.agreementScore <= 1);
    assert.ok(orderflow.impulse && Number.isFinite(orderflow.impulse.score));
    assert.ok(orderflow.adverseSelectionScore >= orderflow.toxicity.score * 0.5);
    assert.ok(orderflow.horizons["1m"]);
    assert.ok(orderflow.horizons["5m"]);
    assert.ok(orderflow.horizons["15m"]);
    assert.ok(orderflow.horizons["1h"]);
  });

  await runCheck("REST budget SLO marks private order truth as stream-replaceable diagnostics without blocking critical reconcile", async () => {
    const summary = buildRestBudgetGovernorSummary({
      rateLimitState: {
        usedWeight1m: 2200,
        warningActive: false,
        banActive: false,
        backoffActive: false,
        topRestCallers: {
          "live_broker.reconcile.open_orders": { count: 120, weight: 9600 },
          "live_broker.reconcile.recent_trades": { count: 80, weight: 3200 },
          "market_snapshot.depth_fallback": { count: 20, weight: 6000 }
        }
      },
      config: {
        requestWeightWarnThreshold1m: 4800,
        restHotCallerDepthWeightThreshold: 5000,
        restHotCallerPrivateTradeWeightThreshold: 2000
      },
      streamStatus: { publicStreamConnected: true, userStreamConnected: true }
    });

    const privateOrderSlo = summary.budgetSlo.find((item) => item.id === "private_order_truth");
    const openOrdersCaller = summary.topCallers.find((item) => item.caller === "live_broker.reconcile.open_orders");
    assert.equal(privateOrderSlo.status, "hot");
    assert.equal(privateOrderSlo.streamReplacementAvailable, true);
    assert.equal(privateOrderSlo.nextSafeAction, "use_user_stream_order_truth_and_reduce_rest_sanity");
    assert.equal(openOrdersCaller.guarded, false);
    assert.equal(openOrdersCaller.streamReplacementAvailable, true);
    assert.equal(openOrdersCaller.nextSafeAction, "use_user_stream_order_truth_and_reduce_rest_sanity");
  });

  await runCheck("range-grid paper entries are blocked by low stability and trend expansion diagnostics", async () => {
    const manager = new RiskManager(makeConfig({
      botMode: "paper",
      modelThreshold: 0.52,
      minModelConfidence: 0.5
    }));
    const decision = manager.evaluateEntry({
      symbol: "GRIDUSDT",
      score: { probability: 0.59, confidence: 0.62, calibrationConfidence: 0.55, disagreement: 0.03, shouldAbstain: false },
      marketSnapshot: {
        market: {
          realizedVolPct: 0.014,
          atrPct: 0.006,
          bullishPatternScore: 0.18,
          bearishPatternScore: 0.04,
          rangeStabilityScore: 0.22,
          choppinessIndex: 35,
          hurstTrendScore: 0.62,
          rangeWidthPct: 0.012,
          rangeMeanRevertScore: 0.28,
          rangeBoundaryRespectScore: 0.24,
          breakoutFollowThroughScore: 0.58
        },
        book: { mid: 100, bid: 99.95, ask: 100.05, spreadBps: 2, bookPressure: 0.18, depthConfidence: 0.72 }
      },
      newsSummary: { riskScore: 0.04, sentimentScore: 0.04, headlines: [] },
      announcementSummary: { riskScore: 0.02 },
      marketStructureSummary: { signalScore: 0.1, riskScore: 0.12, liquidationTrapRisk: 0.1 },
      marketSentimentSummary: {},
      volatilitySummary: { riskScore: 0.12 },
      calendarSummary: { riskScore: 0.04 },
      committeeSummary: { agreement: 0.72, netScore: 0.12 },
      strategySummary: { family: "range_grid", activeStrategy: "range_grid_reversion", fitScore: 0.61, blockers: [] },
      sessionSummary: { session: "us" },
      selfHealState: {},
      timeframeSummary: { alignmentScore: 0.68, blockerReasons: [], enabled: true },
      pairHealthSummary: { score: 0.7 },
      onChainLiteSummary: {},
      divergenceSummary: { averageScore: 0.04, leadBlocker: { status: "clear" } },
      qualityQuorumSummary: {},
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary: { status: "ready", allowEntries: true, sizeMultiplier: 1 },
      runtime: { openPositions: [], exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] } },
      journal: { trades: [], scaleOuts: [], equitySnapshots: [] },
      balance: { quoteFree: 10000 },
      symbolStats: {},
      portfolioSummary: { reasons: [], advisoryReasons: [], dominantCluster: "alts", maxCorrelation: 0.18 },
      regimeSummary: { regime: "range" },
      marketConditionSummary: { conditionId: "trend_continuation", conditionConfidence: 0.7 },
      thresholdTuningSummary: {},
      parameterGovernorSummary: {},
      capitalLadderSummary: {},
      venueConfirmationSummary: {},
      strategyMetaSummary: {},
      strategyAllocationSummary: {},
      baselineCoreSummary: {},
      paperLearningGuidance: {},
      offlineLearningGuidance: {},
      exchangeCapabilitiesSummary: {},
      symbolRules: buildTestRules("GRIDUSDT")
    });

    assert.ok(decision.reasons.includes("range_grid_low_stability"));
    assert.ok(decision.reasons.includes("range_grid_trend_expansion"));
    assert.equal(decision.allow, false);
  });
}
