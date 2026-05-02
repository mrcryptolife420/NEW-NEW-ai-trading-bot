import path from "node:path";
import { DEFAULTS } from "../src/config/defaults/index.js";
import { buildConfigHash, buildConfigHashInput } from "../src/config/configHash.js";
import { buildConfigProfileAudit } from "../src/config/profileAudit.js";
import { resolvePaperModeProfile } from "../src/config/paperModeProfile.js";
import { normalizeDecisionForAudit } from "../src/runtime/decisionContract.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";
import { buildExecutionIntentRows, buildExecutionIntentSummary } from "../src/execution/executionIntentView.js";
import { beginExecutionIntent, resolveExecutionIntent } from "../src/execution/executionIntentLedger.js";
import { buildReconcileEvidenceSummary } from "../src/execution/reconcileEvidenceSummary.js";

async function withEnv(keys, fn) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    delete process.env[key];
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function writeConfigProject({ fs, os, envLines = [] }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "config-operator-"));
  await fs.writeFile(path.join(root, ".env.example"), [
    "BOT_MODE=paper",
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

export async function registerConfigOperatorMaintenanceTests({
  runCheck,
  assert,
  fs,
  os,
  loadConfig,
  runCli
}) {
  await runCheck("split config defaults preserve safety-critical values", async () => {
    assert.equal(DEFAULTS.botMode, "paper");
    assert.equal(DEFAULTS.enableExchangeProtection, true);
    assert.equal(DEFAULTS.paperExecutionVenue, "internal");
    assert.equal(DEFAULTS.liveTradingAcknowledged, "");
    assert.equal(DEFAULTS.maxTotalExposureFraction, 0.6);
    assert.equal(DEFAULTS.paperModeProfile, "learn");
  });

  await runCheck("loadConfig parses paper mode profile and emits stable non-secret config hash", async () => {
    await withEnv(["BOT_MODE", "PAPER_MODE_PROFILE", "BINANCE_API_KEY", "BINANCE_API_SECRET"], async () => {
      const root = await writeConfigProject({
        fs,
        os,
        envLines: [
          "BOT_MODE=paper",
          "PAPER_MODE_PROFILE=research",
          "BINANCE_API_KEY=secret-a",
          "BINANCE_API_SECRET=secret-b"
        ]
      });
      const config = await loadConfig(root);
      assert.equal(config.botMode, "paper");
      assert.equal(config.paperModeProfile, "research");
      assert.equal(config.paperModeProfileSummary.effective, "research");
      assert.match(config.configHash, /^[a-f0-9]{16}$/);
      assert.equal(config.validation.profileAudit.status, "ok");
    });
  });

  await runCheck("config profile audit flags dangerous live and demo paper combinations", async () => {
    const liveAudit = buildConfigProfileAudit({
      botMode: "live",
      enableExchangeProtection: false,
      adaptiveLearningLiveCoreUpdates: true,
      thresholdAutoApplyEnabled: true,
      thresholdProbationMinTrades: 0,
      thresholdProbationWindowDays: 0
    });
    assert.equal(liveAudit.status, "error");
    assert.ok(liveAudit.findings.some((item) => item.id === "live_without_exchange_protection" && item.error));
    assert.ok(liveAudit.findings.some((item) => item.id === "live_adaptive_core_updates_enabled" && item.error));

    const paperAudit = buildConfigProfileAudit({
      botMode: "paper",
      paperExecutionVenue: "binance_demo_spot",
      paperMinTradeUsdt: 5,
      minTradeUsdt: 25,
      allowSyntheticMinNotionalExit: false
    });
    assert.equal(paperAudit.status, "warning");
    assert.ok(paperAudit.findings.every((item) => !item.error));
  });

  await runCheck("paper mode profiles never relax hard safety reasons", async () => {
    for (const profileId of ["sim", "learn", "research", "demo_spot"]) {
      const profile = resolvePaperModeProfile({ botMode: "paper", paperModeProfile: profileId });
      assert.equal(profile.hardSafetyRelaxable, false);
      assert.equal(profile.canRelaxReason("exchange_safety_blocked"), false);
    }
    assert.equal(resolvePaperModeProfile({ botMode: "paper", paperModeProfile: "learn" }).canRelaxReason("model_confidence_too_low"), true);
    assert.equal(resolvePaperModeProfile({ botMode: "live", paperModeProfile: "learn" }).effective, "live");
    assert.equal(resolvePaperModeProfile({ botMode: "live", paperModeProfile: "learn" }).canRelaxReason("model_confidence_too_low"), false);
  });

  await runCheck("config hash excludes secrets but changes on risk settings", async () => {
    const base = {
      botMode: "paper",
      riskPerTrade: 0.01,
      maxTotalExposureFraction: 0.6,
      binanceApiKey: "secret-one",
      binanceApiSecret: "secret-two",
      operatorAlertWebhookUrls: ["https://example.test/secret"]
    };
    const sameWithDifferentSecrets = {
      ...base,
      binanceApiKey: "changed",
      binanceApiSecret: "changed"
    };
    assert.equal(buildConfigHash(base).hash, buildConfigHash(sameWithDifferentSecrets).hash);
    assert.notEqual(buildConfigHash(base).hash, buildConfigHash({ ...base, riskPerTrade: 0.02 }).hash);
    const input = buildConfigHashInput(base);
    assert.equal(Object.prototype.hasOwnProperty.call(input, "binanceApiKey"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(input, "binanceApiSecret"), false);
  });

  await runCheck("decision contract normalizes incomplete input, unknown reasons and NaN values", async () => {
    const decision = normalizeDecisionForAudit({
      symbol: "ethusdt",
      probability: Number.NaN,
      threshold: 0.52,
      reasons: ["unknown_reason", "exchange_safety_blocked"],
      sizing: { quoteAmount: Number.NaN, cappedQuoteAmount: 25 },
      allow: false,
      configHash: "abc123"
    });
    assert.equal(decision.symbol, "ETHUSDT");
    assert.equal(decision.probability, null);
    assert.equal(decision.threshold, 0.52);
    assert.equal(decision.rootBlocker, "exchange_safety_blocked");
    assert.equal(decision.reasonCategories.unknown_reason, "other");
    assert.equal(decision.sizing.cappedQuoteAmount, 25);
    assert.equal(Object.prototype.hasOwnProperty.call(decision.sizing, "quoteAmount"), false);
    assert.equal(decision.configHash, "abc123");
  });

  await runCheck("execution intent view summarizes unresolved intents without mutation", async () => {
    const runtime = { orderLifecycle: {} };
    const first = beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "ETHUSDT",
      idempotencyKey: "open",
      detail: "entry submitted"
    });
    const completed = beginExecutionIntent(runtime, {
      kind: "protection",
      symbol: "ETHUSDT",
      idempotencyKey: "oco"
    });
    resolveExecutionIntent(runtime, completed.intent.id);
    const rows = buildExecutionIntentRows(runtime, { unresolvedOnly: true, now: new Date(first.intent.createdAt).getTime() + 1000 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].symbol, "ETHUSDT");
    assert.equal(rows[0].kind, "entry");
    assert.equal(rows[0].lastStep, "intent_opened");
    assert.equal(rows[0].ageMs, 1000);
    const summary = buildExecutionIntentSummary(runtime);
    assert.equal(summary.total, 2);
    assert.equal(summary.unresolved, 1);
    assert.equal(summary.byKind.entry, 1);
    assert.equal(summary.byKind.protection, 1);
  });

  await runCheck("intent CLI commands read runtime ledger only", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "intent-cli-"));
    const runtimeDir = path.join(root, "runtime");
    const { StateStore } = await import("../src/storage/stateStore.js");
    const store = new StateStore(runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    beginExecutionIntent(runtime, { kind: "entry", symbol: "BTCUSDT", idempotencyKey: "open" });
    await store.saveRuntime(runtime);
    const lines = [];
    const previousLog = console.log;
    console.log = (line) => lines.push(line);
    try {
      const processState = { exitCode: undefined };
      await runCli({
        command: "intents:summary",
        args: [],
        config: { runtimeDir, projectRoot: root },
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        processState
      });
      assert.equal(processState.exitCode, 0);
    } finally {
      console.log = previousLog;
    }
    const output = JSON.parse(lines[0]);
    assert.equal(output.status, "ok");
    assert.equal(output.unresolved, 1);
  });

  await runCheck("reconcile evidence summary preserves manual-review evidence", async () => {
    const flat = buildReconcileEvidenceSummary({
      decision: "FLAT_CONFIRMED",
      confidence: 0.98,
      evidence: { runtimeQuantity: 0, exchangeQuantity: 0, qtyWithinTolerance: true, openOrderCount: 0 }
    });
    assert.equal(flat.manualReviewRequired, false);
    assert.equal(flat.recommendedAction, "no_operator_action_required");

    const conflict = buildReconcileEvidenceSummary({
      decision: "NEEDS_MANUAL_REVIEW",
      confidence: 0.7,
      evidence: {
        runtimeQuantity: 1,
        exchangeQuantity: 1.2,
        quantityDiff: 0.2,
        quantityTolerance: 0.001,
        qtyWithinTolerance: false,
        userStreamStale: true,
        missingRestData: true
      }
    });
    assert.equal(conflict.manualReviewRequired, true);
    assert.ok(conflict.conflicts.includes("quantity_mismatch"));
    assert.ok(conflict.conflicts.includes("stale_user_stream"));
    assert.ok(conflict.conflicts.includes("missing_rest_data"));
  });

  await runCheck("dashboard payload normalizer survives minimal and partial corrupt snapshots", async () => {
    const snapshot = normalizeDashboardSnapshotPayload({
      readiness: { status: "weird", reasons: null },
      topDecisions: null,
      positions: "bad",
      risk: null,
      capital: undefined
    });
    assert.equal(snapshot.mode, "paper");
    assert.equal(snapshot.readiness.status, "unknown");
    assert.deepEqual(snapshot.topDecisions, []);
    assert.deepEqual(snapshot.positions, []);
    assert.equal(snapshot.risk.status, "unknown");
    assert.equal(snapshot.capital.status, "unknown");
    assert.equal(snapshot.paperLearning.status, "unavailable");
    assert.equal(snapshot.recorder.status, "unavailable");
  });
}
