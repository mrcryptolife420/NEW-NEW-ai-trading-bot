export function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function average(values, fallback = 0) {
  const usable = asArray(values).map(Number).filter(Number.isFinite);
  if (!usable.length) return fallback;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

export function statusFromScore(score, bands = {}) {
  const normalized = clamp01(score);
  if (normalized <= (bands.critical ?? 0.2)) return "critical";
  if (normalized <= (bands.warning ?? 0.45)) return "warning";
  if (normalized <= (bands.selective ?? 0.7)) return "selective";
  return "healthy";
}
