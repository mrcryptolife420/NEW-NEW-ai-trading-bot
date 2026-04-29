import { clamp } from "../utils/math.js";
import { buildDerivativesContextProvider } from "./providers/derivativesContextProvider.js";
import { buildMacroContextProvider } from "./providers/macroContextProvider.js";
import { buildExecutionFeedbackProvider } from "./providers/executionFeedbackProvider.js";
import { buildCrossExchangeDivergenceProvider } from "./providers/crossExchangeDivergenceProvider.js";
import { buildStablecoinFlowProvider } from "./providers/stablecoinFlowProvider.js";
import { buildMicrostructurePriorProvider } from "./providers/microstructurePriorProvider.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export const EMPTY_MARKET_PROVIDER_SUMMARY = {
  status: "disabled",
  score: 0,
  providerCount: 0,
  enabledCount: 0,
  degradedCount: 0,
  unavailableCount: 0,
  providers: [],
  derivatives: {},
  macro: {},
  execution: {},
  crossExchange: {},
  stablecoinFlows: {},
  microstructure: {},
  note: "No market providers active."
};

function summarizeProvider(provider = {}) {
  return {
    id: provider.id || "provider",
    status: provider.status || "unavailable",
    enabled: provider.enabled !== false,
    score: num(provider.score || 0),
    note: provider.note || null
  };
}

export class MarketProviderHub {
  constructor({ config = {}, logger = console } = {}) {
    this.config = config;
    this.logger = logger;
  }

  buildSymbolSummary({
    symbol = null,
    runtime = {},
    journal = {},
    marketStructureSummary = {},
    globalMarketContextSummary = {},
    onChainLiteSummary = {},
    volatilitySummary = {},
    relativeStrengthSummary = {},
    sessionSummary = {},
    regimeSummary = {},
    strategySummary = {},
    marketSnapshot = {},
    divergenceSummary = {}
  } = {}) {
    try {
      const executionFeedback = buildExecutionFeedbackProvider({
        enabled: this.config.enableMarketProviderExecutionFeedback !== false,
        symbol,
        journal,
        sessionSummary,
        regimeSummary,
        strategySummary,
        marketSnapshot
      });
      const providers = [
        buildDerivativesContextProvider({
          enabled: this.config.enableMarketProviderDerivativesContext !== false,
          symbol,
          runtime,
          marketStructureSummary
        }),
        buildMacroContextProvider({
          enabled: this.config.enableMarketProviderMacroContext !== false,
          globalMarketContextSummary,
          onChainLiteSummary,
          volatilitySummary,
          relativeStrengthSummary
        }),
        executionFeedback,
        buildCrossExchangeDivergenceProvider({
          enabled: this.config.enableMarketProviderCrossExchangeDivergence !== false,
          symbol,
          runtime,
          divergenceSummary
        }),
        buildStablecoinFlowProvider({
          enabled: this.config.enableMarketProviderStablecoinFlows !== false,
          onChainLiteSummary,
          globalMarketContextSummary
        }),
        buildMicrostructurePriorProvider({
          enabled: this.config.enableMarketProviderMicrostructurePriors !== false,
          marketSnapshot,
          sessionSummary,
          executionFeedback: executionFeedback.data || {}
        })
      ];
      const enabledProviders = providers.filter((item) => item.enabled !== false);
      const degradedCount = enabledProviders.filter((item) => ["degraded", "warmup"].includes(item.status)).length;
      const unavailableCount = enabledProviders.filter((item) => item.status === "unavailable").length;
      const readyProviders = enabledProviders.filter((item) => item.status === "ready");
      const status = readyProviders.length
        ? degradedCount || unavailableCount ? "degraded" : "ready"
        : enabledProviders.length
          ? "warmup"
          : "disabled";
      const score = enabledProviders.length
        ? averageScore(enabledProviders.map((item) => item.score || 0))
        : 0;
      return {
        status,
        score: num(score),
        providerCount: providers.length,
        enabledCount: enabledProviders.length,
        degradedCount,
        unavailableCount,
        providers: providers.map((item) => summarizeProvider(item)),
        derivatives: providers.find((item) => item.id === "derivatives_context")?.data || {},
        macro: providers.find((item) => item.id === "macro_context")?.data || {},
        execution: providers.find((item) => item.id === "execution_feedback")?.data || {},
        crossExchange: providers.find((item) => item.id === "cross_exchange_divergence")?.data || {},
        stablecoinFlows: providers.find((item) => item.id === "stablecoin_flows")?.data || {},
        microstructure: providers.find((item) => item.id === "microstructure_priors")?.data || {},
        note: status === "ready"
          ? "Scoped market providers are healthy."
          : status === "degraded"
            ? "Some scoped market providers are degraded."
            : status === "warmup"
              ? "Scoped market providers are still warming up."
              : "Scoped market providers disabled."
      };
    } catch (error) {
      this.logger?.warn?.("Market provider hub failed", { symbol, error: error.message });
      return {
        ...EMPTY_MARKET_PROVIDER_SUMMARY,
        status: "degraded",
        note: `Market provider hub fallback: ${error.message}`
      };
    }
  }

  buildRuntimeHealth({ symbolSummaries = [] } = {}) {
    const summaries = arr(symbolSummaries).filter(Boolean);
    if (!summaries.length) {
      return { ...EMPTY_MARKET_PROVIDER_SUMMARY, status: "warmup", note: "No scoped provider samples yet." };
    }
    const providerBuckets = new Map();
    for (const summary of summaries) {
      for (const provider of arr(summary.providers || [])) {
        const bucket = providerBuckets.get(provider.id) || {
          id: provider.id,
          enabled: provider.enabled !== false,
          scoreSum: 0,
          count: 0,
          degradedCount: 0,
          unavailableCount: 0
        };
        bucket.count += 1;
        bucket.scoreSum += safeNumber(provider.score, 0);
        if (["degraded", "warmup"].includes(provider.status)) {
          bucket.degradedCount += 1;
        }
        if (provider.status === "unavailable") {
          bucket.unavailableCount += 1;
        }
        providerBuckets.set(provider.id, bucket);
      }
    }
    const providers = [...providerBuckets.values()].map((bucket) => ({
      id: bucket.id,
      enabled: bucket.enabled,
      score: num(bucket.count ? bucket.scoreSum / bucket.count : 0),
      degradedCount: bucket.degradedCount,
      unavailableCount: bucket.unavailableCount,
      status: bucket.unavailableCount >= bucket.count
        ? "unavailable"
        : bucket.degradedCount > 0
          ? "degraded"
          : "ready"
    }));
    const degradedCount = providers.filter((item) => item.status === "degraded").length;
    const unavailableCount = providers.filter((item) => item.status === "unavailable").length;
    const enabledCount = providers.filter((item) => item.enabled !== false).length;
    return {
      status: unavailableCount >= enabledCount && enabledCount > 0
        ? "degraded"
        : degradedCount > 0
          ? "degraded"
          : enabledCount
            ? "ready"
            : "disabled",
      score: num(averageScore(providers.map((item) => item.score || 0))),
      providerCount: providers.length,
      enabledCount,
      degradedCount,
      unavailableCount,
      providers,
      note: degradedCount || unavailableCount
        ? "At least one scoped market provider is degraded or unavailable."
        : "Scoped market providers healthy."
    };
  }
}

function averageScore(values = []) {
  const filtered = arr(values).filter((value) => Number.isFinite(value));
  return filtered.length ? clamp(filtered.reduce((total, value) => total + value, 0) / filtered.length, 0, 1) : 0;
}
