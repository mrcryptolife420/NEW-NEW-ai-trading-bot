import { RiskManager } from "../src/risk/riskManager.js";
import { buildCapitalGovernor } from "../src/runtime/capitalGovernor.js";
import { buildSymbolRules } from "../src/binance/symbolFilters.js";

function buildTestRules(symbol = "BTCUSDT") {
  return buildSymbolRules({
    symbols: [{
      symbol,
      status: "TRADING",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      filters: [
        { filterType: "LOT_SIZE", minQty: "0.0001", maxQty: "1000", stepSize: "0.0001" },
        { filterType: "MIN_NOTIONAL", minNotional: "5" },
        { filterType: "PRICE_FILTER", minPrice: "0.01", maxPrice: "1000000", tickSize: "0.01" }
      ]
    }]
  })[symbol];
}

export async function registerCapitalGovernorReliabilityTests({
  runCheck,
  assert,
  makeConfig
}) {
  await runCheck("capital governor surfaces exposure budget blockers and pressure", async () => {
    const config = makeConfig({
      paperExecutionVenue: "internal",
      capitalGovernorFamilyBudgetFraction: 0.45,
      capitalGovernorRegimeBudgetFraction: 0.55,
      capitalGovernorClusterBudgetFraction: 0.4,
      capitalGovernorEventBudgetFraction: 0.35
    });
    const runtime = {
      openPositions: [
        {
          symbol: "ETHUSDT",
          brokerMode: "paper",
          notional: 700,
          family: "trend_following",
          regime: "trend",
          cluster: "majors",
          entryRationale: {
            strategySummary: { family: "trend_following" },
            regimeSummary: { regime: "trend" },
            portfolioSummary: { dominantCluster: "majors", maxCorrelation: 0.82 },
            newsSummary: { dominantEventType: "macro" }
          }
        },
        {
          symbol: "SOLUSDT",
          brokerMode: "paper",
          notional: 300,
          family: "range_grid",
          regime: "range",
          cluster: "alts"
        }
      ]
    };
    const summary = buildCapitalGovernor({
      journal: { trades: [], scaleOuts: [], equitySnapshots: [] },
      runtime,
      config,
      nowIso: "2026-04-22T11:30:00.000Z"
    });

    assert.ok(summary.budgetPressure > 0);
    assert.ok(summary.budgetBlockers.some((item) => item.scope === "family" && item.key === "trend_following"));
  });

  await runCheck("risk manager blocks candidates that hit active family exposure budgets", async () => {
    const config = makeConfig({
      paperExecutionVenue: "internal",
      capitalGovernorFamilyBudgetFraction: 0.45,
      capitalGovernorRegimeBudgetFraction: 0.55,
      capitalGovernorClusterBudgetFraction: 0.4,
      capitalGovernorEventBudgetFraction: 0.35,
      modelThreshold: 0.52,
      minModelConfidence: 0.5
    });
    const runtime = {
      openPositions: [{
        symbol: "ETHUSDT",
        brokerMode: "paper",
        quantity: 1,
        entryPrice: 700,
        notional: 700,
        family: "trend_following",
        regime: "trend",
        cluster: "majors",
        entryRationale: {
          strategySummary: { family: "trend_following" },
          regimeSummary: { regime: "trend" },
          portfolioSummary: { dominantCluster: "majors", maxCorrelation: 0.82 },
          newsSummary: { dominantEventType: "macro" }
        }
      }],
      exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] }
    };
    const journal = { trades: [], scaleOuts: [], equitySnapshots: [] };
    const capitalGovernorSummary = buildCapitalGovernor({
      journal,
      runtime,
      config,
      nowIso: "2026-04-22T11:30:00.000Z"
    });
    const manager = new RiskManager(config);
    const decision = manager.evaluateEntry({
      symbol: "BTCUSDT",
      score: { probability: 0.7, confidence: 0.68 },
      marketSnapshot: {
        market: { realizedVolPct: 0.02, atrPct: 0.01 },
        book: { mid: 100, bid: 99.9, ask: 100.1, spreadBps: 2, bookPressure: 0.55, depthConfidence: 0.8 }
      },
      newsSummary: { riskScore: 0.2, dominantEventType: "macro", sentimentScore: 0.1, headlines: [] },
      strategySummary: { family: "trend_following", activeStrategy: "trend_follow" },
      sessionSummary: {},
      selfHealState: {},
      committeeSummary: {},
      timeframeSummary: {},
      pairHealthSummary: {},
      onChainLiteSummary: {},
      divergenceSummary: {},
      qualityQuorumSummary: {},
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary,
      runtime,
      journal,
      balance: { quoteFree: 10000 },
      symbolStats: {},
      portfolioSummary: { dominantCluster: "majors", maxCorrelation: 0.84, reasons: [], advisoryReasons: [] },
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

    assert.equal(decision.allow, false);
    assert.ok(decision.reasons.includes("capital_governor_family_budget"));
    assert.ok(decision.capitalGovernorBudgetMatch?.blocked);
  });

  await runCheck("capital governor uses constrained sizing instead of hard block under mild paper pressure", async () => {
    const config = makeConfig({
      botMode: "paper",
      paperExecutionVenue: "internal",
      capitalGovernorFamilyBudgetFraction: 0.55,
      capitalGovernorRegimeBudgetFraction: 0.7,
      capitalGovernorClusterBudgetFraction: 0.7,
      capitalGovernorEventBudgetFraction: 0.5,
      maxDailyDrawdown: 0.04
    });
    const runtime = {
      openPositions: [{
        symbol: "ETHUSDT",
        brokerMode: "paper",
        notional: 520,
        family: "trend_following",
        regime: "trend",
        cluster: "majors"
      }]
    };
    const journal = {
      trades: [{
        brokerMode: "paper",
        entryAt: "2026-04-22T07:00:00.000Z",
        exitAt: "2026-04-22T09:00:00.000Z",
        pnlQuote: -22
      }],
      scaleOuts: [],
      equitySnapshots: []
    };

    const summary = buildCapitalGovernor({
      journal,
      runtime,
      config,
      nowIso: "2026-04-22T11:30:00.000Z"
    });

    assert.equal(summary.allowEntries, true);
    assert.ok(["mild", "moderate"].includes(summary.pressureBand));
    assert.ok(["constrained", "ready", "recovery"].includes(summary.status));
    assert.ok(summary.sizeMultiplier < 1);
    assert.equal(summary.allowProbeEntries, true);
  });

  await runCheck("capital governor blocks under severe live drawdown pressure", async () => {
    const config = makeConfig({
      botMode: "live",
      maxDailyDrawdown: 0.04,
      capitalGovernorWeeklyDrawdownPct: 0.08
    });
    const summary = buildCapitalGovernor({
      journal: {
        trades: [{
          brokerMode: "live",
          entryAt: "2026-04-22T07:00:00.000Z",
          exitAt: "2026-04-22T09:00:00.000Z",
          pnlQuote: -500
        }],
        scaleOuts: [],
        equitySnapshots: []
      },
      runtime: { openPositions: [] },
      config,
      nowIso: "2026-04-22T11:30:00.000Z"
    });

    assert.equal(summary.allowEntries, false);
    assert.equal(summary.pressureBand, "severe");
    assert.equal(summary.allowProbeEntries, false);
    assert.equal(summary.status, "blocked");
  });

  await runCheck("risk manager does not globally block unrelated families when scoped capital budget is saturated", async () => {
    const config = makeConfig({
      botMode: "paper",
      paperExecutionVenue: "internal",
      capitalGovernorFamilyBudgetFraction: 0.45,
      capitalGovernorRegimeBudgetFraction: 0.55,
      capitalGovernorClusterBudgetFraction: 0.7,
      capitalGovernorEventBudgetFraction: 0.7,
      modelThreshold: 0.52,
      minModelConfidence: 0.5
    });
    const runtime = {
      openPositions: [{
        symbol: "ETHUSDT",
        brokerMode: "paper",
        quantity: 1,
        entryPrice: 700,
        notional: 700,
        family: "trend_following",
        regime: "trend",
        cluster: "majors",
        entryRationale: {
          strategySummary: { family: "trend_following" },
          regimeSummary: { regime: "trend" },
          portfolioSummary: { dominantCluster: "majors", maxCorrelation: 0.52 }
        }
      }],
      exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] }
    };
    const journal = { trades: [], scaleOuts: [], equitySnapshots: [] };
    const capitalGovernorSummary = buildCapitalGovernor({
      journal,
      runtime,
      config,
      nowIso: "2026-04-22T11:30:00.000Z"
    });
    const manager = new RiskManager(config);
    const decision = manager.evaluateEntry({
      symbol: "LINKUSDT",
      score: { probability: 0.71, confidence: 0.69 },
      marketSnapshot: {
        market: { realizedVolPct: 0.02, atrPct: 0.01 },
        book: { mid: 100, bid: 99.9, ask: 100.1, spreadBps: 2, bookPressure: 0.55, depthConfidence: 0.84 }
      },
      newsSummary: { riskScore: 0.2, dominantEventType: "general", sentimentScore: 0.1, headlines: [] },
      strategySummary: { family: "mean_reversion", activeStrategy: "range_revert" },
      sessionSummary: {},
      selfHealState: {},
      committeeSummary: {},
      timeframeSummary: {},
      pairHealthSummary: {},
      onChainLiteSummary: {},
      divergenceSummary: {},
      qualityQuorumSummary: {},
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary,
      runtime,
      journal,
      balance: { quoteFree: 10000 },
      symbolStats: {},
      portfolioSummary: { dominantCluster: "alts", maxCorrelation: 0.34, reasons: [], advisoryReasons: [] },
      regimeSummary: { regime: "range" },
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
      symbolRules: buildTestRules("LINKUSDT")
    });

    assert.equal(decision.capitalGovernorBudgetMatch?.blocked, false);
    assert.ok(!decision.reasons.includes("capital_governor_family_budget"));
  });
}
