import { clamp } from "../../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

export function buildStablecoinFlowProvider({
  enabled = true,
  onChainLiteSummary = {},
  globalMarketContextSummary = {}
} = {}) {
  if (!enabled) {
    return {
      id: "stablecoin_flows",
      status: "disabled",
      enabled: false,
      score: 0,
      note: "Stablecoin-flow provider disabled.",
      data: {}
    };
  }

  const liquidityScore = safeNumber(onChainLiteSummary.liquidityScore, Number.NaN);
  const stressScore = safeNumber(onChainLiteSummary.stressScore, Number.NaN);
  const stablecoinDominance = safeNumber(globalMarketContextSummary.stablecoinDominance, Number.NaN);
  const availableSignals = [liquidityScore, stressScore, stablecoinDominance].filter((value) => Number.isFinite(value)).length;
  const flowScore = clamp(
    safeNumber(liquidityScore, 0.5) * 0.65 -
      safeNumber(stressScore, 0) * 0.35 -
      Math.max(0, safeNumber(stablecoinDominance, 0) - 7) * 0.03,
    -1,
    1
  );
  const status = availableSignals >= 2
    ? "ready"
    : availableSignals >= 1
      ? "degraded"
      : "unavailable";
  return {
    id: "stablecoin_flows",
    status,
    enabled: true,
    score: num(clamp(0.5 + flowScore * 0.45, 0, 1)),
    note: status === "ready"
      ? "Stablecoin flow regime inferred from on-chain-lite liquidity and dominance context."
      : status === "degraded"
        ? "Stablecoin flow signal partially available."
        : "Stablecoin flow signal unavailable.",
    data: {
      score: num(flowScore),
      regime: flowScore >= 0.12 ? "inflow_support" : flowScore <= -0.12 ? "outflow_stress" : "neutral",
      stablecoinDominance: Number.isFinite(stablecoinDominance) ? num(stablecoinDominance, 2) : null
    }
  };
}
