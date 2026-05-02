import path from "node:path";
import { buildTradeThesis } from "../src/runtime/tradeThesis.js";
import { labelExitQuality } from "../src/runtime/exitQuality.js";
import { buildVetoObservation, labelVetoOutcome } from "../src/runtime/vetoOutcome.js";
import { classifyFailureMode } from "../src/runtime/failureLibrary.js";
import { buildRegimeOutcomeLabel, updateRegimeConfusionMatrix } from "../src/runtime/regimeConfusion.js";
import { buildPromotionDossier } from "../src/runtime/promotionDossier.js";
import { buildRollbackWatch } from "../src/runtime/rollbackWatch.js";
import { buildReplayPackQueue, scoreReplayPackCandidate } from "../src/runtime/replayPackScoring.js";
import {
  buildLearningFailureSummary,
  buildLearningPromotionSummary,
  buildLearningReplayPackSummary
} from "../src/runtime/learningAnalytics.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerLearningAnalyticsMaintenanceTests({
  runCheck,
  assert,
  fs,
  os,
  runCli
}) {
  await runCheck("trade thesis builds trend range breakout and fallback safely", async () => {
    const trend = buildTradeThesis({
      decision: { probability: 0.7, createdAt: "2026-01-01T00:00:00.000Z" },
      strategySummary: { family: "trend_following", activeStrategy: "trend_pullback_reclaim" }
    });
    assert.match(trend.primaryReason, /Trend setup/);
    assert.equal(trend.doNotAverageDown, true);

    const range = buildTradeThesis({ strategySummary: { family: "range_grid", activeStrategy: "range_grid_reversion" } });
    assert.match(range.expectedPath, /boundary_rejection/);

    const breakout = buildTradeThesis({ strategySummary: { family: "breakout", activeStrategy: "breakout_retest" } });
    assert.match(breakout.primaryReason, /Breakout/);

    const fallback = buildTradeThesis({
      decision: { apiKey: "secret-value", createdAt: "2026-01-01T00:00:00.000Z" }
    });
    assert.ok(fallback.primaryReason);
    assert.equal(JSON.stringify(fallback).includes("secret-value"), false);
  });

  await runCheck("exit quality labels core categories without changing exits", async () => {
    assert.equal(labelExitQuality({ trade: { pnlPct: 0.02, maximumFavorableExcursionPct: 0.025, exitEfficiencyPct: 0.8 } }).label, "good_exit");
    assert.equal(labelExitQuality({ trade: { pnlPct: -0.005, maximumFavorableExcursionPct: 0.025 } }).label, "late_exit");
    assert.equal(labelExitQuality({ trade: { pnlPct: 0.01, maximumFavorableExcursionPct: 0.04, exitEfficiencyPct: 0.2 } }).label, "early_exit");
    assert.equal(labelExitQuality({ trade: { exitReason: "stop_loss", pnlPct: -0.01, maximumFavorableExcursionPct: 0.015, maximumAdverseExcursionPct: -0.003 } }).label, "stop_too_tight");
    assert.equal(labelExitQuality({ trade: { exitReason: "take_profit", pnlPct: 0.01, maximumFavorableExcursionPct: 0.03 } }).label, "take_profit_too_close");
    assert.equal(labelExitQuality({ trade: { exitReason: "trailing_stop", pnlPct: 0.015, maximumFavorableExcursionPct: 0.02, exitEfficiencyPct: 0.75 } }).label, "trailing_stop_good");
    assert.equal(labelExitQuality({ trade: { executionDragBps: 30, pnlPct: -0.001 } }).label, "execution_drag_exit");
    assert.equal(labelExitQuality({ trade: { exitReason: "news_risk" } }).label, "news_risk_exit");
    assert.equal(labelExitQuality({ trade: { exitReason: "forced_reconcile" } }).label, "forced_reconcile_exit");
    assert.equal(labelExitQuality({ trade: {} }).label, "unknown_exit_quality");
  });

  await runCheck("veto outcomes label avoided losers missed winners neutral and unknown paths", async () => {
    const observation = buildVetoObservation({ decisionId: "d1", symbol: "BTCUSDT", reasons: ["model_confidence_too_low"] });
    assert.equal(observation.rootBlocker, "model_confidence_too_low");
    assert.equal(labelVetoOutcome({ observation, futureMarketPath: { maxFavorableMovePct: 0.002, maxAdverseMovePct: -0.02, closeReturnPct: -0.01, horizonMinutes: 60 } }).label, "good_veto");
    assert.equal(labelVetoOutcome({ observation, futureMarketPath: { maxFavorableMovePct: 0.02, maxAdverseMovePct: -0.002, closeReturnPct: 0.01, horizonMinutes: 60 } }).label, "bad_veto");
    assert.equal(labelVetoOutcome({ observation, futureMarketPath: { maxFavorableMovePct: 0.003, maxAdverseMovePct: -0.003, closeReturnPct: 0.0005, horizonMinutes: 60 } }).label, "neutral_veto");
    assert.equal(labelVetoOutcome({ observation, futureMarketPath: {} }).label, "unknown_veto");
  });

  await runCheck("failure library classifies six operator-review modes", async () => {
    assert.equal(classifyFailureMode({ reconcileSummary: { manualReviewRequired: true } }).failureMode, "reconcile_uncertainty");
    assert.equal(classifyFailureMode({ vetoOutcome: { label: "bad_veto", confidence: 0.9 } }).failureMode, "bad_veto");
    assert.equal(classifyFailureMode({ exitQuality: { label: "early_exit", confidence: 0.8 } }).failureMode, "early_exit");
    assert.equal(classifyFailureMode({ trade: { executionDragBps: 35 } }).failureMode, "execution_drag");
    assert.equal(classifyFailureMode({ decision: { reasons: ["late_entry"] } }).failureMode, "late_entry");
    assert.equal(classifyFailureMode({ decision: { falseBreakoutRisk: 0.8 } }).failureMode, "crowded_breakout");
    assert.equal(classifyFailureMode({ decision: { reasons: ["news_blindspot"] } }).failureMode, "news_blindspot");
    assert.equal(classifyFailureMode({ decision: { dataQualityScore: 0.2 } }).failureMode, "quality_trap");
  });

  await runCheck("regime confusion matrix tracks predicted versus realized outcomes", async () => {
    const trend = buildRegimeOutcomeLabel({ entryRegime: "trend_up", marketPath: { maxFavorableMovePct: 0.02, maxAdverseMovePct: -0.003, closeReturnPct: 0.01 }, trade: { pnlPct: 0.01 } });
    assert.equal(trend.realizedRegime, "trend_up");
    const range = buildRegimeOutcomeLabel({ entryRegime: "trend_up", marketPath: { maxFavorableMovePct: 0.002, maxAdverseMovePct: -0.002, closeReturnPct: 0.0001 }, trade: { pnlPct: -0.001 } });
    assert.equal(range.realizedRegime, "range");
    const failed = buildRegimeOutcomeLabel({ entryRegime: "breakout_release", marketPath: { failedBreakout: true, closeReturnPct: -0.01 }, trade: { pnlPct: -0.01 } });
    assert.equal(failed.realizedRegime, "failed_breakout");
    const unknown = buildRegimeOutcomeLabel({});
    assert.equal(unknown.predictedRegime, "unknown");
    const matrix = updateRegimeConfusionMatrix(updateRegimeConfusionMatrix({}, trend), range);
    assert.equal(matrix.trend_up.trend_up.count, 1);
    assert.equal(matrix.trend_up.range.count, 1);
  });

  await runCheck("promotion dossier is read-only and blocks weak evidence", async () => {
    assert.equal(buildPromotionDossier({ paperStats: { tradeCount: 2 }, freshness: { score: 1 } }).status, "not_ready");
    const strong = buildPromotionDossier({
      paperStats: { tradeCount: 50, winRate: 0.62, avgNetPnl: 0.006, maxDrawdownPct: -0.03 },
      shadowStats: { tradeCount: 20 },
      failureStats: { maxSeverityScore: 0.1 },
      freshness: { score: 0.9 },
      config: { promotionDossierMinPaperTrades: 20 }
    });
    assert.equal(strong.status, "canary_candidate");
    assert.equal(strong.autoPromotionAllowed, false);
    assert.equal(buildPromotionDossier({ paperStats: { tradeCount: 50, winRate: 0.7, avgNetPnl: 0.01 }, failureStats: { maxSeverityScore: 0.9 }, freshness: { score: 1 } }).status, "not_ready");
    assert.equal(buildPromotionDossier({ paperStats: { tradeCount: 50, winRate: 0.7, avgNetPnl: 0.01 }, failureStats: { maxSeverityScore: 0.1 }, freshness: { score: 0.2 } }).status, "not_ready");
  });

  await runCheck("rollback watch remains diagnostics-only for normal watch and rollback states", async () => {
    assert.equal(buildRollbackWatch({}).status, "normal");
    assert.equal(buildRollbackWatch({ driftSummary: { score: 0.8 } }).status, "watch");
    const rollback = buildRollbackWatch({ liveStats: { scope: "breakout", drawdownPct: -0.1 } });
    assert.equal(rollback.status, "rollback_recommended");
    assert.equal(rollback.automaticRollbackExecuted, false);
  });

  await runCheck("replay pack scoring prioritizes bad veto and reconcile uncertainty", async () => {
    const badVeto = scoreReplayPackCandidate({ id: "bad", vetoOutcome: { label: "bad_veto" } });
    const reconcile = scoreReplayPackCandidate({ id: "rec", reconcileSummary: { manualReviewRequired: true } });
    const queue = buildReplayPackQueue([
      { id: "generic", reasonCount: 1 },
      { id: "bad", vetoOutcome: { label: "bad_veto" } },
      { id: "rec", reconcileSummary: { manualReviewRequired: true } }
    ]);
    assert.equal(badVeto.priority >= 90, true);
    assert.equal(reconcile.priority >= badVeto.priority, true);
    assert.equal(queue[0].packType, "reconcile_uncertainty");
  });

  await runCheck("learning analytics summaries and CLI commands stay read-only", async () => {
    const journal = {
      trades: [
        { id: "t1", symbol: "BTCUSDT", brokerMode: "paper", pnlPct: 0.02, maximumFavorableExcursionPct: 0.03, exitEfficiencyPct: 0.8 },
        { id: "t2", symbol: "ETHUSDT", brokerMode: "paper", pnlPct: -0.01, maximumFavorableExcursionPct: 0.02 }
      ],
      counterfactuals: [
        { id: "c1", symbol: "SOLUSDT", futureMarketPath: { maxFavorableMovePct: 0.02, maxAdverseMovePct: -0.002, closeReturnPct: 0.01, horizonMinutes: 60 } }
      ]
    };
    const runtime = { lastAnalysisAt: "2026-01-01T00:00:00.000Z", drift: {} };
    assert.equal(buildLearningFailureSummary({ journal, runtime }).tradeCount, 2);
    assert.equal(buildLearningPromotionSummary({ journal, runtime }).promotionDossierSummary.autoPromotionAllowed, false);
    assert.equal(buildLearningReplayPackSummary({ journal, runtime }).replayPackCandidates.length > 0, true);

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "learning-cli-"));
    const runtimeDir = path.join(root, "runtime");
    const { StateStore } = await import("../src/storage/stateStore.js");
    const store = new StateStore(runtimeDir);
    await store.init();
    await store.saveRuntime(runtime);
    await store.saveJournal(journal);
    const lines = [];
    const previousLog = console.log;
    console.log = (line) => lines.push(line);
    try {
      await runCli({
        command: "learning:replay-packs",
        args: [],
        config: { runtimeDir, projectRoot: root },
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        processState: { exitCode: undefined }
      });
    } finally {
      console.log = previousLog;
    }
    const output = JSON.parse(lines[0]);
    assert.ok(Array.isArray(output.replayPackCandidates));
  });

  await runCheck("dashboard normalizer keeps learning analytics optional", async () => {
    const normalized = normalizeDashboardSnapshotPayload({
      learningAnalytics: {
        failureLibrarySummary: { late_entry: 2 },
        exitQualitySummary: { good_exit: 1 },
        promotionDossierSummary: { status: "not_ready" },
        rollbackWatchSummary: { status: "normal" },
        regimeConfusionSummary: { trend_up: {} }
      }
    });
    assert.equal(normalized.failureLibrarySummary.late_entry, 2);
    assert.equal(normalized.promotionDossierSummary.status, "not_ready");
    assert.equal(normalizeDashboardSnapshotPayload({}).failureLibrarySummary.status, "unavailable");
  });
}
