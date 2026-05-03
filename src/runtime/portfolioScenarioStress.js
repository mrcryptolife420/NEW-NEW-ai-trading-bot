import { buildPortfolioCrowdingSummary } from "../risk/portfolioCrowding.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = "unknown") {
  const result = `${value || ""}`.trim();
  return result || fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, num(value, min)));
}

const DEFAULT_SCENARIOS = Object.freeze({
  btc_dump: { priceShockPct: -0.08, spreadMultiplier: 1.4, liquidityMultiplier: 0.85, betaAsset: "BTC" },
  eth_dump: { priceShockPct: -0.07, spreadMultiplier: 1.35, liquidityMultiplier: 0.88, betaAsset: "ETH" },
  alt_liquidity_drain: { priceShockPct: -0.05, spreadMultiplier: 2.2, liquidityMultiplier: 0.45 },
  spread_spike: { priceShockPct: -0.015, spreadMultiplier: 3, liquidityMultiplier: 0.7 },
  volatility_spike: { priceShockPct: -0.045, spreadMultiplier: 1.8, liquidityMultiplier: 0.75 },
  data_stale: { priceShockPct: -0.025, spreadMultiplier: 1.2, liquidityMultiplier: 0.9, dataStale: true },
  fee_slippage_spike: { priceShockPct: -0.02, spreadMultiplier: 2.4, liquidityMultiplier: 0.75, feeSlippageBps: 35 }
});

function normalizePosition(position = {}, marketSnapshots = {}) {
  const symbol = text(position.symbol, "");
  const snapshot = marketSnapshots[symbol] || {};
  const entryPrice = num(position.entryPrice ?? position.averageEntryPrice ?? position.avgPrice, 0);
  const markPrice = num(
    position.markPrice ?? position.currentPrice ?? snapshot.price ?? snapshot.mid ?? snapshot.book?.mid,
    entryPrice
  );
  const quantity = Math.max(0, num(position.quantity ?? position.qty, 0));
  const notional = Math.max(0, num(position.notional, quantity * markPrice));
  const beta = num(position.btcBeta ?? position.beta ?? position.profile?.btcBeta, symbol.startsWith("BTC") ? 1 : 0.85);
  const cluster = text(position.cluster || position.portfolioCluster || position.profile?.cluster, "unknown_cluster");
  const family = text(position.strategyFamily || position.strategyDecision?.family, "unknown_family");
  const regime = text(position.regime || position.regimeAtEntry, "unknown_regime");
  const protectedPosition = Boolean(
    position.protected ||
      position.protectiveOrderListId ||
      position.protectiveOrderId ||
      position.protectionStatus === "protected"
  );
  return {
    symbol,
    quantity,
    entryPrice,
    markPrice,
    notional,
    beta,
    cluster,
    family,
    regime,
    protected: protectedPosition,
    missingPrice: !(markPrice > 0),
    raw: position
  };
}

function scenarioImpact(position, scenario) {
  const betaShock = scenario.betaAsset === "BTC"
    ? position.beta
    : scenario.betaAsset === "ETH"
      ? Math.max(0.45, position.beta * 0.75)
      : 1;
  const priceLoss = position.notional * Math.abs(num(scenario.priceShockPct, 0)) * betaShock;
  const liquidityPenalty = position.notional * Math.max(0, 1 - num(scenario.liquidityMultiplier, 1)) * 0.015;
  const spreadPenalty = position.notional * Math.max(0, num(scenario.spreadMultiplier, 1) - 1) * 0.0025;
  const feePenalty = position.notional * Math.max(0, num(scenario.feeSlippageBps, 0)) / 10_000;
  return Math.max(0, priceLoss + liquidityPenalty + spreadPenalty + feePenalty);
}

function classifyStatus(drawdownFraction, warnings = []) {
  if (warnings.includes("missing_prices")) {
    return "degraded";
  }
  if (drawdownFraction >= 0.12) {
    return "blocked";
  }
  if (drawdownFraction >= 0.06) {
    return "stress";
  }
  if (drawdownFraction >= 0.025) {
    return "watch";
  }
  return "ok";
}

function recommendedAction(status) {
  if (status === "blocked") {
    return "protect_only_until_portfolio_stress_reduces";
  }
  if (status === "stress") {
    return "reduce_new_risk_and_review_protection";
  }
  if (status === "degraded") {
    return "refresh_market_prices_before_using_stress_output";
  }
  if (status === "watch") {
    return "monitor_crowding_and_protection";
  }
  return "monitor";
}

export function buildPortfolioScenarioStress({
  openPositions = [],
  marketSnapshots = {},
  scenarios = DEFAULT_SCENARIOS,
  accountEquity = null,
  config = {}
} = {}) {
  const positions = arr(openPositions).map((position) => normalizePosition(position, marketSnapshots));
  const totalNotional = positions.reduce((total, position) => total + position.notional, 0);
  const equity = Math.max(1, num(accountEquity ?? config.accountEquity ?? config.startingCash, totalNotional || 1));
  const warnings = [];
  if (positions.some((position) => position.missingPrice)) {
    warnings.push("missing_prices");
  }
  const protectionHealth = {
    protectedCount: positions.filter((position) => position.protected).length,
    unprotectedCount: positions.filter((position) => !position.protected).length,
    status: positions.length === 0
      ? "empty"
      : positions.every((position) => position.protected)
        ? "protected"
        : "unprotected_positions"
  };
  const scenarioResults = Object.entries(scenarios || DEFAULT_SCENARIOS).map(([id, scenario]) => {
    const affectedPositions = positions.map((position) => ({
      symbol: position.symbol,
      estimatedLoss: scenarioImpact(position, scenario),
      notional: position.notional,
      protected: position.protected
    }));
    const estimatedLoss = affectedPositions.reduce((total, position) => total + position.estimatedLoss, 0);
    return {
      id,
      estimatedLoss,
      estimatedDrawdownPct: estimatedLoss / equity,
      affectedPositions,
      warnings: scenario.dataStale ? ["data_stale_scenario"] : []
    };
  });
  const worstScenario = scenarioResults.reduce(
    (worst, scenario) => (scenario.estimatedLoss > worst.estimatedLoss ? scenario : worst),
    { id: null, estimatedLoss: 0, estimatedDrawdownPct: 0, affectedPositions: [] }
  );
  const crowding = positions.length
    ? buildPortfolioCrowdingSummary({
        openPositions: positions,
        candidate: {},
        marketContext: { currentExposureFraction: totalNotional / equity },
        config: { maxOpenPositions: config.maxOpenPositions, maxTotalExposureFraction: config.maxTotalExposureFraction }
      })
    : { crowdingRisk: "low", reasons: [], multiPositionSupported: true };
  const status = classifyStatus(worstScenario.estimatedDrawdownPct, warnings);
  return {
    status,
    scenarioCount: scenarioResults.length,
    positionCount: positions.length,
    totalNotional,
    equity,
    worstScenario: worstScenario.id,
    estimatedDrawdownPct: worstScenario.estimatedDrawdownPct,
    estimatedLoss: worstScenario.estimatedLoss,
    affectedPositions: worstScenario.affectedPositions,
    protectionHealth,
    portfolioCrowding: crowding,
    warnings,
    recommendedAction: recommendedAction(status),
    scenarios: scenarioResults
  };
}

