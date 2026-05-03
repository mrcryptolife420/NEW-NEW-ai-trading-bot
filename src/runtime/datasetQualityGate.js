export function evaluateDatasetQuality({
  recorderAudit = {},
  freshness = {},
  sampleCounts = {},
  sourceCoverage = {},
  failureStats = {}
} = {}) {
  const blockingReasons = [];
  const warnings = [];
  const totalSamples = Number(sampleCounts.total || sampleCounts.trades || sampleCounts.decisions || 0);
  const coverage = Number(sourceCoverage.coverageRatio ?? sourceCoverage.averageCoverage ?? 1);
  const severeFailures = Number(failureStats.severe || failureStats.critical || 0);

  if (["corrupt"].includes(recorderAudit.status)) blockingReasons.push("recorder_corrupt");
  if (["degraded"].includes(recorderAudit.status)) warnings.push("recorder_degraded");
  if (["degraded", "unknown"].includes(freshness.status)) warnings.push("freshness_weak");
  if (freshness.status === "unknown" && !totalSamples) blockingReasons.push("no_fresh_dataset_evidence");
  if (totalSamples < 20) warnings.push("insufficient_samples");
  if (coverage < 0.75) warnings.push("low_source_coverage");
  if (severeFailures >= 3) warnings.push("high_failure_severity");

  const status = blockingReasons.length
    ? "blocked"
    : warnings.length >= 3
      ? "weak"
      : warnings.length
        ? "usable"
        : "strong";
  return {
    status,
    blockingReasons,
    warnings,
    recommendedNextStep: status === "blocked"
      ? "repair_recorder_or_refresh_dataset_before_research"
      : status === "weak"
        ? "collect_more_recent_high_quality_samples_before_retrain"
        : status === "usable"
          ? "use_for_diagnostics_only_until_quality_improves"
          : "dataset_ready_for_research_diagnostics",
    affectsLiveTrading: false
  };
}
