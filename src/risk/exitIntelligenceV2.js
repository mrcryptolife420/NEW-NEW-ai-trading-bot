import { clamp } from "../utils/math.js";
import { minutesBetween } from "../utils/time.js";

function num(value, digits = 4) {
  return Number(Number.isFinite(value) ? value.toFixed(digits) : (0).toFixed(digits));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function priceFrom(...values) {
  return values.find((value) => Number.isFinite(value) && value > 0) || 0;
}

function scoreFromLoss(lossPct, soft = 0.0015, hard = 0.012) {
  if (!Number.isFinite(lossPct) || lossPct <= soft) {
    return 0;
  }
  return clamp((lossPct - soft) / Math.max(0.0001, hard - soft), 0, 1);
}

function normalizeBipolar(value, positiveRisk = false) {
  const normalized = clamp(finite(value, 0), -1, 1);
  return positiveRisk ? clamp(normalized, 0, 1) : clamp(-normalized, 0, 1);
}

function addReason(reasons, id, score, detail = null) {
  if (score >= 0.18) {
    reasons.push({ id, score: num(score, 4), detail });
  }
}

function weightedAverage(items) {
  let totalWeight = 0;
  let total = 0;
  for (const item of items) {
    const score = clamp(finite(item.score, 0), 0, 1);
    const weight = Math.max(0, finite(item.weight, 0));
    total += score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? clamp(total / totalWeight, 0, 1) : 0;
}

function resolveMarketPrice(marketSnapshot = {}, currentPrice = 0) {
  return priceFrom(
    currentPrice,
    marketSnapshot.book?.mid,
    marketSnapshot.book?.bid,
    marketSnapshot.book?.ask,
    marketSnapshot.market?.close,
    marketSnapshot.market?.lastPrice
  );
}

function resolveVwap(market = {}) {
  return priceFrom(
    market.vwap,
    market.sessionVwap,
    market.anchoredVwap,
    market.vwapMid,
    market.volumeWeightedAveragePrice
  );
}

function resolveSupport(market = {}, currentPrice = 0, entryPrice = 0) {
  return priceFrom(
    market.structureLow,
    market.swingLow,
    market.recentSwingLow,
    market.donchianLower,
    market.valueAreaLow,
    market.vwapBandLower,
    entryPrice * 0.99,
    currentPrice * 0.99
  );
}

function resolveResistance(market = {}, currentPrice = 0, entryPrice = 0) {
  return priceFrom(
    market.structureHigh,
    market.swingHigh,
    market.recentSwingHigh,
    market.donchianUpper,
    market.valueAreaHigh,
    market.vwapBandUpper,
    entryPrice * 1.02,
    currentPrice * 1.012
  );
}

function resolveAtrStop({ currentPrice, entryPrice, market = {}, config = {} }) {
  const atrPct = priceFrom(
    market.atrPct,
    market.realizedVolPct ? market.realizedVolPct * 0.42 : 0,
    config.stopLossPct,
    0.018
  );
  const atrDistance = currentPrice * clamp(atrPct * 1.15, 0.004, 0.06);
  return Math.max(0, Math.min(entryPrice * (1 - clamp(config.stopLossPct || 0.018, 0.004, 0.06)), currentPrice - atrDistance));
}

function resolveTightenedStop({ position = {}, currentPrice, updatedHigh, suggestedStops = {} }) {
  const currentStop = finite(position.stopLossPrice, 0);
  const entryPrice = finite(position.entryPrice, 0);
  const protectiveFloor = entryPrice > 0 && currentPrice > entryPrice * 1.004
    ? entryPrice * 1.001
    : 0;
  const trailingCandidate = updatedHigh > 0 && currentPrice > entryPrice
    ? updatedHigh * (1 - clamp(position.trailingStopPct || 0.012, 0.004, 0.04))
    : 0;
  const candidates = [
    currentStop,
    protectiveFloor,
    trailingCandidate,
    suggestedStops.vwapInvalidationPrice,
    suggestedStops.structureStopPrice,
    suggestedStops.atrStopPrice
  ].filter((value) => Number.isFinite(value) && value > 0 && value < currentPrice);
  if (!candidates.length) {
    return currentStop || null;
  }
  return Math.max(...candidates);
}

export function buildExitIntelligenceV2({
  position = {},
  currentPrice = 0,
  marketSnapshot = {},
  marketStructureSummary = {},
  newsSummary = {},
  announcementSummary = {},
  calendarSummary = {},
  exitIntelligenceSummary = {},
  config = {},
  nowIso = new Date().toISOString()
} = {}) {
  const market = marketSnapshot.market || {};
  const book = marketSnapshot.book || {};
  const price = resolveMarketPrice(marketSnapshot, currentPrice);
  const entryPrice = priceFrom(position.entryPrice, position.averageEntryPrice, price);
  const updatedHigh = Math.max(finite(position.highestPrice, entryPrice), price);
  const updatedLow = Math.min(finite(position.lowestPrice, entryPrice), price);
  const pnlPct = entryPrice > 0 ? (price - entryPrice) / entryPrice : 0;
  const drawdownFromHighPct = updatedHigh > 0 ? (updatedHigh - price) / updatedHigh : 0;
  const heldMinutes = minutesBetween(position.entryAt, nowIso);
  const maxHoldMinutes = Math.max(1, finite(position.maxHoldMinutes, finite(config.maxHoldMinutes, 360)));
  const vwap = resolveVwap(market);
  const support = resolveSupport(market, price, entryPrice);
  const resistance = resolveResistance(market, price, entryPrice);

  const bearishStructure =
    finite(market.bearishBosActive, 0) > 0 ||
    finite(market.structureBreakdownScore, 0) > 0.45 ||
    finite(marketStructureSummary.signalScore, 0) < -0.15 ||
    finite(marketStructureSummary.riskScore, 0) > 0.72;
  const supportLossPct = support > 0 ? (support - price) / support : 0;
  const structureInvalidationScore = clamp(Math.max(
    bearishStructure ? 0.58 + clamp(finite(marketStructureSummary.riskScore, 0) * 0.28, 0, 0.28) : 0,
    scoreFromLoss(supportLossPct, 0.0005, 0.011),
    finite(market.failedBreakoutScore, 0),
    ["failed_breakout", "breakout_failure"].includes(position.marketConditionAtEntry || "") ? 0.62 : 0
  ), 0, 1);

  const vwapLossPct = vwap > 0 ? (vwap - price) / vwap : finite(market.vwapGapPct, 0) < 0 ? Math.abs(finite(market.vwapGapPct, 0)) : 0;
  const vwapLossScore = scoreFromLoss(vwapLossPct, 0.001, 0.014);

  const cvdRisk = Math.max(
    normalizeBipolar(market.cvdTrendAlignment),
    normalizeBipolar(market.orderflowDivergenceScore),
    normalizeBipolar(market.cvdDivergenceScore),
    normalizeBipolar(market.takerBuySellImbalance)
  );
  const bookRisk = Math.max(
    normalizeBipolar(book.bookPressure),
    normalizeBipolar(book.weightedDepthImbalance),
    normalizeBipolar(book.depthConfidence == null ? 0 : book.depthConfidence - 0.5)
  );
  const toxicityRisk = clamp(finite(market.orderflowToxicityScore, finite(market.vpinLiteScore, 0)), 0, 1);
  const bearishPattern = clamp(finite(market.bearishPatternScore, 0), 0, 1);
  const orderflowReversalScore = weightedAverage([
    { score: cvdRisk, weight: 0.34 },
    { score: bookRisk, weight: 0.28 },
    { score: toxicityRisk, weight: 0.2 },
    { score: bearishPattern, weight: 0.18 }
  ]);

  const btcShockExitScore = clamp(Math.max(
    finite(market.btcShockScore, 0),
    finite(market.majorShockScore, 0),
    finite(market.relativeStrengthVsBtc, 0) < -0.025 ? Math.min(1, Math.abs(finite(market.relativeStrengthVsBtc, 0)) / 0.08) : 0,
    finite(market.marketBreadthScore, 0.5) < 0.25 ? (0.25 - finite(market.marketBreadthScore, 0.5)) / 0.25 : 0
  ), 0, 1);

  const fundingStress = Math.max(
    Math.abs(finite(marketStructureSummary.fundingAcceleration, finite(market.fundingAcceleration, 0))) / 0.0008,
    Math.abs(finite(marketStructureSummary.openInterestAccelerationPct, finite(market.openInterestAccelerationPct, 0))) / 0.06,
    finite(marketStructureSummary.crowdingRisk, finite(market.crowdingRisk, 0))
  );
  const crowdingFlip = finite(marketStructureSummary.signalScore, 0) < -0.1 && fundingStress > 0.2;
  const fundingOiCrowdingFlipScore = clamp(crowdingFlip ? Math.max(0.35, fundingStress) : fundingStress * 0.55, 0, 1);

  const staleWinnerPenalty = pnlPct <= 0.002 ? 0.2 : 0;
  const timeDecayScore = clamp((heldMinutes / maxHoldMinutes) + staleWinnerPenalty - Math.max(0, pnlPct) * 2, 0, 1);

  const trailingProtectionScore = clamp(Math.max(
    pnlPct > 0.006 ? Math.min(0.82, pnlPct / 0.035) : 0,
    drawdownFromHighPct > 0.003 && pnlPct > 0 ? Math.min(1, drawdownFromHighPct / 0.018) : 0,
    finite(exitIntelligenceSummary.tightenScore, 0)
  ), 0, 1);

  const partialTakeProfitScore = clamp(weightedAverage([
    { score: pnlPct > 0.008 ? Math.min(1, pnlPct / 0.035) : 0, weight: 0.35 },
    { score: drawdownFromHighPct > 0.004 ? Math.min(1, drawdownFromHighPct / 0.018) : 0, weight: 0.22 },
    { score: orderflowReversalScore, weight: 0.18 },
    { score: timeDecayScore, weight: 0.13 },
    { score: vwapLossScore, weight: 0.12 }
  ]), 0, 1);

  const fullExitScore = clamp(weightedAverage([
    { score: structureInvalidationScore, weight: 0.26 },
    { score: vwapLossScore, weight: 0.15 },
    { score: orderflowReversalScore, weight: 0.2 },
    { score: btcShockExitScore, weight: 0.1 },
    { score: fundingOiCrowdingFlipScore, weight: 0.1 },
    { score: timeDecayScore, weight: 0.12 },
    { score: clamp(finite(newsSummary.riskScore, 0) + finite(announcementSummary.riskScore, 0) + finite(calendarSummary.riskScore, 0), 0, 1), weight: 0.07 }
  ]) - clamp(finite(exitIntelligenceSummary.continuationQuality, 0) * 0.12, 0, 0.12), 0, 1);

  const atrStopPrice = resolveAtrStop({ currentPrice: price, entryPrice, market, config });
  const structureStopPrice = support > 0 ? support * 0.998 : null;
  const vwapInvalidationPrice = vwap > 0 ? vwap * 0.997 : null;
  const liquiditySweepInvalidationPrice = priceFrom(market.liquiditySweepInvalidationPrice, market.reclaimLow, support * 0.996) || null;
  const suggestedStops = {
    atrStopPrice: atrStopPrice ? num(atrStopPrice, 8) : null,
    structureStopPrice: structureStopPrice ? num(structureStopPrice, 8) : null,
    vwapInvalidationPrice: vwapInvalidationPrice ? num(vwapInvalidationPrice, 8) : null,
    liquiditySweepInvalidationPrice: liquiditySweepInvalidationPrice ? num(liquiditySweepInvalidationPrice, 8) : null,
    currentStopPrice: position.stopLossPrice ? num(position.stopLossPrice, 8) : null
  };
  suggestedStops.effectiveStopPrice = num(Math.max(...[
    suggestedStops.atrStopPrice,
    suggestedStops.structureStopPrice,
    suggestedStops.vwapInvalidationPrice,
    suggestedStops.liquiditySweepInvalidationPrice,
    suggestedStops.currentStopPrice
  ].filter((value) => Number.isFinite(value) && value > 0 && value < price), 0), 8) || null;
  suggestedStops.tightenedStopPrice = resolveTightenedStop({ position, currentPrice: price, updatedHigh, suggestedStops });
  if (suggestedStops.tightenedStopPrice) {
    suggestedStops.tightenedStopPrice = num(suggestedStops.tightenedStopPrice, 8);
  }

  const suggestedTargets = {
    nextResistanceTarget: resistance ? num(resistance, 8) : null,
    nextSupportTarget: support ? num(support, 8) : null,
    partialTakeProfitPrice: priceFrom(position.scaleOutTriggerPrice, entryPrice * (1 + finite(config.scaleOutTriggerPct, 0.012)), resistance * 0.985) || null,
    fullTakeProfitPrice: priceFrom(position.takeProfitPrice, resistance, entryPrice * (1 + finite(config.takeProfitPct, 0.03))) || null
  };
  suggestedTargets.partialTakeProfitPrice = suggestedTargets.partialTakeProfitPrice ? num(suggestedTargets.partialTakeProfitPrice, 8) : null;
  suggestedTargets.fullTakeProfitPrice = suggestedTargets.fullTakeProfitPrice ? num(suggestedTargets.fullTakeProfitPrice, 8) : null;

  const reasons = [];
  addReason(reasons, "structure_invalidation", structureInvalidationScore, bearishStructure ? "structure_break_or_market_structure_risk" : null);
  addReason(reasons, "vwap_loss", vwapLossScore, vwap > 0 ? `price_below_vwap:${num(vwapLossPct, 4)}` : null);
  addReason(reasons, "orderflow_reversal", orderflowReversalScore, "cvd_book_or_toxicity_reversal");
  addReason(reasons, "btc_shock", btcShockExitScore);
  addReason(reasons, "funding_oi_crowding_flip", fundingOiCrowdingFlipScore);
  addReason(reasons, "time_decay", timeDecayScore, `${num(heldMinutes, 1)}m/${maxHoldMinutes}m`);
  addReason(reasons, "protect_winner", trailingProtectionScore);
  reasons.sort((left, right) => right.score - left.score);

  let currentExitRecommendation = "hold";
  if (fullExitScore >= 0.72 || (structureInvalidationScore >= 0.78 && orderflowReversalScore >= 0.45)) {
    currentExitRecommendation = "exit";
  } else if (orderflowReversalScore >= 0.66 && (pnlPct >= -0.006 || structureInvalidationScore >= 0.42 || vwapLossScore >= 0.35)) {
    currentExitRecommendation = orderflowReversalScore >= 0.82 && structureInvalidationScore >= 0.48 ? "exit" : "trim";
  } else if (partialTakeProfitScore >= 0.58 || (timeDecayScore >= 0.72 && pnlPct >= -0.003)) {
    currentExitRecommendation = "trim";
  } else if (trailingProtectionScore >= 0.5 && pnlPct > 0.004) {
    currentExitRecommendation = "trail";
  }

  const whyHold = [];
  const whyTrim = [];
  const whyTrail = [];
  const whyExit = [];
  if (fullExitScore < 0.42 && structureInvalidationScore < 0.45) {
    whyHold.push("structure_and_full_exit_pressure_are_still_contained");
  }
  if (partialTakeProfitScore >= 0.45) {
    whyTrim.push("partial_profit_or_stall_pressure_is_rising");
  }
  if (timeDecayScore >= 0.6) {
    whyTrim.push("position_age_is_reducing_expected_edge");
  }
  if (trailingProtectionScore >= 0.45) {
    whyTrail.push("winner_has_enough_profit_or_drawdown_to_protect");
  }
  if (structureInvalidationScore >= 0.58) {
    whyExit.push("structure_or_breakout_context_is_invalidating");
  }
  if (orderflowReversalScore >= 0.55) {
    whyExit.push("orderflow_or_book_reversal_is_confirming_exit_risk");
  }
  if (vwapLossScore >= 0.55) {
    whyExit.push("price_lost_vwap_invalidation_area");
  }
  if (btcShockExitScore >= 0.55) {
    whyExit.push("major_market_shock_or_btc_relative_weakness");
  }

  return {
    version: "exit_intelligence_v2",
    structureInvalidationScore: num(structureInvalidationScore, 4),
    vwapLossScore: num(vwapLossScore, 4),
    orderflowReversalScore: num(orderflowReversalScore, 4),
    btcShockExitScore: num(btcShockExitScore, 4),
    fundingOiCrowdingFlipScore: num(fundingOiCrowdingFlipScore, 4),
    timeDecayScore: num(timeDecayScore, 4),
    trailingProtectionScore: num(trailingProtectionScore, 4),
    partialTakeProfitScore: num(partialTakeProfitScore, 4),
    fullExitScore: num(fullExitScore, 4),
    exitQualityScore: num(1 - fullExitScore, 4),
    currentExitRecommendation,
    suggestedAction: currentExitRecommendation,
    suggestedStops,
    suggestedTargets,
    reasons: reasons.slice(0, 6),
    explanation: {
      primaryReason: reasons[0]?.id || null,
      whyHold,
      whyTrim,
      whyTrail,
      whyExit
    },
    context: {
      pnlPct: num(pnlPct, 4),
      drawdownFromHighPct: num(drawdownFromHighPct, 4),
      heldMinutes: num(heldMinutes, 1),
      maxHoldMinutes,
      price: num(price, 8),
      entryPrice: num(entryPrice, 8),
      vwap: vwap ? num(vwap, 8) : null,
      support: support ? num(support, 8) : null,
      resistance: resistance ? num(resistance, 8) : null
    }
  };
}
