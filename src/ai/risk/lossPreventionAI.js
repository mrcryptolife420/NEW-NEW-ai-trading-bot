import { clamp01 } from "../../utils/score.js";

const SIGNALS = [
  "badEntryRisk", "lateEntryRisk", "earlyFailureRisk", "stopLossHitRisk", "slippageSpikeRisk",
  "spreadShockRisk", "liquidityEvaporationRisk", "badExitRisk", "lateExitRisk",
  "modelOverconfidenceRisk", "correlatedLossRisk", "newsShockRisk", "dataQualityFailureRisk"
];

export function evaluateLossPreventionAI(context = {}) {
  const risks = Object.fromEntries(SIGNALS.map((key) => [key, clamp01(context[key] ?? 0, 0)]));
  const maxRisk = Math.max(...Object.values(risks));
  const actions = [];
  if (maxRisk >= 0.85) actions.push("block_entry", "alert_operator", "create_replay_case");
  if (maxRisk >= 0.65) actions.push("reduce_position_size", "increase_exit_caution");
  if (risks.liquidityEvaporationRisk >= 0.65 || risks.spreadShockRisk >= 0.65) actions.push("disable_fast_execution");
  if (risks.modelOverconfidenceRisk >= 0.65) actions.push("reduce_neural_influence");
  if (risks.correlatedLossRisk >= 0.65 || risks.newsShockRisk >= 0.65) actions.push("pause_strategy_or_symbol");
  return {
    status: maxRisk >= 0.85 ? "blocked" : maxRisk >= 0.65 ? "defensive" : "clear",
    maxRisk,
    risks,
    actions: [...new Set(actions)],
    riskMultiplier: maxRisk >= 0.85 ? 0 : maxRisk >= 0.65 ? 0.35 : 1,
    canIncreaseRisk: false,
    canForceEntry: false,
    canOverrideHardBlockers: false,
    canCallLiveBroker: false,
    auditRequired: actions.length > 0
  };
}
