import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  buildDashboardActionEnvelope,
  listDashboardActionContracts,
  resolveDashboardActionContract
} from "../src/dashboard/actionRouteContracts.js";

const root = process.cwd();
const failures = [];

const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const scripts = packageJson.scripts || {};

for (const scriptName of ["typecheck", "test:safe", "coverage:check", "qa:quick"]) {
  if (!scripts[scriptName]) {
    failures.push(`package.json missing ${scriptName} script`);
  }
}

const ActionContractSchema = z.object({
  id: z.string().min(1),
  method: z.literal("POST"),
  path: z.string().regex(/^\/api\//),
  liveSensitive: z.boolean(),
  allowedLifecycleStates: z.array(z.string().min(1)).min(1),
  auditCategory: z.string().min(1),
  requiresTrustedMutation: z.literal(true),
  responseShape: z.literal("dashboard_action_result"),
  errorShape: z.literal("dashboard_action_error"),
  eventTopic: z.string().min(1),
  bodyFields: z.array(z.string()).optional()
});

const DashboardActionEnvelopeSchema = z.object({
  action: z.object({
    id: z.string().min(1),
    path: z.string().nullable(),
    auditCategory: z.string().min(1),
    liveSensitive: z.boolean(),
    requestId: z.string().nullable(),
    lifecycleBefore: z.string().nullable(),
    lifecycleAfter: z.string().nullable(),
    status: z.enum(["completed", "pending"])
  })
}).passthrough();

const contracts = listDashboardActionContracts();
for (const contract of contracts) {
  const parsed = ActionContractSchema.safeParse(contract);
  if (!parsed.success) {
    failures.push(`invalid dashboard action contract ${contract?.id || contract?.path}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }
  if (resolveDashboardActionContract(contract.path)?.id !== contract.id) {
    failures.push(`dashboard action contract ${contract.id} cannot be resolved by path`);
  }
}

for (const routePath of ["/api/start", "/api/stop"]) {
  const contract = resolveDashboardActionContract(routePath);
  if (!contract) {
    failures.push(`missing dashboard action contract for ${routePath}`);
    continue;
  }
  const envelope = buildDashboardActionEnvelope(contract, { ok: true }, {
    requestId: "shape-contract",
    lifecycleBefore: "ready",
    lifecycleAfter: routePath === "/api/start" ? "running" : "stopped"
  });
  const parsed = DashboardActionEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    failures.push(`invalid dashboard action envelope for ${routePath}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }
}

const serverSource = await fs.readFile(path.join(root, "src", "dashboard", "server.js"), "utf8");
for (const routePath of ["/api/start", "/api/stop"]) {
  const routeIndex = serverSource.indexOf(`url.pathname === "${routePath}"`);
  const nextRouteIndex = serverSource.indexOf("if (url.pathname ===", routeIndex + 1);
  const routeBlock = serverSource.slice(routeIndex, nextRouteIndex > routeIndex ? nextRouteIndex : routeIndex + 500);
  if (routeIndex < 0 || !routeBlock.includes("sendResolvedActionResult(result)")) {
    failures.push(`${routePath} does not return a dashboard action envelope`);
  }
}

if (failures.length) {
  console.error(`Shape contract check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(`Shape contract check passed (${contracts.length} dashboard actions, ${Object.keys(scripts).length} package scripts).`);
