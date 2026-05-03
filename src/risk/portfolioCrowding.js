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

export function buildPortfolioCrowdingSummary({ openPositions = [], candidate = {}, correlations = {}, marketContext = {}, config = {} } = {}) {
  const positions = arr(openPositions).map(identity);
  const candidateIdentity = identity({
    ...candidate,
    cluster: candidate.cluster || candidate.portfolioCluster || candidate.profile?.cluster,
    strategyFamily: candidate.strategyFamily || candidate.strategy?.family || candidate.strategySummary?.family,
    regime: candidate.regime || candidate.regimeSummary?.regime
  });
  const maxOpenPositions = Math.max(1, Math.floor(num(config.maxOpenPositions ?? marketContext.maxOpenPositions ?? candidate.maxOpenPositions, 10)));
  const remainingSlots = Math.max(0, maxOpenPositions - positions.length);
  const currentExposureFraction = Math.max(0, num(marketContext.currentExposureFraction ?? config.currentExposureFraction, 0));
  const candidateExposureFraction = Math.max(0, num(candidate.exposureFraction ?? candidate.positionFraction ?? marketContext.candidateExposureFraction, 0));
  const maxTotalExposureFraction = Math.max(0, num(config.maxTotalExposureFraction ?? marketContext.maxTotalExposureFraction, 0));
  const projectedExposureFraction = currentExposureFraction + candidateExposureFraction;
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
  if (remainingSlots <= 0) reasons.push("max_open_positions_reached");
  if (maxTotalExposureFraction > 0 && projectedExposureFraction > maxTotalExposureFraction) reasons.push("total_exposure_cap");
  if (sameClusterCount >= 2) reasons.push("cluster_crowding");
  if (sameStrategyFamilyCount >= 2) reasons.push("strategy_family_crowding");
  if (sameRegimeCount >= 3) reasons.push("regime_crowding");
  if (candidateCorrelation >= 0.85) reasons.push("high_correlation");
  if (num(marketContext.btcShockRisk, 0) > 0.7) reasons.push("btc_shock_beta_risk");

  let crowdingRisk = "low";
  if (sameSymbolBlocked || remainingSlots <= 0 || (maxTotalExposureFraction > 0 && projectedExposureFraction > maxTotalExposureFraction) || sameClusterCount >= 4 || candidateCorrelation >= 0.95) {
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
    maxOpenPositions,
    remainingSlots,
    projectedExposureFraction,
    multiPositionSupported: true
  };
}
