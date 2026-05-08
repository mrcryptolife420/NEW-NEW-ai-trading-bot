import { applySafetyBounds } from "./safetyBoundLayer.js";
import { finiteNumber } from "./utils.js";

export function auditNeuralProposal({ proposal = {}, policy = {}, botMode = "paper", replayResult = null, walkForwardResult = null, stressResult = null, riskLocks = {} } = {}) {
  const bounds = applySafetyBounds(proposal, { policy, botMode });
  const reasons = [...bounds.reasons];
  if (riskLocks.panicStop || riskLocks.manualReviewRequired) reasons.push("conflict_with_current_risk_locks");
  if (finiteNumber(proposal.evidence?.events, 0) < finiteNumber(policy.minEvidenceEvents, 20) && !["safe_gate_tighten", "model_rollback"].includes(proposal.type)) {
    reasons.push("insufficient_evidence");
  }
  if (proposal.evidence?.symbols?.length === 1 && finiteNumber(proposal.evidence?.events, 0) >= 20) reasons.push("symbol_concentration");
  if (proposal.evidence?.regimes?.length === 1 && finiteNumber(proposal.evidence?.events, 0) >= 20) reasons.push("regime_concentration");
  if (replayResult && replayResult.status !== "passed") reasons.push("replay_not_passed");
  if (walkForwardResult && walkForwardResult.status !== "passed") reasons.push("walk_forward_not_passed");
  if (stressResult && stressResult.status !== "passed") reasons.push("stress_not_passed");
  const allowed = reasons.length === 0;
  return {
    allowed,
    reasons,
    safeAlternative: allowed ? null : {
      type: "tighten_only",
      change: {},
      scope: { mode: proposal.scope?.mode || "paper" }
    },
    dashboard: {
      proposalId: proposal.proposalId,
      allowed,
      reasons,
      stage: allowed ? "auditor_passed" : "blocked"
    }
  };
}
