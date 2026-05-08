import fs from "node:fs/promises";
import path from "node:path";

const LIVE_ACK = "I_UNDERSTAND_LIVE_TRADING_RISK";

function redact(value = "") {
  return value ? "[REDACTED]" : "";
}

export function buildSetupWizardPlan({ answers = {}, existingEnv = "", projectRoot = process.cwd() } = {}) {
  const mode = ["paper", "demo", "live-observe", "live"].includes(answers.mode) ? answers.mode : "paper";
  const botMode = mode === "live" ? "live" : "paper";
  const needsKey = ["demo", "live-observe", "live"].includes(mode);
  const liveConfirmed = mode !== "live" || answers.liveAcknowledgement === LIVE_ACK;
  const env = {
    BOT_MODE: botMode,
    OPERATOR_MODE: mode === "live-observe" ? "observe_only" : "active",
    PAPER_EXECUTION_VENUE: mode === "demo" ? "binance_demo_spot" : "internal",
    ENABLE_EXCHANGE_PROTECTION: "true",
    NEURAL_LIVE_AUTONOMY_ENABLED: "false",
    LIVE_FAST_OBSERVE_ONLY: "true",
    DASHBOARD_PORT: String(Number(answers.dashboardPort) || 3011),
    RUNTIME_DIR: answers.runtimeDir || "./data/runtime"
  };
  if (needsKey) {
    env.BINANCE_API_KEY = answers.binanceApiKey || "";
    env.BINANCE_API_SECRET = answers.binanceApiSecret || "";
  }
  if (mode === "live") {
    env.LIVE_TRADING_ACKNOWLEDGED = liveConfirmed ? LIVE_ACK : "";
  }
  return {
    mode,
    safeToWrite: mode !== "live" || liveConfirmed,
    backupRequired: Boolean(existingEnv),
    env,
    preview: Object.fromEntries(Object.entries(env).map(([key, value]) => [key, /SECRET|KEY|TOKEN/i.test(key) ? redact(value) : value])),
    safetyImpact: {
      liveModeDefaultOff: mode !== "live",
      exchangeProtectionOn: true,
      neuralLiveAutonomyOff: true,
      fastLiveExecutionOff: true,
      secretsRedacted: true
    },
    projectRoot
  };
}

export async function writeSetupWizardEnv({ plan, projectRoot = process.cwd() } = {}) {
  if (!plan?.safeToWrite) {
    return { status: "blocked", reason: "live_requires_explicit_ack" };
  }
  const envPath = path.join(projectRoot, ".env");
  let backupPath = null;
  try {
    const existing = await fs.readFile(envPath, "utf8");
    if (existing) {
      backupPath = `${envPath}.bak.${Date.now()}`;
      await fs.writeFile(backupPath, existing, "utf8");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const body = Object.entries(plan.env).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, body, "utf8");
  return { status: "written", envPath, backupPath };
}

export function buildSetupWizardCliSummary(plan = {}) {
  return {
    status: plan.safeToWrite ? "ready" : "blocked",
    preview: plan.preview || {},
    safetyImpact: plan.safetyImpact || {},
    nextCommands: ["npm run once", "npm run dashboard"]
  };
}
