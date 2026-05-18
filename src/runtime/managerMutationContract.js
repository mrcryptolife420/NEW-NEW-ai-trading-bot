const CONTRACTS = [
  {
    id: "start",
    method: "start",
    allowedStates: ["ready", "stopped"],
    blockedStates: ["stopping", "closed"],
    effect: "starts_loop",
    liveSensitive: false,
    waitsForStop: false
  },
  {
    id: "stop",
    method: "stop",
    allowedStates: ["created", "initializing", "ready", "running", "stopping", "stopped", "degraded"],
    blockedStates: ["closed"],
    effect: "requests_or_completes_stop",
    liveSensitive: false,
    waitsForStop: true,
    idempotent: true
  },
  {
    id: "run_cycle_once",
    method: "runCycleOnce",
    allowedStates: ["ready", "stopped", "degraded"],
    blockedStates: ["running", "stopping", "closed"],
    effect: "single_cycle",
    liveSensitive: false,
    waitsForStop: false
  },
  {
    id: "refresh_analysis",
    method: "refreshAnalysis",
    allowedStates: ["ready", "stopped", "degraded"],
    blockedStates: ["running", "stopping", "closed"],
    effect: "refreshes_analysis",
    liveSensitive: false,
    waitsForStop: false
  },
  {
    id: "set_mode",
    method: "setMode",
    allowedStates: ["ready", "running", "stopped", "degraded"],
    blockedStates: ["stopping", "closed"],
    effect: "writes_env_and_reloads",
    liveSensitive: true,
    waitsForStop: true
  },
  {
    id: "apply_config_profile",
    method: "applyConfigProfile",
    allowedStates: ["ready", "running", "stopping", "stopped", "degraded"],
    blockedStates: ["closed"],
    effect: "writes_profile_env_and_reloads_or_defers",
    liveSensitive: true,
    waitsForStop: false,
    reloadMayDeferWhileRunning: true
  },
  {
    id: "complete_setup",
    method: "completeSetup",
    allowedStates: ["ready", "running", "stopping", "stopped", "degraded"],
    blockedStates: ["closed"],
    effect: "applies_profile_and_runs_checks_with_deferred_reload",
    liveSensitive: true,
    waitsForStop: false,
    reloadMayDeferWhileRunning: true
  }
];

const CONTRACT_BY_ID = new Map(CONTRACTS.map((contract) => [contract.id, contract]));
const CONTRACT_BY_METHOD = new Map(CONTRACTS.map((contract) => [contract.method, contract]));

export function listManagerMutationContracts() {
  return CONTRACTS.map((contract) => ({ ...contract }));
}

export function getManagerMutationContract(idOrMethod) {
  return CONTRACT_BY_ID.get(idOrMethod) || CONTRACT_BY_METHOD.get(idOrMethod) || null;
}

export function canRunManagerMutation(idOrMethod, lifecycleState = "created") {
  const contract = getManagerMutationContract(idOrMethod);
  if (!contract) {
    return {
      allowed: false,
      reason: "unknown_mutation_contract",
      lifecycleState
    };
  }
  if (contract.blockedStates.includes(lifecycleState)) {
    return {
      allowed: false,
      reason: `lifecycle_${lifecycleState}_blocked`,
      contract
    };
  }
  return {
    allowed: contract.allowedStates.includes(lifecycleState),
    reason: contract.allowedStates.includes(lifecycleState) ? "allowed" : `lifecycle_${lifecycleState}_not_allowed`,
    contract
  };
}

export function buildPendingStopSummary(pendingStop = null, nowMs = Date.now()) {
  if (!pendingStop) {
    return null;
  }
  const requestedAtMs = Date.parse(pendingStop.requestedAt || "");
  return {
    reason: pendingStop.reason || "stop",
    requestedAt: pendingStop.requestedAt || null,
    acceptedBy: pendingStop.acceptedBy || "manager",
    timeoutMs: Number.isFinite(Number(pendingStop.timeoutMs)) ? Number(pendingStop.timeoutMs) : null,
    ageMs: Number.isFinite(requestedAtMs) ? Math.max(0, nowMs - requestedAtMs) : null,
    safeActions: ["status", "snapshot", "health", "readiness"],
    canRetry: true
  };
}
