import { labelExitQuality } from "./exitQuality.js";
import { classifyFailureMode } from "./failureLibrary.js";
import { buildPromotionDossier } from "./promotionDossier.js";
import { buildRollbackWatch } from "./rollbackWatch.js";
import { buildReplayPackQueue } from "./replayPackScoring.js";
import { buildVetoObservation, labelVetoOutcome } from "./vetoOutcome.js";
import { buildRegimeOutcomeLabel, updateRegimeConfusionMatrix } from "./regimeConfusion.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function countBy(items, pick) {
  const counts = {};
  for (const item of items) {
    const key = pick(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function average(values = []) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : 0;
}

export function buildLearningFailureSummary({ journal = {}, runtime = {}, config = {} } = {}) {
  const trades = arr(journal.trades).slice(-100);
  const reviews = trades.map((trade) => {
    const exitQuality = labelExitQuality({ trade, thesis: trade.tradeThesis || trade.thesis || {} });
    const failure = classifyFailureMode({ trade, exitQuality });
    return { tradeId: trade.id || trade.tradeId || null, symbol: trade.symbol || null, exitQuality, failure };
  });
  return {
    status: trades.length ? "ok" : "insufficient_data",
    tradeCount: trades.length,
    exitQualitySummary: countBy(reviews, (item) => item.exitQuality.label),
    failureLibrarySummary: countBy(reviews, (item) => item.failure.failureMode),
    topFailures: reviews
      .filter((item) => item.failure.failureMode !== "unknown")
      .slice(0, 8),
    runtimeFailureHints: runtime.learningAnalytics?.failureLibrarySummary || null,
    configHash: config.configHash || null
  };
}

export function buildLearningPromotionSummary({ journal = {}, runtime = {}, config = {} } = {}) {
  const paperTrades = arr(journal.trades).filter((trade) => (trade.brokerMode || trade.mode || "paper") !== "live");
  const wins = paperTrades.filter((trade) => Number(trade.pnlPct ?? trade.netPnlPct ?? trade.realizedPnlPct ?? 0) > 0).length;
  const stats = {
    tradeCount: paperTrades.length,
    winRate: paperTrades.length ? wins / paperTrades.length : 0,
    avgNetPnl: average(paperTrades.map((trade) => trade.pnlPct ?? trade.netPnlPct ?? trade.realizedPnlPct)),
    maxDrawdownPct: Number(runtime.performanceDiagnosis?.maxDrawdownPct ?? 0)
  };
  const failureSummary = buildLearningFailureSummary({ journal, runtime, config });
  const dossier = buildPromotionDossier({
    scope: { mode: "paper", id: "global" },
    paperStats: stats,
    shadowStats: { tradeCount: arr(journal.counterfactuals).length },
    failureStats: {
      maxSeverityScore: failureSummary.topFailures.length ? 0.5 : 0.1,
      knownFailureModes: Object.keys(failureSummary.failureLibrarySummary || {})
    },
    freshness: { score: runtime.lastAnalysisAt ? 0.8 : 0.3 },
    config
  });
  const rollbackWatch = buildRollbackWatch({
    liveStats: { scope: "global", drawdownPct: Number(runtime.performanceDiagnosis?.liveDrawdownPct ?? 0) },
    canaryStats: runtime.canaryStats || {},
    failureStats: { maxSeverityScore: failureSummary.topFailures.length >= 5 ? 0.75 : 0.25 },
    driftSummary: runtime.drift || {}
  });
  return {
    status: "ok",
    promotionDossierSummary: dossier,
    rollbackWatchSummary: rollbackWatch,
    note: "Diagnostics only; no live promotion or rollback is executed."
  };
}

export function buildLearningReplayPackSummary({ journal = {}, runtime = {} } = {}) {
  const blocked = arr(journal.counterfactuals || runtime.counterfactuals || []).slice(-80);
  const trades = arr(journal.trades).slice(-40);
  const samples = [
    ...blocked.map((item) => ({
      id: item.id || item.decisionId,
      symbol: item.symbol,
      scope: item.strategy || item.symbol,
      vetoOutcome: item.vetoOutcome || labelVetoOutcome({
        observation: buildVetoObservation(item),
        futureMarketPath: item.futureMarketPath || {}
      }),
      reasons: item.reasons || item.blockerReasons || []
    })),
    ...trades.map((trade) => {
      const exitQuality = labelExitQuality({ trade });
      const regimeOutcome = buildRegimeOutcomeLabel({
        entryRegime: trade.entryRegime || trade.regime,
        marketPath: trade.marketPath || {},
        trade
      });
      return {
        id: trade.id || trade.tradeId,
        tradeId: trade.id || trade.tradeId,
        symbol: trade.symbol,
        exitQuality,
        regimeOutcome,
        reasonCount: arr(trade.reasons || []).length
      };
    }),
    ...(runtime.exchangeSafety?.autoReconcileSummary ? [{
      id: "latest_reconcile",
      failureMode: runtime.exchangeSafety.autoReconcileSummary.manualReviewRequired ? "reconcile_uncertainty" : null,
      reconcileSummary: runtime.exchangeSafety.autoReconcileSummary
    }] : [])
  ];
  const queue = buildReplayPackQueue(samples).slice(0, 20);
  const vetoLabels = samples
    .map((sample) => sample.vetoOutcome?.label)
    .filter(Boolean)
    .map((label) => ({ label }));
  return {
    status: queue.length ? "ok" : "insufficient_data",
    replayPackCandidates: queue,
    vetoOutcomeSummary: countBy(vetoLabels, (item) => item.label),
    regimeConfusionSummary: trades.reduce((matrix, trade) => updateRegimeConfusionMatrix(matrix, buildRegimeOutcomeLabel({
      entryRegime: trade.entryRegime || trade.regime,
      marketPath: trade.marketPath || {},
      trade
    })), {})
  };
}
