import { finiteNumber } from "../utils.js";

export function buildNeuralPerformanceWatchdog({ active = {}, baseline = {}, previous = {}, health = {} } = {}) {
  const warnings = [];
  if (finiteNumber(active.profitFactor, 0) < finiteNumber(baseline.profitFactor, 0)) warnings.push("baseline_underperformance");
  if (finiteNumber(active.ece, 0) > finiteNumber(previous.ece, 0) + 0.03) warnings.push("overconfidence_drift");
  if (finiteNumber(active.slippageBps, 0) > finiteNumber(baseline.slippageBps, 0) + 5) warnings.push("execution_degradation");
  if (health.dataFreshness === "stale" || health.regimeDrift === "high") warnings.push("environment_degradation");
  return {
    status: warnings.length >= 2 ? "rollback_watch" : warnings.length ? "watch" : "normal",
    warnings,
    recommendedAction: warnings.length >= 2 ? "pause_or_rollback_neural_experiment" : warnings.length ? "keep_shadow_and_monitor" : "continue_observe"
  };
}
