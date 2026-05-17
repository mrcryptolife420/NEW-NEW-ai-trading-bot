import path from "node:path";
import { buildFeatureAudit } from "../src/runtime/featureAudit.js";

async function writeFile(fs, filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export async function registerFeatureAuditTests({ runCheck, assert, fs, os }) {
  await runCheck("feature audit lists feature flags and env coverage", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-audit-flags-"));
    await writeFile(fs, path.join(root, ".env.example"), "ENABLE_NET_EDGE_GATE=false\n");
    await writeFile(fs, path.join(root, "src/runtime/netEdgeGate.js"), "export function buildNetEdgeGate() {}\n");
    await writeFile(fs, path.join(root, "test/decisionSupportFoundation.tests.js"), "buildNetEdgeGate();\n");
    const audit = await buildFeatureAudit({
      projectRoot: root,
      config: {
        enableNetEdgeGate: false,
        netEdgeGateLiveBlockOnly: true,
        enableUnwiredExperimentalThing: true
      }
    });
    const netEdgeFlag = audit.flags.find((flag) => flag.key === "enableNetEdgeGate");
    const unwiredFlag = audit.flags.find((flag) => flag.key === "enableUnwiredExperimentalThing");
    assert.equal(netEdgeFlag.envPresent, true);
    assert.equal(unwiredFlag.envPresent, false);
    assert.ok(unwiredFlag.classifications.includes("config_only"));
  });

  await runCheck("feature audit marks module without runtime callsite as unused", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-audit-unused-"));
    await writeFile(fs, path.join(root, ".env.example"), "ENABLE_FAILED_BREAKOUT_DETECTOR=false\n");
    await writeFile(fs, path.join(root, "src/strategy/failedBreakoutDetector.js"), "export function detectFailedBreakout() {}\n");
    await writeFile(fs, path.join(root, "test/decisionSupportFoundation.tests.js"), "detectFailedBreakout();\n");
    const audit = await buildFeatureAudit({
      projectRoot: root,
      config: { enableFailedBreakoutDetector: false }
    });
    const feature = audit.features.find((item) => item.id === "failed_breakout_detector");
    assert.ok(feature.classifications.includes("module_exists_but_unused"));
    assert.ok(feature.classifications.includes("missing_dashboard"));
    assert.equal(feature.priority, "P1");
    assert.ok(feature.priorityReasons.includes("module_exists_but_runtime_callsite_is_missing"));
    assert.ok(feature.missingDashboardFields.includes("candidate.failedBreakoutDetector"));
    assert.equal(feature.configStatus.status, "complete");
    assert.match(feature.liveBehaviorPolicy, /No positive live relief|caution\/blocking/);
  });

  await runCheck("feature audit detects walk-forward CLI as complete", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-audit-walkforward-"));
    await writeFile(fs, path.join(root, "src/runtime/walkForwardBacktest.js"), "export function runBacktestWalkForward() {}\n");
    await writeFile(fs, path.join(root, "src/cli/runCli.js"), "runBacktestWalkForward(); const command = 'backtest:walkforward';\n");
    await writeFile(fs, path.join(root, "test/walkForwardBacktest.tests.js"), "runBacktestWalkForward();\n");
    await writeFile(fs, path.join(root, "docs/BACKTESTING.md"), "backtest:walkforward\n");
    const audit = await buildFeatureAudit({ projectRoot: root, config: {} });
    const feature = audit.features.find((item) => item.id === "walk_forward_backtest");
    assert.deepEqual(feature.classifications, ["complete"]);
    assert.equal(feature.priority, "complete");
    assert.equal(feature.configStatus.status, "complete");
    assert.deepEqual(feature.filesToChange, []);
  });

  await runCheck("feature audit adds completion metadata for targeted features", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-audit-metadata-"));
    await writeFile(fs, path.join(root, ".env.example"), [
      "ENABLE_NET_EDGE_GATE=false",
      "NET_EDGE_GATE_LIVE_BLOCK_ONLY=true",
      "ENABLE_DYNAMIC_EXIT_LEVELS=false",
      "DYNAMIC_EXIT_PAPER_ONLY=true",
      "ENABLE_INDICATOR_FEATURE_REGISTRY=false",
      "ENABLE_INDICATOR_REGISTRY_PAPER_SCORING=false"
    ].join("\n"));
    await writeFile(fs, path.join(root, "src/runtime/netEdgeGate.js"), "export function buildNetEdgeGate() {}\n");
    await writeFile(fs, path.join(root, "src/risk/dynamicExitLevels.js"), "export function buildDynamicExitLevels() {}\n");
    await writeFile(fs, path.join(root, "src/strategy/indicatorFeatureRegistry.js"), "export function buildIndicatorFeaturePack() {}\n");
    await writeFile(fs, path.join(root, "src/strategy/strategyRouter.js"), "buildIndicatorFeaturePack(); applyIndicatorRegistryPaperScoring();\n");
    await writeFile(fs, path.join(root, "test/decisionSupportFoundation.tests.js"), "buildNetEdgeGate();\n");
    await writeFile(fs, path.join(root, "test/dynamicExitLevels.tests.js"), "buildDynamicExitLevels();\n");
    await writeFile(fs, path.join(root, "test/indicatorFeatureRegistry.tests.js"), "buildIndicatorFeaturePack();\n");
    await writeFile(fs, path.join(root, "docs/INDICATOR_REGISTRY.md"), "indicator registry\n");
    const audit = await buildFeatureAudit({
      projectRoot: root,
      config: {
        enableNetEdgeGate: false,
        netEdgeGateLiveBlockOnly: true,
        enableDynamicExitLevels: false,
        dynamicExitPaperOnly: true,
        enableIndicatorFeatureRegistry: false,
        enableIndicatorRegistryPaperScoring: false
      }
    });
    for (const id of ["net_edge_gate", "dynamic_exit_levels", "indicator_feature_registry"]) {
      const feature = audit.features.find((item) => item.id === id);
      assert.ok(feature.priority);
      assert.ok(Array.isArray(feature.filesToChange));
      assert.ok(Array.isArray(feature.testsToAdd));
      assert.ok(Array.isArray(feature.missingDashboardFields));
      assert.ok(feature.completionPlan.length > 20);
      assert.equal(feature.configStatus.status, "complete");
      assert.ok(feature.activationStage);
      assert.ok(feature.paperModeIntegration);
    }
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").activationStage, "diagnostics_only");
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").paperModeIntegration, "not_required");
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").reviewDossier.liveDefault, "blocked_until_explicit_review");
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").reviewDossier.liveBlockDefault, true);
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").reviewDossier.paperEvidence.source, "paperEvidenceSpine");
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").reviewDossier.replayCoverage.source, "replay_traces");
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").reviewDossier.dashboardVisibility.required, true);
    assert.ok(audit.findings.find((item) => item.id === "net_edge_gate").reviewDossier.evidenceRequired.includes("replay_trace_coverage_ready"));
    for (const id of ["dynamic_exit_levels", "exit_intelligence_v2", "breakout_retest", "net_edge_gate"]) {
      const feature = audit.features.find((item) => item.id === id);
      assert.equal(feature.reviewDossier.liveBlockDefault, true);
      assert.equal(feature.reviewDossier.paperEvidence.required, true);
      assert.equal(feature.reviewDossier.replayCoverage.required, true);
      assert.ok(feature.reviewDossier.rollbackCondition.includes(id));
    }
    assert.equal(audit.features.find((item) => item.id === "dynamic_exit_levels").activationStage, "paper_only");
    assert.equal(audit.features.find((item) => item.id === "dynamic_exit_levels").paperModeIntegration, "paper_only");
    assert.equal(audit.features.find((item) => item.id === "dynamic_exit_levels").reviewDossier.paperOnlyDefault, true);
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").priority, "P1");
    assert.equal(audit.features.find((item) => item.id === "dynamic_exit_levels").priority, "P3");
    assert.equal(audit.features.find((item) => item.id === "indicator_feature_registry").priority, "P3");
  });

  await runCheck("feature audit classifies known legacy umbrella flags as documented config-only", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-audit-config-only-"));
    await writeFile(fs, path.join(root, ".env.example"), [
      "ENABLE_CVD_CONFIRMATION=true",
      "ENABLE_LIQUIDATION_MAGNET_CONTEXT=true",
      "ENABLE_PRICE_ACTION_STRUCTURE=true",
      "ENABLE_STRATEGY_ROUTER=true",
      "ENABLE_TRAILING_PROTECTION=true",
      "CANARY_TRADING_ENABLED=false"
    ].join("\n"));
    await writeFile(fs, path.join(root, "test/featureFlagHygiene.tests.js"), [
      "enableCvdConfirmation",
      "enableLiquidationMagnetContext",
      "enablePriceActionStructure",
      "enableStrategyRouter",
      "enableTrailingProtection",
      "canaryTradingEnabled"
    ].join("\n"));
    const audit = await buildFeatureAudit({
      projectRoot: root,
      config: {
        enableCvdConfirmation: true,
        enableLiquidationMagnetContext: true,
        enablePriceActionStructure: true,
        enableStrategyRouter: true,
        enableTrailingProtection: true,
        canaryTradingEnabled: false
      }
    });
    for (const key of [
      "enableCvdConfirmation",
      "enableLiquidationMagnetContext",
      "enablePriceActionStructure",
      "enableStrategyRouter",
      "enableTrailingProtection",
      "canaryTradingEnabled"
    ]) {
      const flag = audit.flags.find((item) => item.key === key);
      assert.ok(flag.classifications.includes("documented_config_only"));
      assert.equal(flag.classifications.includes("config_only"), false);
      assert.ok(["documented_config_placeholder", "documented_canary_orchestration_flag"].includes(flag.auditStatus));
      assert.ok(flag.note.length > 20);
      assert.ok(flag.nextSafeAction.length > 10);
    }
  });

  await runCheck("feature audit ignores generated desktop build directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-audit-generated-"));
    await writeFile(fs, path.join(root, ".env.example"), "ENABLE_NET_EDGE_GATE=false\n");
    await writeFile(fs, path.join(root, "src/runtime/netEdgeGate.js"), "export function buildNetEdgeGate() {}\n");
    await writeFile(fs, path.join(root, "src/runtime/decisionSupportDiagnostics.js"), "buildNetEdgeGate();\n");
    await writeFile(fs, path.join(root, "test/decisionSupportFoundation.tests.js"), "buildNetEdgeGate();\n");
    await writeFile(
      fs,
      path.join(root, "desktop/dist-new-20260508-214435/win-unpacked/resources/bot/src/runtime/netEdgeGate.js"),
      "enableNetEdgeGate; buildNetEdgeGate();\n"
    );
    const audit = await buildFeatureAudit({
      projectRoot: root,
      config: { enableNetEdgeGate: false }
    });
    const flag = audit.flags.find((item) => item.key === "enableNetEdgeGate");
    assert.equal(flag.referencedIn.some((item) => item.includes("desktop/dist-new")), false);
  });
}
