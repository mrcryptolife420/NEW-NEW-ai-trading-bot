const SECRET_PATTERN = /(SECRET|KEY|TOKEN|PASSWORD|PRIVATE|ACKNOWLEDGED)/i;
const LIVE_SENSITIVE_PATTERN = /(BOT_MODE|LIVE|BINANCE|EXCHANGE|PROTECTION|ORDER|BROKER|VENUE)/i;

export function classifyConfigKey(key) {
  const id = `${key || ""}`;
  return {
    key: id,
    secret: SECRET_PATTERN.test(id),
    liveSensitive: LIVE_SENSITIVE_PATTERN.test(id),
    requiresRestart: true,
    safetyClass: LIVE_SENSITIVE_PATTERN.test(id) ? "live_sensitive" : SECRET_PATTERN.test(id) ? "secret" : "standard"
  };
}

export function buildConfigLineage({ defaults = {}, env = {}, processEnv = {}, profile = {}, derived = {} } = {}) {
  const keys = [...new Set([
    ...Object.keys(defaults),
    ...Object.keys(env),
    ...Object.keys(processEnv),
    ...Object.keys(profile),
    ...Object.keys(derived)
  ])].sort();
  return keys.map((key) => {
    const source = key in derived
      ? "derived"
      : key in profile
        ? "profile"
        : key in processEnv
          ? "process_env"
          : key in env
            ? "env_file"
            : "default";
    const bucket = source === "env_file"
      ? env
      : source === "process_env"
        ? processEnv
        : source === "default"
          ? defaults
          : { derived, profile }[source] || {};
    const value = bucket[key];
    const classification = classifyConfigKey(key);
    return {
      ...classification,
      source,
      valueRedacted: classification.secret ? "[redacted]" : `${value ?? ""}`,
      profileOwner: key in profile ? "active_profile" : null
    };
  });
}

export function summarizeProfileExactness(profile = {}, env = {}) {
  const expected = profile.env || profile;
  const mismatches = Object.entries(expected)
    .filter(([key, value]) => `${env[key] ?? ""}` !== `${value ?? ""}`)
    .map(([key, value]) => ({ key, expected: `${value ?? ""}`, actual: `${env[key] ?? ""}` }));
  return {
    profileId: profile.id || null,
    exact: mismatches.length === 0,
    status: mismatches.length === 0 ? "exact" : "drift",
    mismatches
  };
}
