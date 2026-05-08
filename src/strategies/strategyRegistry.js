import { normalizeStrategyPlugin, validateStrategyPlugin } from "./pluginInterface.js";

export function buildStrategyRegistry({ plugins = [], performance = {} } = {}) {
  const strategies = plugins.map((plugin) => {
    const normalized = normalizeStrategyPlugin(plugin);
    return {
      ...normalized,
      performance: performance[normalized.id] || { trades: 0, winRate: 0, netExpectancy: 0 },
      risk: { liveAllowed: normalized.status === "live_allowed" && normalized.validation.valid }
    };
  });
  return {
    strategies,
    list: () => strategies,
    report: (id) => strategies.find((strategy) => strategy.id === id) || null
  };
}

export function applyStrategyStatus(plugin = {}, status = "disabled") {
  const next = { ...plugin, status };
  return { plugin: next, validation: validateStrategyPlugin(next) };
}
