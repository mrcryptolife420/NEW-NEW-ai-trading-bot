import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:3011";
let dashboardUrl = process.env.DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
let statusUrl = new URL("/api/gui/status", dashboardUrl).toString();

let mainWindow = null;
let tray = null;
let lastCriticalCount = 0;
let embeddedDashboard = null;
let lastStartupError = null;
const logDir = path.join(app.getPath("appData"), "Codex AI Trading Bot", "logs");
const logPath = path.join(logDir, "desktop-main.log");
const userConfigDir = path.join(app.getPath("appData"), "Codex AI Trading Bot", "config");
const userEnvPath = path.join(userConfigDir, ".env");

function writeLog(message, details = {}) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${message} ${JSON.stringify(details)}\n`, "utf8");
}

function resolveBotRoot() {
  const packagedRoot = path.join(process.resourcesPath || "", "bot");
  if (app.isPackaged && fs.existsSync(path.join(packagedRoot, "src", "cli.js"))) {
    return packagedRoot;
  }
  return path.resolve(app.getAppPath(), "..");
}

function ensureUserEnvFile(botRoot = resolveBotRoot()) {
  fs.mkdirSync(userConfigDir, { recursive: true });
  if (!fs.existsSync(userEnvPath)) {
    const bundledEnvPath = path.join(botRoot, ".env");
    const exampleEnvPath = path.join(botRoot, ".env.example");
    const sourcePath = fs.existsSync(bundledEnvPath) ? bundledEnvPath : exampleEnvPath;
    fs.copyFileSync(sourcePath, userEnvPath);
    writeLog("desktop_user_env_created", { userEnvPath, sourcePath });
  }
  process.env.CODEX_BOT_ENV_PATH = userEnvPath;
  return userEnvPath;
}

function buildDesktopDiagnostics(botRoot = resolveBotRoot()) {
  const packageJsonPath = path.join(botRoot, "package.json");
  let botPackage = {};
  try {
    botPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch {}
  return {
    packaged: app.isPackaged,
    desktopVersion: app.getVersion(),
    buildCommit: process.env.BUILD_COMMIT || "local",
    botPackageVersion: botPackage.version || null,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    botRoot,
    dashboardUrl,
    serverPath: path.join(botRoot, "src", "dashboard", "server.js"),
    serverExists: fs.existsSync(path.join(botRoot, "src", "dashboard", "server.js")),
    publicIndexExists: fs.existsSync(path.join(botRoot, "src", "dashboard", "public", "index.html")),
    publicAppExists: fs.existsSync(path.join(botRoot, "src", "dashboard", "public", "app.js")),
    envPath: process.env.CODEX_BOT_ENV_PATH || path.join(botRoot, ".env"),
    bundledEnvPath: path.join(botRoot, ".env"),
    userConfigDir,
    logPath
  };
}

async function waitForDashboard(timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(new URL("/api/health", dashboardUrl));
      if (response.ok) return true;
      lastError = new Error(`health_${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError || new Error("dashboard_not_ready");
}

function loadErrorPage(error) {
  const diagnostics = buildDesktopDiagnostics();
  const escape = (value) => `${value ?? ""}`.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><body style="font-family:Segoe UI,sans-serif;background:#081019;color:#edf4ff;padding:24px"><h1>Dashboard kon niet starten</h1><p>${escape(error?.message || "unknown error")}</p><pre style="white-space:pre-wrap;background:#111b28;padding:12px">${escape(error?.stack || "")}</pre><pre style="white-space:pre-wrap;background:#111b28;padding:12px">${escape(JSON.stringify(diagnostics, null, 2))}</pre><button onclick="location.reload()">Retry</button></body></html>`)}`);
}

async function startEmbeddedDashboard() {
  if (process.env.DASHBOARD_URL) return null;
  const botRoot = resolveBotRoot();
  const envPath = app.isPackaged ? ensureUserEnvFile(botRoot) : path.join(botRoot, ".env");
  process.env.CODEX_BOT_ENV_PATH = envPath;
  writeLog("desktop_startup", buildDesktopDiagnostics(botRoot));
  const serverPath = path.join(botRoot, "src", "dashboard", "server.js");
  const { startDashboardServer } = await import(pathToFileURL(serverPath).href);
  const logger = {
    info: (...args) => console.log("[dashboard]", ...args),
    warn: (...args) => console.warn("[dashboard]", ...args),
    error: (...args) => console.error("[dashboard]", ...args)
  };
  const instance = await startDashboardServer({ projectRoot: botRoot, logger });
  dashboardUrl = instance.url || dashboardUrl;
  statusUrl = new URL("/api/gui/status", dashboardUrl).toString();
  return instance;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "Codex AI Trading Bot",
    webPreferences: {
      preload: path.join(app.getAppPath(), "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => writeLog("did_fail_load", { code, description, dashboardUrl }));
  mainWindow.webContents.on("console-message", (_event, level, message) => writeLog("renderer_console", { level, message }));
  mainWindow.webContents.on("render-process-gone", (_event, details) => writeLog("render_process_gone", details));
  if (lastStartupError) {
    loadErrorPage(lastStartupError);
  } else {
    mainWindow.loadURL(dashboardUrl);
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

async function postDashboardAction(pathname) {
  const response = await fetch(new URL(pathname, dashboardUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dashboard-request": "1"
    },
    body: "{}"
  });
  if (!response.ok) {
    throw new Error(`dashboard_action_failed:${pathname}:${response.status}`);
  }
  return response.json();
}

async function fetchGuiStatus() {
  try {
    const response = await fetch(statusUrl, { headers: { "x-dashboard-request": "1" } });
    if (!response.ok) throw new Error(`status_${response.status}`);
    return await response.json();
  } catch (error) {
    return {
      connected: false,
      trayStatus: "stopped",
      serviceStatus: "dashboard_unreachable",
      mode: "unknown",
      error: error.message
    };
  }
}

function updateTrayMenu(status = {}) {
  const label = status.connected === false
    ? "Dashboard disconnected"
    : `${status.trayStatus || "unknown"} | ${status.mode || "unknown"}`;
  tray.setToolTip(`Codex AI Trading Bot - ${label}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Status: ${label}`, enabled: false },
    { label: "Open dashboard", click: showWindow },
    { label: "Open dashboard in browser", click: () => shell.openExternal(dashboardUrl) },
    { label: "Open logs", click: () => shell.openPath(logPath) },
    { label: "Open active .env", click: () => shell.openPath(buildDesktopDiagnostics().envPath) },
    { label: "Open config folder", click: () => shell.openPath(userConfigDir) },
    { type: "separator" },
    { label: "Start bot safely", click: () => postDashboardAction("/api/start").catch(() => {}) },
    { label: "Stop bot safely", click: () => postDashboardAction("/api/stop").catch(() => {}) },
    { type: "separator" },
    { label: "Quit desktop app", click: () => app.quit() }
  ]));
}

async function pollStatus() {
  const status = await fetchGuiStatus();
  updateTrayMenu(status);
  const criticalCount = Number(status.alerts?.criticalCount || 0);
  if (criticalCount > lastCriticalCount && Notification.isSupported()) {
    new Notification({
      title: "Trading bot critical alert",
      body: `${criticalCount} critical/high alert(s) require review.`
    }).show();
  }
  lastCriticalCount = criticalCount;
}

app.whenReady().then(async () => {
  embeddedDashboard = await startEmbeddedDashboard().catch((error) => {
    lastStartupError = error;
    writeLog("embedded_dashboard_start_failed", { message: error.message, stack: error.stack, diagnostics: buildDesktopDiagnostics() });
    console.error("embedded_dashboard_start_failed", error);
    return null;
  });
  if (!lastStartupError) {
    await waitForDashboard().catch((error) => {
      lastStartupError = error;
      writeLog("dashboard_wait_failed", { message: error.message, stack: error.stack });
    });
  }
  tray = new Tray(nativeImage.createEmpty());
  updateTrayMenu({ connected: false, trayStatus: "stopped", mode: "unknown" });
  tray.on("click", showWindow);
  createWindow();
  pollStatus();
  setInterval(pollStatus, 5000).unref?.();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
  if (mainWindow) mainWindow.hide();
});

app.on("activate", showWindow);

app.on("before-quit", async () => {
  if (embeddedDashboard?.shutdown) {
    await embeddedDashboard.shutdown().catch(() => {});
  }
});
