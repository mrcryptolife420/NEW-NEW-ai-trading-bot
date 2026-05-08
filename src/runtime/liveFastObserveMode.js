function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function upper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function decisionKey(value = {}) {
  return value.id || value.decisionId || value.candidateId || upper(value.symbol) || "UNKNOWN";
}

export function buildLiveFastObserveDecision({
  config = {},
  fastCandidate = {},
  normalDecision = {},
  preflight = {},
  now = new Date().toISOString()
} = {}) {
  const observeOnly = config.liveFastObserveOnly !== false;
  const botMode = `${config.botMode || "paper"}`.toLowerCase();
  const fastAllowed = preflight.allow === true && fastCandidate?.allow !== false;
  const normalAllowed = normalDecision.approved === true || normalDecision.allow === true;
  const fastScore = finite(fastCandidate.probability ?? fastCandidate.score, 0);
  const normalScore = finite(normalDecision.probability ?? normalDecision.score, 0);
  const symbol = upper(fastCandidate.symbol || normalDecision.symbol);
  const fasterMs = Math.max(0, finite(normalDecision.createdAtMs, 0) - finite(fastCandidate.createdAtMs, 0));
  const reasons = [];
  if (!observeOnly) reasons.push("observe_only_disabled");
  if (botMode === "live" && observeOnly) reasons.push("live_observe_only_no_execution");
  if (!fastAllowed) reasons.push(...arr(preflight.reasonCodes).map((reason) => `fast_blocked:${reason}`));
  if (fastAllowed && !normalAllowed) reasons.push("fast_would_have_been_earlier_than_normal_cycle");
  if (fastAllowed && normalAllowed && fastScore < normalScore) reasons.push("normal_cycle_higher_score");

  return {
    id: `live-fast-observe-${symbol || "UNKNOWN"}-${decisionKey(fastCandidate)}`,
    symbol,
    observedAt: now,
    mode: botMode,
    observeOnly,
    fastWouldExecute: fastAllowed,
    normalWouldExecute: normalAllowed,
    opportunityFasterMs: fasterMs,
    scoreDelta: fastScore - normalScore,
    falseTrigger: fastAllowed && normalAllowed && fastScore < normalScore - 0.05,
    reasons,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function summarizeLiveFastObserve({ observations = [] } = {}) {
  const rows = arr(observations);
  const faster = rows.filter((row) => row.fastWouldExecute && !row.normalWouldExecute).length;
  const falseTriggers = rows.filter((row) => row.falseTrigger).length;
  const blocked = rows.filter((row) => !row.fastWouldExecute).length;
  const avgFasterMs = rows.length
    ? rows.reduce((sum, row) => sum + finite(row.opportunityFasterMs, 0), 0) / rows.length
    : 0;
  return {
    status: rows.length ? "observing" : "empty",
    totalObservations: rows.length,
    fasterOpportunities: faster,
    falseTriggers,
    blockedFastSignals: blocked,
    avgOpportunityFasterMs: Math.max(0, avgFasterMs),
    requiresOperatorApprovalForLiveFast: true,
    oneClickDisableAvailable: true,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
