import { listProviderSloRegistry } from "./providerSloRegistry.js";

export function buildProviderBudgetPlan({ providers = listProviderSloRegistry(), health = {}, budgetPressure = 0 } = {}) {
  const pressure = Number(budgetPressure || 0);
  const items = providers.map((provider) => {
    const state = health[provider.id] || {};
    const cooldownUntil = state.cooldownUntil || null;
    const deferred = pressure > 0.75 && provider.budgetClass !== "core";
    const status = cooldownUntil ? "cooldown" : deferred ? "deferred" : state.status || "ready";
    return {
      ...provider,
      status,
      cooldownUntil,
      deferred,
      tradingImpact: provider.criticality === "critical" && status !== "ready" ? "blocks_entries" : status !== "ready" ? "degrades_context" : "none"
    };
  });
  return {
    status: items.some((item) => item.tradingImpact === "blocks_entries") ? "blocked" : items.some((item) => item.status !== "ready") ? "degraded" : "ready",
    budgetPressure: pressure,
    providers: items,
    nextRecoveryAt: items.map((item) => item.cooldownUntil).filter(Boolean).sort()[0] || null
  };
}
