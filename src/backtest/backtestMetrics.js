import { average } from "../utils/math.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildBacktestQualityMetrics(trades = []) {
  const records = arr(trades);
  if (!records.length) {
    return {
      expectancy: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      averageR: 0,
      winRate: 0,
      payoffRatio: 0,
      feeDrag: 0,
      slippageDrag: 0,
      sampleSizeWarning: true,
      tradeCount: 0
    };
  }
  const returns = records.map((trade) => num(trade.returnPct ?? trade.pnlPct ?? trade.netPnlPct));
  const exposureMinutes = records.reduce((total, trade) => {
    const entry = new Date(trade.entryAt || trade.openedAt || trade.at || 0).getTime();
    const exit = new Date(trade.exitAt || trade.closedAt || trade.updatedAt || 0).getTime();
    return total + (Number.isFinite(entry) && Number.isFinite(exit) && exit > entry ? (exit - entry) / 60000 : 0);
  }, 0);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const grossWin = wins.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(losses.reduce((total, value) => total + value, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const avgWin = average(wins, 0);
  const avgLoss = Math.abs(average(losses, 0));
  return {
    expectancy: average(returns, 0),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : 0,
    maxDrawdown,
    averageR: average(records.map((trade) => num(trade.rMultiple ?? trade.r ?? trade.returnR)), 0),
    winRate: wins.length / records.length,
    payoffRatio: avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? avgWin : 0,
    feeDrag: average(records.map((trade) => Math.abs(num(trade.feePct ?? trade.feeDragPct ?? trade.feeBps) / (trade.feeBps ? 10000 : 1))), 0),
    slippageDrag: average(records.map((trade) => Math.abs(num(trade.slippagePct ?? trade.slippageDragPct ?? trade.slippageBps) / (trade.slippageBps ? 10000 : 1))), 0),
    exposureTime: exposureMinutes,
    exposureTimeHours: exposureMinutes / 60,
    sampleSizeWarning: records.length < 30,
    tradeCount: records.length
  };
}
