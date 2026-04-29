function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function classifyTradeAutopsy(trade = {}) {
  const netPnlPct = safeNumber(trade.netPnlPct, 0);
  const mfePct = safeNumber(trade.mfePct, 0);
  const maePct = safeNumber(trade.maePct, 0);
  const captureEfficiency = safeNumber(trade.captureEfficiency, mfePct > 0 ? Math.max(0, netPnlPct) / Math.max(mfePct, 1e-9) : 0);
  const executionQualityScore = safeNumber(trade.executionQualityScore ?? trade.entryExecutionAttribution?.executionQualityScore, 0.7);
  const exitReason = `${trade.reason || trade.exitReason || ""}`.toLowerCase();
  const labels = new Set(Array.isArray(trade.reviewLabels) ? trade.reviewLabels : []);
  const causes = [];
  if (labels.has("bad_entry")) causes.push("bad_entry");
  if (labels.has("bad_exit")) causes.push("bad_exit");
  if (labels.has("execution_drag")) causes.push("execution_drag");
  if (executionQualityScore < 0.42 && netPnlPct <= 0) causes.push("execution_drag");
  if (mfePct >= 0.015 && netPnlPct < 0) causes.push("late_exit");
  if (netPnlPct >= 0 && mfePct >= 0.018 && captureEfficiency < 0.32) causes.push("premature_exit");
  if (mfePct < 0.004 && maePct <= -0.012 && netPnlPct < 0) causes.push("bad_entry");
  if (exitReason.includes("regime") || exitReason.includes("invalid")) causes.push("strategy_invalidated");
  if (trade.dataQuality?.stale || trade.recordQuality?.score < 0.45) causes.push("data_quality_failure");
  if (trade.positionSizePct > 0.2 && netPnlPct < 0) causes.push("risk_sizing_failure");
  const uniqueCauses = [...new Set(causes)];
  const classification = netPnlPct > 0 && !uniqueCauses.length
    ? "good_trade"
    : uniqueCauses[0] || "bad_entry";
  return {
    classification,
    primaryCause: classification === "good_trade" ? null : classification,
    causes: uniqueCauses,
    warnings: netPnlPct > 0 && captureEfficiency < 0.35 ? ["low_capture_efficiency"] : [],
    suggestedAction: classification === "good_trade"
      ? "keep_observing"
      : classification === "execution_drag"
        ? "review_execution_quality"
        : classification === "late_exit" || classification === "premature_exit"
          ? "review_exit_policy"
          : classification === "data_quality_failure"
            ? "review_data_sources"
            : "review_entry_filter"
  };
}

export function summarizeTradeAutopsies(trades = [], limit = 8) {
  const closed = (Array.isArray(trades) ? trades : []).filter((trade) => trade.exitAt || trade.closedAt);
  const annotated = closed.map((trade) => ({ trade, autopsy: classifyTradeAutopsy(trade) }));
  const lossCauses = new Map();
  for (const item of annotated) {
    if (safeNumber(item.trade.netPnlPct, 0) >= 0) continue;
    const key = item.autopsy.classification;
    lossCauses.set(key, (lossCauses.get(key) || 0) + 1);
  }
  const dominantLossCause = [...lossCauses.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
  return {
    worstRecentTrades: annotated
      .sort((left, right) => safeNumber(left.trade.netPnlPct, 0) - safeNumber(right.trade.netPnlPct, 0))
      .slice(0, limit)
      .map((item) => ({
        id: item.trade.id || null,
        symbol: item.trade.symbol || null,
        netPnlPct: safeNumber(item.trade.netPnlPct, 0),
        classification: item.autopsy.classification,
        suggestedAction: item.autopsy.suggestedAction
      })),
    dominantLossCause,
    repeatedStrategyFailurePattern: dominantLossCause && (lossCauses.get(dominantLossCause) || 0) >= 3
      ? dominantLossCause
      : null
  };
}
