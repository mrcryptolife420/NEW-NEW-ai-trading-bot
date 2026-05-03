function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, safeNumber(value, min)));
}

function isActiveProbation(probationState = {}) {
  const status = `${probationState?.status || ""}`.trim().toLowerCase();
  return Boolean(probationState?.active) || ["active", "probation", "post_reconcile_probation"].includes(status);
}

function isCompletedProbation(probationState = {}) {
  const status = `${probationState?.status || ""}`.trim().toLowerCase();
  return ["completed", "clean", "inactive", "none", "ready"].includes(status);
}

function isExchangeSafetyRed(probationState = {}) {
  const status = `${probationState?.exchangeSafetyStatus || probationState?.exchangeSafety?.status || ""}`.trim().toLowerCase();
  return Boolean(
    probationState?.exchangeSafetyRed ||
    probationState?.exchangeSafety?.red ||
    probationState?.exchangeSafety?.freezeEntries ||
    probationState?.exchangeSafety?.globalFreezeEntries ||
    ["blocked", "red", "needs_manual_review", "frozen"].includes(status)
  );
}

function hasUnresolvedSafetyState(probationState = {}, openPositions = []) {
  return Boolean(
    probationState?.unresolvedIntent ||
    probationState?.unresolvedIntents ||
    probationState?.reconcileRequired ||
    probationState?.manualReviewRequired ||
    probationState?.requiresManualReview ||
    arr(openPositions).some((position) =>
      position?.reconcileRequired ||
      position?.manualReviewRequired ||
      ["reconcile_required", "manual_review"].includes(`${position?.lifecycleState || ""}`.toLowerCase())
    )
  );
}

export function resolvePostReconcileProbationState(runtime = {}) {
  return runtime.postReconcileProbation ||
    runtime.exchangeSafety?.postReconcileProbation ||
    runtime.exchangeSafety?.autoReconcileCoordinator?.postReconcileProbation ||
    {};
}

export function applyPostReconcileEntryLimits({
  config = {},
  probationState = {},
  proposedEntry = {},
  openPositions = [],
  entriesThisCycle = 0
} = {}) {
  const botMode = proposedEntry.botMode || config.botMode || "paper";
  const active = isActiveProbation(probationState) && !isCompletedProbation(probationState);
  const normalMaxOpenPositions = Math.max(1, Math.round(safeNumber(config.maxOpenPositions, 1)));
  const configuredProbationMax = Math.max(1, Math.round(safeNumber(config.postReconcileMaxOpenPositions, 2)));
  const paperProbationMax = Math.max(
    configuredProbationMax,
    Math.round(safeNumber(config.postReconcilePaperMaxOpenPositions, configuredProbationMax))
  );
  const maxOpenPositionsDuringProbation = active
    ? Math.min(normalMaxOpenPositions, botMode === "paper" ? paperProbationMax : configuredProbationMax)
    : normalMaxOpenPositions;
  const currentOpenPositions = arr(openPositions).length;
  const remainingSlots = Math.max(0, maxOpenPositionsDuringProbation - currentOpenPositions);
  const maxEntriesPerCycle = active
    ? Math.max(1, Math.round(safeNumber(config.postReconcileMaxNewEntriesPerCycle, 1)))
    : Number.POSITIVE_INFINITY;
  const exposureMultiplier = active
    ? clamp(safeNumber(config.postReconcileMaxTotalExposureMultiplier, 0.5), 0, 1)
    : 1;
  const sizeMultiplier = active
    ? clamp(
        botMode === "live"
          ? safeNumber(config.postReconcileLiveSizeMultiplier, 0.25)
          : safeNumber(config.postReconcilePaperSizeMultiplier, 0.5),
        0,
        1
      )
    : 1;
  const warnings = [];
  let blockedReason = null;

  if (active) {
    warnings.push("post_reconcile_probation_active");
  }
  if (isExchangeSafetyRed(probationState)) {
    blockedReason = "exchange_safety_blocked";
  } else if (hasUnresolvedSafetyState(probationState, openPositions)) {
    blockedReason = "post_reconcile_unresolved_safety_state";
  } else if (active && currentOpenPositions >= maxOpenPositionsDuringProbation) {
    blockedReason = "post_reconcile_max_positions_reached";
  } else if (active && safeNumber(entriesThisCycle, 0) >= maxEntriesPerCycle) {
    blockedReason = "post_reconcile_cycle_entry_limit";
  } else if (active && botMode === "live" && proposedEntry.highRiskStrategy) {
    blockedReason = "post_reconcile_live_high_risk_strategy";
  }

  const tags = [];
  if (active && botMode === "paper" && !blockedReason) {
    tags.push("post_reconcile_probe");
  }

  return {
    active,
    allowed: !blockedReason,
    sizeMultiplier,
    maxTotalExposureMultiplier: exposureMultiplier,
    maxOpenPositionsDuringProbation,
    normalMaxOpenPositions,
    currentOpenPositions,
    remainingSlots,
    entriesThisCycle: Math.max(0, Math.round(safeNumber(entriesThisCycle, 0))),
    maxNewEntriesPerCycle: Number.isFinite(maxEntriesPerCycle) ? maxEntriesPerCycle : null,
    blockedReason,
    warnings,
    tags
  };
}

export function buildPostReconcileProbationStatus({
  config = {},
  runtime = {},
  probationState = resolvePostReconcileProbationState(runtime),
  openPositions = runtime.openPositions || [],
  entriesThisCycle = runtime.postReconcileProbation?.entriesThisCycle || 0
} = {}) {
  const limit = applyPostReconcileEntryLimits({
    config,
    probationState,
    proposedEntry: { botMode: config.botMode || runtime.mode || "paper" },
    openPositions,
    entriesThisCycle
  });
  return {
    status: limit.active ? "active" : "inactive",
    normalMaxOpenPositions: limit.normalMaxOpenPositions,
    postReconcileMaxOpenPositions: limit.maxOpenPositionsDuringProbation,
    currentOpenPositions: limit.currentOpenPositions,
    remainingProbationSlots: limit.remainingSlots,
    entriesThisCycle: limit.entriesThisCycle,
    maxNewEntriesPerCycle: limit.maxNewEntriesPerCycle,
    sizeMultiplier: limit.sizeMultiplier,
    maxTotalExposureMultiplier: limit.maxTotalExposureMultiplier,
    allowed: limit.allowed,
    blockedReason: limit.blockedReason,
    warnings: limit.warnings,
    tags: limit.tags,
    startedAt: probationState?.startedAt || null,
    completedAt: probationState?.completedAt || null,
    reason: probationState?.reason || null
  };
}
