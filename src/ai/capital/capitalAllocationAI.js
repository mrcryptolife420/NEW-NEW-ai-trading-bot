import { clamp01 } from "../../utils/score.js";

function budgetFor(item = {}, defaultBudget = 1) {
  const efficiency = clamp01(item.efficiency ?? 0.5, 0.5);
  const drawdown = clamp01(item.drawdown ?? 0, 0);
  const slippage = clamp01(item.slippage ?? 0, 0);
  const correlation = clamp01(item.correlationExposure ?? 0, 0);
  const pressure = Math.max(drawdown, slippage, correlation);
  const multiplier = pressure >= 0.75 ? 0.25 : pressure >= 0.5 ? 0.5 : efficiency >= 0.75 ? 1 : 0.75;
  return {
    budget: Math.max(0, Number(item.currentBudget ?? defaultBudget) * multiplier),
    multiplier,
    efficiency,
    pressure,
    proposalRequiredForIncrease: multiplier > 1,
    reason: pressure >= 0.5 ? "defensive_budget_reduction" : "within_budget"
  };
}

export function buildCapitalAllocationPlan(context = {}) {
  const dataQuality = clamp01(context.dataQuality ?? 1, 1);
  const blocked = dataQuality < 0.6;
  const families = Object.fromEntries(Object.entries(context.strategyFamilies || {}).map(([key, value]) => [key, budgetFor(value)]));
  const symbols = Object.fromEntries(Object.entries(context.symbols || {}).map(([key, value]) => [key, budgetFor(value)]));
  return {
    status: blocked ? "blocked" : "ready",
    blockedReason: blocked ? "data_quality_too_low_for_capital_allocation" : null,
    budgets: { strategyFamilies: families, symbols },
    canPlaceOrders: false,
    canLowerRiskAutomatically: true,
    canRaiseLiveBudgetWithoutApproval: false,
    canRaiseHardCaps: false,
    auditRequired: true
  };
}
