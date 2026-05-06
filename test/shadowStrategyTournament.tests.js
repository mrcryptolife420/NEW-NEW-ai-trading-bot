import { buildShadowStrategyTournament } from "../src/runtime/shadowStrategyTournament.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerShadowStrategyTournamentTests({ runCheck, assert }) {
  await runCheck("shadow challenger can disagree without executing", async () => {
    const summary = buildShadowStrategyTournament({
      championDecision: {
        decisionId: "d1",
        symbol: "BTCUSDT",
        approved: false,
        probability: 0.48,
        threshold: 0.6,
        reasons: ["model_confidence_too_low"],
        setupType: "mean_reversion"
      },
      challengers: [{
        id: "transformer",
        probability: 0.72,
        threshold: 0.6,
        setupType: "breakout_retest",
        futureOutcome: { pnlPct: 0.012 }
      }]
    });
    assert.equal(summary.status, "disagreement");
    assert.equal(summary.executionAllowed, false);
    assert.equal(summary.portfolioImpactAllowed, false);
    assert.equal(summary.records[0].recordType, "shadow_challenger");
    assert.equal(summary.records[0].challenger.wouldTrade, true);
    assert.ok(summary.records[0].differenceVsChampion.types.includes("trade_permission"));
  });

  await runCheck("shadow tournament keeps champion execution path unchanged", async () => {
    const championDecision = {
      decisionId: "d2",
      symbol: "ETHUSDT",
      approved: true,
      probability: 0.7,
      threshold: 0.6,
      setupType: "trend_continuation"
    };
    const before = JSON.stringify(championDecision);
    const summary = buildShadowStrategyTournament({
      championDecision,
      challengers: [{ id: "sequence", probability: 0.2, threshold: 0.6, wouldBlock: true }]
    });
    assert.equal(JSON.stringify(championDecision), before);
    assert.equal(summary.records[0].champion.wouldTrade, true);
    assert.equal(summary.records[0].shadowOnly, true);
    assert.equal(summary.records[0].executionAllowed, false);
  });

  await runCheck("shadow decisions persist separately as shadow challenger records", async () => {
    const summary = buildShadowStrategyTournament({
      championDecision: { decisionId: "d3", symbol: "SOLUSDT", approved: false },
      challengers: [
        { id: "meta_selector", probability: 0.62, threshold: 0.6 },
        { id: "allocation_bandit", probability: 0.4, threshold: 0.6 }
      ]
    });
    assert.equal(summary.count, 2);
    assert.equal(summary.records.every((record) => record.recordType === "shadow_challenger"), true);
    assert.equal(summary.records.every((record) => record.decisionId === "d3"), true);
  });

  await runCheck("hard safety blocker dominates challenger approval", async () => {
    const summary = buildShadowStrategyTournament({
      championDecision: {
        decisionId: "d4",
        symbol: "BNBUSDT",
        approved: false,
        reasons: ["exchange_truth_freeze"]
      },
      challengers: [{ id: "transformer", probability: 0.95, threshold: 0.5, approved: true }]
    });
    assert.equal(summary.hardSafetyDominatedCount, 1);
    assert.equal(summary.records[0].challenger.wouldTrade, false);
    assert.equal(summary.records[0].challenger.rootBlocker, "hard_safety_dominates");
    assert.equal(summary.executionAllowed, false);
  });

  await runCheck("missing challenger output is fallback-safe", async () => {
    const summary = buildShadowStrategyTournament({
      championDecision: { decisionId: "d5", symbol: "XRPUSDT" },
      challengers: []
    });
    assert.equal(summary.status, "empty");
    assert.equal(summary.count, 0);
    assert.equal(summary.missingChallengerOutput, true);
    assert.equal(summary.recommendedAction, "collect_shadow_challenger_outputs");
  });

  await runCheck("shadow tournament dashboard fallback is safe", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.shadowStrategyTournamentSummary.status, "empty");
    const summary = buildShadowStrategyTournament({
      championDecision: { decisionId: "d6", symbol: "ADAUSDT", approved: false },
      challengers: [{ id: "challenger", probability: 0.7, threshold: 0.6 }]
    });
    const normalized = normalizeDashboardSnapshotPayload({ shadowStrategyTournamentSummary: summary });
    assert.equal(normalized.shadowStrategyTournamentSummary.count, 1);
    assert.equal(normalized.shadowStrategyTournamentSummary.executionAllowed, false);
  });
}
