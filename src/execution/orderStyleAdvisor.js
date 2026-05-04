import { buildLiquidityAwareStopLimitGap } from "./stopLimitGap.js";

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, num(value, min)));
}

function finite(value, digits = 4) {
  return Number(num(value).toFixed(digits));
}

function resolveSpread(input = {}) {
  return Math.max(0, num(input.spreadBps ?? input.marketSnapshot?.book?.spreadBps ?? input.marketSnapshot?.spreadBps, 0));
}

function resolveDepth(input = {}) {
  return clamp(input.depthConfidence ?? input.orderBook?.depthConfidence ?? input.marketSnapshot?.book?.depthConfidence, 0, 1);
}

function resolveDepthNotional(input = {}) {
  return Math.max(0, num(input.depthNotional ?? input.orderBook?.totalDepthNotional ?? input.marketSnapshot?.book?.totalDepthNotional, 0));
}

function resolveSlippageConfidence(input = {}) {
  return clamp(input.slippageConfidence ?? input.slippageConfidenceScore?.confidence ?? input.marketSnapshot?.execution?.slippageConfidence, 0, 1);
}

export function buildOrderStyleAdvice({
  spreadBps,
  depthConfidence,
  depthNotional,
  volatilityPct,
  slippageConfidence,
  slippageConfidenceScore,
  setupType = "unknown",
  urgency = "normal",
  positionNotional = 0,
  makerFeeBps = 10,
  takerFeeBps = 10,
  marketSnapshot = {},
  orderBook = {},
  mode = "entry",
  config = {}
} = {}) {
  const spread = resolveSpread({ spreadBps, marketSnapshot });
  const depth = resolveDepth({ depthConfidence, orderBook, marketSnapshot });
  const bookNotional = resolveDepthNotional({ depthNotional, orderBook, marketSnapshot });
  const slip = resolveSlippageConfidence({ slippageConfidence, slippageConfidenceScore, marketSnapshot });
  const vol = Math.max(0, num(volatilityPct ?? marketSnapshot.market?.realizedVolPct ?? marketSnapshot.realizedVolPct, 0));
  const notional = Math.max(0, num(positionNotional, 0));
  const urgent = ["urgent", "exit", "protective", "reconcile"].includes(`${urgency}`.toLowerCase()) || mode !== "entry";
  const warnings = [];
  const makerEdgeBps = num(takerFeeBps, 10) - num(makerFeeBps, 10);
  const depthCoverage = bookNotional > 0 && notional > 0 ? bookNotional / Math.max(notional, 1) : depth;

  if (bookNotional <= 0 && depth <= 0) warnings.push("missing_orderbook");
  if (spread >= num(config.orderStyleWideSpreadBps, 18)) warnings.push("wide_spread");
  if (depth < num(config.orderStyleMinDepthConfidence, 0.35) || depthCoverage < 1.5) warnings.push("liquidity_drain");
  if (slip < num(config.orderStyleMinSlippageConfidence, 0.35)) warnings.push("low_slippage_confidence");
  if (vol >= num(config.orderStyleHighVolatilityPct, 0.045)) warnings.push("high_volatility");

  const makerSuitable = !urgent &&
    spread <= num(config.orderStyleMakerMaxSpreadBps, 8) &&
    depth >= num(config.orderStyleMakerMinDepthConfidence, 0.55) &&
    slip >= num(config.orderStyleMakerMinSlippageConfidence, 0.55) &&
    depthCoverage >= 2;
  const takerSuitable = urgent &&
    spread <= num(config.orderStyleTakerMaxSpreadBps, 14) &&
    depth >= num(config.orderStyleTakerMinDepthConfidence, 0.45) &&
    slip >= num(config.orderStyleTakerMinSlippageConfidence, 0.45);
  const marketProhibited = spread >= num(config.orderStyleMarketProhibitedSpreadBps, 28) ||
    depth < num(config.orderStyleMarketMinDepthConfidence, 0.25) ||
    slip < num(config.orderStyleMarketMinSlippageConfidence, 0.25);
  const stopLimitGapHint = buildLiquidityAwareStopLimitGap({
    spreadBps: spread,
    atrPct: vol,
    depthConfidence: depth,
    slippageConfidence: slip,
    orderBook,
    marketSnapshot,
    baseBufferPct: config.liveStopLimitBufferPct ?? 0.002
  });

  let recommendedStyle = "limit_ioc";
  if (mode === "protective_rebuild") {
    recommendedStyle = "protective_rebuild_only";
  } else if (marketProhibited) {
    recommendedStyle = "market_prohibited";
  } else if (urgent) {
    recommendedStyle = takerSuitable ? "limit_ioc" : "stop_limit_wide";
  } else if (makerSuitable || makerEdgeBps > 0) {
    recommendedStyle = "maker_limit";
  }

  return {
    recommendedStyle,
    makerSuitable,
    takerSuitable,
    stopLimitGapHint,
    warnings,
    manualReviewRecommended: warnings.includes("missing_orderbook") || warnings.includes("liquidity_drain"),
    inputs: {
      spreadBps: finite(spread, 2),
      depthConfidence: finite(depth, 3),
      depthCoverage: finite(depthCoverage, 3),
      volatilityPct: finite(vol),
      slippageConfidence: finite(slip, 3),
      setupType,
      urgency,
      positionNotional: finite(notional, 2),
      makerFeeBps: finite(makerFeeBps, 2),
      takerFeeBps: finite(takerFeeBps, 2)
    },
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
