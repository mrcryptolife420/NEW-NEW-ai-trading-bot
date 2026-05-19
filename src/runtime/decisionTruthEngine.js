const BLOCKER_PRIORITY = {
  exchange_safety_blocked: 100,
  hard_inventory_conflict: 95,
  manual_review_required: 90,
  risk_limit: 80,
  model_confidence_too_low: 40
};

function dedupeBlockers(blockers = []) {
  const byReason = new Map();
  for (const blocker of blockers) {
    const reason = String(blocker.reason || blocker);
    const priority = Number(blocker.priority ?? BLOCKER_PRIORITY[reason] ?? 10);
    const existing = byReason.get(reason);
    if (!existing || priority > existing.priority) {
      byReason.set(reason, { reason, priority, category: blocker.category || "other" });
    }
  }
  return [...byReason.values()].sort((a, b) => b.priority - a.priority);
}

function buildDecisionTruth({ candidates = [], blockers = [], exchangeTruth = {} } = {}) {
  const deduped = dedupeBlockers(blockers);
  return {
    candidateCount: candidates.length,
    primaryBlocker: deduped[0] || null,
    blockers: deduped,
    exchangeTruthFresh: Boolean(exchangeTruth.fresh),
    actionable: deduped.filter((blocker) => blocker.priority < 90)
  };
}

function buildActionableUnblockPlan(truth = {}) {
  return (truth.actionable || []).map((blocker) => ({
    reason: blocker.reason,
    action: blocker.reason === "model_confidence_too_low" ? "collect_more_evidence" : "operator_review"
  }));
}

export { dedupeBlockers, buildDecisionTruth, buildActionableUnblockPlan };
