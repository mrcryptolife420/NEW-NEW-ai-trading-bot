import { evaluatePolicy } from "../policy/policyEngine.js";

export function buildBrokerRouteRequest(input = {}) {
  return {
    symbol: input.symbol || null,
    confidence: Number(input.confidence ?? 0),
    strategyId: input.strategyId || "unknown",
    strategyStage: input.strategyStage || "normal",
    accountProfile: input.accountProfile || "paper",
    configuredBroker: input.configuredBroker || "paper",
    neuralExperiment: Boolean(input.neuralExperiment),
    exchangeHealth: input.exchangeHealth || { status: "ok" },
    symbolRisk: input.symbolRisk || "normal",
    requiresApproval: Boolean(input.requiresApproval),
    allowLiveMain: Boolean(input.allowLiveMain),
    liquidity: input.liquidity || {}
  };
}

export function routeBroker(requestInput = {}, { policyEngine = evaluatePolicy, audit = null } = {}) {
  const request = buildBrokerRouteRequest(requestInput);
  let targetBroker = request.configuredBroker;
  const reasonCodes = [];
  if (request.confidence < 0.45) { targetBroker = "paper"; reasonCodes.push("low_confidence_shadow_paper"); }
  if (request.neuralExperiment) { targetBroker = "neural_sandbox"; reasonCodes.push("neural_experiment_sandbox"); }
  if (request.strategyStage === "new") { targetBroker = "paper"; reasonCodes.push("new_strategy_paper_only"); }
  if (request.strategyStage === "canary") { targetBroker = "live_small"; reasonCodes.push("canary_live_small_only"); }
  if (request.symbolRisk === "high") { targetBroker = "paper"; reasonCodes.push("high_risk_symbol_shadow"); }
  if (request.exchangeHealth.status === "degraded") { targetBroker = "paper"; reasonCodes.push("exchange_degraded_fallback"); }

  const policy = policyEngine({
    accountProfile: request.accountProfile,
    exchangeHealth: request.exchangeHealth,
    requiresApproval: request.requiresApproval,
    allowLiveMain: request.allowLiveMain,
    liquidity: request.liquidity,
    strategy: { isNew: request.strategyStage === "new" },
    symbolRisk: request.symbolRisk,
    scopes: [targetBroker]
  });
  if (policy.decision === "block") targetBroker = "blocked";
  if (policy.decision === "requires_approval") targetBroker = "approval_queue";
  const decision = { request, targetBroker, decision: policy.decision, reasonCodes: [...new Set([...reasonCodes, ...policy.reasonCodes])], policy };
  audit?.(decision);
  return decision;
}
