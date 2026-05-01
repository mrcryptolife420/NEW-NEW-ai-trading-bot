import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { StateStore } from "./stateStore.js";
import { AuditLogStore } from "./auditLogStore.js";
import { buildStrategyEvidenceScorecards } from "../runtime/strategyEvidenceScorecard.js";
import { buildOperatorRunbookForReason, buildStrategyLifecycleDiagnostics } from "../runtime/operatorRunbookGenerator.js";
import { buildTradingImprovementDiagnostics } from "../runtime/tradingImprovementDiagnostics.js";
import { ensureDir } from "../utils/fs.js";

const READ_MODEL_SCHEMA_VERSION = 1;

function json(value) {
  return JSON.stringify(value ?? null);
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value, fallback = null) {
  if (value == null || value === "") {
    return fallback;
  }
  return `${value}`;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildReplayCoverageGate(latestReplay = null) {
  const trace = latestReplay?.json ? parseJson(latestReplay.json, {}) : {};
  const readiness = trace?.historyReadiness || {};
  const actionPlan = trace?.historyActionPlan || null;
  const status = latestReplay?.status || trace?.status || "missing";
  const warnings = [
    ...(Array.isArray(readiness.warnings) ? readiness.warnings : []),
    ...(status === "empty_history" ? ["empty_history"] : [])
  ];
  const actionRequired = !latestReplay || status === "empty_history" || readiness.status === "degraded" || warnings.length > 0;
  return {
    status: actionRequired ? "action_required" : "ready",
    latestReplayStatus: latestReplay?.status || null,
    symbol: latestReplay?.symbol || trace?.symbol || null,
    replayAt: latestReplay?.at || trace?.at || null,
    candleCount: safeNumber(trace?.candleCount ?? readiness.candleCount, 0),
    coverageRatio: readiness.coverageRatio ?? null,
    gapCount: safeNumber(readiness.gapCount, 0),
    stale: Boolean(readiness.stale),
    warnings: [...new Set(warnings)],
    actionPlan,
    nextSafeAction: actionRequired
      ? "download_or_backfill_local_history_before_trusting_replay_scorecards"
      : "history_coverage_ready_for_replay_review",
    note: actionRequired
      ? "Replay/scorecard conclusies blijven beperkt zolang lokale candle-history ontbreekt, stale is of gaten bevat."
      : "Lokale replay-history is bruikbaar voor policy review."
  };
}

function tableCount(db, table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0;
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isSqliteBusy(error) {
  const message = `${error?.message || ""}`.toLowerCase();
  return error?.code === "SQLITE_BUSY" || message.includes("database is locked") || message.includes("resource busy");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readAllAuditEvents(auditDir) {
  const events = [];
  const files = (await fs.readdir(auditDir, { withFileTypes: true }).catch(() => []))
    .filter((item) => item.isFile() && item.name.endsWith(".ndjson"))
    .map((item) => path.join(auditDir, item.name))
    .sort();
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    for (const line of content.split(/\r?\n/).filter(Boolean)) {
      try {
        events.push(JSON.parse(line));
      } catch {
        events.push({
          at: null,
          type: "audit_parse_error",
          sourceFile: path.basename(filePath),
          rawLine: line
        });
      }
    }
  }
  return events;
}

export class ReadModelStore {
  constructor({ runtimeDir, dbPath = null, logger = null, busyRetryCount = 5, busyRetryMs = 80 } = {}) {
    this.runtimeDir = runtimeDir || path.join(process.cwd(), "data", "runtime");
    this.dbPath = dbPath || path.join(this.runtimeDir, "read-model.sqlite");
    this.logger = logger;
    this.busyRetryCount = Math.max(0, Number(busyRetryCount || 0));
    this.busyRetryMs = Math.max(10, Number(busyRetryMs || 80));
    this.db = null;
  }

  async init({ recreateCorrupt = true } = {}) {
    await ensureDir(path.dirname(this.dbPath));
    for (let attempt = 0; attempt <= this.busyRetryCount; attempt += 1) {
      try {
        this.open();
        this.ensureSchema();
        return;
      } catch (error) {
        this.close();
        if (isSqliteBusy(error)) {
          if (attempt < this.busyRetryCount) {
            await sleep(this.busyRetryMs * (attempt + 1));
            continue;
          }
          throw new Error(`Read model SQLite is currently locked after retries; retry after active readers finish: ${this.dbPath}`);
        }
        if (!recreateCorrupt || this.dbPath === ":memory:") {
          throw error;
        }
        this.logger?.warn?.("Read model SQLite was corrupt or incompatible; rebuilding from source-of-truth files", {
          dbPath: this.dbPath,
          error: error?.message
        });
        await fs.rm(this.dbPath, { force: true });
        this.open();
        this.ensureSchema();
        return;
      }
    }
  }

  open() {
    if (!this.db) {
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec("PRAGMA busy_timeout = 5000;");
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");
    }
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  ensureSchema() {
    const db = this.open();
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        broker_mode TEXT,
        strategy_id TEXT,
        strategy_family TEXT,
        regime TEXT,
        session TEXT,
        entry_at TEXT,
        exit_at TEXT,
        pnl_quote REAL,
        net_pnl_pct REAL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        at TEXT,
        allow INTEGER,
        root_blocker TEXT,
        blocker_stage TEXT,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blockers (
        id TEXT PRIMARY KEY,
        decision_id TEXT,
        symbol TEXT,
        reason TEXT,
        stage TEXT,
        root INTEGER,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        at TEXT,
        type TEXT,
        symbol TEXT,
        cycle_id TEXT,
        decision_id TEXT,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scorecards (
        id TEXT PRIMARY KEY,
        strategy_id TEXT,
        strategy_family TEXT,
        regime TEXT,
        session TEXT,
        status TEXT,
        sample_size INTEGER,
        expectancy_pct REAL,
        confidence REAL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS strategy_lifecycle (
        id TEXT PRIMARY KEY,
        strategy_id TEXT,
        strategy_family TEXT,
        regime TEXT,
        status TEXT,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS execution_attribution (
        id TEXT PRIMARY KEY,
        trade_id TEXT,
        symbol TEXT,
        side TEXT,
        execution_quality REAL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fee_attribution (
        id TEXT PRIMARY KEY,
        trade_id TEXT,
        symbol TEXT,
        entry_fee_quote REAL,
        exit_fee_quote REAL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS replay_traces (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        at TEXT,
        status TEXT,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_cycle ON audit_events(cycle_id);
      CREATE INDEX IF NOT EXISTS idx_audit_decision ON audit_events(decision_id);
      CREATE INDEX IF NOT EXISTS idx_audit_symbol ON audit_events(symbol);
      CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(type);
      CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
      CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions(symbol);
    `);
    db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)").run("schemaVersion", `${READ_MODEL_SCHEMA_VERSION}`);
  }

  resetSchema() {
    const db = this.open();
    db.exec(`
      DROP TABLE IF EXISTS trades;
      DROP TABLE IF EXISTS decisions;
      DROP TABLE IF EXISTS blockers;
      DROP TABLE IF EXISTS audit_events;
      DROP TABLE IF EXISTS scorecards;
      DROP TABLE IF EXISTS strategy_lifecycle;
      DROP TABLE IF EXISTS execution_attribution;
      DROP TABLE IF EXISTS fee_attribution;
      DROP TABLE IF EXISTS replay_traces;
      DROP TABLE IF EXISTS meta;
    `);
    this.ensureSchema();
  }

  clear() {
    const db = this.open();
    db.exec(`
      DELETE FROM trades;
      DELETE FROM decisions;
      DELETE FROM blockers;
      DELETE FROM audit_events;
      DELETE FROM scorecards;
      DELETE FROM strategy_lifecycle;
      DELETE FROM execution_attribution;
      DELETE FROM fee_attribution;
      DELETE FROM replay_traces;
    `);
  }

  rebuild({ journal = {}, auditEvents = [], replayTraces = [], at = new Date().toISOString() } = {}) {
    const db = this.open();
    this.resetSchema();
    db.exec("BEGIN");
    try {
      const insertTrade = db.prepare(`
        INSERT OR REPLACE INTO trades(id, symbol, broker_mode, strategy_id, strategy_family, regime, session, entry_at, exit_at, pnl_quote, net_pnl_pct, json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertDecision = db.prepare(`
        INSERT OR REPLACE INTO decisions(id, symbol, at, allow, root_blocker, blocker_stage, json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertBlocker = db.prepare(`
        INSERT OR REPLACE INTO blockers(id, decision_id, symbol, reason, stage, root, json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertAudit = db.prepare(`
        INSERT OR REPLACE INTO audit_events(id, at, type, symbol, cycle_id, decision_id, json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertScorecard = db.prepare(`
        INSERT OR REPLACE INTO scorecards(id, strategy_id, strategy_family, regime, session, status, sample_size, expectancy_pct, confidence, json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertLifecycle = db.prepare(`
        INSERT OR REPLACE INTO strategy_lifecycle(id, strategy_id, strategy_family, regime, status, json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertExecution = db.prepare(`
        INSERT OR REPLACE INTO execution_attribution(id, trade_id, symbol, side, execution_quality, json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertFee = db.prepare(`
        INSERT OR REPLACE INTO fee_attribution(id, trade_id, symbol, entry_fee_quote, exit_fee_quote, json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertReplay = db.prepare(`
        INSERT OR REPLACE INTO replay_traces(id, symbol, at, status, json)
        VALUES (?, ?, ?, ?, ?)
      `);

      arr(journal.trades).forEach((trade, index) => {
        const id = safeString(trade.id, `trade:${index}`);
        const strategy = trade.strategyAtEntry || trade.strategy || {};
        insertTrade.run(
          id,
          safeString(trade.symbol),
          safeString(trade.brokerMode || trade.source || trade.tradingSource),
          safeString(strategy.strategy || strategy.id || trade.strategyId || trade.activeStrategy),
          safeString(strategy.family || trade.strategyFamily),
          safeString(trade.regimeAtEntry || trade.regime),
          safeString(trade.session || trade.sessionAtEntry),
          safeString(trade.entryAt),
          safeString(trade.exitAt),
          safeNumber(trade.pnlQuote, 0),
          safeNumber(trade.netPnlPct, 0),
          json(trade)
        );
        if (trade.entryExecutionAttribution) {
          insertExecution.run(`${id}:entry`, id, safeString(trade.symbol), "BUY", safeNumber(trade.entryExecutionAttribution.executionQualityScore, safeNumber(trade.executionQualityScore, 0)), json(trade.entryExecutionAttribution));
        }
        if (trade.exitExecutionAttribution) {
          insertExecution.run(`${id}:exit`, id, safeString(trade.symbol), "SELL", safeNumber(trade.exitExecutionAttribution.executionQualityScore, safeNumber(trade.executionQualityScore, 0)), json(trade.exitExecutionAttribution));
        }
        insertFee.run(
          `${id}:fees`,
          id,
          safeString(trade.symbol),
          safeNumber(trade.entryFeeQuote ?? trade.entryFee, 0),
          safeNumber(trade.exitFeeQuote ?? trade.exitFee, 0),
          json({
            entryFee: trade.entryFee,
            entryFeeQuote: trade.entryFeeQuote,
            entryFeeAssetBreakdown: trade.entryFeeAssetBreakdown,
            exitFee: trade.exitFee,
            exitFeeQuote: trade.exitFeeQuote,
            exitFeeAssetBreakdown: trade.exitFeeAssetBreakdown
          })
        );
      });

      arr(journal.blockedSetups).forEach((decision, index) => {
        const id = safeString(decision.decisionId || decision.id, `blocked:${index}`);
        const reasons = arr(decision.reasons || decision.blockers || decision.blockerReasons);
        insertDecision.run(
          id,
          safeString(decision.symbol),
          safeString(decision.at || decision.createdAt),
          0,
          safeString(decision.rootBlocker || reasons[0]),
          safeString(decision.blockerStage || decision.stage),
          json(decision)
        );
        reasons.forEach((reason, reasonIndex) => {
          insertBlocker.run(
            `${id}:${reasonIndex}:${reason}`,
            id,
            safeString(decision.symbol),
            safeString(reason),
            safeString(decision.blockerStage || decision.stage),
            reasonIndex === 0 ? 1 : 0,
            json({ reason, decisionId: id, source: "journal.blockedSetups" })
          );
        });
      });

      const allAuditLikeEvents = [
        ...arr(auditEvents),
        ...arr(journal.events).map((event, index) => ({
          ...event,
          id: event.id || `journal-event:${index}`,
          source: event.source || "journal.events"
        }))
      ];

      arr(allAuditLikeEvents).forEach((event, index) => {
        const id = safeString(event.id || event.eventId, `audit:${index}`);
        insertAudit.run(
          id,
          safeString(event.at),
          safeString(event.type || event.kind || event.eventType),
          safeString(event.symbol),
          safeString(event.cycleId || event.cycle_id),
          safeString(event.decisionId || event.decision_id),
          json(event)
        );
      });

      const scorecards = buildStrategyEvidenceScorecards({
        trades: arr(journal.trades),
        minSampleSize: 5
      });
      for (const card of scorecards) {
        insertScorecard.run(
          card.id,
          card.strategyId,
          card.strategyFamily,
          card.regime,
          card.session,
          card.status,
          card.sampleSize,
          card.expectancyPct,
          card.confidence,
          json(card)
        );
        insertLifecycle.run(
          card.id,
          card.strategyId,
          card.strategyFamily,
          card.regime,
          card.status === "dangerous" ? "quarantined" : card.status === "negative_edge" ? "degraded" : card.status === "positive_edge" ? "paper_approved" : "paper_testing",
          json({ source: "scorecard", scorecard: card })
        );
      }

      arr(replayTraces).forEach((trace, index) => {
        const id = safeString(trace.id || trace.replayId, `replay:${index}`);
        insertReplay.run(id, safeString(trace.symbol), safeString(trace.at), safeString(trace.status), json(trace));
      });

      db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)").run("rebuiltAt", at);
      db.exec("COMMIT");
      return this.status();
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async rebuildFromSources({ stateStore = null, auditStore = null } = {}) {
    await this.init();
    const store = stateStore || new StateStore(this.runtimeDir);
    const journal = await store.loadJournal();
    const effectiveAuditStore = auditStore || new AuditLogStore(this.runtimeDir);
    const auditEvents = await readAllAuditEvents(effectiveAuditStore.auditDir);
    return this.rebuild({ journal, auditEvents });
  }

  refreshFromJournalSnapshot({ journal = {}, at = new Date().toISOString() } = {}) {
    const db = this.open();
    this.ensureSchema();
    db.exec("BEGIN");
    try {
      db.exec(`
        DELETE FROM trades;
        DELETE FROM decisions;
        DELETE FROM blockers;
        DELETE FROM scorecards;
        DELETE FROM strategy_lifecycle;
        DELETE FROM execution_attribution;
        DELETE FROM fee_attribution;
      `);
      const insertTrade = db.prepare(`
        INSERT OR REPLACE INTO trades(id, symbol, broker_mode, strategy_id, strategy_family, regime, session, entry_at, exit_at, pnl_quote, net_pnl_pct, json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertDecision = db.prepare(`
        INSERT OR REPLACE INTO decisions(id, symbol, at, allow, root_blocker, blocker_stage, json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertBlocker = db.prepare(`
        INSERT OR REPLACE INTO blockers(id, decision_id, symbol, reason, stage, root, json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertAudit = db.prepare(`
        INSERT OR REPLACE INTO audit_events(id, at, type, symbol, cycle_id, decision_id, json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertScorecard = db.prepare(`
        INSERT OR REPLACE INTO scorecards(id, strategy_id, strategy_family, regime, session, status, sample_size, expectancy_pct, confidence, json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertLifecycle = db.prepare(`
        INSERT OR REPLACE INTO strategy_lifecycle(id, strategy_id, strategy_family, regime, status, json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertExecution = db.prepare(`
        INSERT OR REPLACE INTO execution_attribution(id, trade_id, symbol, side, execution_quality, json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertFee = db.prepare(`
        INSERT OR REPLACE INTO fee_attribution(id, trade_id, symbol, entry_fee_quote, exit_fee_quote, json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      arr(journal.trades).forEach((trade, index) => {
        const id = safeString(trade.id, `trade:${index}`);
        const strategy = trade.strategyAtEntry || trade.strategy || {};
        insertTrade.run(
          id,
          safeString(trade.symbol),
          safeString(trade.brokerMode || trade.source || trade.tradingSource),
          safeString(strategy.strategy || strategy.id || trade.strategyId || trade.activeStrategy),
          safeString(strategy.family || trade.strategyFamily),
          safeString(trade.regimeAtEntry || trade.regime),
          safeString(trade.session || trade.sessionAtEntry),
          safeString(trade.entryAt),
          safeString(trade.exitAt),
          safeNumber(trade.pnlQuote, 0),
          safeNumber(trade.netPnlPct, 0),
          json(trade)
        );
        if (trade.entryExecutionAttribution) {
          insertExecution.run(`${id}:entry`, id, safeString(trade.symbol), "BUY", safeNumber(trade.entryExecutionAttribution.executionQualityScore, safeNumber(trade.executionQualityScore, 0)), json(trade.entryExecutionAttribution));
        }
        if (trade.exitExecutionAttribution) {
          insertExecution.run(`${id}:exit`, id, safeString(trade.symbol), "SELL", safeNumber(trade.exitExecutionAttribution.executionQualityScore, safeNumber(trade.executionQualityScore, 0)), json(trade.exitExecutionAttribution));
        }
        insertFee.run(
          `${id}:fees`,
          id,
          safeString(trade.symbol),
          safeNumber(trade.entryFeeQuote ?? trade.entryFee, 0),
          safeNumber(trade.exitFeeQuote ?? trade.exitFee, 0),
          json({
            entryFee: trade.entryFee,
            entryFeeQuote: trade.entryFeeQuote,
            entryFeeAssetBreakdown: trade.entryFeeAssetBreakdown,
            exitFee: trade.exitFee,
            exitFeeQuote: trade.exitFeeQuote,
            exitFeeAssetBreakdown: trade.exitFeeAssetBreakdown
          })
        );
      });
      arr(journal.blockedSetups).forEach((decision, index) => {
        const id = safeString(decision.decisionId || decision.id, `blocked:${index}`);
        const reasons = arr(decision.reasons || decision.blockers || decision.blockerReasons);
        insertDecision.run(
          id,
          safeString(decision.symbol),
          safeString(decision.at || decision.createdAt),
          0,
          safeString(decision.rootBlocker || reasons[0]),
          safeString(decision.blockerStage || decision.stage),
          json(decision)
        );
        reasons.forEach((reason, reasonIndex) => {
          insertBlocker.run(
            `${id}:${reasonIndex}:${reason}`,
            id,
            safeString(decision.symbol),
            safeString(reason),
            safeString(decision.blockerStage || decision.stage),
            reasonIndex === 0 ? 1 : 0,
            json({ reason, decisionId: id, source: "journal.blockedSetups" })
          );
        });
      });
      arr(journal.events).forEach((event, index) => {
        const id = safeString(event.id || event.eventId, `journal-event:${index}`);
        insertAudit.run(
          id,
          safeString(event.at),
          safeString(event.type || event.kind || event.eventType),
          safeString(event.symbol),
          safeString(event.cycleId || event.cycle_id),
          safeString(event.decisionId || event.decision_id),
          json({ ...event, id, source: event.source || "journal.events" })
        );
      });
      const scorecards = buildStrategyEvidenceScorecards({ trades: arr(journal.trades), minSampleSize: 5 });
      for (const card of scorecards) {
        insertScorecard.run(card.id, card.strategyId, card.strategyFamily, card.regime, card.session, card.status, card.sampleSize, card.expectancyPct, card.confidence, json(card));
        insertLifecycle.run(
          card.id,
          card.strategyId,
          card.strategyFamily,
          card.regime,
          card.status === "dangerous" ? "quarantined" : card.status === "negative_edge" ? "degraded" : card.status === "positive_edge" ? "paper_approved" : "paper_testing",
          json({ source: "scorecard", scorecard: card })
        );
      }
      db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)").run("journalRefreshedAt", at);
      db.exec("COMMIT");
      return this.status();
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  status() {
    const db = this.open();
    this.ensureSchema();
    const metaRows = db.prepare("SELECT key, value FROM meta").all();
    const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));
    return {
      status: "ready",
      dbPath: this.dbPath,
      schemaVersion: Number(meta.schemaVersion || READ_MODEL_SCHEMA_VERSION),
      rebuiltAt: meta.rebuiltAt || null,
      journalRefreshedAt: meta.journalRefreshedAt || null,
      tables: {
        trades: tableCount(db, "trades"),
        decisions: tableCount(db, "decisions"),
        blockers: tableCount(db, "blockers"),
        auditEvents: tableCount(db, "audit_events"),
        scorecards: tableCount(db, "scorecards"),
        strategyLifecycle: tableCount(db, "strategy_lifecycle"),
        executionAttribution: tableCount(db, "execution_attribution"),
        feeAttribution: tableCount(db, "fee_attribution"),
        replayTraces: tableCount(db, "replay_traces")
      }
    };
  }

  dashboardSummary({ limit = 8 } = {}) {
    const db = this.open();
    this.ensureSchema();
    const status = this.status();
    const topBlockers = db.prepare(`
      SELECT reason, COUNT(*) AS count
      FROM blockers
      GROUP BY reason
      ORDER BY count DESC, reason ASC
      LIMIT ?
    `).all(limit);
    const topScorecards = db.prepare(`
      SELECT strategy_id AS strategyId, strategy_family AS strategyFamily, regime, session, status, sample_size AS sampleSize, expectancy_pct AS expectancyPct, confidence
      FROM scorecards
      ORDER BY confidence DESC, sample_size DESC, expectancy_pct DESC
      LIMIT ?
    `).all(limit);
    const latestReplay = db.prepare(`
      SELECT id, symbol, at, status, json
      FROM replay_traces
      ORDER BY COALESCE(at, '') DESC, id DESC
      LIMIT 1
    `).get() || null;
    const replayCoverageGate = buildReplayCoverageGate(latestReplay);
    const operatorRunbooks = topBlockers
      .slice(0, 3)
      .map((item) => buildOperatorRunbookForReason(item.reason, { count: item.count }));
    const requestBudget = this.requestBudgetSummary({ limit });
    const strategyLifecycleDiagnostics = buildStrategyLifecycleDiagnostics(topScorecards);
    const tradingImprovementDiagnostics = buildTradingImprovementDiagnostics({
      blockedSetups: topBlockers.map((item) => ({ reasons: [item.reason] })),
      requestBudget,
      readModel: {
        topScorecards,
        strategyLifecycleDiagnostics
      }
    });
    return {
      ...status,
      source: "sqlite_read_model",
      fallbackAvailable: true,
      topBlockers,
      topScorecards,
      latestReplay,
      replayCoverageGate,
      requestBudget,
      operatorRunbooks,
      strategyLifecycleDiagnostics,
      tradingImprovementDiagnostics
    };
  }

  requestBudgetSummary({ limit = 8 } = {}) {
    const db = this.open();
    this.ensureSchema();
    const rows = db.prepare(`
      SELECT type, json
      FROM audit_events
      WHERE LOWER(COALESCE(type, '')) LIKE '%request%'
         OR LOWER(COALESCE(type, '')) LIKE '%rate_limit%'
         OR LOWER(COALESCE(type, '')) LIKE '%rest%'
         OR LOWER(COALESCE(json, '')) LIKE '%requestweight%'
         OR LOWER(COALESCE(json, '')) LIKE '%usedweight%'
      ORDER BY COALESCE(at, '') DESC
      LIMIT 250
    `).all();
    const callers = new Map();
    const incidents = [];
    let rateLimitEvents = 0;
    let latestWeight1m = null;
    let latestAt = null;
    for (const row of rows) {
      const event = parseJson(row.json, {});
      latestAt ||= event?.at || null;
      const state = event.requestWeight || event.rateLimitState || event.payload?.requestWeight || {};
      if (Number.isFinite(Number(state.usedWeight1m))) {
        latestWeight1m = Number(state.usedWeight1m);
      }
      if (event.status === 429 || event.status === 418 || state.lastRateLimitStatus) {
        rateLimitEvents += 1;
        incidents.push({
          at: event.at || latestAt || null,
          type: event.type || row.type || "request_budget_event",
          status: event.status || state.lastRateLimitStatus || null,
          banUntil: state.banUntil || event.banUntil || null,
          usedWeight1m: Number.isFinite(Number(state.usedWeight1m)) ? Number(state.usedWeight1m) : null,
          caller: event.caller || event.requestMeta?.caller || null
        });
      }
      const top = state.topRestCallers || event.topRestCallers || {};
      for (const [key, value] of Object.entries(top)) {
        const prev = callers.get(key) || { caller: key, count: 0, weight: 0 };
        prev.count += Number(value?.count || 0);
        prev.weight += Number(value?.weight || value?.usedWeight || 0);
        callers.set(key, prev);
      }
    }
    const topCallers = [...callers.values()]
      .map((caller) => {
        const publicDepth = /depth|orderBook|order_book/i.test(caller.caller);
        const publicBookTicker = /bookTicker|ticker\/bookTicker/i.test(caller.caller);
        const publicKlines = /klines|kline/i.test(caller.caller);
        const privateTradeHistory = /myTrades|recent_trades|trade_history|settle_.*trades/i.test(caller.caller);
        const privateOrders = /openOrders|open_orders|openOrderList|open_order_list/i.test(caller.caller);
        const privateAccount = /account/i.test(caller.caller);
        const hotThreshold = publicDepth ? 5000 : privateTradeHistory ? 2000 : privateOrders ? 8000 : 1000;
        const hot = Number(caller.weight || 0) >= hotThreshold;
        const streamReplacementAvailable = publicDepth || privateTradeHistory || privateOrders;
        const restClass = publicDepth
          ? "public_market_depth"
          : publicBookTicker
            ? "public_book_ticker"
            : publicKlines
              ? "public_klines"
              : privateTradeHistory
                ? "private_trade_history"
                : privateOrders
                  ? "private_orders"
                  : privateAccount
                    ? "private_account"
                    : "other";
        return {
          ...caller,
          restClass,
          hot,
          streamReplacementAvailable,
          guarded: hot && (publicDepth || privateTradeHistory),
          nextSafeAction: publicDepth
            ? "use_local_book_or_public_stream"
            : privateTradeHistory
              ? "use_user_stream_fills"
              : privateOrders
                ? "use_user_stream_order_truth_and_reduce_rest_sanity"
                : hot
                  ? "review_rest_call_frequency"
                  : "watch"
        };
      })
      .sort((left, right) => (right.weight - left.weight) || (right.count - left.count) || left.caller.localeCompare(right.caller))
      .slice(0, limit);
    const pressureLevel = latestWeight1m == null
      ? "unknown"
      : latestWeight1m >= 6000
        ? "critical"
        : latestWeight1m >= 4800
          ? "warning"
          : latestWeight1m >= 3000
            ? "elevated"
            : "normal";
    const criticalCallers = topCallers
      .filter((caller) => caller.weight >= 25 || ["public_market_depth", "private_orders", "private_account"].includes(caller.restClass))
      .slice(0, Math.max(1, Math.min(5, limit)));
    const callerGroups = topCallers.reduce((groups, caller) => {
      const group = caller.restClass === "public_market_depth"
        ? "public_depth"
        : caller.restClass === "public_book_ticker"
          ? "public_book_ticker"
          : caller.restClass === "public_klines"
            ? "public_klines"
            : caller.restClass === "private_orders"
              ? "private_orders"
              : caller.restClass === "private_trade_history"
                ? "private_trade_history"
              : caller.restClass === "private_account"
                ? "private_account"
                : "other";
      groups[group] = groups[group] || { group, count: 0, weight: 0, callers: [] };
      groups[group].count += Number(caller.count || 0);
      groups[group].weight += Number(caller.weight || 0);
      groups[group].callers.push(caller.caller);
      return groups;
    }, {});
    const incidentCandidates = criticalCallers
      .filter((caller) => caller.weight >= 1000 || /depth|openOrders|open_orders|openOrderList|open_order_list/i.test(caller.caller))
      .map((caller) => ({
        at: latestAt,
        type: "request_budget_hot_caller",
        status: null,
        usedWeight1m: latestWeight1m,
        caller: caller.caller,
        weight: caller.weight,
        count: caller.count,
        recommendation: /depth|orderBook/i.test(caller.caller)
          ? "move_public_depth_to_stream_or_raise_fallback_ttl"
          : /openOrders|open_orders|openOrderList|open_order_list|account/i.test(caller.caller)
            ? "prefer_user_data_stream_and_reduce_private_rest_sanity_checks"
            : "review_rest_call_frequency"
      }));
    const recommendedActions = [];
    if (pressureLevel === "critical" || pressureLevel === "warning") {
      recommendedActions.push("Pauzeer niet-kritieke dashboard/research/scanner REST acties tot weight normaliseert.");
    }
    if (criticalCallers.some((caller) => /depth|orderBook/i.test(caller.caller))) {
      recommendedActions.push("Vervang hot depth/orderbook polling door WebSocket/local book of verhoog fallback TTL.");
    }
    if (criticalCallers.some((caller) => /openOrders|open_orders|allOrders|account/i.test(caller.caller))) {
      recommendedActions.push("Gebruik user-data stream voor private order/account updates en beperk REST sanity checks.");
    }
    return {
      status: rows.length ? "ready" : "no_recent_request_budget_events",
      latestAt,
      latestWeight1m,
      pressureLevel,
      rateLimitEvents,
      topCallers,
      criticalCallers,
      callerGroups: Object.values(callerGroups)
        .sort((left, right) => right.weight - left.weight)
        .slice(0, limit),
      incidents: [...incidents, ...incidentCandidates].slice(0, limit),
      recommendedActions
    };
  }

  readDecisionTrace(decisionId) {
    const db = this.open();
    this.ensureSchema();
    const decision = db.prepare("SELECT * FROM decisions WHERE id = ?").get(decisionId) || null;
    const auditEvents = db.prepare("SELECT * FROM audit_events WHERE decision_id = ? ORDER BY COALESCE(at, '') ASC").all(decisionId);
    const blockers = db.prepare("SELECT * FROM blockers WHERE decision_id = ? ORDER BY root DESC, reason ASC").all(decisionId);
    return {
      status: decision || auditEvents.length || blockers.length ? "ready" : "not_found",
      decisionId,
      decision: decision ? parseJson(decision.json, decision) : null,
      blockers: blockers.map((row) => parseJson(row.json, row)),
      auditEvents: auditEvents.map((row) => parseJson(row.json, row)),
      warnings: decision ? [] : ["decision_record_not_found"]
    };
  }

  readCycleTrace(cycleId) {
    const db = this.open();
    this.ensureSchema();
    const auditEvents = db.prepare("SELECT * FROM audit_events WHERE cycle_id = ? ORDER BY COALESCE(at, '') ASC").all(cycleId);
    const decisionIds = [...new Set(auditEvents.map((row) => row.decision_id).filter(Boolean))];
    return {
      status: auditEvents.length ? "ready" : "not_found",
      cycleId,
      decisionIds,
      auditEvents: auditEvents.map((row) => parseJson(row.json, row)),
      warnings: auditEvents.length ? [] : ["cycle_events_not_found"]
    };
  }

  readSymbolTrace(symbol, { limit = 100 } = {}) {
    const normalized = `${symbol || ""}`.toUpperCase();
    const db = this.open();
    this.ensureSchema();
    const auditEvents = db.prepare("SELECT * FROM audit_events WHERE symbol = ? ORDER BY COALESCE(at, '') DESC LIMIT ?").all(normalized, limit);
    const trades = db.prepare("SELECT * FROM trades WHERE symbol = ? ORDER BY COALESCE(exit_at, entry_at, '') DESC LIMIT ?").all(normalized, limit);
    const decisions = db.prepare("SELECT * FROM decisions WHERE symbol = ? ORDER BY COALESCE(at, '') DESC LIMIT ?").all(normalized, limit);
    return {
      status: auditEvents.length || trades.length || decisions.length ? "ready" : "not_found",
      symbol: normalized,
      trades: trades.map((row) => parseJson(row.json, row)),
      decisions: decisions.map((row) => parseJson(row.json, row)),
      auditEvents: auditEvents.map((row) => parseJson(row.json, row)),
      warnings: auditEvents.length || trades.length || decisions.length ? [] : ["symbol_trace_not_found"]
    };
  }

  upsertReplayTrace(trace = {}) {
    const db = this.open();
    this.ensureSchema();
    const id = safeString(trace.id || trace.replayId, `replay:${Date.now()}`);
    db.prepare(`
      INSERT OR REPLACE INTO replay_traces(id, symbol, at, status, json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, safeString(trace.symbol), safeString(trace.at || new Date().toISOString()), safeString(trace.status || "ready"), json(trace));
    return id;
  }
}

export async function runReadModelCommand({ config, logger = null, action = "status" } = {}) {
  const store = new ReadModelStore({ runtimeDir: config.runtimeDir, logger });
  try {
    if (action === "rebuild") {
      return await store.rebuildFromSources();
    }
    await store.init();
    if (action === "request-budget") {
      return store.requestBudgetSummary();
    }
    if (action === "dashboard") {
      return store.dashboardSummary();
    }
    return store.status();
  } finally {
    store.close();
  }
}

export async function runReadModelTraceCommand({ config, kind, value, logger = null } = {}) {
  const store = new ReadModelStore({ runtimeDir: config.runtimeDir, logger });
  try {
    await store.init();
    if (kind === "decision") {
      return store.readDecisionTrace(value);
    }
    if (kind === "cycle") {
      return store.readCycleTrace(value);
    }
    if (kind === "symbol") {
      return store.readSymbolTrace(value);
    }
    throw new Error(`Unknown read-model trace kind: ${kind}`);
  } finally {
    store.close();
  }
}
