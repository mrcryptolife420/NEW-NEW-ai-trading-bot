import path from "node:path";
import {
  beginExecutionIntent,
  failExecutionIntent,
  resolveExecutionIntent
} from "../src/execution/executionIntentLedger.js";
import { validateProtectiveSellOcoGeometry } from "../src/execution/liveBroker.js";
import {
  canPaperRelaxReason,
  getOperatorMessage,
  getReasonDefinition,
  getReasonSeverityLevel,
  isHardSafetyReason,
  reasonBlocksLive,
  sortReasonsByRootPriority
} from "../src/risk/reasonRegistry.js";
import { createLogger } from "../src/utils/logger.js";
import { redactSecrets } from "../src/utils/redactSecrets.js";

const REQUIRED_ENV_EXAMPLE_KEYS = [
  "BOT_MODE",
  "BINANCE_API_KEY",
  "BINANCE_API_SECRET",
  "LIVE_TRADING_ACKNOWLEDGED",
  "ENABLE_EXCHANGE_PROTECTION",
  "PAPER_EXECUTION_VENUE"
];

const CONFIG_ENV_KEYS = [
  "BOT_MODE",
  "BINANCE_API_KEY",
  "BINANCE_API_SECRET",
  "LIVE_TRADING_ACKNOWLEDGED",
  "ENABLE_EXCHANGE_PROTECTION",
  "PAPER_EXECUTION_VENUE",
  "BINANCE_API_BASE_URL"
];

async function withCleanConfigEnv(fn) {
  const previous = Object.fromEntries(CONFIG_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of CONFIG_ENV_KEYS) {
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "safety-config-"));
  await fs.writeFile(path.join(root, ".env.example"), [
    "BOT_MODE=paper",
    "RUNTIME_DIR=./runtime",
    "HISTORY_DIR=./history",
    "BINANCE_API_KEY=",
    "BINANCE_API_SECRET=",
    "LIVE_TRADING_ACKNOWLEDGED=",
    "ENABLE_EXCHANGE_PROTECTION=true",
    "PAPER_EXECUTION_VENUE=internal",
    "BINANCE_API_BASE_URL="
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(root, ".env"), envLines.join("\n"), "utf8");
  return root;
}

export async function registerSafetyMaintenanceTests({
  runCheck,
  assert,
  fs,
  os,
  loadConfig,
  ConfigValidationError,
  TradingBot,
  makeConfig
}) {
  await runCheck("reason registry exposes safety metadata and unknown fallback", async () => {
    const safety = getReasonDefinition("exchange_safety_blocked");
    assert.equal(safety.category, "safety");
    assert.equal(safety.hardSafety, true);
    assert.equal(isHardSafetyReason("exchange_safety_blocked"), true);
    assert.equal(reasonBlocksLive("exchange_safety_blocked"), true);
    assert.equal(getReasonSeverityLevel("exchange_safety_blocked"), 0);
    assert.ok(getOperatorMessage("exchange_safety_blocked"));

    const soft = getReasonDefinition("model_confidence_too_low");
    assert.equal(soft.category, "quality");
    assert.equal(canPaperRelaxReason("model_confidence_too_low"), true);
    assert.equal(soft.paperCanRelax, true);
    assert.equal(reasonBlocksLive("model_confidence_too_low"), false);

    const unknown = getReasonDefinition("totally_unknown_future_reason");
    assert.equal(unknown.category, "other");
    assert.equal(unknown.severityLevel, 3);
    assert.equal(unknown.hardSafety, false);
    assert.equal(unknown.paperCanRelax, false);
    assert.equal(unknown.liveBlocks, false);

    const sorted = sortReasonsByRootPriority(["model_confidence_too_low", "exchange_safety_blocked"]);
    assert.equal(sorted[0], "exchange_safety_blocked");
  });

  await runCheck("protective SELL OCO geometry covers invalid market and price relationships", async () => {
    assert.equal(validateProtectiveSellOcoGeometry({
      takeProfitPrice: 110,
      currentMid: 100,
      stopTriggerPrice: 95,
      stopLimitPrice: 94
    }).valid, true);

    const cases = [
      [{ takeProfitPrice: 110, currentMid: 0, stopTriggerPrice: 95, stopLimitPrice: 94 }, "currentMid_invalid"],
      [{ takeProfitPrice: 99, currentMid: 100, stopTriggerPrice: 95, stopLimitPrice: 94 }, "takeProfitPrice_not_above_market"],
      [{ takeProfitPrice: 110, currentMid: 100, stopTriggerPrice: 100, stopLimitPrice: 99 }, "stopTriggerPrice_not_below_market"],
      [{ takeProfitPrice: 110, currentMid: 100, stopTriggerPrice: 95, stopLimitPrice: 96 }, "stopLimitPrice_above_stopTriggerPrice"],
      [{ takeProfitPrice: Number.NaN, currentMid: 100, stopTriggerPrice: 95, stopLimitPrice: 94 }, "takeProfitPrice_invalid"],
      [{ takeProfitPrice: 110, currentMid: 100, stopTriggerPrice: null, stopLimitPrice: 94 }, "stopTriggerPrice_invalid"],
      [{ takeProfitPrice: 110, currentMid: 100, stopTriggerPrice: 95, stopLimitPrice: 0 }, "stopLimitPrice_invalid"]
    ];
    for (const [input, expectedIssue] of cases) {
      const result = validateProtectiveSellOcoGeometry(input);
      assert.equal(result.valid, false);
      assert.ok(result.issues.includes(expectedIssue), `${expectedIssue} missing from ${result.issues.join(",")}`);
    }
  });

  await runCheck("execution intent ledger resolves failed entries and keeps protection intents separate", async () => {
    const runtime = { orderLifecycle: {} };
    const first = beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "ETHUSDT",
      idempotencyKey: "open"
    });
    assert.equal(first.duplicateUnresolved, false);
    assert.equal(beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "ETHUSDT",
      idempotencyKey: "open"
    }).duplicateUnresolved, true);

    resolveExecutionIntent(runtime, first.intent.id);
    assert.equal(beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "ETHUSDT",
      idempotencyKey: "open"
    }).duplicateUnresolved, false);

    const failed = beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "SOLUSDT",
      idempotencyKey: "open"
    });
    failExecutionIntent(runtime, failed.intent.id);
    assert.equal(beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "SOLUSDT",
      idempotencyKey: "open"
    }).duplicateUnresolved, false);

    const entry = beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "BNBUSDT",
      idempotencyKey: "shared"
    });
    const protection = beginExecutionIntent(runtime, {
      kind: "protection",
      symbol: "BNBUSDT",
      idempotencyKey: "shared"
    });
    assert.equal(entry.duplicateUnresolved, false);
    assert.equal(protection.duplicateUnresolved, false);
    assert.notEqual(entry.intent.dedupeKey, protection.intent.dedupeKey);
  });

  await runCheck("env example exposes required safety keys", async () => {
    const content = await fs.readFile(path.resolve(".env.example"), "utf8");
    for (const key of REQUIRED_ENV_EXAMPLE_KEYS) {
      assert.match(content, new RegExp(`^${key}=`, "m"), `${key} missing from .env.example`);
    }
  });

  await runCheck("config live safety failures are independently enforced while paper allows missing credentials", async () => {
    await withCleanConfigEnv(async () => {
      const missingAckRoot = await writeConfigProject({
        fs,
        os,
        envLines: [
          "BOT_MODE=live",
          "BINANCE_API_KEY=test-key",
          "BINANCE_API_SECRET=test-secret",
          "ENABLE_EXCHANGE_PROTECTION=true",
          "LIVE_TRADING_ACKNOWLEDGED="
        ]
      });
      await assert.rejects(
        () => loadConfig(missingAckRoot),
        (error) => error instanceof ConfigValidationError && error.errors.some((item) => item.includes("LIVE_TRADING_ACKNOWLEDGED"))
      );

      const missingCredentialsRoot = await writeConfigProject({
        fs,
        os,
        envLines: [
          "BOT_MODE=live",
          "BINANCE_API_KEY=",
          "BINANCE_API_SECRET=",
          "ENABLE_EXCHANGE_PROTECTION=true",
          "LIVE_TRADING_ACKNOWLEDGED=I_UNDERSTAND_LIVE_TRADING_RISK"
        ]
      });
      await assert.rejects(
        () => loadConfig(missingCredentialsRoot),
        (error) => error instanceof ConfigValidationError && error.errors.some((item) => item.includes("BINANCE_API_KEY and BINANCE_API_SECRET"))
      );

      const missingProtectionRoot = await writeConfigProject({
        fs,
        os,
        envLines: [
          "BOT_MODE=live",
          "BINANCE_API_KEY=test-key",
          "BINANCE_API_SECRET=test-secret",
          "ENABLE_EXCHANGE_PROTECTION=false",
          "LIVE_TRADING_ACKNOWLEDGED=I_UNDERSTAND_LIVE_TRADING_RISK"
        ]
      });
      await assert.rejects(
        () => loadConfig(missingProtectionRoot),
        (error) => error instanceof ConfigValidationError && error.errors.some((item) => item.includes("ENABLE_EXCHANGE_PROTECTION=true"))
      );

      const paperRoot = await writeConfigProject({
        fs,
        os,
        envLines: [
          "BOT_MODE=paper",
          "BINANCE_API_KEY=",
          "BINANCE_API_SECRET=",
          "ENABLE_EXCHANGE_PROTECTION=true"
        ]
      });
      const config = await loadConfig(paperRoot);
      assert.equal(config.botMode, "paper");
      assert.equal(config.validation.valid, true);
    });
  });

  await runCheck("dashboard snapshot contract keeps required top-level fields and optional fallbacks", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard-contract-"));
    const bot = new TradingBot({
      config: makeConfig({ runtimeDir }),
      logger: { info() {}, warn() {}, error() {}, debug() {} }
    });
    bot.model = {
      getState() { return {}; },
      getCalibrationSummary() { return {}; },
      getDeploymentSummary() { return {}; },
      getTransformerSummary() { return {}; },
      getStrategyAllocationSummary() { return {}; },
      getWeightView() { return []; }
    };
    bot.journal = { trades: [], events: [], cycles: [] };
    bot.runtime = {
      lastCycleAt: "2026-05-01T00:00:00.000Z",
      lastAnalysisAt: "2026-05-01T00:00:00.000Z",
      lastPortfolioUpdateAt: "2026-05-01T00:00:00.000Z",
      latestDecisions: [],
      latestSignals: [],
      openPositions: [],
      exchangeSafety: {},
      capitalGovernor: {},
      capitalPolicy: {},
      orderLifecycle: {},
      alerts: [],
      paperLearning: {}
    };
    bot.stream = { getStatus() { return {}; } };
    bot.health = { getStatus() { return {}; } };
    bot.dataRecorder = { getSummary() { return {}; } };
    bot.backupManager = { getSummary() { return {}; } };
    bot.maybeRunExchangeTruthLoop = async () => {};
    bot.safeRefreshMarketHistorySnapshot = async () => ({});
    bot.safeRefreshScannerSnapshot = async () => ({});
    bot.shouldRefreshPortfolioSnapshot = () => false;
    bot.refreshOperationalViews = () => {};
    bot.syncOrderLifecycleState = () => bot.runtime.orderLifecycle;
    bot.buildSourceReliabilitySnapshot = () => ({});
    bot.buildSafetyPreview = () => ({ selfHealState: {}, driftSummary: {} });
    bot.buildOperationalReadiness = () => ({ status: "ready", reasons: [] });
    bot.buildPerformanceChangeView = () => ({});
    bot.buildOperatorRunbooks = () => [];
    bot.buildOperatorDiagnosticsSnapshot = () => ({ actionItems: [] });
    bot.buildContextHealthSummary = () => ({});
    bot.buildPromotionPipelineSnapshot = () => ({ rolloutCandidates: [] });
    bot.buildModelWeightsView = () => [];
    bot.buildPortfolioView = () => ({});
    bot.buildScannerView = () => ({});
    bot.buildResearchView = () => ({});
    bot.getPerformanceReport = () => ({ recentTrades: [], executionSummary: {}, executionCostSummary: {} });
    bot.rlPolicy = { getSummary() { return {}; }, getWeightView() { return []; } };
    bot.strategyOptimizer = { buildSnapshot() { return {}; } };

    const snapshot = await bot.getDashboardSnapshot();
    for (const key of ["mode", "running", "status", "readiness", "topDecisions", "positions", "risk", "capital", "lifecycle", "alerts"]) {
      assert.ok(Object.prototype.hasOwnProperty.call(snapshot, key), `${key} missing`);
    }
    assert.ok(Array.isArray(snapshot.topDecisions));
    assert.ok(Array.isArray(snapshot.positions));
    assert.ok(snapshot.paperLearning || snapshot.ops?.paperLearning || snapshot.report?.paperLearningSummary || {});
  });

  await runCheck("redact secrets removes sensitive fields from log context", async () => {
    const safe = redactSecrets({
      apiKey: "plain-key",
      nested: {
        apiSecret: "plain-secret",
        authorization: "Bearer token",
        webhookUrl: "https://hooks.slack.com/services/T000/B000/SECRET"
      },
      signature: "abc123",
      harmless: "visible"
    });
    assert.equal(safe.apiKey, "[REDACTED]");
    assert.equal(safe.nested.apiSecret, "[REDACTED]");
    assert.equal(safe.nested.authorization, "[REDACTED]");
    assert.equal(safe.nested.webhookUrl, "[REDACTED]");
    assert.equal(safe.signature, "[REDACTED]");
    assert.equal(safe.harmless, "visible");

    const lines = [];
    const logger = createLogger("debug", { writer: (line) => lines.push(line) });
    logger.info("secret smoke", {
      apiKey: "plain-key",
      nested: { apiSecret: "plain-secret" },
      harmless: "visible"
    });
    assert.equal(lines.length, 1);
    assert.ok(!lines[0].includes("plain-key"));
    assert.ok(!lines[0].includes("plain-secret"));
    assert.ok(lines[0].includes("[REDACTED]"));
    assert.ok(lines[0].includes("visible"));
  });
}
