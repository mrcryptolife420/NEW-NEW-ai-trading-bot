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

function safeNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value, fallback = 0.3) {
  const numeric = safeNumber(value, fallback);
  return Math.min(1, Math.max(0, numeric));
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

function resolveRecordConfidence({ thesis = {}, exitQuality = {}, vetoOutcome = {}, failureMode = {}, regimeOutcome = {}, replay = {}, trade = null } = {}) {
  const values = [
    exitQuality.confidence,
    vetoOutcome.confidence,
    failureMode.confidence,
    regimeOutcome.confidence,
    replay.priority != null ? replay.priority / 100 : null,
    trade ? 0.7 : null,
    thesis.primaryReason ? 0.55 : null
  ]
    .map((value) => safeNumber(value, null))
    .filter(Number.isFinite);
  if (!values.length) {
    return 0.25;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

export function buildLearningEvidenceRecord({
  decision = {},
  trade = null,
  futureMarketPath = null,
  marketAfterExit = {},
  reconcileSummary = {},
  marketPath = {},
  strategySummary = {},
  tradeAttribution = null,
  paperLiveParity = null
} = {}) {
  const symbol = decision.symbol || trade?.symbol || null;
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
    symbol,
    strategy: thesis.setupType || decision.strategyId || null
  });
  const confidence = resolveRecordConfidence({
    thesis,
    exitQuality,
    vetoOutcome,
    failureMode,
    regimeOutcome,
    replay,
    trade
  });
  return {
    decisionId: decision.decisionId || decision.id || null,
    tradeId: trade?.id || trade?.tradeId || null,
    symbol,
    setupType: thesis.setupType || decision.setupType || null,
    thesis,
    exitQuality,
    vetoOutcome,
    failureMode,
    tradeAutopsy: autopsy,
    tradeAttribution: tradeAttribution || trade?.tradeAttribution || trade?.attribution || null,
    regimeOutcome,
    paperLiveParity: paperLiveParity || trade?.paperLiveParity || decision.paperLiveParity || null,
    replayPriority: replay,
    recommendedAction: recommendedAction({ failureMode, vetoOutcome, exitQuality, reconcileSummary }),
    confidence: clamp01(confidence, 0.25)
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
