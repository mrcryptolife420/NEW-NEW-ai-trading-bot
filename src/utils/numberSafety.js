export function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function finiteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function clampNumber(value, min = 0, max = 1, fallback = min) {
  const numeric = safeNumber(value, fallback);
  return Math.min(max, Math.max(min, numeric));
}

export function roundNumber(value, digits = 4, fallback = 0) {
  const numeric = safeNumber(value, fallback);
  const precision = Math.max(0, Math.min(12, Math.round(safeNumber(digits, 4))));
  return Number(numeric.toFixed(precision));
}

export function average(values = [], fallback = 0) {
  const finite = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : fallback;
}
