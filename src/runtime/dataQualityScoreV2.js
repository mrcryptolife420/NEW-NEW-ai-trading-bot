import { scoreDataFreshness } from "./dataFreshnessScore.js";
import { buildDecisionInputLineage } from "./decisionInputLineage.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, finite(value, min)));
}

function timestampMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function validateCandles(candles = []) {
  const issues = [];
  const list = arr(candles);
  if (!list.length) {
    issues.push("candles_missing");
    return { score: 0.25, issues };
  }
  let impossible = 0;
  let zeroVolume = 0;
  let timestampGaps = 0;
  let previousTime = null;
  for (const candle of list) {
    const open = finite(candle.open, Number.NaN);
    const high = finite(candle.high, Number.NaN);
    const low = finite(candle.low, Number.NaN);
    const close = finite(candle.close, Number.NaN);
    const volume = finite(candle.volume, Number.NaN);
    if (![open, high, low, close].every(Number.isFinite) || open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < low || open > high || open < low || close > high || close < low) {
      impossible += 1;
    }
    if (Number.isFinite(volume) && volume <= 0) {
      zeroVolume += 1;
    }
    const time = timestampMs(candle.closeTime || candle.openTime || candle.time || candle.at);
    if (time && previousTime && time - previousTime > 15 * 60_000) {
      timestampGaps += 1;
    }
    if (time) previousTime = time;
  }
  if (impossible) issues.push("impossible_ohlc");
  if (zeroVolume >= Math.max(2, Math.ceil(list.length * 0.4))) issues.push("zero_volume_cluster");
  if (timestampGaps) issues.push("candle_timestamp_gap");
  const penalty = impossible * 0.22 + zeroVolume * 0.03 + timestampGaps * 0.16;
  return { score: clamp(1 - penalty, 0, 1), issues };
}

function validateTicker(ticker = {}, { now = new Date().toISOString(), staleAfterMs = 2 * 60_000 } = {}) {
  const issues = [];
  const price = finite(ticker.price ?? ticker.lastPrice ?? ticker.close, Number.NaN);
  const updatedAt = ticker.updatedAt || ticker.at || ticker.time;
  const age = updatedAt ? Math.max(0, new Date(now).getTime() - new Date(updatedAt).getTime()) : Number.POSITIVE_INFINITY;
  if (!(price > 0)) issues.push("ticker_price_missing");
  if (!Number.isFinite(age)) issues.push("ticker_timestamp_missing");
  if (Number.isFinite(age) && age > staleAfterMs) issues.push("ticker_stale");
  return {
    score: clamp((price > 0 ? 0.6 : 0.15) + (Number.isFinite(age) && age <= staleAfterMs ? 0.4 : 0), 0, 1),
    issues
  };
}

function validateOrderBook(book = {}) {
  const issues = [];
  const bid = finite(book.bid, Number.NaN);
  const ask = finite(book.ask, Number.NaN);
  const spreadBps = finite(book.spreadBps, bid > 0 && ask > 0 ? ((ask - bid) / ((ask + bid) / 2)) * 10_000 : Number.NaN);
  const depthConfidence = finite(book.depthConfidence, Number.NaN);
  if (!(bid > 0) || !(ask > 0) || ask < bid) issues.push("orderbook_invalid_bid_ask");
  if (Number.isFinite(spreadBps) && spreadBps > 80) issues.push("spread_extreme");
  if (Number.isFinite(depthConfidence) && depthConfidence < 0.35) issues.push("depth_confidence_low");
  const score = clamp(
    (issues.includes("orderbook_invalid_bid_ask") ? 0.2 : 0.62) +
      (Number.isFinite(spreadBps) ? Math.max(0, 0.22 - spreadBps / 400) : 0) +
      (Number.isFinite(depthConfidence) ? depthConfidence * 0.16 : 0.06),
    0,
    1
  );
  return { score, issues };
}

function optionalProviderIssues(providers = {}) {
  const warnings = [];
  for (const [provider, value] of Object.entries(providers || {})) {
    if (value == null || value?.status === "missing" || value?.status === "unavailable") {
      warnings.push(`optional_provider_missing:${provider}`);
    }
    if (value?.status === "stale") {
      warnings.push(`optional_provider_stale:${provider}`);
    }
  }
  return warnings;
}

export function buildDataQualityScoreV2({
  symbol = null,
  candles = [],
  ticker = {},
  orderBook = {},
  marketSnapshot = {},
  optionalProviders = {},
  decision = {},
  features = {},
  now = new Date().toISOString(),
  mode = "paper"
} = {}) {
  const candleCheck = validateCandles(candles);
  const tickerCheck = validateTicker(ticker, { now });
  const orderBookCheck = validateOrderBook(orderBook || marketSnapshot.book || {});
  const freshness = scoreDataFreshness({
    now,
    marketUpdatedAt: marketSnapshot.updatedAt || ticker.updatedAt || ticker.at,
    newsUpdatedAt: optionalProviders.news?.updatedAt,
    recorderUpdatedAt: decision.createdAt || decision.at,
    streamUpdatedAt: marketSnapshot.streamUpdatedAt || orderBook.updatedAt
  });
  const lineage = buildDecisionInputLineage({
    decision,
    features,
    marketSnapshot,
    now,
    sourceFreshness: {
      market: marketSnapshot.updatedAt || ticker.updatedAt || ticker.at,
      stream: marketSnapshot.streamUpdatedAt || orderBook.updatedAt,
      recorder: decision.createdAt || decision.at
    }
  });
  const warnings = [
    ...candleCheck.issues,
    ...tickerCheck.issues,
    ...orderBookCheck.issues,
    ...arr(freshness.warnings),
    ...arr(lineage.warnings),
    ...optionalProviderIssues(optionalProviders)
  ];
  const score = clamp(
    candleCheck.score * 0.34 +
      tickerCheck.score * 0.22 +
      orderBookCheck.score * 0.22 +
      freshness.score * 0.14 +
      (lineage.status === "fresh" ? 0.08 : lineage.status === "stale" ? 0.04 : 0.015),
    0,
    1
  );
  const hardIssues = warnings.filter((warning) =>
    ["candles_missing", "impossible_ohlc", "ticker_price_missing", "orderbook_invalid_bid_ask"].includes(warning)
  );
  const status = hardIssues.length || score < 0.45
    ? "unreliable"
    : score < 0.68
      ? "degraded"
      : score < 0.82
        ? "usable"
        : "trusted";
  return {
    symbol,
    status,
    dataQualityScore: Number(score.toFixed(4)),
    reasons: [...new Set(warnings)],
    staleSources: arr(freshness.staleSources),
    componentScores: {
      candles: Number(candleCheck.score.toFixed(4)),
      ticker: Number(tickerCheck.score.toFixed(4)),
      orderBook: Number(orderBookCheck.score.toFixed(4)),
      freshness: freshness.score,
      lineage: lineage.status === "fresh" ? 1 : lineage.status === "stale" ? 0.5 : 0.2
    },
    learningEvidenceEligible: mode === "paper" && status !== "unreliable" && !hardIssues.length,
    liveSafetyImpact: "negative_only",
    diagnosticsOnly: true
  };
}

export function attachDataQualityToCandidate(candidate = {}, quality = {}) {
  return {
    ...candidate,
    dataQualityScore: finite(quality.dataQualityScore, 0),
    dataQuality: {
      status: quality.status || "unknown",
      score: finite(quality.dataQualityScore, 0),
      reasons: arr(quality.reasons),
      staleSources: arr(quality.staleSources),
      learningEvidenceEligible: Boolean(quality.learningEvidenceEligible),
      liveSafetyImpact: quality.liveSafetyImpact || "negative_only"
    }
  };
}

export function summarizeDataQualityScores(items = []) {
  const list = arr(items);
  const counts = { trusted: 0, usable: 0, degraded: 0, unreliable: 0, unknown: 0 };
  const reasons = {};
  for (const item of list) {
    const status = ["trusted", "usable", "degraded", "unreliable"].includes(item?.status) ? item.status : "unknown";
    counts[status] += 1;
    for (const reason of arr(item?.reasons)) {
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
  }
  return {
    status: counts.unreliable ? "unreliable" : counts.degraded ? "degraded" : list.length ? "ready" : "empty",
    count: list.length,
    counts,
    topReasons: Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    diagnosticsOnly: true,
    liveSafetyImpact: "negative_only"
  };
}

export const DATA_QUALITY_SCORE_V2_VERSION = 1;
