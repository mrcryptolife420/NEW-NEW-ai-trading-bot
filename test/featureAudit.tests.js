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
  });
}
