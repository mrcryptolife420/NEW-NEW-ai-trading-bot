import crypto from "node:crypto";
import { nowIso } from "../utils/time.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" ? value : {};
}

function safeUpper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

export const EXECUTION_INTENT_STATUS = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  COMPLETED: "completed",
  FAILED: "failed",
  AMBIGUOUS: "ambiguous",
  SKIPPED: "skipped"
};

const UNRESOLVED_STATUSES = new Set([
  EXECUTION_INTENT_STATUS.PENDING,
  EXECUTION_INTENT_STATUS.SUBMITTED,
  EXECUTION_INTENT_STATUS.AMBIGUOUS
]);

export function ensureExecutionIntentLedger(runtime) {
  if (!runtime) {
    return null;
  }
  runtime.orderLifecycle = runtime.orderLifecycle || {
    lastUpdatedAt: null,
    positions: {},
    recentTransitions: [],
    pendingActions: [],
    activeActions: {},
    activeActionsPrevious: {},
    actionJournal: []
  };
  runtime.orderLifecycle.executionIntentLedger = runtime.orderLifecycle.executionIntentLedger || {
    lastUpdatedAt: null,
    intents: {},
    recentIntentIds: [],
    unresolvedIntentIds: [],
    lastRecoveryAt: null
  };
  const ledger = runtime.orderLifecycle.executionIntentLedger;
  ledger.intents = obj(ledger.intents);
  ledger.recentIntentIds = arr(ledger.recentIntentIds);
  ledger.unresolvedIntentIds = arr(ledger.unresolvedIntentIds);
  return ledger;
}

function normalizeKeyPart(value, fallback = "na") {
  const normalized = `${value || fallback}`.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "_");
  return normalized || fallback;
}

export function buildExecutionIntentKey({
  kind,
  symbol = null,
  positionId = null,
  idempotencyKey = null,
  scope = "symbol"
} = {}) {
  return [
    normalizeKeyPart(scope, "symbol"),
    normalizeKeyPart(kind, "action"),
    normalizeKeyPart(symbol, positionId || "global"),
    normalizeKeyPart(idempotencyKey, positionId || symbol || "default")
  ].join(":");
}

function isResolvedStatus(status) {
  return !UNRESOLVED_STATUSES.has(`${status || ""}`.toLowerCase());
}

function pruneLedger(ledger) {
  const intents = Object.values(ledger.intents || {});
  const recentIds = intents
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime())
    .slice(0, 160)
    .map((item) => item.id);
  const keepSet = new Set(recentIds);
  ledger.intents = Object.fromEntries(
    Object.entries(ledger.intents || {}).filter(([id]) => keepSet.has(id))
  );
  ledger.recentIntentIds = recentIds;
  ledger.unresolvedIntentIds = recentIds.filter((id) => !isResolvedStatus(ledger.intents[id]?.status));
}

function mutateIntent(ledger, intentId, patch = {}, {
  appendStep = null
} = {}) {
  const current = ledger?.intents?.[intentId];
  if (!current) {
    return null;
  }
  const updatedAt = patch.updatedAt || nowIso();
  const next = {
    ...current,
    ...patch,
    updatedAt
  };
  if (appendStep) {
    next.steps = [...arr(current.steps), { at: updatedAt, ...appendStep }].slice(-20);
  } else {
    next.steps = arr(current.steps);
  }
  if (patch.status && isResolvedStatus(patch.status) && !next.resolvedAt) {
    next.resolvedAt = updatedAt;
  }
  ledger.intents[intentId] = next;
  ledger.lastUpdatedAt = updatedAt;
  pruneLedger(ledger);
  return next;
}

export function beginExecutionIntent(runtime, {
  kind,
  symbol = null,
  positionId = null,
  scope = "symbol",
  idempotencyKey = null,
  brokerMode = null,
  detail = null,
  origin = null,
  meta = {}
} = {}) {
  const ledger = ensureExecutionIntentLedger(runtime);
  if (!ledger) {
    return { intent: null, duplicateUnresolved: false };
  }
  const dedupeKey = buildExecutionIntentKey({ kind, symbol, positionId, idempotencyKey, scope });
  const existing = Object.values(ledger.intents || []).find((item) =>
    item?.dedupeKey === dedupeKey && !isResolvedStatus(item?.status)
  );
  if (existing) {
    return { intent: existing, duplicateUnresolved: true };
  }
  const createdAt = nowIso();
  const id = crypto.randomUUID();
  const intent = {
    id,
    dedupeKey,
    kind: kind || "exchange_action",
    symbol: symbol || null,
    positionId: positionId || null,
    scope,
    brokerMode: brokerMode || null,
    origin: origin || null,
    status: EXECUTION_INTENT_STATUS.PENDING,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    ambiguityReason: null,
    blocked: false,
    resumeRequired: false,
    detail: detail || null,
    meta: obj(meta),
    steps: detail ? [{ at: createdAt, type: "intent_opened", status: EXECUTION_INTENT_STATUS.PENDING, detail }] : []
  };
  ledger.intents[id] = intent;
  ledger.lastUpdatedAt = createdAt;
  pruneLedger(ledger);
  return { intent, duplicateUnresolved: false };
}

export function touchExecutionIntent(runtime, intentId, patch = {}, step = null) {
  const ledger = ensureExecutionIntentLedger(runtime);
  if (!ledger) {
    return null;
  }
  return mutateIntent(ledger, intentId, patch, { appendStep: step });
}

export function appendExecutionIntentStep(runtime, intentId, step = {}) {
  return touchExecutionIntent(runtime, intentId, {}, step);
}

export function resolveExecutionIntent(runtime, intentId, patch = {}, step = null) {
  return touchExecutionIntent(runtime, intentId, {
    status: EXECUTION_INTENT_STATUS.COMPLETED,
    blocked: false,
    resumeRequired: false,
    ambiguityReason: null,
    ...patch
  }, step || { type: "intent_completed", status: EXECUTION_INTENT_STATUS.COMPLETED, detail: patch.detail || null });
}

export function failExecutionIntent(runtime, intentId, patch = {}, step = null) {
  return touchExecutionIntent(runtime, intentId, {
    status: EXECUTION_INTENT_STATUS.FAILED,
    blocked: false,
    resumeRequired: false,
    ...patch
  }, step || { type: "intent_failed", status: EXECUTION_INTENT_STATUS.FAILED, error: patch.error || null });
}

export function markExecutionIntentAmbiguous(runtime, intentId, patch = {}, step = null) {
  return touchExecutionIntent(runtime, intentId, {
    status: EXECUTION_INTENT_STATUS.AMBIGUOUS,
    blocked: true,
    resumeRequired: true,
    ...patch
  }, step || {
    type: "intent_ambiguous",
    status: EXECUTION_INTENT_STATUS.AMBIGUOUS,
    error: patch.error || patch.ambiguityReason || null,
    detail: patch.detail || null
  });
}

export function listExecutionIntents(runtime, { unresolvedOnly = false } = {}) {
  const ledger = ensureExecutionIntentLedger(runtime);
  const intents = Object.values(ledger?.intents || {})
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime());
  return unresolvedOnly
    ? intents.filter((item) => !isResolvedStatus(item.status))
    : intents;
}

export function recoverStaleExecutionIntents(runtime, {
  reason = "unclean_restart",
  at = nowIso()
} = {}) {
  const ledger = ensureExecutionIntentLedger(runtime);
  if (!ledger) {
    return 0;
  }
  let recovered = 0;
  for (const intent of Object.values(ledger.intents || {})) {
    if (isResolvedStatus(intent.status)) {
      continue;
    }
    mutateIntent(ledger, intent.id, {
      status: EXECUTION_INTENT_STATUS.AMBIGUOUS,
      blocked: true,
      resumeRequired: true,
      ambiguityReason: intent.ambiguityReason || reason,
      recoveryOrigin: reason,
      recoveredAt: at
    }, {
      type: "restart_recovery",
      status: EXECUTION_INTENT_STATUS.AMBIGUOUS,
      detail: reason
    });
    recovered += 1;
  }
  if (recovered > 0) {
    ledger.lastRecoveryAt = at;
  }
  pruneLedger(ledger);
  return recovered;
}

export function buildExecutionIntentBlockers(runtime, { ambiguityOnly = true } = {}) {
  const blockers = [];
  for (const intent of listExecutionIntents(runtime, { unresolvedOnly: true })) {
    if (ambiguityOnly && safeUpper(intent.status) !== "AMBIGUOUS") {
      continue;
    }
    blockers.push({
      id: intent.id,
      symbol: intent.symbol || null,
      scope: intent.scope || (intent.symbol ? "symbol" : "global"),
      reason: intent.ambiguityReason || "execution_intent_ambiguous",
      kind: intent.kind || "exchange_action",
      status: intent.status || EXECUTION_INTENT_STATUS.AMBIGUOUS,
      blocked: Boolean(intent.blocked),
      resumeRequired: Boolean(intent.resumeRequired),
      updatedAt: intent.updatedAt || intent.createdAt || null,
      detail: intent.detail || null
    });
  }
  return blockers;
}

export async function flushExecutionIntentLedger(runtime) {
  if (!runtime?.__persistExecutionIntentLedger) {
    return;
  }
  await runtime.__persistExecutionIntentLedger();
}
