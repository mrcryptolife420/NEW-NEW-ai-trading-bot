function inferCategory(code = "") {
  const normalized = `${code || ""}`.trim().toLowerCase();
  if (!normalized) {
    return "other";
  }
  if (normalized.includes("confidence") || normalized.includes("quality") || normalized.includes("setup")) {
    return "quality";
  }
  if (normalized.includes("portfolio") || normalized.includes("drawdown") || normalized.includes("correlation") || normalized.includes("exposure")) {
    return "portfolio";
  }
  if (normalized.includes("committee") || normalized.includes("governor") || normalized.includes("meta") || normalized.includes("retired")) {
    return "governance";
  }
  if (normalized.includes("spread") || normalized.includes("execution") || normalized.includes("quote") || normalized.includes("trade_size")) {
    return "execution";
  }
  if (normalized.includes("session") || normalized.includes("trend") || normalized.includes("timeframe") || normalized.includes("market")) {
    return "market";
  }
  if (normalized.includes("event") || normalized.includes("news") || normalized.includes("calendar") || normalized.includes("announcement")) {
    return "event";
  }
  if (normalized.startsWith("paper_learning_") || normalized.includes("shadow")) {
    return "learning";
  }
  return "other";
}

function inferSeverity(code = "") {
  const normalized = `${code || ""}`.trim().toLowerCase();
  if (!normalized) {
    return "info";
  }
  if (
    [
      "exchange_truth_freeze",
      "health_circuit_open",
      "capital_governor_blocked",
      "regime_kill_switch_active",
      "position_already_open",
      "max_total_exposure_reached",
      "trade_size_invalid"
    ].includes(normalized)
  ) {
    return "critical";
  }
  if (normalized.includes("manual_review") || normalized.includes("reconcile") || normalized.includes("blocked")) {
    return "high";
  }
  if (normalized.includes("confidence") || normalized.includes("quality") || normalized.includes("cooldown")) {
    return "medium";
  }
  return "low";
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
    operatorAction: inferOperatorAction(category, severity),
    dashboardLabel: humanize(code)
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
  const rejections = allowed ? [] : normalizeReasonCodeEntries(reasons, { kind: "rejection" });
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
