import { clamp } from "../../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function normalizeRelativeStrength(relativeStrengthSummary = {}) {
  return {
    vsBtc: safeNumber(
      relativeStrengthSummary?.vsBtc ??
      relativeStrengthSummary?.btcRelativeStrength ??
      relativeStrengthSummary?.relativeToBtc,
      0
    ),
    vsEth: safeNumber(
      relativeStrengthSummary?.vsEth ??
      relativeStrengthSummary?.ethRelativeStrength ??
      relativeStrengthSummary?.relativeToEth,
      0
    ),
    sector: safeNumber(
      relativeStrengthSummary?.sectorRelativeStrength ??
      relativeStrengthSummary?.sectorScore ??
      relativeStrengthSummary?.basketStrength,
      0
    )
  };
}

export function buildMacroContextProvider({
  enabled = true,
  globalMarketContextSummary = {},
  onChainLiteSummary = {},
  volatilitySummary = {},
  relativeStrengthSummary = {}
} = {}) {
  if (!enabled) {
    return {
      id: "macro_context",
      status: "disabled",
      enabled: false,
      score: 0,
      note: "Macro context provider disabled.",
      data: {}
    };
  }

  const relativeStrength = normalizeRelativeStrength(relativeStrengthSummary);
  const stablecoinFlowScore = clamp(
    safeNumber(onChainLiteSummary?.liquidityScore, 0.5) * 0.62 -
      safeNumber(onChainLiteSummary?.stressScore, 0) * 0.38,
    -1,
    1
  );
  const breadthScore = clamp(
    safeNumber(onChainLiteSummary?.marketBreadth, 0.5) * 0.7 +
      (safeNumber(globalMarketContextSummary?.marketCapChangePercent24h, 0) / 6) * 0.3,
    -1,
    1
  );
  const volatilityPercentile = clamp(
    safeNumber(
      volatilitySummary?.marketVolPercentile ??
      volatilitySummary?.realizedVolPercentile ??
      (volatilitySummary?.regime === "compression" ? 0.22 : volatilitySummary?.regime === "expansion" ? 0.78 : 0.5),
      0.5
    ),
    0,
    1
  );
  const availableSignals = [
    globalMarketContextSummary?.riskRegime,
    onChainLiteSummary?.marketBreadth,
    volatilitySummary?.regime
  ].filter(Boolean).length;
  const status = availableSignals >= 2
    ? "ready"
    : availableSignals >= 1
      ? "degraded"
      : "unavailable";
  const score = clamp(
    0.36 +
      Math.max(0, stablecoinFlowScore) * 0.12 +
      Math.max(0, breadthScore) * 0.14 +
      Math.max(0, relativeStrength.vsBtc) * 0.08 +
      Math.max(0, relativeStrength.sector) * 0.08 +
      Math.max(0, 1 - Math.abs(volatilityPercentile - 0.5) * 1.5) * 0.12,
    0,
    1
  );

  return {
    id: "macro_context",
    status,
    enabled: true,
    score: num(score),
    note: status === "ready"
      ? "Macro context built from global, on-chain-lite and volatility summaries."
      : status === "degraded"
        ? "Macro context partially available; using summary-level fallbacks."
        : "Macro context unavailable.",
    data: {
      stablecoinFlow: {
        score: num(stablecoinFlowScore),
        regime: stablecoinFlowScore >= 0.12 ? "inflow_support" : stablecoinFlowScore <= -0.12 ? "outflow_stress" : "neutral"
      },
      relativePerformance: {
        vsBtc: num(relativeStrength.vsBtc),
        vsEth: num(relativeStrength.vsEth),
        sector: num(relativeStrength.sector)
      },
      breadth: {
        score: num(breadthScore),
        regime: breadthScore >= 0.14 ? "broad_strength" : breadthScore <= -0.14 ? "broad_weakness" : "mixed"
      },
      volatility: {
        percentile: num(volatilityPercentile),
        regime: volatilitySummary?.regime || "unknown"
      },
      dominance: {
        btc: globalMarketContextSummary?.btcDominance == null ? null : num(globalMarketContextSummary.btcDominance, 2),
        stablecoins: globalMarketContextSummary?.stablecoinDominance == null ? null : num(globalMarketContextSummary.stablecoinDominance, 2),
        riskRegime: globalMarketContextSummary?.riskRegime || "unknown"
      }
    }
  };
}
