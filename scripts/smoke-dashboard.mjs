import http from "node:http";
import { startDashboardServer } from "../src/dashboard/server.js";

const logger = { info() {}, warn() {}, error() {}, debug() {} };
let dashboard = null;
const snapshot = {
  manager: { runState: "stopped", lifecycle: { state: "ready" }, currentMode: "paper" },
  dashboard: {
    ops: {
      readiness: { ok: true, status: "ready", reasons: [], checkedAt: new Date().toISOString() },
      botLifecycle: { state: "ready" },
      mode: { botMode: "paper", paperExecutionVenue: "internal" },
      exchangeConnectivity: {},
      dataFreshness: {},
      riskLocks: {},
      topRejections: []
    }
  }
};
const manager = {
  config: { dashboardPort: 0, metricsEnabled: false, botMode: "paper", exchangeProvider: "binance" },
  projectRoot: process.cwd(),
  async init() { return { manager: { dashboardPort: 0 } }; },
  async stop() {},
  async getSnapshot() { return snapshot; },
  async getOperationalReadiness() { return { ok: true, status: "ready", reasons: [], checkedAt: new Date().toISOString() }; },
  async getLivePreflight() { return { contract: { kind: "live_preflight" }, preflight: { safeToStartLive: false, status: "blocked", blockingReasons: ["acknowledgement"] } }; },
  async getSafeEnvStatus() { return { status: "ok", duplicateKeys: [] }; },
  async getConfigProfiles() { return { current: { mode: "paper" }, profiles: [] }; },
  async getGuiDiagnostics() { return { status: "ok" }; },
  async getMissionControl() { return { status: "ok" }; },
  async getStatus() { return { status: { mode: "paper" } }; },
  async getDoctor() { return { doctor: { mode: "paper" } }; },
  async getReport() { return { report: {} }; },
  async getLearning() { return { learning: {} }; }
};

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 10000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve({ statusCode: response.statusCode, json: JSON.parse(body) });
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error(`Timeout for ${url}`)));
    request.on("error", reject);
  });
}

try {
  dashboard = await startDashboardServer({ projectRoot: process.cwd(), logger, port: 0, manager });
  const health = await getJson(`${dashboard.url}/api/health`);
  if (health.statusCode !== 200) throw new Error(`/api/health returned ${health.statusCode}`);
  if (!health.json || typeof health.json !== "object") throw new Error("/api/health did not return an object");
  const preflight = await getJson(`${dashboard.url}/api/live/preflight`);
  if (preflight.statusCode !== 200) throw new Error(`/api/live/preflight returned ${preflight.statusCode}`);
  if (preflight.json?.preflight?.safeToStartLive !== false) throw new Error("/api/live/preflight did not block fake live start");
  console.log(`Dashboard smoke passed (${dashboard.url}).`);
} finally {
  if (dashboard?.shutdown) await dashboard.shutdown();
}
