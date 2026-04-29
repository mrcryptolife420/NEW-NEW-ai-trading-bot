import { clamp } from "../utils/math.js";
import { featureGroup, isSupportFeature } from "../strategy/featureGovernance.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value = "") {
  return `${value || ""}`.trim().toLowerCase();
}

function inferStrategySubset(strategySummary = {}) {
  const family = normalize(strategySummary.family);
  const active = normalize(strategySummary.activeStrategy || strategySummary.strategyId);
  if (family === "breakout" || ["market_structure_break", "donchian_breakout", "atr_breakout"].includes(active)) {
    return ["trend", "market_structure", "execution", "volume", "derivatives", "regime"];
  }
  if (family === "mean_reversion" || ["zscore_reversion", "vwap_reversion"].includes(active)) {
    return ["range_execution", "market_structure", "execution", "volatility", "regime", "risk"];
  }
  if (family === "trend_following" || active === "ema_trend") {
    return ["trend", "volume", "execution", "regime", "context"];
  }
  return ["trend", "market_structure", "execution", "volatility", "regime", "context", "risk"];
}

export function buildFeatureGovernanceDecision({
  featureGovernance = {},
  strategySummary = {},
  regimeSummary = {},
  rawFeatures = {}
} = {}) {
  const subset = inferStrategySubset(strategySummary);
  const topNegative = new Map(arr(featureGovernance.attribution?.topNegative || []).map((item) => [item.id, item]));
  const pruningRecommendations = new Map(arr(featureGovernance.pruning?.recommendations || []).map((item) => [item.id, item]));
  const parityDetails = new Map(arr(featureGovernance.parityAudit?.details || []).map((item) => [item.id, item]));
  const trustedGroups = new Map();
  const shadowDisabledGroups = new Set();

  for (const [name] of Object.entries(rawFeatures || {})) {
    const group = featureGroup(name);
    const negative = topNegative.get(name);
    const pruning = pruningRecommendations.get(name);
    const parity = parityDetails.get(name);
    const trust = clamp(
      0.72 -
        safeNumber(negative?.inverseActionability, 0) * 0.22 -
        (pruning?.action === "drop" ? 0.2 : pruning?.action === "shadow" ? 0.1 : 0) -
        (parity?.status === "misaligned" ? 0.18 : parity?.status === "watch" ? 0.08 : 0) +
        (isSupportFeature(name, group) ? 0.05 : 0),
      0,
      1
    );
    trustedGroups.set(group, Math.min(trustedGroups.get(group) ?? 1, trust));
    if (
      trust <= 0.32 &&
      !isSupportFeature(name, group) &&
      normalize(regimeSummary.regime) !== "unknown"
    ) {
      shadowDisabledGroups.add(group);
    }
  }

  const groupTrust = [...trustedGroups.entries()]
    .map(([group, trust]) => ({
      group,
      trust: num(trust, 4),
      shadowDisabled: shadowDisabledGroups.has(group)
    }))
    .sort((left, right) => left.trust - right.trust || left.group.localeCompare(right.group));

  return {
    status: featureGovernance.status || "warmup",
    strategySubset: subset,
    featureSubset: subset,
    groupTrust,
    shadowDisabledGroups: [...shadowDisabledGroups],
    lowestTrustGroup: groupTrust[0]?.group || null,
    note: groupTrust.length
      ? `Feature governance scoped ${groupTrust.length} groups for ${strategySummary.activeStrategy || strategySummary.family || "default"}`
      : "Feature governance awaiting scoped evidence."
  };
}
