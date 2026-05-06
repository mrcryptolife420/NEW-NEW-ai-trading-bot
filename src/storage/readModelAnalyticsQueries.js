import { buildPaperEvidenceSpine } from "../runtime/paperEvidenceSpine.js";

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
      SELECT type, json
      FROM audit_events
      WHERE LOWER(COALESCE(type, '')) LIKE '%veto%'
         OR LOWER(COALESCE(json, '')) LIKE '%bad_veto%'
         OR LOWER(COALESCE(json, '')) LIKE '%good_veto%'
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

  for (const result of [decisions, blockers, trades, auditVetoes, scorecards]) {
    if (result.error) warnings.push(result.error);
  }

  const normalizedDecisions = decisions.rows.map(normalizeDecision);
  const normalizedTrades = trades.rows.map(normalizeTrade);
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
    paperCandidates: normalizedDecisions,
    blockerTimelines: blockers.rows.map((row) => ({
      reason: row.reason || "unknown",
      count: safeNumber(row.count, 0),
      sampleSymbol: row.sampleSymbol || null
    })),
    vetoOutcomes: vetoOutcomeCounts,
    paperTrades: normalizedTrades,
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
    paperEvidenceSpineSummary: buildPaperEvidenceSpine({
      decisions: normalizedDecisions,
      trades: normalizedTrades,
      limit: cappedLimit
    }).summary,
    counts: {
      paperCandidates: decisions.rows.length,
      blockerTimelines: blockers.rows.length,
      vetoOutcomeEvents: auditVetoes.rows.length,
      paperTrades: normalizedTrades.length,
      cohortScorecards: scorecards.rows.length
    },
    warnings: [...new Set(warnings)]
  };
}

export { REQUIRED_ANALYTICS_TABLES };
