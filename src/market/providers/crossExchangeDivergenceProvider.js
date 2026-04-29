import { clamp } from "../../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function average(values = [], fallback = 0) {
  const filtered = arr(values).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((total, value) => total + value, 0) / filtered.length : fallback;
}

export function buildCrossExchangeDivergenceProvider({
  enabled = true,
  symbol = null,
  runtime = {},
  divergenceSummary = {}
} = {}) {
  if (!enabled) {
    return {
      id: "cross_exchange_divergence",
      status: "disabled",
      enabled: false,
      score: 0,
      note: "Cross-exchange divergence provider disabled.",
      data: {}
    };
  }

  const cache = runtime?.referenceVenueCache?.[symbol] || runtime?.referenceVenues?.[symbol] || {};
  const venues = arr(cache.venues || divergenceSummary.venues || []);
  const premiumSpread = average(venues.map((item) => safeNumber(item.premiumBps, Number.NaN)), safeNumber(divergenceSummary.averagePremiumBps, 0));
  const priceDivergence = average(venues.map((item) => safeNumber(item.priceDivergenceBps, Number.NaN)), safeNumber(divergenceSummary.averageScore, 0) * 100);
  const aggressorMismatch = average(venues.map((item) => safeNumber(item.aggressorMismatch, Number.NaN)), safeNumber(divergenceSummary.aggressorMismatch, 0));
  const spreadMismatch = average(venues.map((item) => safeNumber(item.spreadMismatchBps, Number.NaN)), 0);
  const availableVenueCount = venues.filter((item) => item && item.id).length;
  const status = availableVenueCount >= 2
    ? "ready"
    : availableVenueCount === 1 || divergenceSummary?.leadBlocker
      ? "degraded"
      : "unavailable";
  const divergenceScore = clamp(
    1 -
      Math.min(1, Math.abs(priceDivergence) / 18) * 0.45 -
      Math.min(1, Math.abs(premiumSpread) / 14) * 0.25 -
      Math.min(1, Math.abs(aggressorMismatch)) * 0.18 -
      Math.min(1, Math.abs(spreadMismatch) / 10) * 0.12,
    0,
    1
  );
  return {
    id: "cross_exchange_divergence",
    status,
    enabled: true,
    score: num(divergenceScore),
    note: status === "ready"
      ? "Cross-exchange divergence normalized from venue snapshots."
      : status === "degraded"
        ? "Cross-exchange divergence partially available; using runtime divergence summaries."
        : "Cross-exchange divergence unavailable.",
    data: {
      venueCount: availableVenueCount,
      priceDivergenceBps: num(priceDivergence, 2),
      premiumSpreadBps: num(premiumSpread, 2),
      aggressorMismatch: num(aggressorMismatch, 4),
      spreadMismatchBps: num(spreadMismatch, 2),
      regime: Math.abs(priceDivergence) >= 10 || Math.abs(premiumSpread) >= 8
        ? "divergent"
        : "aligned",
      leadBlocker: divergenceSummary?.leadBlocker || null
    }
  };
}
