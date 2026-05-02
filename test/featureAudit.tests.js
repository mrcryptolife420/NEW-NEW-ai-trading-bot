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
    }
    assert.equal(audit.features.find((item) => item.id === "net_edge_gate").priority, "P1");
    assert.equal(audit.features.find((item) => item.id === "dynamic_exit_levels").priority, "P3");
    assert.equal(audit.features.find((item) => item.id === "indicator_feature_registry").priority, "P3");
  });
}
