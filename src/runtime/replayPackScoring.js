function priorityFor(type) {
  return {
    reconcile_uncertainty: 95,
    bad_veto: 90,
    execution_drag: 75,
    regime_confusion: 70,
    weak_probe: 60,
    best_probe: 55,
    high_complexity_decision: 50
  }[type] || 25;
}

function classifyPack(sample = {}) {
  if (sample.reconcileSummary?.manualReviewRequired || sample.failureMode === "reconcile_uncertainty") return "reconcile_uncertainty";
  if (sample.vetoOutcome?.label === "bad_veto" || sample.failureMode === "bad_veto") return "bad_veto";
  if (sample.exitQuality?.label === "execution_drag_exit" || sample.failureMode === "execution_drag") return "execution_drag";
  if (sample.regimeOutcome?.realizedRegime && sample.regimeOutcome?.predictedRegime && sample.regimeOutcome.realizedRegime !== sample.regimeOutcome.predictedRegime) return "regime_confusion";
  if (sample.probeScore != null && sample.probeScore < 0.4) return "weak_probe";
  if (sample.probeScore != null && sample.probeScore >= 0.75) return "best_probe";
  if ((sample.reasonCount || sample.reasons?.length || 0) >= 5) return "high_complexity_decision";
  return "general_review";
}

export function scoreReplayPackCandidate(sample = {}) {
  const packType = classifyPack(sample);
  return {
    priority: priorityFor(packType),
    packType,
    reason: sample.reason || sample.failureMode || sample.vetoOutcome?.label || packType,
    scope: sample.scope || sample.symbol || sample.strategy || null,
    sampleIds: [sample.id, sample.decisionId, sample.tradeId].filter(Boolean)
  };
}

export function buildReplayPackQueue(samples = []) {
  return samples
    .map(scoreReplayPackCandidate)
    .sort((left, right) => right.priority - left.priority || `${left.scope || ""}`.localeCompare(`${right.scope || ""}`));
}
