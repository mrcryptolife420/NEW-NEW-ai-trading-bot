const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : 0));

export function calculateLiquidityScore({ spreadBps = 25, depthUsd = 0, slippageBps = 50, bookStability = 0.5, fillReliability = 0.5, volatility = 0.05, trend = 0.5 } = {}) {
  const spreadScore = clamp(1 - spreadBps / 80);
  const depthScore = clamp(Math.log10(Math.max(1, depthUsd)) / 7);
  const slippageScore = clamp(1 - slippageBps / 120);
  const volatilityAdjustedLiquidity = clamp(depthScore * (1 - clamp(volatility / 0.2)));
  const score = clamp(spreadScore * 0.22 + depthScore * 0.2 + slippageScore * 0.2 + clamp(bookStability) * 0.13 + clamp(fillReliability) * 0.15 + volatilityAdjustedLiquidity * 0.06 + clamp(trend) * 0.04);
  return { score, spreadScore, depthScore, slippageScore, bookStability: clamp(bookStability), fillReliability: clamp(fillReliability), volatilityAdjustedLiquidity, action: score < 0.25 ? "block_entries" : score < 0.5 ? "reduce_size" : "allow" };
}
