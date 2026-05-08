import { asArray, finiteNumber, mean, nowIso, stableId } from "./utils.js";

export const NEURAL_PROPOSAL_TYPES = Object.freeze([
  "threshold_adjustment",
  "safe_gate_tighten",
  "safe_gate_relax_paper_only",
  "feature_weight_adjustment",
  "strategy_weight_adjustment",
  "position_size_bias",
  "exit_logic_adjustment",
  "stop_loss_multiplier_adjustment",
  "take_profit_multiplier_adjustment",
  "trailing_stop_adjustment",
  "blocker_weight_adjustment",
  "regime_filter_adjustment",
  "session_filter_adjustment",
  "symbol_quarantine",
  "strategy_quarantine",
  "model_candidate_promotion",
  "model_rollback"
]);

const MIN_EVIDENCE = 20;

export function summarizeLearningEvidence(events = []) {
  const items = asArray(events);
  const wins = items.filter((event) => finiteNumber(event.pnlPct, 0) > 0).length;
  const losses = items.filter((event) => finiteNumber(event.pnlPct, 0) < 0).length;
  const badVetoCount = items.filter((event) => event.label === "bad_rejection" || event.type === "missed_trade_bad_veto").length;
  const highSlippageCount = items.filter((event) => event.flags?.high_slippage || event.type === "slippage_high").length;
  return {
    events: items.length,
    wins,
    losses,
    badVetoCount,
    highSlippageCount,
    avgPnlPct: mean(items.map((event) => event.pnlPct)),
    symbols: [...new Set(items.map((event) => event.symbol).filter(Boolean))],
    regimes: [...new Set(items.map((event) => event.regime).filter(Boolean))],
    featureHashes: [...new Set(items.map((event) => event.featuresHash).filter(Boolean))]
  };
}

export function buildNeuralProposal({ type, scope = {}, change = {}, reason = null, events = [], risk = {}, attribution = {}, clock = null } = {}) {
  const createdAt = nowIso(clock);
  const normalizedType = NEURAL_PROPOSAL_TYPES.includes(type) ? type : "threshold_adjustment";
  const evidence = { ...summarizeLearningEvidence(events), ...(change.evidence || {}) };
  const status = evidence.events >= MIN_EVIDENCE || ["symbol_quarantine", "strategy_quarantine", "model_rollback", "safe_gate_tighten"].includes(normalizedType)
    ? "proposed"
    : "needs_more_evidence";
  const proposal = {
    proposalId: stableId("neural_prop", [createdAt, normalizedType, scope.mode, scope.symbol, scope.strategy, change.key, change.to]),
    createdAt,
    type: normalizedType,
    scope: {
      mode: scope.mode || "paper",
      symbol: scope.symbol || "ALL",
      strategy: scope.strategy || "ALL",
      regime: scope.regime || "ALL"
    },
    change: {
      key: change.key || "MODEL_THRESHOLD",
      from: finiteNumber(change.from, 0),
      to: finiteNumber(change.to, change.from ?? 0),
      delta: finiteNumber(change.delta, finiteNumber(change.to, 0) - finiteNumber(change.from, 0))
    },
    reason: reason || inferProposalReason(normalizedType, evidence),
    evidence: {
      ...evidence,
      expectedImprovement: finiteNumber(risk.expectedImprovement ?? evidence.avgPnlPct, 0)
    },
    risk: {
      maxDrawdownDelta: finiteNumber(risk.maxDrawdownDelta, 0),
      exposureDelta: finiteNumber(risk.exposureDelta, 0),
      safetyImpact: risk.safetyImpact || inferSafetyImpact(normalizedType, scope)
    },
    attribution,
    status,
    stage: "proposed",
    auditTrail: [{
      at: createdAt,
      type: "proposal_created",
      status,
      reason: status === "needs_more_evidence" ? "insufficient_evidence" : "evidence_attached"
    }]
  };
  return proposal;
}

export function generateNeuralProposals({ events = [], currentConfig = {}, scope = {} } = {}) {
  const evidence = summarizeLearningEvidence(events);
  const proposals = [];
  if (evidence.badVetoCount >= 3) {
    const current = finiteNumber(currentConfig.modelThreshold, 0.52);
    proposals.push(buildNeuralProposal({
      type: "safe_gate_relax_paper_only",
      scope: { mode: "paper", ...scope },
      change: { key: "MODEL_THRESHOLD", from: current, to: current - 0.005, delta: -0.005 },
      reason: "bad_veto_rate_high",
      events,
      risk: { safetyImpact: "paper_only_relaxation", expectedImprovement: 0.01 }
    }));
  }
  if (evidence.losses > evidence.wins) {
    const current = finiteNumber(currentConfig.modelThreshold, 0.52);
    proposals.push(buildNeuralProposal({
      type: "safe_gate_tighten",
      scope: { mode: scope.mode || "paper", ...scope },
      change: { key: "MODEL_THRESHOLD", from: current, to: current + 0.005, delta: 0.005 },
      reason: "loss_rate_high",
      events,
      risk: { safetyImpact: "tighten_safety", expectedImprovement: 0.006 }
    }));
  }
  if (evidence.highSlippageCount >= 2) {
    proposals.push(buildNeuralProposal({
      type: "feature_weight_adjustment",
      scope: { mode: "paper", ...scope },
      change: { key: "execution.slippageWeight", from: 0.2, to: 0.24, delta: 0.04 },
      reason: "high_slippage_execution_weight",
      events,
      risk: { safetyImpact: "paper_weight_adjustment", expectedImprovement: 0.004 }
    }));
  }
  return { proposals, evidence };
}

function inferProposalReason(type, evidence) {
  if (type === "safe_gate_relax_paper_only") return "bad_veto_rate_high";
  if (type === "safe_gate_tighten") return "loss_or_drawdown_risk";
  if (evidence.highSlippageCount > 0) return "execution_cost_degradation";
  return "neural_evidence_update";
}

function inferSafetyImpact(type, scope) {
  if (type === "safe_gate_tighten" || type.endsWith("_quarantine") || type === "model_rollback") return "tighten_or_reduce_risk";
  if (scope.mode === "live") return "live_suggestion_only";
  if (type.includes("relax")) return "paper_only_relaxation";
  return "paper_or_sandbox_mutation";
}
