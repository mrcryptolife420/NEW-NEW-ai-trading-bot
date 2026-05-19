function buildPromotionEvidenceDossier({ paperRuns = [], liveChecks = [], incidents = [] } = {}) {
  return {
    paperRuns,
    liveChecks,
    incidents,
    sampleCount: paperRuns.length,
    profitableRuns: paperRuns.filter((run) => Number(run.pnl || 0) > 0).length,
    hardSafetyIncidents: incidents.filter((incident) => incident.severity === "hard").length
  };
}

function scorePromotionReadiness(dossier = {}, { minSamples = 30 } = {}) {
  const blockers = [];
  if (dossier.sampleCount < minSamples) blockers.push("insufficient_paper_sample");
  if (dossier.hardSafetyIncidents > 0) blockers.push("hard_safety_incidents_present");
  if (!dossier.liveChecks?.every((check) => check.ok)) blockers.push("live_checks_not_clean");
  return {
    eligible: blockers.length === 0,
    blockers
  };
}

function buildGuardedLivePlan(readiness = {}) {
  return {
    allowed: Boolean(readiness.eligible),
    maxAllocationPct: readiness.eligible ? 5 : 0,
    rollbackTriggers: ["daily_loss_limit", "reconcile_manual_review", "protection_missing"],
    blockers: readiness.blockers || []
  };
}

export { buildPromotionEvidenceDossier, scorePromotionReadiness, buildGuardedLivePlan };
