function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildExecutionCostBreakdown({ grossEdgePct = 0, makerFeeBps = 10, takerFeeBps = 10, spreadBps = 0, slippageBps = 0, partialFillBps = 0, retryBps = 0, stopSlippageBps = 0, protectionRebuildBps = 0, roundingBps = 0, latencyBps = 0, liquidityImpactBps = 0, makerMissBps = 0 } = {}) {
  const totalCostBps = [makerFeeBps, takerFeeBps, spreadBps, slippageBps, partialFillBps, retryBps, stopSlippageBps, protectionRebuildBps, roundingBps, latencyBps, liquidityImpactBps, makerMissBps]
    .reduce((sum, value) => sum + Math.max(0, num(value, 0)), 0);
  const gross = num(grossEdgePct, 0);
  const net = gross - totalCostBps / 10000;
  return {
    grossExpectancyPct: gross,
    totalCostBps,
    netExpectancyPct: net,
    minimumEdgeRequiredPct: totalCostBps / 10000,
    tradeAllowed: net > 0,
    blockedReason: net > 0 ? null : "negative_net_expectancy_after_costs",
    breakdown: { makerFeeBps, takerFeeBps, spreadBps, slippageBps, partialFillBps, retryBps, stopSlippageBps, protectionRebuildBps, roundingBps, latencyBps, liquidityImpactBps, makerMissBps }
  };
}
