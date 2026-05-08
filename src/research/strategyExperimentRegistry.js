import { stableId } from "../ai/neural/utils.js";

export function createStrategyExperiment({ strategyId, strategyVersion, configHash, modelVersion = "", mode = "paper", symbols = [], regimes = [], startedAt = new Date().toISOString() } = {}) {
  return {
    experimentId: stableId("strategy_exp", [strategyId, strategyVersion, configHash, mode, startedAt]),
    strategyId,
    strategyVersion,
    configHash,
    modelVersion,
    mode,
    symbols,
    regimes,
    status: "active",
    startedAt,
    endedAt: null,
    metrics: {},
    rollbackRule: "drawdown_or_safety_regression",
    livePromotionRequiresReview: true
  };
}

export function updateStrategyExperimentMetrics(experiment = {}, metrics = {}, limits = {}) {
  const maxTrades = Number(limits.maxTrades) || 100;
  const maxDays = Number(limits.maxDays) || 30;
  const ageMs = Date.now() - new Date(experiment.startedAt || Date.now()).getTime();
  const shouldClose = (metrics.trades || 0) >= maxTrades || ageMs > maxDays * 86400000;
  return { ...experiment, metrics, status: shouldClose ? "review_required" : experiment.status };
}
