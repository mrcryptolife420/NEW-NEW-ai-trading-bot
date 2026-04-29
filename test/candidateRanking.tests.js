import { compareByNetExecutableExpectancy, resolveCandidateNetExecutableExpectancyScore } from "../src/runtime/candidateRanking.js";

export async function registerCandidateRankingTests({
  runCheck,
  assert
}) {
  await runCheck("net executable expectancy outranks raw probability when execution friction is cleaner", async () => {
    const higherProbability = {
      score: { probability: 0.69 },
      decision: {
        decisionScores: { edge: { edgeScore: 0.61 } },
        expectedNetEdge: { expectancyScore: 0.5, expectedExecutionDragPct: 0.012 },
        portfolioAllocator: { marginalDiversificationValue: 0.02, capitalPenalty: 0.14, allocatorScore: 0.48 },
        executionQualityMemory: { executionPainScore: 0.44, slippagePressure: 0.38, score: 0.42 }
      },
      marketProviderSummary: {
        execution: { executionQualityScore: 0.46, fillReliability: 0.42, slippagePressure: 0.34, slippageDeltaBps: 3.2 }
      }
    };
    const cleaner = {
      score: { probability: 0.64 },
      decision: {
        decisionScores: { edge: { edgeScore: 0.66 } },
        expectedNetEdge: { expectancyScore: 0.63, expectedExecutionDragPct: 0.004 },
        portfolioAllocator: { marginalDiversificationValue: 0.08, capitalPenalty: 0.03, allocatorScore: 0.58 },
        executionQualityMemory: { executionPainScore: 0.12, slippagePressure: 0.08, score: 0.74 }
      },
      marketProviderSummary: {
        execution: { executionQualityScore: 0.81, fillReliability: 0.78, slippagePressure: 0.06, slippageDeltaBps: 0.5 }
      }
    };

    assert.ok(resolveCandidateNetExecutableExpectancyScore(cleaner) > resolveCandidateNetExecutableExpectancyScore(higherProbability));
    assert.ok(compareByNetExecutableExpectancy(higherProbability, cleaner) > 0);
  });
}
