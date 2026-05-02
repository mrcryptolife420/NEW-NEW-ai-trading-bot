import { listExecutionIntents } from "./executionIntentLedger.js";

function ageMs(intent = {}, now = Date.now()) {
  const time = new Date(intent.updatedAt || intent.createdAt || 0).getTime();
  return Number.isFinite(time) && time > 0 ? Math.max(0, now - time) : null;
}

function lastStep(intent = {}) {
  const steps = Array.isArray(intent.steps) ? intent.steps : [];
  const step = steps[steps.length - 1] || null;
  return step?.type || step?.status || null;
}

export function buildExecutionIntentRows(runtime = {}, { unresolvedOnly = true, now = Date.now() } = {}) {
  return listExecutionIntents(runtime, { unresolvedOnly }).map((intent) => ({
    id: intent.id || null,
    symbol: intent.symbol || null,
    kind: intent.kind || "exchange_action",
    scope: intent.scope || (intent.symbol ? "symbol" : "global"),
    status: intent.status || "unknown",
    ageMs: ageMs(intent, now),
    createdAt: intent.createdAt || null,
    updatedAt: intent.updatedAt || null,
    lastStep: lastStep(intent),
    blocked: Boolean(intent.blocked),
    resumeRequired: Boolean(intent.resumeRequired),
    ambiguityReason: intent.ambiguityReason || null
  }));
}

export function buildExecutionIntentSummary(runtime = {}, { now = Date.now() } = {}) {
  const all = buildExecutionIntentRows(runtime, { unresolvedOnly: false, now });
  const unresolved = buildExecutionIntentRows(runtime, { unresolvedOnly: true, now });
  const byKind = {};
  const byStatus = {};
  for (const row of all) {
    byKind[row.kind] = (byKind[row.kind] || 0) + 1;
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }
  return {
    total: all.length,
    unresolved: unresolved.length,
    blocked: unresolved.filter((row) => row.blocked).length,
    resumeRequired: unresolved.filter((row) => row.resumeRequired).length,
    byKind,
    byStatus,
    unresolvedRows: unresolved
  };
}
