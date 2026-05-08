function arr(value) {
  return Array.isArray(value) ? value : [];
}

function upper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

export function buildFastPaperExecutionIntent({
  config = {},
  triggerResult = {},
  normalCycle = {},
  now = new Date().toISOString()
} = {}) {
  const mode = `${config.botMode || "paper"}`.toLowerCase();
  const paperOnly = config.fastExecutionPaperOnly !== false;
  const symbol = upper(triggerResult.symbol || triggerResult.queueItem?.symbol);
  const reasonCodes = [];
  if (mode !== "paper") reasonCodes.push("paper_execution_only");
  if (!paperOnly) reasonCodes.push("paper_only_flag_required_for_fast_paper");
  if (triggerResult.status !== "queued") reasonCodes.push(...arr(triggerResult.reasonCodes).concat("fast_trigger_not_queued"));
  if (normalCycle.allSymbolsCovered === false) reasonCodes.push("normal_cycle_coverage_missing");
  return {
    status: reasonCodes.length ? "blocked" : "paper_intent_ready",
    symbol,
    intent: reasonCodes.length ? null : {
      type: "paper_fast_entry_intent",
      symbol,
      candidateId: triggerResult.candidate?.id || triggerResult.candidate?.candidateId || triggerResult.queueItem?.candidateId || symbol,
      source: "fast_signal_trigger",
      createdAt: now,
      paperOnly: true,
      requiredChecks: triggerResult.queueItem?.requiredChecks || []
    },
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    normalCyclePreserved: normalCycle.allSymbolsCovered !== false,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function evaluateLiveFastApprovalGate({
  config = {},
  operatorApproval = {},
  canary = {},
  rollback = {},
  safety = {}
} = {}) {
  const reasonCodes = [];
  if (`${config.botMode || "paper"}`.toLowerCase() !== "live") reasonCodes.push("not_live_mode");
  if (config.liveFastObserveOnly !== false) reasonCodes.push("live_fast_observe_only");
  if (config.fastExecutionPaperOnly !== false) reasonCodes.push("fast_execution_paper_only");
  if (operatorApproval.explicitApproval !== true) reasonCodes.push("missing_operator_approval");
  if (canary.status !== "approved") reasonCodes.push("missing_canary_approval");
  if (rollback.status === "rollback_recommended" || rollback.recommended === true) reasonCodes.push("rollback_recommended");
  if (safety.exchangeSafetyOk === false || safety.liveReadinessOk === false) reasonCodes.push("live_safety_not_ready");
  return {
    allowLiveFastExecution: reasonCodes.length === 0,
    reasonCodes,
    rollbackSafetyShutdown: reasonCodes.includes("rollback_recommended") || reasonCodes.includes("live_safety_not_ready"),
    requiresExplicitApproval: true,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
