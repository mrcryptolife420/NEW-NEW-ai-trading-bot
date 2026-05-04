import { normalizeAlertSeverity } from "./alertSeverity.js";
import {
  canManageExistingPositions,
  canOpenNewEntries,
  canRunReconcile
} from "./operatorMode.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function buildSafetySnapshot({
  config = {},
  operatorMode = {},
  liveReadiness = {},
  riskSummary = {},
  alerts = [],
  intents = [],
  positions = [],
  recorderSummary = {},
  dashboardFreshness = {},
  portfolioScenarioStressSummary = {},
  apiDegradationSummary = {},
  stablecoinRiskSummary = {}
} = {}) {
  const topRisks = [];
  const criticalAlerts = arr(alerts).filter((alert) => normalizeAlertSeverity(alert) === "critical");
  if (criticalAlerts.length) topRisks.push("critical_alerts");
  if (arr(intents).length) topRisks.push("unresolved_execution_intents");
  if (liveReadiness.status === "blocked") topRisks.push("live_readiness_blocked");
  if (riskSummary.rootBlocker?.primaryRootBlocker) topRisks.push(riskSummary.rootBlocker.primaryRootBlocker);
  if (["stress", "blocked"].includes(portfolioScenarioStressSummary.status)) {
    topRisks.push("portfolio_scenario_stress");
  }
  const apiBlocksEntries = Array.isArray(apiDegradationSummary.blockedActions) && apiDegradationSummary.blockedActions.includes("open_new_entries");
  if (apiBlocksEntries || ["rate_limited", "full_outage", "partial_outage"].includes(apiDegradationSummary.degradationLevel)) {
    topRisks.push("api_degradation");
  }
  if (stablecoinRiskSummary.manualReviewRecommended || ["severe", "elevated"].includes(stablecoinRiskSummary.stablecoinRisk)) {
    topRisks.push("stablecoin_quote_asset_risk");
  }
  const staleData = {
    dashboard: Boolean(dashboardFreshness.stale),
    recorder: recorderSummary.status === "stale" || Boolean(recorderSummary.stale)
  };
  if (staleData.dashboard) topRisks.push("stale_dashboard");
  if (staleData.recorder) topRisks.push("stale_recorder");
  const mode = operatorMode.mode || config.operatorMode || "active";
  const entryAllowed = canOpenNewEntries(mode) && liveReadiness.status !== "blocked" && !apiBlocksEntries;
  const managementAllowed = canManageExistingPositions(mode);
  const reconcileAllowed = canRunReconcile(mode);
  return {
    overallStatus: topRisks.includes("critical_alerts") || liveReadiness.status === "blocked"
      ? "blocked"
      : topRisks.length
        ? "degraded"
        : "ready",
    entryPermission: {
      allowed: Boolean(entryAllowed),
      reason: entryAllowed ? "operator_and_readiness_allow_entries" : "operator_or_readiness_blocks_entries"
    },
    positionManagementPermission: {
      allowed: Boolean(managementAllowed),
      reconcileAllowed: Boolean(reconcileAllowed),
      openPositionCount: arr(positions).length
    },
    topRisks: [...new Set(topRisks)].slice(0, 8),
    staleData,
    operatorActions: topRisks.includes("critical_alerts")
      ? ["resolve_critical_alerts"]
      : liveReadiness.status === "blocked"
        ? liveReadiness.requiredActions || ["review_live_readiness"]
        : topRisks.includes("api_degradation")
        ? [apiDegradationSummary.recommendedAction || "review_api_degradation"]
        : topRisks.includes("stablecoin_quote_asset_risk")
          ? ["review_stablecoin_quote_asset_risk"]
          : topRisks.includes("portfolio_scenario_stress")
          ? [portfolioScenarioStressSummary.recommendedAction || "review_portfolio_stress"]
        : ["monitor"]
  };
}
