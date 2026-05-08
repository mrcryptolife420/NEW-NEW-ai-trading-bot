import { finiteNumber } from "../utils.js";

export function evaluateNeuralAutoRollback({ activeExperiment = {}, metrics = {}, safety = {}, config = {} } = {}) {
  const reasons = [];
  if (finiteNumber(metrics.ece, 0) > finiteNumber(config.neuralRollbackMaxEce, 0.16)) reasons.push("calibration_worsened");
  if (finiteNumber(metrics.drawdownPct, 0) > finiteNumber(config.neuralRollbackMaxDrawdownPct, 0.08)) reasons.push("drawdown_breach");
  if (finiteNumber(metrics.lossStreak, 0) >= finiteNumber(config.neuralRollbackLossStreak, 3)) reasons.push("loss_streak");
  if (finiteNumber(metrics.baselineUnderperformancePct, 0) > 0) reasons.push("baseline_underperformance");
  if (safety.exchangeWarning || safety.manualReviewRequired || safety.dataQuality === "corrupt") reasons.push("safety_or_data_quality_warning");
  return {
    status: reasons.length ? "rollback_recommended" : "normal",
    affectedExperimentId: activeExperiment.experimentId || null,
    actions: reasons.length ? ["disable_neural_trade_influence", "restore_previous_policy", "write_audit_event", "alert_operator"] : [],
    reasons,
    canOpenTrades: false
  };
}
