import { buildPaperEvidenceSpine } from "../runtime/paperEvidenceSpine.js";
import { buildVetoReplayCoverage } from "../runtime/vetoReplayCoverage.js";

const REQUIRED_ANALYTICS_TABLES = [
  "trades",
  "decisions",
  "blockers",
  "audit_events",
  "scorecards"
];

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function unique(values = []) {
  return [...new Set(arr(values).filter((value) => typeof value === "string" && value.length))];
}

function tableExists(db, tableName) {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

function safeAll(db, sql, params = []) {
  try {
    return { rows: db.prepare(sql).all(...params), error: null };
  } catch (error) {
    return { rows: [], error: error?.message || "query_failed" };
  }
}

function normalizeDecision(row = {}) {
  const record = parseJson(row.json, row);
  return {
    id: row.id || record.id || record.decisionId || null,
    symbol: row.symbol || record.symbol || null,
    at: row.at || record.at || record.createdAt || null,
    approved: Boolean(row.allow || record.approved || record.allow),
    rootBlocker: row.root_blocker || record.rootBlocker || record.blocker || null,
    setupType: record.setupType || record.strategy?.setupStyle || record.strategyId || null
  };
}

function normalizeAuditDecision(row = {}, index = 0) {
  const record = parseJson(row.json, row);
  const payload = record.payload || record.detail || record.data || record;
  const reasons = unique([
    payload.rootBlocker,
    payload.primaryRootBlocker,
    payload.blockedReason,
    payload.primaryReason,
    ...arr(payload.reasons),
    ...arr(payload.blockerReasons),
    ...arr(payload.reasonCodes),
    ...arr(payload.riskVerdict?.rejections).map((item) => item?.code)
  ]);
  const type = row.type || record.type || record.kind || "audit_event";
  const symbol = row.symbol || record.symbol || payload.symbol || null;
  const decisionId = row.decision_id || record.decisionId || record.decision_id || payload.decisionId || payload.id || null;
  if (!decisionId && !symbol && !reasons.length) return null;
  const status = `${payload.status || record.status || ""}`.toLowerCase();
  return {
    id: decisionId || `audit:${type}:${symbol || "unknown"}:${row.at || index}`,
    symbol,
    at: row.at || record.at || payload.at || payload.createdAt || null,
    approved: Boolean(payload.allow || payload.approved || ["allowed", "approved", "executed", "queued"].includes(status)),
    rootBlocker: payload.rootBlocker || payload.primaryRootBlocker || reasons[0] || null,
    setupType: payload.setupType || payload.strategy?.setupStyle || payload.strategySummary?.activeStrategy || payload.strategyId || null,
    reasons,
    source: "audit_events",
    auditType: type,
    dataLineage: payload.dataLineage || record.dataLineage || {},
    dataQuality: payload.dataQuality || payload.dataQualitySummary || record.dataQuality || {}
  };
}

function normalizeTrade(row = {}) {
  const record = parseJson(row.json, row);
  return {
    id: row.id || record.id || record.tradeId || null,
    symbol: row.symbol || record.symbol || null,
    brokerMode: row.broker_mode || record.brokerMode || record.mode || null,
    strategyFamily: row.strategy_family || record.strategyFamily || record.family || null,
    pnlQuote: safeNumber(row.pnl_quote ?? record.pnlQuote ?? record.pnl, 0),
    netPnlPct: safeNumber(row.net_pnl_pct ?? record.netPnlPct ?? record.pnlPct, 0),
    exitQuality: record.exitQuality?.label || record.exitQualityLabel || record.tradeQualityLabel || null
  };
}

function normalizeAuditTrade(row = {}, index = 0) {
  const record = parseJson(row.json, row);
  const payload = record.payload || record.detail || record.data || record;
  const trade = payload.trade || payload.position || payload.executionResult || payload;
  const type = `${row.type || record.type || record.kind || ""}`.toLowerCase();
  const brokerMode = trade.brokerMode || trade.mode || trade.source || payload.brokerMode || payload.mode || null;
  const looksLikePaper = `${brokerMode || ""}`.toLowerCase() === "paper" ||
    type.includes("paper_trade") ||
    `${trade.id || trade.tradeId || ""}`.toLowerCase().includes("paper");
  if (!looksLikePaper || !(trade.id || trade.tradeId || trade.symbol || payload.symbol)) return null;
  const strategy = trade.strategyAtEntry || trade.strategy || trade.strategySummary || {};
  return {
    id: trade.id || trade.tradeId || `audit-trade:${row.at || index}`,
    symbol: trade.symbol || payload.symbol || row.symbol || null,
    brokerMode: "paper",
    strategyFamily: strategy.family || trade.strategyFamily || trade.family || null,
    pnlQuote: safeNumber(trade.pnlQuote ?? trade.pnl, 0),
    netPnlPct: safeNumber(trade.netPnlPct ?? trade.pnlPct, 0),
    exitQuality: trade.exitQuality?.label || trade.exitQualityLabel || trade.tradeQualityLabel || null,
    source: "audit_events"
  };
}

function inferBlockerStage(reason = "") {
  const text = `${reason || ""}`.toLowerCase();
  if (/data|quality|quorum|snapshot|stream|feed|lineage|local_book/.test(text)) return "data";
  if (/setup|strategy|breakout|trend|regime|session/.test(text)) return "setup";
  if (/confidence|model|calibration|score|probability/.test(text)) return "model";
  if (/risk|portfolio|capital|correlation|drawdown|exposure|size/.test(text)) return "risk";
  if (/cost|spread|slippage|exec|order|intent|fill|min_notional/.test(text)) return "execution";
  if (/dashboard|storage|journal|readmodel|persist|recorder/.test(text)) return "storage_dashboard";
  if (/committee|meta|veto|governance|canary/.test(text)) return "governance";
  if (/exchange_safety|exchange_truth|reconcile|live_ack|preflight|manual_review/.test(text)) return "safety";
  return "unknown";
}

function buildDerivedBlockerTimelines(decisions = [], limit = 20) {
  const grouped = new Map();
  for (const decision of decisions) {
    const reason = decision.rootBlocker || "unknown_blocker";
    if (!grouped.has(reason)) {
      grouped.set(reason, {
        reason,
        stage: inferBlockerStage(reason),
        count: 0,
        sampleSymbol: decision.symbol || null,
        firstSeenAt: decision.at || null,
        lastSeenAt: decision.at || null,
        source: decision.src || "decisions",
        persisted: decision.src !== "audit_events"
      });
    }
    const item = grouped.get(reason);
    item.count += 1;
    item.sampleSymbol ||= decision.symbol || null;
    if (decision.at && (!item.lastSeenAt || decision.at > item.lastSeenAt)) item.lastSeenAt = decision.at;
    if (decision.at && (!item.firstSeenAt || decision.at < item.firstSeenAt)) item.firstSeenAt = decision.at;
  }
  return [...grouped.values()]
    .sort((left, right) => (right.count - left.count) || left.reason.localeCompare(right.reason))
    .slice(0, limit);
}

function buildPersistenceCoverage({ decisions = {}, blockers = {}, trades = {}, replayTraces = {}, auditDerivedDecisions = [], auditDerivedTrades = [], derivedReplayTraces = [] } = {}) {
  const decisionRows = arr(decisions.rows);
  const blockerRows = arr(blockers.rows);
  const tradeRows = arr(trades.rows);
  const replayRows = arr(replayTraces.rows);
  const buildStatus = (persistedCount, derivedCount, label) => ({
    persistedCount,
    derivedCount,
    status: persistedCount > 0 ? "persisted" : derivedCount > 0 ? "derived_only" : "empty",
    notPersistedReason: persistedCount > 0 ? null : derivedCount > 0 ? `${label}_available_only_from_audit_or_derived_sources` : `${label}_not_found`
  });
  return {
    decisions: buildStatus(decisionRows.length, auditDerivedDecisions.length, "decisions"),
    blockers: buildStatus(blockerRows.length, auditDerivedDecisions.filter((item) => item.rootBlocker).length, "blockers"),
    paperTrades: buildStatus(tradeRows.length, auditDerivedTrades.length, "paper_trades"),
    replayTraces: buildStatus(replayRows.length, derivedReplayTraces.length, "replay_traces")
  };
}

export function buildPaperAnalyticsReadModelSummary({ db = null, status = null, limit = 20 } = {}) {
  if (!db) {
    return {
      status: "unavailable",
      source: "sqlite_read_model",
      queryStatus: "unavailable",
      warnings: ["readmodel_db_unavailable"],
      sourceOfTruth: "json_ndjson",
      sourceOfTruthMigrated: false
    };
  }

  const missingTables = REQUIRED_ANALYTICS_TABLES.filter((table) => !tableExists(db, table));
  const warnings = [];
  if (missingTables.length) warnings.push("missing_analytics_tables");

  const cappedLimit = Math.max(1, Math.min(250, Math.trunc(safeNumber(limit, 20))));
  const decisions = missingTables.includes("decisions")
    ? { rows: [], error: "decisions_table_missing" }
    : safeAll(db, `
      SELECT id, symbol, at, allow, root_blocker, json
      FROM decisions
      ORDER BY COALESCE(at, '') DESC, id DESC
      LIMIT ?
    `, [cappedLimit]);
  const blockers = missingTables.includes("blockers")
    ? { rows: [], error: "blockers_table_missing" }
    : safeAll(db, `
      SELECT reason, COUNT(*) AS count, MAX(symbol) AS sampleSymbol
      FROM blockers
      GROUP BY reason
      ORDER BY count DESC, reason ASC
      LIMIT ?
    `, [cappedLimit]);
  const trades = missingTables.includes("trades")
    ? { rows: [], error: "trades_table_missing" }
    : safeAll(db, `
      SELECT id, symbol, broker_mode, strategy_family, pnl_quote, net_pnl_pct, json
      FROM trades
      WHERE broker_mode = 'paper' OR LOWER(COALESCE(json, '')) LIKE '%paper%'
      ORDER BY COALESCE(exit_at, entry_at, '') DESC, id DESC
      LIMIT ?
    `, [cappedLimit]);
  const auditVetoes = missingTables.includes("audit_events")
    ? { rows: [], error: "audit_events_table_missing" }
    : safeAll(db, `
      SELECT type, at, symbol, decision_id, json
      FROM audit_events
      WHERE LOWER(COALESCE(type, '')) LIKE '%veto%'
         OR LOWER(COALESCE(json, '')) LIKE '%bad_veto%'
         OR LOWER(COALESCE(json, '')) LIKE '%good_veto%'
      ORDER BY COALESCE(at, '') DESC
      LIMIT ?
    `, [cappedLimit]);
  const auditDecisionEvents = missingTables.includes("audit_events")
    ? { rows: [], error: "audit_events_table_missing" }
    : safeAll(db, `
      SELECT type, at, symbol, decision_id, json
      FROM audit_events
      WHERE LOWER(COALESCE(type, '')) LIKE '%decision%'
         OR LOWER(COALESCE(type, '')) LIKE '%candidate%'
         OR LOWER(COALESCE(type, '')) LIKE '%risk%'
         OR LOWER(COALESCE(json, '')) LIKE '%model_confidence_too_low%'
         OR LOWER(COALESCE(json, '')) LIKE '%rootblocker%'
      ORDER BY COALESCE(at, '') DESC
      LIMIT ?
    `, [cappedLimit]);
  const auditTradeEvents = missingTables.includes("audit_events")
    ? { rows: [], error: "audit_events_table_missing" }
    : safeAll(db, `
      SELECT type, at, symbol, decision_id, json
      FROM audit_events
      WHERE LOWER(COALESCE(type, '')) LIKE '%paper_trade%'
         OR LOWER(COALESCE(type, '')) LIKE '%trade%'
         OR LOWER(COALESCE(json, '')) LIKE '%"brokermode":"paper"%'
         OR LOWER(COALESCE(json, '')) LIKE '%"mode":"paper"%'
      ORDER BY COALESCE(at, '') DESC
      LIMIT ?
    `, [cappedLimit]);
  const scorecards = missingTables.includes("scorecards")
    ? { rows: [], error: "scorecards_table_missing" }
    : safeAll(db, `
      SELECT strategy_id AS strategyId, strategy_family AS strategyFamily, regime, session, status, sample_size AS sampleSize, expectancy_pct AS expectancyPct, confidence
      FROM scorecards
      ORDER BY sample_size DESC, confidence DESC
      LIMIT ?
    `, [cappedLimit]);
  const replayTraces = !tableExists(db, "replay_traces")
    ? { rows: [], error: null }
    : safeAll(db, `
      SELECT id, symbol, at, status, json
      FROM replay_traces
      ORDER BY COALESCE(at, '') DESC, id DESC
      LIMIT ?
    `, [cappedLimit]);

  for (const result of [decisions, blockers, trades, auditVetoes, auditDecisionEvents, auditTradeEvents, scorecards, replayTraces]) {
    if (result.error) warnings.push(result.error);
  }

  const auditDerivedDecisions = auditDecisionEvents.rows
    .map((row, index) => normalizeAuditDecision(row, index))
    .filter(Boolean);
  const normalizedDecisions = decisions.rows.length ? decisions.rows.map(normalizeDecision) : auditDerivedDecisions;
  const auditDerivedTrades = auditTradeEvents.rows
    .map((row, index) => normalizeAuditTrade(row, index))
    .filter(Boolean);
  const normalizedTrades = trades.rows.length ? trades.rows.map(normalizeTrade) : auditDerivedTrades;
  const exitQualityCounts = normalizedTrades.reduce((acc, trade) => {
    const key = trade.exitQuality || "unknown_exit_quality";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const vetoOutcomeCounts = auditVetoes.rows.reduce((acc, row) => {
    const record = parseJson(row.json, {});
    const label = record.vetoOutcome?.label || record.label || record.outcome || "unknown_veto";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const vetoOutcomeRecords = auditVetoes.rows.map((row) => {
    const record = parseJson(row.json, {});
    const outcome = record.vetoOutcome || record;
    return {
      observationId: outcome.observationId || record.observationId || record.decisionId || row.decision_id || row.type,
      decisionId: row.decision_id || record.decisionId || outcome.decisionId || null,
      symbol: row.symbol || record.symbol || outcome.symbol || null,
      at: row.at || record.at || outcome.at || null,
      label: outcome.label || record.label || record.outcome || "unknown_veto",
      outcome: outcome.label || record.label || record.outcome || "unknown_veto",
      confidence: safeNumber(outcome.confidence ?? record.confidence, 0.2),
      blocker: record.blocker || record.rootBlocker || null,
      rowSymbol: row.symbol || null,
      rowDecisionId: row.decision_id || null,
      reasons: record.reasons || []
    };
  });
  const derivedReplayTraces = vetoOutcomeRecords.map((record, index) => ({
    id: `derived-veto-replay:${record.decisionId || record.observationId || index}`,
    symbol: record.symbol,
    at: record.at || null,
    status: record.label === "unknown_veto" ? "needs_replay" : "derived_from_veto_outcome",
    json: JSON.stringify({ source: "audit_veto_outcome", decisionId: record.decisionId, label: record.label })
  }));
  const paperEvidenceSpine = buildPaperEvidenceSpine({
    decisions: normalizedDecisions,
    trades: normalizedTrades,
    limit: cappedLimit
  });
  const vetoReplayCoverage = buildVetoReplayCoverage({
    decisions: normalizedDecisions,
    outcomeRecords: vetoOutcomeRecords,
    replayTraces: replayTraces.rows.length ? replayTraces.rows : derivedReplayTraces,
    limit: cappedLimit
  });
  const derivedBlockerTimelines = buildDerivedBlockerTimelines(normalizedDecisions, cappedLimit);
  const blockerTimelines = blockers.rows.length
    ? blockers.rows.map((row) => ({
        reason: row.reason || "unknown",
        stage: inferBlockerStage(row.reason || "unknown"),
        count: safeNumber(row.count, 0),
        sampleSymbol: row.sampleSymbol || null,
        source: "blockers",
        persisted: true
      }))
    : derivedBlockerTimelines;
  const persistenceCoverage = buildPersistenceCoverage({
    decisions,
    blockers,
    trades,
    replayTraces,
    auditDerivedDecisions,
    auditDerivedTrades,
    derivedReplayTraces
  });
  const persistenceGaps = Object.entries(persistenceCoverage)
    .filter(([, item]) => item.notPersistedReason)
    .map(([area, item]) => ({ area, ...item }));

  const queryStatus = missingTables.length
    ? "degraded"
    : warnings.length
      ? "warning"
      : "ready";

  return {
    status: queryStatus,
    queryStatus,
    source: "sqlite_read_model",
    sourceOfTruth: "json_ndjson",
    sourceOfTruthMigrated: false,
    dbStatus: status?.status || "unknown",
    tables: status?.tables || {},
    missingTables,
    persistenceCoverage,
    persistenceGaps,
    paperCandidates: normalizedDecisions,
    auditDerivedDecisions,
    blockerTimelines,
    vetoOutcomes: vetoOutcomeCounts,
    paperTrades: normalizedTrades,
    auditDerivedPaperTrades: auditDerivedTrades,
    exitQuality: exitQualityCounts,
    cohortScorecards: scorecards.rows.map((row) => ({
      strategyId: row.strategyId || null,
      strategyFamily: row.strategyFamily || null,
      regime: row.regime || null,
      session: row.session || null,
      status: row.status || "unknown",
      sampleSize: safeNumber(row.sampleSize, 0),
      expectancyPct: safeNumber(row.expectancyPct, 0),
      confidence: safeNumber(row.confidence, 0)
    })),
    paperEvidenceSpineSummary: paperEvidenceSpine.summary,
    vetoReplayCoverageSummary: vetoReplayCoverage,
    counts: {
      paperCandidates: normalizedDecisions.length,
      persistedPaperCandidates: decisions.rows.length,
      auditDerivedPaperCandidates: auditDerivedDecisions.length,
      persistedBlockerTimelines: blockers.rows.length,
      blockerTimelines: blockerTimelines.length,
      auditDerivedBlockerTimelines: blockers.rows.length ? 0 : derivedBlockerTimelines.length,
      vetoOutcomeEvents: auditVetoes.rows.length,
      paperTrades: normalizedTrades.length,
      auditDerivedPaperTrades: auditDerivedTrades.length,
      replayTraces: replayTraces.rows.length,
      derivedReplayTraces: derivedReplayTraces.length,
      cohortScorecards: scorecards.rows.length
    },
    warnings: [...new Set(warnings)]
  };
}

export { REQUIRED_ANALYTICS_TABLES };
