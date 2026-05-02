function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function buildRegimeOutcomeLabel({ entryRegime = null, marketPath = {}, trade = {} } = {}) {
  const favorable = finite(marketPath.maxFavorableMovePct, 0);
  const adverse = finite(marketPath.maxAdverseMovePct, 0);
  const closeReturn = finite(marketPath.closeReturnPct ?? trade.pnlPct ?? trade.netPnlPct, 0);
  let realizedRegime = "unknown";
  if (marketPath.failedBreakout || (entryRegime === "breakout_release" && closeReturn < 0 && adverse < -0.008)) {
    realizedRegime = "failed_breakout";
  } else if (Math.abs(closeReturn) < 0.004 && Math.max(favorable, Math.abs(adverse)) < 0.01) {
    realizedRegime = "range";
  } else if (closeReturn > 0.004 && favorable >= Math.abs(adverse)) {
    realizedRegime = "trend_up";
  } else if (closeReturn < -0.004 && Math.abs(adverse) > favorable) {
    realizedRegime = "trend_down";
  }
  return {
    predictedRegime: entryRegime || "unknown",
    realizedRegime,
    pnlPct: finite(trade.pnlPct ?? trade.netPnlPct ?? closeReturn, 0),
    win: finite(trade.pnlPct ?? trade.netPnlPct ?? closeReturn, 0) > 0
  };
}

export function updateRegimeConfusionMatrix(existing = {}, sample = {}) {
  const predicted = sample.predictedRegime || "unknown";
  const realized = sample.realizedRegime || "unknown";
  const next = structuredClone(existing || {});
  next[predicted] = next[predicted] || {};
  const cell = next[predicted][realized] || { predictedRegime: predicted, realizedRegime: realized, count: 0, wins: 0, losses: 0, avgPnlPct: 0 };
  const pnl = finite(sample.pnlPct, 0);
  const totalPnl = cell.avgPnlPct * cell.count + pnl;
  cell.count += 1;
  cell.wins += sample.win ? 1 : 0;
  cell.losses += sample.win ? 0 : 1;
  cell.avgPnlPct = totalPnl / cell.count;
  next[predicted][realized] = cell;
  return next;
}
