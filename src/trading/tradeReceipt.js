export function buildTradeReceipt({ candidate = {}, quality = {}, risk = {}, execution = {}, portfolio = {}, now = new Date().toISOString() } = {}) {
  return {
    type: "trade_receipt",
    createdAt: now,
    symbol: candidate.symbol || "UNKNOWN",
    direction: candidate.direction || candidate.side || "unknown",
    strategy: candidate.strategy || candidate.strategyFamily || "unknown",
    entryReason: candidate.entryReason || candidate.reason || "not_provided",
    sizeReason: risk.sizeReason || "risk_policy_size",
    riskReason: risk.reason || quality.blockReason || "risk_checks_passed",
    executionReason: execution.reason || "execution_policy_selected",
    exitPlan: candidate.exitPlan || "protective_exit_required",
    stopReason: candidate.stopReason || "protect_capital_if_setup_invalidates",
    takeProfitReason: candidate.takeProfitReason || "realize_edge_when_target_reached",
    neuralAgreement: candidate.neuralAgreement ?? null,
    dataQuality: candidate.dataQuality ?? quality.components?.data ?? null,
    liquidityQuality: candidate.liquidityQuality ?? quality.components?.liquidity ?? null,
    costEstimate: execution.costEstimate ?? candidate.costEstimate ?? null,
    portfolioImpact: portfolio.impact || candidate.portfolioImpact || null,
    whatCouldGoWrong: candidate.whatCouldGoWrong || [quality.weakestComponent, risk.primaryRisk].filter(Boolean),
    whyAllowed: quality.entriesAllowed === false ? null : "quality_and_risk_checks_passed",
    whyNotBlocked: quality.entriesAllowed === false ? null : "no_active_hard_block",
    containsSecrets: false
  };
}
