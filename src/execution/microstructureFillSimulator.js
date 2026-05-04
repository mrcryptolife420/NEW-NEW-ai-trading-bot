function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function text(value, fallback = "market") {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : fallback;
}

export function simulateMicrostructureFill({
  orderType = "market",
  quantity = 0,
  notional = 0,
  spreadBps = 0,
  bookDepthUsd = 0,
  candleVolumeUsd = 0,
  volatilityPct = 0,
  latencyMs = 0,
  urgency = 0.5,
  makerQueuePosition = 0.5
} = {}) {
  const resolvedOrderType = text(orderType);
  const isMaker = ["maker", "maker_limit", "limit_maker", "post_only", "pegged_limit_maker"].includes(resolvedOrderType);
  const isLimitIoc = ["limit_ioc", "ioc"].includes(resolvedOrderType);
  const resolvedNotional = Math.max(0, finite(notional, 0));
  const resolvedSpread = Math.max(0, finite(spreadBps, 0));
  const resolvedDepth = Math.max(0, finite(bookDepthUsd, 0));
  const resolvedVolume = Math.max(0, finite(candleVolumeUsd, 0));
  const resolvedVolatility = Math.max(0, finite(volatilityPct, 0));
  const resolvedLatency = Math.max(0, finite(latencyMs, 0));
  const resolvedUrgency = clamp(urgency, 0, 1);
  const queuePosition = clamp(makerQueuePosition, 0, 1);
  const depthCoverage = resolvedNotional > 0 ? clamp(resolvedDepth / Math.max(resolvedNotional, 1), 0, 3) : 1;
  const volumeCoverage = resolvedNotional > 0 ? clamp(resolvedVolume / Math.max(resolvedNotional, 1), 0, 6) : 1;
  const liquidityScore = clamp(depthCoverage / 1.6 * 0.62 + volumeCoverage / 3.5 * 0.38, 0, 1);
  const spreadPenalty = clamp(resolvedSpread / 80, 0, 1);
  const volatilityPenalty = clamp(resolvedVolatility / 0.08, 0, 1);
  const latencyPenalty = clamp(resolvedLatency / 2500, 0, 1);
  const queueRisk = isMaker
    ? clamp(queuePosition * 0.35 + spreadPenalty * 0.18 + volatilityPenalty * 0.28 + latencyPenalty * 0.19, 0, 1)
    : clamp((1 - liquidityScore) * 0.35 + volatilityPenalty * 0.2, 0, 1);
  const timeoutRisk = isMaker
    ? clamp(queueRisk * 0.72 + (1 - liquidityScore) * 0.22 + (1 - resolvedUrgency) * 0.06, 0, 1)
    : isLimitIoc
      ? clamp((1 - liquidityScore) * 0.42 + spreadPenalty * 0.2 + volatilityPenalty * 0.16, 0, 0.9)
      : clamp((1 - liquidityScore) * 0.12 + volatilityPenalty * 0.08, 0, 0.4);
  const fillProbability = isMaker
    ? clamp(0.88 - timeoutRisk * 0.72 + liquidityScore * 0.18 - spreadPenalty * 0.1, 0.05, 0.98)
    : isLimitIoc
      ? clamp(0.92 - timeoutRisk * 0.45 + liquidityScore * 0.08, 0.1, 0.99)
      : clamp(0.98 - (1 - liquidityScore) * 0.08 - volatilityPenalty * 0.04, 0.72, 1);
  const partialFillRatio = clamp(
    Math.min(1, Math.max(0.05, depthCoverage * 0.72 + volumeCoverage * 0.12)) *
      (isMaker ? fillProbability : 1 - timeoutRisk * 0.18),
    0,
    1
  );
  const expectedSlippageBps = Math.max(
    0,
    resolvedSpread * (isMaker ? 0.12 : isLimitIoc ? 0.32 : 0.55) +
      (1 - liquidityScore) * (isMaker ? 4 : 11) +
      volatilityPenalty * (isMaker ? 3 : 9) +
      latencyPenalty * (isMaker ? 2 : 5) +
      resolvedUrgency * (isMaker ? 0.8 : 3.5)
  );
  const warnings = [];
  if (resolvedNotional <= 0 && finite(quantity, 0) <= 0) warnings.push("missing_order_size");
  if (resolvedDepth <= 0) warnings.push("missing_book_depth");
  if (resolvedVolume <= 0) warnings.push("missing_candle_volume");
  if (resolvedSpread >= 35) warnings.push("wide_spread");
  if (resolvedVolatility >= 0.05) warnings.push("high_volatility");
  if (liquidityScore < 0.35) warnings.push("thin_liquidity");
  if (timeoutRisk >= 0.55) warnings.push("timeout_risk_high");
  if (partialFillRatio < 0.75) warnings.push("partial_fill_likely");

  return {
    orderType: resolvedOrderType,
    fillProbability,
    expectedSlippageBps,
    partialFillRatio,
    timeoutRisk,
    queueRisk,
    liquidityScore,
    warnings: [...new Set(warnings)],
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function buildMicrostructureFillSimulation(input = {}) {
  return simulateMicrostructureFill(input);
}
