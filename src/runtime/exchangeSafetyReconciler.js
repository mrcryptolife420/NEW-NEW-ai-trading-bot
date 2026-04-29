import { clamp } from "../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSorted(values = []) {
  return [...new Set(arr(values).filter(Boolean))].sort((left, right) => `${left}`.localeCompare(`${right}`));
}

function issueSeverity(issue = "") {
  if ([
    "manual_review",
    "large_qty_mismatch",
    "position_quantity_mismatch",
    "position_sync_failed",
    "unexpected_open_order_for_managed_position",
    "multiple_protective_order_lists_detected",
    "orphaned_exit_order_with_balance",
    "unmanaged_balance_detected"
  ].includes(issue)) {
    return "high";
  }
  if ([
    "protective_order_rebuild_failed",
    "protective_order_for_recovered_position_failed",
    "protective_order_state_stale",
    "reconcile_required",
    "protect_only",
    "protection_pending"
  ].includes(issue)) {
    return "medium";
  }
  return "warning";
}

function upsertBlockedSymbol(symbolMap, symbol, reason, detail = {}) {
  if (!symbol) {
    return;
  }
  const existing = symbolMap.get(symbol) || {
    symbol,
    reason: reason || "attention_required",
    reasons: [],
    severity: issueSeverity(reason),
    source: detail.source || "runtime"
  };
  const reasons = uniqueSorted([...arr(existing.reasons), reason]);
  const severityRank = { warning: 1, medium: 2, high: 3 };
  const nextSeverity = issueSeverity(reason);
  const merged = {
    ...existing,
    ...detail,
    symbol,
    reason: existing.reason || reason || "attention_required",
    reasons,
    severity: severityRank[nextSeverity] > severityRank[existing.severity] ? nextSeverity : existing.severity
  };
  if (severityRank[nextSeverity] >= severityRank[existing.severity]) {
    merged.reason = reason || merged.reason;
  }
  symbolMap.set(symbol, merged);
}

function buildPaperBlockedSymbols({ runtime = {}, exchangeTruth = {} } = {}) {
  const symbolMap = new Map();
  for (const position of arr(runtime.openPositions)) {
    const symbol = position?.symbol;
    if (!symbol) {
      continue;
    }
    if (position.manualReviewRequired || `${position.lifecycleState || ""}` === "manual_review") {
      upsertBlockedSymbol(symbolMap, symbol, "manual_review", {
        source: "position",
        state: "manual_review",
        operatorMode: position.operatorMode || null,
        reconcileConfidence: position.reconcileConfidence ?? null,
        autonomousReconcileState: position.reconcileAutonomyState || null,
        reconcileClassification: position.reconcileClassification || position.reconcileReason || null,
        reconcileRetrySummary: position.reconcileRetrySummary || null
      });
    } else if (`${position.operatorMode || ""}` === "protect_only" || `${position.lifecycleState || ""}` === "protect_only") {
      upsertBlockedSymbol(symbolMap, symbol, "protect_only", {
        source: "position",
        state: "protect_only",
        operatorMode: position.operatorMode || "protect_only",
        reconcileConfidence: position.reconcileConfidence ?? null,
        autonomousReconcileState: position.reconcileAutonomyState || null,
        reconcileClassification: position.reconcileClassification || position.reconcileReason || null,
        reconcileRetrySummary: position.reconcileRetrySummary || null
      });
    } else if (position.reconcileRequired || `${position.lifecycleState || ""}` === "reconcile_required") {
      upsertBlockedSymbol(symbolMap, symbol, "reconcile_required", {
        source: "position",
        state: "reconcile_required",
        operatorMode: position.operatorMode || null,
        reconcileConfidence: position.reconcileConfidence ?? null,
        autonomousReconcileState: position.reconcileAutonomyState || null,
        reconcileClassification: position.reconcileClassification || position.reconcileReason || null,
        reconcileRetrySummary: position.reconcileRetrySummary || null
      });
    }
  }
  for (const item of arr(runtime.orderLifecycle?.pendingActions)) {
    const symbol = item?.symbol;
    if (!symbol) {
      continue;
    }
    if (["manual_review", "protect_only", "reconcile_required", "protection_pending"].includes(item.state)) {
      upsertBlockedSymbol(symbolMap, symbol, item.state, {
        source: "pending_action",
        state: item.state,
        updatedAt: item.updatedAt || item.startedAt || null
      });
    }
  }
  for (const symbol of arr(exchangeTruth.staleProtectiveSymbols)) {
    upsertBlockedSymbol(symbolMap, symbol, "protect_only", {
      source: "exchange_truth",
      state: "protect_only"
    });
  }
  for (const warning of arr(exchangeTruth.warnings)) {
    if (!warning?.symbol) {
      continue;
    }
    if (!EXCHANGE_TRUTH_WARNING_SYMBOL_ISSUES.has(warning.issue)) {
      continue;
    }
    const reason = warning.issue === "position_quantity_mismatch"
      ? "large_qty_mismatch"
      : warning.issue === "protective_order_state_stale"
        ? "protect_only"
        : warning.issue;
    upsertBlockedSymbol(symbolMap, warning.symbol, reason, {
      source: "exchange_truth_warning",
      state: ["reconcile_required", "protect_only", "manual_review"].includes(reason) ? reason : null
    });
  }
  return [...symbolMap.values()].sort((left, right) => `${left.symbol}`.localeCompare(`${right.symbol}`));
}

function isPaperMode(config = {}) {
  return (config.botMode || "paper") === "paper";
}

function isBinanceDemoPaper(config = {}) {
  return isPaperMode(config) && String(config.paperExecutionVenue || "").toLowerCase() === "binance_demo_spot";
}

/** Zelfde issue-set als liveBroker.reconcileRuntime bij mismatch-union (minus recentFillSymbols). */
const EXCHANGE_TRUTH_WARNING_SYMBOL_ISSUES = new Set([
  "protective_order_rebuild_failed",
  "protective_order_for_recovered_position_failed",
  "protective_order_state_stale",
  "position_sync_failed",
  "unmanaged_balance_detected",
  "position_quantity_mismatch",
  "position_quantity_reduced_to_exchange_balance",
  "stale_untracked_entry_order_cancel_failed",
  "stale_untracked_exit_order_cancel_failed",
  "multiple_protective_order_lists_detected",
  "orphaned_exit_order_with_balance",
  "unexpected_open_order_for_managed_position"
]);

const RESOLVED_PAPER_SYMBOL_WARNING_ISSUES = new Set([
  ...EXCHANGE_TRUTH_WARNING_SYMBOL_ISSUES,
  "runtime_position_missing_on_exchange",
  "auto_reconcile_confirmed_flat_local_close",
  "auto_reconcile_confirmed_flat_unsellable_dust",
  "auto_reconcile_manual_review_required",
  "auto_reconcile_cleared_after_quorum",
  "auto_reconcile_mark_state_refreshed",
  "auto_reconcile_entry_reference_refreshed"
]);

function buildAutoReconcileSummary(autoReconcileAudits = []) {
  const audits = arr(autoReconcileAudits);
  const averageConfidence = audits.length
    ? num(
        audits.reduce((total, item) => total + safeNumber(item.confidence, 0), 0) / audits.length,
        4
      )
    : null;
  return {
    autoResolvedCount: audits.filter((item) => item.applied).length,
    manualRequiredCount: audits.filter((item) => `${item.decision || ""}`.toUpperCase() === "NEEDS_MANUAL_REVIEW").length,
    retryCount: audits.filter((item) => `${item.decision || ""}`.toUpperCase() === "TRANSIENT_RETRY").length,
    averageConfidence,
    topClassifications: [...new Map(
      audits
        .filter((item) => item.classification)
        .map((item) => [item.classification, audits.filter((audit) => audit.classification === item.classification).length])
    ).entries()]
      .sort((left, right) => right[1] - left[1] || `${left[0]}`.localeCompare(`${right[0]}`))
      .slice(0, 4)
      .map(([id, count]) => ({ id, count }))
  };
}

function computeExchangeTruthMismatchCount(exchangeTruth = {}) {
  const warningSymbols = arr(exchangeTruth.warnings)
    .filter((warning) => EXCHANGE_TRUTH_WARNING_SYMBOL_ISSUES.has(warning.issue))
    .map((warning) => warning.symbol)
    .filter(Boolean);
  const manualAuditSymbols = arr(exchangeTruth.autoReconcileAudits)
    .filter((item) => `${item.decision || ""}`.toUpperCase() === "NEEDS_MANUAL_REVIEW")
    .map((item) => item.symbol)
    .filter(Boolean);
  return new Set([
    ...arr(exchangeTruth.orphanedSymbols),
    ...arr(exchangeTruth.missingRuntimeSymbols),
    ...arr(exchangeTruth.unmatchedOrderSymbols),
    ...arr(exchangeTruth.staleProtectiveSymbols),
    ...arr(exchangeTruth.manualInterferenceSymbols),
    ...warningSymbols,
    ...manualAuditSymbols
  ]).size;
}

/**
 * Aantal unieke symbolen dat telt voor entry-freeze op Binance demo-paper.
 * Sluit `recentFillSymbols` impliciet uit (die zitten niet in deze union).
 */
export function buildBinanceDemoPaperMismatchSymbolCount(exchangeTruth = {}) {
  const fromWarnings = arr(exchangeTruth.warnings)
    .filter((w) => EXCHANGE_TRUTH_WARNING_SYMBOL_ISSUES.has(w.issue))
    .map((w) => w.symbol)
    .filter(Boolean);
  return new Set([
    ...arr(exchangeTruth.orphanedSymbols),
    ...arr(exchangeTruth.missingRuntimeSymbols),
    ...arr(exchangeTruth.unmatchedOrderSymbols),
    ...arr(exchangeTruth.staleProtectiveSymbols),
    ...fromWarnings
  ]).size;
}

export function binanceDemoPaperHardInventoryDrift(exchangeTruth = {}) {
  return (
    arr(exchangeTruth.orphanedSymbols).length > 0 ||
    arr(exchangeTruth.missingRuntimeSymbols).length > 0 ||
    arr(exchangeTruth.unmatchedOrderSymbols).length > 0 ||
    arr(exchangeTruth.manualInterferenceSymbols).length > 0
  );
}

/**
 * Wist unmatched/orphaned/manual-lijsten als reconcile **geen mismatch** meldt — voorkomt phantom lifecycle-pending
 * (ook op Binance demo-spot na schone reconcile).
 */
/**
 * Pending actions die op paper entries mogen bevriezen (gelijk aan audit `criticalPendingForEntryFreeze`).
 */
export function materialPaperLifecyclePendingForEntryFreeze(pendingActions = [], config = {}) {
  const demoPaper = isBinanceDemoPaper(config);
  const materialStates = new Set(["manual_review", "reconcile_required", "protection_pending"]);
  return arr(pendingActions).filter((item) => {
    if (!materialStates.has(item.state)) {
      return false;
    }
    if (demoPaper && (item.state === "manual_review" || item.state === "protection_pending" || item.state === "reconcile_required")) {
      return false;
    }
    return true;
  });
}

export function sanitizeStaleLiveExchangeTruthFlagsOnPurePaper(exchangeTruth = {}, config = {}) {
  const et = { ...exchangeTruth };
  if (!isPaperMode(config)) {
    return et;
  }
  const mismatch = Number(et.mismatchCount) || 0;
  if (mismatch !== 0) {
    return et;
  }
  if (!arr(et.unmatchedOrderSymbols).length && !arr(et.orphanedSymbols).length && !arr(et.manualInterferenceSymbols).length) {
    return et;
  }
  return {
    ...et,
    unmatchedOrderSymbols: [],
    orphanedSymbols: [],
    manualInterferenceSymbols: []
  };
}

export function clearResolvedPaperSymbolState(runtime = {}, { symbol = null, positionId = null, config = {}, nowIso = new Date().toISOString() } = {}) {
  if (!isBinanceDemoPaper(config) || !symbol) {
    return {
      cleared: false,
      symbol: symbol || null,
      positionId: positionId || null,
      cleanedLists: [],
      pendingActionsRemoved: 0,
      exchangeTruthChanged: false,
      freezeEntriesBefore: Boolean(runtime.exchangeTruth?.freezeEntries),
      freezeEntriesAfter: Boolean(runtime.exchangeTruth?.freezeEntries),
      mismatchCount: safeNumber(runtime.exchangeTruth?.mismatchCount, 0)
    };
  }

  const targetSymbol = `${symbol}`;
  const targetPositionId = positionId || null;
  const freezeEntriesBefore = Boolean(runtime.exchangeTruth?.freezeEntries);
  const cleanedLists = [];
  const lifecycle = runtime.orderLifecycle && typeof runtime.orderLifecycle === "object" ? runtime.orderLifecycle : null;
  let pendingActionsRemoved = 0;
  if (lifecycle) {
    const blockingStates = new Set(["manual_review", "reconcile_required", "protect_only", "protection_pending"]);
    const previousPendingCount = arr(lifecycle.pendingActions).length;
    const nextPendingActions = arr(lifecycle.pendingActions).filter((item) => {
      const matchesSymbol = item?.symbol === targetSymbol;
      const matchesId = targetPositionId && item?.id === targetPositionId;
      const removableState = blockingStates.has(item?.state);
      const keep = !(removableState && (matchesSymbol || matchesId));
      if (!keep) {
        pendingActionsRemoved += 1;
      }
      return keep;
    });
    lifecycle.pendingActions = nextPendingActions;
    runtime.orderLifecycle = lifecycle;
    if (previousPendingCount !== nextPendingActions.length) {
      cleanedLists.push("orderLifecycle.pendingActions");
    }
  }

  const currentExchangeTruth = runtime.exchangeTruth && typeof runtime.exchangeTruth === "object"
    ? runtime.exchangeTruth
    : {};
  const maybeMarkCleaned = (field, before, after) => {
    if (JSON.stringify(before || []) !== JSON.stringify(after || [])) {
      cleanedLists.push(`exchangeTruth.${field}`);
    }
  };
  const orphanedSymbols = arr(currentExchangeTruth.orphanedSymbols).filter((item) => item !== targetSymbol);
  const missingRuntimeSymbols = arr(currentExchangeTruth.missingRuntimeSymbols).filter((item) => item !== targetSymbol);
  const unmatchedOrderSymbols = arr(currentExchangeTruth.unmatchedOrderSymbols).filter((item) => item !== targetSymbol);
  const manualInterferenceSymbols = arr(currentExchangeTruth.manualInterferenceSymbols).filter((item) => item !== targetSymbol);
  const staleProtectiveSymbols = arr(currentExchangeTruth.staleProtectiveSymbols).filter((item) => item !== targetSymbol);
  const recentFillSymbols = arr(currentExchangeTruth.recentFillSymbols).filter((item) => item !== targetSymbol);
  const blockingOrphanedSymbols = arr(currentExchangeTruth.blockingOrphanedSymbols).filter((item) => item !== targetSymbol);
  const warnings = arr(currentExchangeTruth.warnings).filter((warning) =>
    !(warning?.symbol === targetSymbol && RESOLVED_PAPER_SYMBOL_WARNING_ISSUES.has(warning.issue))
  );
  const autoReconcileAudits = arr(currentExchangeTruth.autoReconcileAudits).filter((item) => item?.symbol !== targetSymbol);
  const orphanedBalanceDiagnostics = arr(currentExchangeTruth.orphanedBalanceDiagnostics).filter((item) => item?.symbol !== targetSymbol);
  const nextExchangeTruth = {
    ...currentExchangeTruth,
    orphanedSymbols,
    missingRuntimeSymbols,
    unmatchedOrderSymbols,
    manualInterferenceSymbols,
    staleProtectiveSymbols,
    recentFillSymbols,
    blockingOrphanedSymbols,
    warnings,
    autoReconcileAudits,
    orphanedBalanceDiagnostics
  };
  maybeMarkCleaned("orphanedSymbols", currentExchangeTruth.orphanedSymbols, orphanedSymbols);
  maybeMarkCleaned("missingRuntimeSymbols", currentExchangeTruth.missingRuntimeSymbols, missingRuntimeSymbols);
  maybeMarkCleaned("unmatchedOrderSymbols", currentExchangeTruth.unmatchedOrderSymbols, unmatchedOrderSymbols);
  maybeMarkCleaned("manualInterferenceSymbols", currentExchangeTruth.manualInterferenceSymbols, manualInterferenceSymbols);
  maybeMarkCleaned("staleProtectiveSymbols", currentExchangeTruth.staleProtectiveSymbols, staleProtectiveSymbols);
  maybeMarkCleaned("recentFillSymbols", currentExchangeTruth.recentFillSymbols, recentFillSymbols);
  maybeMarkCleaned("blockingOrphanedSymbols", currentExchangeTruth.blockingOrphanedSymbols, blockingOrphanedSymbols);
  maybeMarkCleaned("warnings", currentExchangeTruth.warnings, warnings);
  maybeMarkCleaned("autoReconcileAudits", currentExchangeTruth.autoReconcileAudits, autoReconcileAudits);
  maybeMarkCleaned("orphanedBalanceDiagnostics", currentExchangeTruth.orphanedBalanceDiagnostics, orphanedBalanceDiagnostics);
  nextExchangeTruth.autoReconcileSummary = buildAutoReconcileSummary(nextExchangeTruth.autoReconcileAudits);
  nextExchangeTruth.mismatchCount = computeExchangeTruthMismatchCount(nextExchangeTruth);
  nextExchangeTruth.freezeEntries = nextExchangeTruth.mismatchCount > 0 ? Boolean(nextExchangeTruth.freezeEntries) : false;
  nextExchangeTruth.status = nextExchangeTruth.mismatchCount > 0
    ? (nextExchangeTruth.freezeEntries ? "blocked" : "degraded")
    : "healthy";
  nextExchangeTruth.lastHealthyAt = nextExchangeTruth.mismatchCount === 0
    ? nowIso
    : (nextExchangeTruth.lastHealthyAt || null);
  runtime.exchangeTruth = sanitizeStaleLiveExchangeTruthFlagsOnPurePaper(nextExchangeTruth, config);

  const exchangeTruthChanged = JSON.stringify({
    orphanedSymbols: currentExchangeTruth.orphanedSymbols || [],
    missingRuntimeSymbols: currentExchangeTruth.missingRuntimeSymbols || [],
    unmatchedOrderSymbols: currentExchangeTruth.unmatchedOrderSymbols || [],
    manualInterferenceSymbols: currentExchangeTruth.manualInterferenceSymbols || [],
    staleProtectiveSymbols: currentExchangeTruth.staleProtectiveSymbols || [],
    warnings: currentExchangeTruth.warnings || [],
    autoReconcileAudits: currentExchangeTruth.autoReconcileAudits || [],
    mismatchCount: currentExchangeTruth.mismatchCount || 0
  }) !== JSON.stringify({
    orphanedSymbols: runtime.exchangeTruth.orphanedSymbols || [],
    missingRuntimeSymbols: runtime.exchangeTruth.missingRuntimeSymbols || [],
    unmatchedOrderSymbols: runtime.exchangeTruth.unmatchedOrderSymbols || [],
    manualInterferenceSymbols: runtime.exchangeTruth.manualInterferenceSymbols || [],
    staleProtectiveSymbols: runtime.exchangeTruth.staleProtectiveSymbols || [],
    warnings: runtime.exchangeTruth.warnings || [],
    autoReconcileAudits: runtime.exchangeTruth.autoReconcileAudits || [],
    mismatchCount: runtime.exchangeTruth.mismatchCount || 0
  });

  return {
    cleared: pendingActionsRemoved > 0 || exchangeTruthChanged,
    symbol: targetSymbol,
    positionId: targetPositionId,
    cleanedLists: [...new Set(cleanedLists)],
    pendingActionsRemoved,
    exchangeTruthChanged,
    freezeEntriesBefore,
    freezeEntriesAfter: Boolean(runtime.exchangeTruth?.freezeEntries),
    mismatchCount: safeNumber(runtime.exchangeTruth?.mismatchCount, 0)
  };
}

function minutesSince(at, nowIso) {
  const atMs = new Date(at || 0).getTime();
  const nowMs = new Date(nowIso || Date.now()).getTime();
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs) || nowMs < atMs) {
    return null;
  }
  return (nowMs - atMs) / 60000;
}

function latestStreamMessageAt(streamStatus = {}) {
  return [
    streamStatus.lastPublicMessageAt,
    streamStatus.lastFuturesMessageAt,
    streamStatus.lastUserMessageAt
  ].filter(Boolean).sort().at(-1) || null;
}

export function buildExchangeSafetyAudit({
  runtime = {},
  report = {},
  config = {},
  streamStatus = {},
  nowIso = new Date().toISOString()
} = {}) {
  const exchangeTruth = sanitizeStaleLiveExchangeTruthFlagsOnPurePaper(runtime.exchangeTruth || {}, config);
  const autoReconcileSummary = exchangeTruth.autoReconcileSummary || {};
  const lifecycle = runtime.orderLifecycle || {};
  const openPositions = arr(runtime.openPositions);
  const pendingActions = arr(lifecycle.pendingActions);
  const mismatchCount = safeNumber(exchangeTruth.mismatchCount || 0);
  const lastReconciledAt = exchangeTruth.lastReconciledAt || null;
  const reconcileAgeMinutes = minutesSince(lastReconciledAt, nowIso);
  const streamAgeMinutes = minutesSince(latestStreamMessageAt(streamStatus), nowIso);
  const criticalPendingStates = new Set(["manual_review", "reconcile_required", "protection_pending"]);
  const demoPaper = isBinanceDemoPaper(config);
  const freezeMismatchThreshold = safeNumber(config.exchangeTruthFreezeMismatchCount, 2);
  // Lifecycle-signalen voor risico-/watch (dashboard, reasons)
  const criticalPending = pendingActions.filter((item) => {
    if (!criticalPendingStates.has(item.state)) {
      return false;
    }
    if (demoPaper && item.state === "protection_pending") {
      return false;
    }
    return true;
  });
  const criticalPendingForEntryFreeze = materialPaperLifecyclePendingForEntryFreeze(pendingActions, config);
  const stalePendingMinutes = safeNumber(config.exchangeSafetyCriticalPendingAgeMinutes, 18);
  const stalePending = pendingActions.filter((item) => {
    const ageMinutes = minutesSince(item.updatedAt || item.startedAt || item.completedAt, nowIso);
    return ageMinutes != null && ageMinutes >= stalePendingMinutes;
  });
  const maxReconcileAgeMinutes = safeNumber(
    config.exchangeSafetyMaxReconcileAgeMinutes,
    (config.botMode || "paper") === "live" ? 20 : 120
  );
  const staleReconcile = (config.botMode || "paper") === "live" &&
    openPositions.length > 0 &&
    reconcileAgeMinutes != null &&
    reconcileAgeMinutes >= maxReconcileAgeMinutes;
  const staleStream = openPositions.length > 0 &&
    streamAgeMinutes != null &&
    streamAgeMinutes >= safeNumber(config.exchangeSafetyMaxStreamSilenceMinutes, 12);
  const unresolvedLivePositions = openPositions.filter((item) =>
    (item.brokerMode || config.botMode || "paper") === "live" &&
    (!item.protectiveOrderListId || item.reconcileRequired || item.manualReviewRequired)
  );
  const negativeIncidents = arr(report.recentEvents || []).filter((item) =>
    /warning|error|fail|freeze|reconcile/i.test(item.type || "")
  ).length;

  const reasons = [];
  if (mismatchCount > 0) {
    reasons.push("exchange_truth_mismatch");
  }
  if (criticalPending.length) {
    reasons.push("critical_lifecycle_pending");
  }
  if (stalePending.length) {
    reasons.push("stale_lifecycle_actions");
  }
  if (staleReconcile) {
    reasons.push("reconcile_stale");
  }
  if (staleStream) {
    reasons.push("stream_silence_with_open_positions");
  }
  if (unresolvedLivePositions.length) {
    reasons.push("live_positions_need_attention");
  }

  const isLive = (config.botMode || "paper") === "live";
  const derivedFreezeEntries =
    isLive &&
    (
      mismatchCount > 0 ||
      criticalPendingForEntryFreeze.length > 0 ||
      staleReconcile ||
      stalePending.length > 0
    );
  // Paper: geen stale exchangeTruth.freezeEntries; alleen harde risico's bevriezen entries.
  // Demo spot: geen entry-freeze op enkel reconcile_required (zie materialPaperLifecyclePendingForEntryFreeze).
  // Ruwe mismatchCount bevat o.a. recentFillSymbols — te gevoelig voor 30m-blokkades. Harde inventory-drift
  // (orphan/unmatched/missing/manual) blokkeert direct; overige scenario's pas vanaf max(threshold, 3) symbolen.
  const demoPaperHardDrift = demoPaper && binanceDemoPaperHardInventoryDrift(exchangeTruth);
  const demoPaperSymbolFreezeCount = demoPaper ? buildBinanceDemoPaperMismatchSymbolCount(exchangeTruth) : mismatchCount;
  const demoPaperFreezeThreshold = Math.max(freezeMismatchThreshold, 3);
  const blockedSymbols = buildPaperBlockedSymbols({ runtime, exchangeTruth });
  const highSeveritySymbolBlocks = blockedSymbols.filter((item) => item.severity === "high");
  const protectionFailureSymbols = blockedSymbols.filter((item) =>
    ["protect_only", "protection_pending", "protective_order_rebuild_failed", "multiple_protective_order_lists_detected", "position_sync_failed"].includes(item.reason)
  );
  const paperMismatchFreezes = demoPaper
    ? demoPaperHardDrift || demoPaperSymbolFreezeCount >= demoPaperFreezeThreshold
    : mismatchCount > 0;
  const paperMaterialFreeze =
    !isLive &&
    (paperMismatchFreezes || criticalPendingForEntryFreeze.length > 0);
  const demoPaperGlobalFreeze =
    demoPaper &&
    (
      demoPaperHardDrift ||
      demoPaperSymbolFreezeCount >= demoPaperFreezeThreshold ||
      highSeveritySymbolBlocks.length >= demoPaperFreezeThreshold ||
      protectionFailureSymbols.length >= demoPaperFreezeThreshold
    );
  const globalFreezeEntries = isLive
    ? Boolean(exchangeTruth.freezeEntries || derivedFreezeEntries)
    : demoPaper
      ? demoPaperGlobalFreeze
      : paperMaterialFreeze;
  const riskScore = clamp(
    mismatchCount * 0.18 +
      criticalPending.length * 0.14 +
      criticalPendingForEntryFreeze.length * 0.04 +
      stalePending.length * 0.08 +
      (staleReconcile ? 0.28 : 0) +
      (staleStream ? 0.12 : 0) +
      Math.min(0.18, unresolvedLivePositions.length * 0.08) +
      Math.min(0.08, negativeIncidents * 0.01),
    0,
    1
  );
  const status = globalFreezeEntries
    ? "blocked"
    : reasons.length || blockedSymbols.length
      ? "watch"
      : "ready";
  const globalFreezeReasons = [];
  if (globalFreezeEntries) {
    if (demoPaperHardDrift) {
      globalFreezeReasons.push("hard_inventory_drift");
    }
    if (demoPaper && demoPaperSymbolFreezeCount >= demoPaperFreezeThreshold) {
      globalFreezeReasons.push("multi_symbol_exchange_mismatch");
    }
    if (demoPaper && highSeveritySymbolBlocks.length >= demoPaperFreezeThreshold) {
      globalFreezeReasons.push("multi_symbol_manual_review");
    }
    if (demoPaper && protectionFailureSymbols.length >= demoPaperFreezeThreshold) {
      globalFreezeReasons.push("multi_symbol_protection_failure");
    }
    if (!demoPaper && criticalPendingForEntryFreeze.length > 0) {
      globalFreezeReasons.push("critical_lifecycle_pending");
    }
    if (isLive && (exchangeTruth.freezeEntries || derivedFreezeEntries)) {
      globalFreezeReasons.push("exchange_truth_freeze");
    }
  }
  const canTradeOtherSymbols = !globalFreezeEntries;
  const rootBlockerPriority = globalFreezeEntries
    ? "global_freeze"
    : blockedSymbols.length
      ? "symbol_scoped"
      : "clear";

  const notes = [
    mismatchCount
      ? `${mismatchCount} exchange/runtime mismatch(es) vragen eerst reconcile.`
      : "Geen actieve exchange/runtime mismatch gezien.",
    blockedSymbols.length
      ? `${blockedSymbols.length} symbool/symbolen lopen in protect_only/manual review en worden lokaal voor nieuwe entries geblokkeerd.`
      : "Geen symbool-specifieke exchange safety blocks actief.",
    autoReconcileSummary.autoResolvedCount || autoReconcileSummary.manualRequiredCount || autoReconcileSummary.retryCount
      ? `Auto-reconcile: ${autoReconcileSummary.autoResolvedCount || 0} resolved, ${autoReconcileSummary.retryCount || 0} retry, ${autoReconcileSummary.manualRequiredCount || 0} manual.`
      : "Geen recente demo-paper auto-reconcile samenvatting beschikbaar.",
    staleReconcile
      ? `Laatste exchange reconcile is ${num(reconcileAgeMinutes, 1)} minuten oud met open live posities.`
      : lastReconciledAt
        ? `Laatste exchange reconcile: ${lastReconciledAt}.`
        : "Nog geen exchange reconcile-timestamp beschikbaar.",
    unresolvedLivePositions.length
      ? `${unresolvedLivePositions.length} live positie(s) missen nog een schone protected state.`
      : "Open live posities hebben momenteel geen extra attention-flag.",
    stalePending.length
      ? `${stalePending.length} lifecycle-actie(s) zijn mogelijk blijven hangen.`
      : "Geen verouderde lifecycle-acties gevonden."
  ];

  return {
    generatedAt: nowIso,
    status,
    freezeEntries: globalFreezeEntries,
    globalFreezeEntries,
    globalFreezeReason: globalFreezeReasons[0] || null,
    globalFreezeReasons,
    blockedSymbols,
    canTradeOtherSymbols,
    autoReconcileSummary,
    rootBlockerPriority,
    riskScore: num(riskScore),
    mismatchCount,
    criticalPendingCount: criticalPending.length,
    stalePendingCount: stalePending.length,
    unresolvedLivePositions: unresolvedLivePositions.length,
    reconcileAgeMinutes: reconcileAgeMinutes == null ? null : num(reconcileAgeMinutes, 1),
    streamAgeMinutes: streamAgeMinutes == null ? null : num(streamAgeMinutes, 1),
    reasons,
    notes,
    actions: globalFreezeEntries
      ? [
          "Laat alleen reconcile, exits en protective rebuilds lopen.",
          "Bevestig exchange inventory en protective orders voor live positions.",
          "Heropen entries pas na een schone reconcile-pass."
        ]
      : reasons.length
        ? [
            "Monitor de volgende cycle op reconcile en lifecycle-herstel.",
            "Controleer operator alerts voordat sizing weer normaliseert."
          ]
        : [
            "Geen directe exchange safety actie nodig."
          ]
  };
}
