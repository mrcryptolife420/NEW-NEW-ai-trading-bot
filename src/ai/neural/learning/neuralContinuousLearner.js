export function evaluateNeuralContinuousLearning({ config = {}, stats = {}, datasetQuality = {}, rollbackWatch = {} } = {}) {
  const reasons = [];
  const enabled = config.neuralContinuousLearningEnabled === true;
  if (!enabled) reasons.push("continuous_learning_disabled");
  if (rollbackWatch.status === "rollback_recommended") reasons.push("rollback_watch_active");
  if (datasetQuality.status === "blocked") reasons.push("dataset_quality_blocked");
  if ((stats.trainingsToday || 0) >= (config.neuralRetrainMaxPerDay ?? 2)) reasons.push("daily_training_limit_reached");
  const enough =
    (stats.newPaperTrades || 0) >= (config.neuralRetrainMinNewPaperTrades ?? 25) ||
    (stats.newLiveTrades || 0) >= (config.neuralRetrainMinNewLiveTrades ?? 10) ||
    (stats.newReplayCases || 0) >= (config.neuralRetrainMinNewReplayTrades ?? 200);
  if (!enough) reasons.push("insufficient_new_learning_samples");
  return {
    shouldTrain: reasons.length === 0,
    status: reasons.length === 0 ? "scheduled_candidate" : "blocked",
    reasons,
    livePromotionAllowed: false,
    outputScope: "candidate_model_only"
  };
}
