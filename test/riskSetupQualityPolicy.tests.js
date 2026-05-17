import { buildSetupQualityAssessment } from "../src/risk/policies/setupQualityPolicy.js";

export async function registerRiskSetupQualityPolicyTests({ runCheck, assert }) {
  await runCheck("risk setup quality policy preserves tier and reason inputs", async () => {
    const strong = buildSetupQualityAssessment({
      config: { botMode: "paper", tradeQualityCautionScore: 0.58, tradeQualityMinScore: 0.47 },
      score: { probability: 0.68 },
      threshold: 0.58,
      strategySummary: { activeStrategy: "orderbook_imbalance", fitScore: 0.72, blockers: [] },
      signalQualitySummary: { overallScore: 0.74 },
      confidenceBreakdown: { overallConfidence: 0.7, executionConfidence: 0.68 },
      dataQualitySummary: { overallScore: 0.66 },
      acceptanceQuality: 0.68,
      replenishmentQuality: 0.64,
      relativeStrengthComposite: 0.006,
      leadershipTailwindScore: 0.66,
      timeframeSummary: { alignmentScore: 0.68 },
      pairHealthSummary: { score: 0.7 },
      marketConditionSummary: { conditionConfidence: 0.7, conditionRisk: 0.25 }
    });
    assert.ok(["good", "elite"].includes(strong.tier));
    assert.equal(strong.strategyFitGuardFloor, 0.4);
    assert.ok(strong.edgeToThreshold > 0);

    const blockedContext = buildSetupQualityAssessment({
      config: { botMode: "paper", tradeQualityCautionScore: 0.58, tradeQualityMinScore: 0.47 },
      score: { probability: 0.64 },
      threshold: 0.58,
      strategySummary: { activeStrategy: "breakout", fitScore: 0.45, blockers: ["strategy_context_mismatch", "regime_mismatch"] },
      signalQualitySummary: { overallScore: 0.74 },
      confidenceBreakdown: { overallConfidence: 0.7, executionConfidence: 0.68 },
      dataQualitySummary: { overallScore: 0.66 },
      marketStateSummary: { phase: "late_distribution" },
      regimeSummary: { regime: "high_vol" }
    });
    assert.equal(blockedContext.tier, "weak");
    assert.equal(blockedContext.hostilePhase, true);
    assert.equal(blockedContext.hostileRegime, true);
  });
}
