import path from "node:path";
import { normalizeAlertSeverity } from "../src/runtime/alertSeverity.js";
import {
  canManageExistingPositions,
  canOpenNewEntries,
  canRunReconcile,
  resolveOperatorMode
} from "../src/runtime/operatorMode.js";
import { buildLiveReadinessAudit } from "../src/runtime/liveReadinessAudit.js";
import { buildIncidentReport, summarizeIncidentReports } from "../src/runtime/incidentReport.js";
import { buildPanicFlattenPlan } from "../src/runtime/panicFlattenPlan.js";
import { buildSafetySnapshot } from "../src/runtime/safetySnapshot.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

async function withCleanOperatorEnv(fn) {
  const keys = ["BOT_MODE", "OPERATOR_MODE", "BINANCE_API_KEY", "BINANCE_API_SECRET", "LIVE_TRADING_ACKNOWLEDGED", "ENABLE_EXCHANGE_PROTECTION"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function writeProject({ fs, os, envLines = [] }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "operator-safety-"));
  await fs.writeFile(path.join(root, ".env.example"), [
    "BOT_MODE=paper",
    "OPERATOR_MODE=active",
    "RUNTIME_DIR=./runtime",
    "HISTORY_DIR=./history",
    "BINANCE_API_KEY=",
    "BINANCE_API_SECRET=",
    "LIVE_TRADING_ACKNOWLEDGED=",
    "ENABLE_EXCHANGE_PROTECTION=true",
    "PAPER_EXECUTION_VENUE=internal",
    "PAPER_MODE_PROFILE=learn",
    "BINANCE_API_BASE_URL="
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(root, ".env"), envLines.join("\n"), "utf8");
  return root;
}

export async function registerOperatorSafetyToolingTests({
  runCheck,
  assert,
  fs,
  os,
  loadConfig,
  ConfigValidationError,
  runCli
}) {
  await runCheck("operator modes expose entry management and reconcile permissions", async () => {
    assert.equal(canOpenNewEntries("active"), true);
    assert.equal(canOpenNewEntries("observe_only"), false);
    assert.equal(canOpenNewEntries("protect_only"), false);
    assert.equal(canOpenNewEntries("maintenance"), false);
    assert.equal(canOpenNewEntries("stopped"), false);
    assert.equal(canManageExistingPositions("protect_only"), true);
    assert.equal(canRunReconcile("maintenance"), true);
    assert.equal(canManageExistingPositions("stopped"), false);
    const critical = resolveOperatorMode({ config: { operatorMode: "active" }, alerts: [{ severity: "critical" }] });
    assert.equal(critical.mode, "protect_only");
    assert.equal(critical.canOpenNewEntries, false);
  });

  await runCheck("operator mode config defaults active and rejects invalid values", async () => {
    await withCleanOperatorEnv(async () => {
      const activeRoot = await writeProject({ fs, os, envLines: ["BOT_MODE=paper"] });
      const active = await loadConfig(activeRoot);
      assert.equal(active.operatorMode, "active");

      const maintenanceRoot = await writeProject({ fs, os, envLines: ["BOT_MODE=live", "OPERATOR_MODE=maintenance", "BINANCE_API_KEY=k", "BINANCE_API_SECRET=s", "LIVE_TRADING_ACKNOWLEDGED=I_UNDERSTAND_LIVE_TRADING_RISK", "ENABLE_EXCHANGE_PROTECTION=true"] });
      const maintenance = await loadConfig(maintenanceRoot);
      const mode = resolveOperatorMode({ config: maintenance });
      assert.equal(mode.canOpenNewEntries, false);

      const invalidRoot = await writeProject({ fs, os, envLines: ["OPERATOR_MODE=unsafe"] });
      await assert.rejects(
        () => loadConfig(invalidRoot),
        (error) => error instanceof ConfigValidationError && error.errors.some((item) => item.includes("OPERATOR_MODE"))
      );
    });
  });

  await runCheck("alert severity normalizes unknown values and critical blocks readiness", async () => {
    assert.equal(normalizeAlertSeverity({ severity: "CRITICAL" }), "critical");
    assert.equal(normalizeAlertSeverity({ severity: "weird" }), "medium");
    const audit = buildLiveReadinessAudit({
      config: { liveTradingAcknowledged: "I_UNDERSTAND_LIVE_TRADING_RISK", binanceApiKey: "k", binanceApiSecret: "s", enableExchangeProtection: true },
      runtimeState: { alerts: [{ severity: "critical" }] },
      promotionDossier: { status: "ready" },
      rollbackWatch: { status: "normal" }
    });
    assert.equal(audit.status, "blocked");
    assert.ok(audit.blockingReasons.includes("critical_alert_active"));
  });

  await runCheck("live readiness audit covers blocked canary and ready states", async () => {
    assert.equal(buildLiveReadinessAudit({ config: {}, promotionDossier: {}, rollbackWatch: {} }).status, "blocked");
    const baseConfig = {
      botMode: "paper",
      liveTradingAcknowledged: "I_UNDERSTAND_LIVE_TRADING_RISK",
      binanceApiKey: "k",
      binanceApiSecret: "s",
      enableExchangeProtection: true
    };
    assert.equal(buildLiveReadinessAudit({ config: baseConfig, promotionDossier: { status: "canary_candidate" }, rollbackWatch: { status: "normal" } }).status, "canary_only");
    assert.equal(buildLiveReadinessAudit({ config: baseConfig, doctor: { status: "degraded" }, promotionDossier: { status: "ready" }, rollbackWatch: { status: "normal" } }).status, "not_ready");
    assert.equal(buildLiveReadinessAudit({ config: baseConfig, promotionDossier: { status: "ready" }, rollbackWatch: { status: "normal" } }).status, "ready");
  });

  await runCheck("incident report captures critical safety context and redacts secrets", async () => {
    const report = buildIncidentReport({
      type: "manual_review",
      severity: "critical",
      configHash: "hash",
      runtimeState: { apiSecret: "secret-value" },
      alerts: [{ id: "a1", severity: "critical", message: "Exchange truth freeze" }],
      positions: [{ symbol: "BTCUSDT", quantity: 1 }],
      intents: [{ id: "i1", symbol: "BTCUSDT", kind: "entry", status: "pending" }],
      reconcileSummary: { decision: "NEEDS_MANUAL_REVIEW", manualReviewRequired: true },
      recentDecisions: [{ symbol: "BTCUSDT", reasons: ["exchange_truth_freeze"] }]
    });
    assert.equal(report.severity, "critical");
    assert.equal(report.activeAlerts[0].severity, "critical");
    assert.ok(report.recommendedOperatorActions.includes("complete_manual_reconcile_review"));
    assert.ok(report.recommendedOperatorActions.includes("inspect_execution_intents_before_new_entries"));
    assert.equal(JSON.stringify(report).includes("secret-value"), false);
  });

  await runCheck("panic flatten plan is dry-run and flags missing market/min-notional/open-order risks", async () => {
    const empty = buildPanicFlattenPlan({ positions: [] });
    assert.equal(empty.mode, "dry_run");
    assert.ok(empty.risks.includes("no_open_positions_detected"));
    const plan = buildPanicFlattenPlan({
      config: { minTradeUsdt: 25 },
      positions: [{ symbol: "BTCUSDT", quantity: 0.001, ocoOrderListId: 123 }, { symbol: "ETHUSDT", quantity: 0.001 }],
      marketSnapshots: { BTCUSDT: { bid: 30000 } },
      symbolRules: { BTCUSDT: { minNotional: 40 } },
      openOrders: [{ symbol: "BTCUSDT", orderId: 1, side: "SELL" }]
    });
    assert.equal(plan.positionsToClose[0].protected, true);
    assert.ok(plan.blockedReasons.includes("below_min_notional"));
    assert.ok(plan.blockedReasons.includes("missing_market_data"));
    assert.equal(plan.ordersToCancel.length, 1);
  });

  await runCheck("runtime safety snapshot is fallback-safe and blocks entries under operator/readiness pressure", async () => {
    const snapshot = buildSafetySnapshot({
      config: { operatorMode: "protect_only" },
      operatorMode: { mode: "protect_only" },
      liveReadiness: { status: "blocked", requiredActions: ["resolve_live_readiness"] },
      alerts: [{ severity: "critical" }],
      intents: [{ id: "i1" }],
      positions: [{ symbol: "BTCUSDT" }],
      recorderSummary: { stale: true },
      dashboardFreshness: { stale: true }
    });
    assert.equal(snapshot.overallStatus, "blocked");
    assert.equal(snapshot.entryPermission.allowed, false);
    assert.equal(snapshot.positionManagementPermission.allowed, true);
    assert.ok(snapshot.topRisks.includes("critical_alerts"));
  });

  await runCheck("operator dashboard normalizer keeps new fields optional", async () => {
    const minimal = normalizeDashboardSnapshotPayload({});
    assert.equal(minimal.operatorModeSummary.mode, "active");
    assert.equal(minimal.liveReadinessAudit.status, "not_ready");
    assert.equal(minimal.safetySnapshot.overallStatus, "unknown");
    assert.equal(minimal.incidentSummary.status, "empty");
    assert.equal(minimal.panicPlanAvailable, false);
  });

  await runCheck("incident and panic CLI commands are read-only or dry-run", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "operator-cli-"));
    const runtimeDir = path.join(root, "runtime");
    const { StateStore } = await import("../src/storage/stateStore.js");
    const store = new StateStore(runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    runtime.openPositions = [{ symbol: "BTCUSDT", quantity: 0.001 }];
    runtime.alerts = [{ severity: "critical", message: "test" }];
    await store.saveRuntime(runtime);
    const config = { runtimeDir, projectRoot: root, configHash: "hash", minTradeUsdt: 25 };
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    const lines = [];
    const previousLog = console.log;
    console.log = (line) => lines.push(line);
    try {
      await runCli({ command: "incidents:create", args: ["--type", "manual_review"], config, logger, processState: { exitCode: undefined } });
      await runCli({ command: "incidents:summary", args: [], config, logger, processState: { exitCode: undefined } });
      await runCli({ command: "live:panic-plan", args: [], config, logger, processState: { exitCode: undefined } });
    } finally {
      console.log = previousLog;
    }
    const created = JSON.parse(lines[0]);
    const summary = JSON.parse(lines[1]);
    const panic = JSON.parse(lines[2]);
    assert.equal(created.status, "ok");
    assert.equal(summary.count, 1);
    assert.equal(panic.mode, "dry_run");
  });
}
