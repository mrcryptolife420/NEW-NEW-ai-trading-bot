export function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, finiteNumber(value, min)));
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function mean(values = []) {
  const finite = asArray(values).map((value) => finiteNumber(value, NaN)).filter(Number.isFinite);
  if (finite.length === 0) {
    return 0;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

export function stableId(prefix, parts = []) {
  const raw = `${prefix}:${asArray(parts).map((part) => JSON.stringify(part ?? "")).join("|")}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(16)}`;
}

export function nowIso(clock = null) {
  const value = typeof clock === "function" ? clock() : clock;
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}
