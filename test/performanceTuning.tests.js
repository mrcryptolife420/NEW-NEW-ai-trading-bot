import { buildSymbolRules } from "../src/binance/symbolFilters.js";
import { MetaDecisionGate } from "../src/ai/metaDecisionGate.js";
import { RiskManager } from "../src/risk/riskManager.js";
import { evaluateStrategySet } from "../src/strategy/strategyRouter.js";
import { TradingBot, compareCandidateExecutionRank } from "../src/runtime/tradingBot.js";

function buildTestRules(symbol = "BCHUSDT") {
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

export async function registerPerformanceTuningTests({
  runCheck,
  assert,
  makeConfig
}) {
  await runCheck("strategy router cools range-grid in breakout release conditions", async () => {
    const summary = evaluateStrategySet({
      symbol: "CHIPUSDT",
      marketSnapshot: {
        market: {
          rsi14: 64,
          vwapGapPct: 0.004,
          realizedVolPct: 0.024,
          momentum5: 0.014,
          momentum20: 0.026,
          emaGap: 0.009,
          emaTrendScore: 0.012,
          bullishPatternScore: 0.28,
          bearishPatternScore: 0.03,
          breakoutPct: 0.014,
          donchianBreakoutPct: 0.015,
          donchianPosition: 0.95,
          volumeZ: 1.9,
          closeLocation: 0.91,
          trendPersistence: 0.82,
          obvSlope: 0.16,
          trendStrength: 0.013,
          bullishBosActive: 1,
          bosStrengthScore: 0.74,
          structureShiftScore: 0.68,
          cvdTrendAlignment: 0.56,
          breakoutFollowThroughScore: 0.66,
          closeLocationQuality: 0.74,
          volumeAcceptanceScore: 0.7,
          anchoredVwapAcceptanceScore: 0.7,
          anchoredVwapRejectionScore: 0.12,
          rangeWidthPct: 0.012,
          rangeBoundaryRespectScore: 0.34,
          rangeMeanRevertScore: 0.28,
          rangeBottomDistancePct: 0.21,
          rangeTopDistancePct: 0.02
        },
        book: {
          bookPressure: 0.36,
          weightedDepthImbalance: 0.28,
          microPriceEdgeBps: 1.2,
          wallImbalance: 0.14,
          spreadBps: 3,
          replenishmentScore: 0.36,
          queueRefreshScore: 0.34,
          resilienceScore: 0.3
        }
      },
      newsSummary: { riskScore: 0.05, sentimentScore: 0.1 },
      announcementSummary: { riskScore: 0.02 },
      calendarSummary: { riskScore: 0.04 },
      marketStructureSummary: {
        signalScore: 0.22,
        crowdingBias: 0.06,
        fundingRate: 0.00002,
        openInterestChangePct: 0.04,
        takerImbalance: 0.24
      },
      marketConditionSummary: { conditionId: "breakout_release" },
      regimeSummary: { regime: "breakout", confidence: 0.84 },
      streamFeatures: { tradeFlowImbalance: 0.2 }
    });

    assert.notEqual(summary.family, "range_grid");
    assert.ok((summary.strategyMap.range_grid_reversion?.fitScore || 0) < 0.45);
    assert.ok(["breakout", "trend_following", "market_structure", "orderflow"].includes(summary.family));
  });

  await runCheck("meta decision gate stops caution-only veto on strong paper alpha setups", async () => {
    const gate = new MetaDecisionGate(makeConfig({
      botMode: "paper",
      metaMinConfidence: 0.42,
      metaCautionScore: 0.53,
      metaBlockScore: 0.44
    }));
    const result = gate.evaluate({
      symbol: "CHIPUSDT",
      score: { probability: 0.8686, confidence: 0.72, calibrationConfidence: 0.54 },
      marketSnapshot: {
        book: { bookPressure: 0.18, depthConfidence: 0.82, entryEstimate: { touchSlippageBps: 0.6 }, spreadBps: 1.8 },
        market: {
          breakoutFollowThroughScore: 0.62,
          vwapGapPct: 0.0032,
          closeLocation: 0.71,
          bollingerPosition: 0.76
        }
      },
      newsSummary: { coverage: 3, reliabilityScore: 0.74, riskScore: 0.06 },
      announcementSummary: { riskScore: 0.03 },
      marketStructureSummary: { signalScore: 0.22, longSqueezeScore: 0.06, crowdingBias: 0.04 },
      marketSentimentSummary: { contrarianScore: 0.06 },
      volatilitySummary: { riskScore: 0.24, ivPremium: 3 },
      calendarSummary: { riskScore: 0.05 },
      committeeSummary: { netScore: 0.16, agreement: 0.72 },
      strategySummary: { activeStrategy: "market_structure_break", family: "breakout", fitScore: 0.69 },
      sessionSummary: { riskScore: 0.12, lowLiquidity: false },
      driftSummary: { severity: 0.03 },
      selfHealState: { lowRiskOnly: false },
      portfolioSummary: { maxCorrelation: 0.24 },
      timeframeSummary: { enabled: true, alignmentScore: 0.74, blockerReasons: [] },
      pairHealthSummary: { score: 0.73, quarantined: false },
      onChainLiteSummary: { liquidityScore: 0.67, stressScore: 0.14, marketBreadthScore: 0.72, majorsMomentumScore: 0.7, altLiquidityScore: 0.66 },
      globalMarketContextSummary: { btcDominanceSignal: "alts_stable", stablecoinSignal: "risk_on", marketMomentum: "bullish", riskRegime: "risk_on", dataQuality: "live" },
      divergenceSummary: { averageScore: 0.08, leadBlocker: { status: "clear" } },
      metaNeuralSummary: { probability: 0.46, confidence: 0.44, contributions: [] },
      journal: { trades: [] },
      nowIso: "2026-04-22T10:00:00.000Z"
    });

    assert.ok(result.action === "pass" || result.thresholdPenalty <= 0.01);
    assert.ok(!result.reasons.includes("meta_followthrough_caution"));
  });

  await runCheck("risk manager does not hard-block paper entries on probe-capable capital recovery", async () => {
    const manager = new RiskManager(makeConfig({
      botMode: "paper",
      modelThreshold: 0.52,
      minModelConfidence: 0.5
    }));
    const decision = manager.evaluateEntry({
      symbol: "BTCUSDT",
      score: { probability: 0.71, confidence: 0.66, calibrationConfidence: 0.62, disagreement: 0.05, shouldAbstain: false },
      marketSnapshot: {
        market: { realizedVolPct: 0.018, atrPct: 0.008, bullishPatternScore: 0.38, bearishPatternScore: 0.05 },
        book: { mid: 100, bid: 99.9, ask: 100.1, spreadBps: 2, bookPressure: 0.28, depthConfidence: 0.8 }
      },
      newsSummary: { riskScore: 0.08, sentimentScore: 0.1, headlines: [] },
      strategySummary: { family: "trend_following", activeStrategy: "ema_trend", fitScore: 0.68 },
      sessionSummary: {},
      selfHealState: {},
      committeeSummary: { agreement: 0.72, netScore: 0.14 },
      timeframeSummary: { alignmentScore: 0.72, blockerReasons: [], enabled: true },
      pairHealthSummary: { score: 0.7 },
      onChainLiteSummary: {},
      divergenceSummary: { averageScore: 0.08, leadBlocker: { status: "clear" } },
      qualityQuorumSummary: {},
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary: {
        status: "recovery",
        allowEntries: false,
        allowProbeEntries: true,
        recoveryMode: true,
        sizeMultiplier: 0.62,
        blockerReasons: ["capital_governor_red_day_streak_watch"]
      },
      runtime: { openPositions: [], exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] } },
      journal: { trades: [], scaleOuts: [], equitySnapshots: [] },
      balance: { quoteFree: 10000 },
      symbolStats: {},
      portfolioSummary: { reasons: [], advisoryReasons: [], dominantCluster: "majors", maxCorrelation: 0.22 },
      regimeSummary: { regime: "trend" },
      thresholdTuningSummary: {},
      parameterGovernorSummary: {},
      capitalLadderSummary: {},
      nowIso: "2026-04-22T11:30:00.000Z",
      venueConfirmationSummary: {},
      strategyMetaSummary: {},
      strategyAllocationSummary: {},
      baselineCoreSummary: {},
      paperLearningGuidance: {},
      offlineLearningGuidance: {},
      exchangeCapabilitiesSummary: {},
      symbolRules: buildTestRules("BTCUSDT")
    });

    assert.ok(!decision.reasons.includes("capital_governor_recovery"));
    assert.ok(!decision.reasons.includes("capital_governor_blocked"));
    assert.equal(decision.capitalGovernorApplied.blocked, false);
  });

  await runCheck("risk manager keeps strong demo-paper near-min setups above executable floor", async () => {
    const manager = new RiskManager(makeConfig({
      botMode: "paper",
      paperExecutionVenue: "binance_demo_spot",
      startingCash: 1000,
      maxPositionFraction: 0.012,
      riskPerTrade: 0.025,
      minTradeUsdt: 10,
      paperMinTradeUsdt: 10,
      modelThreshold: 0.52,
      minModelConfidence: 0.5
    }));
    const decision = manager.evaluateEntry({
      symbol: "BCHUSDT",
      score: { probability: 0.74, rawProbability: 0.79, confidence: 0.68, calibrationConfidence: 0.5, disagreement: 0.04, shouldAbstain: false },
      marketSnapshot: {
        market: {
          realizedVolPct: 0.014,
          atrPct: 0.007,
          bullishPatternScore: 0.35,
          bearishPatternScore: 0.06,
          breakoutFollowThroughScore: 0.6,
          closeLocationQuality: 0.72,
          volumeAcceptanceScore: 0.7,
          anchoredVwapAcceptanceScore: 0.68,
          anchoredVwapRejectionScore: 0.1
        },
        book: { mid: 470, bid: 469.9, ask: 470.1, spreadBps: 2, bookPressure: 0.22, depthConfidence: 0.82 }
      },
      newsSummary: { riskScore: 0.06, sentimentScore: 0.08, headlines: [] },
      announcementSummary: { riskScore: 0.03 },
      marketStructureSummary: { signalScore: 0.18, riskScore: 0.18 },
      marketSentimentSummary: {},
      volatilitySummary: { riskScore: 0.18 },
      calendarSummary: { riskScore: 0.05 },
      strategySummary: { family: "trend_following", activeStrategy: "ema_trend", fitScore: 0.69, blockers: [] },
      sessionSummary: {},
      selfHealState: {},
      committeeSummary: { agreement: 0.76, netScore: 0.16 },
      timeframeSummary: { alignmentScore: 0.72, blockerReasons: [], enabled: true },
      pairHealthSummary: { score: 0.72 },
      onChainLiteSummary: {},
      divergenceSummary: { averageScore: 0.08, leadBlocker: { status: "clear" } },
      qualityQuorumSummary: {},
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary: { status: "ready", allowEntries: true, sizeMultiplier: 1 },
      runtime: { openPositions: [], exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] } },
      journal: { trades: [], scaleOuts: [], equitySnapshots: [] },
      balance: { quoteFree: 1000 },
      symbolStats: {},
      portfolioSummary: { reasons: [], advisoryReasons: [], dominantCluster: "majors", maxCorrelation: 0.18, allocatorScore: 0.6 },
      regimeSummary: { regime: "trend" },
      thresholdTuningSummary: {},
      parameterGovernorSummary: {},
      capitalLadderSummary: {},
      nowIso: "2026-04-22T11:30:00.000Z",
      venueConfirmationSummary: {},
      strategyMetaSummary: {},
      strategyAllocationSummary: {},
      baselineCoreSummary: {},
      paperLearningGuidance: {},
      offlineLearningGuidance: {},
      exchangeCapabilitiesSummary: {},
      symbolRules: buildTestRules("BCHUSDT")
    });

    assert.ok((decision.sizingSummary.effectiveMinTradeUsdt || 0) <= 10.5);
    assert.ok(!decision.reasons.includes("trade_size_below_minimum"));
    assert.ok((decision.quoteAmount || 0) >= (decision.sizingSummary.effectiveMinTradeUsdt || 0));
    assert.ok((decision.sizingSummary.groupedSizing?.groups || []).length >= 4);
    assert.ok((decision.sizingSummary.dominantGroupDrags || []).length >= 1);
  });

  await runCheck("missed-trade tuning softens targeted paper bad-veto blockers more aggressively", async () => {
    const manager = new RiskManager(makeConfig({ botMode: "paper" }));
    const tuning = manager.resolveMissedTradeTuning({
      status: "priority",
      actionClass: "scoped_soften",
      confidence: 0.74,
      topBlocker: "meta_followthrough_caution",
      thresholdShift: -0.012,
      sizeMultiplier: 1.04,
      paperProbeEligible: false,
      shadowPriority: false,
      scope: {
        conditionId: "breakout_release",
        familyId: "breakout",
        strategyId: "market_structure_break"
      }
    }, {
      family: "breakout",
      activeStrategy: "market_structure_break"
    }, {
      conditionId: "breakout_release"
    });

    assert.equal(tuning.active, true);
    assert.equal(tuning.targetedBlocker, true);
    assert.ok(tuning.thresholdShift < -0.012);
    assert.ok(tuning.sizeMultiplier > 1.04);
    assert.equal(tuning.paperProbeEligible, true);
    assert.ok(tuning.priorityBoost > 0.02);
  });

  await runCheck("missed-trade tuning stays bounded and stricter in live mode", async () => {
    const manager = new RiskManager(makeConfig({ botMode: "live" }));
    const tuning = manager.resolveMissedTradeTuning({
      status: "priority",
      actionClass: "scoped_soften",
      confidence: 0.74,
      topBlocker: "meta_followthrough_caution",
      thresholdShift: -0.012,
      sizeMultiplier: 1.04,
      scope: {
        conditionId: "breakout_release",
        familyId: "breakout",
        strategyId: "market_structure_break"
      }
    }, {
      family: "breakout",
      activeStrategy: "market_structure_break"
    }, {
      conditionId: "breakout_release"
    });

    assert.equal(tuning.active, true);
    assert.equal(tuning.paperProbeEligible, false);
    assert.ok(tuning.thresholdShift >= -0.018);
    assert.ok(tuning.sizeMultiplier <= 1.06);
  });

  await runCheck("execution-quality memory lifts cleaner opportunities and lowers blocker noise in paper", async () => {
    const manager = new RiskManager(makeConfig({
      botMode: "paper",
      paperExecutionVenue: "binance_demo_spot",
      modelThreshold: 0.52,
      minModelConfidence: 0.5
    }));
    const baseInput = {
      symbol: "BTCUSDT",
      score: { probability: 0.69, rawProbability: 0.71, confidence: 0.64, calibrationConfidence: 0.58, disagreement: 0.03, shouldAbstain: false },
      marketSnapshot: {
        market: {
          realizedVolPct: 0.014,
          atrPct: 0.006,
          bullishPatternScore: 0.28,
          bearishPatternScore: 0.04,
          breakoutFollowThroughScore: 0.54
        },
        book: {
          mid: 100,
          bid: 99.95,
          ask: 100.05,
          spreadBps: 2,
          spreadStabilityScore: 0.82,
          depthConfidence: 0.84,
          bookPressure: 0.22
        }
      },
      newsSummary: { riskScore: 0.06, sentimentScore: 0.08, headlines: [] },
      announcementSummary: { riskScore: 0.02 },
      marketStructureSummary: { signalScore: 0.18, riskScore: 0.12 },
      marketSentimentSummary: { contrarianScore: 0.04 },
      volatilitySummary: { riskScore: 0.16 },
      calendarSummary: { riskScore: 0.04 },
      committeeSummary: { agreement: 0.74, netScore: 0.15 },
      rlAdvice: {},
      strategySummary: { family: "trend_following", activeStrategy: "ema_trend", fitScore: 0.7, blockers: [] },
      sessionSummary: { session: "london", riskScore: 0.08, sizeMultiplier: 1 },
      driftSummary: {},
      selfHealState: {},
      metaSummary: {},
      timeframeSummary: { alignmentScore: 0.72, blockerReasons: [], enabled: true },
      pairHealthSummary: { score: 0.76 },
      onChainLiteSummary: {},
      divergenceSummary: { averageScore: 0.08, leadBlocker: { status: "clear" } },
      qualityQuorumSummary: { quorumScore: 0.7 },
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary: { status: "ready", allowEntries: true, sizeMultiplier: 1 },
      missedTradeTuningSummary: {},
      marketConditionSummary: { conditionId: "trend_continuation", conditionConfidence: 0.74, conditionRisk: 0.2 },
      runtime: { openPositions: [], exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] } },
      balance: { quoteFree: 10000 },
      symbolStats: {},
      portfolioSummary: { reasons: [], advisoryReasons: [], diversificationScore: 0.62, dominantCluster: "majors", maxCorrelation: 0.18, allocatorScore: 0.62 },
      regimeSummary: { regime: "trend" },
      thresholdTuningSummary: {},
      parameterGovernorSummary: {},
      capitalLadderSummary: {},
      nowIso: "2026-04-22T11:30:00.000Z",
      venueConfirmationSummary: {},
      strategyMetaSummary: {},
      strategyAllocationSummary: { convictionScore: 0.66 },
      baselineCoreSummary: {},
      paperLearningGuidance: {},
      offlineLearningGuidance: {},
      exchangeCapabilitiesSummary: {},
      symbolRules: buildTestRules("BTCUSDT")
    };
    const goodJournal = {
      trades: [
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-20T10:00:00.000Z", executionQualityScore: 0.74, netPnlPct: 0.021, opportunityScoreAtEntry: 0.68 },
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-21T10:00:00.000Z", executionQualityScore: 0.71, netPnlPct: 0.018, opportunityScoreAtEntry: 0.7 },
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-22T08:00:00.000Z", executionQualityScore: 0.69, netPnlPct: 0.012, opportunityScoreAtEntry: 0.66 }
      ],
      scaleOuts: [],
      equitySnapshots: []
    };
    const weakJournal = {
      trades: [
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-20T10:00:00.000Z", executionQualityScore: 0.31, netPnlPct: -0.014, opportunityScoreAtEntry: 0.48 },
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-21T10:00:00.000Z", executionQualityScore: 0.36, netPnlPct: -0.011, opportunityScoreAtEntry: 0.44 },
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-22T08:00:00.000Z", executionQualityScore: 0.34, netPnlPct: -0.009, opportunityScoreAtEntry: 0.41 }
      ],
      scaleOuts: [],
      equitySnapshots: []
    };

    const goodDecision = manager.evaluateEntry({ ...baseInput, journal: goodJournal });
    const weakDecision = manager.evaluateEntry({ ...baseInput, journal: weakJournal });

    assert.equal(goodDecision.executionQualityMemory.active, true);
    assert.ok(goodDecision.executionQualityMemory.score > weakDecision.executionQualityMemory.score);
    assert.ok(goodDecision.opportunityScore > weakDecision.opportunityScore);
  });

  await runCheck("permissioning summary keeps hard safety separate from downstream sizing symptoms", async () => {
    const manager = new RiskManager(makeConfig({
      botMode: "paper",
      paperExecutionVenue: "binance_demo_spot",
      maxPositionFraction: 0.002,
      riskPerTrade: 0.002
    }));
    const decision = manager.evaluateEntry({
      symbol: "BCHUSDT",
      score: { probability: 0.66, rawProbability: 0.7, confidence: 0.61, calibrationConfidence: 0.5, disagreement: 0.04, shouldAbstain: false },
      marketSnapshot: {
        market: { realizedVolPct: 0.015, atrPct: 0.007, bullishPatternScore: 0.22, bearishPatternScore: 0.03 },
        book: { mid: 470, bid: 469.9, ask: 470.1, spreadBps: 2, depthConfidence: 0.8, bookPressure: 0.18 }
      },
      newsSummary: { riskScore: 0.05, sentimentScore: 0.06, headlines: [] },
      announcementSummary: { riskScore: 0.02 },
      marketStructureSummary: { signalScore: 0.12, riskScore: 0.1 },
      marketSentimentSummary: {},
      volatilitySummary: { riskScore: 0.16 },
      calendarSummary: { riskScore: 0.04 },
      committeeSummary: { agreement: 0.74, netScore: 0.14 },
      rlAdvice: {},
      strategySummary: { family: "trend_following", activeStrategy: "ema_trend", fitScore: 0.68, blockers: [] },
      sessionSummary: {},
      driftSummary: {},
      selfHealState: {},
      metaSummary: {},
      timeframeSummary: { alignmentScore: 0.7, blockerReasons: [], enabled: true },
      pairHealthSummary: { score: 0.72 },
      onChainLiteSummary: {},
      divergenceSummary: { averageScore: 0.06, leadBlocker: { status: "clear" } },
      qualityQuorumSummary: { quorumScore: 0.68 },
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary: { status: "ready", allowEntries: true, sizeMultiplier: 1 },
      runtime: {
        openPositions: [],
        exchangeSafety: {
          globalFreezeEntries: true,
          blockedSymbols: [{ symbol: "BCHUSDT", reason: "exchange_safety_symbol_blocked" }]
        }
      },
      journal: { trades: [], scaleOuts: [], equitySnapshots: [] },
      balance: { quoteFree: 500 },
      symbolStats: {},
      portfolioSummary: { reasons: [], advisoryReasons: [], dominantCluster: "majors", maxCorrelation: 0.2, allocatorScore: 0.54 },
      regimeSummary: { regime: "trend" },
      thresholdTuningSummary: {},
      parameterGovernorSummary: {},
      capitalLadderSummary: {},
      nowIso: "2026-04-22T11:30:00.000Z",
      venueConfirmationSummary: {},
      strategyMetaSummary: {},
      strategyAllocationSummary: {},
      baselineCoreSummary: {},
      paperLearningGuidance: {},
      offlineLearningGuidance: {},
      exchangeCapabilitiesSummary: {},
      symbolRules: buildTestRules("BCHUSDT")
    });

    assert.equal(decision.permissioningSummary.hardSafetyBlocked, true);
    assert.equal(decision.permissioningSummary.primaryRootBlocker, "exchange_safety_blocked");
    assert.ok(decision.permissioningSummary.hardSafetyReasons.includes("exchange_safety_blocked"));
    assert.ok(decision.permissioningSummary.downstreamSymptoms.includes("trade_size_below_minimum") || decision.reasons.includes("trade_size_below_minimum"));
  });

  await runCheck("risk manager uses family-scoped exit policies for family-specific exits", async () => {
    const manager = new RiskManager(makeConfig());
    const decision = manager.evaluateExit({
      position: {
        id: "p-breakout",
        symbol: "BTCUSDT",
        entryAt: "2026-03-08T08:00:00.000Z",
        entryPrice: 100,
        highestPrice: 104,
        lowestPrice: 99,
        quantity: 1,
        notional: 100,
        totalCost: 100,
        scaleOutFraction: 0.4,
        trailingStopPct: 0.01,
        scaleOutTriggerPrice: 101.2,
        strategyAtEntry: "donchian_breakout",
        strategyFamily: "breakout",
        regimeAtEntry: "breakout"
      },
      currentPrice: 102.4,
      newsSummary: { riskScore: 0.06, sentimentScore: 0.08 },
      marketSnapshot: { book: { spreadBps: 2.5, bookPressure: 0.12 }, market: { bearishPatternScore: 0.05 } },
      exitIntelligenceSummary: { action: "trim", confidence: 0.72, trimScore: 0.74, trimFraction: 0.4, reason: "protect_winner" },
      exitPolicySummary: {
        familyPolicies: [{ id: "breakout", scaleOutFractionMultiplier: 1.08, scaleOutTriggerMultiplier: 0.92, trailingStopMultiplier: 0.9, maxHoldMinutesMultiplier: 1.06 }]
      },
      nowIso: "2026-03-08T10:00:00.000Z"
    });

    assert.equal(decision.shouldScaleOut, true);
    assert.ok(decision.scaleOutFraction > 0.4);
    assert.equal(decision.exitPolicy.active, true);
    assert.ok(decision.exitPolicy.sources.includes("breakout"));
  });

  await runCheck("candidate execution ranking prefers higher net expected value over raw model probability", async () => {
    const highProbabilityHighPain = {
      symbol: "BTCUSDT",
      score: { probability: 0.76, confidence: 0.72 },
      marketSnapshot: { book: { spreadBps: 9 } },
      decision: {
        opportunityScore: 0.7,
        rankScore: 0.71,
        expectedNetEdge: {
          expectancyScore: 0.54,
          expectedExecutionDragPct: 0.018
        },
        executionQualityMemory: { score: 0.36 },
        portfolioAllocator: {
          allocatorScore: 0.48,
          marginalDiversificationValue: 0.02,
          capitalPenalty: 0.08
        },
        entryTimingRefinement: { timingScore: 0.58 },
        threshold: 0.55,
        setupQuality: { score: 0.61 }
      }
    };
    const lowerProbabilityCleanerNev = {
      symbol: "ETHUSDT",
      score: { probability: 0.69, confidence: 0.68 },
      marketSnapshot: { book: { spreadBps: 2 } },
      decision: {
        opportunityScore: 0.66,
        rankScore: 0.67,
        expectedNetEdge: {
          expectancyScore: 0.68,
          expectedExecutionDragPct: 0.003
        },
        executionQualityMemory: { score: 0.76 },
        portfolioAllocator: {
          allocatorScore: 0.61,
          marginalDiversificationValue: 0.08,
          capitalPenalty: 0.02
        },
        entryTimingRefinement: { timingScore: 0.61 },
        threshold: 0.55,
        setupQuality: { score: 0.63 }
      }
    };

    assert.ok(compareCandidateExecutionRank(highProbabilityHighPain, lowerProbabilityCleanerNev) > 0);
  });

  await runCheck("offline learning guidance consumes reject adaptive candidates only in paper mode", async () => {
    const bot = Object.create(TradingBot.prototype);
    bot.config = makeConfig({ botMode: "paper" });
    bot.runtime = {
      rejectAdaptiveLearning: {
        status: "ready",
        adaptiveCandidates: [{
          blocker: "meta_followthrough_caution",
          blockerStage: "governance",
          suggestedAction: "paper_scoped_soften",
          suggestedThresholdShift: -0.012,
          suggestedSizeMultiplier: 1.06,
          averageMissedR: 0.92,
          confidence: 0.78,
          rejectCount: 8,
          falseNegativeRate: 0.71
        }]
      },
      ops: { paperLearning: {} },
      paperLearning: {},
      onlineAdaptation: {},
      selfHeal: {}
    };

    const guidance = TradingBot.prototype.buildOfflineLearningGuidance.call(bot, {
      strategySummary: { family: "breakout", activeStrategy: "market_structure_break" },
      regimeSummary: { regime: "breakout" },
      sessionSummary: { session: "us" },
      marketConditionSummary: { conditionId: "breakout_release" },
      rawFeatures: {},
      offlineTrainerSummary: {
        outcomeScopeScorecards: {},
        featureGovernance: {},
        falsePositivePatternLibrary: {},
        strategyReweighting: {},
        strategyPromotionEngine: {}
      }
    });

    assert.equal(guidance.active, true);
    assert.ok((guidance.adaptiveCandidatesApplied || []).length >= 1);
    assert.ok((guidance.thresholdShift || 0) < 0);
    assert.ok((guidance.sizeMultiplier || 1) > 1);
    assert.ok((guidance.priorityBoost || 0) > 0);
  });

  await runCheck("offline learning guidance keeps reject adaptive softening disabled in live mode", async () => {
    const bot = Object.create(TradingBot.prototype);
    bot.config = makeConfig({ botMode: "live" });
    bot.runtime = {
      rejectAdaptiveLearning: {
        status: "ready",
        adaptiveCandidates: [{
          blocker: "meta_followthrough_caution",
          blockerStage: "governance",
          suggestedAction: "paper_scoped_soften",
          suggestedThresholdShift: -0.012,
          suggestedSizeMultiplier: 1.06,
          averageMissedR: 0.92,
          confidence: 0.78,
          rejectCount: 8,
          falseNegativeRate: 0.71
        }]
      },
      ops: { paperLearning: {} },
      paperLearning: {},
      onlineAdaptation: {},
      selfHeal: {}
    };

    const guidance = TradingBot.prototype.buildOfflineLearningGuidance.call(bot, {
      strategySummary: { family: "breakout", activeStrategy: "market_structure_break" },
      regimeSummary: { regime: "breakout" },
      sessionSummary: { session: "us" },
      marketConditionSummary: { conditionId: "breakout_release" },
      rawFeatures: {},
      offlineTrainerSummary: {
        outcomeScopeScorecards: {},
        featureGovernance: {},
        falsePositivePatternLibrary: {},
        strategyReweighting: {},
        strategyPromotionEngine: {}
      }
    });

    assert.equal((guidance.adaptiveCandidatesApplied || []).length, 0);
    assert.equal(guidance.active, false);
  });

  await runCheck("portfolio candidate allocator can favor replacing a weaker open position in paper mode", async () => {
    const bot = {
      config: makeConfig({ botMode: "paper", dashboardDecisionLimit: 6 }),
      runtime: {
        openPositions: [{
          symbol: "SOLUSDT",
          probabilityAtEntry: 0.54,
          opportunityScoreAtEntry: 0.48,
          executionQualityScore: 0.34,
          strategyFamily: "breakout",
          regimeAtEntry: "trend",
          profile: { cluster: "layer1" },
          entryRationale: {
            strategy: { family: "breakout", fitScore: 0.45 },
            regimeSummary: { regime: "trend" }
          }
        }]
      },
      recordEvent() {}
    };
    const lead = {
      symbol: "BTCUSDT",
      strategySummary: { family: "trend_following" },
      regimeSummary: { regime: "trend" },
      portfolioSummary: {
        allocatorScore: 0.58,
        dominantCluster: "majors",
        familyBudgetFactor: 0.98,
        regimeBudgetFactor: 0.97,
        clusterBudgetFactor: 0.98,
        sameFamilyCount: 0,
        sameRegimeCount: 0,
        sameClusterCount: 0,
        sameFactorCount: 0
      },
      decision: {
        allow: true,
        opportunityScore: 0.63,
        rankScore: 0.64,
        expectedNetEdge: { expectancyScore: 0.55, expectedExecutionDragPct: 0.008 },
        portfolioAllocator: { allocatorScore: 0.58, marginalDiversificationValue: 0.02, capitalPenalty: 0.04 },
        executionQualityMemory: { score: 0.62 },
        entryTimingRefinement: { timingScore: 0.56 },
        threshold: 0.55,
        setupQuality: { score: 0.6 }
      },
      score: { probability: 0.64, confidence: 0.62 },
      marketSnapshot: { book: { spreadBps: 4.5 } }
    };
    const replacementCandidate = {
      symbol: "AVAXUSDT",
      strategySummary: { family: "breakout" },
      regimeSummary: { regime: "trend" },
      portfolioSummary: {
        allocatorScore: 0.57,
        dominantCluster: "layer1",
        familyBudgetFactor: 0.84,
        regimeBudgetFactor: 0.89,
        clusterBudgetFactor: 0.83,
        sameFamilyCount: 1,
        sameRegimeCount: 1,
        sameClusterCount: 1,
        sameFactorCount: 0
      },
      decision: {
        allow: true,
        opportunityScore: 0.69,
        rankScore: 0.7,
        expectedNetEdge: { expectancyScore: 0.74, expectedExecutionDragPct: 0.004 },
        portfolioAllocator: { allocatorScore: 0.57, marginalDiversificationValue: 0.05, capitalPenalty: 0.03 },
        executionQualityMemory: { score: 0.8 },
        entryTimingRefinement: { timingScore: 0.63 },
        threshold: 0.55,
        setupQuality: { score: 0.71 }
      },
      score: { probability: 0.68, confidence: 0.69 },
      marketSnapshot: { book: { spreadBps: 2.2 } }
    };

    const ranked = TradingBot.prototype.applyPortfolioCandidateAllocator.call(bot, [lead, replacementCandidate], { readOnly: true });

    assert.equal(ranked[0].symbol, "AVAXUSDT");
    assert.equal(ranked[0].decision.portfolioAllocator.primaryReason, "allocator_replace_weaker_open_position");
    assert.equal(ranked[0].decision.portfolioAllocator.replacementOpportunity.symbol, "SOLUSDT");
  });

  await runCheck("execution quality memory now affects sizing pressure as well as opportunity ranking", async () => {
    const manager = new RiskManager(makeConfig({ botMode: "paper", paperExecutionVenue: "binance_demo_spot" }));
    const baseInput = {
      symbol: "BTCUSDT",
      score: { probability: 0.69, rawProbability: 0.72, confidence: 0.64, calibrationConfidence: 0.6, disagreement: 0.04, shouldAbstain: false },
      marketSnapshot: {
        market: { realizedVolPct: 0.016, atrPct: 0.007, bullishPatternScore: 0.24, bearishPatternScore: 0.04 },
        book: { mid: 100, bid: 99.9, ask: 100.1, spreadBps: 2.2, bookPressure: 0.18, depthConfidence: 0.76 }
      },
      newsSummary: { riskScore: 0.05, sentimentScore: 0.07, headlines: [] },
      announcementSummary: { riskScore: 0.02 },
      marketStructureSummary: { signalScore: 0.12, riskScore: 0.08 },
      marketSentimentSummary: {},
      volatilitySummary: { riskScore: 0.14 },
      calendarSummary: { riskScore: 0.04 },
      committeeSummary: { agreement: 0.72, netScore: 0.12 },
      rlAdvice: {},
      strategySummary: { family: "trend_following", activeStrategy: "ema_trend", fitScore: 0.67, blockers: [] },
      sessionSummary: { session: "london" },
      driftSummary: {},
      selfHealState: {},
      metaSummary: {},
      timeframeSummary: { alignmentScore: 0.7, blockerReasons: [], enabled: true },
      pairHealthSummary: { score: 0.72 },
      onChainLiteSummary: {},
      divergenceSummary: { averageScore: 0.05, leadBlocker: { status: "clear" } },
      qualityQuorumSummary: { quorumScore: 0.66 },
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary: { status: "ready", allowEntries: true, sizeMultiplier: 1 },
      runtime: { openPositions: [], exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] } },
      balance: { quoteFree: 1200 },
      symbolStats: {},
      portfolioSummary: { reasons: [], advisoryReasons: [], dominantCluster: "majors", maxCorrelation: 0.18, allocatorScore: 0.62 },
      regimeSummary: { regime: "trend" },
      thresholdTuningSummary: {},
      parameterGovernorSummary: {},
      capitalLadderSummary: {},
      nowIso: "2026-04-22T11:30:00.000Z",
      venueConfirmationSummary: {},
      strategyMetaSummary: {},
      strategyAllocationSummary: { convictionScore: 0.66 },
      baselineCoreSummary: {},
      paperLearningGuidance: {},
      offlineLearningGuidance: {},
      exchangeCapabilitiesSummary: {},
      symbolRules: buildTestRules("BTCUSDT")
    };
    const strongExecutionJournal = {
      trades: [
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-20T10:00:00.000Z", executionQualityScore: 0.81, netPnlPct: 0.016, opportunityScoreAtEntry: 0.72 },
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-21T10:00:00.000Z", executionQualityScore: 0.77, netPnlPct: 0.014, opportunityScoreAtEntry: 0.69 },
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-22T08:00:00.000Z", executionQualityScore: 0.74, netPnlPct: 0.012, opportunityScoreAtEntry: 0.67 }
      ],
      scaleOuts: [],
      equitySnapshots: []
    };
    const noisyExecutionJournal = {
      trades: [
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-20T10:00:00.000Z", executionQualityScore: 0.33, netPnlPct: -0.011, opportunityScoreAtEntry: 0.46 },
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-21T10:00:00.000Z", executionQualityScore: 0.37, netPnlPct: -0.009, opportunityScoreAtEntry: 0.44 },
        { brokerMode: "paper", symbol: "BTCUSDT", strategyFamily: "trend_following", strategyAtEntry: "ema_trend", regimeAtEntry: "trend", sessionAtEntry: "london", exitAt: "2026-04-22T08:00:00.000Z", executionQualityScore: 0.35, netPnlPct: -0.008, opportunityScoreAtEntry: 0.42 }
      ],
      scaleOuts: [],
      equitySnapshots: []
    };

    const strongDecision = manager.evaluateEntry({ ...baseInput, journal: strongExecutionJournal });
    const noisyDecision = manager.evaluateEntry({ ...baseInput, journal: noisyExecutionJournal });
    const strongExecutionGroup = (strongDecision.sizingSummary.groupedSizing?.groups || []).find((item) => item.label === "execution_pressure");
    const noisyExecutionGroup = (noisyDecision.sizingSummary.groupedSizing?.groups || []).find((item) => item.label === "execution_pressure");

    assert.ok((strongDecision.executionQualityMemory.score || 0) > (noisyDecision.executionQualityMemory.score || 0));
    assert.ok((strongDecision.opportunityScore || 0) > (noisyDecision.opportunityScore || 0));
    assert.ok((strongDecision.quoteAmount || 0) > (noisyDecision.quoteAmount || 0));
    assert.ok((strongExecutionGroup?.multiplier || 1) > (noisyExecutionGroup?.multiplier || 1));
  });

  await runCheck("openBestCandidate rotates weaker paper position before opening stronger replacement", async () => {
    const bot = Object.create(TradingBot.prototype);
    const journal = { trades: [] };
    const runtime = {
      openPositions: [{
        id: "pos-sol",
        symbol: "SOLUSDT",
        quantity: 1,
        entryPrice: 100,
        totalCost: 100,
        notional: 100,
        strategyFamily: "breakout",
        regimeAtEntry: "trend",
        profile: { cluster: "layer1" }
      }],
      exchangeTruth: { unmatchedOrderSymbols: [], orphanedSymbols: [] },
      exchangeSafety: { blockedSymbols: [], globalFreezeEntries: false }
    };
    const events = [];
    bot.config = makeConfig({ botMode: "paper" });
    bot.runtime = runtime;
    bot.journal = journal;
    bot.symbolRules = {
      SOLUSDT: buildTestRules("SOLUSDT"),
      AVAXUSDT: buildTestRules("AVAXUSDT")
    };
    bot.health = { canEnterNewPositions: () => true };
    bot.marketCache = {
      SOLUSDT: { book: { mid: 95, bid: 94.9, ask: 95.1, spreadBps: 2 } }
    };
    bot.logger = { info() {}, warn() {} };
    bot.recordEvent = (name, payload) => events.push({ name, payload });
    bot.markReportDirty = () => {};
    bot.updateDecisionFunnelCycle = () => {};
    bot.updateDecisionFunnelSymbol = () => {};
    bot.noteEntryAttempt = () => {};
    bot.notePaperTradeAttempt = () => {};
    bot.noteEntryExecuted = () => {};
    bot.notePaperTradeExecuted = () => {};
    bot.learnFromTrade = async () => {};
    bot.buildEntryRationale = () => ({ summary: "rotate_then_enter" });
    bot.getMarketSnapshot = async (symbol) => ({ symbol, book: { mid: 95, bid: 94.9, ask: 95.1, spreadBps: 2 } });
    bot.broker = {
      exitPosition: async ({ position, reason }) => {
        runtime.openPositions = runtime.openPositions.filter((item) => item.id !== position.id);
        return {
          id: `${position.id}-trade`,
          symbol: position.symbol,
          reason,
          entryAt: "2026-04-22T10:00:00.000Z",
          exitAt: "2026-04-22T11:00:00.000Z",
          entryPrice: position.entryPrice,
          exitPrice: 95,
          quantity: position.quantity,
          totalCost: position.totalCost,
          netPnlPct: -0.05,
          pnlQuote: -5
        };
      },
      enterPosition: async ({ symbol }) => ({ id: `open-${symbol}`, symbol })
    };

    const candidate = {
      symbol: "AVAXUSDT",
      marketSnapshot: { book: { mid: 30, bid: 29.9, ask: 30.1, spreadBps: 2 } },
      decision: {
        allow: true,
        quoteAmount: 25,
        executionPlan: { entryStyle: "market" },
        portfolioAllocator: {
          replacementOpportunity: {
            eligible: true,
            symbol: "SOLUSDT",
            scoreGap: 0.12,
            painDelta: 0.16
          }
        }
      },
      rawFeatures: {},
      score: { probability: 0.68 },
      strategySummary: { family: "breakout", activeStrategy: "donchian_breakout" },
      newsSummary: {},
      regimeSummary: { regime: "trend" }
    };

    const result = await TradingBot.prototype.openBestCandidate.call(bot, [candidate], {});

    assert.equal(result.status, "opened");
    assert.equal(result.openedPosition.symbol, "AVAXUSDT");
    assert.equal(journal.trades.length, 1);
    assert.equal(journal.trades[0].symbol, "SOLUSDT");
    assert.equal(runtime.openPositions.length, 0);
    assert.ok(result.rotations.some((item) => item.rotated && item.replacedSymbol === "SOLUSDT"));
    assert.ok(events.some((item) => item.name === "allocator_rotation_executed"));
  });
}
