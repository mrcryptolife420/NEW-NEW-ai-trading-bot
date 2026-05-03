function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function changeKey(change = {}) {
  return `${change.key || change.type || change.name || ""}`.toLowerCase();
}

export function evaluateAntiOverfitGovernor({
  proposedChanges = [],
  evidence = {},
  config = {}
} = {}) {
  const changes = arr(proposedChanges);
  const minSamples = Math.max(1, Math.round(num(config.antiOverfitMinSamples, 30)));
  const sampleSize = num(evidence.sampleSize ?? evidence.paperTrades ?? evidence.tradeCount, 0);
  const calibrationDelta = num(evidence.calibrationDelta ?? evidence.calibrationErrorDelta, 0);
  const source = `${evidence.source || evidence.evidenceSource || "unknown"}`.toLowerCase();
  const recentPaperWinsOnly = Boolean(evidence.recentPaperWinsOnly || (source === "paper" && num(evidence.liveTrades, 0) === 0 && num(evidence.shadowTrades, 0) < minSamples));
  const blockedChanges = [];
  const allowedChanges = [];
  const reasons = [];
  const hasThresholdRelax = changes.some((change) =>
    ["threshold", "model_threshold", "min_model_confidence"].some((key) => changeKey(change).includes(key)) &&
      num(change.delta ?? change.change ?? change.adjustment, 0) < 0
  );
  const hasSizeIncrease = changes.some((change) =>
    ["size", "position", "risk"].some((key) => changeKey(change).includes(key)) &&
      num(change.delta ?? change.change ?? change.multiplierDelta ?? 0, 0) > 0
  );

  for (const change of changes) {
    const key = changeKey(change);
    const delta = num(change.delta ?? change.change ?? change.adjustment ?? change.multiplierDelta, 0);
    let blockedReason = null;
    if ((key.includes("threshold") || key.includes("confidence")) && delta < 0 && sampleSize < minSamples) {
      blockedReason = "threshold_relax_low_samples";
    } else if ((key.includes("size") || key.includes("position") || key.includes("risk")) && delta > 0 && recentPaperWinsOnly) {
      blockedReason = "size_increase_recent_paper_wins_only";
    } else if (change.promoteTo === "live" && source === "paper") {
      blockedReason = "paper_only_evidence_promoted_to_live";
    } else if (calibrationDelta > 0 && (key.includes("threshold") || key.includes("size") || change.promoteTo === "live")) {
      blockedReason = "parameter_promotion_calibration_worsened";
    }
    if (blockedReason) {
      blockedChanges.push({ ...change, blockedReason });
      reasons.push(blockedReason);
    } else {
      allowedChanges.push(change);
    }
  }

  if (hasThresholdRelax && hasSizeIncrease) {
    const simultaneousReason = "simultaneous_lower_threshold_and_bigger_size";
    reasons.push(simultaneousReason);
    for (const change of allowedChanges.splice(0)) {
      blockedChanges.push({ ...change, blockedReason: simultaneousReason });
    }
  }

  return {
    status: blockedChanges.length ? "blocked" : changes.length ? "allowed" : "empty",
    reasons: [...new Set(reasons)],
    allowedChanges,
    blockedChanges,
    recommendedAction: blockedChanges.length
      ? "keep_changes_shadow_or_paper_until_sample_and_calibration_evidence_improves"
      : "changes_pass_anti_overfit_review"
  };
}
