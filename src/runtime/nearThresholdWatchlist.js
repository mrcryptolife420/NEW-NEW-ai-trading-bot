function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toMs(value, fallback = null) {
  if (value == null) return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function iso(value) {
  return new Date(value).toISOString();
}

function normalizedSymbol(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function distancePct(candidate = {}) {
  const probability = finite(candidate.probability ?? candidate.modelProbability ?? candidate.score, 0);
  const threshold = finite(candidate.threshold ?? candidate.requiredProbability ?? candidate.minProbability, 0);
  if (threshold <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, ((threshold - probability) / threshold) * 100);
}

export function buildNearThresholdWatchlist({
  candidates = [],
  previousWatchlist = [],
  now = new Date().toISOString(),
  ttlMs = 120000,
  closePct = 2,
  watchPct = 5
} = {}) {
  const nowMs = toMs(now, Date.now());
  const bySymbol = new Map();

  for (const previous of Array.isArray(previousWatchlist) ? previousWatchlist : []) {
    const symbol = normalizedSymbol(previous.symbol);
    const expiresMs = toMs(previous.expiresAt, 0);
    if (!symbol || expiresMs < nowMs) continue;
    bySymbol.set(symbol, { ...previous, symbol, expired: false });
  }

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const symbol = normalizedSymbol(candidate.symbol);
    if (!symbol) continue;
    const gapPct = distancePct(candidate);
    if (!Number.isFinite(gapPct) || gapPct > watchPct) continue;
    const band = gapPct <= closePct ? "within_2pct" : "within_5pct";
    bySymbol.set(symbol, {
      symbol,
      candidateId: candidate.id || candidate.candidateId || symbol,
      probability: finite(candidate.probability ?? candidate.modelProbability ?? candidate.score, 0),
      threshold: finite(candidate.threshold ?? candidate.requiredProbability ?? candidate.minProbability, 0),
      thresholdGapPct: gapPct,
      band,
      priority: band === "within_2pct" ? "high" : "medium",
      createdAt: candidate.createdAt || candidate.at || iso(nowMs),
      updatedAt: iso(nowMs),
      expiresAt: iso(nowMs + Math.max(1, finite(ttlMs, 120000))),
      dataFreshnessStatus: candidate.dataFreshnessStatus || "unknown",
      rootBlocker: candidate.rootBlocker || candidate.blockedReason || null,
      diagnosticsOnly: true,
      liveBehaviorChanged: false
    });
  }

  const items = [...bySymbol.values()].sort((left, right) => {
    if (left.thresholdGapPct !== right.thresholdGapPct) return left.thresholdGapPct - right.thresholdGapPct;
    return left.symbol.localeCompare(right.symbol);
  });

  return {
    status: items.length ? "watching" : "empty",
    items,
    within2Pct: items.filter((item) => item.band === "within_2pct").length,
    within5Pct: items.filter((item) => item.band === "within_5pct").length,
    expiresAt: items[0]?.expiresAt || null,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function detectThresholdCross({ previousItem = {}, candidate = {}, now = new Date().toISOString() } = {}) {
  const symbol = normalizedSymbol(candidate.symbol || previousItem.symbol);
  const probability = finite(candidate.probability ?? candidate.modelProbability ?? candidate.score, 0);
  const threshold = finite(candidate.threshold ?? candidate.requiredProbability ?? candidate.minProbability ?? previousItem.threshold, 0);
  const previousProbability = finite(previousItem.probability, 0);
  const crossed = Boolean(symbol && threshold > 0 && previousProbability < threshold && probability >= threshold);
  return {
    crossed,
    symbol,
    candidateId: candidate.id || candidate.candidateId || previousItem.candidateId || symbol || null,
    probability,
    threshold,
    crossedAt: crossed ? iso(toMs(now, Date.now())) : null,
    eventType: crossed ? "threshold_crossed" : "threshold_not_crossed",
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function buildFastQueueTriggerFromCross({ cross = {}, ttlMs = 5000 } = {}) {
  if (!cross?.crossed || !cross.symbol) {
    return {
      shouldQueue: false,
      blockedReason: "threshold_not_crossed",
      queueItem: null,
      diagnosticsOnly: true,
      liveBehaviorChanged: false
    };
  }
  return {
    shouldQueue: true,
    blockedReason: null,
    queueItem: {
      symbol: cross.symbol,
      candidateId: cross.candidateId,
      source: "near_threshold_cross",
      ttlMs: Math.max(1, finite(ttlMs, 5000)),
      requiredChecks: ["fresh_market_data", "candidate_freshness", "risk_verdict", "exchange_safety", "execution_budget"]
    },
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
