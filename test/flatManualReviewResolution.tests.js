function makeLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {}
  };
}

function makeModelStub() {
  return {
    getState() { return {}; },
    getCalibrationSummary() { return {}; },
    getDeploymentSummary() { return {}; },
    getTransformerSummary() { return {}; },
    getStrategyAllocationSummary() { return {}; },
    getWeightView() { return []; }
  };
}

export async function registerFlatManualReviewResolutionTests({
  runCheck,
  assert,
  fs,
  os,
  path,
  LiveBroker,
  DemoPaperBroker,
  TradingBot,
  makeConfig,
  buildSymbolRules,
  buildExchangeSafetyAudit
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
      enableExchangeProtection: true,
      ...overrides
    });
  }

  function makeClient({
    balances = [{ asset: "BTC", free: "0.00000000", locked: "0.00000000" }],
    openOrders = [],
    openOrderLists = [],
    recentTrades = []
  } = {}) {
    return {
      async getAccountInfo() {
        return {
          balances,
          canTrade: true,
          accountType: "SPOT",
          permissions: ["SPOT"]
        };
      },
      async getOpenOrders() {
        return openOrders;
      },
      async getOpenOrderLists() {
        return openOrderLists;
      },
      async getMyTrades() {
        return recentTrades;
      }
    };
  }

  function makePosition(overrides = {}) {
    return {
      id: "pos-1",
      symbol: "BTCUSDT",
      entryAt: "2026-04-21T09:00:00.000Z",
      entryPrice: 100,
      quantity: 0.01,
      totalCost: 1,
      entryFee: 0,
      notional: 1,
      currentPrice: 100,
      lastMarkedPrice: 100,
      highestPrice: 102,
      lowestPrice: 99,
      lifecycleState: "manual_review",
      operatorMode: "protect_only",
      manualReviewRequired: true,
      reconcileRequired: true,
      protectiveOrders: [],
      protectiveOrderListId: null,
      brokerMode: "paper",
      ...overrides
    };
  }

  await runCheck("flat venue + no orders => position removed locally", async () => {
    const rules = buildDemoRules();
    const runtime = {
      openPositions: [makePosition()]
    };
    const broker = new DemoPaperBroker({
      client: makeClient(),
      config: makeDemoConfig(),
      logger: makeLogger(),
      symbolRules: { BTCUSDT: rules }
    });

    const result = await broker.resolveFlatManualReviewPosition({
      position: runtime.openPositions[0],
      runtime,
      getMarketSnapshot: async () => ({ book: { mid: 101, bid: 100.95, ask: 101.05 } })
    });

    assert.equal(result.allowed, true);
    assert.equal(result.diagnostics.status, "safe_flat_confirmed");
    assert.equal(runtime.openPositions.length, 0);
    assert.equal(result.closedTrade.symbol, "BTCUSDT");
    assert.equal(result.closedTrade.reason, "operator_resolve_flat_manual_review_position");
    assert.equal(result.focusedReconcileRefresh.status, "safe_flat_confirmed");
  });

  await runCheck("flat venue but open order remains => deny forced local close", async () => {
    const rules = buildDemoRules();
    const runtime = {
      openPositions: [makePosition({
        protectiveOrders: [{ orderId: 8123 }]
      })]
    };
    const broker = new DemoPaperBroker({
      client: makeClient({
        openOrders: [{
          symbol: "BTCUSDT",
          orderId: 8123,
          side: "SELL",
          status: "NEW"
        }]
      }),
      config: makeDemoConfig(),
      logger: makeLogger(),
      symbolRules: { BTCUSDT: rules }
    });

    const result = await broker.resolveFlatManualReviewPosition({
      position: runtime.openPositions[0],
      runtime,
      getMarketSnapshot: async () => ({ book: { mid: 101, bid: 100.95, ask: 101.05 } })
    });

    assert.equal(result.allowed, false);
    assert.equal(result.diagnostics.status, "still_has_open_orders");
    assert.equal(runtime.openPositions.length, 1);
    assert.equal(result.closedTrade, null);
  });

  await runCheck("live mode denies relaxed operator flat close", async () => {
    const rules = buildDemoRules();
    const runtime = {
      openPositions: [makePosition({ brokerMode: "live" })]
    };
    const broker = new LiveBroker({
      client: makeClient(),
      config: makeConfig({ botMode: "live", enableExchangeProtection: true }),
      logger: makeLogger(),
      symbolRules: { BTCUSDT: rules }
    });

    const result = await broker.resolveFlatManualReviewPosition({
      position: runtime.openPositions[0],
      runtime,
      getMarketSnapshot: async () => ({ book: { mid: 101, bid: 100.95, ask: 101.05 } })
    });

    assert.equal(result.allowed, false);
    assert.equal(result.diagnostics.status, "unsupported_mode");
    assert.equal(runtime.openPositions.length, 1);
  });

  await runCheck("paper/demo stuck manual review diagnostics action safely closes local flat position", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-flat-close-"));
    const config = makeDemoConfig({ runtimeDir });
    const rules = buildDemoRules();
    const bot = new TradingBot({
      config,
      logger: makeLogger()
    });
    bot.model = makeModelStub();
    bot.modelBackups = [];
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.runtime = {
      openPositions: [makePosition()],
      latestDecisions: [],
      latestBlockedSetups: [],
      signalFlow: {},
      ops: { diagnosticsActions: { history: [] } },
      orderLifecycle: { pendingActions: [] },
      exchangeTruth: {},
      exchangeSafety: {},
      service: {},
      health: {},
      marketHistory: {},
      capitalGovernor: {}
    };
    bot.broker = new DemoPaperBroker({
      client: makeClient(),
      config,
      logger: makeLogger(),
      symbolRules: { BTCUSDT: rules }
    });
    bot.getMarketSnapshot = async () => ({ book: { mid: 101.5, bid: 101.45, ask: 101.55 } });
    bot.learnFromTrade = async () => ({ learned: true });
    bot.markReportDirty = () => {};
    bot.refreshOperationalViews = () => {};
    bot.syncOrderLifecycleState = () => bot.runtime.orderLifecycle;
    bot.persistRuntimeAndSnapshot = async () => ({ dashboard: { operatorDiagnostics: { quickActions: [] } } });

    const result = await bot.performDiagnosticsAction({
      action: "resolve_flat_manual_review_position",
      target: "pos-1",
      note: "operator confirmed flat"
    });

    assert.equal(bot.runtime.openPositions.length, 0);
    assert.equal(bot.journal.trades.length, 1);
    assert.equal(bot.journal.trades[0].brokerMode, "paper");
    assert.equal(result.diagnosticsActionResult.allowed, true);
    assert.equal(result.diagnosticsActionResult.diagnostics.status, "safe_flat_confirmed");
    assert.equal(result.diagnosticsActionResult.focusedReconcileRefresh.status, "safe_flat_confirmed");
    assert.equal(bot.runtime.ops.diagnosticsActions.history[0].action, "resolve_flat_manual_review_position");
    assert.equal(bot.runtime.ops.diagnosticsActions.history[0].status, "completed");
  });

  await runCheck("successful flat close clears openPositions and lifecycle pendingActions", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-flat-close-cleanup-"));
    const config = makeDemoConfig({ runtimeDir });
    const rules = buildDemoRules({ symbol: "BCHUSDT", baseAsset: "BCH" });
    const bot = new TradingBot({
      config,
      logger: makeLogger()
    });
    bot.model = makeModelStub();
    bot.modelBackups = [];
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.runtime = {
      openPositions: [makePosition({ id: "pos-bch", symbol: "BCHUSDT" })],
      latestDecisions: [],
      latestBlockedSetups: [],
      signalFlow: {},
      ops: { diagnosticsActions: { history: [] } },
      orderLifecycle: {
        pendingActions: [
          { id: "pos-bch", symbol: "BCHUSDT", state: "manual_review" },
          { id: "pos-bch", symbol: "BCHUSDT", state: "protect_only" },
          { id: "keep-me", symbol: "ETHUSDT", state: "manual_review" }
        ]
      },
      exchangeTruth: {
        mismatchCount: 1,
        orphanedSymbols: ["BCHUSDT"],
        missingRuntimeSymbols: ["BCHUSDT"],
        unmatchedOrderSymbols: ["BCHUSDT"],
        manualInterferenceSymbols: ["BCHUSDT"],
        staleProtectiveSymbols: ["BCHUSDT"],
        warnings: [
          { symbol: "BCHUSDT", issue: "protective_order_state_stale" },
          { symbol: "BCHUSDT", issue: "runtime_position_missing_on_exchange" }
        ],
        autoReconcileAudits: [{ symbol: "BCHUSDT", decision: "NEEDS_MANUAL_REVIEW" }]
      },
      exchangeSafety: {},
      service: {},
      health: {},
      marketHistory: {},
      capitalGovernor: {}
    };
    bot.broker = new DemoPaperBroker({
      client: makeClient({
        balances: [{ asset: "BCH", free: "0.00000000", locked: "0.00000000" }]
      }),
      config,
      logger: makeLogger(),
      symbolRules: { BCHUSDT: rules }
    });
    bot.getMarketSnapshot = async () => ({ book: { mid: 501.5, bid: 501.45, ask: 501.55 } });
    bot.learnFromTrade = async () => ({ learned: true });
    bot.markReportDirty = () => {};
    bot.syncOrderLifecycleState = () => bot.runtime.orderLifecycle;
    bot.refreshOperationalViews = () => {
      bot.runtime.exchangeSafety = buildExchangeSafetyAudit({
        runtime: bot.runtime,
        config,
        report: { recentEvents: [] },
        streamStatus: {},
        nowIso: "2026-04-22T12:00:00.000Z"
      });
    };
    bot.persistRuntimeAndSnapshot = async () => ({ dashboard: { operatorDiagnostics: { quickActions: [] } } });

    const result = await bot.performDiagnosticsAction({
      action: "resolve_flat_manual_review_position",
      target: "pos-bch",
      note: "operator confirmed flat"
    });

    assert.equal(result.diagnosticsActionResult.allowed, true);
    assert.equal(bot.runtime.openPositions.length, 0);
    assert.deepEqual(
      bot.runtime.orderLifecycle.pendingActions.map((item) => `${item.symbol}:${item.state}`),
      ["ETHUSDT:manual_review"]
    );
    assert.deepEqual(result.diagnosticsActionResult.cleanup.cleanedLists, [
      "orderLifecycle.pendingActions",
      "exchangeTruth.orphanedSymbols",
      "exchangeTruth.missingRuntimeSymbols",
      "exchangeTruth.unmatchedOrderSymbols",
      "exchangeTruth.manualInterferenceSymbols",
      "exchangeTruth.staleProtectiveSymbols",
      "exchangeTruth.warnings",
      "exchangeTruth.autoReconcileAudits"
    ]);
    assert.equal(bot.runtime.exchangeTruth.lastPaperSymbolCleanup.symbol, "BCHUSDT");
    assert.equal(bot.runtime.exchangeTruth.lastPaperSymbolCleanup.freezeEntriesBefore, false);
    assert.equal(bot.runtime.exchangeTruth.lastPaperSymbolCleanup.freezeEntriesAfter, false);
    assert.equal(result.diagnosticsActionResult.blockerDelta.symbolBlockedBefore, false);
    assert.equal(result.diagnosticsActionResult.blockerDelta.symbolBlockedAfter, false);
  });

  await runCheck("successful flat close clears symbol from exchangeTruth hard-drift arrays and stale warnings", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-flat-close-exchange-truth-"));
    const config = makeDemoConfig({ runtimeDir });
    const rules = buildDemoRules({ symbol: "BCHUSDT", baseAsset: "BCH" });
    const bot = new TradingBot({
      config,
      logger: makeLogger()
    });
    bot.model = makeModelStub();
    bot.modelBackups = [];
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.runtime = {
      openPositions: [makePosition({ id: "pos-bch", symbol: "BCHUSDT" })],
      latestDecisions: [],
      latestBlockedSetups: [],
      signalFlow: {},
      ops: { diagnosticsActions: { history: [] } },
      orderLifecycle: { pendingActions: [{ id: "pos-bch", symbol: "BCHUSDT", state: "manual_review" }] },
      exchangeTruth: {
        mismatchCount: 2,
        orphanedSymbols: ["BCHUSDT"],
        missingRuntimeSymbols: ["BCHUSDT"],
        unmatchedOrderSymbols: ["BCHUSDT"],
        manualInterferenceSymbols: ["BCHUSDT"],
        staleProtectiveSymbols: ["BCHUSDT"],
        recentFillSymbols: ["BCHUSDT"],
        warnings: [
          { symbol: "BCHUSDT", issue: "protective_order_state_stale" },
          { symbol: "BCHUSDT", issue: "runtime_position_missing_on_exchange" }
        ],
        autoReconcileAudits: [{ symbol: "BCHUSDT", decision: "NEEDS_MANUAL_REVIEW" }]
      },
      exchangeSafety: {},
      service: {},
      health: {},
      marketHistory: {},
      capitalGovernor: {}
    };
    bot.broker = new DemoPaperBroker({
      client: makeClient({
        balances: [{ asset: "BCH", free: "0.00000000", locked: "0.00000000" }]
      }),
      config,
      logger: makeLogger(),
      symbolRules: { BCHUSDT: rules }
    });
    bot.getMarketSnapshot = async () => ({ book: { mid: 501.5, bid: 501.45, ask: 501.55 } });
    bot.learnFromTrade = async () => ({ learned: true });
    bot.markReportDirty = () => {};
    bot.syncOrderLifecycleState = () => bot.runtime.orderLifecycle;
    bot.refreshOperationalViews = () => {};
    bot.persistRuntimeAndSnapshot = async () => ({ dashboard: { operatorDiagnostics: { quickActions: [] } } });

    await bot.performDiagnosticsAction({
      action: "resolve_flat_manual_review_position",
      target: "pos-bch",
      note: "operator confirmed flat"
    });

    assert.deepEqual(bot.runtime.exchangeTruth.orphanedSymbols || [], []);
    assert.deepEqual(bot.runtime.exchangeTruth.missingRuntimeSymbols || [], []);
    assert.deepEqual(bot.runtime.exchangeTruth.unmatchedOrderSymbols || [], []);
    assert.deepEqual(bot.runtime.exchangeTruth.manualInterferenceSymbols || [], []);
    assert.deepEqual(bot.runtime.exchangeTruth.staleProtectiveSymbols || [], []);
    assert.deepEqual(bot.runtime.exchangeTruth.warnings || [], []);
    assert.deepEqual(bot.runtime.exchangeTruth.autoReconcileAudits || [], []);
    assert.equal(bot.runtime.exchangeTruth.mismatchCount, 0);
  });

  await runCheck("after cleanup exchange safety no longer global-freezes when no real mismatch remains", async () => {
    const config = makeDemoConfig();
    const runtime = {
      openPositions: [],
      orderLifecycle: { pendingActions: [] },
      exchangeTruth: {
        mismatchCount: 0,
        orphanedSymbols: [],
        missingRuntimeSymbols: [],
        unmatchedOrderSymbols: [],
        manualInterferenceSymbols: [],
        staleProtectiveSymbols: [],
        warnings: [],
        autoReconcileAudits: []
      }
    };
    const audit = buildExchangeSafetyAudit({
      runtime,
      config,
      report: { recentEvents: [] },
      streamStatus: {},
      nowIso: "2026-04-22T12:00:00.000Z"
    });

    assert.equal(audit.globalFreezeEntries, false);
    assert.equal(audit.status, "ready");
    assert.deepEqual(audit.blockedSymbols, []);
  });

  await runCheck("resolved demo-paper symbol no longer appears in blockedSymbols while unrelated symbol remains blocked", async () => {
    const config = makeDemoConfig();
    const audit = buildExchangeSafetyAudit({
      runtime: {
        openPositions: [],
        orderLifecycle: {
          pendingActions: [{ id: "other-pos", symbol: "ETHUSDT", state: "manual_review" }]
        },
        exchangeTruth: {
          mismatchCount: 1,
          orphanedSymbols: [],
          missingRuntimeSymbols: [],
          unmatchedOrderSymbols: [],
          manualInterferenceSymbols: [],
          staleProtectiveSymbols: [],
          warnings: [{ symbol: "ETHUSDT", issue: "protective_order_state_stale" }]
        }
      },
      config,
      report: { recentEvents: [] },
      streamStatus: {},
      nowIso: "2026-04-22T12:00:00.000Z"
    });

    assert.ok(!audit.blockedSymbols.some((item) => item.symbol === "BCHUSDT"));
    assert.ok(audit.blockedSymbols.some((item) => item.symbol === "ETHUSDT"));
  });

  await runCheck("broker reconciliation invokes cleanup target wiring even without trade-reason fallback", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-flat-close-reconcile-wire-"));
    const config = makeDemoConfig({ runtimeDir });
    const bot = new TradingBot({
      config,
      logger: makeLogger()
    });
    bot.model = makeModelStub();
    bot.modelBackups = [];
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.runtime = {
      openPositions: [],
      latestDecisions: [],
      latestBlockedSetups: [],
      signalFlow: {},
      orderLifecycle: {
        pendingActions: [{ id: "pos-bch", symbol: "BCHUSDT", state: "manual_review" }]
      },
      exchangeTruth: {
        mismatchCount: 1,
        orphanedSymbols: ["BCHUSDT"],
        missingRuntimeSymbols: [],
        unmatchedOrderSymbols: [],
        manualInterferenceSymbols: [],
        staleProtectiveSymbols: [],
        warnings: [{ symbol: "BCHUSDT", issue: "protective_order_state_stale" }],
        autoReconcileAudits: [{ symbol: "BCHUSDT", decision: "NEEDS_MANUAL_REVIEW" }]
      }
    };
    bot.learnFromTrade = async () => ({ learned: true });
    bot.markReportDirty = () => {};
    bot.syncOrderLifecycleState = () => bot.runtime.orderLifecycle;

    await bot.applyReconciliation({
      closedTrades: [{
        id: "pos-bch",
        symbol: "BCHUSDT",
        reason: "custom_reason_not_relied_on",
        exitSource: "custom_exit_source_not_relied_on",
        exitAt: "2026-04-22T12:00:00.000Z"
      }],
      cleanupTargets: [{
        symbol: "BCHUSDT",
        positionId: "pos-bch",
        reason: "confirmed_flat_local_close",
        venueFlatConfirmed: true,
        openOrdersClear: true,
        protectiveListsClear: true
      }],
      warnings: [],
      exchangeTruth: {
        mismatchCount: 0,
        orphanedSymbols: [],
        missingRuntimeSymbols: [],
        unmatchedOrderSymbols: [],
        manualInterferenceSymbols: [],
        staleProtectiveSymbols: [],
        warnings: [],
        autoReconcileAudits: []
      }
    });

    assert.deepEqual(bot.runtime.orderLifecycle.pendingActions || [], []);
    assert.equal(bot.runtime.exchangeTruth.mismatchCount, 0);
    assert.equal(bot.runtime.exchangeTruth.lastPaperSymbolCleanup.symbol, "BCHUSDT");
  });

  await runCheck("demo-paper BCH dust residual below min notional auto-closes via reconcile", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-dust-reconcile-"));
    const config = makeDemoConfig({ runtimeDir });
    const rules = buildDemoRules({ symbol: "BCHUSDT", baseAsset: "BCH" });
    const bot = new TradingBot({
      config,
      logger: makeLogger()
    });
    bot.model = makeModelStub();
    bot.modelBackups = [];
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.runtime = {
      openPositions: [makePosition({
        id: "pos-bch-dust",
        symbol: "BCHUSDT",
        quantity: 0.082917,
        entryPrice: 449.65,
        totalCost: 37.28,
        notional: 37.28,
        currentPrice: 469.95,
        lastMarkedPrice: 469.95,
        manualReviewRequired: true,
        reconcileRequired: true,
        lifecycleState: "manual_review",
        operatorMode: "protect_only"
      })],
      latestDecisions: [],
      latestBlockedSetups: [],
      signalFlow: {},
      orderLifecycle: {
        pendingActions: [{ id: "pos-bch-dust", symbol: "BCHUSDT", state: "manual_review" }]
      },
      exchangeTruth: {
        mismatchCount: 1,
        orphanedSymbols: ["BCHUSDT"],
        missingRuntimeSymbols: [],
        unmatchedOrderSymbols: [],
        manualInterferenceSymbols: [],
        staleProtectiveSymbols: [],
        warnings: [{ symbol: "BCHUSDT", issue: "auto_reconcile_manual_review_required" }]
      },
      exchangeSafety: {},
      service: {},
      health: {},
      marketHistory: {},
      capitalGovernor: {}
    };
    bot.broker = new DemoPaperBroker({
      client: makeClient({
        balances: [{ asset: "BCH", free: "0.002408", locked: "0.00000000" }],
        recentTrades: []
      }),
      config,
      logger: makeLogger(),
      symbolRules: { BCHUSDT: rules }
    });
    bot.getMarketSnapshot = async () => ({ book: { mid: 469.98, bid: 469.95, ask: 470.01 } });
    bot.learnFromTrade = async () => ({ learned: true });
    bot.markReportDirty = () => {};
    bot.syncOrderLifecycleState = () => bot.runtime.orderLifecycle;
    bot.refreshOperationalViews = () => {
      bot.runtime.exchangeSafety = buildExchangeSafetyAudit({
        runtime: bot.runtime,
        config,
        report: { recentEvents: [] },
        streamStatus: {},
        nowIso: "2026-04-22T12:00:00.000Z"
      });
    };

    const reconciliation = await bot.broker.reconcileRuntime({
      runtime: bot.runtime,
      getMarketSnapshot: bot.getMarketSnapshot,
      auditOnly: false
    });
    const reconcileAudit = reconciliation.exchangeTruth.autoReconcileAudits[0];

    assert.equal(reconciliation.closedTrades.length, 1);
    assert.equal(reconcileAudit.reason, "confirmed_flat_unsellable_dust");
    assert.equal(reconcileAudit.decision, "SAFE_AUTOFIX");
    assert.equal(reconcileAudit.evidence.unsellableDustResidual, true);
    assert.equal(reconcileAudit.evidence.sellableNotional < rules.minNotional, true);
    assert.equal(bot.runtime.openPositions.length, 0);

    await bot.applyReconciliation(reconciliation);
    bot.refreshOperationalViews();

    assert.equal(bot.runtime.exchangeTruth.lastPaperSymbolCleanup.symbol, "BCHUSDT");
    assert.deepEqual(bot.runtime.orderLifecycle.pendingActions || [], []);
    assert.equal(bot.runtime.exchangeSafety.globalFreezeEntries, false);
    assert.ok(!bot.runtime.exchangeSafety.blockedSymbols.some((item) => item.symbol === "BCHUSDT"));
  });

  await runCheck("demo-paper sellable residual above min notional does not auto-close as dust", async () => {
    const rules = buildDemoRules({ symbol: "BCHUSDT", baseAsset: "BCH" });
    const runtime = {
      openPositions: [makePosition({
        id: "pos-bch-sellable",
        symbol: "BCHUSDT",
        quantity: 0.082917,
        entryPrice: 469.95,
        totalCost: 37.28,
        notional: 37.28,
        currentPrice: 469.95,
        lastMarkedPrice: 469.95,
        manualReviewRequired: true,
        reconcileRequired: true,
        lifecycleState: "manual_review",
        operatorMode: "protect_only"
      })]
    };
    const broker = new DemoPaperBroker({
      client: makeClient({
        balances: [{ asset: "BCH", free: "0.020000", locked: "0.00000000" }],
        recentTrades: []
      }),
      config: makeDemoConfig(),
      logger: makeLogger(),
      symbolRules: { BCHUSDT: rules }
    });

    const reconciliation = await broker.reconcileRuntime({
      runtime,
      getMarketSnapshot: async () => ({ book: { mid: 469.98, bid: 469.95, ask: 470.01 } }),
      auditOnly: false
    });
    const reconcileAudit = reconciliation.exchangeTruth.autoReconcileAudits[0];

    assert.equal(reconciliation.closedTrades.length, 0);
    assert.equal(runtime.openPositions.length, 1);
    assert.equal(reconcileAudit.decision, "NEEDS_MANUAL_REVIEW");
    assert.notEqual(reconcileAudit.reason, "confirmed_flat_unsellable_dust");
    assert.equal(reconcileAudit.evidence.unsellableDustResidual, false);
  });

  await runCheck("live mode remains strict for unsellable dust residual", async () => {
    const rules = buildDemoRules({ symbol: "BCHUSDT", baseAsset: "BCH" });
    const runtime = {
      openPositions: [makePosition({
        id: "pos-bch-live",
        symbol: "BCHUSDT",
        quantity: 0.082917,
        entryPrice: 469.95,
        totalCost: 37.28,
        notional: 37.28,
        currentPrice: 469.95,
        lastMarkedPrice: 469.95,
        brokerMode: "live",
        manualReviewRequired: true,
        reconcileRequired: true,
        lifecycleState: "manual_review",
        operatorMode: "protect_only"
      })]
    };
    const broker = new LiveBroker({
      client: makeClient({
        balances: [{ asset: "BCH", free: "0.002408", locked: "0.00000000" }],
        recentTrades: []
      }),
      config: makeConfig({ botMode: "live", enableExchangeProtection: true }),
      logger: makeLogger(),
      symbolRules: { BCHUSDT: rules }
    });

    const reconciliation = await broker.reconcileRuntime({
      runtime,
      getMarketSnapshot: async () => ({ book: { mid: 469.98, bid: 469.95, ask: 470.01 } }),
      auditOnly: false
    });
    const reconcileAudit = reconciliation.exchangeTruth.autoReconcileAudits[0];

    assert.equal(reconciliation.closedTrades.length, 0);
    assert.equal(runtime.openPositions.length, 1);
    assert.equal(reconcileAudit.decision, "NEEDS_MANUAL_REVIEW");
    assert.notEqual(reconcileAudit.reason, "confirmed_flat_unsellable_dust");
    assert.equal(reconcileAudit.evidence.unsellableDustResidual, true);
  });

  await runCheck("unresolved real venue mismatch still keeps global freeze", async () => {
    const config = makeDemoConfig();
    const audit = buildExchangeSafetyAudit({
      runtime: {
        openPositions: [],
        orderLifecycle: { pendingActions: [] },
        exchangeTruth: {
          mismatchCount: 1,
          orphanedSymbols: ["ETHUSDT"],
          missingRuntimeSymbols: [],
          unmatchedOrderSymbols: [],
          manualInterferenceSymbols: [],
          staleProtectiveSymbols: [],
          warnings: []
        }
      },
      config,
      report: { recentEvents: [] },
      streamStatus: {},
      nowIso: "2026-04-22T12:00:00.000Z"
    });

    assert.equal(audit.globalFreezeEntries, true);
    assert.equal(audit.globalFreezeReason, "hard_inventory_drift");
    assert.equal(audit.canTradeOtherSymbols, false);
  });
}
