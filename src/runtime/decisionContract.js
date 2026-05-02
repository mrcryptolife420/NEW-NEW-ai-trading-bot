import {
  classifyReasonCategory,
  sortReasonsByRootPriority
} from "../risk/reasonRegistry.js";

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = `${value}`.trim();
  return text || null;
}

function normalizeReasons(input = {}) {
  const raw = input.reasons || input.blockerReasons || input.reasonCodes || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map(stringOrNull).filter(Boolean))];
}

function normalizeStrategy(strategy) {
  if (!strategy) {
    return null;
  }
  if (typeof strategy === "string") {
    return strategy;
  }
  return strategy.id || strategy.strategyId || strategy.name || strategy.family || null;
}

function normalizeObjectNumbers(value = {}) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, Number.isFinite(Number(entry)) ? Number(entry) : entry])
      .filter(([, entry]) => entry !== undefined && !(typeof entry === "number" && !Number.isFinite(entry)))
  );
}

export function normalizeDecisionForAudit(input = {}) {
  const reasons = normalizeReasons(input);
  const sortedReasons = sortReasonsByRootPriority(reasons);
  const rootBlocker = stringOrNull(input.rootBlocker || input.primaryRootBlocker || input.primaryReason) || sortedReasons[0] || null;
  return {
    decisionId: stringOrNull(input.decisionId || input.id),
    cycleId: stringOrNull(input.cycleId),
    symbol: stringOrNull(input.symbol)?.toUpperCase() || null,
    mode: stringOrNull(input.mode || input.botMode) || "paper",
    strategy: normalizeStrategy(input.strategy || input.strategyId),
    probability: finiteOrNull(input.probability ?? input.modelProbability ?? input.finalProbability),
    threshold: finiteOrNull(input.threshold ?? input.modelThreshold),
    approved: Boolean(input.approved ?? input.allow ?? false),
    rootBlocker,
    reasons,
    reasonCategories: Object.fromEntries(reasons.map((reason) => [reason, classifyReasonCategory(reason)])),
    confidence: finiteOrNull(input.confidence ?? input.modelConfidence),
    dataQuality: finiteOrNull(input.dataQuality ?? input.dataQualityScore),
    executionReadiness: finiteOrNull(input.executionReadiness ?? input.executionReadinessScore),
    sizing: normalizeObjectNumbers(input.sizing || input.sizingSummary || {}),
    createdAt: stringOrNull(input.createdAt || input.at),
    configHash: stringOrNull(input.configHash)
  };
}
