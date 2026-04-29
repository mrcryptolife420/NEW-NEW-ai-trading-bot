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
}
