import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildPaperAnalyticsReadModelSummary } from "../src/storage/readModelAnalyticsQueries.js";
import { ReadModelStore } from "../src/storage/readModelStore.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function createAnalyticsDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE trades (id TEXT, symbol TEXT, broker_mode TEXT, strategy_family TEXT, pnl_quote REAL, net_pnl_pct REAL, exit_at TEXT, entry_at TEXT, json TEXT NOT NULL);
    CREATE TABLE decisions (id TEXT, symbol TEXT, at TEXT, allow INTEGER, root_blocker TEXT, json TEXT NOT NULL);
    CREATE TABLE blockers (reason TEXT, symbol TEXT);
    CREATE TABLE audit_events (type TEXT, at TEXT, json TEXT NOT NULL);
    CREATE TABLE scorecards (strategy_id TEXT, strategy_family TEXT, regime TEXT, session TEXT, status TEXT, sample_size INTEGER, expectancy_pct REAL, confidence REAL, json TEXT NOT NULL);
  `);
  return db;
}

export async function registerReadModelAnalyticsQueriesTests({ runCheck, assert }) {
  await runCheck("readmodel analytics empty database returns safe result", async () => {
    const db = createAnalyticsDb();
    const summary = buildPaperAnalyticsReadModelSummary({ db, status: { status: "ready", tables: {} } });

    assert.equal(summary.status, "ready");
    assert.equal(summary.sourceOfTruth, "json_ndjson");
    assert.equal(summary.sourceOfTruthMigrated, false);
    assert.equal(summary.counts.paperTrades, 0);
    assert.doesNotThrow(() => JSON.stringify(summary));
    db.close();
  });

  await runCheck("readmodel analytics missing table returns degraded summary", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE trades (id TEXT, json TEXT NOT NULL);");
    const summary = buildPaperAnalyticsReadModelSummary({ db });

    assert.equal(summary.status, "degraded");
    assert.ok(summary.missingTables.includes("decisions"));
    assert.ok(summary.warnings.includes("missing_analytics_tables"));
    db.close();
  });

  await runCheck("readmodel analytics queries paper trades blockers vetoes and scorecards", async () => {
    const db = createAnalyticsDb();
    db.prepare("INSERT INTO trades(id, symbol, broker_mode, strategy_family, pnl_quote, net_pnl_pct, exit_at, entry_at, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "t1",
      "BTCUSDT",
      "paper",
      "breakout",
      12,
      0.4,
      "2026-05-06T10:00:00.000Z",
      "2026-05-06T09:00:00.000Z",
      JSON.stringify({ exitQuality: { label: "good_exit" } })
    );
    db.prepare("INSERT INTO decisions(id, symbol, at, allow, root_blocker, json) VALUES (?, ?, ?, ?, ?, ?)").run(
      "d1",
      "BTCUSDT",
      "2026-05-06T09:00:00.000Z",
      1,
      null,
      JSON.stringify({ decisionId: "d1", setupType: "breakout_retest" })
    );
    db.prepare("INSERT INTO blockers(reason, symbol) VALUES (?, ?)").run("model_confidence_too_low", "ETHUSDT");
    db.prepare("INSERT INTO audit_events(type, at, json) VALUES (?, ?, ?)").run("veto_outcome", "2026-05-06T10:05:00.000Z", JSON.stringify({ vetoOutcome: { label: "bad_veto" } }));
    db.prepare("INSERT INTO scorecards(strategy_id, strategy_family, regime, session, status, sample_size, expectancy_pct, confidence, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "breakout_retest",
      "breakout",
      "trend",
      "eu",
      "positive_edge",
      25,
      0.12,
      0.8,
      "{}"
    );

    const summary = buildPaperAnalyticsReadModelSummary({ db });
    assert.equal(summary.counts.paperTrades, 1);
    assert.equal(summary.exitQuality.good_exit, 1);
    assert.equal(summary.vetoOutcomes.bad_veto, 1);
    assert.equal(summary.blockerTimelines[0].reason, "model_confidence_too_low");
    assert.equal(summary.cohortScorecards[0].strategyId, "breakout_retest");
    db.close();
  });

  await runCheck("readmodel analytics corrupt sqlite can be recreated by store init", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "readmodel-corrupt-"));
    const dbPath = path.join(dir, "read-model.sqlite");
    await fs.writeFile(dbPath, "not a sqlite database", "utf8");
    const store = new ReadModelStore({ runtimeDir: dir, dbPath });
    try {
      await store.init({ recreateCorrupt: true });
      const status = store.status();
      assert.equal(status.status, "ready");
      assert.equal(status.paperAnalyticsReadmodelSummary.sourceOfTruthMigrated, false);
    } finally {
      store.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  await runCheck("readmodel analytics dashboard fallback is JSON serializable", async () => {
    const fallback = normalizeDashboardSnapshotPayload({});
    const normalized = normalizeDashboardSnapshotPayload({
      readModel: {
        paperAnalyticsReadmodelSummary: {
          status: "ready",
          queryStatus: "ready",
          sourceOfTruth: "json_ndjson",
          paperTrades: [{ id: "t1" }]
        }
      }
    });

    assert.equal(fallback.paperAnalyticsReadmodelSummary.status, "unavailable");
    assert.equal(normalized.paperAnalyticsReadmodelSummary.paperTrades.length, 1);
    assert.doesNotThrow(() => JSON.stringify(normalized.paperAnalyticsReadmodelSummary));
  });
}
