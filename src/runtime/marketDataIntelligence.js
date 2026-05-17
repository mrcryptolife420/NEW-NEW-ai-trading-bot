import { buildDataQualityScoreV2, summarizeDataQualityScores } from "./dataQualityScoreV2.js";
import { scoreDataFreshness } from "./dataFreshnessScore.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, finite(value, min)));
}

function unique(values = []) {
  return [...new Set(arr(values).filter(Boolean))];
}

function resolveSnapshot(symbol, marketSnapshots = {}) {
  const snapshots = obj(marketSnapshots);
  return obj(snapshots[symbol] || snapshots[symbol?.toUpperCase?.()] || snapshots[symbol?.toLowerCase?.()]);
}

function resolveStreamAuthority({ streamEvidence = {}, fallbackHealth = {}, requestBudget = {} } = {}) {
  const budget = obj(requestBudget);
  const status = `${streamEvidence.status || fallbackHealth.status || ""}`.toLowerCase();
  const publicConnected = streamEvidence.publicConnected ?? streamEvidence.publicAuthoritative ?? fallbackHealth.publicConnected;
  const restPressure = finite(budget.usedWeightRatio ?? budget.privateRestWeightRatio ?? budget.weightRatio, 0);
  if (status.includes("stale")) return "cached";
  if (status.includes("outage") || status.includes("blocked")) return "unavailable";
  if (publicConnected === true || streamEvidence.publicAuthoritative === true) return "stream";
  if (restPressure >= 0.85) return "cached";
  return "rest_fallback";
}

function normalizeProvider(provider = {}) {
  const id = provider.id || provider.provider || provider.name || provider.feed || "unknown";
  const status = `${provider.status || provider.health || "unknown"}`.toLowerCase();
  const role = provider.role || provider.requirement || (provider.required ? "required" : provider.preferred ? "preferred" : "optional");
  const degraded = ["degraded", "stale", "missing", "unavailable", "offline", "failed"].includes(status);
  return {
    id,
    role,
    status: status || "unknown",
    degraded,
    lastSuccessAt: provider.lastSuccessAt || provider.updatedAt || null,
    lastFailureAt: provider.lastFailureAt || null,
    cooldownUntil: provider.cooldownUntil || null,
    degradationReason: provider.degradationReason || provider.reason || (degraded ? status : null),
    confidenceContribution: clamp(provider.confidenceContribution ?? provider.confidence ?? (degraded ? 0.25 : 0.75))
  };
}

function buildProviderQuorum({ providerSummary = {}, optionalProviders = {} } = {}) {
  const explicitProviders = arr(providerSummary.providers || providerSummary.items || providerSummary.feeds).map(normalizeProvider);
  const providerMapEntries = Object.entries(obj(optionalProviders)).map(([id, value]) => normalizeProvider({ id, ...obj(value) }));
  const providers = explicitProviders.length ? explicitProviders : providerMapEntries;
  const required = providers.filter((provider) => provider.role === "required");
  const preferred = providers.filter((provider) => provider.role === "preferred");
  const available = providers.filter((provider) => !provider.degraded);
  const missingRequired = required.filter((provider) => provider.degraded);
  const degradedProviders = providers.filter((provider) => provider.degraded);
  const status = missingRequired.length
    ? "blocked"
    : degradedProviders.length && available.length
      ? "degraded"
      : providers.length
        ? "ready"
        : "unknown";
  const confidence = providers.length
    ? clamp((available.length / providers.length) * 0.7 + (preferred.filter((provider) => !provider.degraded).length / Math.max(1, preferred.length || 1)) * 0.3)
    : 0.5;
  return {
    status,
    confidence: Number(confidence.toFixed(4)),
    providers,
    availableCount: available.length,
    degradedCount: degradedProviders.length,
    missingRequired: missingRequired.map((provider) => provider.id),
    degradedProviders: degradedProviders.map((provider) => ({
      id: provider.id,
      status: provider.status,
      reason: provider.degradationReason
    }))
  };
}

function buildLineage({ symbol, candidate = {}, quality = {}, providerQuorum = {}, streamAuthority = "unknown" } = {}) {
  return {
    symbol,
    generatedAt: new Date().toISOString(),
    dominantSource: streamAuthority === "stream" ? "stream" : streamAuthority === "rest_fallback" ? "budgeted_rest" : "cached_or_missing",
    fallbackSource: streamAuthority === "stream" ? "budgeted_rest_or_cache" : "cache",
    candidateSource: candidate.source || candidate.origin || "runtime_candidate",
    dataQualityStatus: quality.status || "unknown",
    providerQuorumStatus: providerQuorum.status || "unknown",
    sourceGroups: {
      market: quality.componentScores?.ticker != null ? "ticker_snapshot" : "unknown",
      candles: quality.componentScores?.candles != null ? "candle_series" : "unknown",
      orderBook: quality.componentScores?.orderBook != null ? "orderbook_or_local_book" : "unknown",
      providers: arr(providerQuorum.providers).map((provider) => provider.id)
    }
  };
}

export function buildMarketDataIntelligence({
  symbols = [],
  candidates = [],
  marketSnapshots = {},
  optionalProviders = {},
  providerSummary = {},
  streamHealth = {},
  streamFallbackHealth = {},
  requestBudget = {},
  now = new Date().toISOString(),
  mode = "paper"
} = {}) {
  const candidateList = arr(candidates);
  const symbolList = unique([
    ...arr(symbols),
    ...candidateList.map((candidate) => candidate?.symbol)
  ]);
  const providerQuorum = buildProviderQuorum({ providerSummary, optionalProviders });
  const symbolVerdicts = symbolList.map((symbol) => {
    const candidate = candidateList.find((item) => item?.symbol === symbol) || {};
    const marketSnapshot = resolveSnapshot(symbol, marketSnapshots);
    const quality = buildDataQualityScoreV2({
      symbol,
      candles: arr(marketSnapshot.candles || candidate.candles),
      ticker: obj(marketSnapshot.ticker || candidate.ticker || marketSnapshot),
      orderBook: obj(marketSnapshot.orderBook || marketSnapshot.book || candidate.orderBook),
      marketSnapshot,
      optionalProviders,
      decision: candidate,
      features: candidate.rawFeatures || candidate.features || {},
      now,
      mode
    });
    const freshness = scoreDataFreshness({
      now,
      marketUpdatedAt: marketSnapshot.updatedAt || candidate.marketUpdatedAt || candidate.createdAt || candidate.at,
      newsUpdatedAt: optionalProviders.news?.updatedAt,
      recorderUpdatedAt: candidate.recordedAt || candidate.createdAt || candidate.at,
      streamUpdatedAt: marketSnapshot.streamUpdatedAt || streamHealth.lastPublicMessageAt || streamHealth.lastMessageAt
    });
    const streamAuthority = resolveStreamAuthority({ streamEvidence: streamHealth, fallbackHealth: streamFallbackHealth, requestBudget });
    const hardBlockers = unique([
      ...arr(quality.reasons).filter((reason) => ["candles_missing", "impossible_ohlc", "ticker_price_missing", "orderbook_invalid_bid_ask"].includes(reason)),
      ...arr(providerQuorum.missingRequired).map((provider) => `required_provider_missing:${provider}`),
      streamAuthority === "unavailable" ? "stream_authority_unavailable" : null
    ]);
    const softWarnings = unique([
      ...arr(quality.reasons).filter((reason) => !hardBlockers.includes(reason)),
      ...arr(freshness.warnings),
      ...arr(providerQuorum.degradedProviders).map((provider) => `provider_degraded:${provider.id}`)
    ]);
    const confidence = clamp(
      finite(quality.dataQualityScore, 0) * 0.52 +
        finite(freshness.score, 0) * 0.18 +
        finite(providerQuorum.confidence, 0.5) * 0.18 +
        (streamAuthority === "stream" ? 0.12 : streamAuthority === "rest_fallback" ? 0.08 : streamAuthority === "cached" ? 0.04 : 0),
      0,
      1
    );
    const status = hardBlockers.length
      ? "blocked"
      : confidence < 0.5
        ? "degraded"
        : confidence < 0.72
          ? "usable"
          : "ready";
    const lineage = buildLineage({ symbol, candidate, quality, providerQuorum, streamAuthority });
    return {
      symbol,
      status,
      dataConfidence: Number(confidence.toFixed(4)),
      sourceLineage: lineage,
      freshnessStatus: freshness.status || (freshness.score >= 0.75 ? "fresh" : "stale"),
      streamAuthority,
      providerQuorum: {
        status: providerQuorum.status,
        confidence: providerQuorum.confidence,
        degradedProviders: providerQuorum.degradedProviders,
        missingRequired: providerQuorum.missingRequired
      },
      hardBlockers,
      softWarnings,
      staleInputs: arr(freshness.staleSources),
      decisionImpact: hardBlockers.length ? "block_or_review" : softWarnings.length ? "score_penalty_or_review" : "none",
      operatorNote: hardBlockers.length
        ? `Market data blocked for ${symbol}: ${hardBlockers[0]}.`
        : softWarnings.length
          ? `Market data usable with warning for ${symbol}: ${softWarnings[0]}.`
          : `Market data ready for ${symbol}.`,
      quality
    };
  });
  const blocked = symbolVerdicts.filter((item) => item.status === "blocked");
  const degraded = symbolVerdicts.filter((item) => item.status === "degraded");
  return {
    version: 1,
    status: blocked.length ? "blocked" : degraded.length ? "degraded" : symbolVerdicts.length ? "ready" : "empty",
    generatedAt: now,
    mode,
    providerQuorum,
    summary: summarizeDataQualityScores(symbolVerdicts.map((item) => item.quality)),
    symbols: symbolVerdicts,
    blockedSymbols: blocked.map((item) => ({ symbol: item.symbol, reasons: item.hardBlockers })),
    degradedSymbols: degraded.map((item) => ({ symbol: item.symbol, warnings: item.softWarnings })),
    diagnosticsOnly: mode !== "live",
    liveSafetyImpact: "negative_only"
  };
}

export function attachMarketDataIntelligenceToCandidates(candidates = [], intelligence = {}) {
  const verdicts = new Map(arr(intelligence.symbols).map((item) => [item.symbol, item]));
  return arr(candidates).map((candidate) => {
    const verdict = verdicts.get(candidate?.symbol);
    if (!verdict) return candidate;
    return {
      ...candidate,
      dataConfidence: verdict.dataConfidence,
      marketDataIntelligence: {
        status: verdict.status,
        sourceLineage: verdict.sourceLineage,
        streamAuthority: verdict.streamAuthority,
        providerQuorum: verdict.providerQuorum,
        hardBlockers: verdict.hardBlockers,
        softWarnings: verdict.softWarnings,
        decisionImpact: verdict.decisionImpact
      }
    };
  });
}
