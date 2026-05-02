import { clamp } from "../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function firstFinite(values = [], fallback = 0) {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function pctToBps(value) {
  return safeNumber(value) * 10000;
}

export function buildNetEdgeGate({
  candidate = {},
  config = {},
  botMode = config.botMode || "paper",
  executionFeedback = null
} = {}) {
  const expectedNetEdge = candidate.expectedNetEdge || {};
  const score = candidate.score || {};
  const execution = candidate.execution || candidate.executionPlan || {};
  const executionEstimate = candidate.executionEstimate || candidate.entryEstimate || execution.entryEstimate || {};
  const grossEdgeBps = firstFinite([
    expectedNetEdge.grossEdgeBps,
    expectedNetEdge.edgeBps,
    pctToBps(expectedNetEdge.grossEdgePct),
    pctToBps(candidate.expectedEdgePct),
    pctToBps(candidate.thresholdEdge),
    pctToBps(safeNumber(score.probability) - safeNumber(candidate.threshold ?? candidate.effectiveThreshold))
  ], 0);
  const feeBps = firstFinite([
    expectedNetEdge.feeBps,
    candidate.expectedRoundTripFeeBps,
    candidate.executionCost?.feeBps,
    config.expectedRoundTripFeeBps,
    safeNumber(config.paperFeeBps, 10) * 2
  ], 20);
  const slippageBps = firstFinite([
    expectedNetEdge.slippageBps,
    candidate.executionCost?.slippageBps,
    executionEstimate.expectedSlippageBps,
    executionEstimate.expectedImpactBps,
    config.paperSlippageBps
  ], 0);
  const executionPainScore = clamp(firstFinite([
    executionFeedback?.executionPainScore,
    candidate.executionQuality?.executionPainScore,
    candidate.executionFeedback?.executionPainScore,
    candidate.executionPainScore
  ], 0), 0, 1);
  const executionPainBps = firstFinite([
    expectedNetEdge.executionPainBps,
    candidate.executionCost?.executionPainBps
  ], executionPainScore * safeNumber(config.netEdgeExecutionPainBps, 12));
  const opportunityCostBps = firstFinite([
    expectedNetEdge.opportunityCostBps,
    candidate.opportunityCostBps
  ], 0);
  const safetyBufferBps = safeNumber(config.netEdgeSafetyBufferBps, botMode === "live" ? 6 : 3);
  const totalDragBps = feeBps + slippageBps + executionPainBps + opportunityCostBps + safetyBufferBps;
  const netEdgeBps = grossEdgeBps - totalDragBps;
  const minNetEdgeBps = safeNumber(config.minNetEdgeBps, botMode === "live" ? 4 : 0);
  const enabled = config.enableNetEdgeGate === true;
  const wouldBlock = netEdgeBps < minNetEdgeBps;
  const appliesToMode = botMode !== "live" || config.netEdgeGateLiveBlockOnly === true;
  const block = enabled && appliesToMode && wouldBlock;
  const status = block ? "block" : wouldBlock ? "warn" : "pass";
  return {
    enabled,
    status,
    block,
    reason: wouldBlock ? "net_edge_after_costs_too_low" : null,
    botMode,
    grossEdgeBps: num(grossEdgeBps, 2),
    feeBps: num(feeBps, 2),
    slippageBps: num(slippageBps, 2),
    executionPainBps: num(executionPainBps, 2),
    opportunityCostBps: num(opportunityCostBps, 2),
    safetyBufferBps: num(safetyBufferBps, 2),
    totalDragBps: num(totalDragBps, 2),
    netEdgeBps: num(netEdgeBps, 2),
    minNetEdgeBps: num(minNetEdgeBps, 2),
    drivers: [
      { id: "gross_edge", bps: num(grossEdgeBps, 2), direction: "positive" },
      { id: "fees", bps: num(feeBps, 2), direction: "negative" },
      { id: "slippage", bps: num(slippageBps, 2), direction: "negative" },
      { id: "execution_pain", bps: num(executionPainBps, 2), direction: "negative" },
      { id: "opportunity_cost", bps: num(opportunityCostBps, 2), direction: "negative" }
    ]
  };
}
