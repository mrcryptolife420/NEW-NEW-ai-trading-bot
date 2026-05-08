export const NEVER_TRADE_RULES = [
  ["stale_order_book", "Niet traden bij stale order book."],
  ["exchange_mismatch", "Niet traden bij exchange mismatch."],
  ["spread_too_high", "Niet traden bij hoge spread."],
  ["slippage_too_high", "Niet traden bij te hoge slippage."],
  ["unresolved_execution_intent", "Niet traden bij unresolved execution intent."],
  ["clock_sync_bad", "Niet traden bij slechte clock sync."],
  ["critical_alert_open", "Niet traden bij open critical alert."],
  ["audit_write_failed", "Niet traden als audit niet geschreven kan worden."],
  ["state_write_failed", "Niet traden als state niet geschreven kan worden."],
  ["manual_review_required_live_position", "Niet traden als open live positie manual review vereist."],
  ["exchange_protection_off", "Niet traden als exchange protection uit is."],
  ["live_ack_missing", "Niet traden als live acknowledgement ontbreekt."],
  ["withdrawal_permission_active", "Niet traden als withdrawal permission onverwacht actief is."],
  ["data_quality_too_low", "Niet traden als data quality onder minimum is."],
  ["market_worth_trading_score_extremely_low", "Niet traden als market worth trading score te laag is."],
  ["daily_drawdown_limit_hit", "Niet traden als daily drawdown limiet geraakt is."]
].map(([id, description]) => ({ id, severity: "critical", hardBlock: true, description }));

export function evaluateNeverTradeWhenRules(context = {}) {
  const active = NEVER_TRADE_RULES.filter((rule) => Boolean(context[rule.id] || context.activeRules?.includes?.(rule.id)));
  return {
    status: active.length ? "blocked" : "clear",
    entriesAllowed: active.length === 0,
    activeRules: active,
    primaryRule: active[0]?.id || null,
    overridable: false
  };
}
