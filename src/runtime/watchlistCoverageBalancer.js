function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finite(value, digits = 4) {
  return Number(num(value, 0).toFixed(digits));
}

function text(value, fallback = "unknown") {
  const result = `${value ?? ""}`.trim();
  return result || fallback;
}

function normalizeSymbol(value) {
  return text(value, "").toUpperCase();
}

function symbolFrom(sample = {}) {
  return normalizeSymbol(sample.symbol || sample.pair || sample.market);
}

function healthFor(symbol, health = {}) {
  const direct = health[symbol] || health[`${symbol}`.toUpperCase()] || {};
  const dataQualityScore = num(direct.dataQualityScore ?? direct.qualityScore ?? direct.score, 1);
  const stale = direct.stale === true || arr(direct.staleSources).length > 0 || direct.status === "stale";
  const lifecycleRisk = text(direct.lifecycleRisk || direct.risk || direct.status, "healthy").toLowerCase();
  return {
    dataQualityScore,
    stale,
    lifecycleRisk,
    trusted: dataQualityScore >= 0.55 && !stale && !["blocked", "danger", "delisting", "halted"].includes(lifecycleRisk)
  };
}

function increment(map, key, sample) {
  const normalized = text(key, "unknown");
  const item = map.get(normalized) || {
    key: normalized,
    sampleCount: 0,
    symbols: new Set()
  };
  item.sampleCount += 1;
  const symbol = symbolFrom(sample);
  if (symbol) item.symbols.add(symbol);
  map.set(normalized, item);
}

function flattenGroup(map) {
  return [...map.values()]
    .map((item) => ({
      key: item.key,
      sampleCount: item.sampleCount,
      symbols: [...item.symbols].sort()
    }))
    .sort((left, right) => right.sampleCount - left.sampleCount || left.key.localeCompare(right.key));
}

export function buildWatchlistCoverageBalancer({
  watchlist = [],
  samples = [],
  symbolHealth = {},
  targetSamplesPerSymbol = 10,
  oversampleMultiplier = 2,
  botMode = "paper"
} = {}) {
  const symbols = arr(watchlist).map(normalizeSymbol).filter(Boolean);
  const uniqueSymbols = [...new Set(symbols)];
  const usableSamples = arr(samples).filter((sample) => symbolFrom(sample));
  const symbolStats = new Map(uniqueSymbols.map((symbol) => [symbol, {
    symbol,
    sampleCount: 0,
    clusterCounts: {},
    regimeCounts: {},
    familyCounts: {},
    trustedForPaperLearning: true,
    reasons: []
  }]));
  const clusterMap = new Map();
  const regimeMap = new Map();
  const familyMap = new Map();

  for (const sample of usableSamples) {
    const symbol = symbolFrom(sample);
    const stats = symbolStats.get(symbol) || {
      symbol,
      sampleCount: 0,
      clusterCounts: {},
      regimeCounts: {},
      familyCounts: {},
      trustedForPaperLearning: true,
      reasons: []
    };
    stats.sampleCount += 1;
    const cluster = text(sample.cluster || sample.symbolCluster || "unknown_cluster");
    const regime = text(sample.regime || sample.marketRegime || "unknown_regime");
    const family = text(sample.strategyFamily || sample.family || sample.strategy?.family || "unknown_family");
    stats.clusterCounts[cluster] = (stats.clusterCounts[cluster] || 0) + 1;
    stats.regimeCounts[regime] = (stats.regimeCounts[regime] || 0) + 1;
    stats.familyCounts[family] = (stats.familyCounts[family] || 0) + 1;
    symbolStats.set(symbol, stats);
    increment(clusterMap, cluster, sample);
    increment(regimeMap, regime, sample);
    increment(familyMap, family, sample);
  }

  const target = Math.max(1, Math.round(num(targetSamplesPerSymbol, 10)));
  const averagePerSymbol = uniqueSymbols.length ? usableSamples.length / uniqueSymbols.length : 0;
  const targetOversampledThreshold = target * oversampleMultiplier;
  const averageOversampledThreshold = averagePerSymbol * oversampleMultiplier;
  const rows = [...symbolStats.values()].map((row) => {
    const health = healthFor(row.symbol, symbolHealth);
    const underSampled = row.sampleCount < target;
    const overSampled = row.sampleCount > target &&
      (row.sampleCount > targetOversampledThreshold || row.sampleCount > averageOversampledThreshold);
    const reasons = [...row.reasons];
    if (underSampled) reasons.push("under_sampled");
    if (overSampled) reasons.push("over_sampled");
    if (!health.trusted) reasons.push(health.stale ? "stale_data" : "low_data_quality");
    return {
      ...row,
      dataQualityScore: finite(health.dataQualityScore, 3),
      stale: health.stale,
      lifecycleRisk: health.lifecycleRisk,
      underSampled,
      overSampled,
      trustedForPaperLearning: health.trusted,
      paperScanSuggested: underSampled && health.trusted,
      reasons: [...new Set(reasons)]
    };
  }).sort((left, right) => {
    if (left.paperScanSuggested !== right.paperScanSuggested) return left.paperScanSuggested ? -1 : 1;
    return left.sampleCount - right.sampleCount || left.symbol.localeCompare(right.symbol);
  });

  const underSampledHealthy = rows.filter((row) => row.paperScanSuggested);
  const overSampled = rows.filter((row) => row.overSampled);
  const lowTrust = rows.filter((row) => !row.trustedForPaperLearning);
  const status = !uniqueSymbols.length
    ? "empty_watchlist"
    : lowTrust.length || overSampled.length
      ? "degraded"
      : underSampledHealthy.length
        ? "rebalance_suggested"
        : "balanced";

  return {
    status,
    botMode,
    watchlistCount: uniqueSymbols.length,
    sampleCount: usableSamples.length,
    targetSamplesPerSymbol: target,
    symbols: rows,
    byCluster: flattenGroup(clusterMap),
    byRegime: flattenGroup(regimeMap),
    byStrategyFamily: flattenGroup(familyMap),
    underSampledSymbols: underSampledHealthy.map((row) => row.symbol),
    overSampledSymbols: overSampled.map((row) => row.symbol),
    lowTrustSymbols: lowTrust.map((row) => row.symbol),
    paperScanEmphasis: underSampledHealthy.slice(0, 12).map((row) => ({
      symbol: row.symbol,
      reason: "under_sampled_data_healthy",
      currentSamples: row.sampleCount,
      targetSamples: target
    })),
    warnings: [
      ...(!uniqueSymbols.length ? ["empty_watchlist"] : []),
      ...(lowTrust.length ? ["low_quality_symbols_excluded_from_trust"] : []),
      ...(overSampled.length ? ["oversampled_symbols_detected"] : [])
    ],
    paperOnly: botMode !== "live",
    diagnosticsOnly: botMode === "live",
    liveUniverseChanged: false,
    liveBehaviorChanged: false
  };
}

export function summarizeWatchlistCoverage(input = {}) {
  return buildWatchlistCoverageBalancer(input);
}
