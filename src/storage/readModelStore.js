import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { StateStore } from "./stateStore.js";
import { AuditLogStore } from "./auditLogStore.js";
import { buildStrategyEvidenceScorecards } from "../runtime/strategyEvidenceScorecard.js";
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

function tableCount(db, table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0;
}

function isSqliteBusy(error) {
  const message = `${error?.message || ""}`.toLowerCase();
  return error?.code === "SQLITE_BUSY" || message.includes("database is locked") || message.includes("resource busy");
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
  constructor({ runtimeDir, dbPath = null, logger = null } = {}) {
    this.runtimeDir = runtimeDir || path.join(process.cwd(), "data", "runtime");
    this.dbPath = dbPath || path.join(this.runtimeDir, "read-model.sqlite");
    this.logger = logger;
    this.db = null;
  }

  async init({ recreateCorrupt = true } = {}) {
    await ensureDir(path.dirname(this.dbPath));
    try {
      this.open();
      this.ensureSchema();
    } catch (error) {
      this.close();
      if (isSqliteBusy(error)) {
        throw new Error(`Read model SQLite is currently locked; retry after active readers finish: ${this.dbPath}`);
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
    }
  }

  open() {
    if (!this.db) {
      this.db = new DatabaseSync(this.dbPath);
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

      arr(auditEvents).forEach((event, index) => {
        const id = safeString(event.id || event.eventId, `audit:${index}`);
        insertAudit.run(
          id,
          safeString(event.at),
          safeString(event.type || event.eventType),
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
}

export async function runReadModelCommand({ config, logger = null, action = "status" } = {}) {
  const store = new ReadModelStore({ runtimeDir: config.runtimeDir, logger });
  try {
    if (action === "rebuild") {
      return await store.rebuildFromSources();
    }
    await store.init();
    return store.status();
  } finally {
    store.close();
  }
}
