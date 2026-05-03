function finiteNumber(value) {
  return Number.isFinite(Number(value));
}

function collectTrades(result = {}) {
  return Array.isArray(result.trades) ? result.trades : [];
}

function hasAnyMetric(source = {}, keys = []) {
  return keys.some((key) => key in source && finiteNumber(source[key]));
}

export function validateBacktestResult({ result = {}, configHash = null, dataHash = null, now = new Date().toISOString() } = {}) {
  const issues = [];
  const trades = collectTrades(result);
  const expectedTradeCount = Number(result.tradeCount ?? trades.length);
  if (!configHash && !result.configHash) issues.push({ code: "missing_config_hash", severity: "warning" });
  if (!dataHash && !result.dataHash) issues.push({ code: "missing_data_hash", severity: "warning" });
  if (Number.isFinite(expectedTradeCount) && expectedTradeCount !== trades.length) issues.push({ code: "trade_count_mismatch", severity: "degraded" });
  for (const key of ["realizedPnl", "maxDrawdownPct", "profitFactor", "winRate", "sharpeLikeScore"]) {
    if (key in result && !finiteNumber(result[key])) issues.push({ code: "nan_metric", field: key, severity: "degraded" });
  }
  if (trades.length > 0) {
    const hasFeeEvidence = hasAnyMetric(result, ["feeDrag", "feeDragPct", "feeBps", "totalFees"]) ||
      trades.some((trade) => hasAnyMetric(trade, ["feeBps", "feePct", "feeDragPct", "entryFee", "exitFee", "feeQuote"]));
    const hasSlippageEvidence = hasAnyMetric(result, ["slippageDrag", "slippageDragPct", "slippageBps"]) ||
      trades.some((trade) => hasAnyMetric(trade, ["slippageBps", "slippagePct", "slippageDragPct", "entrySlippageBps", "exitSlippageBps"]));
    if (!hasFeeEvidence) issues.push({ code: "missing_fee_metrics_warning", severity: "warning" });
    if (!hasSlippageEvidence) issues.push({ code: "missing_slippage_metrics_warning", severity: "warning" });
  }
  if (Math.abs(Number(result.realizedPnl || 0)) > 1e9) issues.push({ code: "impossible_pnl_value", severity: "corrupt" });
  const nowMs = new Date(now).getTime();
  for (const trade of trades) {
    const at = new Date(trade.exitAt || trade.closedAt || trade.entryAt || trade.at || 0).getTime();
    if (Number.isFinite(at) && Number.isFinite(nowMs) && at > nowMs + 60_000) {
      issues.push({ code: "future_trade_timestamp", severity: "degraded", tradeId: trade.id || trade.tradeId || null });
    }
    if (!trade.featureTimestamp && !trade.decisionAt && !trade.signalAt) {
      issues.push({ code: "missing_feature_timestamp_lookahead_warning", severity: "warning", tradeId: trade.id || trade.tradeId || null });
    }
    for (const key of ["pnlPct", "returnPct", "netPnlPct", "feeBps", "slippageBps"]) {
      if (key in trade && !finiteNumber(trade[key])) {
        issues.push({ code: "nan_trade_metric", field: key, severity: "degraded", tradeId: trade.id || trade.tradeId || null });
      }
    }
  }
  const severities = new Set(issues.map((item) => item.severity));
  return {
    status: severities.has("corrupt") ? "corrupt" : severities.has("degraded") ? "degraded" : severities.has("warning") ? "warning" : "ok",
    issues,
    tradeCount: trades.length,
    configHash: configHash || result.configHash || null,
    dataHash: dataHash || result.dataHash || null
  };
}
