import { buildTradeThesis } from "./tradeThesis.js";
import { labelExitQuality } from "./exitQuality.js";
import { buildVetoObservation, labelVetoOutcome } from "./vetoOutcome.js";
import { classifyFailureMode } from "./failureLibrary.js";
import { buildRegimeOutcomeLabel } from "./regimeConfusion.js";
import { scoreReplayPackCandidate } from "./replayPackScoring.js";
import { classifyTradeAutopsy } from "./tradeAutopsy.js";

function first(value, fallback = null) {
  return value == null ? fallback : value;
}

function recommendedAction({ failureMode = {}, vetoOutcome = {}, exitQuality = {}, reconcileSummary = {} } = {}) {
  if (reconcileSummary.manualReviewRequired || failureMode.failureMode === "reconcile_uncertainty") {
    return "resolve_reconcile_uncertainty_before_policy_changes";
  }
  if (vetoOutcome.label === "bad_veto") {
    return "review_bad_veto_blocker_scope";
  }
  if (exitQuality.label && exitQuality.label !== "unknown_exit_quality" && exitQuality.label !== "good_exit") {
    return "review_exit_quality_and_trade_path";
  }
  if (failureMode.failureMode && failureMode.failureMode !== "unknown") {
    return failureMode.recommendedReviewAction || "review_failure_mode";
  }
  return "collect_more_evidence";
}

export function buildLearningEvidenceRecord({
  decision = {},
  trade = null,
  futureMarketPath = null,
  marketAfterExit = {},
  reconcileSummary = {},
  marketPath = {},
  strategySummary = {}
} = {}) {
  const thesis = buildTradeThesis({
    decision,
    candidate: decision,
    marketSnapshot: decision.marketSnapshot || {},
    riskSummary: decision.riskSummary || decision.entryDiagnostics || {},
    strategySummary: strategySummary || decision.strategySummary || decision.strategy || {}
  });
  const exitQuality = trade
    ? labelExitQuality({ position: trade.position || {}, trade, marketAfterExit, thesis })
    : { label: "unknown_exit_quality", confidence: 0.2, reasons: ["missing_trade"] };
  const vetoObservation = !trade ? buildVetoObservation(decision) : null;
  const vetoOutcome = futureMarketPath
    ? labelVetoOutcome({ observation: vetoObservation || buildVetoObservation(decision), futureMarketPath })
    : { label: "unknown_veto", confidence: 0.2, reasons: ["future_market_path_missing"] };
  const regimeOutcome = buildRegimeOutcomeLabel({
    entryRegime: decision.regime || decision.regimeSummary?.regime || trade?.regimeAtEntry || null,
    marketPath: futureMarketPath || marketPath || {},
    trade: trade || {}
  });
  const autopsy = trade ? classifyTradeAutopsy({ ...trade, marketAfterExit, decision }) : null;
  const failureMode = classifyFailureMode({
    decision,
    trade: trade || {},
    exitQuality,
    vetoOutcome,
    reconcileSummary
  });
  const replay = scoreReplayPackCandidate({
    id: first(decision.decisionId, trade?.id),
    decisionId: decision.decisionId || decision.id || null,
    tradeId: trade?.id || trade?.tradeId || null,
    failureMode: failureMode.failureMode,
    vetoOutcome,
    exitQuality,
    regimeOutcome,
    reconcileSummary,
    reasonCount: Array.isArray(decision.reasons) ? decision.reasons.length : 0,
    symbol: decision.symbol || trade?.symbol || null,
    strategy: thesis.setupType || decision.strategyId || null
  });
  return {
    decisionId: decision.decisionId || decision.id || null,
    tradeId: trade?.id || trade?.tradeId || null,
    setupType: thesis.setupType || decision.setupType || null,
    thesis,
    exitQuality,
    vetoOutcome,
    failureMode,
    tradeAutopsy: autopsy,
    regimeOutcome,
    replayPriority: replay,
    recommendedAction: recommendedAction({ failureMode, vetoOutcome, exitQuality, reconcileSummary })
  };
}

export function summarizeLearningEvidence(records = []) {
  const items = Array.isArray(records) ? records : [];
  const counts = {};
  for (const item of items) {
    const key = item.failureMode?.failureMode || item.vetoOutcome?.label || item.exitQuality?.label || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    status: items.length ? "ready" : "empty",
    count: items.length,
    counts,
    topReplayCandidates: items
      .map((item) => item.replayPriority)
      .filter(Boolean)
      .sort((left, right) => (right.priority || 0) - (left.priority || 0))
      .slice(0, 5)
  };
}
