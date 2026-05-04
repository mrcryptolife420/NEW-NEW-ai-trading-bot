function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeReadiness(readiness) {
  const source = objectOrFallback(readiness, {});
  const status = ["ready", "degraded", "blocked", "inactive", "unknown"].includes(source.status)
    ? source.status
    : "unknown";
  return {
    ...source,
    status,
    reasons: arrayOrEmpty(source.reasons),
    warnings: arrayOrEmpty(source.warnings)
  };
}

export function normalizeDashboardSnapshotPayload(snapshot = {}) {
  const source = objectOrFallback(snapshot, {});
  const ops = objectOrFallback(source.ops, {});
  return {
    ...source,
    mode: source.mode || source.botMode || "paper",
    running: Boolean(source.running),
    status: source.status || normalizeReadiness(source.readiness || ops.readiness).status,
    readiness: normalizeReadiness(source.readiness || ops.readiness),
    topDecisions: arrayOrEmpty(source.topDecisions || source.decisions),
    topSignals: arrayOrEmpty(source.topSignals || source.signals),
    positions: arrayOrEmpty(source.positions || source.openPositions),
    risk: objectOrFallback(source.risk, { status: "unknown", reasons: [] }),
    capital: objectOrFallback(source.capital, { status: "unknown", reasons: [] }),
    lifecycle: objectOrFallback(source.lifecycle, { status: "unknown" }),
    alerts: arrayOrEmpty(source.alerts),
    paperLearning: objectOrFallback(source.paperLearning || ops.paperLearning, { status: "unavailable" }),
    recorder: objectOrFallback(source.recorder || source.dataRecorder, { status: "unavailable" }),
    failureLibrarySummary: objectOrFallback(source.failureLibrarySummary || source.learningAnalytics?.failureLibrarySummary, { status: "unavailable" }),
    exitQualitySummary: objectOrFallback(source.exitQualitySummary || source.learningAnalytics?.exitQualitySummary, { status: "unavailable" }),
    vetoOutcomeSummary: objectOrFallback(source.vetoOutcomeSummary || source.learningAnalytics?.vetoOutcomeSummary, { status: "unavailable" }),
    promotionDossierSummary: objectOrFallback(source.promotionDossierSummary || source.learningAnalytics?.promotionDossierSummary, { status: "unavailable" }),
    rollbackWatchSummary: objectOrFallback(source.rollbackWatchSummary || source.learningAnalytics?.rollbackWatchSummary, { status: "unavailable" }),
    regimeConfusionSummary: objectOrFallback(source.regimeConfusionSummary || source.learningAnalytics?.regimeConfusionSummary, { status: "unavailable" }),
    operatorModeSummary: objectOrFallback(source.operatorModeSummary, { mode: "active", canOpenNewEntries: true }),
    liveReadinessAudit: objectOrFallback(source.liveReadinessAudit, { status: "not_ready", blockingReasons: [] }),
    safetySnapshot: objectOrFallback(source.safetySnapshot, { overallStatus: "unknown", topRisks: [] }),
    incidentSummary: objectOrFallback(source.incidentSummary, { status: "empty", count: 0, reports: [] }),
    operatorActionQueueSummary: objectOrFallback(
      source.operatorActionQueueSummary ||
        source.operatorActionQueue ||
        source.ops?.operatorActionQueueSummary ||
        source.ops?.operatorActionQueue,
      {
        status: "clear",
        activeCount: 0,
        blockingCount: 0,
        criticalBlockingCount: 0,
        items: [],
        nextAction: "monitor"
      }
    ),
    exchangeSafety: objectOrFallback(source.exchangeSafety || source.safety?.exchangeSafety, {
      status: "unknown",
      entryBlocked: false,
      autoReconcileStatus: "unknown",
      blockingPositions: [],
      nextAction: null,
      entryUnlockEligible: false
    }),
    exchangeSafetySummary: objectOrFallback(
      source.exchangeSafetySummary ||
        source.exchangeSafety ||
        source.safety?.exchangeSafety,
      {
        status: "unknown",
        entryBlocked: false,
        blockingReasons: [],
        nextAction: "inspect_exchange_safety_status"
      }
    ),
    postReconcileProbation: objectOrFallback(
      source.postReconcileProbation ||
        source.exchangeSafety?.postReconcileProbation ||
        source.safety?.exchangeSafety?.postReconcileProbation ||
        ops.exchangeConnectivity?.postReconcileProbation,
      {
        status: "inactive",
        normalMaxOpenPositions: null,
        postReconcileMaxOpenPositions: null,
        currentOpenPositions: 0,
        remainingProbationSlots: null,
        entriesThisCycle: 0,
        blockedReason: null,
        warnings: []
      }
    ),
    storageAuditSummary: objectOrFallback(source.storageAuditSummary || source.dataIntegrity?.storageAuditSummary, { status: "unavailable" }),
    recorderIntegritySummary: objectOrFallback(source.recorderIntegritySummary || source.dataIntegrity?.recorderIntegritySummary, { status: "unavailable", issues: [] }),
    dataFreshnessSummary: objectOrFallback(source.dataFreshnessSummary || source.dataIntegrity?.dataFreshnessSummary, { status: "unknown", staleSources: [] }),
    requestBudgetSummary: objectOrFallback(
      source.requestBudgetSummary ||
        source.requestBudget ||
        source.ops?.requestBudgetSummary ||
        source.ops?.requestBudget,
      {
        status: "unavailable",
        topCallers: [],
        warnings: []
      }
    ),
    apiDegradationSummary: objectOrFallback(
      source.apiDegradationSummary ||
        source.runtimeReliability?.apiDegradationSummary ||
        source.ops?.apiDegradationSummary,
      { degradationLevel: "normal", allowedModes: ["active", "observe_only", "protect_only"], blockedActions: [], warnings: [] }
    ),
    datasetQualitySummary: objectOrFallback(source.datasetQualitySummary || source.dataIntegrity?.datasetQualitySummary, { status: "blocked", blockingReasons: [] }),
    replayDeterminismSummary: objectOrFallback(source.replayDeterminismSummary || source.dataIntegrity?.replayDeterminismSummary, { status: "unavailable" }),
    decisionInputLineageSummary: objectOrFallback(
      source.decisionInputLineageSummary ||
        source.dataIntegrity?.decisionInputLineageSummary ||
        source.decisionDiagnostics?.inputLineageSummary,
      { status: "unavailable", total: 0, counts: { fresh: 0, stale: 0, incomplete: 0, unknown: 0 }, warnings: [] }
    ),
    tradingQualitySummary: objectOrFallback(source.tradingQualitySummary || source.tradingQuality, {
      topSetupType: null,
      regimeFit: { score: 0, supportingIndicators: [], conflictingIndicators: [], warnings: [] },
      bestEvidence: null,
      mainConflict: null,
      portfolioCrowdingRisk: "unknown",
      exitPlanHint: null
    }),
    tradingFeatureSummary: objectOrFallback(source.tradingFeatureSummary || source.tradingFeatures, { status: "unavailable", features: [] }),
    symbolLifecycleRiskSummary: objectOrFallback(
      source.symbolLifecycleRiskSummary ||
        source.symbolLifecycleRisk ||
        source.marketContext?.symbolLifecycleRiskSummary ||
        source.universe?.symbolLifecycleRiskSummary,
      { status: "unavailable", symbols: [], warnings: [] }
    ),
    candidateExplainabilitySummary: objectOrFallback(
      source.candidateExplainabilitySummary ||
        source.explainability?.candidateExplainabilitySummary ||
        source.explainability?.candidates,
      { status: "unavailable", count: 0, items: [] }
    ),
    indicatorRegimeSummary: objectOrFallback(source.indicatorRegimeSummary || source.tradingQualitySummary?.regimeFit, { score: 0, supportingIndicators: [], conflictingIndicators: [], warnings: [] }),
    learningEvidenceSummary: objectOrFallback(source.learningEvidenceSummary || source.learningAnalytics?.learningEvidenceSummary, { status: "empty", count: 0 }),
    portfolioCrowdingSummary: objectOrFallback(source.portfolioCrowdingSummary || source.tradingQualitySummary?.portfolioCrowding || source.tradingQualitySummary?.portfolioCrowdingSummary, { crowdingRisk: "unknown", reasons: [] }),
    portfolioScenarioStressSummary: objectOrFallback(
      source.portfolioScenarioStressSummary ||
        source.risk?.portfolioScenarioStressSummary ||
        source.safetySnapshot?.portfolioScenarioStressSummary,
      { status: "unavailable", scenarioCount: 0, warnings: [] }
    ),
    riskOfRuinSummary: objectOrFallback(
      source.riskOfRuinSummary ||
        source.risk?.riskOfRuinSummary ||
        source.risk?.riskOfRuin ||
        source.portfolioRisk?.riskOfRuinSummary,
      { status: "unavailable", riskOfRuinScore: 0, expectedDrawdown: 0, lossStreakRisk: 0, warnings: [] }
    ),
    opportunityCostSummary: objectOrFallback(
      source.opportunityCostSummary ||
        source.performance?.opportunityCostSummary ||
        source.portfolioRisk?.opportunityCostSummary ||
        source.exitIntelligence?.opportunityCostSummary,
      { status: "unavailable", opportunityCostScore: 0, capitalEfficiency: 0, positions: [] }
    ),
    performanceLedgerSummary: objectOrFallback(
      source.performanceLedgerSummary ||
        source.performanceLedger ||
        source.performance?.ledgerSummary ||
        source.accounting?.performanceLedgerSummary,
      { status: "unavailable", tradeCount: 0, realizedPnlQuote: 0, feesQuote: 0, reconciliation: { status: "unknown", issues: [] } }
    ),
    confidenceCalibrationSummary: objectOrFallback(
      source.confidenceCalibrationSummary ||
        source.learningAnalytics?.confidenceCalibrationSummary ||
        source.ai?.confidenceCalibrationSummary,
      { status: "unavailable", sampleCount: 0, warnings: [] }
    ),
    derivativesContextSummary: objectOrFallback(
      source.derivativesContextSummary ||
        source.marketContext?.derivativesContextSummary ||
        source.marketContext?.derivativesContext ||
        source.market?.derivativesContextSummary,
      { status: "unavailable", confidence: 0, warnings: [] }
    ),
    cryptoRegimeRouterSummary: objectOrFallback(
      source.cryptoRegimeRouterSummary ||
        source.marketContext?.cryptoRegimeRouterSummary ||
        source.marketContext?.cryptoRegimeRouter ||
        source.market?.cryptoRegimeRouterSummary,
      { status: "unavailable", regime: null, allowedSetupFamilies: [], blockedSetupFamilies: [], warnings: [] }
    ),
    strategyLifecycleSummary: objectOrFallback(
      source.strategyLifecycleSummary ||
        source.strategyLifecycle ||
        source.strategyRetirement?.lifecycleSummary ||
        source.runtimeGovernance?.strategyLifecycleSummary,
      { status: "unavailable", states: {}, policies: [], warnings: [] }
    ),
    antiOverfitSummary: objectOrFallback(source.antiOverfitSummary || source.learningAnalytics?.antiOverfitSummary, { status: "unavailable", reasons: [] }),
    backtestQualitySummary: objectOrFallback(source.backtestQualitySummary || source.backtest?.qualitySummary, { status: "unavailable", sampleSizeWarning: true }),
    tradingPathHealth: objectOrFallback(source.tradingPathHealth || source.ops?.tradingPathHealth, {
      status: "unknown",
      blockingReasons: [],
      staleSources: [],
      nextAction: "inspect_runtime_status"
    }),
    feedSummary: objectOrFallback(source.feedSummary || source.ops?.feedSummary, {
      status: "unknown",
      symbolsRequested: 0,
      symbolsReady: 0,
      missingSymbols: [],
      staleSources: []
    }),
    marketSnapshotFlowDebug: objectOrFallback(source.marketSnapshotFlowDebug || source.ops?.marketSnapshotFlowDebug, {
      status: "unknown",
      symbolsRequested: 0,
      snapshotsReady: 0,
      snapshotsPersisted: 0,
      missingSymbols: [],
      staleSources: []
    }),
    dashboardFreshness: objectOrFallback(source.dashboardFreshness || source.snapshotMeta?.freshness, {
      fresh: false,
      ageMs: null,
      staleReason: "missing_snapshot_timestamp"
    }),
    frontendPollingExpectedIntervalMs: Number(source.frontendPollingExpectedIntervalMs || source.frontendPolling?.expectedIntervalMs || 10_000),
    dashboardSnapshotAgeMs: source.dashboardSnapshotAgeMs ?? source.frontendPolling?.snapshotAgeMs ?? null,
    lastSuccessfulSnapshotAt: source.lastSuccessfulSnapshotAt || source.frontendPolling?.lastSuccessfulSnapshotAt || null,
    lastSnapshotError: source.lastSnapshotError || source.frontendPolling?.lastSnapshotError || null,
    panicPlanAvailable: Boolean(source.panicPlanAvailable)
  };
}
