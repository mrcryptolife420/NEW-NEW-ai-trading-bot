import { hashReplayInput } from "./replayDeterminism.js";

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = `${value}`.trim();
  return text || null;
}

function timestampOrNull(value) {
  const text = stringOrNull(value);
  if (!text) return null;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function ageMs({ at, now }) {
  const atMs = new Date(at || 0).getTime();
  const nowMs = new Date(now || 0).getTime();
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, nowMs - atMs);
}

function normalizeSourceFreshness({ sources = {}, now, staleAfterMs }) {
  const normalized = {};
  const warnings = [];
  for (const [source, value] of Object.entries(objectOrEmpty(sources))) {
    const sourceObject = objectOrEmpty(value);
    const timestampCandidate =
      Object.keys(sourceObject).length > 0
        ? sourceObject.updatedAt || sourceObject.timestamp || sourceObject.at
        : value;
    const updatedAt = timestampOrNull(timestampCandidate);
    const age = updatedAt ? ageMs({ at: updatedAt, now }) : null;
    const stale = age === null ? true : age > staleAfterMs;
    normalized[source] = {
      updatedAt,
      ageMs: age,
      stale,
      status: !updatedAt ? "missing" : stale ? "stale" : "fresh"
    };
    if (!updatedAt) warnings.push(`missing_source_timestamp:${source}`);
    if (stale && updatedAt) warnings.push(`stale_source:${source}`);
  }
  return { sourceFreshness: normalized, warnings };
}

function resolveFeatureSetId({ featureSetId, features }) {
  return stringOrNull(featureSetId || features?.featureSetId || features?.packId || features?.indicatorPackId);
}

function resolveReplayInputHash({ replayInputHash, lineage }) {
  const explicit = stringOrNull(replayInputHash);
  if (explicit) return explicit;
  return hashReplayInput({
    featureSetId: lineage.featureSetId,
    configHash: lineage.configHash,
    dataHash: lineage.dataHash,
    marketSnapshotAt: lineage.marketSnapshotAt,
    featureComputedAt: lineage.featureComputedAt,
    sourceFreshness: lineage.sourceFreshness
  }).hash;
}

export function buildDecisionInputLineage({
  decision = {},
  features = {},
  featureSetId = null,
  configHash = null,
  dataHash = null,
  marketSnapshot = {},
  marketSnapshotAt = null,
  featureComputedAt = null,
  sourceFreshness = null,
  now = new Date().toISOString(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  replayInputHash = null
} = {}) {
  const safeDecision = objectOrEmpty(decision);
  const safeFeatures = objectOrEmpty(features);
  const safeMarket = objectOrEmpty(marketSnapshot);
  const warnings = [];
  const resolvedMarketSnapshotAt = timestampOrNull(
    marketSnapshotAt || safeMarket.updatedAt || safeMarket.at || safeMarket.candleCloseTime || safeDecision.marketSnapshotAt
  );
  const resolvedFeatureComputedAt = timestampOrNull(
    featureComputedAt || safeFeatures.computedAt || safeFeatures.updatedAt || safeDecision.featureComputedAt
  );
  const resolvedConfigHash = stringOrNull(configHash || safeDecision.configHash || safeFeatures.configHash);
  const resolvedDataHash = stringOrNull(dataHash || safeDecision.dataHash || safeFeatures.dataHash || safeMarket.dataHash);
  const resolvedFeatureSetId = resolveFeatureSetId({ featureSetId, features: safeFeatures });

  if (!resolvedFeatureSetId) warnings.push("missing_feature_set_id");
  if (!resolvedConfigHash) warnings.push("missing_config_hash");
  if (!resolvedDataHash) warnings.push("missing_data_hash");
  if (!resolvedMarketSnapshotAt) warnings.push("missing_market_snapshot_timestamp");
  if (!resolvedFeatureComputedAt) warnings.push("missing_feature_computed_timestamp");

  const marketAge = resolvedMarketSnapshotAt ? ageMs({ at: resolvedMarketSnapshotAt, now }) : null;
  const featureAge = resolvedFeatureComputedAt ? ageMs({ at: resolvedFeatureComputedAt, now }) : null;
  if (marketAge !== null && marketAge > staleAfterMs) warnings.push("stale_market_snapshot");
  if (featureAge !== null && featureAge > staleAfterMs) warnings.push("stale_feature_computation");

  const freshnessInput = sourceFreshness || {
    market: resolvedMarketSnapshotAt,
    features: resolvedFeatureComputedAt,
    ...(safeDecision.createdAt || safeDecision.at ? { recorder: safeDecision.createdAt || safeDecision.at } : {})
  };
  const freshness = normalizeSourceFreshness({ sources: freshnessInput, now, staleAfterMs });
  warnings.push(...freshness.warnings);

  const lineage = {
    status: warnings.some((warning) => warning.startsWith("missing_"))
      ? "incomplete"
      : warnings.some((warning) => warning.startsWith("stale_"))
        ? "stale"
        : "fresh",
    featureSetId: resolvedFeatureSetId,
    configHash: resolvedConfigHash,
    dataHash: resolvedDataHash,
    marketSnapshotAt: resolvedMarketSnapshotAt,
    featureComputedAt: resolvedFeatureComputedAt,
    marketSnapshotAgeMs: marketAge,
    featureComputedAgeMs: featureAge,
    sourceFreshness: freshness.sourceFreshness,
    warnings: [...new Set(warnings)],
    liveSafetyImpact: "diagnostic_only"
  };
  return {
    ...lineage,
    replayInputHash: resolveReplayInputHash({ replayInputHash, lineage })
  };
}

export function compareDecisionInputLineage({ expected = {}, actual = {} } = {}) {
  const left = objectOrEmpty(expected);
  const right = objectOrEmpty(actual);
  const differences = [];
  if (left.configHash && right.configHash && left.configHash !== right.configHash) differences.push("config_hash_changed");
  if (left.dataHash && right.dataHash && left.dataHash !== right.dataHash) differences.push("data_hash_changed");
  if (left.replayInputHash && right.replayInputHash && left.replayInputHash !== right.replayInputHash) {
    differences.push("replay_input_hash_changed");
  }
  return {
    matched: differences.length === 0,
    differences,
    warnings: differences.length > 0 ? ["decision_input_lineage_mismatch"] : []
  };
}

export function buildDecisionInputLineageSummary(records = []) {
  const list = Array.isArray(records) ? records : [];
  const counts = { fresh: 0, stale: 0, incomplete: 0, unknown: 0 };
  const warnings = [];
  for (const item of list) {
    const status = ["fresh", "stale", "incomplete"].includes(item?.status) ? item.status : "unknown";
    counts[status] += 1;
    for (const warning of Array.isArray(item?.warnings) ? item.warnings : []) {
      warnings.push(warning);
    }
  }
  const uniqueWarnings = [...new Set(warnings)];
  return {
    status: counts.incomplete > 0 ? "incomplete" : counts.stale > 0 ? "stale" : counts.fresh > 0 ? "fresh" : "unavailable",
    total: list.length,
    counts,
    warnings: uniqueWarnings.slice(0, 20)
  };
}
