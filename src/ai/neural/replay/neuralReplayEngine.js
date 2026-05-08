import { asArray, finiteNumber, mean, stableId } from "../utils.js";

function pnlPct(record = {}, policy = {}) {
  const close = finiteNumber(record.exitPrice ?? record.closePrice, 0);
  const entry = finiteNumber(record.entryPrice ?? record.openPrice, 0);
  if (entry <= 0 || close <= 0) return 0;
  const side = `${record.side || "BUY"}`.toUpperCase();
  const raw = side === "SELL" ? (entry - close) / entry : (close - entry) / entry;
  return raw - finiteNumber(policy.feePct, 0) - finiteNumber(policy.slippagePct, 0);
}

export function runNeuralReplay({ records = [], policy = {}, mode = "historical_decision_replay", seed = "default" } = {}) {
  const simulatedTrades = asArray(records).map((record, index) => {
    const netPnlPct = pnlPct(record, policy);
    return {
      replayTradeId: stableId("nr_trade", [seed, index, record.decisionId, record.symbol]),
      sourceId: record.tradeId || record.decisionId || `sample_${index}`,
      symbol: record.symbol || "UNKNOWN",
      mode,
      netPnlPct,
      mfePct: finiteNumber(record.mfePct ?? record.maximumFavorableExcursionPct, Math.max(0, netPnlPct)),
      maePct: finiteNumber(record.maePct ?? record.maximumAdverseExcursionPct, Math.min(0, netPnlPct)),
      slippagePct: finiteNumber(policy.slippagePct ?? record.slippagePct, 0),
      rootCause: record.rootCause || record.rootBlocker || "unknown",
      isRealTrade: false
    };
  });
  const returns = simulatedTrades.map((trade) => trade.netPnlPct);
  const wins = returns.filter((value) => value > 0).length;
  const losses = returns.filter((value) => value < 0);
  const grossWin = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  return {
    replayRunId: stableId("nr_run", [seed, mode, simulatedTrades.length, policy.id]),
    mode,
    simulatedTrades,
    metrics: {
      trades: simulatedTrades.length,
      winRate: simulatedTrades.length ? wins / simulatedTrades.length : 0,
      avgNetPnlPct: mean(returns),
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0,
      maxDrawdownPct: Math.abs(Math.min(0, ...returns)),
      finite: returns.every(Number.isFinite)
    },
    liveSafe: {
      usesLiveBroker: false,
      placesOrders: false,
      mutatesPortfolio: false
    }
  };
}
