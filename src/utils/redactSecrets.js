const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|api[_-]?secret|secret|token|authorization|signature|webhook|password|private[_-]?key|x-mbx-apikey)/i;
const WEBHOOK_URL_PATTERN = /^https?:\/\/(?:hooks\.slack\.com|discord(?:app)?\.com\/api\/webhooks|.*webhook).*$/i;

function shouldRedactKey(key = "") {
  return SENSITIVE_KEY_PATTERN.test(`${key || ""}`);
}

function shouldRedactString(value = "") {
  return WEBHOOK_URL_PATTERN.test(`${value || ""}`.trim());
}

export function redactSecrets(value, {
  maxDepth = 8,
  redactedValue = REDACTED
} = {}) {
  const seen = new WeakSet();

  function visit(current, key = "", depth = 0) {
    if (shouldRedactKey(key)) {
      return redactedValue;
    }
    if (typeof current === "string") {
      return shouldRedactString(current) ? redactedValue : current;
    }
    if (current === null || typeof current !== "object") {
      return current;
    }
    if (seen.has(current)) {
      return "[Circular]";
    }
    if (depth >= maxDepth) {
      return "[MaxDepth]";
    }
    seen.add(current);
    if (Array.isArray(current)) {
      return current.map((item) => visit(item, key, depth + 1));
    }
    return Object.fromEntries(
      Object.entries(current).map(([childKey, childValue]) => [
        childKey,
        visit(childValue, childKey, depth + 1)
      ])
    );
  }

  return visit(value);
}

export function isSensitiveLogKey(key = "") {
  return shouldRedactKey(key);
}
