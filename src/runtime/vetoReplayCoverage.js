import {
  buildCandidateOutcomeObservations,
  labelCandidateOutcome,
  summarizeCandidateOutcomes
} from "./candidateOutcomeTracker.js";
import { buildReplayPackQueue } from "./replayPackScoring.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function text(value, fallback = null) {
  if (value == null) return fallback;
  const normalized = `${value}`.trim();
  return normalized || fallback;
}

function idOf(record = {}) {
  return text(record.decisionId || record.id || record.observationId, null);
}

function normalizeReplayTrace(trace = {}) {
  const json = trace.json && typeof trace.json === "string"
    ? (() => {
        try { return JSON.parse(trace.json); } catch { return {}; }
      })()
    : trace;
  return {
    id: text(trace.id || json.id || json.replayId, null),
    symbol: text(trace.symbol || json.symbol, null),
    at: text(trace.at || json.at, null),
    status: text(trace.status || json.status, "unknown"),
    packType: text(json.packType || json.replayPack?.packType, null),
    decisionId: text(json.decisionId || json.decision?.decisionId, null),
    trace
  };
}

function buildOutcomeRecords({ decisions = [], futureMarketPathsByDecisionId = {}, existingOutcomes = [] } = {}) {
  const explicit = arr(existingOutcomes);
  if (explicit.length) return explicit;
  return arr(decisions).flatMap((decision) => {
    const observations = buildCandidateOutcomeObservations(decision, { horizonsMinutes: [60] });
    return observations.map((observation) => labelCandidateOutcome({
      observation,
      futureMarketPath: futureMarketPathsByDecisionId[idOf(decision)] || null
    }));
  });
}

export function buildVetoReplayCoverage({
  decisions = [],
  futureMarketPathsByDecisionId = {},
  outcomeRecords = [],
  replayTraces = [],
  limit = 20
} = {}) {
  const outcomes = buildOutcomeRecords({
    decisions,
    futureMarketPathsByDecisionId,
    existingOutcomes: outcomeRecords
  });
  const candidateSummary = summarizeCandidateOutcomes(outcomes);
  const normalizedReplayTraces = arr(replayTraces).map(normalizeReplayTrace);
  const replayQueue = buildReplayPackQueue([
    ...outcomes.map((outcome) => ({
      id: outcome.observationId,
      decisionId: outcome.decisionId,
      symbol: outcome.symbol,
      vetoOutcome: { label: outcome.label, confidence: outcome.confidence },
      reasonCount: arr(outcome.reasons).length,
      failureMode: outcome.label === "bad_veto" ? "bad_veto" : null
    })),
    ...normalizedReplayTraces.map((trace) => ({
      id: trace.id,
      decisionId: trace.decisionId,
      symbol: trace.symbol,
      failureMode: trace.packType,
      reason: trace.status
    }))
  ]);
  const unknownOutcomeCount = safeNumber(candidateSummary.counts?.unknown_veto, 0);
  const replayTraceCount = normalizedReplayTraces.length;
  const cappedLimit = Math.max(1, Math.min(100, Math.trunc(safeNumber(limit, 20))));
  return {
    status: outcomes.length || replayTraceCount ? "ready" : "empty",
    outcomeCount: outcomes.length,
    replayTraceCount,
    coverageStatus: replayTraceCount > 0 && outcomes.length > 0
      ? "covered"
      : replayTraceCount > 0
        ? "trace_only"
        : outcomes.length > 0
          ? "outcomes_without_replay_traces"
          : "missing",
    vetoOutcomeSummary: candidateSummary,
    replayTraceSummary: {
      count: replayTraceCount,
      byStatus: normalizedReplayTraces.reduce((acc, trace) => {
        const key = trace.status || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      traces: normalizedReplayTraces.slice(0, cappedLimit)
    },
    replayPackQueue: replayQueue.slice(0, cappedLimit),
    warnings: [
      ...(unknownOutcomeCount ? ["unknown_veto_outcomes_require_future_path"] : []),
      ...(replayTraceCount ? [] : ["replay_traces_missing"])
    ],
    paperOnly: true,
    diagnosticsOnly: true,
    liveBehaviorChanged: false,
    hardSafetyRelaxationAllowed: false
  };
}
