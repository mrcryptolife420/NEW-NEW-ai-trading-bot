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
