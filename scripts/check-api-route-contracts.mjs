import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const serverPath = path.join(root, "src", "dashboard", "server.js");
const source = await fs.readFile(serverPath, "utf8");
const routes = [];

for (const match of source.matchAll(/request\.method\s*={2,3}\s*"([A-Z]+)"\s*&&\s*url\.pathname\s*={2,3}\s*"([^"]+)"/g)) {
  routes.push({ method: match[1], path: match[2] });
}
for (const match of source.matchAll(/if\s*\(url\.pathname\s*={2,3}\s*"([^"]+)"\)/g)) {
  const before = source.slice(Math.max(0, match.index - 160), match.index);
  const method = /request\.method !== "POST"/.test(before) ? "POST" : "ANY";
  routes.push({ method, path: match[1] });
}

const requiredGet = [
  "/api/snapshot", "/api/health", "/api/gui/status", "/api/gui/fast-execution",
  "/api/gui/diagnostics", "/api/config/env", "/api/config/profiles", "/api/readiness",
  "/api/mission-control", "/api/status", "/api/doctor", "/api/report", "/api/learning",
  "/api/live/preflight", "/metrics"
];
const requiredPost = [
  "/api/start", "/api/stop", "/api/refresh", "/api/cycle", "/api/research", "/api/mode",
  "/api/config/profile/preview", "/api/config/profile/apply", "/api/setup/run-checks",
  "/api/setup/complete", "/api/setup/reset", "/api/alerts/ack", "/api/alerts/silence",
  "/api/alerts/resolve", "/api/ops/force-reconcile", "/api/positions/review",
  "/api/ops/probe-only", "/api/diagnostics/action", "/api/policies/approve",
  "/api/policies/reject", "/api/policies/revert", "/api/promotion/approve",
  "/api/promotion/rollback", "/api/promotion/scope/approve",
  "/api/promotion/scope/rollback", "/api/promotion/probation/decide"
];
const hasRoute = (method, routePath) => routes.some((route) => route.path === routePath && (route.method === method || route.method === "ANY"));
const failures = [];

for (const routePath of requiredGet) {
  if (!hasRoute("GET", routePath)) failures.push(`missing GET ${routePath}`);
}
for (const routePath of requiredPost) {
  if (!hasRoute("POST", routePath)) failures.push(`missing POST ${routePath}`);
}
if (!/isTrustedMutationRequest\(request\)/.test(source)) failures.push("POST mutation trust gate is not called");
if (!/sendJson\(response,\s*403/.test(source)) failures.push("POST mutation 403 response is missing");
if (!/statusCode\s*=\s*413/.test(source) || !/sendJson\(response,\s*error\.statusCode\s*\|\|\s*500/.test(source)) {
  failures.push("oversized request 413 response is missing");
}
if (!/sendJson\(response,\s*404,\s*\{\s*error:\s*"Unknown API route"/.test(source)) failures.push("unknown API 404 response is missing");
if (!/server\.listen\(listenPort,\s*"127\.0\.0\.1"/.test(source)) failures.push("dashboard is not explicitly bound to 127.0.0.1");
if (!/getLivePreflight\(\)/.test(source)) failures.push("live preflight API route is not wired to manager.getLivePreflight()");

if (failures.length) {
  console.error(`API route contract failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

const outDir = path.join(root, "docs", "debug", "inventory");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "api-routes.json"), `${JSON.stringify({ routes }, null, 2)}\n`);
console.log(`API route contract passed (${routes.length} routes).`);
