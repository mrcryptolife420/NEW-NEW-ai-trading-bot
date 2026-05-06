import { buildFeatureActivationDecision } from "./featureActivationGovernor.js";
import { scoreReplayPackCandidate } from "./replayPackScoring.js";
import { isHardSafetyReason } from "../risk/reasonRegistry.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finite(value, digits = 4) {
  return Number(num(value, 0).toFixed(digits));
}

function text(value, fallback = "") {
  const result = `${value ?? ""}`.trim();
  return result || fallback;
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeReasons(value = []) {
  return arr(value).map((reason) => text(reason).toLowerCase()).filter(Boolean);
}

function championWouldTrade(decision = {}) {
  if (decision.approved != null) return bool(decision.approved);
  if (decision.wouldTrade != null) return bool(decision.wouldTrade);
  const probability = num(decision.probability ?? decision.score?.probability, 0);
  const threshold = num(decision.threshold ?? decision.effectiveThreshold, 1);
  return probability >= threshold && !normalizeReasons(decision.reasons).some(isHardSafetyReason);
}

function challengerWouldTrade(challenger = {}, hardSafetyActive = false) {
  if (hardSafetyActive) return false;
  if (challenger.approved != null) return bool(challenger.approved);
  if (challenger.wouldTrade != null) return bool(challenger.wouldTrade);
  if (challenger.wouldBlock === true) return false;
  const probability = num(challenger.probability ?? challenger.score?.probability, 0);
  const threshold = num(challenger.threshold ?? challenger.effectiveThreshold, 1);
  return probability >= threshold;
}

function summarizeOutcome(outcome = {}) {
  if (!outcome || typeof outcome !== "object") {
    return { available: false, hypotheticalPnlPct: 0, label: "unknown" };
  }
  const pnlPct = num(outcome.pnlPct ?? outcome.hypotheticalPnlPct ?? outcome.closeReturnPct, 0);
  return {
    available: true,
    hypotheticalPnlPct: finite(pnlPct, 4),
    label: outcome.label || (pnlPct > 0.002 ? "would_win" : pnlPct < -0.002 ? "would_lose" : "flat")
  };
}

function buildShadowRecord({
  championDecision = {},
  challenger = {},
  activation = {},
  index = 0
} = {}) {
  const championReasons = normalizeReasons(championDecision.reasons || championDecision.blockers);
  const challengerReasons = normalizeReasons(challenger.reasons || challenger.blockers);
  const hardSafetyActive = championReasons.some(isHardSafetyReason) || challengerReasons.some(isHardSafetyReason);
  const championTrade = championWouldTrade(championDecision);
  const shadowTrade = challengerWouldTrade(challenger, hardSafetyActive);
  const outcome = summarizeOutcome(challenger.replayOutcome || challenger.futureOutcome || challenger.hypotheticalOutcome);
  const disagreementTypes = [];
  if (championTrade !== shadowTrade) disagreementTypes.push("trade_permission");
  if (text(championDecision.setupType || championDecision.strategy?.setupStyle) !== text(challenger.setupType || challenger.strategy?.setupStyle)) {
    disagreementTypes.push("setup_type");
  }
  const championRoot = text(championDecision.rootBlocker || championReasons[0] || "none", "none");
  const challengerRoot = text(challenger.rootBlocker || challengerReasons[0] || "none", "none");
  if (championRoot !== challengerRoot) disagreementTypes.push("root_blocker");
  const replayPriority = scoreReplayPackCandidate({
    id: challenger.id,
    decisionId: championDecision.decisionId || championDecision.id,
    failureMode: outcome.label === "would_win" && !shadowTrade ? "bad_veto" : null,
    reasonCount: championReasons.length + challengerReasons.length,
    symbol: championDecision.symbol || challenger.symbol
  });

  return {
    recordType: "shadow_challenger",
    shadowOnly: true,
    executionAllowed: false,
    portfolioImpactAllowed: false,
    index,
    decisionId: championDecision.decisionId || championDecision.id || null,
    symbol: text(championDecision.symbol || challenger.symbol, "UNKNOWN").toUpperCase(),
    challengerId: text(challenger.id || challenger.name, `challenger_${index + 1}`),
    challengerType: text(challenger.type || challenger.source, "strategy_challenger"),
    activationStage: activation.effectiveStage || "shadow_only",
    champion: {
      wouldTrade: championTrade,
      setupType: championDecision.setupType || championDecision.strategy?.setupStyle || null,
      rootBlocker: championRoot,
      probability: finite(championDecision.probability ?? championDecision.score?.probability, 4),
      threshold: finite(championDecision.threshold ?? championDecision.effectiveThreshold, 4)
    },
    challenger: {
      wouldTrade: shadowTrade,
      wouldBlock: !shadowTrade,
      setupType: challenger.setupType || challenger.strategy?.setupStyle || null,
      rootBlocker: hardSafetyActive ? "hard_safety_dominates" : challengerRoot,
      probability: finite(challenger.probability ?? challenger.score?.probability, 4),
      threshold: finite(challenger.threshold ?? challenger.effectiveThreshold, 4),
      reasons: challengerReasons
    },
    differenceVsChampion: {
      disagrees: disagreementTypes.length > 0,
      types: disagreementTypes
    },
    hardSafetyDominates: hardSafetyActive,
    hypotheticalOutcome: outcome,
    replayPriority,
    activation,
    liveBehaviorChanged: false
  };
}

export function buildShadowStrategyTournament({
  championDecision = {},
  challengers = [],
  config = {},
  runtimeState = {},
  activationEvidence = { fallbackSafe: true, testsPassed: true }
} = {}) {
  const activation = buildFeatureActivationDecision({
    feature: {
      id: "shadow_strategy_tournament",
      requestedStage: "shadow_only",
      fallbackSafe: true,
      testsPassed: true
    },
    requestedStage: "shadow_only",
    evidence: activationEvidence,
    config,
    runtimeState
  });
  const items = arr(challengers)
    .filter((challenger) => challenger && typeof challenger === "object")
    .map((challenger, index) => buildShadowRecord({ championDecision, challenger, activation, index }));
  const disagreements = items.filter((item) => item.differenceVsChampion.disagrees);
  const wouldTradeCount = items.filter((item) => item.challenger.wouldTrade).length;
  const hardSafetyDominatedCount = items.filter((item) => item.hardSafetyDominates).length;
  const missingChallengerOutput = arr(challengers).length === 0;
  return {
    status: missingChallengerOutput ? "empty" : disagreements.length ? "disagreement" : "aligned",
    count: items.length,
    disagreementCount: disagreements.length,
    wouldTradeCount,
    wouldBlockCount: items.length - wouldTradeCount,
    hardSafetyDominatedCount,
    records: items,
    activationSummary: activation,
    missingChallengerOutput,
    shadowOnly: true,
    executionAllowed: false,
    portfolioImpactAllowed: false,
    liveBehaviorChanged: false,
    recommendedAction: missingChallengerOutput
      ? "collect_shadow_challenger_outputs"
      : disagreements.length
        ? "review_shadow_disagreements_in_replay_before_paper_influence"
        : "continue_shadow_collection"
  };
}

export function summarizeShadowStrategyTournament(input = {}) {
  return buildShadowStrategyTournament(input);
}
