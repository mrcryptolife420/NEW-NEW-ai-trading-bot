import { clamp } from "../utils/math.js";

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

function normalize(value = "") {
  return `${value || ""}`.trim().toLowerCase();
}

export function tradeMatchesExecutionScope(trade = {}, {
  symbol = null,
  session = null,
  regime = null,
  family = null
} = {}) {
  return (!symbol || normalize(trade.symbol) === normalize(symbol)) &&
    (!session || normalize(trade.sessionAtEntry) === normalize(session)) &&
    (!regime || normalize(trade.regimeAtEntry) === normalize(regime)) &&
    (!family || normalize(trade.entryRationale?.strategy?.family || trade.strategyFamily || trade.family) === normalize(family));
}

export function buildExecutionFeedbackDataset({
  journal = {},
  symbol = null,
  session = null,
  regime = null,
  family = null
} = {}) {
  const trades = arr(journal?.trades || [])
    .filter((trade) => tradeMatchesExecutionScope(trade, { symbol, session, regime, family }))
    .slice(-24);
  const fills = trades
    .map((trade) => trade.entryExecutionAttribution || {})
    .filter((item) => item && typeof item === "object");
  const expectedSpreadBps = average(fills.map((item) => safeNumber(item.expectedSpreadBps, Number.NaN)), 0);
  const realizedSpreadBps = average(fills.map((item) => safeNumber(item.realizedSpreadBps, item.expectedSpreadBps, Number.NaN)), expectedSpreadBps);
  const expectedSlippageBps = average(fills.map((item) => safeNumber(item.expectedSlippageBps, Number.NaN)), 0);
  const realizedSlippageBps = average(fills.map((item) => safeNumber(item.realizedSlippageBps, Number.NaN)), 0);
  const slippageDeltaBps = average(fills.map((item) => safeNumber(item.slippageDeltaBps, Number.NaN)), realizedSlippageBps - expectedSlippageBps);
  const fillSpeedMs = average(fills.map((item) => safeNumber(item.fillSpeedMs, item.entryLatencyMs, Number.NaN)), 0);
  const cancelReplaceCount = average(fills.map((item) => safeNumber(item.cancelReplaceCount, Number.NaN)), 0);
  const executionPainScore = clamp(
    Math.max(0, slippageDeltaBps) / 10 * 0.4 +
      Math.max(0, realizedSpreadBps - expectedSpreadBps) / 8 * 0.22 +
      Math.min(1, fillSpeedMs / 2500) * 0.2 +
      Math.min(1, cancelReplaceCount / 3) * 0.18,
    0,
    1
  );
  const executionQualityScore = clamp(1 - executionPainScore, 0, 1);
  const slippagePressure = clamp(
    Math.max(0, slippageDeltaBps) / 12 +
      Math.max(0, realizedSpreadBps - expectedSpreadBps) / 10,
    0,
    1
  );
  const fillReliability = clamp(
    1 - (Math.min(1, fillSpeedMs / 2600) * 0.55 + Math.min(1, cancelReplaceCount / 4) * 0.45),
    0,
    1
  );
  return {
    sampleSize: fills.length,
    expectedSpreadBps: num(expectedSpreadBps, 2),
    realizedSpreadBps: num(realizedSpreadBps, 2),
    expectedSlippageBps: num(expectedSlippageBps, 2),
    realizedSlippageBps: num(realizedSlippageBps, 2),
    slippageDeltaBps: num(slippageDeltaBps, 2),
    fillSpeedMs: num(fillSpeedMs, 1),
    cancelReplaceCount: num(cancelReplaceCount, 2),
    executionPainScore: num(executionPainScore, 4),
    executionQualityScore: num(executionQualityScore, 4),
    slippagePressure: num(slippagePressure, 4),
    fillReliability: num(fillReliability, 4),
    status: fills.length >= 4 ? "ready" : fills.length > 0 ? "warmup" : "unavailable"
  };
}
