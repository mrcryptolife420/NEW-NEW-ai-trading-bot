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

export async function registerDashboardSnapshotTests({
  runCheck,
  assert,
  fs,
  os,
  path,
  TradingBot,
  makeConfig
}) {
  await runCheck("dashboard snapshot exposes dto versioning, performance budgets and manual review queue", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-dashboard-snapshot-"));
    const bot = new TradingBot({ config: makeConfig({ runtimeDir, dashboardSnapshotBudgetMs: 1, dashboardSnapshotSlowSectionMs: 0 }), logger: { info() {}, warn() {}, error() {}, debug() {} } });
    bot.model = makeModelStub();
    bot.modelBackups = [];
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.runtime = {
      lastCycleAt: "2026-04-21T10:00:00.000Z",
      lastAnalysisAt: "2026-04-21T10:00:00.000Z",
      lastPortfolioUpdateAt: "2026-04-21T10:00:00.000Z",
      latestDecisions: [{
        symbol: "SOLUSDT",
        allow: true,
        summary: "Scoped paper candidate",
        probability: 0.63,
        threshold: 0.57,
        confidenceBreakdown: { overallConfidence: 0.66 },
        setupQuality: { tier: "A" },
        strategySummary: { family: "breakout", activeStrategy: "market_structure_break" },
        marketProviderSummary: {
          status: "ready",
          score: 0.74,
          providerCount: 3,
          enabledCount: 3,
          degradedCount: 0,
          unavailableCount: 0,
          providers: [
            { id: "derivatives_context", status: "ready", enabled: true, score: 0.71 },
            { id: "macro_context", status: "ready", enabled: true, score: 0.75 },
            { id: "execution_feedback", status: "ready", enabled: true, score: 0.76 }
          ]
        },
        entryDiagnostics: {
          confidence: {
            finalEdge: 0.08,
            paperRelief: 0.01
          },
          policyProfile: {
            status: "scoped",
            appliedScopes: ["family:breakout", "session:us"],
            profile: { thresholdShift: -0.01 }
          }
        }
      }],
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
        operatorMode: "manual_review"
      }],
      signalFlow: { dashboardFeedFailures: 1 },
      orderLifecycle: { pendingActions: [{ id: "pos-1", symbol: "BTCUSDT", state: "manual_review", updatedAt: "2026-04-21T00:00:00.000Z" }] },
      ops: {},
      service: {},
      exchangeTruth: {},
      exchangeSafety: {},
      qualityQuorum: {},
      paperLearning: {},
      adaptation: {},
      offlineTrainer: {},
      onlineAdaptation: {},
      marketHistory: { status: "ready" },
      capitalLadder: {},
      capitalGovernor: {},
      capitalPolicy: {},
      rejectAdaptiveLearning: {
        status: "active",
        blockerStats: [{ blocker: "meta_followthrough_caution" }],
        recommendations: [{ blocker: "meta_followthrough_caution", recommendation: "bounded_paper_soften" }]
      },
      watchlistSummary: {
        enabled: true,
        topSymbols: [{
          symbol: "BTCUSDT",
          universeScore: 0.71,
          universeScoreDrivers: { spreadStabilityScore: 0.8 }
        }]
      }
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
    bot.buildOperationalReadiness = () => ({ status: "degraded", reasons: ["lifecycle_attention_required"] });
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
    assert.equal(snapshot.contract.dto, "dashboard_snapshot");
    assert.equal(snapshot.contract.schemaVersion, 3);
    assert.ok(snapshot.snapshotMeta.performance);
    assert.equal(snapshot.snapshotMeta.manualReviewQueue.pendingCount, 1);
    assert.ok(Array.isArray(snapshot.snapshotMeta.performance.sections));
    assert.equal(snapshot.ops.manualReviewQueue.pendingCount, 1);
    assert.equal(snapshot.badVetoLearning.status, "active");
    assert.equal(snapshot.watchlist.topSymbols[0].universeScore, 0.71);
    assert.equal(snapshot.marketProviders.status, "ready");
    assert.equal(snapshot.ops.marketProviders.status, "ready");
    assert.equal(snapshot.topDecisions[0].entryDiagnostics.marketProviders.status, "ready");
    assert.equal(snapshot.topDecisions[0].entryDiagnostics.policyProfile.status, "scoped");
    assert.equal(snapshot.ops.riskLocks.manualReviewPending, true);
    assert.ok(snapshot.ops.audit);
    assert.equal(snapshot.operatorDeck.cards.some((item) => item.id === "manual_review"), true);
  });
}
