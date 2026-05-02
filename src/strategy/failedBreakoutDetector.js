import { clamp } from "../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function ratio(value, min, max) {
  if (max <= min) {
    return 0;
  }
  return clamp((safeNumber(value) - min) / (max - min), 0, 1);
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

export function detectFailedBreakout({
  market = {},
  book = {},
  stream = {},
  timeframeSummary = {},
  config = {}
} = {}) {
  const breakoutLevel = safeNumber(market.priorRangeHigh) || safeNumber(market.rangeHigh) || safeNumber(market.donchianUpper) || safeNumber(market.breakoutLevel);
  const price = safeNumber(book.mid) || safeNumber(market.close) || safeNumber(book.bid);
  const reclaimDistancePct = breakoutLevel > 0 && price > 0 ? (price - breakoutLevel) / price : 0;
  const lostLevel = breakoutLevel > 0 && price < breakoutLevel * 0.998;
  const weakClose = safeNumber(market.closeLocation, 0.5) < 0.48;
  const bearishCvd = Math.max(
    ratio(safeNumber(market.cvdDivergenceScore), 0.42, 0.86),
    ratio(-safeNumber(market.cvdTrendAlignment), 0.12, 0.65),
    ratio(-safeNumber(stream.tradeFlowImbalance), 0.08, 0.55)
  );
  const orderbookRejection = Math.max(
    ratio(-safeNumber(book.bookPressure), 0.1, 0.55),
    ratio(safeNumber(book.spreadBps), 9, 28),
    ratio(0.45 - safeNumber(book.depthConfidence, 0.5), 0.02, 0.32)
  );
  const followThroughFailure = Math.max(
    ratio(0.48 - safeNumber(market.breakoutFollowThroughScore, 0.5), 0.02, 0.42),
    ratio(0.48 - safeNumber(market.volumeAcceptanceScore, 0.5), 0.02, 0.42),
    ratio(0.5 - safeNumber(timeframeSummary.alignmentScore, 0.5), 0.02, 0.35)
  );
  const overextension = Math.max(
    ratio(safeNumber(market.trendExhaustionScore), 0.55, 0.9),
    ratio(safeNumber(market.trendMaturityScore), 0.78, 0.96)
  );
  const failedBreakoutRisk = clamp(
    (lostLevel ? 0.24 : 0) +
      (weakClose ? 0.12 : 0) +
      bearishCvd * 0.24 +
      orderbookRejection * 0.18 +
      followThroughFailure * 0.16 +
      overextension * 0.06,
    0,
    1
  );
  const threshold = safeNumber(config.failedBreakoutRiskThreshold, 0.58);
  const status = failedBreakoutRisk >= threshold ? "failed_breakout" : failedBreakoutRisk >= threshold * 0.72 ? "caution" : "clear";
  return {
    status,
    failedBreakoutRisk: num(failedBreakoutRisk),
    breakoutLevel: breakoutLevel || null,
    reclaimDistancePct: num(reclaimDistancePct),
    lostLevel,
    weakClose,
    bearishCvd: num(bearishCvd),
    orderbookRejection: num(orderbookRejection),
    followThroughFailure: num(followThroughFailure),
    overextension: num(overextension),
    reasons: [
      lostLevel ? "breakout_level_lost" : null,
      weakClose ? "weak_close_location" : null,
      bearishCvd >= 0.5 ? "cvd_orderflow_reversal" : null,
      orderbookRejection >= 0.5 ? "orderbook_rejection" : null,
      followThroughFailure >= 0.5 ? "follow_through_failed" : null,
      overextension >= 0.5 ? "late_overextended_breakout" : null
    ].filter(Boolean)
  };
}
