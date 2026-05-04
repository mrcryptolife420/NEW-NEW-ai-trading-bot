function arr(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampMs(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function ageMs(value, nowMs) {
  const at = timestampMs(value);
  return Number.isFinite(at) && Number.isFinite(nowMs) ? Math.max(0, nowMs - at) : null;
}

function unique(value) {
  return [...new Set(arr(value).filter(Boolean))];
}

function classifyError(error = {}) {
  const status = finite(error.status ?? error.statusCode ?? error.code, 0);
  const text = `${error.code || error.type || error.message || ""}`.toLowerCase();
  if (status === 418 || text.includes("418") || text.includes("banned")) return "ban";
  if (status === 429 || text.includes("429") || text.includes("rate")) return "rate_limit";
  if (status >= 500 || text.includes("5xx") || text.includes("gateway") || text.includes("timeout")) return "server_error";
  return "other";
}

function countProviderOutages(providerHealth = {}) {
  const providers = Array.isArray(providerHealth)
    ? providerHealth
    : Object.entries(objectOrFallback(providerHealth, {})).map(([id, value]) => ({ id, ...objectOrFallback(value, {}) }));
  const total = providers.length;
  const failed = providers.filter((provider) =>
    ["failed", "down", "blocked", "unavailable"].includes(`${provider.status || ""}`.toLowerCase()) ||
    provider.healthy === false
  ).length;
  const stale = providers.filter((provider) =>
    ["stale", "degraded"].includes(`${provider.status || ""}`.toLowerCase()) ||
    provider.stale === true
  ).length;
  return { total, failed, stale };
}

export function buildApiDegradationPlan({
  requestBudget = {},
  streamStatus = {},
  userStreamStatus = {},
  providerHealth = {},
  latencySummary = {},
  recentErrors = [],
  now = new Date().toISOString(),
  config = {}
} = {}) {
  const budget = objectOrFallback(requestBudget, {});
  const streams = objectOrFallback(streamStatus, {});
  const userStream = objectOrFallback(userStreamStatus, {});
  const latency = objectOrFallback(latencySummary, {});
  const nowMs = timestampMs(now);
  const maxStreamAgeMs = Math.max(30_000, finite(config.apiDegradationStreamStaleMs, 180_000));
  const maxUserStreamAgeMs = Math.max(30_000, finite(config.apiDegradationUserStreamStaleMs, 180_000));
  const maxLatencyMs = Math.max(500, finite(config.apiDegradationLatencyWarningMs, 2_500));
  const usedWeight = finite(budget.usedWeight1m ?? budget.usedWeight ?? budget.weightUsed1m, 0);
  const limitWeight = Math.max(1, finite(budget.maxWeight1m ?? budget.limitWeight1m ?? budget.weightLimit1m, 1200));
  const weightRatio = usedWeight / limitWeight;
  const errorKinds = arr(recentErrors).map(classifyError);
  const rateLimitCount = errorKinds.filter((kind) => kind === "rate_limit").length;
  const banCount = errorKinds.filter((kind) => kind === "ban").length;
  const serverErrorCount = errorKinds.filter((kind) => kind === "server_error").length;
  const providerCounts = countProviderOutages(providerHealth);
  const publicStreamAge = ageMs(streams.lastMessageAt || streams.updatedAt || streams.lastEventAt, nowMs);
  const userStreamAge = ageMs(userStream.lastMessageAt || userStream.updatedAt || userStream.lastEventAt, nowMs);
  const publicStreamStale = streams.publicStreamConnected === false || streams.connected === false || (publicStreamAge != null && publicStreamAge > maxStreamAgeMs);
  const userStreamStale = userStream.connected === false || userStream.status === "stale" || (userStreamAge != null && userStreamAge > maxUserStreamAgeMs);
  const latencyMs = finite(latency.p95Ms ?? latency.avgMs ?? latency.lastMs, 0);
  const latencySpike = latencyMs > maxLatencyMs;

  const reasons = [];
  const warnings = [];
  let degradationLevel = "normal";
  let retryAfterMs = finite(budget.retryAfterMs ?? budget.backoffMs ?? budget.banRetryAfterMs, 0);

  if (budget.banActive || banCount > 0) {
    degradationLevel = "full_outage";
    reasons.push("binance_ban_or_418");
    retryAfterMs = Math.max(retryAfterMs, 60_000);
  } else if (budget.backoffActive || budget.status === "blocked" || rateLimitCount >= 2 || weightRatio >= 0.95) {
    degradationLevel = "rate_limited";
    reasons.push("rest_rate_limited");
    retryAfterMs = Math.max(retryAfterMs, 30_000);
  } else if (providerCounts.total > 0 && providerCounts.failed === providerCounts.total) {
    degradationLevel = "full_outage";
    reasons.push("all_data_providers_failed");
    retryAfterMs = Math.max(retryAfterMs, 60_000);
  } else if (providerCounts.failed > 0 || providerCounts.stale > 0 || publicStreamStale || userStreamStale || serverErrorCount >= 3 || weightRatio >= 0.8 || latencySpike) {
    degradationLevel = "partial_outage";
    if (providerCounts.failed > 0) reasons.push("partial_provider_outage");
    if (providerCounts.stale > 0) reasons.push("stale_provider_data");
    if (publicStreamStale) reasons.push("stale_public_stream");
    if (userStreamStale) reasons.push("stale_user_stream");
    if (serverErrorCount >= 3) reasons.push("repeated_server_errors");
    if (weightRatio >= 0.8) reasons.push("rest_budget_pressure");
    if (latencySpike) reasons.push("latency_spike");
    retryAfterMs = Math.max(retryAfterMs, latencySpike ? 15_000 : 10_000);
  } else if (serverErrorCount > 0 || weightRatio >= 0.65) {
    degradationLevel = "degraded";
    if (serverErrorCount > 0) reasons.push("recent_server_errors");
    if (weightRatio >= 0.65) reasons.push("rest_budget_elevated");
    retryAfterMs = Math.max(retryAfterMs, 5_000);
  }

  if (publicStreamAge == null && Object.keys(streams).length) warnings.push("public_stream_timestamp_missing");
  if (userStreamAge == null && Object.keys(userStream).length) warnings.push("user_stream_timestamp_missing");
  if (!providerCounts.total) warnings.push("provider_health_unavailable");

  const blockedActions = [];
  const allowedModes = ["observe_only"];
  if (["normal", "degraded"].includes(degradationLevel)) {
    allowedModes.push("active");
  }
  if (["normal", "degraded", "partial_outage", "rate_limited"].includes(degradationLevel)) {
    allowedModes.push("protect_only", "maintenance");
  }
  if (["partial_outage", "rate_limited", "full_outage"].includes(degradationLevel)) {
    blockedActions.push("open_new_entries");
  }
  if (["rate_limited", "full_outage"].includes(degradationLevel)) {
    blockedActions.push("non_critical_rest_calls", "deep_scan_rest_fallback");
  }
  if (degradationLevel === "full_outage") {
    blockedActions.push("rebuild_protection_without_fresh_exchange_truth");
  }

  const recommendedAction = degradationLevel === "normal"
    ? "monitor"
    : degradationLevel === "degraded"
      ? "prefer_streams_and_monitor_request_budget"
      : degradationLevel === "partial_outage"
        ? "switch_to_observe_or_protect_only_until_feeds_recover"
        : degradationLevel === "rate_limited"
          ? "pause_low_priority_rest_and_wait_for_budget_recovery"
          : "stop_new_entries_and_require_operator_review";

  return {
    status: degradationLevel === "normal" ? "ready" : "degraded",
    degradationLevel,
    allowedModes: unique(allowedModes),
    blockedActions: unique(blockedActions),
    recommendedAction,
    retryAfterMs: Math.max(0, Math.round(retryAfterMs)),
    reasons: unique(reasons),
    warnings: unique(warnings),
    evidence: {
      usedWeight1m: usedWeight,
      weightLimit1m: limitWeight,
      weightRatio: Number.isFinite(weightRatio) ? Number(weightRatio.toFixed(4)) : 0,
      rateLimitCount,
      serverErrorCount,
      providerTotal: providerCounts.total,
      providerFailed: providerCounts.failed,
      providerStale: providerCounts.stale,
      publicStreamAgeMs: publicStreamAge,
      userStreamAgeMs: userStreamAge,
      latencyMs
    },
    diagnosticsOnly: true,
    forceUnlock: false,
    liveSafetyUnchanged: true
  };
}
