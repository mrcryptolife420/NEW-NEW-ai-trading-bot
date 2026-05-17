import fs from "node:fs/promises";
import path from "node:path";
import { getTradeProfile } from "../config/tradeProfiles.js";
import { updateEnvFile } from "../config/envFile.js";

const LIVE_ACK = "I_UNDERSTAND_LIVE_TRADING_RISK";
const MODE_PROFILE = {
  paper: "beginner-paper-learning",
  demo: "paper-demo-spot",
  "live-observe": "paper-safe-simulation",
  live: "guarded-live-template"
};

function redact(value = "") {
  return value ? "[REDACTED]" : "";
}

export function buildSetupWizardPlan({ answers = {}, existingEnv = "", projectRoot = process.cwd() } = {}) {
  const mode = ["paper", "demo", "live-observe", "live"].includes(answers.mode) ? answers.mode : "paper";
  const liveConfirmed = mode !== "live" || answers.liveAcknowledgement === LIVE_ACK;
  const profileId = answers.profileId || MODE_PROFILE[mode] || MODE_PROFILE.paper;
  const profile = getTradeProfile(profileId) || getTradeProfile(MODE_PROFILE.paper);
  const env = {
    ...(profile?.env || {}),
    OPERATOR_MODE: mode === "live-observe" ? "observe_only" : "active",
    ENABLE_EXCHANGE_PROTECTION: "true",
    NEURAL_LIVE_AUTONOMY_ENABLED: "false",
    LIVE_FAST_OBSERVE_ONLY: "true",
    DASHBOARD_PORT: String(Number(answers.dashboardPort) || 3011),
    RUNTIME_DIR: answers.runtimeDir || "./data/runtime"
  };
  if (answers.binanceApiKey || answers.binanceApiSecret || mode === "live") {
    env.BINANCE_API_KEY = answers.binanceApiKey || "";
    env.BINANCE_API_SECRET = answers.binanceApiSecret || "";
  }
  if (mode === "live") {
    env.LIVE_TRADING_ACKNOWLEDGED = liveConfirmed ? LIVE_ACK : "";
  } else {
    env.LIVE_TRADING_ACKNOWLEDGED = "";
  }
  return {
    mode,
    profile: {
      id: profile?.id || profileId,
      label: profile?.label || profileId,
      mode: profile?.mode || env.BOT_MODE || "paper"
    },
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
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  const writeResult = await updateEnvFile(envPath, plan.env || {});
  return { status: "written", ...writeResult };
}

export function buildSetupWizardCliSummary(plan = {}) {
  return {
    status: plan.safeToWrite ? "ready" : "blocked",
    preview: plan.preview || {},
    safetyImpact: plan.safetyImpact || {},
    nextCommands: ["npm run once", "npm run dashboard"]
  };
}
