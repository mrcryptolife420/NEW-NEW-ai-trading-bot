import { average, clamp, standardDeviation } from "../utils/math.js";
import { atr, ema } from "./indicators.js";

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeObject(record = {}) {
  return record && typeof record === "object" ? record : {};
}

function safeCandles(candles = []) {
  return Array.isArray(candles)
    ? candles.map((candle) => {
        const source = safeObject(candle);
        const close = finite(source.close);
        const open = finite(source.open, close);
        const high = Math.max(finite(source.high, Math.max(open, close)), open, close);
        const low = Math.min(finite(source.low, Math.min(open, close)), open, close);
        return {
          open,
          high,
          low,
          close,
          volume: Math.max(0, finite(source.volume))
        };
      })
    : [];
}

function safeArray(values = []) {
  return Array.isArray(values) ? values.map((value) => finite(value)).filter(Number.isFinite) : [];
}

function safeReturn(record = {}) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      Number.isFinite(value) ? value : value
    ])
  );
}

function percentileRank(value, values = []) {
  const series = safeArray(values);
  if (!series.length) {
    return 0.5;
  }
  const target = finite(value, series.at(-1) || 0);
  const below = series.filter((item) => item <= target).length;
  return clamp(below / series.length, 0, 1);
}

export function anchoredVwap(candles = [], anchorIndex = 0) {
  const series = safeCandles(candles);
  if (!series.length) {
    return { value: 0, distancePct: 0, anchoredAt: null, samples: 0, status: "empty" };
  }
  const start = clamp(Math.round(finite(anchorIndex)), 0, series.length - 1);
  const slice = series.slice(start);
  const totals = slice.reduce((state, candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    return {
      pv: state.pv + typical * candle.volume,
      volume: state.volume + candle.volume
    };
  }, { pv: 0, volume: 0 });
  const lastClose = series.at(-1).close;
  const value = totals.volume > 0 ? totals.pv / totals.volume : lastClose;
  return safeReturn({
    value,
    distancePct: lastClose > 0 ? (lastClose - value) / lastClose : 0,
    anchoredAt: start,
    samples: slice.length,
    status: slice.length > 1 ? "ready" : "warmup"
  });
}

export function emaSlopeStack(closes = [], lengths = [8, 21, 55]) {
  const series = safeArray(closes);
  const resolvedLengths = Array.isArray(lengths) && lengths.length ? lengths.map((value) => Math.max(1, Math.round(finite(value, 1)))) : [8, 21, 55];
  if (!series.length) {
    return { status: "empty", score: 0, alignment: "flat", slopes: {}, emas: {} };
  }
  const slopes = {};
  const emas = {};
  for (const length of resolvedLengths) {
    const current = ema(series, length);
    const previous = series.length > 1 ? ema(series.slice(0, -1), length) : current;
    emas[length] = current;
    slopes[length] = current > 0 ? (current - previous) / current : 0;
  }
  const ordered = resolvedLengths.map((length) => emas[length]);
  const bullishStack = ordered.every((value, index) => index === 0 || ordered[index - 1] >= value);
  const bearishStack = ordered.every((value, index) => index === 0 || ordered[index - 1] <= value);
  const avgSlope = average(Object.values(slopes), 0);
  return {
    status: series.length >= Math.max(...resolvedLengths) ? "ready" : "warmup",
    score: clamp(avgSlope * 800, -1, 1),
    alignment: bullishStack ? "bullish" : bearishStack ? "bearish" : "mixed",
    slopes,
    emas
  };
}

export function relativeVolume(candles = [], length = 20) {
  const series = safeCandles(candles);
  if (!series.length) {
    return { value: 1, score: 0, status: "empty", samples: 0 };
  }
  const resolvedLength = Math.max(1, Math.round(finite(length, 20)));
  const recent = series.slice(-resolvedLength - 1, -1);
  const current = series.at(-1).volume;
  const baseline = average(recent.map((candle) => candle.volume), current || 1) || 1;
  const value = current / Math.max(baseline, 1e-9);
  return {
    value: finite(value, 1),
    score: clamp((value - 1) / 2, -1, 1),
    status: recent.length >= Math.min(resolvedLength, 3) ? "ready" : "warmup",
    samples: recent.length
  };
}

export function bollingerKeltnerSqueeze(candles = []) {
  const series = safeCandles(candles);
  if (series.length < 5) {
    return { status: "warmup", squeezeOn: false, expansionScore: 0, compressionScore: 0, widthRatio: 1 };
  }
  const closes = series.map((candle) => candle.close);
  const recent = closes.slice(-20);
  const basis = average(recent, closes.at(-1) || 0);
  const deviation = standardDeviation(recent, 0);
  const bbWidth = deviation * 4;
  const atrValue = atr(series, Math.min(20, Math.max(2, series.length - 1)));
  const kcWidth = atrValue * 3;
  const widthRatio = kcWidth > 0 ? bbWidth / kcWidth : 1;
  const previous = series.length > 6 ? bollingerKeltnerSqueeze(series.slice(0, -1)) : { widthRatio };
  return {
    status: series.length >= 20 ? "ready" : "warmup",
    squeezeOn: widthRatio < 1,
    expansionScore: clamp((finite(previous.widthRatio, widthRatio) - widthRatio) * -1 + Math.max(0, widthRatio - 1), 0, 1),
    compressionScore: clamp(1 - widthRatio, 0, 1),
    widthRatio: finite(widthRatio, 1),
    basis
  };
}

export function atrPercentile(candles = [], length = 14, lookback = 100) {
  const series = safeCandles(candles);
  if (series.length < 3) {
    return { percentile: 0.5, currentAtrPct: 0, status: "warmup", samples: 0 };
  }
  const resolvedLength = Math.max(2, Math.round(finite(length, 14)));
  const resolvedLookback = Math.max(resolvedLength + 1, Math.round(finite(lookback, 100)));
  const atrPctSeries = [];
  for (let end = Math.max(3, resolvedLength + 1); end <= series.length; end += 1) {
    const window = series.slice(0, end);
    const value = atr(window, Math.min(resolvedLength, window.length - 1));
    const close = window.at(-1).close || 1;
    atrPctSeries.push(value / Math.max(close, 1e-9));
  }
  const recent = atrPctSeries.slice(-resolvedLookback);
  const current = recent.at(-1) || 0;
  return {
    percentile: percentileRank(current, recent),
    currentAtrPct: finite(current),
    status: recent.length >= resolvedLength ? "ready" : "warmup",
    samples: recent.length
  };
}

export function vwapZScore(candles = [], length = 50) {
  const series = safeCandles(candles);
  if (!series.length) {
    return { zScore: 0, vwap: 0, status: "empty", samples: 0 };
  }
  const resolvedLength = Math.max(2, Math.round(finite(length, 50)));
  const slice = series.slice(-resolvedLength);
  const totals = slice.reduce((state, candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    return { pv: state.pv + typical * candle.volume, volume: state.volume + candle.volume };
  }, { pv: 0, volume: 0 });
  const vwap = totals.volume > 0 ? totals.pv / totals.volume : slice.at(-1).close;
  const deviations = slice.map((candle) => candle.close - vwap);
  const stdev = standardDeviation(deviations, 0);
  const zScore = stdev > 0 ? (series.at(-1).close - vwap) / stdev : 0;
  return {
    zScore: clamp(finite(zScore), -6, 6),
    vwap: finite(vwap),
    status: slice.length >= Math.min(resolvedLength, 10) ? "ready" : "warmup",
    samples: slice.length
  };
}

export function obvDivergence(candles = [], lookback = 20) {
  const series = safeCandles(candles);
  if (series.length < 3) {
    return { direction: "none", score: 0, priceChangePct: 0, obvChangePct: 0, status: "warmup" };
  }
  const resolvedLookback = Math.max(2, Math.round(finite(lookback, 20)));
  const slice = series.slice(-resolvedLookback);
  let obv = 0;
  const obvSeries = [0];
  for (let index = 1; index < slice.length; index += 1) {
    const current = slice[index];
    const previous = slice[index - 1];
    obv += current.close > previous.close ? current.volume : current.close < previous.close ? -current.volume : 0;
    obvSeries.push(obv);
  }
  const priceChangePct = slice[0].close > 0 ? (slice.at(-1).close - slice[0].close) / slice[0].close : 0;
  const obvBase = Math.max(Math.abs(obvSeries[0]), Math.abs(obvSeries.at(-1)), 1);
  const obvChangePct = (obvSeries.at(-1) - obvSeries[0]) / obvBase;
  const bearish = priceChangePct > 0.01 && obvChangePct < -0.05;
  const bullish = priceChangePct < -0.01 && obvChangePct > 0.05;
  return {
    direction: bearish ? "bearish" : bullish ? "bullish" : "none",
    score: clamp(Math.abs(priceChangePct - obvChangePct), 0, 1),
    priceChangePct: finite(priceChangePct),
    obvChangePct: finite(obvChangePct),
    status: slice.length >= resolvedLookback ? "ready" : "warmup"
  };
}

export function spreadPercentile(currentSpreadBps = 0, historicalSpreads = []) {
  const percentile = percentileRank(finite(currentSpreadBps), historicalSpreads);
  return {
    percentile,
    status: safeArray(historicalSpreads).length >= 10 ? "ready" : "warmup",
    risk: percentile >= 0.9 ? "high" : percentile >= 0.7 ? "medium" : "low"
  };
}

export function orderBookImbalanceStability(bookSnapshots = []) {
  const snapshots = Array.isArray(bookSnapshots) ? bookSnapshots : [];
  const imbalances = snapshots.map((snapshot) => {
    const bid = finite(snapshot?.bidDepth ?? snapshot?.bidQty ?? snapshot?.bidVolume);
    const ask = finite(snapshot?.askDepth ?? snapshot?.askQty ?? snapshot?.askVolume);
    return (bid - ask) / Math.max(bid + ask, 1e-9);
  }).filter(Number.isFinite);
  if (!imbalances.length) {
    return { stability: 0, averageImbalance: 0, direction: "neutral", status: "empty", samples: 0 };
  }
  const avg = average(imbalances, 0);
  const stdev = standardDeviation(imbalances, 0);
  return {
    stability: clamp(1 - stdev * 2.5, 0, 1),
    averageImbalance: clamp(avg, -1, 1),
    direction: avg > 0.08 ? "bid" : avg < -0.08 ? "ask" : "neutral",
    status: imbalances.length >= 5 ? "ready" : "warmup",
    samples: imbalances.length
  };
}

export function slippageConfidenceScore({
  expectedSlippageBps = null,
  realizedSlippageBps = null,
  spreadPercentile: spreadPct = null,
  depthConfidence = null,
  fillCompletionRatio = null
} = {}) {
  const expected = Math.max(0, finite(expectedSlippageBps, 0));
  const realized = Math.max(0, finite(realizedSlippageBps, expected));
  const spread = clamp(finite(spreadPct, 0.5), 0, 1);
  const depth = clamp(finite(depthConfidence, 0.5), 0, 1);
  const completion = clamp(finite(fillCompletionRatio, 1), 0, 1);
  const slippageError = Math.abs(realized - expected);
  const slippagePenalty = clamp(slippageError / Math.max(expected + 8, 8), 0, 1);
  const confidence = clamp(
    0.45 +
      depth * 0.25 +
      completion * 0.2 -
      spread * 0.18 -
      slippagePenalty * 0.3,
    0,
    1
  );
  return {
    score: confidence,
    confidence,
    slippageErrorBps: slippageError,
    status: confidence >= 0.7 ? "high" : confidence >= 0.45 ? "medium" : "low",
    warnings: [
      spread >= 0.85 ? "spread_percentile_high" : null,
      depth < 0.35 ? "depth_confidence_low" : null,
      completion < 0.8 ? "fill_completion_weak" : null,
      slippagePenalty > 0.5 ? "slippage_model_mismatch" : null
    ].filter(Boolean)
  };
}
