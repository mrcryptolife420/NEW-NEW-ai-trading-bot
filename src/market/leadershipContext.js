import { clamp } from "../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function ratio(value, min, max) {
  if (max <= min) {
    return 0;
  }
  return clamp((safeNumber(value) - min) / (max - min), 0, 1);
}

export function buildLeadershipContext({
  symbol = "",
  symbolReturnPct = 0,
  btcReturnPct = 0,
  ethReturnPct = 0,
  sectorReturnPct = 0,
  spotPrice = null,
  futuresPrice = null,
  sectorBreadth = 0.5,
  sectorMomentum = 0
} = {}) {
  const btcRelativePct = safeNumber(symbolReturnPct) - safeNumber(btcReturnPct);
  const ethRelativePct = safeNumber(symbolReturnPct) - safeNumber(ethReturnPct);
  const sectorRelativePct = safeNumber(symbolReturnPct) - safeNumber(sectorReturnPct);
  const spotFuturesDivergenceBps = Number.isFinite(spotPrice) && Number.isFinite(futuresPrice) && spotPrice > 0
    ? ((futuresPrice - spotPrice) / spotPrice) * 10000
    : 0;
  const leadershipScore = clamp(
    ratio(btcRelativePct, -0.012, 0.028) * 0.34 +
      ratio(ethRelativePct, -0.012, 0.028) * 0.24 +
      ratio(sectorRelativePct, -0.01, 0.024) * 0.18 +
      ratio(sectorBreadth, 0.42, 0.72) * 0.14 +
      ratio(sectorMomentum, -0.01, 0.025) * 0.1,
    0,
    1
  );
  const riskOffScore = clamp(
    ratio(-btcReturnPct, 0.006, 0.035) * 0.34 +
      ratio(-ethReturnPct, 0.006, 0.04) * 0.24 +
      ratio(-sectorBreadth + 0.5, 0.02, 0.35) * 0.2 +
      ratio(Math.abs(spotFuturesDivergenceBps), 18, 90) * 0.22,
    0,
    1
  );
  const sectorRotationScore = clamp(
    ratio(sectorReturnPct - btcReturnPct, -0.006, 0.022) * 0.42 +
      ratio(sectorBreadth, 0.45, 0.78) * 0.34 +
      ratio(sectorMomentum, -0.006, 0.025) * 0.24,
    0,
    1
  );
  const leadershipState = leadershipScore >= 0.68 ? "leader" : leadershipScore <= 0.34 ? "laggard" : "neutral";
  const sectorRotationState = sectorRotationScore >= 0.66 ? "leading" : sectorRotationScore <= 0.34 ? "cooling" : "neutral";
  const divergenceState = Math.abs(spotFuturesDivergenceBps) >= 45 ? "diverged" : Math.abs(spotFuturesDivergenceBps) >= 18 ? "watch" : "aligned";
  return {
    symbol,
    leadershipState,
    sectorRotationState,
    divergenceState,
    leadershipScore: num(leadershipScore),
    riskOffScore: num(riskOffScore),
    sectorRotationScore: num(sectorRotationScore),
    btcRelativePct: num(btcRelativePct),
    ethRelativePct: num(ethRelativePct),
    sectorRelativePct: num(sectorRelativePct),
    spotFuturesDivergenceBps: num(spotFuturesDivergenceBps, 2),
    reasons: [
      leadershipState === "leader" ? "symbol_leads_btc_eth" : null,
      leadershipState === "laggard" ? "symbol_lags_btc_eth" : null,
      sectorRotationState === "leading" ? "sector_rotation_tailwind" : null,
      sectorRotationState === "cooling" ? "sector_rotation_cooling" : null,
      divergenceState === "diverged" ? "spot_futures_divergence" : null,
      riskOffScore >= 0.55 ? "btc_eth_risk_off" : null
    ].filter(Boolean)
  };
}
