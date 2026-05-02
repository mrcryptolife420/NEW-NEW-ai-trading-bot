function hasReason(source = {}, pattern) {
  const reasons = [
    ...(Array.isArray(source.reasons) ? source.reasons : []),
    ...(Array.isArray(source.blockerReasons) ? source.blockerReasons : [])
  ].map((item) => `${item}`.toLowerCase());
  return reasons.some((reason) => reason.includes(pattern));
}

function result(mode, severity, confidence, evidence, recommendedReviewAction) {
  return {
    failureMode: mode,
    severity,
    confidence,
    evidence,
    recommendedReviewAction
  };
}

export function classifyFailureMode({
  decision = {},
  trade = {},
  exitQuality = {},
  vetoOutcome = {},
  reconcileSummary = {}
} = {}) {
  if (reconcileSummary.manualReviewRequired || hasReason(decision, "reconcile")) {
    return result("reconcile_uncertainty", "high", 0.85, { reconcileSummary }, "Resolve exchange/runtime truth before reviewing alpha.");
  }
  if (vetoOutcome.label === "bad_veto") {
    return result("bad_veto", "medium", vetoOutcome.confidence || 0.75, { vetoOutcome }, "Review blocker family and scoped bad-veto evidence.");
  }
  if (exitQuality.label === "early_exit") {
    return result("early_exit", "medium", exitQuality.confidence || 0.65, { exitQuality }, "Review exit target/trailing rules for premature profit capture.");
  }
  if (exitQuality.label === "execution_drag_exit" || trade.executionDragBps >= 20) {
    return result("execution_drag", "medium", 0.75, { executionDragBps: trade.executionDragBps || null }, "Review order style, spread/slippage and symbol execution pain.");
  }
  if (hasReason(decision, "late") || trade.entryLate || trade.chaseScore >= 0.75) {
    return result("late_entry", "medium", 0.7, { chaseScore: trade.chaseScore || decision.chaseScore || null }, "Review entry timing and chase filters.");
  }
  if (hasReason(decision, "crowded") || decision.falseBreakoutRisk >= 0.7) {
    return result("crowded_breakout", "medium", 0.72, { falseBreakoutRisk: decision.falseBreakoutRisk || null }, "Review breakout crowding, CVD and retest quality.");
  }
  if (hasReason(decision, "news") || trade.newsRiskMissed) {
    return result("news_blindspot", "medium", 0.68, { newsRiskMissed: Boolean(trade.newsRiskMissed) }, "Review event/news source coverage for this symbol/session.");
  }
  if (hasReason(decision, "quality") || decision.dataQualityScore < 0.45) {
    return result("quality_trap", "low", 0.62, { dataQualityScore: decision.dataQualityScore ?? null }, "Review feature freshness and data-provider quality before trusting similar setups.");
  }
  return result("unknown", "low", 0.25, {}, "Collect more evidence before changing policy.");
}
