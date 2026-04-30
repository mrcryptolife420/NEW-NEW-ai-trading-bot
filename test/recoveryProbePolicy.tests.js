import { buildRecoveryProbePolicy } from "../src/risk/policies/recoveryProbePolicy.js";

export async function registerRecoveryProbePolicyTests({
  runCheck,
  assert
}) {
  await runCheck("recovery probe lane admits bounded paper demo soft-blocked candidates only", async () => {
    const result = buildRecoveryProbePolicy({
      config: {
        botMode: "paper",
        paperExecutionVenue: "binance_demo_spot",
        paperRecoveryProbeEnabled: true,
        paperRecoveryProbeMinBookPressure: -0.28,
        maxSpreadBps: 25,
        maxRealizedVolPct: 0.08
      },
      symbol: "BTCUSDT",
      capitalGovernor: { allowProbeEntries: true, blocked: false },
      reasons: ["meta_neural_caution", "quality_quorum_degraded"],
      openPositionsInMode: [],
      canOpenAnotherPaperLearningPosition: true,
      score: { probability: 0.58 },
      threshold: 0.6,
      recoveryProbeProbabilityFloor: 0.56,
      setupQuality: { score: 0.72 },
      signalQualitySummary: { overallScore: 0.7, executionViability: 0.66 },
      dataQualitySummary: { overallScore: 0.69 },
      confidenceBreakdown: { overallConfidence: 0.68, executionConfidence: 0.7 },
      qualityQuorumSummary: { observeOnly: false },
      marketSnapshot: { book: { bookPressure: -0.1, spreadBps: 4 }, market: { realizedVolPct: 0.02 } },
      newsSummary: { riskScore: 0.08 },
      announcementSummary: { riskScore: 0.06 },
      calendarSummary: { riskScore: 0.08 },
      marketStructureSummary: { riskScore: 0.14 },
      volatilitySummary: { riskScore: 0.18 },
      sessionSummary: { blockerReasons: [] },
      driftSummary: { blockerReasons: [] },
      selfHealState: { learningAllowed: true },
      strategySummary: { family: "breakout" },
      regimeSummary: { regime: "trend" },
      minutesSincePortfolioTrade: 180,
      cooldownMinutes: 60
    });

    assert.equal(result.eligible, true);
    assert.equal(result.paperRecoveryProbeEligible, true);
    assert.equal(result.probeEligibleSoftBlockedCandidate, true);
    assert.ok(result.qualifyingReasons.includes("meta_neural_caution"));
  });

  await runCheck("recovery probe lane stays disabled for live mode and hard safety blockers", async () => {
    const live = buildRecoveryProbePolicy({
      config: {
        botMode: "live",
        paperExecutionVenue: "binance_demo_spot",
        paperRecoveryProbeEnabled: true
      },
      capitalGovernor: { allowProbeEntries: true, blocked: false },
      reasons: ["meta_neural_caution"],
      score: { probability: 0.58 },
      recoveryProbeProbabilityFloor: 0.56,
      canOpenAnotherPaperLearningPosition: true
    });
    const blocked = buildRecoveryProbePolicy({
      config: {
        botMode: "paper",
        paperExecutionVenue: "binance_demo_spot",
        paperRecoveryProbeEnabled: true
      },
      capitalGovernor: { allowProbeEntries: true, blocked: false },
      reasons: ["exchange_safety_blocked", "meta_neural_caution"],
      score: { probability: 0.58 },
      recoveryProbeProbabilityFloor: 0.56,
      canOpenAnotherPaperLearningPosition: true
    });

    assert.equal(live.eligible, false);
    assert.equal(live.whyNoProbeAttempt, "probe_lane_requires_binance_demo_paper");
    assert.equal(blocked.eligible, false);
    assert.equal(blocked.hardStopReasons.includes("exchange_safety_blocked"), true);
  });

  await runCheck("soft-blocker probe lane admits strong paper near-misses without capital recovery", async () => {
    const result = buildRecoveryProbePolicy({
      config: {
        botMode: "paper",
        paperExecutionVenue: "binance_demo_spot",
        paperRecoveryProbeEnabled: true,
        paperSoftBlockerProbeEnabled: true,
        paperSoftBlockerProbeMinEdge: 0.08,
        paperRecoveryProbeMinBookPressure: -0.28,
        maxSpreadBps: 25,
        maxRealizedVolPct: 0.08
      },
      symbol: "INJUSDT",
      capitalGovernor: { allowEntries: true, allowProbeEntries: false, blocked: false },
      reasons: ["meta_followthrough_caution", "meta_neural_caution"],
      openPositionsInMode: [],
      canOpenAnotherPaperLearningPosition: true,
      score: { probability: 0.87 },
      threshold: 0.52,
      recoveryProbeProbabilityFloor: 0.49,
      setupQuality: { score: 0.72 },
      signalQualitySummary: { overallScore: 0.72, executionViability: 0.64 },
      dataQualitySummary: { overallScore: 0.7 },
      confidenceBreakdown: { overallConfidence: 0.68, executionConfidence: 0.64 },
      qualityQuorumSummary: { observeOnly: false, quorumScore: 0.9 },
      marketSnapshot: { book: { bookPressure: 0.12, spreadBps: 4 }, market: { realizedVolPct: 0.02 } },
      newsSummary: { riskScore: 0.08 },
      announcementSummary: { riskScore: 0.06 },
      calendarSummary: { riskScore: 0.08 },
      marketStructureSummary: { riskScore: 0.14 },
      volatilitySummary: { riskScore: 0.18 },
      sessionSummary: { blockerReasons: [] },
      driftSummary: { blockerReasons: [] },
      selfHealState: { learningAllowed: true },
      strategySummary: { family: "market_structure", fitScore: 0.74, confidence: 0.62 },
      regimeSummary: { regime: "trend" },
      minutesSincePortfolioTrade: 180,
      cooldownMinutes: 60
    });

    assert.equal(result.eligible, true);
    assert.equal(result.active, true);
    assert.equal(result.probeMode, "paper_soft_blocker_probe");
    assert.equal(result.softBlockerProbeLane, true);
    assert.equal(result.capitalGovernorProbeState, "not_required_soft_blocker_lane");
    assert.deepEqual(result.probeSoftBlockers, ["meta_followthrough_caution", "meta_neural_caution"]);
  });

  await runCheck("soft-blocker probe lane admits proven bad-veto model confidence near-misses in paper only", async () => {
    const base = {
      config: {
        botMode: "paper",
        paperExecutionVenue: "binance_demo_spot",
        paperRecoveryProbeEnabled: true,
        paperSoftBlockerProbeEnabled: true,
        paperSoftBlockerProbeMinEdge: 0.08,
        paperRecoveryProbeMinBookPressure: -0.28,
        maxSpreadBps: 25,
        maxRealizedVolPct: 0.08
      },
      symbol: "BTCUSDT",
      capitalGovernor: { allowEntries: true, allowProbeEntries: false, blocked: false },
      reasons: ["model_confidence_too_low"],
      openPositionsInMode: [],
      canOpenAnotherPaperLearningPosition: true,
      score: { probability: 0.505, disagreement: 0.05 },
      threshold: 0.55,
      recoveryProbeProbabilityFloor: 0.5,
      setupQuality: { score: 0.7 },
      signalQualitySummary: { overallScore: 0.7, executionViability: 0.64 },
      dataQualitySummary: { overallScore: 0.66 },
      confidenceBreakdown: { overallConfidence: 0.68, executionConfidence: 0.64 },
      lowConfidencePressure: { featureTrustPenalty: 0.03, featureTrustHardRisk: false },
      missedTradeTuningApplied: {
        active: true,
        paperProbeEligible: true,
        targetedBlocker: true,
        blocker: "model_confidence_too_low",
        confidence: 0.74
      },
      qualityQuorumSummary: { observeOnly: false, quorumScore: 0.9 },
      marketSnapshot: { book: { bookPressure: 0.08, spreadBps: 4 }, market: { realizedVolPct: 0.02 } },
      newsSummary: { riskScore: 0.08 },
      announcementSummary: { riskScore: 0.06 },
      calendarSummary: { riskScore: 0.08 },
      marketStructureSummary: { riskScore: 0.14 },
      volatilitySummary: { riskScore: 0.18 },
      sessionSummary: { blockerReasons: [] },
      driftSummary: { blockerReasons: [] },
      selfHealState: { learningAllowed: true },
      strategySummary: { family: "trend_following", fitScore: 0.72, confidence: 0.62 },
      regimeSummary: { regime: "trend" },
      minutesSincePortfolioTrade: 180,
      cooldownMinutes: 60
    };
    const paper = buildRecoveryProbePolicy(base);
    const noEvidence = buildRecoveryProbePolicy({
      ...base,
      missedTradeTuningApplied: {}
    });
    const live = buildRecoveryProbePolicy({
      ...base,
      config: { ...base.config, botMode: "live" }
    });

    assert.equal(paper.eligible, true);
    assert.equal(paper.probeMode, "paper_soft_blocker_probe");
    assert.equal(paper.modelConfidenceBadVetoOverrideEligible, true);
    assert.deepEqual(paper.probeSoftBlockers, ["model_confidence_too_low"]);
    assert.equal(noEvidence.eligible, false);
    assert.equal(noEvidence.modelConfidenceBadVetoOverrideEligible, false);
    assert.equal(live.eligible, false);
    assert.equal(live.badVetoModelConfidenceEvidence, false);
  });

  await runCheck("soft-blocker probe lane stays bounded by edge and hard safety", async () => {
    const base = {
      config: {
        botMode: "paper",
        paperExecutionVenue: "binance_demo_spot",
        paperRecoveryProbeEnabled: true,
        paperSoftBlockerProbeEnabled: true,
        paperSoftBlockerProbeMinEdge: 0.08,
        paperRecoveryProbeMinBookPressure: -0.28,
        maxSpreadBps: 25,
        maxRealizedVolPct: 0.08
      },
      capitalGovernor: { allowEntries: true, allowProbeEntries: false, blocked: false },
      reasons: ["meta_followthrough_caution"],
      openPositionsInMode: [],
      canOpenAnotherPaperLearningPosition: true,
      setupQuality: { score: 0.72 },
      signalQualitySummary: { overallScore: 0.72, executionViability: 0.64 },
      dataQualitySummary: { overallScore: 0.7 },
      confidenceBreakdown: { overallConfidence: 0.68, executionConfidence: 0.64 },
      qualityQuorumSummary: { observeOnly: false, quorumScore: 0.9 },
      marketSnapshot: { book: { bookPressure: 0.12, spreadBps: 4 }, market: { realizedVolPct: 0.02 } },
      newsSummary: { riskScore: 0.08 },
      announcementSummary: { riskScore: 0.06 },
      calendarSummary: { riskScore: 0.08 },
      marketStructureSummary: { riskScore: 0.14 },
      volatilitySummary: { riskScore: 0.18 },
      sessionSummary: { blockerReasons: [] },
      driftSummary: { blockerReasons: [] },
      selfHealState: { learningAllowed: true },
      strategySummary: { family: "market_structure", fitScore: 0.74, confidence: 0.62 },
      regimeSummary: { regime: "trend" },
      minutesSincePortfolioTrade: 180,
      cooldownMinutes: 60
    };
    const weakEdge = buildRecoveryProbePolicy({
      ...base,
      score: { probability: 0.56 },
      threshold: 0.52,
      recoveryProbeProbabilityFloor: 0.49
    });
    const hardSafety = buildRecoveryProbePolicy({
      ...base,
      reasons: ["exchange_safety_blocked", "meta_followthrough_caution"],
      score: { probability: 0.87 },
      threshold: 0.52,
      recoveryProbeProbabilityFloor: 0.49
    });

    assert.equal(weakEdge.eligible, false);
    assert.equal(weakEdge.whyNoProbeAttempt, "soft_blocker_probe_edge_too_low");
    assert.equal(hardSafety.eligible, false);
    assert.ok(hardSafety.hardStopReasons.includes("exchange_safety_blocked"));
  });
}
