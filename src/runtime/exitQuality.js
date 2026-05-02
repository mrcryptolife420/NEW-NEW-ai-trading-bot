function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function lower(value) {
  return `${value || ""}`.toLowerCase();
}

export function labelExitQuality({ position = {}, trade = {}, marketAfterExit = {}, thesis = {} } = {}) {
  const pnlPct = finite(trade.pnlPct ?? trade.netPnlPct ?? trade.realizedPnlPct, 0);
  const mfePct = finite(trade.maximumFavorableExcursionPct ?? trade.mfePct ?? position.maximumFavorableExcursionPct, 0);
  const maePct = finite(trade.maximumAdverseExcursionPct ?? trade.maePct ?? position.maximumAdverseExcursionPct, 0);
  const capture = finite(trade.exitEfficiencyPct ?? trade.captureEfficiency, null);
  const executionPain = finite(trade.executionPainScore ?? trade.executionQuality?.painScore ?? marketAfterExit.executionPainScore, 0);
  const reason = lower(trade.exitReason || trade.reason || position.exitReason);
  const reasons = [];
  let label = "unknown_exit_quality";
  let confidence = 0.4;

  if (reason.includes("reconcile") || reason.includes("manual_review")) {
    label = "forced_reconcile_exit";
    reasons.push("exit was forced by reconcile/manual review");
    confidence = 0.85;
  } else if (reason.includes("news") || marketAfterExit.newsRiskScore >= 0.7) {
    label = "news_risk_exit";
    reasons.push("news/event risk dominated exit context");
    confidence = 0.75;
  } else if (executionPain >= 0.7 || trade.executionDragBps >= 20) {
    label = "execution_drag_exit";
    reasons.push("execution drag dominated exit quality");
    confidence = 0.75;
  } else if (reason.includes("trailing") && pnlPct > 0 && (capture == null || capture >= 0.45)) {
    label = "trailing_stop_good";
    reasons.push("trailing stop retained a meaningful share of favorable excursion");
    confidence = 0.78;
  } else if (reason.includes("stop") && maePct <= Math.abs(pnlPct) * 0.75 && mfePct > Math.abs(pnlPct)) {
    label = "stop_too_tight";
    reasons.push("stop exited before adverse path expanded");
    confidence = 0.72;
  } else if ((reason.includes("take") || reason.includes("target")) && mfePct > Math.max(0.01, pnlPct * 1.8)) {
    label = "take_profit_too_close";
    reasons.push("take-profit captured too little of later favorable path");
    confidence = 0.72;
  } else if (mfePct > 0.01 && pnlPct <= 0) {
    label = "late_exit";
    reasons.push("trade gave back a favorable excursion and closed flat/loss");
    confidence = 0.8;
  } else if (pnlPct > 0 && mfePct > pnlPct * 2 && (capture == null || capture < 0.45)) {
    label = "early_exit";
    reasons.push("positive exit captured low share of available favorable path");
    confidence = 0.65;
  } else if (pnlPct > 0 && (capture == null || capture >= 0.45)) {
    label = "good_exit";
    reasons.push("exit captured favorable path with positive net result");
    confidence = 0.72;
  }

  if (thesis.doNotAverageDown === false) {
    reasons.push("thesis allowed averaging down; review risk discipline");
  }
  return { label, confidence, reasons };
}
