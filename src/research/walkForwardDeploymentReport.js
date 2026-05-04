import { evaluateAntiOverfitGovernor } from "../ai/antiOverfitGovernor.js";
import { buildBacktestQualityMetrics } from "../backtest/backtestMetrics.js";
import { buildCanaryReleaseGate } from "../runtime/canaryReleaseGate.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function summarizeRegimeSplit(regimeBreakdown = {}) {
  const entries = Array.isArray(regimeBreakdown)
    ? regimeBreakdown
    : Object.entries(objectOrFallback(regimeBreakdown, {})).map(([id, stats]) => ({ id, ...objectOrFallback(stats, {}) }));
  return entries.map((item) => ({
    id: item.id || item.regime || "unknown",
    tradeCount: finite(item.tradeCount ?? item.trades, 0),
    winRate: finite(item.winRate, 0),
    profitFactor: finite(item.profitFactor, 0),
    expectancy: finite(item.expectancy ?? item.avgReturn ?? item.averageReturn, 0)
  }));
}

function weakRegimes(regimes = [], minTrades = 8) {
  return regimes.filter((item) =>
    item.tradeCount >= minTrades &&
    (item.winRate < 0.42 || item.profitFactor < 1 || item.expectancy < 0)
  );
}

export function buildWalkForwardDeploymentReport({
  scope = "global",
  trades = [],
  backtestMetrics = null,
  walkForward = {},
  regimeBreakdown = {},
  failureStats = {},
  calibration = {},
  proposedChanges = [],
  antiOverfit = null,
  canaryGate = null,
  config = {}
} = {}) {
  const metrics = backtestMetrics || buildBacktestQualityMetrics(trades);
  const walk = objectOrFallback(walkForward, {});
  const regimes = summarizeRegimeSplit(regimeBreakdown || walk.regimeBreakdown || walk.regimes);
  const minSamples = Math.max(1, Math.round(finite(config.walkForwardDeploymentMinTrades ?? config.canaryMinSamples ?? 30, 30)));
  const tradeCount = finite(metrics.tradeCount ?? arr(trades).length, 0);
  const blockingReasons = [];
  const warnings = [];

  if (!tradeCount && !Object.keys(walk).length) blockingReasons.push("missing_backtest_data");
  if (tradeCount < minSamples) blockingReasons.push("insufficient_samples");
  if (finite(metrics.profitFactor, 0) < 1 && tradeCount >= minSamples) blockingReasons.push("profit_factor_below_one");
  if (finite(metrics.expectancy, 0) < 0 && tradeCount >= minSamples) blockingReasons.push("negative_expectancy");
  if (metrics.sampleSizeWarning) warnings.push("sample_size_warning");

  const weak = weakRegimes(regimes, Math.max(3, Math.floor(minSamples / 4)));
  if (weak.length) {
    blockingReasons.push("weak_regime_split");
    warnings.push(`weak_regimes:${weak.map((item) => item.id).join(",")}`);
  }

  const dominantFailureSeverity = finite(failureStats.maxSeverity ?? failureStats.dominantSeverity ?? failureStats.severity, 0);
  if (dominantFailureSeverity >= 4) blockingReasons.push("high_failure_severity");
  if (finite(calibration.ece ?? calibration.calibrationError ?? calibration.error, 0) > 0.18) {
    blockingReasons.push("calibration_error_high");
  }

  const anti = antiOverfit || evaluateAntiOverfitGovernor({
    proposedChanges,
    evidence: {
      sampleSize: tradeCount,
      source: "backtest",
      calibrationDelta: finite(calibration.delta ?? calibration.calibrationDelta, 0)
    },
    config
  });
  if (anti.status === "blocked") blockingReasons.push("anti_overfit_blocked");

  const canary = canaryGate || buildCanaryReleaseGate({
    scope,
    currentState: "shadow",
    requestedState: "paper",
    evidence: {
      paperTrades: tradeCount,
      shadowTrades: finite(walk.shadowTrades, 0),
      source: "backtest"
    },
    proposedChanges,
    antiOverfit: anti,
    config: { ...config, botMode: "paper" }
  });
  if (canary.status === "blocked") warnings.push(...arr(canary.blockingReasons).map((reason) => `canary_gate:${reason}`));

  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  const deploymentStatus = uniqueBlockingReasons.includes("missing_backtest_data") || uniqueBlockingReasons.includes("insufficient_samples")
    ? "not_ready"
    : uniqueBlockingReasons.length
      ? "blocked"
      : canary.status === "allowed"
        ? "paper_candidate"
        : "watch";

  return {
    scope,
    deploymentStatus,
    blockingReasons: uniqueBlockingReasons,
    warnings: [...new Set(warnings)],
    recommendedNextStep: deploymentStatus === "paper_candidate"
      ? "keep_change_paper_or_shadow_and_collect_forward_evidence"
      : deploymentStatus === "blocked"
        ? "fix_blocking_research_evidence_before_paper_or_canary"
        : "collect_more_walk_forward_and_regime_split_samples",
    metrics,
    regimeBreakdown: regimes,
    weakRegimes: weak,
    calibration: {
      status: calibration.status || "unknown",
      error: finite(calibration.ece ?? calibration.calibrationError ?? calibration.error, 0),
      delta: finite(calibration.delta ?? calibration.calibrationDelta, 0)
    },
    antiOverfit: anti,
    canaryGate: canary,
    readOnly: true,
    autoPromotesLive: false,
    liveBehaviorChanged: false
  };
}
