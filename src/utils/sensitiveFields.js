const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /private/i,
  /signature/i,
  /live_trading_acknowledged/i
];

export function classifySensitiveField(key) {
  const field = `${key || ""}`;
  const sensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(field));
  return {
    field,
    sensitive,
    category: sensitive ? "secret" : /balance|order|account/i.test(field) ? "account_or_trade" : "public_runtime"
  };
}

export function sanitizeArtifact(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeArtifact(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const classification = classifySensitiveField(key);
    return [key, classification.sensitive ? "[redacted]" : sanitizeArtifact(item)];
  }));
}
