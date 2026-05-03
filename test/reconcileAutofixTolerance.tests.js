import {
  AUTO_RECONCILE_DECISION,
  applySafeReconcileAutofix,
  classifyReconcileDecision,
  collectReconcileEvidence
} from "../src/execution/liveBrokerReconcile.js";

const ltcRules = {
  symbol: "LTCUSDT",
  baseAsset: "LTC",
  quoteAsset: "USDT",
  minQty: 0.001,
  stepSize: 0.001,
  marketMinQty: 0.001,
  marketStepSize: 0.001,
  minNotional: 5,
  tickSize: 0.01
};

const xrpRules = {
  symbol: "XRPUSDT",
  baseAsset: "XRP",
  quoteAsset: "USDT",
  minQty: 0.1,
  maxQty: 100000000,
  stepSize: 0.1,
  marketMinQty: 0.1,
  marketMaxQty: 100000000,
  marketStepSize: 0.1,
  minNotional: 5,
  tickSize: 0.0001
};

function makeBroker(config = {}) {
  return {
    config: {
      botMode: "paper",
      paperExecutionVenue: "binance_demo_spot",
      enableExchangeProtection: true,
      enableAutoReconcile: true,
      maxAutoFixNotional: 750,
      ...config
    },
    logger: { warn() {}, info() {} },
    async ensureProtectiveOrder(position) {
      position.protectiveOrderListId = 12345;
      position.protectiveOrders = [{ orderId: 1, orderListId: 12345, side: "SELL" }];
    },
    getOpenProtectiveOrderListsForSymbol(openOrderLists = [], symbol) {
      return openOrderLists.filter((list) => list.symbol === symbol || (list.orders || []).some((order) => order.symbol === symbol));
    },
    attachProtectiveOrderState(position, list) {
      position.protectiveOrderListId = list?.orderListId || 12345;
    },
    clearProtectiveOrderState(position) {
      position.protectiveOrderListId = null;
      position.protectiveOrders = [];
    }
  };
}

function makeMinorDriftEvidence(overrides = {}) {
  return {
    symbol: "LTCUSDT",
    runtimeQuantity: 9.088902,
    exchangeQuantity: 9.09,
    exchangeTotalQuantity: 9.09,
    quantityDiff: 0.001098,
    quantityTolerance: 0.001,
    qtyWithinTolerance: false,
    minorResolvableQuantityDrift: true,
    quantityDriftNotional: 0.061,
    openOrderCount: 0,
    unexpectedOrderCount: 0,
    unexpectedSides: [],
    protectiveListCount: 0,
    exchangeProtectiveLists: [],
    noVenuePosition: false,
    hasVenuePosition: true,
    protectionMissing: true,
    missingLinkedProtection: false,
    runtimeNotional: 508.67,
    autoFixNotionalEligible: true,
    attemptCount: 1,
    ...overrides
  };
}

export async function registerReconcileAutofixToleranceTests({ runCheck, assert }) {
  await runCheck("reconcile treats one-step dust quantity drift plus missing protection as safe rebuild", async () => {
    const broker = makeBroker();
    const position = {
      id: "ltc-pos",
      symbol: "LTCUSDT",
      quantity: 9.088902,
      entryPrice: 56,
      notional: 508.67,
      totalCost: 509,
      entryFee: 0.5,
      protectiveOrderListId: null,
      protectiveOrders: []
    };
    const decision = classifyReconcileDecision(broker, position, makeMinorDriftEvidence());

    assert.equal(decision.decision, AUTO_RECONCILE_DECISION.SAFE_AUTOFIX);
    assert.equal(decision.reason, "missing_protection");
    assert.equal(decision.action, "rebuild_missing_protection");
  });

  await runCheck("reconcile still requires manual review for non-minor quantity mismatch", async () => {
    const broker = makeBroker();
    const position = { id: "ltc-pos", symbol: "LTCUSDT", quantity: 9.08, protectiveOrderListId: null };
    const decision = classifyReconcileDecision(broker, position, makeMinorDriftEvidence({
      runtimeQuantity: 9.08,
      quantityDiff: 0.01,
      quantityDriftNotional: 0.56,
      minorResolvableQuantityDrift: false
    }));

    assert.equal(decision.decision, AUTO_RECONCILE_DECISION.NEEDS_MANUAL_REVIEW);
    assert.equal(decision.reason, "large_qty_mismatch");
  });

  await runCheck("reconcile treats protected one-step drift as minor even when bid ask are missing", async () => {
    const broker = makeBroker({ qtyMismatchTolerance: 0 });
    const position = {
      id: "xrp-pos",
      symbol: "XRPUSDT",
      quantity: 286.713,
      entryPrice: 1.392,
      lastMarkedPrice: 1.39065,
      notional: 399.13,
      protectiveOrderListId: 2605248,
      protectiveOrders: [
        { orderId: 101, orderListId: 2605248, side: "SELL" },
        { orderId: 102, orderListId: 2605248, side: "SELL" }
      ]
    };
    const evidence = collectReconcileEvidence(broker, {
      position,
      rules: xrpRules,
      assetMap: {
        XRP: { total: 286.8, locked: 286.6, free: 0.1 }
      },
      trackedOpenOrders: [
        { symbol: "XRPUSDT", orderId: 101, orderListId: 2605248, side: "SELL", status: "NEW" },
        { symbol: "XRPUSDT", orderId: 102, orderListId: 2605248, side: "SELL", status: "NEW" }
      ],
      openOrderLists: [
        { symbol: "XRPUSDT", orderListId: 2605248, orders: [{ symbol: "XRPUSDT" }] }
      ],
      recentTrades: [],
      marketSnapshot: { book: { bid: 0, ask: 0, mid: null } }
    });
    const decision = classifyReconcileDecision(broker, position, evidence);

    assert.equal(evidence.referenceExitPrice, 1.39065);
    assert.equal(evidence.unexpectedOrderCount, 0);
    assert.equal(evidence.protectiveListCount, 1);
    assert.equal(evidence.minorResolvableQuantityDrift, true);
    assert.equal(decision.decision, AUTO_RECONCILE_DECISION.SAFE_AUTOFIX);
    assert.equal(decision.reason, "minor_qty_drift");
  });

  await runCheck("missing-protection autofix aligns minor drift before rebuilding protection", async () => {
    const broker = makeBroker();
    const position = {
      id: "ltc-pos",
      symbol: "LTCUSDT",
      quantity: 9.088902,
      entryPrice: 56,
      notional: 508.67,
      totalCost: 509,
      entryFee: 0.5,
      protectiveOrderListId: null,
      protectiveOrders: []
    };
    const warnings = [];
    const decision = {
      decision: AUTO_RECONCILE_DECISION.SAFE_AUTOFIX,
      reason: "missing_protection",
      action: "rebuild_missing_protection",
      autofixKind: "missing_protection",
      shouldRetry: false,
      evidenceSummary: { protectionMissing: true, minorResolvableQuantityDrift: true }
    };

    const result = await applySafeReconcileAutofix(broker, {
      position,
      runtime: { openPositions: [position] },
      rules: ltcRules,
      decision,
      evidence: makeMinorDriftEvidence(),
      warnings,
      getMarketSnapshot: async () => ({ book: { bid: 55.62, ask: 55.63, mid: 55.625 } }),
      settings: { dryRun: false }
    });

    assert.equal(result.audit.decision, AUTO_RECONCILE_DECISION.SAFE_AUTOFIX);
    assert.equal(position.quantity, 9.09);
    assert.equal(position.protectiveOrderListId, 12345);
    assert.equal(position.reconcileRequired || false, false);
  });
}
