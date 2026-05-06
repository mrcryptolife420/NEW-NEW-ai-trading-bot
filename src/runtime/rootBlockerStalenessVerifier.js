import {
  getReasonDefinition,
  isHardSafetyReason
} from "../risk/reasonRegistry.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function timestampMs(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function ageMs(value, nowMs) {
  const at = timestampMs(value);
  return Number.isFinite(at) && Number.isFinite(nowMs) ? Math.max(0, nowMs - at) : null;
}

function latestTimestamp(...values) {
  const sorted = values
    .flat()
    .map((value) => ({ value, ms: timestampMs(value) }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((left, right) => right.ms - left.ms);
  return sorted[0]?.value || null;
}

function normalizeReason(value) {
  return `${value || ""}`.trim().toLowerCase() || "unknown_blocker";
}

function normalizeBlocker(input = {}) {
  const blocker = objectOrFallback(input, {});
  const reason = normalizeReason(blocker.reason || blocker.id || blocker.code || blocker.primaryReason);
  return {
    ...blocker,
    id: blocker.id || reason,
    reason,
    label: blocker.label || blocker.dashboardLabel || reason,
    source: blocker.source || "unknown",
    symbols: arr(blocker.symbols || (blocker.symbol ? [blocker.symbol] : [])),
    downstreamSymptoms: arr(blocker.downstreamSymptoms || blocker.symptoms || blocker.reasons),
    firstSeenAt: blocker.firstSeenAt || blocker.createdAt || null,
    updatedAt: blocker.updatedAt || blocker.lastSeenAt || blocker.lastUpdatedAt || null,
    lastEvidenceAt: blocker.lastEvidenceAt || blocker.evidenceAt || blocker.updatedAt || blocker.lastSeenAt || null
  };
}

function collectRootBlockers({ rootBlockers, runtimeState, exchangeSafetyStatus }) {
  const explicit = arr(rootBlockers);
  if (explicit.length) {
    return explicit.map(normalizeBlocker);
  }
  const runtime = objectOrFallback(runtimeState, {});
  const orchestrator = objectOrFallback(
    runtime.rootBlockerOrchestrator || runtime.rootBlockers || runtime.rootBlockerSummary,
    {}
  );
  const graph = arr(orchestrator.blockerGraph || orchestrator.globalBlockers || orchestrator.symbolBlockers);
  if (graph.length) {
    return graph.map(normalizeBlocker);
  }
  const primary = orchestrator.primaryRootBlocker || runtime.primaryRootBlocker || null;
  if (primary) {
    return [normalizeBlocker(primary)];
  }
  const exchangeSafety = objectOrFallback(exchangeSafetyStatus || runtime.exchangeSafety, {});
  if (exchangeSafety.entryBlocked || exchangeSafety.status === "blocked" || exchangeSafety.freezeEntries || exchangeSafety.globalFreezeEntries) {
    return [normalizeBlocker({
      reason: exchangeSafety.reason || exchangeSafety.primaryReason || "exchange_safety_blocked",
      source: "exchangeSafety",
      symptoms: arr(exchangeSafety.blockingReasons || exchangeSafety.reasons || exchangeSafety.globalFreezeReasons),
      updatedAt: exchangeSafety.updatedAt || exchangeSafety.lastCheckedAt || exchangeSafety.lastAutoReconcileAt || null,
      lastEvidenceAt: exchangeSafety.lastEvidenceAt || exchangeSafety.lastCheckedAt || null
    })];
  }
  return [];
}

function unresolvedIntentCount(intents = {}) {
  if (Array.isArray(intents)) {
    return intents.filter((intent) => !["resolved", "failed", "cancelled", "closed"].includes(`${intent?.status || ""}`.toLowerCase())).length;
  }
  const source = objectOrFallback(intents, {});
  if (Number.isFinite(Number(source.unresolvedCount))) return Number(source.unresolvedCount);
  if (Array.isArray(source.unresolvedIntentIds)) return source.unresolvedIntentIds.length;
  if (source.intents && typeof source.intents === "object") {
    return Object.values(source.intents).filter((intent) => !["resolved", "failed", "cancelled", "closed"].includes(`${intent?.status || ""}`.toLowerCase())).length;
  }
  return 0;
}

function hasCriticalAlerts(alerts = []) {
  return arr(alerts).some((alert) => ["critical", "high"].includes(`${alert?.severity || alert?.level || ""}`.toLowerCase()));
}

function positionSafetyIssues(positions = []) {
  const issues = [];
  for (const position of arr(positions)) {
    if (!position || typeof position !== "object") continue;
    const symbol = position.symbol || position.id || "unknown";
    if (position.reconcileRequired) issues.push(`position_reconcile_required:${symbol}`);
    if (position.manualReviewRequired) issues.push(`position_manual_review_required:${symbol}`);
    if (position.protectionMissing || position.protectiveOrderMissing) issues.push(`position_protection_missing:${symbol}`);
  }
  return issues;
}

function dataFreshnessSupportsStaleSuspect(dataFreshness = {}, tradingPathHealth = {}) {
  const freshness = objectOrFallback(dataFreshness, {});
  const path = objectOrFallback(tradingPathHealth, {});
  const freshnessStatus = `${freshness.status || ""}`.toLowerCase();
  if (["stale", "degraded", "unknown", "blocked"].includes(freshnessStatus)) return false;
  if (freshness.fresh === false) return false;
  if (arr(freshness.staleSources).length) return false;
  if (path.status && !["active", "degraded"].includes(`${path.status}`.toLowerCase())) return false;
  if (path.feedFresh === false || path.cycleFresh === false) return false;
  return true;
}

function requiredEvidenceForReason(reason, source = "unknown") {
  const normalized = normalizeReason(reason);
  if (normalized.includes("exchange_truth") || normalized.includes("exchange_safety")) {
    return [
      "fresh_account_snapshot",
      "fresh_open_orders",
      "fresh_user_stream_or_rest_evidence",
      "auto_reconcile_plan_without_blocking_reasons",
      "no_unresolved_execution_intents"
    ];
  }
  if (normalized.includes("reconcile") || normalized.includes("manual_review")) {
    return [
      "successful_reconcile_plan",
      "manual_review_resolved",
      "positions_match_exchange_truth",
      "protective_orders_verified"
    ];
  }
  if (normalized.includes("intent")) {
    return ["execution_intent_resolved_or_failed", "ledger_reload_verified"];
  }
  if (normalized.includes("dashboard") || source === "dashboard") {
    return ["fresh_dashboard_snapshot", "fresh_runtime_cycle", "fresh_feed_summary"];
  }
  if (normalized.includes("market") || normalized.includes("feed") || normalized.includes("decision")) {
    return ["fresh_market_snapshots", "fresh_scan_cycle", "decision_snapshot_created"];
  }
  return ["fresh_runtime_evidence", "reason_specific_clear_condition"];
}

function safeNextActionForReason(reason, { staleSuspected, hardSafety }) {
  const normalized = normalizeReason(reason);
  if (normalized.includes("exchange_truth") || normalized.includes("exchange_safety") || normalized.includes("reconcile")) {
    return "run_reconcile_plan_and_exchange_safety_status";
  }
  if (normalized.includes("intent")) {
    return "inspect_execution_intent_ledger";
  }
  if (normalized.includes("manual_review")) {
    return "complete_manual_review";
  }
  if (staleSuspected && !hardSafety) {
    return "refresh_runtime_snapshot_and_verify_blocker_source";
  }
  return "collect_required_evidence_before_clear";
}

function blockerEvidenceTimestamp(blocker, context = {}) {
  const exchangeSafety = objectOrFallback(context.exchangeSafetyStatus, {});
  const tradingPath = objectOrFallback(context.tradingPathHealth, {});
  const dataFreshness = objectOrFallback(context.dataFreshness, {});
  return latestTimestamp(
    blocker.lastEvidenceAt,
    blocker.updatedAt,
    blocker.firstSeenAt,
    exchangeSafety.lastEvidenceAt,
    exchangeSafety.lastCheckedAt,
    tradingPath.lastCycleAt,
    dataFreshness.lastUpdatedAt,
    dataFreshness.marketUpdatedAt,
    dataFreshness.streamUpdatedAt
  );
}

export function verifyRootBlockerStaleness({
  rootBlockers = [],
  runtimeState = {},
  alerts = [],
  intents = {},
  positions = [],
  exchangeSafetyStatus = null,
  dataFreshness = {},
  tradingPathHealth = {},
  now = new Date().toISOString(),
  config = {}
} = {}) {
  const nowMs = timestampMs(now);
  const staleAfterMs = Math.max(60_000, Number(config.rootBlockerStaleAfterMs || 15 * 60_000));
  const blockers = collectRootBlockers({ rootBlockers, runtimeState, exchangeSafetyStatus });
  const unresolvedIntents = unresolvedIntentCount(intents || runtimeState?.orderLifecycle?.executionIntentLedger);
  const criticalAlerts = hasCriticalAlerts(alerts);
  const positionIssues = positionSafetyIssues(positions.length ? positions : runtimeState?.openPositions);
  const freshnessSupportsStaleSuspect = dataFreshnessSupportsStaleSuspect(dataFreshness, tradingPathHealth);

  const blockerSummaries = blockers.map((raw) => {
    const blocker = normalizeBlocker(raw);
    const definition = getReasonDefinition(blocker.reason);
    const hardSafety = Boolean(definition.hardSafety || isHardSafetyReason(blocker.reason));
    const blockerStartedAt = blocker.firstSeenAt || blocker.updatedAt || blocker.lastEvidenceAt || null;
    const blockerAgeMs = ageMs(blockerStartedAt, nowMs);
    const evidenceAt = blockerEvidenceTimestamp(blocker, { exchangeSafetyStatus, tradingPathHealth, dataFreshness });
    const evidenceAgeMs = ageMs(evidenceAt, nowMs);
    const requiredEvidence = requiredEvidenceForReason(blocker.reason, blocker.source);
    const staleSuspected = Boolean(
      !hardSafety &&
        freshnessSupportsStaleSuspect &&
        blockerAgeMs != null &&
        blockerAgeMs >= staleAfterMs &&
        unresolvedIntents === 0 &&
        !criticalAlerts &&
        positionIssues.length === 0
    );
    const blockersToClear = [];
    if (hardSafety) blockersToClear.push("hard_safety_requires_explicit_evidence");
    if (unresolvedIntents > 0) blockersToClear.push("unresolved_execution_intents");
    if (criticalAlerts) blockersToClear.push("critical_alerts_active");
    if (positionIssues.length) blockersToClear.push(...positionIssues);
    if (!freshnessSupportsStaleSuspect && !hardSafety) blockersToClear.push("fresh_evidence_not_available");

    return {
      id: blocker.id,
      reason: blocker.reason,
      label: blocker.label,
      source: blocker.source,
      symbols: blocker.symbols,
      category: definition.category,
      severity: definition.severity,
      severityLevel: definition.severityLevel,
      hardSafety,
      blockerAgeMs,
      firstSeenAt: blockerStartedAt,
      lastEvidenceAt: evidenceAt,
      lastEvidenceAgeMs: evidenceAgeMs,
      requiredEvidence,
      staleSuspected,
      staleClearAllowed: false,
      safeNextAction: safeNextActionForReason(blocker.reason, { staleSuspected, hardSafety }),
      blockersToClear,
      downstreamSymptoms: blocker.downstreamSymptoms
    };
  });

  const hardSafetyCount = blockerSummaries.filter((item) => item.hardSafety).length;
  const staleSuspectedCount = blockerSummaries.filter((item) => item.staleSuspected).length;
  const status = blockerSummaries.length === 0
    ? "clear"
    : hardSafetyCount > 0 || unresolvedIntents > 0 || criticalAlerts || positionIssues.length
      ? "blocked"
      : staleSuspectedCount > 0
        ? "stale_suspected"
        : "active";

  const requiredEvidence = [...new Set(blockerSummaries.flatMap((item) => item.requiredEvidence))];
  const stillBlockedReasons = [
    ...(hardSafetyCount ? ["hard_safety_blocker_active"] : []),
    ...(unresolvedIntents ? ["unresolved_execution_intents"] : []),
    ...(criticalAlerts ? ["critical_alerts_active"] : []),
    ...positionIssues
  ];

  return {
    status,
    blockerCount: blockerSummaries.length,
    hardSafetyCount,
    staleSuspectedCount,
    staleSuspected: staleSuspectedCount > 0,
    entryUnlockEligible: false,
    forceUnlockAvailable: false,
    diagnosticsOnly: true,
    rootBlockers: blockerSummaries,
    requiredEvidence,
    stillBlockedReasons: [...new Set(stillBlockedReasons)],
    safeNextAction: status === "clear"
      ? "monitor"
      : stillBlockedReasons.length
        ? "resolve_hard_blockers_before_entries"
        : staleSuspectedCount
          ? "refresh_runtime_snapshot_and_verify_blocker_source"
          : "collect_required_evidence_before_clear",
    evidence: {
      now,
      staleAfterMs,
      freshnessSupportsStaleSuspect,
      unresolvedIntentCount: unresolvedIntents,
      criticalAlertsActive: criticalAlerts,
      positionSafetyIssues: positionIssues
    }
  };
}

export function summarizeRootBlockerStaleness(input = {}) {
  return verifyRootBlockerStaleness(input);
}
