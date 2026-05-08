import { evaluateNeuralLiveExecutionGate } from "./neuralLiveExecutionGate.js";

export function buildNeuralLiveExecutionIntent({ candidate = {}, gateInput = {}, config = {} } = {}) {
  const gate = evaluateNeuralLiveExecutionGate({ ...gateInput, config });
  if (!gate.canSubmitLiveIntent) {
    return {
      accepted: false,
      reason: "neural_live_gate_blocked",
      gate,
      directLiveBrokerCall: false
    };
  }
  return {
    accepted: true,
    intent: {
      type: "neural_candidate_intent",
      symbol: candidate.symbol || "UNKNOWN",
      side: candidate.side || "BUY",
      strategy: candidate.strategy || "neural_shadow_candidate",
      sizeMultiplierCap: gate.caps.maxPositionFraction,
      route: ["decisionPipeline", "riskManager", "executionEngine", "broker"]
    },
    gate,
    directLiveBrokerCall: false
  };
}
