import { asArray, finiteNumber, stableId } from "./utils.js";

export const NEURAL_STRESS_PACKS = Object.freeze([
  "flash_crash",
  "slow_bleed",
  "fake_breakout",
  "choppy_range",
  "spread_shock",
  "volatility_spike",
  "trend_reversal",
  "liquidation_wick",
  "low_liquidity_weekend",
  "api_stale_data",
  "partial_fills",
  "slippage_burst",
  "correlated_market_dump",
  "btc_dominance_shock",
  "funding_oi_divergence",
  "max_drawdown_breach",
  "too_many_entries",
  "repeated_stop_losses",
  "position_size_too_high",
  "exits_too_late",
  "calibration_collapse",
  "overconfident_bad_regime",
  "live_safety_violation_attempt"
]);

export function runNeuralStressScenarios({ proposal = {}, packs = [], highRisk = false, policy = {} } = {}) {
  const selected = asArray(packs).length > 0 ? asArray(packs) : NEURAL_STRESS_PACKS.slice(0, highRisk ? NEURAL_STRESS_PACKS.length : 5);
  const failures = [];
  const delta = finiteNumber(proposal.change?.delta, 0);
  for (const pack of selected) {
    if (pack === "live_safety_violation_attempt" && proposal.scope?.mode === "live" && (delta < 0 || proposal.type?.includes("relax"))) {
      failures.push({ pack, reason: "live_safety_violation_attempt" });
    }
    if (pack === "max_drawdown_breach" && finiteNumber(proposal.risk?.maxDrawdownDelta, 0) > finiteNumber(policy.maxDrawdownDelta, 0.01)) {
      failures.push({ pack, reason: "drawdown_degradation" });
    }
    if (pack === "position_size_too_high" && proposal.type === "position_size_bias" && delta > 0) {
      failures.push({ pack, reason: "position_size_too_high" });
    }
  }
  return {
    stressResultId: stableId("neural_stress", [proposal.proposalId, selected.join("|"), failures.length]),
    proposalId: proposal.proposalId,
    status: failures.length === 0 ? "passed" : "failed",
    packs: selected,
    failures,
    score: selected.length ? 1 - failures.length / selected.length : 0
  };
}
