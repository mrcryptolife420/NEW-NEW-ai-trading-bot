function ts(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

const GROUPS = new Set(["fast", "medium", "slow", "static"]);

export function createFeatureCacheState(seed = {}) {
  return {
    symbols: { ...(seed.symbols || {}) },
    updatedAt: seed.updatedAt || null
  };
}

export function updateFeatureGroup(cache = createFeatureCacheState(), { symbol, group = "fast", features = {}, at = new Date().toISOString() } = {}) {
  const key = `${symbol || ""}`.toUpperCase();
  const normalizedGroup = GROUPS.has(group) ? group : "fast";
  const next = createFeatureCacheState(cache);
  if (!key) return next;
  const existing = next.symbols[key] || { groups: {} };
  next.symbols[key] = {
    ...existing,
    groups: {
      ...(existing.groups || {}),
      [normalizedGroup]: {
        features: { ...(existing.groups?.[normalizedGroup]?.features || {}), ...features },
        updatedAt: at
      }
    }
  };
  next.updatedAt = at;
  return next;
}

export function summarizeFeatureCache(cache = createFeatureCacheState(), { now = new Date().toISOString(), staleMsByGroup = {} } = {}) {
  const nowMs = ts(now);
  const limits = { fast: 2000, medium: 120000, slow: 900000, static: 86400000, ...staleMsByGroup };
  const symbols = Object.entries(cache.symbols || {}).map(([symbol, value]) => {
    const groups = {};
    for (const group of GROUPS) {
      const updatedAt = value.groups?.[group]?.updatedAt || null;
      const ageMs = updatedAt ? Math.max(0, nowMs - ts(updatedAt)) : null;
      groups[group] = {
        updatedAt,
        ageMs,
        stale: ageMs == null || ageMs > limits[group]
      };
    }
    return {
      symbol,
      groups,
      staleGroups: Object.entries(groups).filter(([, item]) => item.stale).map(([name]) => name)
    };
  });
  return {
    status: symbols.length ? "ready" : "empty",
    symbols,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
