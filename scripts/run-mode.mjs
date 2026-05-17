import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const MODE_ENV = {
  paper: {
    BOT_MODE: "paper",
    TRADE_PROFILE_ID: "beginner-paper-learning",
    CONFIG_PROFILE: "paper-learning",
    CONFIG_CAPABILITY_BUNDLES: "paper,dashboard,research",
    ACCOUNT_PROFILE: "paper",
    PAPER_EXECUTION_VENUE: "internal",
    PAPER_MODE_PROFILE: "learn"
  },
  demo: {
    BOT_MODE: "paper",
    TRADE_PROFILE_ID: "paper-demo-spot",
    CONFIG_PROFILE: "paper-learning",
    CONFIG_CAPABILITY_BUNDLES: "paper,dashboard,research",
    ACCOUNT_PROFILE: "paper",
    PAPER_EXECUTION_VENUE: "binance_demo_spot",
    PAPER_MODE_PROFILE: "demo_spot",
    BINANCE_API_BASE_URL: "https://demo-api.binance.com",
    BINANCE_FUTURES_API_BASE_URL: "https://demo-fapi.binance.com"
  }
};

export function buildModeEnv(mode, baseEnv = process.env) {
  if (!MODE_ENV[mode]) {
    throw new Error(`Unknown run mode: ${mode}`);
  }
  return {
    ...baseEnv,
    ...MODE_ENV[mode]
  };
}

export function buildModeCommand(argv = []) {
  const [mode, command = "run", ...args] = argv;
  if (!MODE_ENV[mode]) {
    throw new Error("Usage: node scripts/run-mode.mjs <paper|demo> [cli-command] [...args]");
  }
  return { mode, command, args };
}

export function runMode(argv = process.argv.slice(2), options = {}) {
  const { mode, command, args } = buildModeCommand(argv);
  return spawnSync(process.execPath, ["src/cli.js", command, ...args], {
    cwd: options.cwd || process.cwd(),
    env: buildModeEnv(mode, options.env || process.env),
    stdio: options.stdio || "inherit",
    encoding: options.encoding || "utf8"
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const result = runMode();
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
