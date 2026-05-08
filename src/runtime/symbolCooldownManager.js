const DEFAULT_DURATIONS = {
  repeated_losses: 6 * 60 * 60 * 1000,
  high_slippage: 3 * 60 * 60 * 1000,
  stale_data: 60 * 60 * 1000,
  reconcile_issue: 24 * 60 * 60 * 1000,
  manual_operator_block: 365 * 24 * 60 * 60 * 1000
};

export function buildSymbolCooldownState({ events = [], now = Date.now(), existing = {} } = {}) {
  const cooldowns = { ...existing };
  for (const event of events) {
    const symbol = `${event.symbol || ""}`.toUpperCase();
    if (!symbol) continue;
    const reason = event.reason || "manual_operator_block";
    const until = Number(now) + (DEFAULT_DURATIONS[reason] || 60 * 60 * 1000);
    cooldowns[symbol] = { symbol, reason, until, manual: reason === "manual_operator_block", audit: event.audit || null };
  }
  return {
    cooldowns,
    active: Object.values(cooldowns).filter((item) => Number(item.until) > Number(now)),
    isBlocked: (symbol) => Number(cooldowns[`${symbol}`.toUpperCase()]?.until || 0) > Number(now)
  };
}

export function summarizeSymbolCooldowns(state = {}) {
  const active = Array.isArray(state.active) ? state.active : [];
  return { count: active.length, symbols: active.map((item) => item.symbol), active };
}
