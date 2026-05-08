export const POLICY_SEVERITIES = ["info", "warning", "critical"];
export const POLICY_DECISIONS = ["allow", "warn", "block", "requires_approval"];
export const POLICY_REASON_CODES = {
  live_main_requires_policy: "Live-main account requires explicit route permission.",
  neural_live_main_blocked: "Neural live autonomy is blocked on live-main.",
  exchange_degraded: "Exchange is degraded.",
  critical_sla_breach: "Critical reliability SLA breach.",
  audit_write_failed: "Audit writes failed.",
  state_write_failed: "State writes failed.",
  low_liquidity: "Liquidity score is below entry threshold.",
  manual_approval_required: "Operator approval is required.",
  new_strategy_paper_only: "New strategies are restricted to paper.",
  high_risk_symbol: "High-risk symbol is blocked or shadow-routed."
};

export function buildPolicyDecision({ decision = "allow", severity = "info", reasonCodes = [], requiresApproval = false, allowedScopes = ["paper"], operatorAction = "No action required.", metadata = {} } = {}) {
  return { decision, severity, reasonCodes, requiresApproval, allowedScopes, operatorAction, metadata };
}

export function evaluatePolicy(input = {}) {
  const ctx = { mode: "paper", accountProfile: "paper", scopes: [], exchangeHealth: {}, sla: {}, liquidity: {}, strategy: {}, ...input };
  const reasons = [];
  let decision = "allow";
  let severity = "info";
  let requiresApproval = false;
  const block = (code) => { if (!reasons.includes(code)) reasons.push(code); decision = "block"; severity = "critical"; };
  const warn = (code) => { if (!reasons.includes(code)) reasons.push(code); if (decision === "allow") decision = "warn"; if (severity === "info") severity = "warning"; };

  if (ctx.accountProfile === "live_main" && !ctx.allowLiveMain) block("live_main_requires_policy");
  if (ctx.accountProfile === "live_main" && ctx.neuralAutonomy === true) block("neural_live_main_blocked");
  if (ctx.exchangeHealth?.status === "degraded") block("exchange_degraded");
  if (ctx.sla?.severity === "critical") block("critical_sla_breach");
  if (ctx.failures?.auditWrite) block("audit_write_failed");
  if (ctx.failures?.stateWrite) block("state_write_failed");
  if (Number(ctx.liquidity?.score) < Number(ctx.liquidity?.minEntryScore ?? 0.25)) block("low_liquidity");
  if (ctx.strategy?.isNew) warn("new_strategy_paper_only");
  if (ctx.symbolRisk === "high") warn("high_risk_symbol");
  if (ctx.requiresApproval) { decision = decision === "block" ? "block" : "requires_approval"; severity = severity === "critical" ? severity : "warning"; requiresApproval = true; reasons.push("manual_approval_required"); }

  return buildPolicyDecision({
    decision,
    severity,
    reasonCodes: reasons,
    requiresApproval,
    allowedScopes: decision === "block" ? [] : ctx.scopes.length ? ctx.scopes : ["paper"],
    operatorAction: reasons.length ? reasons.map((code) => POLICY_REASON_CODES[code] || code).join(" ") : "No action required.",
    metadata: { policyVersion: "2026-05-08" }
  });
}
