import { buildStrategyDslFingerprint, summarizeStrategyDsl, validateStrategyDsl } from "../research/strategyDsl.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, finite(value, min)));
}

export const DEFAULT_STRATEGY_SCENARIO_PACKS = Object.freeze([
  { id: "volatility_spike", label: "Sudden volatility spike", requiredFor: ["breakout", "trend", "all"] },
  { id: "liquidity_collapse", label: "Liquidity collapse", requiredFor: ["orderbook", "all"] },
  { id: "trend_continuation", label: "Trend continuation", requiredFor: ["trend", "breakout"] },
  { id: "range_chop", label: "Range chop", requiredFor: ["mean_reversion", "range", "all"] },
  { id: "funding_squeeze", label: "Funding squeeze", requiredFor: ["funding", "derivatives"] },
  { id: "exchange_data_stale", label: "Exchange data stale", requiredFor: ["all"] },
  { id: "portfolio_correlation_shock", label: "Portfolio correlation shock", requiredFor: ["portfolio", "all"] }
]);

function scenarioCoverage(scenarios = []) {
  const ids = new Set(arr(scenarios).map((scenario) => scenario.id || scenario.scenarioId));
  const missing = DEFAULT_STRATEGY_SCENARIO_PACKS.filter((scenario) => scenario.requiredFor.includes("all") && !ids.has(scenario.id));
  return {
    status: missing.length ? "incomplete" : "ready",
    covered: ids.size,
    missing: missing.map((scenario) => scenario.id)
  };
}

function resolveMetricStatus(metric, floor, id) {
  const value = finite(metric, 0);
  return {
    id,
    value: Number(value.toFixed(4)),
    floor,
    passed: value >= floor
  };
}

export function buildStrategyExperimentWorkflow({
  experiment = {},
  strategy = {},
  scenarios = [],
  walkForward = {},
  monteCarlo = {},
  realityGap = {},
  tournament = {},
  portfolio = {},
  lifecycle = {},
  nowIso = new Date().toISOString()
} = {}) {
  const strategyInput = Object.keys(obj(strategy)).length ? strategy : experiment.strategy || {};
  const validation = validateStrategyDsl(strategyInput);
  const fingerprint = validation.valid ? buildStrategyDslFingerprint(strategyInput) : (experiment.configHash || null);
  const scenarioSummary = scenarioCoverage(scenarios);
  const gates = [
    { id: "dsl_valid", passed: validation.valid, detail: { errors: validation.errors || [] } },
    { id: "fingerprint", passed: Boolean(fingerprint), detail: { fingerprint } },
    { id: "scenario_pack", passed: scenarioSummary.status === "ready", detail: scenarioSummary },
    resolveMetricStatus(walkForward.consistency ?? walkForward.minConsistency ?? walkForward.score, 0.55, "walk_forward_consistency"),
    resolveMetricStatus(1 - finite(realityGap.gapScore ?? realityGap.score, 0), 0.5, "reality_gap_control"),
    resolveMetricStatus(1 - finite(monteCarlo.riskOfRuin ?? monteCarlo.ruinProbability, 0), 0.86, "risk_of_ruin"),
    resolveMetricStatus(portfolio.healthScore ?? portfolio.score ?? 0.6, 0.5, "portfolio_health")
  ];
  const blockedGates = gates.filter((gate) => !gate.passed);
  const status = blockedGates.length
    ? "retest_required"
    : lifecycle.status === "active"
      ? "active"
      : tournament.status === "winner"
        ? "paper_ready"
        : "shadow_ready";
  return {
    version: 1,
    status,
    generatedAt: nowIso,
    experiment: {
      id: experiment.id || fingerprint || "strategy_experiment",
      strategyId: experiment.strategyId || strategyInput.id || "unknown",
      strategyVersion: experiment.strategyVersion || strategyInput.version || "unversioned",
      configHash: experiment.configHash || fingerprint,
      mode: experiment.mode || "paper",
      symbols: arr(experiment.symbols),
      regimes: arr(experiment.regimes)
    },
    strategySummary: validation.valid ? summarizeStrategyDsl(strategyInput) : { valid: false, errors: validation.errors || [] },
    fingerprint,
    scenarioSummary,
    gates,
    blockedGates: blockedGates.map((gate) => gate.id),
    tournament: obj(tournament),
    portfolioImpact: {
      healthScore: Number(clamp(portfolio.healthScore ?? portfolio.score ?? 0.6).toFixed(4)),
      crowding: portfolio.crowding || portfolio.crowdingStatus || "unknown",
      opportunityCost: portfolio.opportunityCost || null,
      riskOfRuin: monteCarlo.riskOfRuin ?? monteCarlo.ruinProbability ?? null
    },
    lifecycleDecision: lifecycle.status || status,
    promotionAllowed: blockedGates.length === 0 && experiment.mode !== "live",
    liveSafetyImpact: "negative_only"
  };
}

export function buildStrategyLifecycleBoard(workflows = []) {
  const items = arr(workflows);
  const retest = items.filter((item) => item.status === "retest_required");
  const active = items.filter((item) => item.status === "active" || item.status === "paper_ready");
  return {
    version: 1,
    status: retest.length ? "review_required" : active.length ? "ready" : items.length ? "watch" : "empty",
    count: items.length,
    retestRequired: retest.map((item) => ({ id: item.experiment?.id, blockedGates: item.blockedGates })),
    activeOrReady: active.map((item) => item.experiment?.id),
    items
  };
}

