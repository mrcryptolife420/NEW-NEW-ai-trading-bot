import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, shell } from "electron";
import path from "node:path";

const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:3011";
const dashboardUrl = process.env.DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
const statusUrl = new URL("/api/gui/status", dashboardUrl).toString();

let mainWindow = null;
let tray = null;
let lastCriticalCount = 0;

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

  mainWindow.loadURL(dashboardUrl);
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

app.whenReady().then(() => {
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
