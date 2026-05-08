const REQUIRED_FIELDS = ["id", "name", "family", "version", "allowedRegimes", "requiredFeatures", "riskProfile"];
const STATUSES = new Set(["disabled", "paper_only", "shadow", "live_allowed", "retired"]);

export function validateStrategyPlugin(plugin = {}) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (plugin[field] === undefined || plugin[field] === null || plugin[field] === "") errors.push(`missing_${field}`);
  }
  if (typeof plugin.entryLogic !== "function") errors.push("missing_entry_logic");
  if (typeof plugin.exitLogic !== "function") errors.push("missing_exit_logic");
  if (plugin.hasTests !== true) errors.push("missing_tests");
  const status = STATUSES.has(plugin.status) ? plugin.status : "paper_only";
  if (status === "live_allowed" && plugin.liveSafetyReviewed !== true) errors.push("live_requires_safety_review");
  return { valid: errors.length === 0, errors, status };
}

export function normalizeStrategyPlugin(plugin = {}) {
  const validation = validateStrategyPlugin(plugin);
  return {
    id: plugin.id || "unknown",
    name: plugin.name || plugin.id || "Unknown strategy",
    family: plugin.family || "unknown",
    version: plugin.version || "0.0.0",
    allowedRegimes: Array.isArray(plugin.allowedRegimes) ? plugin.allowedRegimes : [],
    blockedRegimes: Array.isArray(plugin.blockedRegimes) ? plugin.blockedRegimes : [],
    requiredFeatures: Array.isArray(plugin.requiredFeatures) ? plugin.requiredFeatures : [],
    minimumDataQuality: Number.isFinite(Number(plugin.minimumDataQuality)) ? Number(plugin.minimumDataQuality) : 0.5,
    riskProfile: plugin.riskProfile || "balanced",
    status: validation.status,
    paperLiveEligibility: validation.status === "live_allowed" ? "live_candidate" : validation.status,
    validation
  };
}
