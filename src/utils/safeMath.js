export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  const fallbackParsed = Number(fallback);
  return Number.isFinite(parsed) ? parsed : Number.isFinite(fallbackParsed) ? fallbackParsed : 0;
}

export function safeRatio(numerator, denominator, fallback = 0) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) {
    return safeNumber(fallback, 0);
  }
  return safeNumber(top / bottom, fallback);
}

export function clampFinite(value, min = 0, max = 1, fallback = 0) {
  const lower = safeNumber(min, 0);
  const upper = safeNumber(max, lower);
  const sortedMin = Math.min(lower, upper);
  const sortedMax = Math.max(lower, upper);
  return Math.min(sortedMax, Math.max(sortedMin, safeNumber(value, fallback)));
}
