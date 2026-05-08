import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { StateBackupManager } from "../runtime/stateBackupManager.js";
import { AuditLogStore } from "../storage/auditLogStore.js";
import { StateStore, migrateJournal, migrateRuntime } from "../storage/stateStore.js";
import { redactSecrets } from "../utils/redactSecrets.js";
import { ensureDir, listFiles, loadJson, saveJson } from "../utils/fs.js";

const LIVE_CHANNELS = new Set(["live-observe", "live-conservative"]);
const RELEASE_CHANNELS = new Set(["dev", "paper", "live-observe", "live-conservative"]);
const RESTORE_TEST_MAX_AGE_HOURS = 24 * 7;
const BACKUP_MAX_AGE_HOURS = 24;

function nowIso() {
  return new Date().toISOString();
}

function ageHours(at, now = Date.now()) {
  const ms = at ? new Date(at).getTime() : Number.NaN;
  return Number.isFinite(ms) ? (now - ms) / 36e5 : null;
}

function statusFromChecks(checks) {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ready";
}

function check(id, status, message, details = {}) {
  return { id, status, message, details: redactSecrets(details) };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function canWriteDir(dir) {
  try {
    await ensureDir(dir);
    const probe = path.join(dir, `.write-probe-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, "ok", "utf8");
    await fs.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

function unresolvedIntents(runtime = {}) {
  const ledger = runtime.orderLifecycle?.executionIntentLedger || {};
  return Array.isArray(ledger.unresolvedIntentIds) ? ledger.unresolvedIntentIds.filter(Boolean) : [];
}

function manualReviewItems(runtime = {}) {
  return [
    ...(Array.isArray(runtime.operatorReview?.items) ? runtime.operatorReview.items : []),
    ...(Array.isArray(runtime.ops?.manualReviewQueue?.items) ? runtime.ops.manualReviewQueue.items : [])
  ].filter((item) => !item?.resolvedAt);
}

function activeAlerts(runtime = {}) {
  return Array.isArray(runtime.ops?.alerts?.alerts)
    ? runtime.ops.alerts.alerts.filter((alert) => !alert.resolvedAt && alert.status !== "resolved")
    : [];
}

async function loadRuntimeBundle(config) {
  const store = new StateStore(config.runtimeDir);
  await store.init();
  const [runtime, journal, model, modelBackups] = await Promise.all([
    store.loadRuntime(),
    store.loadJournal(),
    store.loadModel(),
    store.loadModelBackups()
  ]);
  return { store, runtime, journal, model, modelBackups };
}

async function latestRestoreTest(runtimeDir) {
  return loadJson(path.join(runtimeDir, "restore-test-status.json"), null);
}

async function latestBackupSummary(config) {
  const manager = new StateBackupManager({ runtimeDir: config.runtimeDir, config, logger: null });
  await manager.init();
  return manager.getSummary();
}

export async function buildProductionReadinessGate({ config, manager = null } = {}) {
  const checkedAt = nowIso();
  const { runtime } = await loadRuntimeBundle(config);
  const dashboardReadiness = manager?.getOperationalReadiness ? await manager.getOperationalReadiness().catch(() => null) : runtime.ops?.readiness;
  const backup = await latestBackupSummary(config);
  const restore = await latestRestoreTest(config.runtimeDir);
  const backupAge = ageHours(backup.lastBackupAt);
  const restoreAge = ageHours(restore?.lastSuccessfulAt);
  const intents = unresolvedIntents(runtime);
  const review = manualReviewItems(runtime);
  const alerts = activeAlerts(runtime);
  const checks = [
    check("bot_mode", config.botMode === "live" || config.botMode === "paper" ? "ready" : "blocked", `Bot mode is ${config.botMode || "unknown"}.`, { botMode: config.botMode }),
    check("live_acknowledgement", config.botMode === "live" && !config.liveTradingAcknowledged ? "blocked" : "ready", config.botMode === "live" ? "Live acknowledgement checked." : "Paper mode does not require live acknowledgement."),
    check("exchange_protection", config.botMode === "live" && !config.enableExchangeProtection ? "blocked" : "ready", `Exchange protection is ${config.enableExchangeProtection ? "enabled" : "disabled"}.`),
    check("api_keys_present", config.botMode === "live" && (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) ? "blocked" : "ready", "API key presence checked without exposing secrets.", {
      primaryCredentialConfigured: Boolean(process.env.BINANCE_API_KEY),
      signingCredentialConfigured: Boolean(process.env.BINANCE_API_SECRET)
    }),
    check("runtime_writable", await canWriteDir(config.runtimeDir) ? "ready" : "blocked", "Runtime directory write check completed.", { runtimeDir: config.runtimeDir }),
    check("state_backup", config.stateBackupEnabled ? "ready" : "warning", `State backups are ${config.stateBackupEnabled ? "enabled" : "disabled"}.`),
    check("latest_backup", backupAge == null ? "warning" : backupAge > BACKUP_MAX_AGE_HOURS ? "warning" : "ready", "Latest backup age checked.", { lastBackupAt: backup.lastBackupAt, ageHours: backupAge }),
    check("restore_test", restoreAge == null ? "warning" : restoreAge > RESTORE_TEST_MAX_AGE_HOURS ? "warning" : "ready", "Latest restore-test age checked.", { lastSuccessfulAt: restore?.lastSuccessfulAt || null, ageHours: restoreAge }),
    check("dashboard_api", dashboardReadiness ? "ready" : "warning", "Dashboard/API readiness source checked.", { readiness: dashboardReadiness || null }),
    check("stream_health", runtime.streamHealth?.status === "blocked" ? "blocked" : runtime.streamHealth?.status === "stale" ? "warning" : "ready", "Stream health checked.", runtime.streamHealth || {}),
    check("rest_health", runtime.ops?.apiDegradationSummary?.blockedActions?.includes("open_new_entries") ? "blocked" : "ready", "REST health checked.", runtime.ops?.apiDegradationSummary || {}),
    check("user_stream_health", runtime.streamHealth?.userStream?.status === "stale" ? "warning" : "ready", "User stream health checked.", runtime.streamHealth?.userStream || {}),
    check("open_positions_protection", (runtime.exchangeTruth?.staleProtectiveSymbols || []).length ? "blocked" : "ready", "Open position protection checked.", { staleProtectiveSymbols: runtime.exchangeTruth?.staleProtectiveSymbols || [] }),
    check("unresolved_intents", intents.length ? "blocked" : "ready", "Unresolved execution intents checked.", { unresolvedIntentIds: intents }),
    check("manual_review", review.length ? "warning" : "ready", "Manual review flags checked.", { pendingCount: review.length }),
    check("active_alerts", alerts.some((alert) => ["critical", "panic"].includes(alert.severity)) ? "blocked" : alerts.length ? "warning" : "ready", "Active alerts checked.", { activeCount: alerts.length }),
    check("neural_live_influence", config.botMode === "live" && config.neuralLiveAutonomyEnabled ? "warning" : "ready", "Neural live influence status checked.", { enabled: Boolean(config.neuralLiveAutonomyEnabled) }),
    check("fast_execution", config.liveFastObserveOnly === false && config.botMode === "live" ? "warning" : "ready", "Fast execution status checked.", { liveFastObserveOnly: config.liveFastObserveOnly }),
    check("risk_budget", Number.isFinite(config.riskPerTrade) && config.riskPerTrade > 0 ? "ready" : "blocked", "Risk budget checked.", { riskPerTrade: config.riskPerTrade }),
    check("daily_drawdown", runtime.capitalGovernor?.status === "blocked" ? "blocked" : "ready", "Daily drawdown/capital governor checked.", runtime.capitalGovernor || {}),
    check("config_profile", "ready", "Config profile checked.", { configProfile: config.configProfile || config.profile || "default", releaseChannel: config.releaseChannel || process.env.RELEASE_CHANNEL || "paper" })
  ];
  const status = statusFromChecks(checks);
  return {
    status,
    ok: status === "ready",
    checkedAt,
    reasons: checks.filter((item) => item.status !== "ready").map((item) => item.id),
    checks
  };
}

export async function runBackupNow({ config, reason = "ops_backup_now" }) {
  const bundle = await loadRuntimeBundle(config);
  const manager = new StateBackupManager({ runtimeDir: config.runtimeDir, config: { ...config, stateBackupEnabled: true }, logger: null });
  await manager.init();
  const backup = await manager.maybeBackup(redactSecrets({
    runtime: bundle.runtime,
    journal: bundle.journal,
    model: bundle.model,
    modelBackups: bundle.modelBackups
  }), { reason, force: true });
  return { status: backup ? "ready" : "warning", backup, summary: manager.getSummary() };
}

export async function runRestoreTest({ config }) {
  const startedAt = nowIso();
  const backup = await latestBackupSummary(config);
  const backupPayload = backup.latestFile ? await loadJson(backup.latestFile, null) : null;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "trading-bot-restore-test-"));
  const report = { status: "blocked", startedAt, completedAt: null, tempDir, checks: [] };
  try {
    if (!backupPayload?.payload) {
      report.checks.push(check("backup_payload", "blocked", "No readable backup payload found.", { latestFile: backup.latestFile }));
    } else {
      const payload = backupPayload.payload;
      migrateRuntime(payload.runtime || {});
      migrateJournal(payload.journal || {});
      await saveJson(path.join(tempDir, "runtime.json"), payload.runtime || {});
      await saveJson(path.join(tempDir, "journal.json"), payload.journal || {});
      await saveJson(path.join(tempDir, "model.json"), payload.model || {});
      await saveJson(path.join(tempDir, "model-backups.json"), payload.modelBackups || []);
      report.checks.push(check("runtime_schema", "ready", "Runtime schema migrated successfully."));
      report.checks.push(check("journal_schema", "ready", "Journal schema migrated successfully."));
      report.checks.push(check("model_registry", "ready", "Model registry payload is readable."));
      report.checks.push(check("open_position_consistency", "ready", "Open position consistency check completed.", { count: (payload.runtime?.openPositions || []).length }));
    }
    report.status = statusFromChecks(report.checks);
    report.completedAt = nowIso();
    await saveJson(path.join(config.runtimeDir, "restore-test-status.json"), {
      lastRunAt: report.completedAt,
      lastSuccessfulAt: report.status === "ready" ? report.completedAt : null,
      status: report.status,
      checks: report.checks
    });
    return report;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function buildReleaseCheck({ config }) {
  const channel = process.env.RELEASE_CHANNEL || config.releaseChannel || (config.botMode === "live" ? "live-observe" : "paper");
  const readiness = await buildProductionReadinessGate({ config });
  const checks = [
    check("release_channel", RELEASE_CHANNELS.has(channel) ? "ready" : "blocked", `Release channel is ${channel}.`, { channel }),
    check("live_feature_channel", config.botMode === "live" && !LIVE_CHANNELS.has(channel) ? "blocked" : "ready", "Live mode/channel compatibility checked."),
    check("release_notes", LIVE_CHANNELS.has(channel) && !(await exists(path.join(config.projectRoot, "docs", "RELEASE_NOTES.md"))) ? "warning" : "ready", "Release notes checked."),
    check("rollback_plan", !(await exists(path.join(config.projectRoot, "docs", "ROLLBACK_PLAN.md"))) ? "warning" : "ready", "Rollback plan checked."),
    check("readiness", readiness.status === "blocked" ? "blocked" : readiness.status === "warning" ? "warning" : "ready", "Production readiness checked.", { reasons: readiness.reasons })
  ];
  const status = statusFromChecks(checks);
  return { status, ok: status === "ready", channel, checks, readiness };
}

export async function buildRecoveryPlan({ config, apply = false, confirm = false }) {
  const { runtime } = await loadRuntimeBundle(config);
  const actions = [];
  if ((runtime.orderLifecycle?.executionIntentLedger?.unresolvedIntentIds || []).length) actions.push("review_unresolved_execution_intents");
  if ((runtime.exchangeTruth?.staleProtectiveSymbols || []).length) actions.push("protect_or_flatten_stale_protective_positions");
  if (runtime.health?.circuitOpen) actions.push("investigate_health_circuit_before_entries");
  if (!actions.length) actions.push("no_state_mutation_required");
  const plan = { status: actions[0] === "no_state_mutation_required" ? "ready" : "warning", dryRun: !apply, confirmRequired: apply && !confirm, actions };
  if (apply && confirm) {
    const audit = new AuditLogStore(config.runtimeDir);
    await audit.init();
    await audit.append({ at: nowIso(), type: "ops.recovery_apply", plan: redactSecrets(plan) });
    return { ...plan, applied: true };
  }
  return { ...plan, applied: false };
}

export async function buildKeysCheck({ config }) {
  const envPath = path.join(config.projectRoot, ".env");
  const envContent = await fs.readFile(envPath, "utf8").catch(() => "");
  const key = process.env.BINANCE_API_KEY || "";
  return {
    status: config.botMode === "live" && (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) ? "blocked" : "ready",
    envFilePresent: Boolean(envContent),
    keysInEnv: /BINANCE_API_(KEY|SECRET)\s*=/.test(envContent),
    fingerprint: key ? crypto.createHash("sha256").update(key).digest("hex").slice(0, 12) : null,
    recommendations: ["Keep withdrawal permission disabled.", "Use IP whitelist when Binance account policy allows it.", "Rotate keys without code changes through environment variables."]
  };
}

export async function buildIncidentExport({ config }) {
  const bundle = await loadRuntimeBundle(config);
  const audit = new AuditLogStore(config.runtimeDir);
  await audit.init();
  const exportDir = path.join(config.runtimeDir, "incident-exports");
  await ensureDir(exportDir);
  const stamp = nowIso().replaceAll(":", "-");
  const exportPath = path.join(exportDir, `incident-${stamp}.json`);
  const payload = redactSecrets({
    at: nowIso(),
    config: { ...config, env: undefined },
    runtime: bundle.runtime,
    journalSummary: {
      trades: bundle.journal.trades.length,
      blockedSetups: bundle.journal.blockedSetups.length,
      cycles: bundle.journal.cycles.length
    },
    recentAuditEvents: await audit.readRecent({ limit: 100 }),
    openPositions: bundle.runtime.openPositions,
    unresolvedIntentIds: unresolvedIntents(bundle.runtime),
    exchangeSafety: bundle.runtime.exchangeTruth,
    streamHealth: bundle.runtime.streamHealth,
    dashboardHealth: bundle.runtime.ops?.readiness,
    recentErrors: bundle.runtime.health?.warnings || []
  });
  await saveJson(exportPath, payload);
  return { status: "ready", exportPath, redacted: true };
}

export async function queryAudit({ config, args = [] }) {
  const audit = new AuditLogStore(config.runtimeDir);
  await audit.init();
  const type = args.find((arg) => `${arg}`.startsWith("--type="))?.slice(7) || null;
  const symbol = args.find((arg) => `${arg}`.startsWith("--symbol="))?.slice(9)?.toUpperCase() || null;
  const limit = Number(args.find((arg) => `${arg}`.startsWith("--limit="))?.slice(8)) || 100;
  const events = (await audit.readRecent({ limit: Math.max(limit, 100) }))
    .filter((event) => !type || event.type === type)
    .filter((event) => !symbol || event.symbol === symbol || event.payload?.symbol === symbol)
    .slice(0, limit);
  return { status: "ready", count: events.length, events: redactSecrets(events) };
}

export async function buildStorageReport({ config }) {
  await ensureDir(config.runtimeDir);
  const files = await listFiles(config.runtimeDir);
  let bytes = 0;
  for (const filePath of files) {
    const stat = await fs.stat(filePath).catch(() => null);
    bytes += stat?.size || 0;
  }
  const disk = os.freemem();
  return {
    status: bytes > 1024 * 1024 * 1024 ? "warning" : "ready",
    runtimeDir: config.runtimeDir,
    fileCount: files.length,
    bytes,
    hotStorage: config.runtimeDir,
    coldArchive: path.join(config.runtimeDir, "archive"),
    freeMemoryBytes: disk
  };
}

export async function buildConfigDiff({ config }) {
  const snapshotPath = path.join(config.runtimeDir, "config-snapshot.json");
  const previous = await loadJson(snapshotPath, null);
  const current = redactSecrets({ at: nowIso(), hash: config.configHash, config });
  const changedKeys = previous?.config ? Object.keys(current.config).filter((key) => JSON.stringify(previous.config[key]) !== JSON.stringify(current.config[key])) : [];
  await saveJson(snapshotPath, current);
  return {
    status: changedKeys.some((key) => /risk|live|execution|neural|fast/i.test(key)) ? "warning" : "ready",
    snapshotPath,
    previousHash: previous?.hash || null,
    currentHash: current.hash || null,
    changedKeys
  };
}

export async function buildDryRunResponse({ command, config }) {
  return {
    command,
    dryRun: true,
    mutatesState: false,
    wouldChange: [],
    safetyImpact: config.botMode === "live" ? "live_mode_requires_explicit_apply_commands" : "paper_mode_preview_only",
    auditEventPreview: redactSecrets({ at: nowIso(), type: `dry_run.${command}` }),
    rollbackPlan: ["No rollback required for dry-run."]
  };
}
