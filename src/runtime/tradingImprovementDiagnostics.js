function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeReason(value) {
  return `${value || ""}`.trim() || "unknown";
}

function countBy(items = [], keyFn = (item) => item) {
  const counts = new Map();
  for (const item of arr(items)) {
    const key = normalizeReason(keyFn(item));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => (right.count - left.count) || left.id.localeCompare(right.id));
}

function pushCount(target, id, count = 1) {
  const key = normalizeReason(id);
  target.set(key, (target.get(key) || 0) + safeNumber(count, 1));
}

function summarizeCountMap(map = new Map(), limit = 5) {
  return [...map.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => (right.count - left.count) || left.id.localeCompare(right.id))
    .slice(0, limit);
}

function extractDecisionReasons(decision = {}) {
  return [
    ...arr(decision.reasons),
    ...arr(decision.blockerReasons),
    ...arr(decision.reasonCodes),
    decision.primaryReason,
    decision.rootBlocker,
    decision.decisionTruth?.primaryReason,
    decision.entryDiagnostics?.rootBlocker?.reason
  ].filter(Boolean).map(normalizeReason);
}

export function buildMetaCautionDiagnostics({
  topDecisions = [],
  blockedSetups = [],
  lastEntryAttempt = {},
  lowConfidenceAudit = {},
  blockerFrictionAudit = {}
} = {}) {
  const decisions = [...arr(topDecisions), ...arr(blockedSetups)];
  const metaReasons = [];
  const driverCounts = new Map();
  const featureCounts = new Map();
  const actionCounts = new Map();

  for (const decision of decisions) {
    const reasons = extractDecisionReasons(decision);
    for (const reason of reasons) {
      if (/meta_|model_confidence|committee|quality/i.test(reason)) {
        metaReasons.push(reason);
      }
    }
    const pressure = decision.lowConfidencePressure || decision.entryDiagnostics?.lowConfidencePressure || {};
    if (pressure.primaryDriver) {
      pushCount(driverCounts, pressure.primaryDriver);
    }
    if (pressure.dominantFeaturePressureSource) {
      pushCount(featureCounts, pressure.dominantFeaturePressureSource);
    }
    const metaAction = decision.metaSummary?.action || decision.entryDiagnostics?.meta?.action || decision.meta?.action;
    if (metaAction && metaAction !== "pass") {
      pushCount(actionCounts, metaAction);
    }
  }

  for (const item of arr(lastEntryAttempt?.blockedReasonDetails?.lowConfidenceDrivers)) {
    pushCount(driverCounts, item.id, item.count || 1);
  }
  for (const item of arr(lastEntryAttempt?.blockedReasonDetails?.featurePressureSources)) {
    pushCount(featureCounts, item.id, item.count || 1);
  }
  for (const item of arr(lastEntryAttempt?.blockedReasonDetails?.metaActions)) {
    pushCount(actionCounts, item.id, item.count || 1);
  }
  for (const item of arr(lowConfidenceAudit?.topDrivers || lowConfidenceAudit?.drivers)) {
    pushCount(driverCounts, item.id || item.driver || item.reason, item.count || 1);
  }
  for (const item of arr(blockerFrictionAudit?.topBlockers || blockerFrictionAudit?.blockers)) {
    if (/meta_|model_confidence|committee|quality/i.test(item.id || item.reason || "")) {
      metaReasons.push(item.id || item.reason);
    }
  }

  const topReasons = countBy(metaReasons).slice(0, 5);
  const totalMetaBlocks = metaReasons.length;
  return {
    status: totalMetaBlocks ? "active" : "clear",
    totalMetaBlocks,
    topReasons,
    topDrivers: summarizeCountMap(driverCounts, 5),
    topFeaturePressureSources: summarizeCountMap(featureCounts, 5),
    topMetaActions: summarizeCountMap(actionCounts, 4),
    recommendedAction: totalMetaBlocks
      ? "Inspecteer top drivers en bad-veto evidence voordat thresholds worden aangepast."
      : "Geen dominante meta-caution druk in deze snapshot."
  };
}

export function buildExchangeSafetyRecoveryDiagnostics({
  exchangeSafety = {},
  exchangeTruth = {},
  signalFlow = {},
  lastEntryAttempt = {}
} = {}) {
  const decisionFunnel = signalFlow.tradingFlowHealth?.decisionFunnel || signalFlow.decisionFunnel || {};
  const recoveryOnly = Boolean(
    lastEntryAttempt?.recoveryOnly ||
    decisionFunnel.mode === "exchange_safety_recovery_only" ||
    exchangeSafety.globalFreezeEntries ||
    exchangeSafety.freezeEntries ||
    exchangeTruth.freezeEntries
  );
  const reason = exchangeSafety.globalFreezeReason || exchangeSafety.reason || exchangeTruth.reason || decisionFunnel.dominantReason || null;
  return {
    status: recoveryOnly ? "recovery_only" : "clear",
    recoveryOnly,
    reason,
    allowedOperations: recoveryOnly
      ? arr(lastEntryAttempt?.allowedOperations).length
        ? arr(lastEntryAttempt.allowedOperations)
        : ["reconcile", "exit", "protective_rebuild"]
      : [],
    blockedSymbols: arr(exchangeSafety.blockedSymbols).slice(0, 8),
    lastReconcileAction: exchangeSafety.autoReconcileSummary?.latestAction || exchangeSafety.lastAutoReconcileAction || null,
    recommendedAction: recoveryOnly
      ? "Laat entries gepauzeerd; controleer reconcile/exits/protective rebuilds en hervat pas na schone exchange truth."
      : "Exchange safety blokkeert geen globale entries."
  };
}

export function buildBadVetoEvidenceDigest({ rejectAdaptiveLearning = {}, offlineTrainer = {} } = {}) {
  const recommendations = arr(rejectAdaptiveLearning.recommendations || rejectAdaptiveLearning.adaptiveCandidates);
  const blockerStats = arr(rejectAdaptiveLearning.blockerStats);
  const counterfactuals = offlineTrainer.counterfactuals || {};
  const topRecommendation = recommendations[0] || null;
  return {
    status: rejectAdaptiveLearning.status || (recommendations.length ? "active" : "warmup"),
    refreshedAt: rejectAdaptiveLearning.refreshedAt || null,
    recommendationCount: recommendations.length,
    topRecommendation,
    topBlockers: blockerStats.slice(0, 5),
    counterfactualCount: safeNumber(counterfactuals.total, 0),
    averageMissedMovePct: counterfactuals.averageMissedMovePct ?? null,
    recommendedAction: recommendations.length
      ? "Gebruik aanbevelingen alleen paper-only en scoped; live blijft strikt."
      : "Meer gesloten counterfactual/reject evidence verzamelen voordat softening wordt toegepast."
  };
}

export function buildRequestWeightMitigationPlan({
  requestWeight = {},
  requestBudget = {},
  streamFallbackHealth = {},
  streamStatus = {}
} = {}) {
  const weight = requestWeight || {};
  const budget = requestBudget || {};
  const fallbackHealth = streamFallbackHealth || {};
  const streams = streamStatus || {};
  const topCallers = arr(budget.topCallers);
  const privateHotspots = topCallers.filter((caller) => /openOrders|open_orders|myTrades|account|order/i.test(caller.caller || ""));
  const publicHotspots = topCallers.filter((caller) => /depth|orderBook|bookTicker|klines|ticker/i.test(caller.caller || ""));
  const pressureLevel = budget.pressureLevel || (weight.banActive ? "critical" : weight.warningActive ? "warning" : "unknown");
  const actions = [
    privateHotspots.length ? "Maak User Data Stream leidend voor orders/fills/account en beperk private REST tot reconcile sanity checks." : null,
    publicHotspots.length ? "Gebruik public WebSocket/local book voor hot market-data callers en verhoog REST fallback TTL." : null,
    fallbackHealth.status === "degraded" ? "Herstel stream fallback health voordat scanner/deep-book REST wordt opgevoerd." : null,
    weight.banActive ? "Hard pause blijft actief tot Binance banUntil verstreken is." : null,
    ...arr(budget.recommendedActions)
  ].filter(Boolean);
  return {
    status: weight.banActive ? "ban_active" : privateHotspots.length || publicHotspots.length ? "action_required" : "observe",
    pressureLevel,
    latestWeight1m: budget.latestWeight1m ?? weight.usedWeight1m ?? null,
    privateHotspots: privateHotspots.slice(0, 5),
    publicHotspots: publicHotspots.slice(0, 5),
    streamStatus: streams.status || fallbackHealth.status || "unknown",
    actions: [...new Set(actions)].slice(0, 6)
  };
}

export function buildStrategyRiskDiagnostics(readModel = {}) {
  const lifecycle = readModel.strategyLifecycleDiagnostics || {};
  const dangerous = arr(lifecycle.topDangerous || readModel.topScorecards)
    .filter((item) => ["dangerous", "negative_edge"].includes(item.status))
    .slice(0, 5);
  return {
    status: dangerous.length ? "review_required" : lifecycle.status || "observe",
    dangerous,
    promoteCandidates: arr(lifecycle.promoteCandidates).slice(0, 5),
    recommendedAction: dangerous.length
      ? "Downweight/quarantine eerst diagnostisch per strategy/regime/session; wijzig live allocator pas na replaybewijs."
      : lifecycle.recommendedAction || "Blijf strategy scorecards verzamelen."
  };
}

export function buildTradingImprovementDiagnostics(input = {}) {
  const metaCaution = buildMetaCautionDiagnostics(input);
  const exchangeSafetyRecovery = buildExchangeSafetyRecoveryDiagnostics(input);
  const badVeto = buildBadVetoEvidenceDigest(input);
  const requestWeight = buildRequestWeightMitigationPlan(input);
  const strategyRisk = buildStrategyRiskDiagnostics(input.readModel || {});
  const priorityActions = [
    ...arr(requestWeight.actions),
    exchangeSafetyRecovery.recoveryOnly ? exchangeSafetyRecovery.recommendedAction : null,
    metaCaution.totalMetaBlocks ? metaCaution.recommendedAction : null,
    badVeto.recommendationCount ? badVeto.recommendedAction : null,
    strategyRisk.status === "review_required" ? strategyRisk.recommendedAction : null
  ].filter(Boolean);
  return {
    status: requestWeight.status === "ban_active" || exchangeSafetyRecovery.recoveryOnly
      ? "blocked_or_recovery"
      : priorityActions.length
        ? "action_required"
        : "observe",
    metaCaution,
    exchangeSafetyRecovery,
    badVeto,
    requestWeight,
    strategyRisk,
    priorityActions: [...new Set(priorityActions)].slice(0, 8)
  };
}
