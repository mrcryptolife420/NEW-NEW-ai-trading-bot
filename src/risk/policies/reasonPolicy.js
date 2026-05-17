export function isSoftPaperReason(reason) {
  return [
    "model_confidence_too_low",
    "model_uncertainty_abstain",
    "transformer_challenger_reject",
    "committee_veto",
    "committee_confidence_too_low",
    "committee_low_agreement",
    "strategy_fit_too_low",
    "strategy_context_mismatch",
    "orderbook_sell_pressure",
    "execution_cost_budget_exceeded",
    "strategy_cooldown",
    "strategy_budget_cooled",
    "family_budget_cooled",
    "cluster_budget_cooled",
    "regime_budget_cooled",
    "factor_budget_cooled",
    "daily_risk_budget_cooled",
    "regime_kill_switch_active",
    "portfolio_cvar_budget_cooled",
    "portfolio_loss_streak_guard",
    "symbol_loss_streak_guard",
    "capital_governor_blocked",
    "capital_governor_recovery",
    "trade_size_below_minimum",
    "entry_cooldown_active",
    "daily_entry_budget_reached",
    "weekend_high_risk_strategy_block",
    "ambiguous_setup_context"
  ].includes(reason);
}

export function classifyReasonCategory(reason = "") {
  if (!reason) return "other";
  if (reason.includes("confidence") || reason.includes("abstain") || reason.includes("quality")) return "quality";
  if (reason.includes("committee") || reason.includes("meta") || reason.includes("governor")) return "governance";
  if (reason.includes("volatility") || reason.includes("spread") || reason.includes("orderbook") || reason.includes("liquidity")) return "execution";
  if (reason.includes("news") || reason.includes("event") || reason.includes("calendar") || reason.includes("announcement")) return "event";
  if (reason.includes("portfolio") || reason.includes("exposure") || reason.includes("position") || reason.includes("trade_size")) return "risk";
  if (reason.includes("exchange_safety") || reason.includes("exchange_truth") || reason.includes("reconcile")) return "safety";
  if (reason.includes("regime") || reason.includes("trend") || reason.includes("breakout") || reason.includes("session")) return "regime";
  if (reason.startsWith("paper_learning_") || reason.includes("shadow")) return "learning";
  return "other";
}

export function reasonSeverity(reason = "") {
  if (!reason || isSoftPaperReason(reason)) return 1;
  if ([
    "exchange_safety_blocked",
    "exchange_safety_symbol_blocked",
    "exchange_truth_freeze",
    "reconcile_required",
    "position_already_open",
    "max_open_positions_reached",
    "trade_size_invalid",
    "trade_size_below_minimum"
  ].includes(reason)) {
    return 5;
  }
  if ([
    "capital_governor_blocked",
    "regime_kill_switch_active",
    "self_heal_pause_entries",
    "execution_cost_budget_exceeded"
  ].includes(reason)) {
    return 4;
  }
  return 3;
}

export function normalizeDecisionReasons(reasons = []) {
  return [...new Set((reasons || []).filter(Boolean))]
    .sort((left, right) => {
      const severityDelta = reasonSeverity(right) - reasonSeverity(left);
      if (severityDelta !== 0) return severityDelta;
      return left.localeCompare(right);
    });
}
