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
    storageTruthMatrix: objectOrFallback(
      source.storageTruthMatrix || source.dataIntegrity?.storageTruthMatrix || source.ops?.storageTruthMatrix,
      { status: "unavailable", version: null, entries: [], drift: {}, warnings: [], diagnosticsOnly: true }
    ),
    storageRetentionSummary: objectOrFallback(
      source.storageRetentionSummary || source.dataIntegrity?.storageRetentionSummary || source.ops?.storageRetentionSummary,
      { status: "unavailable", totalBytes: 0, fileCount: 0, retentionWarnings: [], readOnly: true, autoDelete: false }
    ),
    recorderIntegritySummary: objectOrFallback(source.recorderIntegritySummary || source.dataIntegrity?.recorderIntegritySummary, { status: "unavailable", issues: [] }),
    dataFreshnessSummary: objectOrFallback(source.dataFreshnessSummary || source.dataIntegrity?.dataFreshnessSummary, { status: "unknown", staleSources: [] }),
    dataQualityScoreSummary: objectOrFallback(
      source.dataQualityScoreSummary ||
        source.dataQualitySummary ||
        source.dataIntegrity?.dataQualityScoreSummary ||
        source.decisionDiagnostics?.dataQualityScoreSummary,
      { status: "empty", count: 0, diagnosticsOnly: true, liveSafetyImpact: "negative_only" }
    ),
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
    streamHealthSummary: objectOrFallback(
      source.streamHealthSummary ||
        source.streamFallbackHealth ||
        source.runtimeReliability?.streamHealthSummary ||
        source.ops?.streamHealthSummary ||
        source.ops?.streamFallbackHealth,
      {
        status: "unknown",
        reasons: [],
        warnings: [],
        streamReplacementAvailable: {},
        recentFallbacks: [],
        recentSuppressedFallbacks: [],
        diagnosticsOnly: true,
        liveSafetyUnchanged: true
      }
    ),
    orderLifecycleAuditSummary: objectOrFallback(
      source.orderLifecycleAuditSummary ||
        source.orderLifecycle?.auditSummary ||
        source.execution?.orderLifecycleAuditSummary ||
        source.ops?.orderLifecycleAuditSummary,
      {
        status: "unavailable",
        entryBlocked: false,
        issues: [],
        counts: {},
        diagnosticsOnly: true,
        liveMutationAdded: false
      }
    ),
    rootBlockerStalenessSummary: objectOrFallback(
      source.rootBlockerStalenessSummary ||
        source.rootBlockers?.stalenessSummary ||
        source.runtimeReliability?.rootBlockerStalenessSummary ||
        source.ops?.rootBlockerStalenessSummary,
      {
        status: "unavailable",
        blockerCount: 0,
        staleSuspected: false,
        entryUnlockEligible: false,
        requiredEvidence: [],
        safeNextAction: "monitor",
        diagnosticsOnly: true
      }
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
    symbolQualityDecaySummary: objectOrFallback(
      source.symbolQualityDecaySummary ||
        source.symbolQualityDecay ||
        source.marketContext?.symbolQualityDecaySummary ||
        source.universe?.symbolQualityDecaySummary,
      { status: "unavailable", trackedSymbols: 0, penalizedCount: 0, coolingDownCount: 0, symbols: [], warnings: [] }
    ),
    newsShockSummary: objectOrFallback(
      source.newsShockSummary ||
        source.news?.newsShockSummary ||
        source.marketContext?.newsShockSummary ||
        source.cryptoRegimeRouterSummary?.newsShockSummary,
      { shockLevel: "none", affectedSymbols: [], entryPenalty: 0, manualReviewRecommended: false, warnings: [] }
    ),
    stablecoinRiskSummary: objectOrFallback(
      source.stablecoinRiskSummary ||
        source.stablecoinRisk ||
        source.marketContext?.stablecoinRiskSummary ||
        source.market?.stablecoinRiskSummary,
      { status: "unavailable", stablecoinRisk: "unknown", affectedQuotes: [], depegBps: 0, warnings: [], entryPenalty: 0, manualReviewRecommended: false }
    ),
    priceSanitySummary: objectOrFallback(
      source.priceSanitySummary ||
        source.crossExchangeDivergenceSummary ||
        source.marketContext?.priceSanitySummary ||
        source.marketContext?.crossExchangeDivergenceSummary ||
        source.market?.priceSanitySummary,
      { status: "unavailable", priceSanityStatus: "unknown", divergenceBps: null, referenceCount: 0, confidence: 0, warnings: [], staleSources: [] }
    ),
    candidateExplainabilitySummary: objectOrFallback(
      source.candidateExplainabilitySummary ||
        source.explainability?.candidateExplainabilitySummary ||
        source.explainability?.candidates,
      { status: "unavailable", count: 0, items: [] }
    ),
    paperCandidateLabSummary: objectOrFallback(
      source.paperCandidateLabSummary ||
        source.paperLearning?.paperCandidateLabSummary ||
        source.learningAnalytics?.paperCandidateLabSummary ||
        source.decisionDiagnostics?.paperCandidateLabSummary,
      {
        status: "empty",
        count: 0,
        byState: {},
        byBlockerFamily: {},
        records: [],
        diagnosticsOnly: true,
        liveBehaviorChanged: false,
        executionPermissionChanged: false
      }
    ),
    modelConfidenceRootCauseSummary: objectOrFallback(
      source.modelConfidenceRootCauseSummary ||
        source.decisionDiagnostics?.modelConfidenceRootCauseSummary ||
        source.learningAnalytics?.modelConfidenceRootCauseSummary ||
        source.paperLearning?.modelConfidenceRootCauseSummary,
      { status: "empty", count: 0, byDriver: {}, diagnosticsOnly: true, liveBehaviorChanged: false }
    ),
    noTradeTimelineSummary: objectOrFallback(
      source.noTradeTimelineSummary ||
        source.decisionDiagnostics?.noTradeTimelineSummary ||
        source.learningAnalytics?.noTradeTimelineSummary ||
        source.paperLearning?.noTradeTimelineSummary,
      { status: "empty", count: 0, byStage: {}, top: [], diagnosticsOnly: true, liveBehaviorChanged: false }
    ),
    paperStrategyCohortSummary: objectOrFallback(
      source.paperStrategyCohortSummary ||
        source.learningAnalytics?.paperStrategyCohortSummary ||
        source.paperLearning?.paperStrategyCohortSummary ||
        source.strategyLifecycle?.paperStrategyCohortSummary,
      {
        status: "empty",
        count: 0,
        cohorts: [],
        diagnosticsOnly: true,
        paperOnly: true,
        liveBehaviorChanged: false
      }
    ),
    paperNetEdgeCalibrationSummary: objectOrFallback(
      source.paperNetEdgeCalibrationSummary ||
        source.learningAnalytics?.paperNetEdgeCalibrationSummary ||
        source.paperLearning?.paperNetEdgeCalibrationSummary ||
        source.execution?.paperNetEdgeCalibrationSummary,
      {
        status: "empty",
        sampleCount: 0,
        groupCount: 0,
        groups: [],
        recommendations: [],
        liveThresholdReliefAllowed: false
      }
    ),
    shadowStrategyTournamentSummary: objectOrFallback(
      source.shadowStrategyTournamentSummary ||
        source.learningAnalytics?.shadowStrategyTournamentSummary ||
        source.paperLearning?.shadowStrategyTournamentSummary ||
        source.strategyEvidence?.shadowStrategyTournamentSummary,
      {
        status: "empty",
        count: 0,
        disagreementCount: 0,
        records: [],
        shadowOnly: true,
        executionAllowed: false,
        liveBehaviorChanged: false
      }
    ),
    operatorReviewLabelSummary: objectOrFallback(
      source.operatorReviewLabelSummary ||
        source.learningAnalytics?.operatorReviewLabelSummary ||
        source.paperLearning?.operatorReviewLabelSummary ||
        source.reviewLabels?.summary,
      {
        status: "empty",
        count: 0,
        byLabel: {},
        byTargetType: {},
        labels: [],
        paperAnalyticsOnly: true,
        liveBehaviorChanged: false
      }
    ),
    watchlistCoverageSummary: objectOrFallback(
      source.watchlistCoverageSummary ||
        source.paperLearning?.watchlistCoverageSummary ||
        source.universe?.watchlistCoverageSummary ||
        source.marketScanner?.watchlistCoverageSummary,
      {
        status: "empty_watchlist",
        watchlistCount: 0,
        sampleCount: 0,
        symbols: [],
        paperScanEmphasis: [],
        liveUniverseChanged: false
      }
    ),
    paperReplayCoverageSummary: objectOrFallback(
      source.paperReplayCoverageSummary ||
        source.paperLearning?.paperReplayCoverageSummary ||
        source.replay?.paperReplayCoverageSummary ||
        source.readModel?.paperReplayCoverageSummary,
      {
        status: "empty",
        symbols: [],
        backfillPlan: [],
        strategyTags: [],
        dryRunOnly: true,
        liveBehaviorChanged: false
      }
    ),
    goldenReplayPackSummary: objectOrFallback(
      source.goldenReplayPackSummary ||
        source.replay?.goldenReplayPackSummary ||
        source.learningAnalytics?.goldenReplayPackSummary ||
        source.paperLearning?.goldenReplayPackSummary,
      {
        status: "empty",
        packCount: 0,
        highPriorityCount: 0,
        byType: {},
        warnings: [],
        ciSafe: true,
        paperOnly: true,
        liveBehaviorChanged: false
      }
    ),
    paperDecisionEvidenceDrilldown: objectOrFallback(
      source.paperDecisionEvidenceDrilldown ||
        source.dashboardEvidenceDrilldown ||
        source.decisionDiagnostics?.paperDecisionEvidenceDrilldown ||
        source.paperLearning?.paperDecisionEvidenceDrilldown,
      {
        status: "empty",
        count: 0,
        items: [],
        stateCounts: {},
        operatorCanDistinguish: {
          noAlpha: false,
          badData: false,
          safetyBlocked: false,
          dashboardStale: false
        },
        diagnosticsOnly: true,
        liveBehaviorChanged: false
      }
    ),
    featureWiringCompletionSummary: objectOrFallback(
      source.featureWiringCompletionSummary ||
        source.featureCompletionGate ||
        source.governance?.featureWiringCompletionSummary ||
        source.ops?.featureWiringCompletionSummary,
      {
        status: "unavailable",
        strictStatus: "unavailable",
        featureCount: 0,
        blockedCount: 0,
        warningCount: 0,
        passCount: 0,
        items: [],
        diagnosticsOnly: true,
        liveBehaviorChanged: false
      }
    ),
    paperAnalyticsReadmodelSummary: objectOrFallback(
      source.paperAnalyticsReadmodelSummary ||
        source.readModel?.paperAnalyticsReadmodelSummary ||
        source.readModel?.paperAnalytics ||
        source.learningAnalytics?.paperAnalyticsReadmodelSummary,
      {
        status: "unavailable",
        queryStatus: "unavailable",
        source: "sqlite_read_model",
        sourceOfTruth: "json_ndjson",
        sourceOfTruthMigrated: false,
        paperCandidates: [],
        blockerTimelines: [],
        vetoOutcomes: {},
        paperTrades: [],
        exitQuality: {},
        cohortScorecards: [],
        warnings: ["readmodel_analytics_unavailable"]
      }
    ),
    indicatorRegimeSummary: objectOrFallback(source.indicatorRegimeSummary || source.tradingQualitySummary?.regimeFit, { score: 0, supportingIndicators: [], conflictingIndicators: [], warnings: [] }),
    learningEvidenceSummary: objectOrFallback(source.learningEvidenceSummary || source.learningAnalytics?.learningEvidenceSummary, { status: "empty", count: 0 }),
    paperEvidenceSpineSummary: objectOrFallback(
      source.paperEvidenceSpineSummary ||
        source.paperLearning?.paperEvidenceSpineSummary ||
        source.learningAnalytics?.paperEvidenceSpineSummary ||
        source.paperAnalyticsReadmodelSummary?.paperEvidenceSpineSummary ||
        source.readModel?.paperAnalyticsReadmodelSummary?.paperEvidenceSpineSummary,
      { status: "empty", count: 0, packets: [], byState: {}, bySetupType: {}, byRootBlocker: {}, paperOnly: true, diagnosticsOnly: true, liveBehaviorChanged: false }
    ),
    vetoReplayCoverageSummary: objectOrFallback(
      source.vetoReplayCoverageSummary ||
        source.learningAnalytics?.vetoReplayCoverageSummary ||
        source.paperLearning?.vetoReplayCoverageSummary ||
        source.paperAnalyticsReadmodelSummary?.vetoReplayCoverageSummary ||
        source.readModel?.paperAnalyticsReadmodelSummary?.vetoReplayCoverageSummary,
      {
        status: "empty",
        outcomeCount: 0,
        replayTraceCount: 0,
        coverageStatus: "missing",
        vetoOutcomeSummary: { status: "empty", count: 0, counts: {} },
        replayTraceSummary: { count: 0, byStatus: {}, traces: [] },
        replayPackQueue: [],
        paperOnly: true,
        diagnosticsOnly: true,
        liveBehaviorChanged: false,
        hardSafetyRelaxationAllowed: false
      }
    ),
    candidateOutcomeSummary: objectOrFallback(
      source.candidateOutcomeSummary ||
        source.learningAnalytics?.candidateOutcomeSummary ||
        source.paperLearning?.candidateOutcomeSummary,
      { status: "empty", count: 0, queuedCount: 0, hardSafetyRelaxationAllowed: false }
    ),
    missedWinnerSummary: objectOrFallback(
      source.missedWinnerSummary ||
        source.learningAnalytics?.missedWinnerSummary ||
        source.candidateOutcomeSummary?.missedWinnerSummary ||
        source.learningAnalytics?.candidateOutcomeSummary?.missedWinnerSummary,
      { count: 0, top: [] }
    ),
    badVetoSummary: objectOrFallback(
      source.badVetoSummary ||
        source.learningAnalytics?.badVetoSummary ||
        source.candidateOutcomeSummary?.badVetoSummary ||
        source.learningAnalytics?.candidateOutcomeSummary?.badVetoSummary,
      { count: 0, byBlocker: [] }
    ),
    paperExitPolicyLabSummary: objectOrFallback(
      source.paperExitPolicyLabSummary ||
        source.report?.paperExitPolicyLabSummary ||
        source.learningAnalytics?.paperExitPolicyLabSummary ||
        source.tradingQualitySummary?.paperExitPolicyLabSummary,
      { status: "empty", count: 0, openDecisionCount: 0, diagnosticsOnly: true, liveBehaviorChanged: false }
    ),
    paperAllocatorSimulationSummary: objectOrFallback(
      source.paperAllocatorSimulationSummary ||
        source.report?.paperAllocatorSimulationSummary ||
        source.learningAnalytics?.paperAllocatorSimulationSummary ||
        source.tradingQualitySummary?.paperAllocatorSimulationSummary,
      { status: "empty", selectedCount: 0, rejectedCount: 0, diagnosticsOnly: true, liveBehaviorChanged: false, multiPositionSupported: true }
    ),
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
    orderStyleAdviceSummary: objectOrFallback(
      source.orderStyleAdviceSummary ||
        source.execution?.orderStyleAdviceSummary ||
        source.execution?.orderStyleAdvice ||
        source.tradingQualitySummary?.orderStyleAdviceSummary,
      { status: "unavailable", recommendedStyle: null, warnings: [] }
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
    noTradeSummary: objectOrFallback(source.noTradeSummary || source.tradingPathHealth?.noTradeSummary || source.ops?.noTradeSummary, {
      status: "insufficient_evidence",
      primaryReason: null,
      primaryCategory: "insufficient_evidence",
      categories: {},
      diagnosticsOnly: true
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
