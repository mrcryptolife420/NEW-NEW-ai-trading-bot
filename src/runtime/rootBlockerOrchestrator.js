function arr(value) {
  return Array.isArray(value) ? value : [];
}

const PRIORITY = {
  exchange_truth_freeze: 100,
  exchange_safety_global_freeze: 96,
  execution_intent_ambiguous: 92,
  health_circuit_open: 90,
  manual_review: 84,
  reconcile_required: 80,
  capital_governor_blocked: 74,
  service_degraded: 36
};

function normalizeBlocker({
  id,
  label = null,
  reason,
  scope = "global",
  source = "runtime",
  symbols = [],
  symptoms = []
} = {}) {
  return {
    id: id || reason || "blocker",
    label: label || reason || "blocker",
    reason: reason || id || "blocker",
    scope,
    source,
    symbols: [...new Set(arr(symbols).filter(Boolean))],
    priority: PRIORITY[reason] || PRIORITY[id] || 20,
    downstreamSymptoms: [...new Set(arr(symptoms).filter(Boolean))]
  };
}

function pushBlocker(blockers, blocker) {
  if (!blocker?.reason) {
    return;
  }
  blockers.push(normalizeBlocker(blocker));
}

export function buildRootBlockerOrchestrator({
  runtime = {},
  exchangeTruth = {},
  exchangeSafety = {},
  capitalGovernor = {},
  readiness = {},
  service = {},
  decisionFunnel = null
} = {}) {
  const blockers = [];
  const blockedSymbols = new Map();
  const pendingActions = arr(runtime?.orderLifecycle?.pendingActions || []);
  const unresolvedIntents = arr(runtime?.orderLifecycle?.executionIntentLedger?.unresolvedIntentIds || [])
    .map((id) => runtime?.orderLifecycle?.executionIntentLedger?.intents?.[id])
    .filter(Boolean);

  if (exchangeTruth?.freezeEntries) {
    pushBlocker(blockers, {
      reason: "exchange_truth_freeze",
      source: "exchangeTruth",
      symptoms: arr(readiness?.reasons || []).filter(Boolean),
      symbols: [
        ...arr(exchangeTruth.orphanedSymbols),
        ...arr(exchangeTruth.missingRuntimeSymbols),
        ...arr(exchangeTruth.unmatchedOrderSymbols)
      ]
    });
  }
  if (exchangeSafety?.globalFreezeEntries || exchangeSafety?.freezeEntries) {
    pushBlocker(blockers, {
      reason: "exchange_safety_global_freeze",
      source: "exchangeSafety",
      symptoms: [
        ...(exchangeSafety?.globalFreezeReasons || []),
        ...(exchangeSafety?.notes || [])
      ],
      symbols: arr(exchangeSafety?.blockedSymbols || []).map((item) => item?.symbol).filter(Boolean)
    });
  }
  for (const intent of unresolvedIntents) {
    const scope = intent?.scope || (intent?.symbol ? "symbol" : "global");
    const blocker = normalizeBlocker({
      reason: "execution_intent_ambiguous",
      label: intent?.kind || "execution_intent",
      scope,
      source: "executionIntentLedger",
      symbols: intent?.symbol ? [intent.symbol] : [],
      symptoms: [intent?.ambiguityReason || intent?.detail || "resume_required"]
    });
    blockers.push(blocker);
  }
  if (runtime?.health?.circuitOpen) {
    pushBlocker(blockers, {
      reason: "health_circuit_open",
      source: "health",
      symptoms: [runtime?.health?.reason || "health_circuit_open"]
    });
  }
  for (const action of pendingActions) {
    if (!["manual_review", "reconcile_required"].includes(action?.state)) {
      continue;
    }
    pushBlocker(blockers, {
      reason: action.state,
      scope: action?.symbol ? "symbol" : "global",
      source: "orderLifecycle",
      symbols: action?.symbol ? [action.symbol] : [],
      symptoms: [action?.reason || action?.detail || action.state]
    });
  }
  if (capitalGovernor?.allowEntries === false) {
    pushBlocker(blockers, {
      reason: "capital_governor_blocked",
      source: "capitalGovernor",
      symptoms: [
        ...(capitalGovernor?.blockerReasons || []),
        ...(capitalGovernor?.budgetBlockers || []).map((item) => item.id || item.reason).filter(Boolean)
      ]
    });
  }
  if (service?.heartbeatStale || service?.watchdogStatus === "degraded") {
    pushBlocker(blockers, {
      reason: "service_degraded",
      source: "service",
      symptoms: [
        service?.heartbeatStale ? "service_heartbeat_stale" : null,
        service?.watchdogStatus === "degraded" ? "service_watchdog_degraded" : null
      ]
    });
  }
  const funnel = decisionFunnel || runtime?.signalFlow?.decisionFunnel || runtime?.signalFlow?.lastCycle?.decisionFunnel || null;
  if (funnel?.firstBlockedStage && funnel?.primaryReason) {
    pushBlocker(blockers, {
      reason: funnel.primaryReason,
      scope: funnel.symbol ? "symbol" : "global",
      source: "decisionFunnel",
      symbols: funnel.symbol ? [funnel.symbol] : [],
      symptoms: [funnel.firstBlockedStage, funnel.nextSafeAction].filter(Boolean)
    });
  }

  const sorted = blockers.sort((left, right) => right.priority - left.priority || `${left.reason}`.localeCompare(`${right.reason}`));
  for (const blocker of sorted) {
    for (const symbol of blocker.symbols || []) {
      const current = blockedSymbols.get(symbol);
      if (!current || blocker.priority > current.priority) {
        blockedSymbols.set(symbol, {
          symbol,
          primaryReason: blocker.reason,
          source: blocker.source,
          priority: blocker.priority,
          symptoms: blocker.downstreamSymptoms.slice(0, 4)
        });
      }
    }
  }

  const globalBlockers = sorted.filter((item) => item.scope === "global");
  const symbolBlockers = sorted.filter((item) => item.scope !== "global");
  const primaryRootBlocker = globalBlockers[0] || symbolBlockers[0] || null;
  const downstreamSymptoms = [...new Set(sorted.flatMap((item) => item.downstreamSymptoms || []))].slice(0, 12);

  return {
    primaryRootBlocker,
    globalBlockers,
    symbolBlockers,
    blockedSymbols: [...blockedSymbols.values()].sort((left, right) => `${left.symbol}`.localeCompare(`${right.symbol}`)),
    blockerGraph: sorted.slice(0, 16),
    downstreamSymptoms,
    decisionFunnel: funnel
      ? {
          status: funnel.status || "unknown",
          firstBlockedStage: funnel.firstBlockedStage || null,
          primaryReason: funnel.primaryReason || null,
          nextSafeAction: funnel.nextSafeAction || null
        }
      : null
  };
}
