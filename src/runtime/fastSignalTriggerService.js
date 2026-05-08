import { attachCandidateFreshness } from "./candidateFreshnessContract.js";
import { buildFastQueueTriggerFromCross, detectThresholdCross } from "./nearThresholdWatchlist.js";
import { buildImmediateEntryQueueItem, enqueueImmediateEntry } from "./immediateEntryQueue.js";
import { runFastPreflightRisk } from "../risk/fastPreflightRisk.js";
import { evaluateFastExecutionSafety } from "../risk/fastExecutionSafetyGovernor.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function upper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

export function evaluateFastSignalTrigger({
  config = {},
  candidate = {},
  previousWatchItem = {},
  queue = [],
  openPositions = [],
  unresolvedIntents = [],
  exchangeSafety = {},
  health = {},
  marketSnapshot = {},
  riskVerdict = {},
  fastHistory = {},
  now = new Date().toISOString()
} = {}) {
  const enabled = config.fastExecutionEnabled === true;
  const paperOnly = config.fastExecutionPaperOnly !== false;
  const mode = `${config.botMode || "paper"}`.toLowerCase();
  const freshCandidate = attachCandidateFreshness(candidate, {
    now,
    ttlMs: config.fastExecutionCandidateTtlMs,
    maxMarketDataAgeMs: config.fastExecutionMinDataFreshnessMs
  });
  const cross = detectThresholdCross({ previousItem: previousWatchItem, candidate: freshCandidate, now });
  const queueTrigger = buildFastQueueTriggerFromCross({ cross, ttlMs: config.fastExecutionCandidateTtlMs });
  const preflight = runFastPreflightRisk({
    candidate: freshCandidate,
    config,
    openPositions,
    unresolvedIntents,
    exchangeSafety,
    health,
    operatorMode: config.operatorMode || "active",
    marketSnapshot,
    riskVerdict
  });
  const safety = evaluateFastExecutionSafety({
    config,
    candidate: freshCandidate,
    recentFastEntries: fastHistory.recentFastEntries,
    recentFailures: fastHistory.recentFailures,
    slippageEvents: fastHistory.slippageEvents,
    staleDataEvents: fastHistory.staleDataEvents,
    ambiguousIntents: fastHistory.ambiguousIntents,
    health,
    exchangeSafety,
    requestBudget: fastHistory.requestBudget,
    now
  });
  const reasonCodes = [];
  if (!enabled) reasonCodes.push("fast_execution_disabled");
  if (mode === "live" && paperOnly) reasonCodes.push("fast_execution_paper_only");
  if (!queueTrigger.shouldQueue) reasonCodes.push(queueTrigger.blockedReason);
  if (!freshCandidate.candidateFreshness?.fastExecutionEligible) reasonCodes.push(freshCandidate.candidateFreshness?.reason || "candidate_not_fresh");
  reasonCodes.push(...arr(preflight.reasonCodes), ...arr(safety.reasonCodes));
  const allowQueue = enabled && !(mode === "live" && paperOnly) && reasonCodes.length === 0;
  const queueItem = allowQueue
    ? buildImmediateEntryQueueItem({
      symbol: upper(freshCandidate.symbol),
      candidateId: freshCandidate.id || freshCandidate.candidateId || upper(freshCandidate.symbol),
      source: queueTrigger.queueItem?.source || "fast_signal_trigger",
      now,
      ttlMs: config.fastExecutionCandidateTtlMs,
      requiredChecks: queueTrigger.queueItem?.requiredChecks
    })
    : null;
  const enqueueResult = queueItem
    ? enqueueImmediateEntry({ queue, item: queueItem, unresolvedIntents, now })
    : { accepted: false, blockedReason: reasonCodes[0] || "not_queued", queue, item: null };
  return {
    status: enqueueResult.accepted ? "queued" : "blocked",
    symbol: upper(freshCandidate.symbol),
    candidate: freshCandidate,
    cross,
    preflight,
    safety,
    queueItem: enqueueResult.item,
    queue: enqueueResult.queue,
    reasonCodes: enqueueResult.accepted ? [] : [...new Set(reasonCodes.concat(enqueueResult.blockedReason).filter(Boolean))],
    auditEvent: {
      type: "fast_signal_trigger",
      symbol: upper(freshCandidate.symbol),
      status: enqueueResult.accepted ? "queued" : "blocked",
      reasonCodes: enqueueResult.accepted ? [] : [...new Set(reasonCodes.filter(Boolean))],
      at: now
    },
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
