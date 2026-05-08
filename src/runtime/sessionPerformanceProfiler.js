function sessionFor(dateLike) {
  const hour = new Date(dateLike || Date.now()).getUTCHours();
  if (hour >= 0 && hour < 7) return "asia";
  if (hour >= 7 && hour < 13) return "europe";
  if (hour >= 13 && hour < 22) return "us";
  return "low_liquidity";
}

export function buildSessionPerformanceProfile({ trades = [], minTrades = 3 } = {}) {
  const bySession = {};
  for (const trade of trades) {
    const session = trade.session || sessionFor(trade.openedAt || trade.closedAt);
    const bucket = bySession[session] || { trades: 0, wins: 0, pnl: 0, slippageBps: 0, spreadBps: 0 };
    bucket.trades += 1;
    bucket.wins += Number(trade.netPnlPct || trade.pnlPct || 0) > 0 ? 1 : 0;
    bucket.pnl += Number(trade.netPnlPct || trade.pnlPct || 0) || 0;
    bucket.slippageBps += Number(trade.slippageBps) || 0;
    bucket.spreadBps += Number(trade.spreadBps) || 0;
    bySession[session] = bucket;
  }
  const sessions = Object.fromEntries(Object.entries(bySession).map(([session, bucket]) => {
    const avgPnl = bucket.pnl / Math.max(1, bucket.trades);
    return [session, {
      ...bucket,
      winRate: bucket.wins / Math.max(1, bucket.trades),
      avgPnlPct: avgPnl,
      avgSlippageBps: bucket.slippageBps / Math.max(1, bucket.trades),
      avgSpreadBps: bucket.spreadBps / Math.max(1, bucket.trades),
      riskMultiplier: bucket.trades < minTrades ? 1 : avgPnl < 0 ? 0.5 : 1
    }];
  }));
  return { sessions, heatmap: sessions, blocksLivePromotion: Object.values(sessions).some((s) => s.trades >= minTrades && s.avgPnlPct < -0.01) };
}
