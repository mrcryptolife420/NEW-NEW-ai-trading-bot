import { clamp } from "../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function average(values = [], fallback = 0) {
  const filtered = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((total, value) => total + value, 0) / filtered.length : fallback;
}

export function resolveCandidateExecutionPain(candidate = {}) {
  const memory = candidate?.decision?.executionQualityMemory || {};
  const marketProviders = candidate?.marketProviderSummary?.execution || {};
  return clamp(average([
    safeNumber(memory.executionPainScore, Number.NaN),
    safeNumber(memory.painScore, Number.NaN),
    safeNumber(marketProviders.executionPainScore, Number.NaN),
    safeNumber(marketProviders.slippagePressure, Number.NaN)
  ], 0.2), 0, 1);
}

export function resolveCandidateNetExecutableExpectancyScore(candidate = {}) {
  const expectedNetEdge = candidate?.decision?.expectedNetEdge || {};
  const allocator = candidate?.decision?.portfolioAllocator || {};
  const executionMemory = candidate?.decision?.executionQualityMemory || {};
  const marketProviders = candidate?.marketProviderSummary?.execution || {};
  const edgeScore = safeNumber(candidate?.decision?.decisionScores?.edge?.edgeScore, safeNumber(candidate?.score?.probability, 0.5));
  const expectancyScore = safeNumber(expectedNetEdge.expectancyScore, 0.5);
  const frictionPenalty = safeNumber(expectedNetEdge.expectedExecutionDragPct, 0) * 6;
  const slippageRisk = average([
    safeNumber(executionMemory.slippagePressure, Number.NaN),
    safeNumber(marketProviders.slippagePressure, Number.NaN),
    Math.max(0, safeNumber(marketProviders.slippageDeltaBps, 0)) / 12
  ], 0);
  const fillQuality = average([
    safeNumber(executionMemory.score, Number.NaN),
    safeNumber(marketProviders.executionQualityScore, Number.NaN),
    safeNumber(marketProviders.fillReliability, Number.NaN)
  ], 0.5);
  const diversificationValue = safeNumber(allocator.marginalDiversificationValue, 0);
  const opportunityCost = safeNumber(candidate?.decision?.portfolioAllocator?.capitalPenalty, 0);
  const marginalCapitalValue = safeNumber(allocator.allocatorScore, 0.5);
  const executionPain = resolveCandidateExecutionPain(candidate);
  return num(clamp(
    edgeScore * 0.24 +
      expectancyScore * 0.24 +
      fillQuality * 0.16 +
      diversificationValue * 0.18 +
      marginalCapitalValue * 0.12 -
      frictionPenalty * 0.14 -
      slippageRisk * 0.18 -
      opportunityCost * 0.2 -
      executionPain * 0.16,
    0,
    1.6
  ), 4);
}

export function compareByNetExecutableExpectancy(left = {}, right = {}) {
  return resolveCandidateNetExecutableExpectancyScore(right) - resolveCandidateNetExecutableExpectancyScore(left);
}
