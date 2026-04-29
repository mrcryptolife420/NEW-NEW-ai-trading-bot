function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeMinutesBetween(from, to) {
  const fromMs = new Date(from || 0).getTime();
  const toMs = new Date(to || 0).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs <= 0 || toMs <= 0) {
    return null;
  }
  return Math.max(0, Math.round((toMs - fromMs) / 60_000));
}

function summarizeRetryQueueItem(summary = {}) {
  return {
    eventCount: Number(summary.eventCount || 0),
    retryCount: Number(summary.retryCount || 0),
    manualReviewCount: Number(summary.manualReviewCount || 0),
    autoResolvedCount: Number(summary.autoResolvedCount || 0),
    latestAt: summary.latestAt || null,
    latestAction: summary.latestAction || null,
    latestDecision: summary.latestDecision || null,
    latestReason: summary.latestReason || null,
    latestClassification: summary.latestClassification || null,
    escalatedAt: summary.escalatedAt || null,
    escalatedAfterAttempts: Number(summary.escalatedAfterAttempts || 0) || null,
    recentReasons: arr(summary.recentReasons || []).slice(0, 3)
  };
}

export function buildManualReviewQueue({
  positions = [],
  pendingActions = [],
  referenceNow,
  slaMinutes = 6 * 60,
  limit = 12
} = {}) {
  const items = [
    ...arr(positions)
      .filter((position) => Boolean(position?.manualReviewRequired) || `${position?.lifecycleState || ""}` === "manual_review")
      .map((position) => {
        const queuedAt = position.lastReconcileCheckAt || position.entryAt || null;
        const ageMinutes = safeMinutesBetween(queuedAt, referenceNow);
        return {
          id: position.id || null,
          symbol: position.symbol || null,
          state: "manual_review",
          source: "position",
          queuedAt,
          ageMinutes,
          overdue: ageMinutes != null ? ageMinutes > slaMinutes : false,
          operatorMode: position.operatorMode || "normal",
          reconcileReason: position.reconcileReason || null,
          reconcileConfidence: position.reconcileConfidence ?? null,
          reconcileClassification: position.reconcileClassification || null,
          autonomousReconcileState: position.reconcileAutonomyState || null,
          reconcileRetrySummary: summarizeRetryQueueItem(position.reconcileRetrySummary || {}),
          note: position.reviewNote || position.reconcileClassification || position.reconcileReason || null
        };
      }),
    ...arr(pendingActions)
      .filter((item) => `${item?.state || ""}` === "manual_review")
      .map((item) => {
        const queuedAt = item.updatedAt || null;
        const ageMinutes = safeMinutesBetween(queuedAt, referenceNow);
        return {
          id: item.id || null,
          symbol: item.symbol || null,
          state: item.state || "manual_review",
          source: "pending_action",
          queuedAt,
          ageMinutes,
          overdue: ageMinutes != null ? ageMinutes > slaMinutes : false,
          operatorMode: item.operatorMode || null,
          reconcileReason: item.reason || null,
          reconcileConfidence: item.reconcileConfidence ?? null,
          reconcileClassification: item.reconcileClassification || item.reason || null,
          autonomousReconcileState: item.autonomousReconcileState || null,
          reconcileRetrySummary: summarizeRetryQueueItem(item.reconcileRetrySummary || {}),
          note: item.detail || item.recoveryAction || item.reconcileClassification || null
        };
      })
  ];
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.id || ""}:${item.symbol || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  deduped.sort((left, right) => (right.ageMinutes || 0) - (left.ageMinutes || 0));
  const oldestAgeMinutes = deduped[0]?.ageMinutes ?? null;
  const overdueCount = deduped.filter((item) => item.overdue).length;
  return {
    status: deduped.length ? (overdueCount ? "overdue" : "pending") : "clear",
    pendingCount: deduped.length,
    overdueCount,
    oldestAgeMinutes,
    slaMinutes,
    items: deduped.slice(0, limit)
  };
}
