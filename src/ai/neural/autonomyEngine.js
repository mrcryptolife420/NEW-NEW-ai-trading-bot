import { buildLearningEvent } from "./learning/learningEventStore.js";
import { buildNeuralProposal, generateNeuralProposals } from "./proposalEngine.js";
import { applySafetyBounds } from "./safetyBoundLayer.js";
import { auditNeuralProposal } from "./neuralSafetyAuditor.js";
import { runFastNeuralReplay } from "./fastReplayEngine.js";
import { runNeuralWalkForward } from "./neuralWalkForward.js";
import { runNeuralStressScenarios } from "./stressScenarioEngine.js";
import { advanceNeuralPromotion, triggerNeuralRollback } from "./promotionPipeline.js";
import { buildNeuralOverlay } from "./overlayStore.js";

export function runNeuralAutonomyEngine({ rawEvents = [], proposal = null, currentConfig = {}, replayCases = [], policy = {}, botMode = "paper", shadow = true } = {}) {
  const events = rawEvents.map((input) => buildLearningEvent(input).event);
  const selectedProposal = proposal || generateNeuralProposals({ events, currentConfig }).proposals[0] || buildNeuralProposal({
    type: "safe_gate_tighten",
    scope: { mode: botMode },
    change: { key: "MODEL_THRESHOLD", from: currentConfig.modelThreshold ?? 0.52, to: (currentConfig.modelThreshold ?? 0.52) + 0.005, delta: 0.005 },
    reason: "default_safe_tighten",
    events
  });
  const bounds = applySafetyBounds(selectedProposal, { policy, botMode });
  const replay = bounds.allowed ? runFastNeuralReplay({ proposal: bounds.proposal, cases: replayCases.length ? replayCases : events, policy }) : null;
  const walkForward = replay?.status === "passed" ? runNeuralWalkForward({ proposal: bounds.proposal, cases: replayCases.length ? replayCases : events, windowSize: policy.windowSize || 5, policy }) : null;
  const stress = walkForward?.status === "passed" ? runNeuralStressScenarios({ proposal: bounds.proposal, highRisk: selectedProposal.scope?.mode === "live", policy }) : null;
  const auditor = auditNeuralProposal({ proposal: bounds.proposal, policy, botMode, replayResult: replay, walkForwardResult: walkForward, stressResult: stress });
  const promotion = auditor.allowed ? advanceNeuralPromotion({ proposal: bounds.proposal, bounds, replay, walkForward, stress, shadow }) : { proposal: bounds.proposal, stage: "blocked", allowed: false, reasons: auditor.reasons };
  const overlay = promotion.allowed && ["paper_sandbox", "paper_probation", "paper_promoted"].includes(promotion.stage)
    ? buildNeuralOverlay({ proposal: promotion.proposal, mode: botMode })
    : { status: "not_applied", reasons: promotion.reasons || auditor.reasons, overlay: {} };
  return {
    status: overlay.status === "ready" ? "paper_overlay_ready" : auditor.allowed ? promotion.stage : "blocked",
    learningEvents: events,
    proposal: promotion.proposal,
    bounds,
    replay,
    walkForward,
    stress,
    auditor,
    promotion,
    overlay,
    rollback: (reason = "manual") => triggerNeuralRollback({ proposal: promotion.proposal, reason })
  };
}
