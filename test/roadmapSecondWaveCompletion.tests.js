import { listDashboardActionContracts, resolveDashboardActionContract, buildDashboardActionEnvelope } from "../src/dashboard/actionRouteContracts.js";
import { buildBlockerRootCauseSummary } from "../src/runtime/blockerRootCauseGraph.js";
import { validateReplayPackManifest } from "../src/runtime/replayScenarioCatalog.js";
import { buildConfigLineage, summarizeProfileExactness } from "../src/config/configLineage.js";
import { buildEnvMigrationPlan } from "../src/config/envMigrationPlan.js";
import { buildExecutionQualityRecord, summarizeExecutionQuality } from "../src/execution/executionQualityRecord.js";
import { buildScanPerformanceBudget, planUniverseScan } from "../src/runtime/scanPerformanceBudget.js";
import { buildProviderBudgetPlan } from "../src/runtime/providerBudgetOrchestrator.js";
import { validateWindowsEntrypointScript } from "../src/ops/windowsEntrypointContracts.js";
import { classifySensitiveField, sanitizeArtifact } from "../src/utils/sensitiveFields.js";
import { canRunManagerMutation, listManagerMutationContracts } from "../src/runtime/managerMutationContract.js";

export async function registerRoadmapSecondWaveCompletionTests({ runCheck, assert, fs, os, path, BotManager }) {
  await runCheck("roadmap 11 manager mutation contracts block unsafe start while stopping", () => {
    const contracts = listManagerMutationContracts();
    assert.ok(contracts.some((contract) => (
      contract.id === "apply_config_profile"
        && contract.waitsForStop === false
        && contract.reloadMayDeferWhileRunning === true
    )));
    const result = canRunManagerMutation("start", "stopping");
    assert.equal(result.allowed, false);
    assert.match(result.reason, /stopping/);
  });

  await runCheck("roadmap 11 running paper profile apply writes env without stopping bot", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-profile-running-apply-"));
    const envPath = path.join(projectRoot, ".env");
    await fs.writeFile(envPath, "BOT_MODE=paper\nCONFIG_PROFILE=paper-safe\nPAPER_MODE_PROFILE=sim\nPAPER_EXECUTION_VENUE=internal\n", "utf8");
    const manager = new BotManager({ projectRoot, logger: { warn() {}, error() {} } });
    manager.config = { envPath, botMode: "paper", profile: { id: "paper-safe" }, dashboardStopTimeoutMs: 1 };
    manager.lifecycle = { state: "running", activity: "cycle", history: [] };
    manager.runState = "running";
    manager.ensureBotReady = async () => {};
    manager.stopUnlocked = async () => {
      throw new Error("profile apply must not stop a running paper bot");
    };
    manager.reinitializeBot = async () => {
      throw new Error("running paper profile reload must be deferred");
    };
    manager.getSnapshot = async () => {
      throw new Error("profile apply must not build a heavy dashboard snapshot");
    };

    const result = await manager.applyConfigProfile("beginner-paper-learning");
    const written = await fs.readFile(envPath, "utf8");
    assert.equal(result.applied, true);
    assert.equal(result.writeVerified, true);
    assert.equal(result.reloadDeferred, true);
    assert.equal(result.restartRequired, true);
    assert.equal(result.reloadOk, false);
    assert.equal(result.snapshot, null);
    assert.match(result.warnings.join(" "), /Herstart/);
    assert.match(written, /CONFIG_PROFILE=paper-learning/);
    assert.equal(manager.pendingStop, null);
  });

  await runCheck("roadmap 12 dashboard action contracts cover live-sensitive profile routes", () => {
    const contracts = listDashboardActionContracts();
    const profile = resolveDashboardActionContract("/api/config/profile/apply");
    assert.equal(profile.liveSensitive, true);
    assert.ok(profile.bodyFields.includes("profileId"));
    assert.equal(contracts.some((contract) => contract.path === "/api/setup/complete"), true);
    const envelope = buildDashboardActionEnvelope(profile, { applied: true }, { requestId: "r1", lifecycleBefore: "ready", lifecycleAfter: "stopped" });
    assert.equal(envelope.applied, true);
    assert.equal(envelope.action.id, "config_profile_apply");
  });

  await runCheck("roadmap 13 blocker root cause explorer groups derived no-trade reasons", () => {
    const summary = buildBlockerRootCauseSummary([
      { id: "quality_quorum_degraded", count: 5 },
      { id: "model_confidence_too_low", count: 2 }
    ]);
    assert.equal(summary.primary, "data_quality");
    assert.equal(summary.status, "degraded");
    assert.match(summary.nextBestAction, /provider/i);
  });

  await runCheck("roadmap 14 deterministic replay catalog validates required assertions", () => {
    const valid = validateReplayPackManifest({
      scenarioId: "request_budget_cooldown_storm",
      seed: "seed-1",
      assertions: ["cooldown_deduped", "provider_impact_visible"]
    });
    assert.equal(valid.valid, true);
    const invalid = validateReplayPackManifest({ scenarioId: "request_budget_cooldown_storm", seed: "seed-1", assertions: [] });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.missingAssertions.includes("cooldown_deduped"));
  });

  await runCheck("roadmap 15 config lineage redacts secrets and reports profile drift", () => {
    const lineage = buildConfigLineage({
      defaults: { BOT_MODE: "paper" },
      env: { BINANCE_API_KEY: "secret", PAPER_MODE_PROFILE: "sim" },
      profile: { PAPER_MODE_PROFILE: "learn" }
    });
    assert.equal(lineage.find((item) => item.key === "BINANCE_API_KEY").valueRedacted, "[redacted]");
    const exactness = summarizeProfileExactness({ id: "paper-learning", env: { PAPER_MODE_PROFILE: "learn" } }, { PAPER_MODE_PROFILE: "sim" });
    assert.equal(exactness.status, "drift");
    const migration = buildEnvMigrationPlan({ BOT_MODE: "live", BINANCE_API_BASE_URL: "https://demo-api.binance.com" });
    assert.equal(migration.status, "blocked");
  });

  await runCheck("roadmap 16 execution quality records realized cost feedback", () => {
    const record = buildExecutionQualityRecord({
      symbol: "BTCUSDT",
      expected: { price: 100, fee: 0.1, side: "BUY" },
      actual: { price: 101, fee: 0.2, quantity: 1, makerTimeout: true }
    });
    assert.equal(record.realized.slippageBps, 100);
    const summary = summarizeExecutionQuality([record]);
    assert.equal(summary.status, "degraded");
  });

  await runCheck("roadmap 17 scan performance budget returns selected and skipped reasons", () => {
    const budget = buildScanPerformanceBudget({ maxSymbols: 1, requestPressure: 0.8 });
    const plan = planUniverseScan([{ symbol: "BTCUSDT", priority: 10 }, { symbol: "ETHUSDT", priority: 5 }], budget);
    assert.equal(plan.status, "degraded");
    assert.deepEqual(plan.selected.map((item) => item.symbol), ["BTCUSDT"]);
    assert.equal(plan.skipped[0].reason, "scan_symbol_budget_exceeded");
  });

  await runCheck("roadmap 18 provider budget SLO orchestrator protects core providers", () => {
    const plan = buildProviderBudgetPlan({
      budgetPressure: 0.9,
      health: { binance_rest: { cooldownUntil: "2026-05-18T10:00:00.000Z" } }
    });
    assert.equal(plan.status, "blocked");
    assert.equal(plan.providers.find((item) => item.id === "news_rss").deferred, true);
    assert.equal(plan.providers.find((item) => item.id === "binance_rest").tradingImpact, "blocks_entries");
  });

  await runCheck("roadmap 19 windows entrypoint contracts validate startup scripts", () => {
    const result = validateWindowsEntrypointScript("Start-Everything.cmd", "npm.cmd run dashboard\nStart-Process firefox.exe\n/api/status runState\n");
    assert.equal(result.valid, true);
    const bad = validateWindowsEntrypointScript("Start-Everything.cmd", "echo ok\nexit /b 0");
    assert.equal(bad.valid, false);
  });

  await runCheck("roadmap 20 sensitive field registry sanitizes artifacts", () => {
    assert.equal(classifySensitiveField("BINANCE_API_SECRET").sensitive, true);
    const sanitized = sanitizeArtifact({ apiKey: "secret", nested: { balance: 10, token: "secret2" } });
    assert.equal(sanitized.apiKey, "[redacted]");
    assert.equal(sanitized.nested.token, "[redacted]");
    assert.equal(sanitized.nested.balance, 10);
  });
}
