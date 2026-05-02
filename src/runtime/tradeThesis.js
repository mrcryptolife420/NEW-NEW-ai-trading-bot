import { redactSecrets } from "../utils/redactSecrets.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function strategyFamilyOf(value = {}) {
  return value?.family || value?.strategyFamily || value?.strategy?.family || value?.strategySummary?.family || null;
}

function strategyIdOf(value = {}) {
  return value?.id || value?.strategyId || value?.activeStrategy || value?.strategy?.activeStrategy || value?.strategySummary?.activeStrategy || null;
}

function inferPrimaryReason({ decision = {}, candidate = {}, strategySummary = {} }) {
  const strategyId = strategyIdOf(strategySummary) || strategyIdOf(decision) || strategyIdOf(candidate);
  const family = strategyFamilyOf(strategySummary) || strategyFamilyOf(decision) || strategyFamilyOf(candidate);
  if (`${strategyId}`.includes("breakout") || family === "breakout") {
    return "Breakout continuation requires reclaimed level acceptance and clean follow-through.";
  }
  if (`${strategyId}`.includes("range") || family === "mean_reversion" || family === "range_grid") {
    return "Range setup expects mean reversion while boundaries remain respected.";
  }
  if (`${strategyId}`.includes("trend") || family === "trend_following") {
    return "Trend setup expects continuation while pullbacks keep reclaim structure intact.";
  }
  return decision.summary || candidate.summary || "Setup thesis unavailable; treat as observation-first until evidence improves.";
}

function expectedPathFor({ strategySummary = {}, decision = {}, marketSnapshot = {} }) {
  const family = strategyFamilyOf(strategySummary) || strategyFamilyOf(decision);
  const market = marketSnapshot.market || marketSnapshot || {};
  if (family === "breakout") {
    return "breakout_reclaim -> acceptance_above_level -> continuation_or_fast_invalidation";
  }
  if (family === "mean_reversion" || family === "range_grid") {
    return "boundary_rejection -> drift_to_vwap_or_range_mid -> reduce_if_boundary_breaks";
  }
  if (family === "trend_following") {
    return "pullback_reclaim -> higher_low_hold -> trail_with_trend";
  }
  return market.regime ? `${market.regime}_path_requires_confirmation` : "path_requires_confirmation";
}

export function buildTradeThesis({
  decision = {},
  candidate = {},
  marketSnapshot = {},
  riskSummary = {},
  strategySummary = {}
} = {}) {
  const market = marketSnapshot.market || marketSnapshot || {};
  const blockerReasons = arr(decision.blockerReasons || decision.reasons || candidate.blockerReasons || []);
  const riskNotes = [
    ...arr(riskSummary.reasons || riskSummary.blockerReasons || []),
    ...blockerReasons.filter((reason) => `${reason}`.includes("risk") || `${reason}`.includes("cost") || `${reason}`.includes("safety"))
  ].slice(0, 5);
  const thesis = {
    primaryReason: inferPrimaryReason({ decision, candidate, strategySummary }),
    supportingReasons: [
      strategySummary.label || strategySummary.strategyLabel || strategyIdOf(strategySummary) || strategyFamilyOf(strategySummary),
      decision.regime || market.regime || null,
      decision.session?.name || decision.session || null,
      finiteOrNull(decision.probability) == null ? null : `probability=${Number(decision.probability).toFixed(4)}`
    ].filter(Boolean).slice(0, 6),
    invalidatesIf: [
      "hard_safety_blocker_appears",
      "structure_reclaim_fails",
      "orderflow_reverses_against_thesis",
      "spread_or_slippage_exceeds_plan"
    ],
    expectedHoldMinutes: finiteOrNull(decision.expectedHoldMinutes ?? strategySummary.expectedHoldMinutes ?? riskSummary.expectedHoldMinutes) || 90,
    expectedPath: expectedPathFor({ strategySummary, decision, marketSnapshot }),
    riskNotes,
    doNotAverageDown: true,
    createdAt: decision.createdAt || candidate.createdAt || new Date(0).toISOString()
  };
  return redactSecrets(thesis);
}
