function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function upper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

export function buildFastExecutionTrace({
  candidate = {},
  trigger = {},
  preflight = {},
  featureCache = {},
  latency = {},
  exitFastLane = {},
  now = new Date().toISOString()
} = {}) {
  const symbol = upper(candidate.symbol || trigger.symbol);
  const expired = candidate.expired === true || candidate.candidateFreshness?.expired === true || arr(trigger.reasonCodes).includes("candidate_expired");
  const preflightLatencyMs = finite(preflight.latencyMs, 0);
  const streamToSignalMs = finite(latency.streamToSignalMs, 0);
  const signalToRiskMs = finite(latency.signalToRiskMs, 0);
  const riskToIntentMs = finite(latency.riskToIntentMs, 0);
  const totalLatencyMs = preflightLatencyMs + streamToSignalMs + signalToRiskMs + riskToIntentMs;
  const targetMs = finite(latency.targetMs ?? latency.latencyBudgetMs ?? preflight.latencyBudgetMs, 0);
  const reasonCodes = [...new Set(arr(trigger.reasonCodes).concat(arr(preflight.reasonCodes)).filter(Boolean))];
  const orderIntentReady = !expired &&
    (trigger.status === "queued" || trigger.status === "ready") &&
    preflight.allow === true &&
    reasonCodes.length === 0;
  return {
    traceId: `fast-trace-${symbol || "UNKNOWN"}-${now}`,
    symbol,
    createdAt: now,
    candidateId: candidate.id || candidate.candidateId || trigger.candidateId || symbol || null,
    status: trigger.status || (preflight.allow === false ? "blocked" : "observed"),
    reasonCodes,
    orderIntentReady,
    preflight: {
      allow: preflight.allow === true,
      latencyMs: preflightLatencyMs,
      under100ms: preflightLatencyMs <= 100,
      reasonCodes: arr(preflight.reasonCodes)
    },
    freshness: candidate.candidateFreshness || {
      dataFreshnessStatus: candidate.dataFreshnessStatus || "unknown",
      marketDataAgeMs: finite(candidate.marketDataAgeMs, 0),
      featureAgeMs: finite(candidate.featureAgeMs, 0),
      expired
    },
    featureAge: featureCache.groups || featureCache.featureAge || {},
    latency: {
      streamToSignalMs,
      signalToRiskMs,
      riskToIntentMs,
      totalLatencyMs,
      biggestBottleneck: latency.biggestBottleneck || null
    },
    latencyBudget: {
      targetMs,
      totalLatencyMs,
      withinBudget: targetMs > 0 ? totalLatencyMs <= targetMs : null,
      overBudgetMs: targetMs > 0 ? Math.max(0, totalLatencyMs - targetMs) : 0
    },
    dataLineage: candidate.dataLineage || trigger.dataLineage || {},
    exitDecisionDelayMs: finite(exitFastLane.exitDecisionDelayMs, 0),
    candidateExpired: expired,
    auditEvent: {
      type: expired ? "fast_candidate_expired" : "fast_execution_trace",
      symbol,
      candidateId: candidate.id || candidate.candidateId || null,
      status: expired ? "blocked" : trigger.status || "observed",
      at: now
    },
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function buildOperatorActionAudit({ action, target = null, result = {}, now = new Date().toISOString() } = {}) {
  const normalizedAction = `${action || "unknown_action"}`.trim() || "unknown_action";
  const auditId = `operator-action-${normalizedAction}-${now}`;
  return {
    auditId,
    action: normalizedAction,
    target,
    status: result.status || (result.ok === false ? "failed" : "recorded"),
    confirmationRequired: result.confirmationRequired === true,
    liveImpact: result.liveImpact === true,
    safetyImpact: result.safetyImpact || "unknown",
    loggedAt: now,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
