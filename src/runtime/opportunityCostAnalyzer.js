function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, num(value, min)));
}

function finite(value, digits = 4) {
  return Number(num(value).toFixed(digits));
}

function timestampMs(value, fallback = null) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positionAgeMinutes(position = {}, nowMs) {
  const openedMs = timestampMs(position.entryAt || position.openedAt || position.createdAt, nowMs);
  return Math.max(0, (nowMs - openedMs) / 60_000);
}

function positionPnlPct(position = {}) {
  const direct = position.unrealizedPnlPct ?? position.pnlPct ?? position.netPnlPct;
  if (Number.isFinite(Number(direct))) {
    const parsed = Number(direct);
    return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
  }
  const entry = num(position.entryPrice ?? position.averageEntryPrice, 0);
  const mark = num(position.markPrice ?? position.currentPrice, entry);
  return entry > 0 ? (mark - entry) / entry : 0;
}

function positionNotional(position = {}) {
  const direct = num(position.notional ?? position.entryNotional, 0);
  if (direct > 0) {
    return direct;
  }
  return Math.max(0, num(position.quantity ?? position.qty, 0) * num(position.markPrice ?? position.currentPrice ?? position.entryPrice, 0));
}

function candidateQuality(candidate = {}) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  return clamp(
    source.netExecutableExpectancyScore ??
      source.qualityScore ??
      source.score ??
      source.probability ??
      source.decision?.score,
    0,
    1
  );
}

function analyzePosition({ position, candidates, nowMs, config }) {
  const maxHealthyHoldMinutes = Math.max(1, num(config.opportunityCostMaxHealthyHoldMinutes, 360));
  const staleHoldMinutes = Math.max(maxHealthyHoldMinutes, num(config.opportunityCostStaleHoldMinutes, 720));
  const ageMinutes = positionAgeMinutes(position, nowMs);
  const pnlPct = positionPnlPct(position);
  const mfePct = num(position.maximumFavorableExcursionPct ?? position.mfePct, Math.max(pnlPct, 0));
  const gaveBackPct = Math.max(0, mfePct - pnlPct);
  const notional = positionNotional(position);
  const quality = clamp(position.entryQuality ?? position.qualityScore ?? position.setupQuality ?? 0.5, 0, 1);
  const bestCandidate = arr(candidates)
    .filter((candidate) => (candidate && typeof candidate === "object" ? candidate.symbol : null) !== position.symbol)
    .map((candidate) => {
      const source = candidate && typeof candidate === "object" ? candidate : {};
      return { symbol: source.symbol || "unknown", score: candidateQuality(source), setupType: source.setupType || source.strategy || null };
    })
    .sort((left, right) => right.score - left.score)[0] || null;
  const missedBetterCandidate = Boolean(bestCandidate && bestCandidate.score > quality + num(config.opportunityCostCandidateQualityGap, 0.18));
  const timePressure = clamp(ageMinutes / staleHoldMinutes, 0, 1);
  const stagnationRisk = clamp(
    timePressure * 0.45 +
      (Math.abs(pnlPct) < num(config.opportunityCostFlatPnlThresholdPct, 0.0025) ? 0.22 : 0) +
      (pnlPct < 0 ? 0.18 : 0) +
      clamp(gaveBackPct / Math.max(0.01, num(config.opportunityCostGivebackWarnPct, 0.012)), 0, 0.2),
    0,
    1
  );
  const opportunityCostScore = clamp(
    stagnationRisk +
      (missedBetterCandidate ? 0.22 : 0) +
      clamp(notional / Math.max(1, num(config.opportunityCostLargePositionNotional, 1_000)), 0, 0.12),
    0,
    1
  );
  const recommendedAction = opportunityCostScore >= 0.75
    ? "review_exit_or_trim_under_existing_exit_policy"
    : opportunityCostScore >= 0.45
      ? "monitor_for_exit_intelligence_confirmation"
      : "hold_or_monitor";
  return {
    symbol: position.symbol || "unknown",
    timeInMarketMinutes: finite(ageMinutes, 1),
    pnlPct: finite(pnlPct),
    notional: finite(notional, 2),
    stagnationRisk: finite(stagnationRisk),
    opportunityCostScore: finite(opportunityCostScore),
    capitalEfficiency: finite(clamp(Math.max(0, pnlPct) / Math.max(0.001, ageMinutes / 1_440), 0, 1)),
    missedBetterCandidate,
    bestAlternativeCandidate: bestCandidate,
    recommendedAction,
    forcedExit: false
  };
}

export function buildOpportunityCostAnalysis({
  openPositions = [],
  candidates = [],
  accountEquity = null,
  idleQuote = null,
  now = new Date().toISOString(),
  config = {}
} = {}) {
  const nowMs = timestampMs(now, Date.now());
  const positions = arr(openPositions);
  const analyses = positions.map((position) => analyzePosition({ position, candidates, nowMs, config }));
  const totalNotional = positions.reduce((total, position) => total + positionNotional(position), 0);
  const equity = Math.max(1, num(accountEquity ?? config.accountEquity ?? config.startingCash, totalNotional || 1));
  const idleFraction = clamp(num(idleQuote, 0) / equity, 0, 1);
  const bestCandidateScore = arr(candidates).reduce((best, candidate) => Math.max(best, candidateQuality(candidate)), 0);
  const idleCapitalRisk = positions.length === 0 && bestCandidateScore > num(config.opportunityCostIdleCandidateScore, 0.7)
    ? clamp(bestCandidateScore * 0.65 + idleFraction * 0.25, 0, 1)
    : 0;
  const worstPosition = analyses.reduce(
    (worst, item) => (item.opportunityCostScore > worst.opportunityCostScore ? item : worst),
    { opportunityCostScore: 0, symbol: null }
  );
  const opportunityCostScore = clamp(Math.max(worstPosition.opportunityCostScore, idleCapitalRisk), 0, 1);
  const capitalEfficiency = positions.length
    ? analyses.reduce((total, item) => total + item.capitalEfficiency, 0) / analyses.length
    : clamp(bestCandidateScore > 0 ? 1 - idleCapitalRisk : 0.5, 0, 1);
  const status = opportunityCostScore >= 0.75
    ? "high"
    : opportunityCostScore >= 0.45
      ? "watch"
      : positions.length
        ? "ok"
        : "idle";
  const recommendedAction = status === "high"
    ? "review_capital_reallocation_without_forced_exit"
    : status === "watch"
      ? "watch_stagnant_positions_and_compare_new_candidates"
      : status === "idle"
        ? "wait_for_candidate_or_scan_fresh_universe"
        : "monitor";

  return {
    status,
    timeInMarket: {
      openPositionCount: positions.length,
      averageMinutes: finite(analyses.length ? analyses.reduce((total, item) => total + item.timeInMarketMinutes, 0) / analyses.length : 0, 1),
      maxMinutes: finite(analyses.reduce((max, item) => Math.max(max, item.timeInMarketMinutes), 0), 1)
    },
    stagnationRisk: finite(analyses.reduce((max, item) => Math.max(max, item.stagnationRisk), 0)),
    opportunityCostScore: finite(opportunityCostScore),
    capitalEfficiency: finite(capitalEfficiency),
    idleCapitalRisk: finite(idleCapitalRisk),
    worstPosition: worstPosition.symbol ? worstPosition : null,
    positions: analyses,
    recommendedAction,
    diagnosticsOnly: true,
    forcedExit: false,
    liveBehaviorChanged: false
  };
}
