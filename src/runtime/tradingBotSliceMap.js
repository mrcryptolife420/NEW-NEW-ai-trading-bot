const SLICES = [
  {
    id: "prerequisites",
    owner: "src/runtime/tradingBot.js",
    functions: ["init", "refreshAnalysis", "refreshDashboardPrerequisites"],
    liveRisk: "read_only_or_initialization",
    tests: ["test/botLifecycle.tests.js", "test/dashboardSnapshot.tests.js"]
  },
  {
    id: "market_data",
    owner: "src/runtime/tradingBot.js",
    functions: ["safeRefreshMarketHistorySnapshot", "safeRefreshScannerSnapshot", "updatePortfolioSnapshot"],
    liveRisk: "read_only_exchange_data",
    tests: ["test/historyOperations.tests.js", "test/binanceRestArchitecture.tests.js"]
  },
  {
    id: "candidate_building",
    owner: "src/runtime/tradingBot.js",
    functions: ["refreshAnalysis", "annotateCandidateExecutionRanking", "buildCandidateQualityQuorum"],
    liveRisk: "diagnostics_or_paper_scoring",
    tests: ["test/candidateRanking.tests.js", "test/decisionPipeline.tests.js"]
  },
  {
    id: "risk_decision",
    owner: "src/risk/riskManager.js",
    functions: ["evaluateEntry", "buildEntryDiagnosticsSummary", "buildDashboardOperatorDeck"],
    liveRisk: "can_block_live_entries_never_relax_without_review",
    tests: ["test/riskPolicyModules.tests.js", "test/rootBlockerOrchestrator.tests.js"]
  },
  {
    id: "execution",
    owner: "src/execution/executionEngine.js",
    functions: ["execute", "runAutoReconcilePlan", "clearPositionReconcileFlags"],
    liveRisk: "live_order_sensitive",
    tests: ["test/executionSafetyFilters.tests.js", "test/autoReconcileCoordinator.tests.js"]
  },
  {
    id: "post_cycle_persistence",
    owner: "src/storage/stateStore.js",
    functions: ["saveRuntime", "saveJournal", "writeIncidentReport"],
    liveRisk: "state_mutation_no_exchange_write",
    tests: ["test/storageRecovery.tests.js", "test/dataIntegrityMaintenance.tests.js"]
  },
  {
    id: "dashboard_projection",
    owner: "src/runtime/dashboardSnapshotBuilder.js",
    functions: ["buildDashboardSnapshotMeta", "buildDashboardSnapshotContract", "buildLightweightSnapshot"],
    liveRisk: "read_only_operator_surface",
    tests: ["test/dashboardSnapshot.tests.js", "test/dashboardHealth.tests.js"]
  }
];

export function buildTradingBotSliceMap() {
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    source: "src/runtime/tradingBot.js",
    slices: SLICES.map((slice) => ({
      ...slice,
      functions: [...slice.functions],
      tests: [...slice.tests]
    }))
  };
}
