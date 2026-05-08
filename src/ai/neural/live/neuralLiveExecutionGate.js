import { asArray, finiteNumber } from "../utils.js";

export function evaluateNeuralLiveExecutionGate({
  config = {},
  stats = {},
  safetySnapshot = {},
  exchangeSummary = {},
  intents = [],
  rollbackWatch = {},
  promotionDossier = {}
} = {}) {
  const blockingReasons = [];
  if (config.neuralLiveAutonomyEnabled !== true) blockingReasons.push("neural_live_autonomy_disabled");
  if (`${config.neuralLiveAutonomyAcknowledged || ""}` !== "I_UNDERSTAND_NEURAL_LIVE_RISK") blockingReasons.push("missing_neural_live_ack");
  if (rollbackWatch.status === "rollback_recommended") blockingReasons.push("rollback_recommended");
  if (safetySnapshot.entryPermission === "blocked" || safetySnapshot.exchangeTruthFreeze === true) blockingReasons.push("exchange_safety_not_green");
  if (exchangeSummary.reconcileRequired || exchangeSummary.manualReviewRequired) blockingReasons.push("reconcile_or_manual_review_required");
  if (asArray(intents).some((intent) => intent.status === "unresolved")) blockingReasons.push("unresolved_execution_intent");
  if ((stats.liveTradesObserved || 0) < (config.neuralLiveObserveMinTrades ?? 25)) blockingReasons.push("insufficient_live_observe_trades");
  if ((stats.paperTrades || 0) < (config.neuralPaperMinTrades ?? 50)) blockingReasons.push("insufficient_paper_trades");
  if (finiteNumber(stats.dailyDrawdownPct, 0) > finiteNumber(config.neuralLiveAutonomyMaxDailyDrawdown, 0.01)) blockingReasons.push("daily_drawdown_limit");
  if (promotionDossier.status && !["canary_candidate", "ready"].includes(promotionDossier.status)) blockingReasons.push("promotion_dossier_not_ready");
  return {
    status: blockingReasons.length === 0 ? "canary_ready" : "blocked",
    canSubmitLiveIntent: blockingReasons.length === 0,
    canCallLiveBrokerDirectly: false,
    blockingReasons,
    caps: {
      maxTradesPerDay: config.neuralLiveAutonomyMaxTradesPerDay ?? 2,
      maxPositionFraction: config.neuralLiveAutonomyMaxPositionFraction ?? 0.03
    }
  };
}
