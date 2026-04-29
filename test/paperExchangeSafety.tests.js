export async function registerPaperExchangeSafetyTests({
  runCheck,
  assert,
  fs,
  path,
  LiveBroker,
  TradingBot,
  RiskManager,
  buildExchangeSafetyAudit,
  makeConfig,
  buildSymbolRules
}) {
  function buildDemoRules({
    symbol = "BTCUSDT",
    baseAsset = "BTC",
    quoteAsset = "USDT"
  } = {}) {
    return buildSymbolRules({
      symbols: [{
        symbol,
        status: "TRADING",
        baseAsset,
        quoteAsset,
        filters: [
          { filterType: "LOT_SIZE", minQty: "0.0001", maxQty: "1000", stepSize: "0.0001" },
          { filterType: "MIN_NOTIONAL", minNotional: "5" },
          { filterType: "PRICE_FILTER", minPrice: "0.01", maxPrice: "1000000", tickSize: "0.01" }
        ]
      }]
    })[symbol];
  }

  function makeDemoConfig(overrides = {}) {
    return makeConfig({
      botMode: "paper",
      paperExecutionVenue: "binance_demo_spot",
      enableStpTelemetryQuery: false,
      priceMismatchToleranceBps: 35,
      demoPaperReconcileConfirmationSamples: 2,
      demoPaperReconcileConfirmationDelayMs: 150,
      demoPaperReconcileAutoClearQuorum: 2,
      demoPaperReconcileMinConfidence: 0.72,
      demoPaperRecentFillGraceMs: 1_000,
      ...overrides
    });
  }

  async function loadFixture(name) {
    const fixturePath = path.join(process.cwd(), "test", "fixtures", name);
    return JSON.parse(await fs.readFile(fixturePath, "utf8"));
  }

  await runCheck("demo paper exchange safety isolates one manual review symbol without global freeze", async () => {
    const audit = buildExchangeSafetyAudit({
      runtime: {
        openPositions: [{
          id: "pos-btc",
          symbol: "BTCUSDT",
          manualReviewRequired: true,
          reconcileRequired: true,
          operatorMode: "protect_only",
          lifecycleState: "manual_review",
          reconcileConfidence: 0.81,
          reconcileClassification: "stale_local_entry_reference",
          reconcileAutonomyState: "awaiting_fresh_fill_confirmation"
        }],
        orderLifecycle: {
          pendingActions: [{
            id: "pos-btc",
            symbol: "BTCUSDT",
            state: "manual_review",
            updatedAt: "2026-04-21T10:00:00.000Z"
          }]
        },
        exchangeTruth: {
          mismatchCount: 0,
          warnings: []
        }
      },
      config: makeConfig({
        botMode: "paper",
        paperExecutionVenue: "binance_demo_spot"
      }),
      nowIso: "2026-04-21T10:05:00.000Z"
    });
    assert.equal(audit.globalFreezeEntries, false);
    assert.equal(audit.status, "watch");
    assert.equal(audit.canTradeOtherSymbols, true);
    assert.equal(audit.blockedSymbols[0]?.symbol, "BTCUSDT");
    assert.equal(audit.blockedSymbols[0]?.reason, "manual_review");
    assert.equal(audit.rootBlockerPriority, "symbol_scoped");
    assert.equal(audit.blockedSymbols[0]?.reconcileClassification, "stale_local_entry_reference");
    assert.equal(audit.blockedSymbols[0]?.autonomousReconcileState, "awaiting_fresh_fill_confirmation");
    assert.equal(audit.blockedSymbols[0]?.reconcileConfidence, 0.81);
  });

  await runCheck("demo paper pure price mismatch auto-resolves after fresh confirmation", async () => {
    const rules = buildDemoRules();
    const client = {
      async getAccountInfo() {
        return {
          balances: [{ asset: "BTC", free: "0.01000000", locked: "0.00000000" }],
          canTrade: true,
          accountType: "SPOT",
          permissions: ["SPOT"]
        };
      },
      async getOpenOrders() {
        return [];
      },
      async getOpenOrderLists() {
        return [{ symbol: "BTCUSDT", orderListId: 123, listStatusType: "EXEC_STARTED", orders: [{ orderId: 1 }, { orderId: 2 }] }];
      },
      async getOrderList() {
        return { symbol: "BTCUSDT", orderListId: 123, listStatusType: "EXEC_STARTED", orders: [{ orderId: 1 }, { orderId: 2 }] };
      },
      async getMyTrades() {
        return [{ symbol: "BTCUSDT", isBuyer: true, qty: "0.01", price: "105", time: Date.now() - 120_000 }];
      }
    };
    const runtime = {
      openPositions: [{
        id: "pos-price-mismatch",
        symbol: "BTCUSDT",
        entryAt: "2026-04-21T09:00:00.000Z",
        entryPrice: 100,
        quantity: 0.01,
        totalCost: 1,
        entryFee: 0,
        notional: 1,
        currentPrice: 100,
        lastMarkedPrice: 100,
        protectiveOrderListId: 123,
        protectiveOrders: [{ orderId: 1 }, { orderId: 2 }],
        protectiveOrderStatus: "NEW",
        brokerMode: "paper",
        operatorMode: "normal"
      }]
    };
    const broker = new LiveBroker({
      client,
      config: makeDemoConfig(),
      logger: { warn() {}, info() {}, error() {} },
      symbolRules: { BTCUSDT: rules }
    });

    const result = await broker.reconcileRuntime({
      runtime,
      journal: { trades: [] },
      getMarketSnapshot: async () => ({ book: { mid: 105.1, bid: 105.05, ask: 105.15 } })
    });
    const position = runtime.openPositions[0];
    assert.equal(position.manualReviewRequired, false);
    assert.equal(position.reconcileRequired, false);
    assert.equal(position.lifecycleState, "protected");
    assert.equal(position.entryPrice, 105);
    assert.equal(position.currentPrice, 105.1);
    assert.equal(position.autoReconcileDecision, "SAFE_AUTOFIX");
    assert.equal(position.reconcileClassification, "recent_fill_not_yet_reflected");
    assert.equal(position.reconcileAutonomyState, "auto_cleared");
    assert.ok(position.lastAutoResolvedAt);
    assert.ok(result.warnings.some((item) => item.issue === "auto_reconcile_entry_reference_refreshed"));
    assert.equal(result.exchangeTruth.autoReconcileSummary.autoResolvedCount, 1);
  });

  await runCheck("demo paper stale local mark state is auto-cleared", async () => {
    const rules = buildDemoRules();
    const client = {
      async getAccountInfo() {
        return {
          balances: [{ asset: "BTC", free: "0.01000000", locked: "0.00000000" }],
          canTrade: true,
          accountType: "SPOT",
          permissions: ["SPOT"]
        };
      },
      async getOpenOrders() {
        return [];
      },
      async getOpenOrderLists() {
        return [{ symbol: "BTCUSDT", orderListId: 223, listStatusType: "EXEC_STARTED", orders: [{ orderId: 3 }, { orderId: 4 }] }];
      },
      async getOrderList() {
        return { symbol: "BTCUSDT", orderListId: 223, listStatusType: "EXEC_STARTED", orders: [{ orderId: 3 }, { orderId: 4 }] };
      },
      async getMyTrades() {
        return [{ symbol: "BTCUSDT", isBuyer: true, qty: "0.01", price: "105", time: Date.now() - 180_000 }];
      }
    };
    const runtime = {
      openPositions: [{
        id: "pos-stale-mark",
        symbol: "BTCUSDT",
        entryAt: "2026-04-21T09:00:00.000Z",
        entryPrice: 105,
        quantity: 0.01,
        totalCost: 1.05,
        entryFee: 0,
        notional: 1.05,
        currentPrice: 99,
        lastMarkedPrice: 99,
        protectiveOrderListId: 223,
        protectiveOrders: [{ orderId: 3 }, { orderId: 4 }],
        protectiveOrderStatus: "NEW",
        brokerMode: "paper",
        operatorMode: "normal"
      }]
    };
    const broker = new LiveBroker({
      client,
      config: makeDemoConfig(),
      logger: { warn() {}, info() {}, error() {} },
      symbolRules: { BTCUSDT: rules }
    });

    const result = await broker.reconcileRuntime({
      runtime,
      journal: { trades: [] },
      getMarketSnapshot: async () => ({ book: { mid: 105.2, bid: 105.15, ask: 105.25 } })
    });
    const position = runtime.openPositions[0];
    assert.equal(position.reconcileRequired, false);
    assert.equal(position.currentPrice, 105.2);
    assert.equal(position.lastMarkedPrice, 105.2);
    assert.equal(position.entryPrice, 105);
    assert.equal(position.reconcileClassification, "stale_local_mark_state");
    assert.equal(position.reconcileAutonomyState, "auto_cleared");
    assert.ok(result.warnings.some((item) => item.issue === "auto_reconcile_mark_state_refreshed"));
  });

  await runCheck("demo paper recent fill mismatch retries then auto-resolves", async () => {
    const rules = buildDemoRules();
    let recentTradeTime = Date.now();
    const client = {
      async getAccountInfo() {
        return {
          balances: [{ asset: "BTC", free: "0.01000000", locked: "0.00000000" }],
          canTrade: true,
          accountType: "SPOT",
          permissions: ["SPOT"]
        };
      },
      async getOpenOrders() {
        return [];
      },
      async getOpenOrderLists() {
        return [{ symbol: "BTCUSDT", orderListId: 323, listStatusType: "EXEC_STARTED", orders: [{ orderId: 5 }, { orderId: 6 }] }];
      },
      async getOrderList() {
        return { symbol: "BTCUSDT", orderListId: 323, listStatusType: "EXEC_STARTED", orders: [{ orderId: 5 }, { orderId: 6 }] };
      },
      async getMyTrades() {
        return [{ symbol: "BTCUSDT", isBuyer: true, qty: "0.01", price: "105", time: recentTradeTime }];
      }
    };
    const runtime = {
      openPositions: [{
        id: "pos-recent-fill",
        symbol: "BTCUSDT",
        entryAt: "2026-04-21T09:59:00.000Z",
        entryPrice: 100,
        quantity: 0.01,
        totalCost: 1,
        entryFee: 0,
        notional: 1,
        currentPrice: 100,
        lastMarkedPrice: 100,
        protectiveOrderListId: 323,
        protectiveOrders: [{ orderId: 5 }, { orderId: 6 }],
        protectiveOrderStatus: "NEW",
        brokerMode: "paper",
        operatorMode: "normal"
      }]
    };
    const broker = new LiveBroker({
      client,
      config: makeDemoConfig({ demoPaperRecentFillGraceMs: 60_000 }),
      logger: { warn() {}, info() {}, error() {} },
      symbolRules: { BTCUSDT: rules }
    });
    broker.syncPosition = async () => null;

    const first = await broker.reconcileRuntime({
      runtime,
      journal: { trades: [] },
      getMarketSnapshot: async () => ({ book: { mid: 105.1, bid: 105.05, ask: 105.15 } })
    });
    const firstPosition = runtime.openPositions[0];
    assert.equal(firstPosition.manualReviewRequired, false);
    assert.equal(firstPosition.reconcileRequired, true);
    assert.equal(firstPosition.lifecycleState, "reconcile_required");
    assert.equal(firstPosition.operatorMode, "protect_only");
    assert.equal(firstPosition.reconcileReason, "recent_fill_not_yet_reflected");
    assert.equal(firstPosition.reconcileAutonomyState, "awaiting_fresh_fill_confirmation");
    assert.ok(first.warnings.some((item) => item.issue === "auto_reconcile_retry_pending"));
    firstPosition.reconcileCooldownUntil = null;

    recentTradeTime = Date.now() - 300_000;
    const second = await broker.reconcileRuntime({
      runtime,
      journal: { trades: [] },
      getMarketSnapshot: async () => ({ book: { mid: 105.1, bid: 105.05, ask: 105.15 } })
    });
    const secondPosition = runtime.openPositions[0];
    assert.equal(secondPosition.reconcileRequired, false);
    assert.equal(secondPosition.manualReviewRequired, false);
    assert.equal(secondPosition.entryPrice, 105);
    assert.equal(secondPosition.reconcileAutonomyState, "auto_cleared");
    assert.ok(second.warnings.some((item) => item.issue === "auto_reconcile_entry_reference_refreshed"));
  });

  await runCheck("demo paper missing protection is rebuilt and revalidated", async () => {
    const rules = buildDemoRules();
    let protectionInstalled = false;
    const client = {
      async getAccountInfo() {
        return {
          balances: [{ asset: "BTC", free: "0.01000000", locked: "0.00000000" }],
          canTrade: true,
          accountType: "SPOT",
          permissions: ["SPOT"]
        };
      },
      async getOpenOrders() {
        return [];
      },
      async getOpenOrderLists() {
        if (!protectionInstalled) {
          return [];
        }
        return [{ symbol: "BTCUSDT", orderListId: 777, listStatusType: "EXEC_STARTED", orders: [{ orderId: 11 }, { orderId: 12 }] }];
      },
      async getOrderList() {
        return { symbol: "BTCUSDT", orderListId: 777, listStatusType: "EXEC_STARTED", orders: [{ orderId: 11 }, { orderId: 12 }] };
      },
      async getMyTrades() {
        return [{ symbol: "BTCUSDT", isBuyer: true, qty: "0.01", price: "100", time: Date.now() - 180_000 }];
      }
    };
    const runtime = {
      openPositions: [{
        id: "pos-rebuild-protection",
        symbol: "BTCUSDT",
        entryAt: "2026-04-21T09:00:00.000Z",
        entryPrice: 100,
        quantity: 0.01,
        totalCost: 1,
        entryFee: 0,
        notional: 1,
        currentPrice: 100,
        lastMarkedPrice: 100,
        protectiveOrderListId: null,
        protectiveOrders: [],
        protectiveOrderStatus: null,
        brokerMode: "paper",
        operatorMode: "normal"
      }]
    };
    const broker = new LiveBroker({
      client,
      config: makeDemoConfig(),
      logger: { warn() {}, info() {}, error() {} },
      symbolRules: { BTCUSDT: rules }
    });
    let rebuildCount = 0;
    broker.ensureProtectiveOrder = async (position) => {
      rebuildCount += 1;
      protectionInstalled = true;
      position.protectiveOrderListId = 777;
      position.protectiveOrders = [{ orderId: 11 }, { orderId: 12 }];
      position.protectiveOrderStatus = "NEW";
      return { orderListId: 777 };
    };

    const result = await broker.reconcileRuntime({
      runtime,
      journal: { trades: [] },
      getMarketSnapshot: async () => ({ book: { mid: 100.1, bid: 100.05, ask: 100.15 } })
    });
    const position = runtime.openPositions[0];
    assert.equal(rebuildCount, 1);
    assert.equal(position.reconcileRequired, false);
    assert.equal(position.manualReviewRequired, false);
    assert.equal(position.protectiveOrderListId, 777);
    assert.equal(position.reconcileClassification, "recoverable_missing_protection");
    assert.equal(position.reconcileAutonomyState, "auto_cleared");
    assert.ok(result.warnings.some((item) => item.issue === "auto_reconcile_protection_restored"));
  });

  await runCheck("demo paper protection issue on one symbol stays symbol scoped before global freeze", async () => {
    const audit = buildExchangeSafetyAudit({
      runtime: {
        openPositions: [{
          id: "pos-eth",
          symbol: "ETHUSDT",
          reconcileRequired: true,
          operatorMode: "protect_only",
          lifecycleState: "protect_only"
        }],
        orderLifecycle: { pendingActions: [] },
        exchangeTruth: {
          mismatchCount: 0,
          warnings: [{ symbol: "ETHUSDT", issue: "protective_order_rebuild_failed" }]
        }
      },
      config: makeConfig({
        botMode: "paper",
        paperExecutionVenue: "binance_demo_spot"
      }),
      nowIso: "2026-04-21T10:10:00.000Z"
    });
    assert.equal(audit.globalFreezeEntries, false);
    assert.equal(audit.canTradeOtherSymbols, true);
    assert.equal(audit.blockedSymbols[0]?.symbol, "ETHUSDT");
    assert.equal(audit.blockedSymbols[0]?.reason, "protective_order_rebuild_failed");
  });

  await runCheck("demo paper still globally freezes on real inventory drift", async () => {
    const audit = buildExchangeSafetyAudit({
      runtime: {
        openPositions: [],
        orderLifecycle: { pendingActions: [] },
        exchangeTruth: {
          mismatchCount: 1,
          missingRuntimeSymbols: ["BTCUSDT"],
          warnings: []
        }
      },
      config: makeConfig({
        botMode: "paper",
        paperExecutionVenue: "binance_demo_spot"
      }),
      nowIso: "2026-04-21T10:10:00.000Z"
    });
    assert.equal(audit.globalFreezeEntries, true);
    assert.equal(audit.globalFreezeReason, "hard_inventory_drift");
    assert.equal(audit.canTradeOtherSymbols, false);
  });

  await runCheck("demo paper hard inventory conflict still escalates to manual review", async () => {
    const rules = buildDemoRules();
    const client = {
      async getAccountInfo() {
        return {
          balances: [{ asset: "BTC", free: "0.02000000", locked: "0.00000000" }],
          canTrade: true,
          accountType: "SPOT",
          permissions: ["SPOT"]
        };
      },
      async getOpenOrders() {
        return [];
      },
      async getOpenOrderLists() {
        return [{ symbol: "BTCUSDT", orderListId: 423, listStatusType: "EXEC_STARTED", orders: [{ orderId: 7 }, { orderId: 8 }] }];
      },
      async getOrderList() {
        return { symbol: "BTCUSDT", orderListId: 423, listStatusType: "EXEC_STARTED", orders: [{ orderId: 7 }, { orderId: 8 }] };
      },
      async getMyTrades() {
        return [{ symbol: "BTCUSDT", isBuyer: true, qty: "0.02", price: "100", time: Date.now() - 180_000 }];
      }
    };
    const runtime = {
      openPositions: [{
        id: "pos-hard-conflict",
        symbol: "BTCUSDT",
        entryAt: "2026-04-21T09:00:00.000Z",
        entryPrice: 100,
        quantity: 0.01,
        totalCost: 1,
        entryFee: 0,
        notional: 1,
        protectiveOrderListId: 423,
        protectiveOrders: [{ orderId: 7 }, { orderId: 8 }],
        protectiveOrderStatus: "NEW",
        brokerMode: "paper",
        operatorMode: "normal"
      }]
    };
    const broker = new LiveBroker({
      client,
      config: makeDemoConfig({ qtyMismatchTolerance: 0 }),
      logger: { warn() {}, info() {}, error() {} },
      symbolRules: { BTCUSDT: rules }
    });

    const result = await broker.reconcileRuntime({
      runtime,
      journal: { trades: [] },
      getMarketSnapshot: async () => ({ book: { mid: 100, bid: 99.95, ask: 100.05 } })
    });
    const position = runtime.openPositions[0];
    assert.equal(position.manualReviewRequired, true);
    assert.equal(position.reconcileRequired, true);
    assert.equal(position.lifecycleState, "manual_review");
    assert.equal(position.reconcileReason, "large_qty_mismatch");
    assert.ok(result.warnings.some((item) => item.issue === "auto_reconcile_manual_review_required"));
  });

  await runCheck("demo paper hard inventory conflict fixture keeps manual review deterministic", async () => {
    const fixture = await loadFixture("demo-paper-hard-inventory-conflict.json");
    const rules = buildDemoRules({
      symbol: fixture.symbol,
      baseAsset: fixture.baseAsset,
      quoteAsset: fixture.quoteAsset
    });
    const client = {
      async getAccountInfo() {
        return fixture.accountInfo;
      },
      async getOpenOrders() {
        return fixture.openOrders;
      },
      async getOpenOrderLists() {
        return fixture.openOrderLists;
      },
      async getOrderList() {
        return fixture.openOrderLists[0] || null;
      },
      async getMyTrades() {
        return fixture.recentTrades;
      }
    };
    const runtime = {
      openPositions: [{
        ...fixture.position
      }]
    };
    const broker = new LiveBroker({
      client,
      config: makeDemoConfig({ qtyMismatchTolerance: 0 }),
      logger: { warn() {}, info() {}, error() {} },
      symbolRules: { [fixture.symbol]: rules }
    });

    const result = await broker.reconcileRuntime({
      runtime,
      journal: { trades: [] },
      getMarketSnapshot: async () => fixture.marketSnapshot
    });
    const position = runtime.openPositions[0];
    assert.equal(position.autoReconcileDecision, fixture.expected.decision);
    assert.equal(position.reconcileReason, fixture.expected.reason);
    assert.equal(position.reconcileClassification, fixture.expected.classification);
    assert.equal(position.manualReviewRequired, true);
    assert.equal(position.lifecycleState, "manual_review");
    assert.equal(position.reconcileAutonomyState, "manual_review_required");
    assert.ok(Array.isArray(position.reconcileRetryHistory));
    assert.equal(position.reconcileRetryHistory.at(-1)?.reason, fixture.expected.reason);
    assert.equal(position.reconcileRetrySummary.manualReviewCount, 1);
    assert.equal(position.reconcileRetrySummary.escalatedAfterAttempts, 1);
    assert.ok(result.exchangeTruth.autoReconcileAudits.some((item) =>
      item.symbol === fixture.symbol &&
      item.reason === fixture.expected.reason &&
      item.decision === fixture.expected.decision
    ));
  });

  await runCheck("live mode remains strict on large price mismatch", async () => {
    const rules = buildDemoRules();
    const client = {
      async getAccountInfo() {
        return {
          balances: [{ asset: "BTC", free: "0.01000000", locked: "0.00000000" }],
          canTrade: true,
          accountType: "SPOT",
          permissions: ["SPOT"]
        };
      },
      async getOpenOrders() {
        return [];
      },
      async getOpenOrderLists() {
        return [{ symbol: "BTCUSDT", orderListId: 523, listStatusType: "EXEC_STARTED", orders: [{ orderId: 9 }, { orderId: 10 }] }];
      },
      async getOrderList() {
        return { symbol: "BTCUSDT", orderListId: 523, listStatusType: "EXEC_STARTED", orders: [{ orderId: 9 }, { orderId: 10 }] };
      },
      async getMyTrades() {
        return [{ symbol: "BTCUSDT", isBuyer: true, qty: "0.01", price: "105", time: Date.now() - 180_000 }];
      }
    };
    const runtime = {
      openPositions: [{
        id: "pos-live-strict",
        symbol: "BTCUSDT",
        entryAt: "2026-04-21T09:00:00.000Z",
        entryPrice: 100,
        quantity: 0.01,
        totalCost: 1,
        entryFee: 0,
        notional: 1,
        protectiveOrderListId: 523,
        protectiveOrders: [{ orderId: 9 }, { orderId: 10 }],
        protectiveOrderStatus: "NEW",
        brokerMode: "live",
        operatorMode: "normal"
      }]
    };
    const broker = new LiveBroker({
      client,
      config: makeConfig({
        botMode: "live",
        enableStpTelemetryQuery: false,
        priceMismatchToleranceBps: 35
      }),
      logger: { warn() {}, info() {}, error() {} },
      symbolRules: { BTCUSDT: rules }
    });

    const result = await broker.reconcileRuntime({
      runtime,
      journal: { trades: [] },
      getMarketSnapshot: async () => ({ book: { mid: 105.1, bid: 105.05, ask: 105.15 } })
    });
    const position = runtime.openPositions[0];
    assert.equal(position.manualReviewRequired, true);
    assert.equal(position.lifecycleState, "manual_review");
    assert.equal(position.reconcileReason, "large_price_mismatch");
    assert.equal(position.autoReconcileDecision, "NEEDS_MANUAL_REVIEW");
    assert.ok(result.warnings.some((item) => item.issue === "auto_reconcile_manual_review_required" && item.reason === "large_price_mismatch"));
  });

  await runCheck("openBestCandidate skips blocked demo-paper symbol and can still open a clean symbol", async () => {
    const bot = Object.create(TradingBot.prototype);
    bot.config = makeConfig({ botMode: "paper", paperExecutionVenue: "binance_demo_spot" });
    bot.runtime = {
      exchangeTruth: { unmatchedOrderSymbols: [], orphanedSymbols: [] },
      exchangeSafety: {
        globalFreezeEntries: false,
        blockedSymbols: [{ symbol: "BTCUSDT", reason: "manual_review" }]
      },
      signalFlow: { lastCycle: { rejectionReasons: {}, rejectionCategories: {} } }
    };
    bot.symbolRules = { BTCUSDT: { minNotional: 5 }, ETHUSDT: { minNotional: 5 } };
    bot.health = { canEnterNewPositions() { return true; } };
    bot.logger = { info() {}, warn() {}, error() {} };
    bot.recordEvent = () => {};
    bot.updateDecisionFunnelCycle = () => {};
    bot.updateDecisionFunnelSymbol = () => {};
    bot.noteEntryAttempt = () => {};
    bot.notePaperTradeAttempt = () => {};
    bot.notePaperTradeExecuted = () => {};
    bot.buildEntryRationale = () => ({});
    bot.noteEntryExecuted = () => {};
    bot.markReportDirty = () => {};
    bot.broker = {
      async enterPosition({ symbol }) {
        return { id: `pos-${symbol}`, symbol };
      }
    };
    const attempt = await TradingBot.prototype.openBestCandidate.call(bot, [
      {
        symbol: "BTCUSDT",
        marketSnapshot: { book: { mid: 100, bid: 99.9, ask: 100.1 } },
        strategySummary: { activeStrategy: "ema_trend" },
        regimeSummary: { regime: "trend" },
        metaSummary: {},
        rawFeatures: { ok: true },
        score: {},
        decision: { allow: true, quoteAmount: 15, executionPlan: {}, sizingSummary: { meaningfulSizeFloor: 10 } }
      },
      {
        symbol: "ETHUSDT",
        marketSnapshot: { book: { mid: 100, bid: 99.9, ask: 100.1 } },
        strategySummary: { activeStrategy: "ema_trend" },
        regimeSummary: { regime: "trend" },
        metaSummary: {},
        rawFeatures: { ok: true },
        score: {},
        decision: { allow: true, quoteAmount: 15, executionPlan: {}, sizingSummary: { meaningfulSizeFloor: 10 } }
      }
    ]);
    assert.equal(attempt.status, "opened");
    assert.equal(attempt.openedPosition?.symbol, "ETHUSDT");
    assert.ok(attempt.symbolBlockers.some((item) => item.symbol === "BTCUSDT" && item.reason === "manual_review"));
  });

  await runCheck("paper sizing floor prevents high-quality near-min setups from collapsing into tiny notionals", async () => {
    const manager = new RiskManager(makeConfig({
      botMode: "paper",
      maxPositionFraction: 0.0144,
      minTradeUsdt: 25,
      paperMinTradeUsdt: 10
    }));
    const decision = manager.evaluateEntry({
      symbol: "BTCUSDT",
      score: {
        probability: 0.782,
        rawProbability: 0.79,
        calibrationConfidence: 0.82,
        disagreement: 0.03,
        shouldAbstain: false
      },
      marketSnapshot: {
        market: {
          trendScore: 0.68,
          trendStrength: 0.64,
          atrPct: 0.01,
          realizedVolPct: 0.018,
          bullishBosActive: true,
          bosStrengthScore: 0.66,
          closeLocationQuality: 0.72,
          volumeAcceptanceScore: 0.7,
          anchoredVwapAcceptanceScore: 0.69,
          breakoutFollowThroughScore: 0.62
        },
        book: {
          ask: 100,
          bid: 99.99,
          mid: 100,
          spreadBps: 1,
          bookPressure: 0.3,
          depthConfidence: 0.94,
          totalDepthNotional: 250000,
          replenishmentScore: 0.45,
          queueRefreshScore: 0.38,
          resilienceScore: 0.4,
          localBook: { depthConfidence: 0.94 }
        }
      },
      newsSummary: {
        riskScore: 0.04,
        coverage: 0.7,
        confidence: 0.8,
        reliabilityScore: 0.82,
        freshnessScore: 0.82,
        sentimentScore: 0.11
      },
      announcementSummary: { riskScore: 0.02, coverage: 0.55, confidence: 0.92, freshnessScore: 0.9 },
      marketStructureSummary: { riskScore: 0.08, coverage: 1, signalScore: 0.34 },
      marketSentimentSummary: { riskScore: 0.08, coverage: 0.8, confidence: 0.78 },
      volatilitySummary: { riskScore: 0.12, coverage: 0.85, confidence: 0.8 },
      calendarSummary: { riskScore: 0.01, proximityHours: 999 },
      committeeSummary: { agreement: 0.9, probability: 0.79, confidence: 0.78, netScore: 0.16, sizeMultiplier: 1, vetoes: [] },
      rlAdvice: { action: "balanced", sizeMultiplier: 1, expectedReward: 0.02 },
      strategySummary: { activeStrategy: "ema_trend", family: "trend_following", fitScore: 0.9, confidence: 0.82, blockers: [], agreementGap: 0.01 },
      sessionSummary: { blockerReasons: [], lowLiquidity: false, riskScore: 0.02, sizeMultiplier: 1, thresholdPenalty: 0, session: "europe", isWeekend: false },
      driftSummary: { severity: 0, reasons: [], blockerReasons: [] },
      selfHealState: { mode: "normal", sizeMultiplier: 1, thresholdPenalty: 0, issues: [], learningAllowed: true },
      metaSummary: { action: "allow", reasons: [], sizeMultiplier: 1, thresholdPenalty: 0, score: 0.9 },
      runtime: { openPositions: [], exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] } },
      journal: { trades: [] },
      balance: { quoteFree: 500 },
      symbolStats: {},
      portfolioSummary: { sizeMultiplier: 1, blockingReasons: [], reasons: [], advisoryReasons: [] },
      regimeSummary: { regime: "trend", confidence: 0.82, reasons: [] },
      thresholdTuningSummary: {},
      parameterGovernorSummary: {},
      capitalLadderSummary: {},
      capitalGovernorSummary: {},
      executionCostSummary: {},
      strategyRetirementSummary: {},
      timeframeSummary: { alignmentScore: 0.82, higherBias: 0.45, blockerReasons: [] },
      pairHealthSummary: { score: 1, quarantined: false, reasons: [] },
      onChainLiteSummary: { liquidityScore: 0.7, stressScore: 0.04, riskOffScore: 0.05, marketBreadthScore: 0.68, trendingScore: 0.1, majorsMomentumScore: 0.6 },
      venueConfirmationSummary: { status: "confirmed", confirmed: true, venueCount: 2, averageHealthScore: 0.86 },
      qualityQuorumSummary: { status: "ready", quorumScore: 1, observeOnly: false, blockerReasons: [] },
      divergenceSummary: { averageScore: 0, blockerReasons: [] },
      marketConditionSummary: { conditionId: "trend_acceptance", conditionConfidence: 0.66, conditionRisk: 0.1 },
      paperLearningGuidance: {},
      offlineLearningGuidance: {},
      exchangeCapabilitiesSummary: {},
      symbolRules: { minNotional: 5 },
      nowIso: "2026-04-21T10:00:00.000Z"
    });
    assert.equal(decision.allow, true);
    assert.ok(!decision.reasons.includes("trade_size_below_minimum"));
    assert.ok((decision.quoteAmount || 0) >= 10);
    assert.equal(decision.sizingSummary.paperSizeFloorLiftApplied, true);
    assert.ok(["bounded_paper_floor", "strict_near_miss", "high_alpha_rescue"].includes(decision.sizingSummary.paperSizeFloorReason));
  });
}
