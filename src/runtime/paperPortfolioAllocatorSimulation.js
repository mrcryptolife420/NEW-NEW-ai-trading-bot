import { buildPortfolioCrowdingSummary } from "../risk/portfolioCrowding.js";
import { buildPortfolioScenarioStress } from "./portfolioScenarioStress.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, finite(value, min)));
}

function identity(value = {}) {
  return {
    symbol: value.symbol || null,
    family: value.strategyFamily || value.strategySummary?.family || value.strategy?.family || value.entryRationale?.strategy?.family || "unknown_family",
    regime: value.regime || value.regimeSummary?.regime || value.regimeAtEntry || "unknown_regime",
    cluster: value.cluster || value.portfolioCluster || value.profile?.cluster || "unknown_cluster"
  };
}

function notional(value = {}, fallback = 0) {
  const direct = finite(value.notional ?? value.quoteAmount ?? value.entryNotional, Number.NaN);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const quantity = finite(value.quantity ?? value.qty, 0);
  const price = finite(value.markPrice ?? value.currentPrice ?? value.entryPrice ?? value.price, 0);
  return quantity > 0 && price > 0 ? quantity * price : fallback;
}

function score(candidate = {}) {
  return clamp(
    candidate.netExecutableExpectancyScore ??
      candidate.qualityScore ??
      candidate.score?.probability ??
      candidate.probability ??
      candidate.decision?.probability ??
      0.5,
    0,
    1
  );
}

function resolveMaxOpenPositions({ config = {}, probationState = {}, mode = "paper" } = {}) {
  if (probationState?.active) {
    const paperMax = finite(config.postReconcilePaperMaxOpenPositions, Number.NaN);
    const sharedMax = finite(config.postReconcileMaxOpenPositions, Number.NaN);
    if (mode === "paper" && Number.isFinite(paperMax) && paperMax > 0) {
      return Math.floor(paperMax);
    }
    if (Number.isFinite(sharedMax) && sharedMax > 0) {
      return Math.floor(sharedMax);
    }
  }
  return Math.max(1, Math.floor(finite(config.maxOpenPositions, 10)));
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function simulatePaperPortfolioAllocation({
  openPositions = [],
  candidates = [],
  accountEquity = null,
  config = {},
  mode = "paper",
  probationState = {},
  marketContext = {},
  correlations = {}
} = {}) {
  const positions = arr(openPositions);
  const equity = Math.max(1, finite(accountEquity ?? config.accountEquity ?? config.startingCash, 10_000));
  const maxOpenPositions = resolveMaxOpenPositions({ config, probationState, mode });
  const maxTotalExposureFraction = Math.max(0, finite(config.maxTotalExposureFraction, 1));
  const maxPositionFraction = Math.max(0, finite(config.maxPositionFraction, 0.1));
  const familyLimit = Math.max(1, Math.floor(finite(config.maxPositionsPerStrategyFamily ?? config.maxFamilyPositions, maxOpenPositions)));
  const regimeLimit = Math.max(1, Math.floor(finite(config.maxPositionsPerRegime, maxOpenPositions)));
  const existingExposure = positions.reduce((sum, position) => sum + notional(position), 0);
  const selected = [];
  const rejected = [];
  const simulatedPortfolio = [...positions];

  const diagnosticsOnly = mode !== "paper";
  const sortedCandidates = arr(candidates)
    .map((candidate) => ({ ...candidate, allocationScore: score(candidate) }))
    .sort((left, right) => right.allocationScore - left.allocationScore || `${left.symbol || ""}`.localeCompare(`${right.symbol || ""}`));

  for (const candidate of sortedCandidates) {
    const currentIdentities = simulatedPortfolio.map(identity);
    const candidateIdentity = identity(candidate);
    const currentExposure = simulatedPortfolio.reduce((sum, position) => sum + notional(position), 0);
    const baseNotional = Math.max(0, Math.min(
      notional(candidate, equity * maxPositionFraction),
      equity * maxPositionFraction
    ));
    const crowding = buildPortfolioCrowdingSummary({
      openPositions: simulatedPortfolio,
      candidate: {
        ...candidate,
        notional: baseNotional,
        exposureFraction: baseNotional / equity
      },
      correlations,
      marketContext: {
        ...marketContext,
        currentExposureFraction: currentExposure / equity,
        candidateExposureFraction: baseNotional / equity
      },
      config: {
        ...config,
        maxOpenPositions,
        maxTotalExposureFraction
      }
    });
    const familyCounts = countBy(currentIdentities, (item) => item.family);
    const regimeCounts = countBy(currentIdentities, (item) => item.regime);
    const reasons = [...crowding.reasons];
    if (simulatedPortfolio.length >= maxOpenPositions) reasons.push("max_open_positions_reached");
    if ((familyCounts.get(candidateIdentity.family) || 0) >= familyLimit) reasons.push("family_limit_reached");
    if ((regimeCounts.get(candidateIdentity.regime) || 0) >= regimeLimit) reasons.push("regime_limit_reached");
    const projectedExposure = currentExposure + baseNotional * crowding.sizeMultiplier;
    if (maxTotalExposureFraction > 0 && projectedExposure / equity > maxTotalExposureFraction) reasons.push("total_exposure_cap");
    const blocked = diagnosticsOnly ||
      crowding.sameSymbolBlocked ||
      reasons.includes("max_open_positions_reached") ||
      reasons.includes("family_limit_reached") ||
      reasons.includes("regime_limit_reached") ||
      reasons.includes("total_exposure_cap") ||
      crowding.crowdingRisk === "blocked";
    const simulatedNotional = blocked ? 0 : baseNotional * crowding.sizeMultiplier;
    const item = {
      symbol: candidate.symbol || null,
      tag: "paper_allocator_simulated",
      allocationScore: candidate.allocationScore,
      allowed: !blocked,
      diagnosticsOnly,
      simulatedNotional,
      sizeMultiplier: blocked ? 0 : crowding.sizeMultiplier,
      crowdingRisk: crowding.crowdingRisk,
      reasons,
      maxOpenPositions,
      projectedExposureFraction: projectedExposure / equity,
      family: candidateIdentity.family,
      regime: candidateIdentity.regime,
      cluster: candidateIdentity.cluster,
      liveBehaviorChanged: false
    };
    if (blocked) {
      rejected.push(item);
      continue;
    }
    selected.push(item);
    simulatedPortfolio.push({
      symbol: item.symbol,
      notional: simulatedNotional,
      strategyFamily: item.family,
      regime: item.regime,
      cluster: item.cluster,
      profile: candidate.profile
    });
  }

  const stress = buildPortfolioScenarioStress({
    openPositions: simulatedPortfolio,
    accountEquity: equity,
    config: { ...config, maxOpenPositions, maxTotalExposureFraction }
  });
  return {
    status: diagnosticsOnly ? "diagnostics_only" : "ready",
    mode,
    diagnosticsOnly,
    tag: "paper_allocator_simulated",
    maxOpenPositions,
    existingOpenPositions: positions.length,
    selectedCount: selected.length,
    rejectedCount: rejected.length,
    selected,
    rejected,
    simulatedOpenPositions: simulatedPortfolio.length,
    simulatedExposureFraction: simulatedPortfolio.reduce((sum, position) => sum + notional(position), 0) / equity,
    scenarioStress: stress,
    multiPositionSupported: true,
    liveBehaviorChanged: false
  };
}

export function summarizePaperAllocatorSimulation(simulation = {}) {
  const selected = arr(simulation.selected);
  const rejected = arr(simulation.rejected);
  const rejectedReasons = {};
  for (const item of rejected) {
    for (const reason of arr(item.reasons)) {
      rejectedReasons[reason] = (rejectedReasons[reason] || 0) + 1;
    }
  }
  return {
    status: simulation.status || "empty",
    mode: simulation.mode || "paper",
    tag: "paper_allocator_simulated",
    selectedCount: selected.length,
    rejectedCount: rejected.length,
    simulatedOpenPositions: finite(simulation.simulatedOpenPositions, 0),
    maxOpenPositions: finite(simulation.maxOpenPositions, 0),
    simulatedExposureFraction: finite(simulation.simulatedExposureFraction, 0),
    rejectedReasons,
    topSelected: selected.slice(0, 5),
    diagnosticsOnly: Boolean(simulation.diagnosticsOnly),
    liveBehaviorChanged: false,
    multiPositionSupported: true
  };
}

export const PAPER_PORTFOLIO_ALLOCATOR_SIMULATION_VERSION = 1;
