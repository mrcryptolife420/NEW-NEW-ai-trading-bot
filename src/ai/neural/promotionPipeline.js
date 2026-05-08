import { nowIso } from "./utils.js";

export const NEURAL_PROMOTION_STAGES = Object.freeze([
  "proposed",
  "bounds_checked",
  "replay_passed",
  "backtest_passed",
  "stress_passed",
  "shadow_active",
  "paper_sandbox",
  "paper_probation",
  "paper_promoted",
  "live_review_needed"
]);

export function advanceNeuralPromotion({ proposal = {}, bounds = null, replay = null, walkForward = null, stress = null, shadow = false, paperMetrics = null, clock = null } = {}) {
  const auditTrail = [...(proposal.auditTrail || [])];
  let stage = proposal.stage || proposal.status || "proposed";
  const reasons = [];
  if (bounds?.allowed !== true) reasons.push(...(bounds?.reasons || ["bounds_not_checked"]));
  else stage = "bounds_checked";
  if (stage === "bounds_checked") {
    if (replay?.status === "passed") stage = "replay_passed";
    else reasons.push("replay_not_passed");
  }
  if (stage === "replay_passed") {
    if (walkForward?.status === "passed") stage = "backtest_passed";
    else reasons.push("walk_forward_not_passed");
  }
  if (stage === "backtest_passed") {
    if (stress?.status === "passed") stage = "stress_passed";
    else reasons.push("stress_not_passed");
  }
  if (stage === "stress_passed" && shadow) stage = "shadow_active";
  if (stage === "shadow_active") stage = "paper_sandbox";
  if (stage === "paper_sandbox" && paperMetrics?.probationReady) stage = "paper_probation";
  if (stage === "paper_probation" && paperMetrics?.passed) stage = "paper_promoted";
  if (stage === "paper_promoted" && proposal.scope?.mode === "live") stage = "live_review_needed";
  auditTrail.push({ at: nowIso(clock), type: "promotion_stage_evaluated", stage, reasons });
  return {
    proposal: {
      ...proposal,
      stage,
      status: reasons.length ? "blocked" : stage,
      auditTrail,
      rollbackable: true,
      expiresAt: proposal.expiresAt || expiryIso(clock)
    },
    stage,
    allowed: reasons.length === 0,
    reasons,
    auditEvent: {
      type: "neural_promotion_stage",
      proposalId: proposal.proposalId,
      stage,
      reasons
    }
  };
}

export function triggerNeuralRollback({ proposal = {}, reason = "operator_manual_rollback", previousOverlay = {} } = {}) {
  return {
    status: "rolled_back",
    proposal: {
      ...proposal,
      status: "rolled_back",
      stage: "rolled_back",
      rollbackReason: reason
    },
    restoredOverlay: previousOverlay,
    auditEvent: {
      type: "neural_rollback",
      proposalId: proposal.proposalId,
      reason,
      restoredKeys: Object.keys(previousOverlay)
    }
  };
}

function expiryIso(clock) {
  const now = clock ? new Date(clock) : new Date();
  now.setUTCDate(now.getUTCDate() + 7);
  return now.toISOString();
}
