import { asArray, nowIso, stableId } from "../utils.js";

export function createNeuralExperiment({ scope = "paper", policyId = "unknown", configHash = "", createdAt = null } = {}) {
  return {
    experimentId: stableId("nr_exp", [scope, policyId, configHash, createdAt || "now"]),
    scope,
    policyId,
    configHash,
    status: "active",
    createdAt: nowIso(createdAt),
    decisions: [],
    audit: []
  };
}

export function updateNeuralExperiment(experiment = {}, event = {}) {
  const next = { ...experiment, audit: [...asArray(experiment.audit), { ...event, at: nowIso(event.at) }] };
  if (["promote", "rollback", "expire", "reject"].includes(event.type)) {
    next.status = event.type === "promote" ? "promotion_candidate" : event.type === "rollback" ? "rolled_back" : event.type;
  }
  return next;
}
