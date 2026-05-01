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
  const restGovernor = fallbackHealth.restBudgetGovernor || {};
  const streams = streamStatus || {};
  const topCallers = arr(budget.topCallers);
  const privateHotspots = topCallers.filter((caller) => /openOrders|open_orders|myTrades|account|order/i.test(caller.caller || ""));
  const publicHotspots = topCallers.filter((caller) => /depth|orderBook|bookTicker|klines|ticker/i.test(caller.caller || ""));
  const pressureLevel = budget.pressureLevel || (weight.banActive ? "critical" : weight.warningActive ? "warning" : "unknown");
  const actions = [
    privateHotspots.length ? "Maak User Data Stream leidend voor orders/fills/account en beperk private REST tot reconcile sanity checks." : null,
    publicHotspots.length ? "Gebruik public WebSocket/local book voor hot market-data callers en verhoog REST fallback TTL." : null,
    fallbackHealth.status === "degraded" ? "Herstel stream fallback health voordat scanner/deep-book REST wordt opgevoerd." : null,
    safeNumber(fallbackHealth.suppressedFallbackCount, 0) > 0 ? "Depth REST fallback is onderdrukt door de stream/local-book guard; herstel streams voordat deep-book REST terugkomt." : null,
    restGovernor.status === "guarding" ? "REST budget governor stelt niet-kritieke callers uit; reconcile/execution blijven prioriteit houden." : null,
    weight.banActive ? "Hard pause blijft actief tot Binance banUntil verstreken is." : null,
    ...arr(restGovernor.recommendedActions),
    ...arr(budget.recommendedActions)
  ].filter(Boolean);
  return {
    status: weight.banActive ? "ban_active" : privateHotspots.length || publicHotspots.length ? "action_required" : "observe",
    pressureLevel,
    latestWeight1m: budget.latestWeight1m ?? weight.usedWeight1m ?? null,
    privateHotspots: privateHotspots.slice(0, 5),
    publicHotspots: publicHotspots.slice(0, 5),
    streamStatus: streams.status || fallbackHealth.status || "unknown",
    restBudgetGovernor: restGovernor.status ? {
      status: restGovernor.status,
      guardedCallers: arr(restGovernor.guardedCallers).slice(0, 5),
      topCallers: arr(restGovernor.topCallers).slice(0, 5)
    } : null,
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

function buildAction({ id, title, status, priority, evidence = [], nextStep, safety = "diagnostic_only" }) {
  return {
    id,
    title,
    status,
    priority,
    evidence: arr(evidence).filter(Boolean).slice(0, 5),
    nextStep,
    safety
  };
}

export function buildTradingImprovementBacklog({
  metaCaution = {},
  exchangeSafetyRecovery = {},
  badVeto = {},
  requestWeight = {},
  strategyRisk = {},
  report = {},
  streamFallbackHealth = {}
} = {}) {
  const exitSummary = report.postTradeAnalytics?.summary || report.tradeQualitySummary || {};
  const executionCost = report.executionCostSummary || {};
  const openExposureReview = report.openExposureReview || {};
  const hasPrivateRestHotspots = arr(requestWeight.privateHotspots).length > 0;
  const hasPublicRestHotspots = arr(requestWeight.publicHotspots).length > 0;
  const hasDangerousStrategy = arr(strategyRisk.dangerous).length > 0;
  const hasMetaPressure = safeNumber(metaCaution.totalMetaBlocks, 0) > 0;
  const hasBadVetoEvidence = safeNumber(badVeto.recommendationCount, 0) > 0 || safeNumber(badVeto.counterfactualCount, 0) > 0;
  const exitExpectancy = exitSummary.expectancyPct ?? report.averagePnlPct ?? null;
  const exitNeedsReview = Number.isFinite(Number(exitExpectancy)) && Number(exitExpectancy) < 0;

  return [
    buildAction({
      id: "private_rest_user_stream_primary",
      title: "Private REST-druk verlagen",
      status: hasPrivateRestHotspots ? "action_required" : "observe",
      priority: 1,
      evidence: arr(requestWeight.privateHotspots).map((item) => `${item.caller} weight ${item.weight || 0}`),
      nextStep: "Maak User Data Stream leidend voor fills/orders/account; gebruik openOrders/myTrades alleen voor startup, reconcile en ambiguiteit.",
      safety: "live_safety_preserved"
    }),
    buildAction({
      id: "public_depth_stream_first",
      title: "Public depth REST terugdringen",
      status: hasPublicRestHotspots || streamFallbackHealth.status === "degraded" ? "action_required" : "observe",
      priority: 2,
      evidence: [
        ...arr(requestWeight.publicHotspots).map((item) => `${item.caller} weight ${item.weight || 0}`),
        streamFallbackHealth.status === "degraded" ? "stream fallback degraded" : null,
        safeNumber(streamFallbackHealth.suppressedFallbackCount, 0) > 0 ? `${streamFallbackHealth.suppressedFallbackCount} REST fallback(s) suppressed` : null
      ],
      nextStep: "Gebruik local order book/WebSocket als primaire bron; skip deep-book REST onder streamdegradatie of request-pressure.",
      safety: "no_order_behavior_change"
    }),
    buildAction({
      id: "range_grid_diagnostic_quarantine",
      title: "Range-grid diagnostic quarantine",
      status: hasDangerousStrategy ? "review_required" : "observe",
      priority: 3,
      evidence: arr(strategyRisk.dangerous).map((item) => `${item.strategyId || item.strategyFamily}:${item.regime || "unknown"}/${item.session || "unknown"} ${item.status}`),
      nextStep: "Toon downweight/quarantine advies per regime/session; pas live allocator pas aan na replaybewijs.",
      safety: "diagnostic_only"
    }),
    buildAction({
      id: "meta_caution_root_cause_drilldown",
      title: "Meta-caution root cause drilldown",
      status: hasMetaPressure ? "action_required" : "observe",
      priority: 4,
      evidence: [
        ...arr(metaCaution.topReasons).map((item) => `${item.id} x${item.count || 0}`),
        ...arr(metaCaution.topDrivers).map((item) => `driver ${item.id} x${item.count || 0}`)
      ],
      nextStep: "Splits meta/model blockers naar feature trust, data quality, regime/session, followthrough en bad-veto bewijs.",
      safety: "no_threshold_change"
    }),
    buildAction({
      id: "exchange_safety_recovery_playbook",
      title: "Exchange-safety recovery playbook",
      status: exchangeSafetyRecovery.recoveryOnly || openExposureReview.manualReviewCount ? "action_required" : "observe",
      priority: 5,
      evidence: [
        exchangeSafetyRecovery.reason ? `reason ${exchangeSafetyRecovery.reason}` : null,
        openExposureReview.manualReviewCount ? `${openExposureReview.manualReviewCount} manual review` : null,
        openExposureReview.reconcileRequiredCount ? `${openExposureReview.reconcileRequiredCount} reconcile required` : null
      ],
      nextStep: "Toon per symbol welke reconcile checks liepen, welke acties veilig zijn en welk signaal entries weer vrijgeeft.",
      safety: "entries_remain_blocked_until_clean_truth"
    }),
    buildAction({
      id: "golden_replay_current_blockers",
      title: "Golden replay voor huidige blokkades",
      status: hasMetaPressure || exchangeSafetyRecovery.recoveryOnly ? "recommended" : "observe",
      priority: 6,
      evidence: arr(metaCaution.topReasons).slice(0, 2).map((item) => item.id),
      nextStep: "Maak fixture voor huidige exchange-safety/meta-confidence state en vergelijk root blocker/final edge na toekomstige patches.",
      safety: "replay_only"
    }),
    buildAction({
      id: "paper_live_parity_score",
      title: "Paper/live parity score uitbreiden",
      status: executionCost.reconstructedPaperFeeSample || executionCost.status === "caution" ? "recommended" : "observe",
      priority: 7,
      evidence: [
        executionCost.status ? `execution cost ${executionCost.status}` : null,
        executionCost.averageFeeBps != null ? `avg fee ${Number(executionCost.averageFeeBps).toFixed(2)} bps` : null,
        executionCost.reconstructedPaperEntryFeeCount ? `${executionCost.reconstructedPaperEntryFeeCount} reconstructed paper fees` : null
      ],
      nextStep: "Vergelijk paper assumptions met demo/live fills op fees, slippage, partial fills, latency en spread.",
      safety: "calibration_recommendation_only"
    }),
    buildAction({
      id: "exit_loss_autopsy",
      title: "Exit-loss autopsy prioriteren",
      status: exitNeedsReview ? "review_required" : "observe",
      priority: 8,
      evidence: [
        exitExpectancy != null ? `expectancy ${Number(exitExpectancy).toFixed(4)}` : null,
        report.realizedPnl != null ? `realized PnL ${Number(report.realizedPnl).toFixed(2)}` : null,
        report.rangeGridDamageReview?.status ? `range-grid ${report.rangeGridDamageReview.status}` : null
      ],
      nextStep: "Classificeer recente verliezen als late exit, bad entry, range break, execution drag, loose stop of regime misread.",
      safety: "diagnostic_first"
    }),
    buildAction({
      id: "start_everything_functional_health",
      title: "Start-Everything functionele health",
      status: "recommended",
      priority: 9,
      evidence: [
        streamFallbackHealth.status ? `stream ${streamFallbackHealth.status}` : null,
        exchangeSafetyRecovery.recoveryOnly ? "recovery-only active" : null
      ],
      nextStep: "Controleer naast processtart ook cycle advance, stream health, snapshot freshness en functionele blokkades.",
      safety: "operator_visibility_only"
    }),
    buildAction({
      id: "operator_action_audit_trail",
      title: "Operator action audit trail",
      status: "recommended",
      priority: 10,
      evidence: [],
      nextStep: "Toon bij iedere quick action before/after root blocker, changed state, denied checks en next safe action.",
      safety: "operator_visibility_only"
    })
  ];
}

export function buildTradingImprovementDiagnostics(input = {}) {
  const metaCaution = buildMetaCautionDiagnostics(input);
  const exchangeSafetyRecovery = buildExchangeSafetyRecoveryDiagnostics(input);
  const badVeto = buildBadVetoEvidenceDigest(input);
  const requestWeight = buildRequestWeightMitigationPlan(input);
  const strategyRisk = buildStrategyRiskDiagnostics(input.readModel || {});
  const backlog = buildTradingImprovementBacklog({
    metaCaution,
    exchangeSafetyRecovery,
    badVeto,
    requestWeight,
    strategyRisk,
    report: input.report || {},
    streamFallbackHealth: input.streamFallbackHealth || {}
  });
  const priorityActions = [
    ...arr(requestWeight.actions),
    exchangeSafetyRecovery.recoveryOnly ? exchangeSafetyRecovery.recommendedAction : null,
    metaCaution.totalMetaBlocks ? metaCaution.recommendedAction : null,
    badVeto.recommendationCount ? badVeto.recommendedAction : null,
    strategyRisk.status === "review_required" ? strategyRisk.recommendedAction : null,
    ...backlog
      .filter((item) => ["action_required", "review_required"].includes(item.status))
      .map((item) => item.nextStep)
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
    backlog,
    priorityActions: [...new Set(priorityActions)].slice(0, 8)
  };
}
