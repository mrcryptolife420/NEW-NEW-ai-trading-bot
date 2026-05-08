import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(import.meta.dirname, "..");
const botRoot = path.resolve(desktopRoot, "..");
const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const activeEnvPath = process.env.BOT_ENV_PATH || path.join(botRoot, ".env");

const checks = [];

function addCheck(name, ok, details = {}) {
  checks.push({ name, ok: Boolean(ok), ...details });
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function resolvePackageVersion(packageName) {
  try {
    const pkgPath = require.resolve(`${packageName}/package.json`, { paths: [desktopRoot] });
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "unknown";
  } catch {
    return null;
  }
}

const electronVersion = resolvePackageVersion("electron");
addCheck("electron install", Boolean(electronVersion), { version: electronVersion });
addCheck("desktop main.js", exists(path.join(desktopRoot, "main.js")), { path: path.join(desktopRoot, "main.js") });
addCheck("desktop preload.js", exists(path.join(desktopRoot, "preload.js")), { path: path.join(desktopRoot, "preload.js") });
addCheck("bot package.json", exists(path.join(botRoot, "package.json")), { path: path.join(botRoot, "package.json") });
addCheck("bot cli", exists(path.join(botRoot, "src", "cli.js")), { path: path.join(botRoot, "src", "cli.js") });
addCheck("dashboard server", exists(path.join(botRoot, "src", "dashboard", "server.js")), { path: path.join(botRoot, "src", "dashboard", "server.js") });
addCheck("dashboard public app", exists(path.join(botRoot, "src", "dashboard", "public", "app.js")), { path: path.join(botRoot, "src", "dashboard", "public", "app.js") });
addCheck("dashboard public html", exists(path.join(botRoot, "src", "dashboard", "public", "index.html")), { path: path.join(botRoot, "src", "dashboard", "public", "index.html") });
addCheck("active env path resolved", true, { path: activeEnvPath, exists: exists(activeEnvPath) });
addCheck("logs directory resolved", true, { path: path.join(appData, "Codex AI Trading Bot", "logs"), parentExists: exists(appData) });

const failed = checks.filter((check) => !check.ok);
const result = {
  ok: failed.length === 0,
  desktopRoot,
  botRoot,
  activeEnvPath,
  expectedLogDir: path.join(appData, "Codex AI Trading Bot", "logs"),
  checks
};

console.log(JSON.stringify(result, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
