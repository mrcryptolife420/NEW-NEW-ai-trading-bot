export const TEST_DOMAINS = ["unit", "runtime", "risk", "execution", "storage", "dashboard", "safety", "security", "desktop", "integration"];

export function classifyTestDomain(name = "") {
  const normalized = `${name || ""}`.toLowerCase();
  if (/\b(desktop|windows gui|tray|electron)\b/.test(normalized)) return "desktop";
  if (/\b(secrets?|redact|csrf|origin|path traversal|injection|permission|attack|security)\b/.test(normalized)) return "security";
  if (/\b(live|safety|protection|guard|acknowledge|exchange safety|preflight)\b/.test(normalized)) return "safety";
  if (/\b(risk|veto|blocker|capital|sizing|threshold)\b/.test(normalized)) return "risk";
  if (/\b(execution|broker|order|fill|intent|oco|reconcile)\b/.test(normalized)) return "execution";
  if (/\b(storage|read model|readmodel|journal|retention|sqlite|audit log)\b/.test(normalized)) return "storage";
  if (/\b(dashboard|api contract|dom|server)\b/.test(normalized)) return "dashboard";
  if (/\b(runtime|bot lifecycle|liveness|stream|loop|start everything|start-everything)\b/.test(normalized)) return "runtime";
  if (/\b(api|integration)\b/.test(normalized)) return "integration";
  return "unit";
}

export function resolveRequestedTestDomains(options = {}) {
  return TEST_DOMAINS.filter((domain) => options[domain]);
}
