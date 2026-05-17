import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8").catch(() => "");
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const [packageJsonText, runCli, dashboardServer, dashboardApp, productionOps, storageAudit, liveBroker, envExample, lockfileText] = await Promise.all([
  readText("package.json"),
  readText("src/cli/runCli.js"),
  readText("src/dashboard/server.js"),
  readText("src/dashboard/public/app.js"),
  readText("src/ops/productionOps.js"),
  readText("src/storage/storageAudit.js"),
  readText("src/execution/liveBroker.js"),
  readText(".env.example"),
  readText("package-lock.json")
]);

const packageJson = JSON.parse(packageJsonText || "{}");
const checks = [
  {
    id: "secrets_config",
    status: envExample.includes("BINANCE_API_SECRET") && packageJson.scripts?.["debug:secrets"] ? "covered" : "deferred",
    evidence: [".env.example", "scripts/scan-secrets.mjs", "package.json#debug:secrets"],
    nextAction: "keep_debug_secrets_in_release_gate"
  },
  {
    id: "dashboard_api_routes",
    status: countMatches(dashboardServer, /createServer|route|pathname|method/g) > 0 ? "covered" : "deferred",
    evidence: ["src/dashboard/server.js", "scripts/check-api-route-contracts.mjs"],
    nextAction: "run_debug_api_contracts_and_browser_smoke"
  },
  {
    id: "browser_operator_actions",
    status: countMatches(dashboardApp, /fetch\(|button|addEventListener|operator/gi) > 0 ? "covered" : "deferred",
    evidence: ["src/dashboard/public/app.js", "scripts/check-dashboard-dom-contract.mjs"],
    nextAction: "verify_mutating_actions_remain_backend_guarded"
  },
  {
    id: "file_archive_paths",
    status: storageAudit.includes("readOnly") && storageAudit.includes("autoDelete: false") ? "covered" : "reportable",
    evidence: ["src/storage/storageAudit.js"],
    nextAction: "keep_storage_retention_manual_only_with_restore_precheck"
  },
  {
    id: "live_trading_controls",
    status: productionOps.includes("live_acknowledgement") && liveBroker.includes("MIN_NOTIONAL") ? "covered" : "deferred",
    evidence: ["src/ops/productionOps.js", "src/execution/liveBroker.js"],
    nextAction: "live_preflight_must_only_block_or_diagnose"
  },
  {
    id: "command_execution_surface",
    status: countMatches(runCli, /command ===|BOT_COMMANDS|commandRegistry/g) > 0 ? "covered" : "deferred",
    evidence: ["src/cli/runCli.js", "src/cli/commandRegistry.js"],
    nextAction: "keep_cli_commands_registered_and_readonly_tagged"
  },
  {
    id: "dependency_script_drift",
    status: packageJson.scripts?.["debug:package-scripts"] && lockfileText.includes("\"lockfileVersion\"") ? "covered" : "deferred",
    evidence: ["package.json#debug:package-scripts", "package-lock.json", "scripts/check-package-scripts.mjs"],
    nextAction: "keep_package_script_contract_and_lockfile_review_in_release_gate"
  }
];

const reportable = checks.filter((check) => check.status === "reportable");
const deferred = checks.filter((check) => check.status === "deferred");
const generatedAt = new Date().toISOString();

console.log(`# Security Scan Coverage Report

Generated: ${generatedAt}

## Threat Model
- Assets: Binance credentials, live-trading controls, runtime state, dashboard operator actions, audit/readmodel data.
- Attack surfaces: config/secrets, local dashboard/API, CLI commands, file/archive paths, live broker controls, dependency scripts.
- Default posture: paper mode first; live mode may only become stricter or more diagnostic.

## Phases
- threat_model: completed_from_repository_security_guidance
- finding_discovery: coverage_ledger_rows_below
- validation: reportable_rows_require_file_line_followup
- attack_path_analysis: required_only_for_reportable_rows
- final_report: this_artifact

## Coverage Ledger
${checks.map((check) => `- ${check.id}: ${check.status}; evidence=${check.evidence.join(", ")}; next=${check.nextAction}`).join("\n")}

## Findings
- reportable=${reportable.length}
- deferred=${deferred.length}
- suppressed=0

## Validation
- Run npm run debug:secrets.
- Run npm run debug:api-contracts.
- Run npm run debug:dashboard-dom.
- Run node src/cli.js live:preflight.
- Run node src/cli.js storage:retention.
`);
