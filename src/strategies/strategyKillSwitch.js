const VALID_SCOPES = ["strategy", "family", "symbol", "regime", "session", "neural_model", "execution_style", "account_profile", "broker_route"];

export function buildStrategyKillSwitchRegistry(state = {}) {
  const switches = Array.isArray(state.switches) ? state.switches : [];
  const active = switches.filter((item) => item.status === "active");
  return {
    status: active.length ? "active_blocks" : "clear",
    active,
    switches,
    entriesAllowedFor(scope = {}) {
      return !active.some((item) => item.scopeType === scope.scopeType && item.scopeValue === scope.scopeValue);
    }
  };
}

export function createStrategyKillSwitch({ scopeType, scopeValue, reason, actor = "operator", now = new Date().toISOString() } = {}) {
  if (!VALID_SCOPES.includes(scopeType)) throw new Error(`Invalid kill-switch scope: ${scopeType}`);
  if (!scopeValue) throw new Error("Kill-switch scopeValue is required");
  if (!reason) throw new Error("Kill-switch reason is required");
  return { id: `${scopeType}:${scopeValue}`, scopeType, scopeValue, reason, actor, status: "active", createdAt: now, audit: [{ at: now, action: "kill", actor, reason }] };
}

export function resumeStrategyKillSwitch(item = {}, { reason, actor = "operator", now = new Date().toISOString() } = {}) {
  if (!reason) throw new Error("Resume review reason is required");
  return { ...item, status: "resumed", resumedAt: now, audit: [...(item.audit || []), { at: now, action: "resume", actor, reason }] };
}
