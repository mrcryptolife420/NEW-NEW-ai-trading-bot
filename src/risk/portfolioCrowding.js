import { clamp } from "../utils/math.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "unknown") {
  const result = `${value || ""}`.trim();
  return result || fallback;
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function identity(position = {}) {
  return {
    symbol: text(position.symbol, ""),
    cluster: text(position.cluster || position.portfolioCluster || position.profile?.cluster, "unknown_cluster"),
    family: text(position.strategyFamily || position.strategyDecision?.family || position.entryRationale?.strategy?.family, "unknown_family"),
    regime: text(position.regime || position.regimeAtEntry || position.entryRationale?.regimeSummary?.regime, "unknown_regime"),
    beta: num(position.btcBeta ?? position.profile?.btcBeta, 1),
    notional: Math.max(0, num(position.notional || position.quantity * position.entryPrice))
  };
}

export function buildPortfolioCrowdingSummary({ openPositions = [], candidate = {}, correlations = {}, marketContext = {} } = {}) {
  const positions = arr(openPositions).map(identity);
  const candidateIdentity = identity({
    ...candidate,
    cluster: candidate.cluster || candidate.portfolioCluster || candidate.profile?.cluster,
    strategyFamily: candidate.strategyFamily || candidate.strategy?.family || candidate.strategySummary?.family,
    regime: candidate.regime || candidate.regimeSummary?.regime
  });
  const sameSymbolBlocked = positions.some((position) => position.symbol && position.symbol === candidateIdentity.symbol);
  const sameClusterCount = positions.filter((position) => position.cluster === candidateIdentity.cluster).length;
  const sameStrategyFamilyCount = positions.filter((position) => position.family === candidateIdentity.family).length;
  const sameRegimeCount = positions.filter((position) => position.regime === candidateIdentity.regime).length;
  const btcBetaExposure = positions.reduce((total, position) => total + position.notional * position.beta, 0) + Math.max(0, num(candidate.notional || candidate.quoteAmount)) * num(candidate.btcBeta ?? marketContext.btcBeta, 1);
  const candidateCorrelation = Math.max(
    0,
    ...Object.values(correlations || {}).map((value) => num(value, 0))
  );
  const reasons = [];
  if (sameSymbolBlocked) reasons.push("same_symbol_duplicate");
  if (sameClusterCount >= 2) reasons.push("cluster_crowding");
  if (sameStrategyFamilyCount >= 2) reasons.push("strategy_family_crowding");
  if (sameRegimeCount >= 3) reasons.push("regime_crowding");
  if (candidateCorrelation >= 0.85) reasons.push("high_correlation");
  if (num(marketContext.btcShockRisk, 0) > 0.7) reasons.push("btc_shock_beta_risk");

  let crowdingRisk = "low";
  if (sameSymbolBlocked || sameClusterCount >= 4 || candidateCorrelation >= 0.95) {
    crowdingRisk = "blocked";
  } else if (sameClusterCount >= 3 || sameStrategyFamilyCount >= 3 || sameRegimeCount >= 4 || candidateCorrelation >= 0.85) {
    crowdingRisk = "high";
  } else if (sameClusterCount >= 1 || sameStrategyFamilyCount >= 1 || sameRegimeCount >= 2 || candidateCorrelation >= 0.65) {
    crowdingRisk = "medium";
  }
  const sizeMultiplier = crowdingRisk === "blocked"
    ? 0
    : crowdingRisk === "high"
      ? 0.45
      : crowdingRisk === "medium"
        ? 0.72
        : 1;
  return {
    sameSymbolBlocked,
    sameClusterCount,
    sameStrategyFamilyCount,
    sameRegimeCount,
    btcBetaExposure,
    crowdingRisk,
    sizeMultiplier: clamp(sizeMultiplier, 0, 1),
    reasons,
    multiPositionSupported: true
  };
}
