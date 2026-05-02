function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function buildVetoObservation(decision = {}) {
  const reasons = Array.isArray(decision.reasons || decision.blockerReasons)
    ? (decision.reasons || decision.blockerReasons)
    : [];
  return {
    id: decision.decisionId || decision.id || null,
    symbol: decision.symbol || null,
    createdAt: decision.createdAt || decision.at || null,
    probability: finite(decision.probability),
    threshold: finite(decision.threshold),
    rootBlocker: decision.rootBlocker || decision.primaryRootBlocker || decision.primaryReason || reasons[0] || null,
    reasons,
    strategy: decision.strategy?.activeStrategy || decision.strategyId || decision.strategy || null,
    referencePrice: finite(decision.referencePrice ?? decision.price ?? decision.marketSnapshot?.price)
  };
}

export function labelVetoOutcome({ observation = {}, futureMarketPath = {} } = {}) {
  const favorable = finite(futureMarketPath.maxFavorableMovePct);
  const adverse = finite(futureMarketPath.maxAdverseMovePct);
  const closeReturn = finite(futureMarketPath.closeReturnPct);
  const horizon = finite(futureMarketPath.horizonMinutes);
  if (favorable == null || adverse == null || closeReturn == null || horizon == null) {
    return {
      label: "unknown_veto",
      confidence: 0.2,
      reasons: ["future_market_path_incomplete"],
      observationId: observation.id || null
    };
  }
  if (adverse <= -0.012 && closeReturn <= -0.004 && Math.abs(adverse) > favorable * 1.2) {
    return {
      label: "good_veto",
      confidence: 0.8,
      reasons: ["blocked setup later moved adversely"],
      observationId: observation.id || null
    };
  }
  if (favorable >= 0.012 && closeReturn >= 0.004 && favorable > Math.abs(adverse) * 1.2) {
    return {
      label: "bad_veto",
      confidence: 0.82,
      reasons: ["blocked setup later produced favorable path"],
      observationId: observation.id || null
    };
  }
  return {
    label: "neutral_veto",
    confidence: 0.55,
    reasons: ["future path was mixed or flat"],
    observationId: observation.id || null
  };
}
