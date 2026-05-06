import { buildPaperStrategyCohortScorecards } from "../src/runtime/paperStrategyCohortScorecard.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function baseCandidate(overrides = {}) {
  return {
    id: overrides.id || "candidate-1",
    brokerMode: "paper",
    strategy: { id: "trend_pullback_reclaim", family: "trend" },
    regime: "trend",
    session: "us",
    symbolCluster: "majors",
    featureActivationStage: "paper_only",
    ...overrides
  };
}

export async function registerPaperStrategyCohortScorecardTests({ runCheck, assert }) {
  await runCheck("paper strategy cohort scorecard handles empty cohorts", async () => {
    const summary = buildPaperStrategyCohortScorecards();
    assert.equal(summary.status, "empty");
    assert.equal(summary.count, 0);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("paper strategy cohort scorecard marks low sample weak evidence", async () => {
    const summary = buildPaperStrategyCohortScorecards({
      minSampleSize: 4,
      candidates: [baseCandidate({ approved: false, rootBlocker: "model_confidence_too_low" })]
    });
    assert.equal(summary.status, "ready");
    assert.equal(summary.cohorts[0].evidenceStatus, "weak_evidence");
    assert.equal(summary.cohorts[0].recommendation, "collect_more_paper_samples");
  });

  await runCheck("paper strategy cohort scorecard surfaces bad-veto-heavy cohorts without hard safety relief", async () => {
    const outcomes = [
      baseCandidate({ outcomeLabel: "bad_veto" }),
      baseCandidate({ outcomeLabel: "bad_veto" }),
      baseCandidate({ outcomeLabel: "good_veto" }),
      baseCandidate({ outcomeLabel: "bad_veto" })
    ];
    const summary = buildPaperStrategyCohortScorecards({
      minSampleSize: 3,
      vetoOutcomes: outcomes
    });
    assert.equal(summary.cohorts[0].evidenceStatus, "bad_veto_heavy");
    assert.equal(summary.cohorts[0].hardSafetyRelaxationAllowed, false);
    assert.equal(summary.autoPromotionAllowed, false);
  });

  await runCheck("paper strategy cohort scorecard recommends review for negative edge cohorts", async () => {
    const trades = Array.from({ length: 5 }, (_, index) => ({
      id: `t-${index}`,
      brokerMode: "paper",
      closedAt: "2026-05-06T12:00:00.000Z",
      strategyAtEntry: { id: "range_grid_reversion", family: "range" },
      regimeAtEntry: "chop",
      sessionAtEntry: "asia",
      symbolCluster: "alts",
      netPnlPct: -0.006,
      exitQualityLabel: "late_exit",
      executionDragBps: 8
    }));
    const summary = buildPaperStrategyCohortScorecards({
      minSampleSize: 4,
      trades
    });
    assert.equal(summary.cohorts[0].evidenceStatus, "negative_edge_review");
    assert.equal(summary.cohorts[0].recommendation, "review_or_quarantine_in_paper_only");
    assert.equal(summary.cohorts[0].autoRetirementAllowed, false);
  });

  await runCheck("paper strategy cohort scorecard includes exit quality execution drag and data warnings", async () => {
    const summary = buildPaperStrategyCohortScorecards({
      minSampleSize: 2,
      candidates: [
        baseCandidate({ dataQualityWarnings: ["stale_book"] }),
        baseCandidate({ approved: true })
      ],
      trades: [{
        brokerMode: "paper",
        closedAt: "2026-05-06T12:00:00.000Z",
        strategyAtEntry: { id: "trend_pullback_reclaim", family: "trend" },
        regimeAtEntry: "trend",
        sessionAtEntry: "us",
        symbolCluster: "majors",
        netPnlPct: 0.004,
        exitQualityLabel: "good_exit",
        executionDragBps: 4
      }]
    });
    const tradeCohort = summary.cohorts.find((cohort) => cohort.closedTrades === 1);
    assert.equal(tradeCohort.exitQualityCounts.good_exit, 1);
    assert.equal(tradeCohort.executionDragBps, 4);
    assert.ok(summary.cohorts.some((cohort) => cohort.dataQualityWarningRate > 0));
  });

  await runCheck("paper strategy cohort scorecard ignores live auto-promotion", async () => {
    const summary = buildPaperStrategyCohortScorecards({
      minSampleSize: 2,
      trades: [
        {
          brokerMode: "paper",
          closedAt: "2026-05-06T12:00:00.000Z",
          strategyAtEntry: { id: "breakout_retest", family: "breakout" },
          regimeAtEntry: "breakout",
          netPnlPct: 0.01
        },
        {
          brokerMode: "paper",
          closedAt: "2026-05-06T12:10:00.000Z",
          strategyAtEntry: { id: "breakout_retest", family: "breakout" },
          regimeAtEntry: "breakout",
          netPnlPct: 0.012
        }
      ]
    });
    assert.equal(summary.cohorts[0].evidenceStatus, "positive_paper_edge");
    assert.equal(summary.autoPromotionAllowed, false);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("dashboard normalizer keeps paper strategy cohort optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.paperStrategyCohortSummary.status, "empty");
    const normalized = normalizeDashboardSnapshotPayload({
      learningAnalytics: {
        paperStrategyCohortSummary: { status: "ready", count: 1, cohorts: [{ id: "paper|trend" }] }
      }
    });
    assert.equal(normalized.paperStrategyCohortSummary.count, 1);
  });
}
