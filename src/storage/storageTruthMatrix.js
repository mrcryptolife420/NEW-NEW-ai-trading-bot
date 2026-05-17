export const STORAGE_TRUTH_MATRIX_VERSION = 1;

const MATRIX = [
  {
    dataType: "runtime_state",
    owner: "StateStore",
    module: "src/storage/stateStore.js",
    persistence: "runtime.json",
    dashboardSource: "runtime_snapshot",
    staleRisk: "runtime_cache_can_be_newer_than_readmodel",
    safeReader: "StateStore.loadRuntime"
  },
  {
    dataType: "journal_trades",
    owner: "StateStore",
    module: "src/storage/stateStore.js",
    persistence: "journal.json",
    dashboardSource: "ReadModelStore.dashboardSummary",
    staleRisk: "readmodel_can_lag_journal",
    safeReader: "StateStore.loadJournal"
  },
  {
    dataType: "audit_events",
    owner: "AuditLogStore",
    module: "src/storage/auditLogStore.js",
    persistence: "audit/*.jsonl",
    dashboardSource: "ReadModelStore.materializePrimaryEvidenceFromAuditEvents",
    staleRisk: "audit_materialization_can_lag",
    safeReader: "AuditLogStore"
  },
  {
    dataType: "recorder_frames",
    owner: "DataRecorder",
    module: "src/runtime/dataRecorder.js",
    persistence: "feature-store/*.jsonl",
    dashboardSource: "ReadModelStore.rebuildFromSources",
    staleRisk: "recorder_bucket_partial_or_corrupt",
    safeReader: "DataRecorder.loadHistoricalBootstrap"
  },
  {
    dataType: "market_history",
    owner: "MarketHistoryStore",
    module: "src/storage/marketHistoryStore.js",
    persistence: "market-history",
    dashboardSource: "runtime.marketHistorySummary",
    staleRisk: "bootstrap_history_can_be_stale",
    safeReader: "MarketHistoryStore"
  },
  {
    dataType: "readmodel_tables",
    owner: "ReadModelStore",
    module: "src/storage/readModelStore.js",
    persistence: "read-model.sqlite",
    dashboardSource: "ReadModelStore.dashboardSummary",
    staleRisk: "sqlite_unavailable_or_rebuild_lag",
    safeReader: "ReadModelStore.dashboardSummary"
  },
  {
    dataType: "replay_traces",
    owner: "ReadModelStore",
    module: "src/storage/readModelStore.js",
    persistence: "read-model.sqlite:replay_traces",
    dashboardSource: "ReadModelStore.readCycleTrace/readSymbolTrace",
    staleRisk: "replay_trace_missing_context",
    safeReader: "ReadModelStore.readCycleTrace"
  }
];

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function buildStorageTruthMatrix({ readmodelSummary = {}, runtimeState = {}, journal = {}, recorderAudit = {} } = {}) {
  const runtimeTradeCount = arr(journal.trades).length;
  const readmodelTradeCount = Number(readmodelSummary.tables?.trades ?? readmodelSummary.counts?.trades ?? readmodelSummary.tradeCount);
  const tradeCountDrift = Number.isFinite(readmodelTradeCount) && runtimeTradeCount !== readmodelTradeCount;
  const warnings = [];
  if (tradeCountDrift) warnings.push("journal_readmodel_trade_count_drift");
  if (readmodelSummary.status && readmodelSummary.status !== "ready") warnings.push("readmodel_not_ready");
  if (recorderAudit.status && !["ok", "ready"].includes(recorderAudit.status)) warnings.push("recorder_integrity_not_ok");
  if (runtimeState.storage?.quarantine?.length) warnings.push("quarantined_storage_files_present");
  return {
    version: STORAGE_TRUTH_MATRIX_VERSION,
    status: warnings.length ? "warning" : "ready",
    entries: MATRIX.map((entry) => ({ ...entry })),
    drift: {
      tradeCountDrift,
      journalTrades: runtimeTradeCount,
      readmodelTrades: Number.isFinite(readmodelTradeCount) ? readmodelTradeCount : null
    },
    warnings,
    nextSafeAction: tradeCountDrift ? "run_readmodel_rebuild_and_compare_journal_counts" : warnings.length ? "inspect_storage_integrity" : "monitor",
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
