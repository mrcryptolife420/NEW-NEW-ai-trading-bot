import { runNeuralReplay } from "./neuralReplayEngine.js";

export function runNeuralReplayArena({ records = [], baselinePolicy = {}, challengerPolicies = [], seed = "arena" } = {}) {
  const baseline = runNeuralReplay({ records, policy: { id: "baseline", ...baselinePolicy }, seed, mode: "arena_baseline" });
  const challengers = challengerPolicies.map((policy, index) => {
    const replay = runNeuralReplay({ records, policy: { id: `challenger_${index}`, ...policy }, seed, mode: "arena_challenger" });
    return {
      policyId: policy.id || `challenger_${index}`,
      replay,
      deltaAvgNetPnlPct: replay.metrics.avgNetPnlPct - baseline.metrics.avgNetPnlPct,
      deltaProfitFactor: replay.metrics.profitFactor - baseline.metrics.profitFactor
    };
  });
  return {
    baseline,
    challengers,
    bestChallenger: challengers.slice().sort((a, b) => b.deltaAvgNetPnlPct - a.deltaAvgNetPnlPct)[0] || null,
    liveSafe: { placesOrders: false, usesLiveBroker: false }
  };
}
