function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function buildPromotionDossier({
  scope = {},
  paperStats = {},
  shadowStats = {},
  failureStats = {},
  freshness = {},
  config = {}
} = {}) {
  const paperTrades = Math.max(0, finite(paperStats.tradeCount ?? paperStats.trades, 0));
  const shadowTrades = Math.max(0, finite(shadowStats.tradeCount ?? shadowStats.trades, 0));
  const winRate = finite(paperStats.winRate, 0);
  const avgNetPnl = finite(paperStats.avgNetPnl ?? paperStats.averagePnlPct, 0);
  const maxDrawdown = finite(paperStats.maxDrawdown ?? paperStats.maxDrawdownPct, 0);
  const freshnessScore = finite(freshness.score ?? freshness.freshnessScore, 0);
  const maxFailureSeverity = finite(failureStats.maxSeverityScore ?? failureStats.severityScore, 0);
  const minPaperTrades = Math.max(1, finite(config.promotionDossierMinPaperTrades, 20));
  const blockingReasons = [];
  if (paperTrades < minPaperTrades) blockingReasons.push("insufficient_paper_samples");
  if (freshnessScore < 0.6) blockingReasons.push("low_freshness");
  if (maxFailureSeverity >= 0.7) blockingReasons.push("high_failure_severity");
  if (winRate < 0.52 || avgNetPnl <= 0) blockingReasons.push("weak_paper_edge");

  let status = "not_ready";
  if (!blockingReasons.length && paperTrades >= minPaperTrades * 2 && shadowTrades >= Math.max(5, minPaperTrades / 2) && maxDrawdown > -0.08) {
    status = "canary_candidate";
  } else if (!blockingReasons.length) {
    status = "probation_candidate";
  } else if (
    blockingReasons.every((reason) => reason === "insufficient_paper_samples" || reason === "weak_paper_edge")
    && paperTrades >= Math.max(5, minPaperTrades / 2)
    && maxFailureSeverity < 0.7
    && freshnessScore >= 0.6
  ) {
    status = "watch";
  }

  return {
    scope,
    status,
    paperTrades,
    shadowTrades,
    winRate,
    avgNetPnl,
    maxDrawdown,
    freshnessScore,
    knownFailureModes: failureStats.modes || failureStats.knownFailureModes || [],
    blockingReasons,
    recommendedNextStep: status === "canary_candidate"
      ? "Prepare canary review dossier; do not auto-enable live."
      : status === "probation_candidate"
        ? "Continue paper/shadow probation and collect replay evidence."
        : status === "watch"
          ? "Watch scope and improve evidence quality before promotion review."
          : "Keep paper-only; blockers must clear before promotion review.",
    autoPromotionAllowed: false
  };
}
