import { evaluateAntiOverfitGovernor } from "../ai/antiOverfitGovernor.js";

export const CANARY_RELEASE_STATES = Object.freeze([
  "shadow",
  "paper",
  "canary",
  "limited_live",
  "normal",
  "rollback_recommended"
]);

const LIVE_STATES = new Set(["canary", "limited_live", "normal"]);

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeState(value) {
  const state = `${value || "shadow"}`.toLowerCase();
  return CANARY_RELEASE_STATES.includes(state) ? state : "shadow";
}

function antiOverfitPassed({ antiOverfit = null, proposedChanges = [], evidence = {}, config = {} }) {
  const verdict = antiOverfit || evaluateAntiOverfitGovernor({ proposedChanges, evidence, config });
  return {
    verdict,
    passed: !["blocked", "rollback_recommended"].includes(verdict?.status)
  };
}

function parityPassed(parity = {}) {
  const status = `${parity.status || parity.parityStatus || "unknown"}`.toLowerCase();
  if (["pass", "passed", "ready", "ok"].includes(status)) return true;
  if (parity.fillModelTooOptimistic === true) return false;
  const score = num(parity.parityScore, Number.NaN);
  return Number.isFinite(score) && score >= 0.7;
}

export function buildCanaryReleaseGate({
  scope = "global",
  requestedState = "shadow",
  currentState = "shadow",
  evidence = {},
  proposedChanges = [],
  antiOverfit = null,
  paperLiveParity = null,
  rollbackWatch = null,
  safetyReview = {},
  canaryReview = {},
  config = {}
} = {}) {
  const targetState = normalizeState(requestedState);
  const fromState = normalizeState(currentState);
  const minSamples = Math.max(1, Math.round(num(config.canaryMinSamples ?? config.challengerMinTrades, 30)));
  const paperTrades = num(evidence.paperTrades ?? evidence.paperSamples ?? evidence.sampleSize, 0);
  const shadowTrades = num(evidence.shadowTrades ?? evidence.shadowSamples, 0);
  const liveTrades = num(evidence.liveTrades ?? evidence.liveSamples, 0);
  const totalSamples = paperTrades + shadowTrades + liveTrades;
  const blockingReasons = [];
  const warnings = [];
  const requiredEvidence = [];
  const anti = antiOverfitPassed({ antiOverfit, proposedChanges, evidence, config });
  const parityOk = parityPassed(paperLiveParity || {});
  const rollbackStatus = `${rollbackWatch?.status || "normal"}`.toLowerCase();
  const source = `${evidence.source || evidence.evidenceSource || "unknown"}`.toLowerCase();

  if (targetState === "rollback_recommended" || rollbackStatus === "rollback_recommended") {
    blockingReasons.push("rollback_recommended");
  }
  if (targetState !== "shadow" && totalSamples < minSamples) {
    blockingReasons.push("insufficient_samples");
    requiredEvidence.push(`min_samples:${minSamples}`);
  }
  if (!anti.passed) {
    blockingReasons.push("anti_overfit_blocked");
  }
  if (LIVE_STATES.has(targetState)) {
    if (source === "paper" && liveTrades <= 0) blockingReasons.push("paper_only_evidence_cannot_promote_live");
    if (!parityOk) blockingReasons.push("paper_live_parity_not_passed");
    if (!safetyReview?.passed) blockingReasons.push("missing_safety_review");
    if (!canaryReview?.passed && targetState !== "canary") blockingReasons.push("missing_canary_review");
    requiredEvidence.push("explicit_safety_review", "paper_live_parity", "anti_overfit_pass");
  }
  if (targetState === "normal" && liveTrades < minSamples) {
    blockingReasons.push("normal_live_requires_live_canary_samples");
  }
  if (targetState === "paper" && `${config.botMode || "paper"}` !== "paper") {
    blockingReasons.push("paper_state_requires_paper_mode");
  }
  if (targetState === "shadow") {
    warnings.push("shadow_mode_simulates_only_no_orders");
  }

  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  return {
    scope,
    status: uniqueBlockingReasons.length ? "blocked" : "allowed",
    currentState: fromState,
    requestedState: targetState,
    allowedState: uniqueBlockingReasons.length ? fromState : targetState,
    blockingReasons: uniqueBlockingReasons,
    warnings: [...new Set(warnings)],
    requiredEvidence: [...new Set(requiredEvidence)],
    evidence: {
      paperTrades,
      shadowTrades,
      liveTrades,
      totalSamples,
      minSamples,
      source
    },
    antiOverfit: anti.verdict,
    paperLiveParity: paperLiveParity || { status: "unknown" },
    rollbackWatch: rollbackWatch || { status: "normal" },
    autoPromotesLive: false,
    recommendedAction: uniqueBlockingReasons.length
      ? "keep_change_in_shadow_or_paper_until_governance_evidence_passes"
      : LIVE_STATES.has(targetState)
        ? "eligible_for_operator_reviewed_limited_rollout_only"
        : "eligible_for_non_live_stage"
  };
}

export function buildCanaryReleaseSummary(items = []) {
  const gates = arr(items);
  const countsByState = Object.fromEntries(CANARY_RELEASE_STATES.map((state) => [state, 0]));
  let blocked = 0;
  for (const gate of gates) {
    const state = normalizeState(gate?.allowedState || gate?.currentState);
    countsByState[state] += 1;
    if (gate?.status === "blocked") blocked += 1;
  }
  return {
    status: blocked > 0 ? "blocked" : gates.length ? "ok" : "empty",
    total: gates.length,
    blocked,
    countsByState,
    liveReviewRequired: gates.some((gate) => LIVE_STATES.has(normalizeState(gate?.requestedState)))
  };
}
