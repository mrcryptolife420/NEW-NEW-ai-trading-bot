import { classifyHeadlineEvents, enrichNewsItems } from "./eventClassifier.js";

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

function itemTimeMs(item, fallbackMs) {
  const parsed = new Date(item.publishedAt || item.createdAt || item.at || item.timestamp || 0).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function extractSymbols(item = {}, watchlist = []) {
  const direct = arr(item.symbols || item.affectedSymbols).map((symbol) => `${symbol}`.toUpperCase());
  if (direct.length) {
    return direct;
  }
  const text = `${item.title || item.headline || item.text || ""}`.toUpperCase();
  return arr(watchlist).filter((symbol) => text.includes(`${symbol}`.toUpperCase().replace("USDT", "")));
}

function classifyLevel(score) {
  if (score >= 0.82) return "critical";
  if (score >= 0.58) return "elevated";
  if (score >= 0.28) return "watch";
  return "none";
}

export function buildNewsShockCircuitBreaker({
  items = [],
  watchlist = [],
  now = new Date().toISOString(),
  providerStatus = "ok",
  config = {}
} = {}) {
  const nowMs = new Date(now).getTime();
  const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const lookbackMinutes = Math.max(1, num(config.newsShockLookbackMinutes, 90));
  const maxAgeMs = lookbackMinutes * 60_000;
  const staleProvider = ["stale", "degraded", "offline", "missing"].includes(`${providerStatus || ""}`.toLowerCase());
  const rawItems = arr(items);
  const enriched = enrichNewsItems(rawItems, { filterLowQuality: false, strictWhitelist: false })
    .map((item) => ({
      ...item,
      event: item.event || classifyHeadlineEvents(item),
      ageMs: effectiveNowMs - itemTimeMs(item, effectiveNowMs)
    }));
  const freshItems = enriched.filter((item) => item.ageMs <= maxAgeMs && item.ageMs >= -60_000);
  const warnings = [];
  if (!rawItems.length) warnings.push("missing_news_provider_data");
  if (staleProvider) warnings.push("stale_news_provider");
  const counts = {};
  const affected = new Set();
  let maxSeverity = 0;
  let cumulativeRisk = 0;
  let highestHalfLifeHours = 1;
  let criticalTypeSeen = false;
  for (const item of freshItems) {
    const type = item.event?.dominantType || "general";
    counts[type] = (counts[type] || 0) + 1;
    maxSeverity = Math.max(maxSeverity, num(item.event?.severity, 0));
    cumulativeRisk += num(item.event?.eventRisk, 0) * clamp(item.reliability?.reliabilityScore ?? item.event?.sourceQuality, 0.35, 1);
    highestHalfLifeHours = Math.max(highestHalfLifeHours, num(item.event?.halfLifeHours, 1));
    if (["hack", "delisting", "regulation", "maintenance"].includes(type) && num(item.event?.severity, 0) >= 0.75) {
      criticalTypeSeen = true;
    }
    for (const symbol of extractSymbols(item, watchlist)) {
      affected.add(symbol);
    }
  }
  const headlineVelocity = freshItems.length / lookbackMinutes;
  const velocityRisk = clamp(headlineVelocity / Math.max(0.02, num(config.newsShockHeadlineVelocityPerMinute, 0.08)), 0, 1);
  const averageRisk = freshItems.length ? cumulativeRisk / freshItems.length : 0;
  const shockScore = clamp(
    maxSeverity * 0.45 +
      averageRisk * 0.3 +
      velocityRisk * 0.18 +
      (staleProvider ? 0.12 : 0) +
      (criticalTypeSeen ? 0.18 : 0),
    0,
    1
  );
  const shockLevel = classifyLevel(shockScore);
  const entryPenalty = shockLevel === "critical"
    ? 1
    : shockLevel === "elevated"
      ? 0.45
      : shockLevel === "watch"
        ? 0.18
        : 0;
  const expiryMs = effectiveNowMs + highestHalfLifeHours * 3_600_000;
  const manualReviewRecommended = shockLevel === "critical" || (shockLevel === "elevated" && criticalTypeSeen);

  return {
    shockLevel,
    shockScore: finite(shockScore),
    affectedSymbols: [...affected],
    entryPenalty: finite(entryPenalty, 3),
    manualReviewRecommended,
    expiryAt: new Date(expiryMs).toISOString(),
    headlineVelocity: finite(headlineVelocity, 4),
    dominantEventType: Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] || "general",
    eventCounts: counts,
    warnings,
    evidence: freshItems.slice(0, 8).map((item) => ({
      title: item.title || item.headline || null,
      source: item.source || item.provider || "unknown",
      dominantType: item.event?.dominantType || "general",
      severity: finite(item.event?.severity || 0),
      risk: finite(item.event?.eventRisk || 0),
      ageMinutes: finite(item.ageMs / 60_000, 1)
    })),
    fallbackSafe: true,
    liveBehaviorChanged: false,
    diagnosticsOnly: !Boolean(config.enableNewsShockEntryBlock)
  };
}
