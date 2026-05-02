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

export async function registerDashboardHealthTests({
  runCheck,
  assert,
  fs,
  os,
  path,
  __dashboardSmokeRender,
  TradingBot,
  makeConfig
}) {
  await runCheck("dashboard snapshot v3 surfaces lifecycle health freshness exchange and audit summaries", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-dashboard-health-"));
    const bot = new TradingBot({
      config: makeConfig({ runtimeDir }),
      logger: { info() {}, warn() {}, error() {}, debug() {} }
    });
    await bot.auditLog.init();
    await bot.auditLog.record("execution_result", {
      at: "2026-04-21T10:02:00.000Z",
      status: "blocked",
      symbol: "BTCUSDT",
      reasonCodes: ["exchange_truth_freeze"]
    });
    bot.model = makeModelStub();
    bot.modelBackups = [];
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.client = { getClockSyncState() { return { status: "ready", driftMs: 12 }; } };
    bot.runtime = {
      lastCycleAt: "2026-04-21T10:00:00.000Z",
      lastAnalysisAt: "2026-04-21T10:00:00.000Z",
      lastPortfolioUpdateAt: "2026-04-21T10:00:00.000Z",
      latestDecisions: [],
      latestBlockedSetups: [],
      openPositions: [{
        id: "pos-1",
        symbol: "BTCUSDT",
        quantity: 0.01,
        entryPrice: 100,
        totalCost: 1,
        notional: 1,
        entryAt: "2026-04-21T00:00:00.000Z",
        manualReviewRequired: true,
        lifecycleState: "manual_review",
        operatorMode: "manual_review",
        reconcileRetrySummary: {
          eventCount: 3,
          retryCount: 2,
          manualReviewCount: 1,
          latestReason: "hard_inventory_conflict",
          escalatedAfterAttempts: 3
        },
        reconcileRetryHistory: [
          { at: "2026-04-21T09:50:00.000Z", action: "retry_pending_confirmation", reason: "recent_fill_not_yet_reflected" },
          { at: "2026-04-21T09:56:00.000Z", action: "protect_only_retry", reason: "recoverable_missing_protection" },
          { at: "2026-04-21T10:00:00.000Z", action: "manual_review_required", reason: "hard_inventory_conflict" }
        ]
      }],
      signalFlow: { dashboardFeedFailures: 1 },
      orderLifecycle: {
        pendingActions: [{ id: "pos-1", symbol: "BTCUSDT", state: "manual_review", updatedAt: "2026-04-21T00:00:00.000Z" }],
        executionIntentLedger: {
          unresolvedIntentIds: ["intent-1"],
          intents: {
            "intent-1": {
              id: "intent-1",
              symbol: "BTCUSDT",
              kind: "exit",
              scope: "symbol",
              status: "ambiguous",
              ambiguityReason: "submit_timeout",
              blocked: true,
              resumeRequired: true,
              updatedAt: "2026-04-21T10:00:00.000Z"
            }
          }
        }
      },
      ops: {},
      service: {},
      health: { circuitOpen: true, reason: "exchange_truth_freeze" },
      exchangeTruth: { freezeEntries: true },
      exchangeSafety: {
        globalFreezeEntries: false,
        blockedSymbols: [{
          symbol: "BTCUSDT",
          reason: "manual_review",
          reconcileConfidence: 0.84,
          reconcileClassification: "stale_local_entry_reference",
          autonomousReconcileState: "awaiting_fresh_fill_confirmation"
        }],
        canTradeOtherSymbols: true,
        rootBlockerPriority: "symbol_scoped",
        autoReconcileSummary: {
          autoResolvedCount: 2,
          retryCount: 1,
          manualRequiredCount: 1
        },
        autoReconcileAudits: [{
          symbol: "BTCUSDT",
          checkedAt: "2026-04-21T10:00:00.000Z",
          decision: "NEEDS_MANUAL_REVIEW",
          reason: "hard_inventory_conflict",
          classification: "hard_inventory_conflict",
          autonomyState: "manual_review_required",
          confidence: 0.84
        }]
      },
      qualityQuorum: {},
      paperLearning: {},
      adaptation: {},
      offlineTrainer: {},
      onlineAdaptation: {},
      marketHistory: { status: "ready" },
      capitalLadder: {},
      capitalGovernor: { status: "blocked" },
      capitalPolicy: {}
    };
    bot.stream = { getStatus() { return {}; } };
    bot.health = { getStatus() { return {}; } };
    bot.dataRecorder = { getSummary() { return {}; } };
    bot.backupManager = { getSummary() { return {}; } };
    bot.maybeRunExchangeTruthLoop = async () => {};
    bot.safeRefreshMarketHistorySnapshot = async () => bot.runtime.marketHistory;
    bot.safeRefreshScannerSnapshot = async () => ({});
    bot.shouldRefreshPortfolioSnapshot = () => false;
    bot.getPerformanceReport = () => ({
      recentTrades: [],
      openExposureReview: { manualReviewCount: 1, protectOnlyCount: 0, notes: [] },
      executionSummary: {},
      executionCostSummary: {}
    });
    bot.refreshOperationalViews = () => {};
    bot.syncOrderLifecycleState = () => bot.runtime.orderLifecycle;
    bot.buildSourceReliabilitySnapshot = () => ({});
    bot.buildSafetyPreview = () => ({ selfHealState: {}, driftSummary: {} });
    bot.buildOperationalReadiness = () => ({ status: "blocked", reasons: ["exchange_truth_freeze"] });
    bot.buildPerformanceChangeView = () => ({});
    bot.buildOperatorRunbooks = () => [];
    bot.buildOperatorDiagnosticsSnapshot = () => ({ actionItems: [] });
    bot.buildContextHealthSummary = () => ({});
    bot.buildPromotionPipelineSnapshot = () => ({ rolloutCandidates: [] });
    bot.buildModelWeightsView = () => [];
    bot.buildPortfolioView = () => ({});
    bot.buildScannerView = () => ({});
    bot.buildResearchView = () => ({});
    bot.rlPolicy = { getSummary() { return {}; }, getWeightView() { return []; } };
    bot.strategyOptimizer = { buildSnapshot() { return {}; } };

    const snapshot = await bot.getDashboardSnapshot();
    assert.equal(snapshot.contract.schemaVersion, 3);
    assert.equal(snapshot.ops.health.status, "blocked");
    assert.equal(snapshot.ops.exchangeConnectivity.freezeEntries, true);
    assert.equal(snapshot.ops.exchangeConnectivity.canTradeOtherSymbols, true);
    assert.equal(snapshot.ops.exchangeConnectivity.blockedSymbols[0]?.symbol, "BTCUSDT");
    assert.equal(snapshot.ops.exchangeConnectivity.blockedSymbols[0]?.reconcileConfidence, 0.84);
    assert.equal(snapshot.ops.exchangeConnectivity.blockedSymbols[0]?.reconcileClassification, "stale_local_entry_reference");
    assert.equal(snapshot.ops.exchangeConnectivity.blockedSymbols[0]?.autonomousReconcileState, "awaiting_fresh_fill_confirmation");
    assert.equal(snapshot.ops.exchangeConnectivity.rootBlockerPriority, "symbol_scoped");
    assert.equal(snapshot.ops.exchangeConnectivity.autoReconcileSummary.autoResolvedCount, 2);
    assert.equal(snapshot.ops.exchangeConnectivity.reconcileTimeline[0]?.reason, "hard_inventory_conflict");
    assert.equal(snapshot.ops.health.primaryRootBlocker?.reason, "exchange_truth_freeze");
    assert.ok(snapshot.ops.rootBlocker?.blockedSymbols?.some((item) => item.symbol === "BTCUSDT"));
    assert.equal(snapshot.ops.riskLocks.executionIntentBlockedSymbols[0]?.symbol, "BTCUSDT");
    assert.equal(snapshot.ops.mode.botMode, "paper");
    assert.equal(snapshot.ops.riskLocks.manualReviewPending, true);
    assert.equal(snapshot.ops.riskLocks.exchangeSafetyBlockedSymbols[0]?.symbol, "BTCUSDT");
    assert.equal(snapshot.ops.health.runtimeDegradationReasons.length, 0);
    assert.equal(snapshot.ops.health.tradeEntryBlockingReasons[0], "exchange_truth_freeze");
    assert.equal(snapshot.ops.audit.topRejectionCodes[0].code, "exchange_truth_freeze");

    const render = __dashboardSmokeRender({ dashboard: snapshot });
    assert.ok(render.healthText.includes("Entry blockers"));
    assert.ok(render.healthText.includes("Runtime degradation"));
    assert.ok(render.healthText.includes("Root blocker"));
    assert.ok(render.healthText.includes("Reconcile timeline"));
    assert.ok(render.positionsText.includes("escalated after 3"));
    assert.ok(render.focusText.includes("Dominant blocker"));

    const readModelRender = __dashboardSmokeRender({
      dashboard: {
        ...snapshot,
        readModel: {
          status: "ready",
          rebuiltAt: "2026-04-17T12:00:00.000Z",
          tables: { trades: 2, decisions: 3, replayTraces: 1 },
          topBlockers: [{ reason: "exchange_safety_blocked", count: 4 }],
          topScorecards: [{ status: "negative_edge", strategyId: "range_grid", sampleSize: 8 }],
          latestReplay: { symbol: "BTCUSDT", status: "ready", at: "2026-04-17T12:00:00.000Z" },
          requestBudget: {
            status: "ready",
            latestWeight1m: 321,
            topCallers: [{ caller: "spot:GET:/api/v3/ticker/bookTicker", count: 5 }]
          },
          operatorRunbooks: [{
            action: "Voer eerst status/doctor/reconcile checks uit.",
            actionLinks: [{ command: "npm run status" }]
          }],
          strategyLifecycleDiagnostics: {
            status: "review_required",
            dangerousCount: 1,
            positiveCount: 0,
            recommendedAction: "Review dangerous strategy/regime/session pairs."
          }
        },
        tradingImprovementDiagnostics: {
          status: "action_required",
          requestWeight: {
            privateHotspots: [{ caller: "signed:GET /api/v3/openOrders" }]
          },
          metaCaution: {
            topReasons: [{ id: "meta_followthrough_caution", count: 9 }]
          },
          exchangeSafetyRecovery: { recoveryOnly: false },
          strategyRisk: {
            dangerous: [{ strategyId: "range_grid_reversion" }]
          },
          backlog: [
            { id: "private_rest_user_stream_primary", title: "Private REST-druk verlagen", status: "action_required" },
            { id: "public_depth_stream_first", title: "Public depth REST terugdringen", status: "action_required" }
          ],
          priorityActions: ["Maak User Data Stream leidend voor orders/fills/account."]
        },
        featureIntegrationAudit: {
          status: "review_required",
          incompleteCount: 11,
          topP1: [{ id: "net_edge_gate" }],
          topMissingDashboard: [{ id: "indicator_feature_registry" }]
        }
      }
    });
    assert.ok(readModelRender.healthText.includes("Read model"));
    assert.ok(readModelRender.healthText.includes("Read-model blockers"));
    assert.ok(readModelRender.healthText.includes("Latest replay trace"));
    assert.ok(readModelRender.healthText.includes("Strategy lifecycle"));
    assert.ok(readModelRender.healthText.includes("Review dangerous strategy"));
    assert.ok(readModelRender.healthText.includes("npm run status"));
    assert.ok(readModelRender.healthText.includes("spot:GET:/api/v3/ticker/bookTicker"));
    assert.ok(readModelRender.healthText.includes("Trading improvement priorities"));
    assert.ok(readModelRender.healthText.includes("signed:GET /api/v3/openOrders"));
    assert.ok(readModelRender.healthText.includes("Meta Followthrough Caution"));
    assert.ok(readModelRender.healthText.includes("Private REST-druk verlagen"));
    assert.ok(readModelRender.diagnosticsText.includes("Feature completion"));
    assert.ok(readModelRender.diagnosticsText.includes("Net Edge Gate"));
    assert.ok(readModelRender.diagnosticsText.includes("Indicator Feature Registry"));
  });
}
