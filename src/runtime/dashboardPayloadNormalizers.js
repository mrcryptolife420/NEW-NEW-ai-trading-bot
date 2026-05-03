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
    storageAuditSummary: objectOrFallback(source.storageAuditSummary || source.dataIntegrity?.storageAuditSummary, { status: "unavailable" }),
    recorderIntegritySummary: objectOrFallback(source.recorderIntegritySummary || source.dataIntegrity?.recorderIntegritySummary, { status: "unavailable", issues: [] }),
    dataFreshnessSummary: objectOrFallback(source.dataFreshnessSummary || source.dataIntegrity?.dataFreshnessSummary, { status: "unknown", staleSources: [] }),
    datasetQualitySummary: objectOrFallback(source.datasetQualitySummary || source.dataIntegrity?.datasetQualitySummary, { status: "blocked", blockingReasons: [] }),
    replayDeterminismSummary: objectOrFallback(source.replayDeterminismSummary || source.dataIntegrity?.replayDeterminismSummary, { status: "unavailable" }),
    panicPlanAvailable: Boolean(source.panicPlanAvailable)
  };
}
