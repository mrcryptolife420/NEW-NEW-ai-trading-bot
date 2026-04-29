import {
  classifyReasonCategory,
  getDashboardLabel,
  getOperatorAction,
  getReasonSeverity,
  sortReasonsByRootPriority
} from "./reasonRegistry.js";

function inferCategory(code = "") {
  return classifyReasonCategory(code);
}

function inferSeverity(code = "") {
  return getReasonSeverity(code);
}

function humanize(code = "") {
  const normalized = `${code || ""}`.trim();
  if (!normalized) {
    return "Unknown";
  }
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function inferOperatorAction(category = "other", severity = "low") {
  if (severity === "critical") {
    return "review_now";
  }
  if (category === "execution") {
    return "inspect_execution_preflight";
  }
  if (category === "portfolio") {
    return "review_portfolio_limits";
  }
  if (category === "governance") {
    return "review_governance_and_policy";
  }
  if (category === "event") {
    return "review_event_risk_context";
  }
  if (category === "quality") {
    return "review_signal_quality";
  }
  return "observe";
}

export function buildReasonCodeEntry(code, {
  kind = "rejection",
  message = null
} = {}) {
  const category = inferCategory(code);
  const severity = inferSeverity(code);
  return {
    code,
    kind,
    category,
    severity,
    messageTemplate: message || humanize(code),
    operatorAction: getOperatorAction(code) || inferOperatorAction(category, severity),
    dashboardLabel: getDashboardLabel(code) || humanize(code)
  };
}

export function normalizeReasonCodeEntries(codes = [], options = {}) {
  return [...new Set((Array.isArray(codes) ? codes : []).filter(Boolean))]
    .map((code) => buildReasonCodeEntry(code, options));
}

export function buildRiskVerdict({
  allowed = false,
  reasons = [],
  approvalReasons = [],
  sizing = {},
  portfolioSummary = {},
  entryMode = "standard"
} = {}) {
  const sortedReasons = sortReasonsByRootPriority(reasons);
  const rejections = allowed ? [] : normalizeReasonCodeEntries(sortedReasons, { kind: "rejection" });
  const warnings = normalizeReasonCodeEntries(approvalReasons, { kind: "approval" });
  return {
    allowed,
    rejections,
    warnings,
    sizing,
    portfolioImpact: {
      sizeMultiplier: portfolioSummary.sizeMultiplier ?? null,
      allocatorScore: portfolioSummary.allocatorScore ?? null,
      diversificationScore: portfolioSummary.diversificationScore ?? null,
      maxCorrelation: portfolioSummary.maxCorrelation ?? null,
      blockingReasons: [...(portfolioSummary.blockingReasons || [])],
      advisoryReasons: [...(portfolioSummary.advisoryReasons || [])]
    },
    reasonSummary: {
      dominantCode: rejections[0]?.code || null,
      dominantCategory: rejections[0]?.category || null,
      count: rejections.length,
      entryMode
    }
  };
}
