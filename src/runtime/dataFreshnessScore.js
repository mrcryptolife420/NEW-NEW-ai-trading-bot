function ageMs(nowMs, value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.max(0, nowMs - ms) : Number.POSITIVE_INFINITY;
}

export function scoreDataFreshness({
  now = new Date().toISOString(),
  marketUpdatedAt = null,
  newsUpdatedAt = null,
  recorderUpdatedAt = null,
  streamUpdatedAt = null
} = {}) {
  const nowMs = new Date(now).getTime();
  const referenceMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const thresholds = {
    market: 5 * 60_000,
    news: 60 * 60_000,
    recorder: 15 * 60_000,
    stream: 2 * 60_000
  };
  const sources = {
    market: ageMs(referenceMs, marketUpdatedAt),
    news: ageMs(referenceMs, newsUpdatedAt),
    recorder: ageMs(referenceMs, recorderUpdatedAt),
    stream: ageMs(referenceMs, streamUpdatedAt)
  };
  const known = Object.entries(sources).filter(([, age]) => Number.isFinite(age));
  if (!known.length) {
    return { score: 0, status: "unknown", staleSources: [], warnings: ["no_freshness_timestamps"] };
  }
  const staleSources = Object.entries(sources)
    .filter(([source, age]) => Number.isFinite(age) && age > thresholds[source])
    .map(([source]) => source);
  const missingSources = Object.entries(sources)
    .filter(([, age]) => !Number.isFinite(age))
    .map(([source]) => source);
  const scores = Object.entries(sources).map(([source, age]) => {
    if (!Number.isFinite(age)) return 0.35;
    return Math.max(0, Math.min(1, 1 - age / (thresholds[source] * 3)));
  });
  const score = Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(4));
  const status = staleSources.length >= 2
    ? "degraded"
    : staleSources.length
      ? "stale"
      : missingSources.length >= 3
        ? "unknown"
        : "fresh";
  return {
    score,
    status,
    staleSources,
    warnings: [
      ...staleSources.map((source) => `${source}_stale`),
      ...missingSources.map((source) => `${source}_timestamp_missing`)
    ]
  };
}
