import { BinanceClient } from "../binance/client.js";
import { loadHistoricalCandles } from "./marketHistory.js";
import { runBacktest } from "./backtestRunner.js";

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
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseOptionArgs(args = []) {
  const options = {};
  for (const arg of args || []) {
    const value = `${arg || ""}`.trim();
    if (!value.startsWith("--")) {
      continue;
    }
    const [key, raw] = value.slice(2).split("=");
    options[key] = raw === undefined ? true : raw;
  }
  return options;
}

function resolveTradeTime(trade = {}) {
  const ms = new Date(trade.exitAt || trade.closedAt || trade.entryAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function scoreTrades(trades = []) {
  const returns = trades.map((trade) => safeNumber(trade.netPnlPct ?? trade.pnlPct)).filter(Number.isFinite);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const avgWin = average(wins, 0);
  const avgLoss = Math.abs(average(losses, 0));
  const expectancy = average(returns, 0);
  const profitFactor = losses.length
    ? wins.reduce((total, value) => total + value, 0) / Math.abs(losses.reduce((total, value) => total + value, 0))
    : wins.length ? 99 : 0;
  return {
    sampleSize: trades.length,
    winRate: num(returns.length ? wins.length / returns.length : 0),
    avgWinPct: num(avgWin),
    avgLossPct: num(avgLoss),
    expectancyPct: num(expectancy),
    profitFactor: num(profitFactor)
  };
}

function buildMaxDrawdownPct(equitySnapshots = []) {
  let highWater = 0;
  let maxDrawdown = 0;
  for (const snapshot of equitySnapshots || []) {
    const equity = safeNumber(snapshot?.equity, 0);
    highWater = Math.max(highWater, equity);
    if (highWater > 0) {
      maxDrawdown = Math.max(maxDrawdown, (highWater - equity) / highWater);
    }
  }
  return num(maxDrawdown);
}

function buildSharpeLikeScore(trades = []) {
  const returns = trades.map((trade) => safeNumber(trade.netPnlPct ?? trade.pnlPct)).filter(Number.isFinite);
  if (returns.length < 2) {
    return 0;
  }
  const mean = average(returns, 0);
  const variance = average(returns.map((value) => (value - mean) ** 2), 0);
  const deviation = Math.sqrt(Math.max(variance, 0));
  return deviation > 0 ? num(mean / deviation) : 0;
}

function resolveStrategyFamily(trade = {}) {
  return trade.strategyDecision?.family ||
    trade.entryRationale?.strategy?.family ||
    trade.strategyAtEntry?.family ||
    trade.strategyFamily ||
    "unknown";
}

function resolveRegime(trade = {}) {
  return trade.regimeAtEntry || trade.entryRationale?.regime?.regime || "unknown";
}

function buildBreakdown(trades = [], keyFn) {
  const groups = new Map();
  for (const trade of trades || []) {
    const key = keyFn(trade) || "unknown";
    const list = groups.get(key) || [];
    list.push(trade);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, groupTrades]) => ({
      id: key,
      trades: groupTrades.length,
      winRate: scoreTrades(groupTrades).winRate,
      avgReturn: scoreTrades(groupTrades).expectancyPct,
      profitFactor: scoreTrades(groupTrades).profitFactor
    }))
    .sort((left, right) => right.trades - left.trades || `${left.id}`.localeCompare(`${right.id}`));
}

export function buildWalkForwardStudy({ trades = [], trainSize = 40, testSize = 20, stepSize = testSize } = {}) {
  const sorted = arr(trades)
    .filter((trade) => Number.isFinite(new Date(trade.exitAt || trade.closedAt || trade.entryAt || 0).getTime()))
    .sort((left, right) => new Date(left.exitAt || left.closedAt || left.entryAt).getTime() - new Date(right.exitAt || right.closedAt || right.entryAt).getTime());
  const windows = [];
  for (let start = 0; start + trainSize + testSize <= sorted.length; start += Math.max(1, stepSize)) {
    const train = sorted.slice(start, start + trainSize);
    const test = sorted.slice(start + trainSize, start + trainSize + testSize);
    const trainScore = scoreTrades(train);
    const testScore = scoreTrades(test);
    windows.push({
      index: windows.length,
      train,
      test,
      trainScore,
      testScore,
      degradationPct: num(trainScore.expectancyPct - testScore.expectancyPct)
    });
  }
  return {
    status: windows.length ? "ready" : "insufficient_sample",
    trainSize,
    testSize,
    windowCount: windows.length,
    averageTestExpectancyPct: num(average(windows.map((window) => window.testScore.expectancyPct), 0)),
    averageDegradationPct: num(average(windows.map((window) => window.degradationPct), 0)),
    windows
  };
}

export function buildWalkForwardWindowsFromCandles({
  candles = [],
  trainCandles = 240,
  validationCandles = 120,
  testCandles = 120,
  stepCandles = testCandles
} = {}) {
  const series = arr(candles);
  const train = parsePositiveInt(trainCandles, 240);
  const validation = parsePositiveInt(validationCandles, 120);
  const test = parsePositiveInt(testCandles, 120);
  const step = parsePositiveInt(stepCandles, test);
  const windowSize = train + validation + test;
  const windows = [];
  for (let start = 0; start + windowSize <= series.length; start += step) {
    const trainStart = start;
    const validationStart = trainStart + train;
    const testStart = validationStart + validation;
    const end = testStart + test;
    windows.push({
      index: windows.length,
      train: {
        startIndex: trainStart,
        endIndex: validationStart - 1,
        candles: series.slice(trainStart, validationStart)
      },
      validation: {
        startIndex: validationStart,
        endIndex: testStart - 1,
        candles: series.slice(validationStart, testStart)
      },
      test: {
        startIndex: testStart,
        endIndex: end - 1,
        candles: series.slice(testStart, end)
      }
    });
  }
  return {
    status: windows.length ? "ready" : "insufficient_history",
    trainCandles: train,
    validationCandles: validation,
    testCandles: test,
    stepCandles: step,
    totalCandles: series.length,
    requiredCandles: windowSize,
    windowCount: windows.length,
    windows
  };
}

export function summarizeWalkForwardBacktestStage({ result = {}, stage = "test", candles = [] } = {}) {
  const artifacts = result.artifacts || {};
  const trades = arr(artifacts.trades);
  const equitySnapshots = arr(artifacts.equitySnapshots);
  const score = scoreTrades(trades);
  return {
    stage,
    status: trades.length ? "traded" : "no_trades",
    candleCount: candles.length || artifacts.candleCount || 0,
    trades: trades.length,
    winRate: score.winRate,
    avgReturn: score.expectancyPct,
    maxDrawdown: buildMaxDrawdownPct(equitySnapshots),
    profitFactor: score.profitFactor,
    sharpeLikeScore: buildSharpeLikeScore(trades),
    regimeBreakdown: buildBreakdown(trades, resolveRegime),
    strategyFamilyBreakdown: buildBreakdown(trades, resolveStrategyFamily),
    latestTradeAt: trades.length ? new Date(Math.max(...trades.map(resolveTradeTime))).toISOString() : null
  };
}

function summarizeWalkForwardWindows(windows = []) {
  const tests = windows.map((window) => window.test).filter(Boolean);
  return {
    windowCount: windows.length,
    testTradeCount: tests.reduce((total, stage) => total + safeNumber(stage.trades, 0), 0),
    averageTestReturn: num(average(tests.map((stage) => stage.avgReturn), 0)),
    averageTestDrawdown: num(average(tests.map((stage) => stage.maxDrawdown), 0)),
    averageTestSharpeLike: num(average(tests.map((stage) => stage.sharpeLikeScore), 0)),
    profitableTestWindows: tests.filter((stage) => safeNumber(stage.avgReturn, 0) > 0).length
  };
}

export function parseBacktestWalkForwardArgs(args = [], config = {}) {
  const positional = (args || []).filter((arg) => !`${arg || ""}`.startsWith("--"));
  const options = parseOptionArgs(args);
  return {
    symbol: (positional[0] || config.watchlist?.[0] || "BTCUSDT").toUpperCase(),
    interval: `${options.interval || config.klineInterval || "15m"}`,
    trainCandles: parsePositiveInt(options.train, 240),
    validationCandles: parsePositiveInt(options.validation, 120),
    testCandles: parsePositiveInt(options.test, 120),
    stepCandles: parsePositiveInt(options.step, parsePositiveInt(options.test, 120)),
    limit: parsePositiveInt(options.limit, Math.max(config.backtestCandleLimit || 500, 720))
  };
}

export async function runBacktestWalkForward({
  config,
  logger,
  symbol,
  interval = config?.klineInterval || "15m",
  trainCandles = 240,
  validationCandles = 120,
  testCandles = 120,
  stepCandles = testCandles,
  limit = null,
  client = null,
  historyStore = null,
  candles = null
} = {}) {
  const effectiveSymbol = (symbol || config?.watchlist?.[0] || "BTCUSDT").toUpperCase();
  const effectiveClient = client || new BinanceClient({
    apiKey: "",
    apiSecret: "",
    baseUrl: config.binanceApiBaseUrl,
    recvWindow: config.binanceRecvWindow,
    logger
  });
  const windowSize = trainCandles + validationCandles + testCandles;
  const targetCount = Math.max(parsePositiveInt(limit, windowSize), windowSize);
  const candleSeries = candles || await loadHistoricalCandles({
    config,
    logger,
    symbol: effectiveSymbol,
    interval,
    targetCount,
    client: effectiveClient,
    store: historyStore,
    refreshLatest: true
  });
  const split = buildWalkForwardWindowsFromCandles({
    candles: candleSeries,
    trainCandles,
    validationCandles,
    testCandles,
    stepCandles
  });
  if (split.status !== "ready") {
    return {
      symbol: effectiveSymbol,
      interval,
      status: "insufficient_history",
      reason: "not_enough_candles_for_walk_forward_windows",
      ...split,
      windows: []
    };
  }

  const windows = [];
  for (const window of split.windows) {
    const stages = {};
    for (const stageName of ["train", "validation", "test"]) {
      const stage = window[stageName];
      const result = await runBacktest({
        config: { ...config, klineInterval: interval, backtestCandleLimit: stage.candles.length },
        logger,
        symbol: effectiveSymbol,
        client: effectiveClient,
        candles: stage.candles,
        includeArtifacts: true
      });
      stages[stageName] = summarizeWalkForwardBacktestStage({
        result,
        stage: stageName,
        candles: stage.candles
      });
    }
    windows.push({
      index: window.index,
      ranges: {
        train: { startIndex: window.train.startIndex, endIndex: window.train.endIndex },
        validation: { startIndex: window.validation.startIndex, endIndex: window.validation.endIndex },
        test: { startIndex: window.test.startIndex, endIndex: window.test.endIndex }
      },
      ...stages
    });
  }

  return {
    symbol: effectiveSymbol,
    interval,
    status: "ready",
    mode: "walk_forward_backtest",
    trainCandles: split.trainCandles,
    validationCandles: split.validationCandles,
    testCandles: split.testCandles,
    stepCandles: split.stepCandles,
    totalCandles: split.totalCandles,
    windowCount: windows.length,
    summary: summarizeWalkForwardWindows(windows),
    windows
  };
}
