function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, num(value, min)));
}

function resolveSpreadBps(input = {}) {
  return num(input.spreadBps ?? input.marketSnapshot?.spreadBps ?? input.marketSnapshot?.book?.spreadBps, 0);
}

function resolveAtrPct(input = {}) {
  return num(input.atrPct ?? input.volatility?.atrPct ?? input.marketSnapshot?.atrPct ?? input.marketSnapshot?.features?.atrPct, 0);
}

function resolveDepthConfidence(input = {}) {
  return clamp(input.depthConfidence ?? input.orderBook?.depthConfidence ?? input.marketSnapshot?.book?.depthConfidence ?? 1, 0, 1);
}

function resolveSlippageConfidence(input = {}) {
  const raw = input.slippageConfidence ??
    input.slippageConfidenceScore?.confidence ??
    input.executionConfidence ??
    input.marketSnapshot?.execution?.slippageConfidence ??
    1;
  return clamp(raw, 0, 1);
}

export function buildLiquidityAwareStopLimitGap({
  baseBufferPct = 0.002,
  spreadBps,
  atrPct,
  depthConfidence,
  slippageConfidence,
  slippageConfidenceScore,
  orderBook = {},
  marketSnapshot = {},
  maxBufferPct = 0.012
} = {}) {
  const base = clamp(baseBufferPct, 0.0001, maxBufferPct);
  const spread = Math.max(0, resolveSpreadBps({ spreadBps, marketSnapshot }));
  const atr = Math.max(0, resolveAtrPct({ atrPct, marketSnapshot }));
  const depth = resolveDepthConfidence({ depthConfidence, orderBook, marketSnapshot });
  const slippage = resolveSlippageConfidence({ slippageConfidence, slippageConfidenceScore, marketSnapshot });
  const reasons = [];

  const spreadComponent = spread > 0 ? clamp((spread / 10_000) * 1.35, 0, maxBufferPct) : 0;
  const atrComponent = atr > 0 ? clamp(atr * 0.28, 0, maxBufferPct) : 0;
  const depthPenalty = depth < 0.35 ? 0.0035 : depth < 0.6 ? 0.0015 : 0;
  const slippagePenalty = slippage < 0.35 ? 0.003 : slippage < 0.6 ? 0.0012 : 0;
  let bufferPct = Math.max(base, spreadComponent, atrComponent) + depthPenalty + slippagePenalty;
  bufferPct = clamp(bufferPct, base, maxBufferPct);

  if (spreadComponent > base) reasons.push("wide_spread_gap");
  if (atrComponent > base) reasons.push("high_atr_gap");
  if (depthPenalty > 0) reasons.push("thin_orderbook_gap");
  if (slippagePenalty > 0) reasons.push("low_slippage_confidence_gap");
  if (!reasons.length) reasons.push("base_gap");

  return {
    bufferPct: Number(bufferPct.toFixed(6)),
    baseBufferPct: Number(base.toFixed(6)),
    spreadBps: Number(spread.toFixed(3)),
    atrPct: Number(atr.toFixed(6)),
    depthConfidence: Number(depth.toFixed(4)),
    slippageConfidence: Number(slippage.toFixed(4)),
    maxBufferPct: Number(maxBufferPct.toFixed(6)),
    reasons,
    liquidityProfile: bufferPct > base * 2.2 || depth < 0.35 || slippage < 0.35
      ? "illiquid_or_fragile"
      : bufferPct > base * 1.25
        ? "watch"
        : "liquid",
    diagnosticOnly: true
  };
}
