import { clamp } from "../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function ratioAbs(value, scale) {
  return clamp(Math.abs(safeNumber(value)) / scale, 0, 1);
}

export function buildFundingOiMatrix({
  fundingRate = 0,
  fundingAcceleration = 0,
  openInterestDeltaPct = 0,
  openInterestAccelerationPct = 0,
  basisBps = 0,
  basisSlopeBps = 0,
  priceChangePct = 0,
  takerImbalance = 0
} = {}) {
  const crowdingLong = clamp(
    ratioAbs(Math.max(0, fundingRate), 0.0008) * 0.28 +
      ratioAbs(Math.max(0, fundingAcceleration), 0.00035) * 0.16 +
      ratioAbs(Math.max(0, openInterestDeltaPct), 0.035) * 0.2 +
      ratioAbs(Math.max(0, basisBps), 90) * 0.18 +
      ratioAbs(Math.max(0, takerImbalance), 0.55) * 0.1 +
      (priceChangePct > 0 ? 0.08 : 0),
    0,
    1
  );
  const squeezeRisk = clamp(
    ratioAbs(Math.min(0, fundingRate), 0.0007) * 0.26 +
      ratioAbs(Math.max(0, openInterestDeltaPct), 0.04) * 0.26 +
      ratioAbs(Math.min(0, priceChangePct), 0.035) * 0.18 +
      ratioAbs(Math.min(0, takerImbalance), 0.55) * 0.16 +
      ratioAbs(Math.min(0, basisSlopeBps), 55) * 0.14,
    0,
    1
  );
  const unwindRisk = clamp(
    ratioAbs(Math.min(0, openInterestAccelerationPct), 0.03) * 0.36 +
      ratioAbs(Math.min(0, basisSlopeBps), 45) * 0.22 +
      ratioAbs(Math.max(0, fundingRate), 0.0008) * 0.16 +
      ratioAbs(Math.min(0, priceChangePct), 0.03) * 0.16 +
      ratioAbs(Math.min(0, takerImbalance), 0.5) * 0.1,
    0,
    1
  );
  const continuationSupport = clamp(
    ratioAbs(Math.max(0, priceChangePct), 0.03) * 0.22 +
      ratioAbs(Math.max(0, openInterestDeltaPct), 0.03) * 0.22 +
      ratioAbs(Math.max(0, takerImbalance), 0.5) * 0.22 +
      ratioAbs(Math.max(0, basisSlopeBps), 45) * 0.16 +
      (fundingRate < 0.00055 ? 0.18 : 0),
    0,
    1
  );
  const dominant = [
    ["crowded_long", crowdingLong],
    ["short_squeeze_risk", squeezeRisk],
    ["oi_unwind_risk", unwindRisk],
    ["continuation_support", continuationSupport]
  ].sort((left, right) => right[1] - left[1])[0];
  return {
    status: dominant[0],
    score: num(dominant[1]),
    crowdingLong: num(crowdingLong),
    squeezeRisk: num(squeezeRisk),
    unwindRisk: num(unwindRisk),
    continuationSupport: num(continuationSupport),
    inputs: {
      fundingRate: num(fundingRate, 7),
      fundingAcceleration: num(fundingAcceleration, 7),
      openInterestDeltaPct: num(openInterestDeltaPct),
      openInterestAccelerationPct: num(openInterestAccelerationPct),
      basisBps: num(basisBps, 2),
      basisSlopeBps: num(basisSlopeBps, 2),
      priceChangePct: num(priceChangePct),
      takerImbalance: num(takerImbalance)
    }
  };
}
