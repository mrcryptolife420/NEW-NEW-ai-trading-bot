import { clamp } from "../../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function average(values = [], fallback = 0) {
  const filtered = arr(values).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((total, value) => total + value, 0) / filtered.length : fallback;
}

function ratioToImbalance(value) {
  const ratio = Math.max(0, safeNumber(value, 1));
  return ratio > 0 ? clamp((ratio - 1) / (ratio + 1), -1, 1) : 0;
}

function averageTail(values = [], length = 1) {
  return average(arr(values).slice(-Math.max(1, length)), 0);
}

function averageWindow(values = [], startOffset = 0, length = 3) {
  const normalizedLength = Math.max(1, length);
  const end = values.length - Math.max(0, startOffset);
  const start = Math.max(0, end - normalizedLength);
  return average(values.slice(start, end), 0);
}

function normalizeTakerSeries(series = []) {
  return arr(series)
    .map((item) => {
      const buyVol = safeNumber(item?.buyVol, 0);
      const sellVol = safeNumber(item?.sellVol, 0);
      const total = buyVol + sellVol;
      const imbalance = total > 0
        ? (buyVol - sellVol) / total
        : ratioToImbalance(item?.buySellRatio || 1);
      return Number.isFinite(imbalance) ? imbalance : null;
    })
    .filter((value) => Number.isFinite(value));
}

function normalizeOpenInterestSeries(series = []) {
  return arr(series)
    .map((item) => safeNumber(item?.sumOpenInterest || item?.openInterest, Number.NaN))
    .filter((value) => Number.isFinite(value));
}

function normalizeBasisSeries(series = []) {
  return arr(series)
    .map((item) => safeNumber(item?.basisRate, Number.NaN) * 10_000)
    .filter((value) => Number.isFinite(value));
}

function computePercentile(values = [], latest = 0) {
  const filtered = arr(values).filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return 0;
  }
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  if (max <= min) {
    return 0.5;
  }
  return clamp((latest - min) / (max - min), 0, 1);
}

function classifyBasisRegime(latestBps = 0, slopeBps = 0) {
  if (latestBps >= 8 || slopeBps >= 2.5) {
    return "contango_expanding";
  }
  if (latestBps <= -8 || slopeBps <= -2.5) {
    return "backwardation_expanding";
  }
  if (Math.abs(latestBps) <= 3) {
    return "neutral";
  }
  return latestBps > 0 ? "contango" : "backwardation";
}

export function buildDerivativesContextProvider({
  enabled = true,
  symbol = null,
  runtime = {},
  marketStructureSummary = {}
} = {}) {
  if (!enabled) {
    return {
      id: "derivatives_context",
      status: "disabled",
      enabled: false,
      score: 0,
      note: "Derivatives context provider disabled.",
      data: {}
    };
  }

  const payload = runtime?.marketStructureCache?.[`market:${symbol}`]?.payload || {};
  const takerSeries = normalizeTakerSeries(payload?.takerLongShort);
  const oiSeries = normalizeOpenInterestSeries(payload?.openInterestHist);
  const basisSeries = normalizeBasisSeries(payload?.basis);
  const oiDeltaSeries = oiSeries.slice(1).map((value, index) => {
    const previous = oiSeries[index];
    return previous > 0 ? (value - previous) / previous : 0;
  });
  const takerShort = takerSeries.length ? averageTail(takerSeries, 1) : safeNumber(marketStructureSummary?.takerImbalance, 0);
  const takerMedium = takerSeries.length ? averageTail(takerSeries, 3) : takerShort;
  const takerLong = takerSeries.length ? averageTail(takerSeries, 12) : takerMedium;
  const latestOiDelta = oiDeltaSeries.length
    ? averageTail(oiDeltaSeries, 1)
    : safeNumber(marketStructureSummary?.openInterestChangePct, 0);
  const previousOiDelta = oiDeltaSeries.length > 1 ? averageWindow(oiDeltaSeries, 1, 1) : 0;
  const oiAcceleration = latestOiDelta - previousOiDelta;
  const latestBasisBps = basisSeries.length
    ? averageTail(basisSeries, 1)
    : safeNumber(marketStructureSummary?.basisBps, 0);
  const basisSlopeBps = basisSeries.length >= 4
    ? averageTail(basisSeries, 3) - averageWindow(basisSeries, 3, 3)
    : 0;
  const fundingRate = safeNumber(marketStructureSummary?.fundingRate, 0);
  const fundingAcceleration = basisSeries.length >= 6
    ? (averageTail(basisSeries, 2) - averageWindow(basisSeries, 2, 2)) / 10_000
    : 0;
  const oiPercentile = computePercentile(oiSeries, oiSeries.at(-1) || 0);
  const liquidationMagnetStrength = safeNumber(marketStructureSummary?.liquidationMagnetStrength, 0);
  const liquidationTrapRisk = safeNumber(marketStructureSummary?.liquidationTrapRisk, 0);
  const basisRegime = classifyBasisRegime(latestBasisBps, basisSlopeBps);
  const availableSeries = [takerSeries.length > 0, oiSeries.length > 1, basisSeries.length > 1].filter(Boolean).length;
  const status = availableSeries >= 2
    ? "ready"
    : availableSeries >= 1 || marketStructureSummary?.lastUpdatedAt
      ? "degraded"
      : "unavailable";
  const score = clamp(
    0.35 +
      Math.max(0, 0.5 - Math.abs(takerMedium)) * 0.12 +
      Math.max(0, 1 - Math.abs(latestOiDelta) * 14) * 0.14 +
      Math.max(0, 1 - Math.abs(latestBasisBps) / 16) * 0.1 +
      Math.max(0, 1 - liquidationTrapRisk) * 0.14 +
      availableSeries * 0.08,
    0,
    1
  );

  return {
    id: "derivatives_context",
    status,
    enabled: true,
    score: num(score),
    note: status === "ready"
      ? "Derivatives context built from cached OI, basis and taker-flow series."
      : status === "degraded"
        ? "Derivatives context partially available; using cached summary fallbacks."
        : "Derivatives context unavailable.",
    data: {
      takerImbalance: {
        short: num(takerShort),
        medium: num(takerMedium),
        long: num(takerLong)
      },
      openInterest: {
        deltaPct: num(latestOiDelta),
        acceleration: num(oiAcceleration),
        percentile: num(oiPercentile),
        regime: oiPercentile >= 0.72 ? "crowded_high" : oiPercentile <= 0.28 ? "quiet_low" : "normal"
      },
      funding: {
        rate: num(fundingRate, 6),
        acceleration: num(fundingAcceleration, 6)
      },
      basis: {
        bps: num(latestBasisBps, 2),
        slopeBps: num(basisSlopeBps, 2),
        regime: basisRegime
      },
      liquidation: {
        magnetDirection: marketStructureSummary?.liquidationMagnetDirection || "neutral",
        magnetStrength: num(liquidationMagnetStrength),
        trapRisk: num(liquidationTrapRisk),
        squeezeContinuationScore: num(marketStructureSummary?.squeezeContinuationScore || 0)
      }
    }
  };
}
