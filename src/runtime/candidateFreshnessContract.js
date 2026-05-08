function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function timestampMs(value) {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoFromMs(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

export function buildCandidateFreshnessContract({ candidate = {}, now = new Date().toISOString(), ttlMs = 5000, maxMarketDataAgeMs = 1500 } = {}) {
  const nowMs = timestampMs(now) ?? Date.now();
  const createdMs = timestampMs(candidate.createdAt || candidate.at || candidate.generatedAt) ?? nowMs;
  const marketUpdatedMs = timestampMs(candidate.marketUpdatedAt || candidate.marketSnapshotAt || candidate.bookUpdatedAt || candidate.tickerUpdatedAt);
  const featureUpdatedMs = timestampMs(candidate.featureUpdatedAt || candidate.featureSnapshotAt || candidate.analysisAt || candidate.createdAt || candidate.at) ?? createdMs;
  const validUntilMs = timestampMs(candidate.validUntil) ?? createdMs + Math.max(1, finite(ttlMs, 5000));
  const marketDataAgeMs = marketUpdatedMs == null
    ? finite(candidate.marketDataAgeMs, nowMs - createdMs)
    : Math.max(0, nowMs - marketUpdatedMs);
  const featureAgeMs = Math.max(0, nowMs - featureUpdatedMs);
  const expired = nowMs > validUntilMs;
  const dataFreshnessStatus = expired
    ? "expired"
    : marketDataAgeMs > Math.max(1, finite(maxMarketDataAgeMs, 1500))
      ? "stale"
      : "fresh";

  return {
    createdAt: isoFromMs(createdMs),
    validUntil: isoFromMs(validUntilMs),
    marketDataAgeMs,
    featureAgeMs,
    dataFreshnessStatus,
    expired,
    fastExecutionEligible: !expired && dataFreshnessStatus === "fresh",
    reason: expired ? "candidate_expired" : dataFreshnessStatus === "stale" ? "market_data_stale" : "fresh_candidate",
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function attachCandidateFreshness(candidate = {}, options = {}) {
  const freshness = buildCandidateFreshnessContract({ candidate, ...options });
  return {
    ...candidate,
    createdAt: candidate.createdAt || freshness.createdAt,
    validUntil: candidate.validUntil || freshness.validUntil,
    marketDataAgeMs: freshness.marketDataAgeMs,
    featureAgeMs: freshness.featureAgeMs,
    dataFreshnessStatus: freshness.dataFreshnessStatus,
    candidateFreshness: freshness
  };
}
