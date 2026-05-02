import { average, clamp, pctChange, standardDeviation } from "../utils/math.js";

export const INDICATOR_FEATURE_REGISTRY_VERSION = "indicator_registry_phase1_v1";

export const INDICATOR_FEATURE_DEFINITIONS = [
  {
    id: "ema_ribbon",
    label: "EMA ribbon compression/expansion",
    warmupCandles: 72,
    outputs: ["emaRibbonCompressionScore", "emaRibbonExpansionScore", "emaRibbonBullishScore", "emaRibbonBearishScore"],
    normalization: "scores in [0,1], expansion in [-1,1]",
    strategyFamilies: ["trend_following", "breakout"],
    regimes: ["trend", "breakout", "range"]
  },
  {
    id: "vwap_bands",
    label: "VWAP bands",
    warmupCandles: 34,
    outputs: ["vwapBandPosition", "vwapBandWidthPct", "vwapUpperBandDistancePct", "vwapLowerBandDistancePct"],
    normalization: "position centered in [-1,1], widths/distances as pct",
    strategyFamilies: ["trend_following", "breakout", "mean_reversion"],
    regimes: ["trend", "breakout", "range", "high_vol"]
  },
  {
    id: "rsi_divergence",
    label: "RSI divergence",
    warmupCandles: 42,
    outputs: ["rsiBullishDivergenceScore", "rsiBearishDivergenceScore"],
    normalization: "scores in [0,1]",
    strategyFamilies: ["mean_reversion", "market_structure"],
    regimes: ["range", "high_vol", "breakout"]
  },
  {
    id: "macd_histogram_divergence",
    label: "MACD histogram divergence",
    warmupCandles: 60,
    outputs: ["macdBullishDivergenceScore", "macdBearishDivergenceScore"],
    normalization: "scores in [0,1]",
    strategyFamilies: ["trend_following", "breakout", "market_structure"],
    regimes: ["trend", "breakout", "high_vol"]
  },
  {
    id: "relative_volume_by_utc_hour",
    label: "Relative volume by UTC hour",
    warmupCandles: 72,
    outputs: ["relativeVolumeByUtcHour", "relativeVolumeByUtcHourZ"],
    normalization: "ratio >=0, z-score clipped to [-4,4]",
    strategyFamilies: ["breakout", "market_structure", "trend_following"],
    regimes: ["trend", "breakout", "high_vol"]
  },
  {
    id: "volatility_of_volatility",
    label: "Volatility-of-volatility",
    warmupCandles: 48,
    outputs: ["volatilityOfVolatility", "volatilityOfVolatilityScore"],
    normalization: "raw pct volatility, score in [0,1]",
    strategyFamilies: ["breakout", "mean_reversion", "trend_following"],
    regimes: ["high_vol", "breakout", "range"]
  }
];

const MAX_WARMUP = Math.max(...INDICATOR_FEATURE_DEFINITIONS.map((definition) => definition.warmupCandles));

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function candleTime(candle = {}) {
  const raw = candle.openTime ?? candle.closeTime ?? candle.time ?? candle.timestamp ?? candle.date;
  const millis = raw instanceof Date ? raw.getTime() : Number(raw);
  return Number.isFinite(millis) ? millis : null;
}

function last(values = [], fallback = 0) {
  const value = values[values.length - 1];
  return Number.isFinite(value) ? value : fallback;
}

function emaSeries(values = [], period = 14) {
  if (!values.length) {
    return [];
  }
  const multiplier = 2 / (period + 1);
  const output = [];
  let current = values[0];
  for (const value of values) {
    current = current + (value - current) * multiplier;
    output.push(current);
  }
  return output;
}

function rsiSeries(values = [], period = 14) {
  if (values.length < period + 1) {
    return values.map(() => 50);
  }
  const output = Array(period).fill(50);
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  output.push(averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss)));
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(change, 0)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(-change, 0)) / period;
    output.push(averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss)));
  }
  return output;
}

function macdHistogramSeries(values = []) {
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const line = values.map((_, index) => finite(fast[index]) - finite(slow[index]));
  const signal = emaSeries(line, 9);
  return line.map((value, index) => value - finite(signal[index]));
}

function weightedVwapBand(candles = [], lookback = 30, deviations = 2) {
  const recent = candles.slice(-lookback);
  const totalVolume = recent.reduce((total, candle) => total + Math.max(0, finite(candle.volume)), 0);
  const typicalPrices = recent.map((candle) => average([finite(candle.high), finite(candle.low), finite(candle.close)], finite(candle.close)));
  const vwap = totalVolume > 0
    ? recent.reduce((total, candle, index) => total + typicalPrices[index] * Math.max(0, finite(candle.volume)), 0) / totalVolume
    : average(typicalPrices, last(typicalPrices, 0));
  const variance = totalVolume > 0
    ? recent.reduce((total, candle, index) => {
      const distance = typicalPrices[index] - vwap;
      return total + distance * distance * Math.max(0, finite(candle.volume));
    }, 0) / totalVolume
    : 0;
  const deviation = Math.sqrt(Math.max(0, variance));
  return {
    vwap,
    upper: vwap + deviation * deviations,
    lower: vwap - deviation * deviations,
    deviation
  };
}

function splitLookback(values = [], lookback = 36) {
  const recent = values.slice(-lookback);
  const midpoint = Math.floor(recent.length / 2);
  return {
    first: recent.slice(0, midpoint),
    second: recent.slice(midpoint)
  };
}

function extremeIndex(values = [], mode = "min") {
  if (!values.length) {
    return -1;
  }
  let selectedIndex = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (mode === "max" ? values[index] > values[selectedIndex] : values[index] < values[selectedIndex]) {
      selectedIndex = index;
    }
  }
  return selectedIndex;
}

function divergenceScores({ prices = [], oscillator = [], lookback = 36, minPriceMove = 0.001, oscillatorScale = 18 } = {}) {
  if (prices.length < lookback || oscillator.length < lookback) {
    return { bullish: 0, bearish: 0 };
  }
  const priceWindows = splitLookback(prices, lookback);
  const oscWindows = splitLookback(oscillator, lookback);
  const priorLowIndex = extremeIndex(priceWindows.first, "min");
  const currentLowIndex = extremeIndex(priceWindows.second, "min");
  const priorHighIndex = extremeIndex(priceWindows.first, "max");
  const currentHighIndex = extremeIndex(priceWindows.second, "max");
  const priorLow = priceWindows.first[priorLowIndex];
  const currentLow = priceWindows.second[currentLowIndex];
  const priorHigh = priceWindows.first[priorHighIndex];
  const currentHigh = priceWindows.second[currentHighIndex];
  const priorOscLow = oscWindows.first[priorLowIndex];
  const currentOscLow = oscWindows.second[currentLowIndex];
  const priorOscHigh = oscWindows.first[priorHighIndex];
  const currentOscHigh = oscWindows.second[currentHighIndex];
  const bullishPriceMove = priorLow ? Math.max(0, (priorLow - currentLow) / priorLow) : 0;
  const bearishPriceMove = priorHigh ? Math.max(0, (currentHigh - priorHigh) / priorHigh) : 0;
  const bullishOscMove = Math.max(0, currentOscLow - priorOscLow);
  const bearishOscMove = Math.max(0, priorOscHigh - currentOscHigh);
  return {
    bullish: bullishPriceMove >= minPriceMove ? clamp((bullishPriceMove / 0.012) * 0.52 + (bullishOscMove / oscillatorScale) * 0.48, 0, 1) : 0,
    bearish: bearishPriceMove >= minPriceMove ? clamp((bearishPriceMove / 0.012) * 0.52 + (bearishOscMove / oscillatorScale) * 0.48, 0, 1) : 0
  };
}

function buildEmaRibbon(closes = []) {
  const periods = [8, 13, 21, 34, 55];
  const ribbons = periods.map((period) => emaSeries(closes, period));
  const current = ribbons.map((series) => last(series));
  const previous = ribbons.map((series) => series[Math.max(0, series.length - 8)] ?? last(series));
  const close = Math.max(last(closes, 0), 1e-9);
  const widthPct = (Math.max(...current) - Math.min(...current)) / close;
  const priorWidthPct = (Math.max(...previous) - Math.min(...previous)) / close;
  const bullishStack = current.every((value, index) => index === 0 || current[index - 1] >= value);
  const bearishStack = current.every((value, index) => index === 0 || current[index - 1] <= value);
  const slope = periods.map((_, index) => current[index] - previous[index]);
  return {
    emaRibbonWidthPct: widthPct,
    emaRibbonCompressionScore: clamp(1 - widthPct * 85, 0, 1),
    emaRibbonExpansionScore: clamp((widthPct - priorWidthPct) * 420, -1, 1),
    emaRibbonBullishScore: clamp((bullishStack ? 0.62 : 0) + average(slope.map((value) => value > 0 ? 1 : 0), 0) * 0.38, 0, 1),
    emaRibbonBearishScore: clamp((bearishStack ? 0.62 : 0) + average(slope.map((value) => value < 0 ? 1 : 0), 0) * 0.38, 0, 1)
  };
}

function buildVwapBands(candles = []) {
  const close = Math.max(finite(candles.at(-1)?.close), 1e-9);
  const band = weightedVwapBand(candles, 30, 2);
  const width = Math.max(band.upper - band.lower, 1e-9);
  const rawPosition = (close - band.lower) / width;
  return {
    vwapBandVwap: band.vwap,
    vwapBandUpper: band.upper,
    vwapBandLower: band.lower,
    vwapBandPosition: clamp((rawPosition - 0.5) * 2, -1, 1),
    vwapBandWidthPct: width / close,
    vwapUpperBandDistancePct: pctChange(close, band.upper),
    vwapLowerBandDistancePct: pctChange(close, band.lower)
  };
}

function buildRelativeVolumeByUtcHour(candles = []) {
  const lastCandle = candles.at(-1) || {};
  const lastTime = candleTime(lastCandle);
  const lastVolume = Math.max(0, finite(lastCandle.volume));
  const hour = lastTime == null ? null : new Date(lastTime).getUTCHours();
  const priorCandles = candles.slice(0, -1);
  const sameHourVolumes = hour == null
    ? []
    : priorCandles
      .filter((candle) => {
        const timestamp = candleTime(candle);
        return timestamp != null && new Date(timestamp).getUTCHours() === hour;
      })
      .map((candle) => Math.max(0, finite(candle.volume)));
  const reference = sameHourVolumes.length >= 3
    ? sameHourVolumes
    : priorCandles.slice(-48).map((candle) => Math.max(0, finite(candle.volume)));
  const mean = average(reference, lastVolume || 1);
  const observedStdev = standardDeviation(reference, 0);
  const stdev = observedStdev > 0 ? observedStdev : Math.max(mean * 0.2, 1);
  return {
    relativeVolumeByUtcHour: mean > 0 ? lastVolume / mean : 1,
    relativeVolumeByUtcHourZ: clamp(stdev > 0 ? (lastVolume - mean) / stdev : 0, -4, 4),
    relativeVolumeUtcHourSampleSize: reference.length
  };
}

function buildVolatilityOfVolatility(closes = []) {
  const returns = [];
  for (let index = 1; index < closes.length; index += 1) {
    returns.push(pctChange(closes[index - 1], closes[index]));
  }
  const volSeries = [];
  for (let index = 8; index <= returns.length; index += 1) {
    volSeries.push(standardDeviation(returns.slice(index - 8, index), 0));
  }
  const recent = volSeries.slice(-24);
  const value = standardDeviation(recent, 0);
  return {
    volatilityOfVolatility: value,
    volatilityOfVolatilityScore: clamp(value * 180, 0, 1)
  };
}

function summarizeFeatureContributions(features = {}) {
  const candidates = [
    ["ema_ribbon_bullish", features.emaRibbonBullishScore - features.emaRibbonBearishScore],
    ["ema_ribbon_expansion", features.emaRibbonExpansionScore],
    ["vwap_band_position", features.vwapBandPosition],
    ["rsi_divergence", features.rsiBullishDivergenceScore - features.rsiBearishDivergenceScore],
    ["macd_histogram_divergence", features.macdBullishDivergenceScore - features.macdBearishDivergenceScore],
    ["relative_volume_utc_hour", clamp((features.relativeVolumeByUtcHour || 1) - 1, -1, 1)],
    ["volatility_of_volatility", -features.volatilityOfVolatilityScore]
  ].filter(([, value]) => Number.isFinite(value) && Math.abs(value) > 0.01);
  return {
    topPositiveFeatures: candidates
      .filter(([, value]) => value > 0)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([id, value]) => ({ id, value })),
    topNegativeFeatures: candidates
      .filter(([, value]) => value < 0)
      .sort((left, right) => left[1] - right[1])
      .slice(0, 5)
      .map(([id, value]) => ({ id, value }))
  };
}

export function buildIndicatorFeaturePack(candles = [], { now = new Date() } = {}) {
  const normalizedCandles = Array.isArray(candles)
    ? candles.filter((candle) => Number.isFinite(candle?.close) && Number.isFinite(candle?.high) && Number.isFinite(candle?.low))
    : [];
  const candleCount = normalizedCandles.length;
  const missingIndicators = INDICATOR_FEATURE_DEFINITIONS
    .filter((definition) => candleCount < definition.warmupCandles)
    .map((definition) => ({
      id: definition.id,
      required: definition.warmupCandles,
      available: candleCount
    }));
  const closes = normalizedCandles.map((candle) => finite(candle.close));
  const rsiValues = rsiSeries(closes, 14);
  const macdHist = macdHistogramSeries(closes);
  const rsiDivergence = divergenceScores({ prices: closes, oscillator: rsiValues, lookback: 36, oscillatorScale: 18 });
  const macdDivergence = divergenceScores({ prices: closes, oscillator: macdHist, lookback: 36, oscillatorScale: Math.max(standardDeviation(macdHist.slice(-60), 1e-9) * 8, 1e-9) });
  const features = {
    ...buildEmaRibbon(closes),
    ...buildVwapBands(normalizedCandles),
    rsiBullishDivergenceScore: rsiDivergence.bullish,
    rsiBearishDivergenceScore: rsiDivergence.bearish,
    macdBullishDivergenceScore: macdDivergence.bullish,
    macdBearishDivergenceScore: macdDivergence.bearish,
    ...buildRelativeVolumeByUtcHour(normalizedCandles),
    ...buildVolatilityOfVolatility(closes)
  };
  const staleCutoffMs = 90 * 60 * 1000;
  const lastTimestamp = candleTime(normalizedCandles.at(-1));
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const stale = Number.isFinite(lastTimestamp) && Number.isFinite(nowMs)
    ? nowMs - lastTimestamp > staleCutoffMs
    : false;
  const missingFeatureIds = missingIndicators.flatMap((item) => (
    INDICATOR_FEATURE_DEFINITIONS.find((definition) => definition.id === item.id)?.outputs || []
  ));
  const qualityScore = clamp(
    (candleCount / Math.max(MAX_WARMUP, 1)) * 0.72 +
      (1 - missingIndicators.length / Math.max(INDICATOR_FEATURE_DEFINITIONS.length, 1)) * 0.2 +
      (stale ? 0 : 0.08),
    0,
    1
  );
  const contributions = summarizeFeatureContributions(features);
  return {
    version: INDICATOR_FEATURE_REGISTRY_VERSION,
    packId: "phase1_core_indicators",
    status: candleCount === 0 ? "missing" : missingIndicators.length ? "warmup" : stale ? "stale" : "ready",
    candleCount,
    warmupCandlesRequired: MAX_WARMUP,
    usedIndicators: INDICATOR_FEATURE_DEFINITIONS
      .filter((definition) => candleCount >= definition.warmupCandles)
      .map((definition) => definition.id),
    missingIndicators,
    features,
    quality: {
      qualityScore,
      stale,
      missingFeatures: [...new Set(missingFeatureIds)],
      source: "candles",
      lastTimestamp: lastTimestamp == null ? null : new Date(lastTimestamp).toISOString()
    },
    topPositiveFeatures: contributions.topPositiveFeatures,
    topNegativeFeatures: contributions.topNegativeFeatures,
    definitions: INDICATOR_FEATURE_DEFINITIONS
  };
}
