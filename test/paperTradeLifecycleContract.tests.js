import { buildPaperTradeLifecycleEvidence, assertPaperTradeLifecycleContract } from "../src/runtime/paperTradeLifecycleContract.js";

function makeMarketSnapshot(price = 100) {
  return {
    book: {
      bid: price - 0.05,
      ask: price + 0.05,
      mid: price,
      spreadBps: 10,
      bidDepthUsdt: 100000,
      askDepthUsdt: 100000,
      depthConfidence: 0.9
    },
    market: {
      realizedVolPct: 0.01,
      rangeWidthPct: 0.02
    }
  };
}

function makeRules() {
  return {
    minQty: 0.0001,
    maxQty: 100000,
    marketMinQty: 0.0001,
    marketMaxQty: 100000,
    stepSize: 0.0001,
    marketStepSize: 0.0001,
    minNotional: 5,
    maxNotional: 100000000,
    tickSize: 0.01
  };
}

function makeDecision(overrides = {}) {
  return {
    allow: true,
    stopLossPct: 0.02,
    takeProfitPct: 0.03,
    threshold: 0.55,
    regime: "trend",
    strategySummary: { activeStrategy: "trend_following", family: "trend_following" },
    executionPlan: { entryStyle: "market", fallbackStyle: "none", preferMaker: false },
    ...overrides
  };
}

export async function registerPaperTradeLifecycleContractTests({
  runCheck,
  assert,
  PaperBroker,
  makeConfig
}) {
  await runCheck("paper trade lifecycle contract proves approved paper entry and close without live broker", async () => {
    const config = makeConfig({
      botMode: "paper",
      paperFeeBps: 10,
      paperSlippageBps: 0,
      paperLatencyMs: 0,
      startingCash: 10000
    });
    const runtime = { openPositions: [], paperPortfolio: { quoteFree: 10000, feesPaid: 0, realizedPnl: 0 } };
    const broker = new PaperBroker(config, { info() {}, warn() {}, error() {}, debug() {} });
    const decision = makeDecision();
    const candidate = {
      symbol: "BTCUSDT",
      decision,
      score: { probability: 0.72, regime: "trend" }
    };

    const openedPosition = await broker.enterPosition({
      symbol: candidate.symbol,
      quoteAmount: 250,
      rules: makeRules(),
      marketSnapshot: makeMarketSnapshot(100),
      decision,
      score: candidate.score,
      rawFeatures: { emaSlope: 0.4 },
      strategySummary: decision.strategySummary,
      newsSummary: {},
      entryRationale: { setupId: "trend_following::test", strategy: decision.strategySummary },
      runtime
    });
    openedPosition.highestPrice = 105;
    openedPosition.lowestPrice = 99;
    const trade = await broker.exitPosition({
      position: openedPosition,
      marketSnapshot: makeMarketSnapshot(104),
      reason: "take_profit",
      runtime
    });
    const readmodelSummary = { paperTrades: [{ id: trade.id, symbol: trade.symbol, brokerMode: "paper" }] };
    const dashboardSnapshot = {
      report: {
        recentTrades: [{ id: trade.id, symbol: trade.symbol, brokerMode: "paper" }],
        tradeQualitySummary: { averageExitEfficiencyPct: trade.exitEfficiencyPct }
      }
    };
    const evidence = assertPaperTradeLifecycleContract({
      mode: "paper",
      candidate,
      decision,
      entryAttempt: { status: "executed", openedPosition },
      openedPosition,
      trade,
      readmodelSummary,
      dashboardSnapshot,
      brokersInstantiated: ["paper"],
      expectedClosedTrade: true
    });

    assert.equal(evidence.status, "passed");
    assert.equal(evidence.stages.paperPositionOpened, true);
    assert.equal(evidence.stages.paperTradeClosed, true);
    assert.equal(evidence.stages.readmodelLinked, true);
    assert.equal(evidence.stages.dashboardLinked, true);
    assert.equal(evidence.stages.tradeQualityUpdated, true);
    assert.equal(runtime.openPositions.length, 0);
  });

  await runCheck("paper trade lifecycle contract keeps hard safety blocked before broker", async () => {
    const evidence = buildPaperTradeLifecycleEvidence({
      mode: "paper",
      candidate: {
        symbol: "ETHUSDT",
        decision: {
          allow: false,
          reasons: ["exchange_safety_blocked"],
          riskVerdict: { allowed: false, rejections: [{ code: "exchange_safety_blocked" }] }
        }
      },
      entryAttempt: {
        status: "risk_blocked",
        blockedReasons: ["exchange_safety_blocked"]
      },
      brokersInstantiated: []
    });

    assert.equal(evidence.status, "passed");
    assert.equal(evidence.hardSafetyBlocked, true);
    assert.equal(evidence.stages.executionReached, false);
  });

  await runCheck("paper trade lifecycle contract blocks hard safety bypass if execution appears", async () => {
    const evidence = buildPaperTradeLifecycleEvidence({
      mode: "paper",
      candidate: {
        symbol: "ETHUSDT",
        decision: { allow: false, reasons: ["exchange_safety_blocked"] }
      },
      openedPosition: { id: "bad", symbol: "ETHUSDT", brokerMode: "paper" },
      brokersInstantiated: ["paper"]
    });

    assert.equal(evidence.status, "failed");
    assert.ok(evidence.issues.includes("hard_safety_bypassed"));
  });

  await runCheck("paper trade lifecycle contract reports model confidence blocker without execution", async () => {
    const evidence = buildPaperTradeLifecycleEvidence({
      mode: "paper",
      candidate: {
        symbol: "SOLUSDT",
        decision: {
          allow: false,
          reasons: ["model_confidence_too_low"],
          threshold: 0.55
        }
      },
      entryAttempt: {
        status: "risk_blocked",
        blockedReasons: ["model_confidence_too_low"]
      },
      brokersInstantiated: []
    });

    assert.equal(evidence.status, "passed");
    assert.equal(evidence.modelConfidenceBlocked, true);
    assert.equal(evidence.stages.executionReached, false);
  });

  await runCheck("paper trade lifecycle contract fails if model confidence blocker reaches execution", async () => {
    const evidence = buildPaperTradeLifecycleEvidence({
      mode: "paper",
      candidate: {
        symbol: "SOLUSDT",
        decision: { allow: false, reasons: ["model_confidence_too_low"] }
      },
      entryAttempt: { status: "executed" },
      openedPosition: { id: "bad-confidence", symbol: "SOLUSDT", brokerMode: "paper" },
      brokersInstantiated: ["paper"]
    });

    assert.equal(evidence.status, "failed");
    assert.ok(evidence.issues.includes("model_confidence_bypassed"));
  });

  await runCheck("paper trade lifecycle contract rejects live broker usage in fixtures", async () => {
    const evidence = buildPaperTradeLifecycleEvidence({
      mode: "paper",
      candidate: {
        symbol: "BNBUSDT",
        decision: { allow: true, riskVerdict: { allowed: true } }
      },
      brokersInstantiated: ["paper", "live"]
    });

    assert.equal(evidence.status, "failed");
    assert.equal(evidence.liveBrokerInstantiated, true);
    assert.ok(evidence.issues.includes("live_broker_instantiated"));
  });
}
