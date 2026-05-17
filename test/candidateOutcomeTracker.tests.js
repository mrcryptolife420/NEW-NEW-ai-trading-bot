import {
  buildCandidateOutcomeObservations,
  labelCandidateOutcome,
  summarizeCandidateOutcomes,
  buildCandidateOutcomeTrackerSummary
} from "../src/runtime/candidateOutcomeTracker.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function makeDecision(overrides = {}) {
  return {
    decisionId: "decision-1",
    symbol: "BTCUSDT",
    createdAt: "2026-05-05T00:00:00.000Z",
    probability: 0.52,
    threshold: 0.55,
    referencePrice: 100,
    reasons: ["model_confidence_too_low"],
    rootBlocker: "model_confidence_too_low",
    strategySummary: { activeStrategy: "trend_following", family: "trend_following" },
    regimeSummary: { regime: "trend" },
    featureQuality: { status: "usable", missing: [] },
    dataLineage: {
      marketDataAt: "2026-05-05T00:00:00.000Z",
      featureDataAt: "2026-05-05T00:00:00.000Z",
      featuresHash: "features-1",
      configHash: "config-1",
      sources: ["binance_rest"]
    },
    ...overrides
  };
}

export async function registerCandidateOutcomeTrackerTests({ runCheck, assert }) {
  await runCheck("candidate outcome tracker queues 15m 1h and 4h observations with scope metadata", async () => {
    const observations = buildCandidateOutcomeObservations(makeDecision());
    assert.equal(observations.length, 3);
    assert.deepEqual(observations.map((item) => item.horizonMinutes), [15, 60, 240]);
    assert.equal(observations[0].blockerFamily, "quality");
    assert.equal(observations[0].strategyFamily, "trend_following");
    assert.equal(observations[0].regime, "trend");
    assert.equal(observations[0].learningEligible, true);
    assert.equal(observations[0].relaxationAllowed, false);
  });

  await runCheck("candidate outcome tracker labels avoided loser as good_veto", async () => {
    const [observation] = buildCandidateOutcomeObservations(makeDecision());
    const outcome = labelCandidateOutcome({
      observation,
      futureMarketPath: {
        maxFavorableMovePct: 0.002,
        maxAdverseMovePct: -0.02,
        closeReturnPct: -0.01,
        horizonMinutes: 15
      }
    });
    assert.equal(outcome.label, "good_veto");
    assert.equal(outcome.learningEligible, true);
    assert.equal(outcome.relaxationAllowed, false);
  });

  await runCheck("candidate outcome tracker preserves data lineage quality and learning weight", async () => {
    const [observation] = buildCandidateOutcomeObservations(makeDecision({
      candidateFreshness: { dataFreshnessStatus: "fresh", marketDataAgeMs: 500, featureAgeMs: 700 },
      expectedNetEdgePct: 0.004,
      spreadBps: 3
    }));
    const outcome = labelCandidateOutcome({
      observation,
      futureMarketPath: {
        maxFavorableMovePct: 0.025,
        maxAdverseMovePct: -0.004,
        closeReturnPct: 0.012,
        horizonMinutes: 60
      }
    });
    const summary = summarizeCandidateOutcomes([outcome]);
    assert.equal(outcome.dataLineage.featuresHash, "features-1");
    assert.equal(outcome.dataQuality.dataFreshnessStatus, "fresh");
    assert.equal(outcome.dataQuality.marketDataAgeMs, 500);
    assert.equal(outcome.learningWeight, 1);
    assert.equal(summary.lineageCoverage.withFeaturesHash, 1);
    assert.equal(summary.lineageCoverage.withConfigHash, 1);
    assert.equal(summary.lineageCoverage.averageLearningWeight, 1);
  });

  await runCheck("candidate outcome tracker labels missed winner as bad_veto", async () => {
    const [observation] = buildCandidateOutcomeObservations(makeDecision());
    const outcome = labelCandidateOutcome({
      observation,
      futureMarketPath: {
        maxFavorableMovePct: 0.025,
        maxAdverseMovePct: -0.004,
        closeReturnPct: 0.012,
        horizonMinutes: 60
      }
    });
    assert.equal(outcome.label, "bad_veto");
    const summary = summarizeCandidateOutcomes([outcome]);
    assert.equal(summary.missedWinnerSummary.count, 1);
    assert.equal(summary.badVetoSummary.byBlocker[0].blocker, "model_confidence_too_low");
  });

  await runCheck("candidate outcome tracker labels flat noisy path as neutral_veto", async () => {
    const [observation] = buildCandidateOutcomeObservations(makeDecision());
    const outcome = labelCandidateOutcome({
      observation,
      futureMarketPath: {
        maxFavorableMovePct: 0.004,
        maxAdverseMovePct: -0.004,
        closeReturnPct: 0.001,
        horizonMinutes: 60
      }
    });
    assert.equal(outcome.label, "neutral_veto");
  });

  await runCheck("candidate outcome tracker labels missing future candles as unknown_veto", async () => {
    const [observation] = buildCandidateOutcomeObservations(makeDecision());
    const outcome = labelCandidateOutcome({
      observation,
      futureCandles: []
    });
    assert.equal(outcome.label, "unknown_veto");
    assert.ok(outcome.outcomeReasons.includes("future_market_path_incomplete"));
  });

  await runCheck("candidate outcome tracker never allows hard safety relaxation", async () => {
    const [observation] = buildCandidateOutcomeObservations(makeDecision({
      reasons: ["exchange_safety_blocked"],
      rootBlocker: "exchange_safety_blocked"
    }));
    const outcome = labelCandidateOutcome({
      observation,
      futureMarketPath: {
        maxFavorableMovePct: 0.04,
        maxAdverseMovePct: -0.001,
        closeReturnPct: 0.02,
        horizonMinutes: 60
      }
    });
    const summary = summarizeCandidateOutcomes([outcome]);
    assert.equal(outcome.label, "bad_veto");
    assert.equal(outcome.hardSafetyBlocked, true);
    assert.equal(outcome.learningEligible, false);
    assert.equal(outcome.relaxationAllowed, false);
    assert.equal(summary.hardSafetyRelaxationAllowed, false);
    assert.equal(summary.hardSafetyCount, 1);
  });

  await runCheck("candidate outcome tracker exposes dashboard fallback summaries", async () => {
    const [observation] = buildCandidateOutcomeObservations(makeDecision());
    const outcome = labelCandidateOutcome({
      observation,
      futureMarketPath: {
        maxFavorableMovePct: 0.025,
        maxAdverseMovePct: -0.004,
        closeReturnPct: 0.012,
        horizonMinutes: 60
      }
    });
    const candidateOutcomeSummary = buildCandidateOutcomeTrackerSummary({
      decisions: [makeDecision()],
      outcomes: [outcome]
    });
    const normalized = normalizeDashboardSnapshotPayload({
      learningAnalytics: {
        candidateOutcomeSummary
      }
    });
    assert.equal(normalized.candidateOutcomeSummary.count, 1);
    assert.equal(normalized.missedWinnerSummary.count, 1);
    assert.equal(normalized.badVetoSummary.count, 1);
  });
}
