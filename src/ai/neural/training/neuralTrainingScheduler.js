export function evaluateNeuralTrainingSchedule({ config = {}, stats = {}, dataQuality = {}, incidents = [] } = {}) {
  const blockers = [];
  if (config.neuralContinuousLearningEnabled !== true) blockers.push("continuous_learning_disabled");
  if (dataQuality.status === "blocked" || dataQuality.status === "corrupt") blockers.push("dataset_quality_blocked");
  if (incidents.some((incident) => incident.severity === "critical" && incident.status !== "resolved")) blockers.push("unresolved_critical_incident");
  if ((stats.trainingsToday || 0) >= (config.neuralRetrainMaxPerDay ?? 2)) blockers.push("training_daily_limit");
  const enoughSamples =
    (stats.newPaperTrades || 0) >= (config.neuralRetrainMinNewPaperTrades ?? 25) ||
    (stats.newLiveTrades || 0) >= (config.neuralRetrainMinNewLiveTrades ?? 10) ||
    (stats.newReplayCases || 0) >= (config.neuralRetrainMinNewReplayTrades ?? 200);
  if (!enoughSamples) blockers.push("insufficient_new_samples");
  return {
    status: blockers.length ? "blocked" : "scheduled",
    blockers,
    job: blockers.length ? null : {
      type: "neural_retrain_candidate",
      scope: "offline_candidate_only",
      canPromoteLive: false
    }
  };
}
