function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function rollingCorrelation(left = [], right = []) {
  const len = Math.min(left.length, right.length);
  if (len < 2) return 0;
  const a = left.slice(-len).map((v) => finite(v));
  const b = right.slice(-len).map((v) => finite(v));
  const ma = a.reduce((s, v) => s + v, 0) / len;
  const mb = b.reduce((s, v) => s + v, 0) / len;
  let cov = 0; let va = 0; let vb = 0;
  for (let i = 0; i < len; i += 1) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

export function buildCorrelationRiskSummary({ openPositions = [], candidate = {}, correlations = {}, threshold = 0.82 } = {}) {
  const sameSymbol = openPositions.some((position) => position.symbol === candidate.symbol);
  const related = openPositions.filter((position) => {
    const key = [position.symbol, candidate.symbol].sort().join(":");
    return finite(correlations[key], 0) >= threshold || position.cluster === candidate.cluster;
  });
  const risk = sameSymbol ? "blocked" : related.length >= 3 ? "high" : related.length ? "medium" : "low";
  return {
    sameSymbolBlocked: sameSymbol,
    correlatedPositionCount: related.length,
    btcBetaExposure: openPositions.reduce((sum, position) => sum + finite(position.btcBeta, 0) * finite(position.notionalPct, 0), 0),
    crowdingRisk: risk,
    sizeMultiplier: risk === "blocked" ? 0 : risk === "high" ? 0.35 : risk === "medium" ? 0.65 : 1,
    reasons: sameSymbol ? ["duplicate_symbol"] : related.length ? ["high_correlation_or_cluster_overlap"] : []
  };
}
