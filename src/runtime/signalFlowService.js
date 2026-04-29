function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function ensureSignalFlowMetricsState(runtime = {}) {
  const defaults = {
    symbolsScanned: 0,
    candidatesScored: 0,
    generatedSignals: 0,
    rejectedSignals: 0,
    allowedSignals: 0,
    alphaWantedSignals: 0,
    alphaRejectedSignals: 0,
    permissioningDeniedSignals: 0,
    mixedDeniedSignals: 0,
    entriesAttempted: 0,
    entriesExecuted: 0,
    entriesPersisted: 0,
    entriesPersistFailed: 0,
    paperTradesAttempted: 0,
    paperTradesExecuted: 0,
    paperTradesPersisted: 0,
    liveTradesAttempted: 0,
    liveTradesExecuted: 0,
    liveTradesPersisted: 0,
    tradesPersisted: 0,
    dashboardFeedFailures: 0,
    dashboardFeedFailureByFeed: {},
    cyclesWithZeroViableCandidates: 0,
    cyclesWithViableCandidatesZeroExecutionAttempts: 0,
    rejectionReasons: {},
    rejectionCategories: {},
    consecutiveCyclesWithSignalsNoPaperTrade: 0,
    inactivityWatchdogState: {},
    inactivityWatchdog: {},
    configSnapshot: {},
    lastCycle: {},
    notes: []
  };
  runtime.signalFlow = {
    ...defaults,
    ...(runtime.signalFlow || {})
  };
  runtime.signalFlow.rejectionReasons = runtime.signalFlow.rejectionReasons || {};
  runtime.signalFlow.rejectionCategories = runtime.signalFlow.rejectionCategories || {};
  runtime.signalFlow.dashboardFeedFailureByFeed = runtime.signalFlow.dashboardFeedFailureByFeed || {};
  runtime.signalFlow.lastCycle = runtime.signalFlow.lastCycle || {};
  runtime.signalFlow.inactivityWatchdogState = runtime.signalFlow.inactivityWatchdogState || {};
  runtime.signalFlow.inactivityWatchdog = runtime.signalFlow.inactivityWatchdog || {};
  runtime.signalFlow.configSnapshot = runtime.signalFlow.configSnapshot || {};
  runtime.signalFlow.notes = arr(runtime.signalFlow.notes || []);
  return runtime.signalFlow;
}
