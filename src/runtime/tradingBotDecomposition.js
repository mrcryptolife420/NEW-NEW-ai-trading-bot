const SERVICES = [
  {
    name: "MarketDataCoordinator",
    responsibility: "Own stream and historical data readiness, refresh budgets, and provider health.",
    currentModules: ["streamCoordinator", "marketHistory", "marketProviderHub"],
    extracted: true
  },
  {
    name: "CandidateScanner",
    responsibility: "Build and rank candidate symbols/setups before risk evaluation.",
    currentModules: ["marketScanner", "watchlistResolver", "universeScorer", "candidateRanking"],
    extracted: true
  },
  {
    name: "DecisionEngine",
    responsibility: "Run signal, risk, permissioning, sizing, and intent creation as one audited flow.",
    currentModules: ["decisionPipeline", "riskManager", "risk/policies"],
    extracted: true
  },
  {
    name: "ExecutionCoordinator",
    responsibility: "Own paper/live broker routing, execution plans, reconciliation, and fee attribution.",
    currentModules: ["executionEngine", "paperBroker", "liveBroker", "exchangeSafetyReconciler"],
    extracted: true
  },
  {
    name: "RuntimePersistenceService",
    responsibility: "Own snapshot bundles, read-model rebuilds, audit trace reads, and journal consistency.",
    currentModules: ["persistenceCoordinator", "stateStore", "auditLogStore", "readModelStore"],
    extracted: true
  },
  {
    name: "ReplayLabService",
    responsibility: "Own deterministic incident replay and market replay diagnostics.",
    currentModules: ["replayLabService", "incidentReplayLab", "marketReplayEngine"],
    extracted: true
  },
  {
    name: "DashboardReadModelService",
    responsibility: "Build dashboard-safe read models without mutating runtime trading state.",
    currentModules: ["dashboardSnapshotBuilder", "viewMappers", "readModelStore"],
    extracted: true
  },
  {
    name: "RuntimeLivenessService",
    responsibility: "Separate process and manager heartbeat, cycle freshness, and broken runtime phase diagnostics.",
    currentModules: ["runtimeLiveness", "tradingPathHealth", "botManager"],
    extracted: true
  },
  {
    name: "OperatorDiagnosticsService",
    responsibility: "Build no-trade, request-budget, readiness, retention, and feature-review diagnostics without changing execution behavior.",
    currentModules: ["noTradeTimeline", "restBudgetGovernor", "productionOps", "storageAudit", "featureAudit"],
    extracted: true
  }
];

export function buildTradingBotServiceMap() {
  return {
    status: "decomposition_foundation_ready",
    tradingBotRole: "orchestrator",
    services: SERVICES.map((service) => ({ ...service })),
    remainingRisk: "TradingBot still wires service lifecycle directly; further extraction should move one lifecycle method at a time with replay fixtures."
  };
}

export function assertTradingBotServiceCoverage(required = []) {
  const serviceNames = new Set(SERVICES.map((service) => service.name));
  const missing = required.filter((name) => !serviceNames.has(name));
  return {
    ok: missing.length === 0,
    missing,
    serviceCount: SERVICES.length
  };
}
