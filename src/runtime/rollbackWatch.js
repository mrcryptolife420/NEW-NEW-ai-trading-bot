function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function buildRollbackWatch({ liveStats = {}, canaryStats = {}, failureStats = {}, driftSummary = {} } = {}) {
  const reasons = [];
  const affectedScopes = [];
  const liveDrawdown = finite(liveStats.drawdownPct ?? liveStats.maxDrawdownPct, 0);
  const canaryDrawdown = finite(canaryStats.drawdownPct ?? canaryStats.maxDrawdownPct, 0);
  const failureSeverity = finite(failureStats.maxSeverityScore ?? failureStats.severityScore, 0);
  const driftScore = finite(driftSummary.score ?? driftSummary.driftScore, 0);

  if (liveDrawdown <= -0.08 || canaryDrawdown <= -0.06) reasons.push("drawdown_breach");
  if (failureSeverity >= 0.75) reasons.push("severe_failure_cluster");
  if (driftScore >= 0.7 || driftSummary.status === "drifted") reasons.push("model_or_market_drift");
  if (liveStats.scope) affectedScopes.push(liveStats.scope);
  if (canaryStats.scope) affectedScopes.push(canaryStats.scope);
  if (Array.isArray(failureStats.scopes)) affectedScopes.push(...failureStats.scopes);

  const status = reasons.includes("drawdown_breach") || reasons.includes("severe_failure_cluster")
    ? "rollback_recommended"
    : reasons.length
      ? "watch"
      : "normal";
  return {
    status,
    reasons,
    affectedScopes: [...new Set(affectedScopes)].filter(Boolean),
    recommendedAction: status === "rollback_recommended"
      ? "Operator review recommended; prepare rollback or disable affected scope. No automatic rollback executed."
      : status === "watch"
        ? "Watch affected scopes and collect replay/failure evidence."
        : "No rollback action recommended.",
    automaticRollbackExecuted: false
  };
}
