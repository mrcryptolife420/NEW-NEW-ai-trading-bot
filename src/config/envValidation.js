export const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
export const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function parseEnvLines(content = "") {
  return `${content || ""}`.split(/\r?\n/).map((raw, index) => ({ raw, line: index + 1 }));
}

export function collectDuplicateEnvKeys(content = "") {
  const seen = new Map();
  const duplicates = [];
  for (const { raw, line } of parseEnvLines(content)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.push({ key, firstLine: seen.get(key), line });
    } else {
      seen.set(key, line);
    }
  }
  return duplicates;
}

function envKeyToConfigKey(key = "") {
  return `${key || ""}`
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join("");
}

function isMissing(value) {
  return value === undefined || value === null || `${value}`.trim() === "";
}

export function parseNumberStrict(env, key, fallback, errors = []) {
  const value = env?.[key];
  if (isMissing(value)) return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  errors.push(`${key}: received "${value}", expected finite number, example ${fallback}`);
  return fallback;
}

export function parseBooleanStrict(env, key, fallback, errors = []) {
  const value = env?.[key];
  if (isMissing(value)) return fallback;
  const normalized = `${value}`.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  errors.push(`${key}: received "${value}", expected boolean true/false, example ${fallback}`);
  return fallback;
}

export function buildStrictEnvParseErrors({ env = {}, defaults = {}, allowedEnvKeys = new Set() } = {}) {
  const errors = [];
  for (const key of Object.keys(env || {})) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    if (allowedEnvKeys instanceof Set && allowedEnvKeys.size > 0 && !allowedEnvKeys.has(key)) continue;
    const configKey = envKeyToConfigKey(key);
    if (typeof defaults[configKey] === "number") parseNumberStrict(env, key, defaults[configKey], errors);
    if (typeof defaults[configKey] === "boolean") parseBooleanStrict(env, key, defaults[configKey], errors);
  }
  return errors;
}

export function parseEnumStrict(env, key, allowed, fallback, errors = []) {
  const value = env?.[key];
  if (isMissing(value)) return fallback;
  const normalized = `${value}`.trim().toLowerCase();
  if (allowed.includes(normalized)) return normalized;
  errors.push(`${key}: received "${value}", expected one of ${allowed.join(", ")}, example ${fallback}`);
  return fallback;
}

export function parseCsvStrict(env, key, fallback, errors = []) {
  const value = env?.[key];
  if (isMissing(value)) return fallback;
  const items = `${value}`.split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length > 0) return items;
  errors.push(`${key}: received "${value}", expected comma separated values, example BTCUSDT,ETHUSDT`);
  return fallback;
}

export function parseUrlStrict(env, key, fallback, errors = []) {
  const value = env?.[key];
  if (isMissing(value)) return fallback;
  try {
    const url = new URL(`${value}`.trim());
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString().replace(/\/$/, "");
  } catch {
    // report below
  }
  errors.push(`${key}: received "${value}", expected http(s) URL, example ${fallback}`);
  return fallback;
}
