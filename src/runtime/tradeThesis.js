import { redactSecrets } from "../utils/redactSecrets.js";
import { buildExitPlanHint } from "../strategy/exitPlanHints.js";

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

function setupTypeOf({ decision = {}, candidate = {}, strategySummary = {} } = {}) {
  const strategyId = `${strategyIdOf(strategySummary) || strategyIdOf(decision) || strategyIdOf(candidate) || ""}`.toLowerCase();
  const family = `${strategyFamilyOf(strategySummary) || strategyFamilyOf(decision) || strategyFamilyOf(candidate) || ""}`.toLowerCase();
  const explicit = `${decision.setupType || decision.setupStyle || candidate.setupType || candidate.setupStyle || strategySummary.setupStyle || ""}`.toLowerCase();
  if (explicit.includes("breakout_retest") || strategyId.includes("breakout_retest")) return "breakout_retest";
  if (explicit.includes("liquidity_sweep") || strategyId.includes("liquidity_sweep")) return "liquidity_sweep_reclaim";
  if (explicit.includes("vwap_reclaim") || strategyId.includes("vwap_reclaim")) return "vwap_reclaim";
  if (family === "range_grid" || strategyId.includes("range_grid")) return "range_grid";
  if (family === "mean_reversion" || strategyId.includes("reversion")) return "mean_reversion";
  if (family === "breakout" || strategyId.includes("breakout")) return "breakout_retest";
  return "trend_continuation";
}

function buildSetupEvidence({ setupType, decision = {}, market = {}, strategySummary = {} }) {
  const evidenceFor = [];
  const evidenceAgainst = [];
  const confirmation = [];
  const failures = [];
  const pushFor = (condition, value) => { if (condition) evidenceFor.push(value); };
  const pushAgainst = (condition, value) => { if (condition) evidenceAgainst.push(value); };
  const rsi = Number(market.rsi14 ?? decision.rsi14 ?? 50);
  const spread = Number(decision.orderBook?.spreadBps ?? decision.marketSnapshot?.book?.spreadBps ?? market.spreadBps ?? 0);
  const trendSlope = Number(market.emaTrendSlopePct ?? market.emaSlopeScore ?? decision.trendState?.uptrendScore ?? 0);
  const reclaim = Number(market.reclaimScore ?? market.vwapReclaimScore ?? decision.strategy?.metrics?.reclaimScore ?? 0);
  const retest = Number(market.breakoutRetestQuality ?? decision.strategy?.metrics?.retestQuality ?? 0);

  if (setupType === "range_grid") {
    pushFor(Number(market.rangeBoundaryRespectScore || 0) > 0.45, "range boundaries are being respected");
    pushFor(Number(market.rangeMeanRevertScore || 0) > 0.45, "range mean-reversion score is supportive");
    pushAgainst(Number(market.rangeExpansionRisk || market.trendExpansionScore || 0) > 0.45, "range expansion risk is elevated");
    confirmation.push("boundary respect remains intact");
    failures.push("range_breakout_against_grid");
  } else if (setupType === "mean_reversion") {
    pushFor(rsi < 40, "oscillators are stretched enough for reversion review");
    pushFor(Number(market.vwapZScore?.zScore ?? market.vwapZScore ?? 0) < -0.8, "price is stretched away from VWAP");
    pushAgainst(trendSlope > 0.01 && rsi > 55, "trend continuation may overpower reversion");
    confirmation.push("VWAP/range-mid target remains valid");
    failures.push("trend_expansion_overpowers_reversion");
  } else if (setupType === "breakout_retest") {
    pushFor(retest > 0.45, "breakout retest quality is supportive");
    pushFor(Number(market.structureBreakScore || market.bosStrengthScore || 0) > 0.3, "structure break is present");
    pushAgainst(Number(market.falseBreakoutRisk || 0) > 0.55, "false breakout risk is elevated");
    confirmation.push("retest low holds after reclaim");
    failures.push("failed_breakout");
  } else if (setupType === "liquidity_sweep_reclaim") {
    pushFor(Number(market.liquiditySweepScore || 0) > 0.3, "liquidity sweep is visible");
    pushFor(reclaim > 0.35, "reclaim quality is positive");
    pushAgainst(Number(market.cvdDivergenceScore || 0) > 0.45, "orderflow divergence weakens reclaim");
    confirmation.push("sweep low stays protected");
    failures.push("sweep_reclaim_failure");
  } else if (setupType === "vwap_reclaim") {
    pushFor(reclaim > 0.3 || Number(market.anchoredVwapAcceptanceScore || 0) > 0.45, "VWAP/anchored VWAP acceptance is supportive");
    pushAgainst(Number(market.anchoredVwapRejectionScore || 0) > 0.45, "VWAP rejection risk is elevated");
    confirmation.push("close remains accepted above VWAP");
    failures.push("vwap_reclaim_loss");
  } else {
    pushFor(trendSlope > 0, "trend slope is supportive");
    pushFor(Number(market.relativeStrengthVsBtc ?? market.relativeStrength ?? 0) > 0, "relative strength is supportive");
    pushAgainst(Number(market.choppinessIndex ?? 50) > 65, "high choppiness weakens continuation");
    confirmation.push("higher low and VWAP acceptance persist");
    failures.push("trend_structure_break");
  }

  pushAgainst(spread > 18, "spread is elevated for entry quality");
  return {
    evidenceFor: evidenceFor.slice(0, 6),
    evidenceAgainst: evidenceAgainst.slice(0, 6),
    requiredConfirmation: confirmation.slice(0, 5),
    failureModesToWatch: [...new Set([...failures, "execution_drag", "data_quality_failure"])].slice(0, 6)
  };
}

export function buildTradeThesis({
  decision = {},
  candidate = {},
  marketSnapshot = {},
  riskSummary = {},
  strategySummary = {}
} = {}) {
  const market = marketSnapshot.market || marketSnapshot || {};
  const setupType = setupTypeOf({ decision, candidate, strategySummary });
  const setupEvidence = buildSetupEvidence({ setupType, decision, market, strategySummary });
  const exitPlanHint = decision.exitPlanHint || buildExitPlanHint({
    setupType,
    features: market,
    thesis: { setupType },
    config: {}
  });
  const blockerReasons = arr(decision.blockerReasons || decision.reasons || candidate.blockerReasons || []);
  const riskNotes = [
    ...arr(riskSummary.reasons || riskSummary.blockerReasons || []),
    ...blockerReasons.filter((reason) => `${reason}`.includes("risk") || `${reason}`.includes("cost") || `${reason}`.includes("safety"))
  ].slice(0, 5);
  const thesis = {
    primaryReason: inferPrimaryReason({ decision, candidate, strategySummary }),
    setupType,
    supportingReasons: [
      strategySummary.label || strategySummary.strategyLabel || strategyIdOf(strategySummary) || strategyFamilyOf(strategySummary),
      decision.regime || market.regime || null,
      decision.session?.name || decision.session || null,
      finiteOrNull(decision.probability) == null ? null : `probability=${Number(decision.probability).toFixed(4)}`
    ].filter(Boolean).slice(0, 6),
    evidenceFor: setupEvidence.evidenceFor,
    evidenceAgainst: setupEvidence.evidenceAgainst,
    requiredConfirmation: setupEvidence.requiredConfirmation,
    exitPlanHint,
    failureModesToWatch: setupEvidence.failureModesToWatch,
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
