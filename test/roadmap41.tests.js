import path from "node:path";
import { buildTradingBotSliceMap } from "../src/runtime/tradingBotSliceMap.js";
import { safeNumber, finiteOrNull, clampNumber, average } from "../src/utils/numberSafety.js";
import { listManualReviewReasons, resolveManualReviewReason, decorateManualReviewReason } from "../src/execution/manualReviewReasonRegistry.js";
import { buildMultiTimeframeConfluence, attachMultiTimeframeConfluence } from "../src/strategy/multiTimeframeConfluence.js";
import { buildRestBudgetSnapshot, refreshDashboardPrerequisites } from "../src/runtime/dashboardSnapshotBuilder.js";
import { buildRestBudgetView, renderRestBudgetPanel } from "../src/dashboard/public/renderRestBudgetPanel.js";
import { renderSafetyPanel } from "../src/dashboard/public/renderSafetyPanel.js";
import { renderTradingQualityPanel } from "../src/dashboard/public/renderTradingQualityPanel.js";
import { buildFeatureAudit, buildFeatureAuditMarkdown } from "../src/runtime/featureAudit.js";
import { buildRoadmapTraceabilityFromFiles } from "../src/docs/runtimeArchitectureMap.js";
import { findCommandMetadata, listInternalOnlyCommands } from "../src/cli/commandRegistry.js";

async function writeFile(fs, filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export async function registerRoadmap41Tests({ runCheck, assert, fs, os }) {
  await runCheck("trading bot slice map documents every runtime slice", async () => {
    const map = buildTradingBotSliceMap();
    assert.equal(map.source, "src/runtime/tradingBot.js");
    assert.deepEqual(map.slices.map((slice) => slice.id), [
      "prerequisites",
      "market_data",
      "candidate_building",
      "risk_decision",
      "execution",
      "post_cycle_persistence",
      "dashboard_projection"
    ]);
    for (const slice of map.slices) {
      assert.ok(slice.owner, `${slice.id} owner`);
      assert.ok(slice.liveRisk, `${slice.id} liveRisk`);
      assert.ok(Array.isArray(slice.tests) && slice.tests.length >= 1, `${slice.id} tests`);
    }
  });

  await runCheck("number safety utilities normalize unsafe numeric values", async () => {
    assert.equal(safeNumber("12.5", 0), 12.5);
    assert.equal(safeNumber(Number.NaN, 7), 7);
    assert.equal(safeNumber(Infinity, 7), 7);
    assert.equal(finiteOrNull(null), 0);
    assert.equal(finiteOrNull(undefined), null);
    assert.equal(clampNumber("9", 0, 5), 5);
    assert.equal(average([1, "2", Number.NaN, Infinity, 3]), 2);
    assert.equal(average([], 4), 4);
  });

  await runCheck("manual-review reason registry exposes operator labels", async () => {
    const reasons = listManualReviewReasons();
    assert.ok(reasons.length >= 5);
    const mismatch = resolveManualReviewReason("exchange_truth_mismatch");
    assert.equal(mismatch.severity, "critical");
    assert.ok(mismatch.operatorAction);
    assert.ok(mismatch.dashboardLabel);
    assert.equal(resolveManualReviewReason("not_registered").id, "unknown");
    const decorated = decorateManualReviewReason({ reason: "protective_order_uncertain" });
    assert.equal(decorated.manualReview.reason.id, "protective_order_uncertain");
  });

  await runCheck("multi-timeframe confluence stays paper-only and diagnostic", async () => {
    const confluence = buildMultiTimeframeConfluence({
      frames: {
        "5m": { trendScore: 0.7, momentumScore: 0.65, orderflowScore: 0.62, volatilityRisk: 0.15 },
        "15m": { trendScore: 0.72, momentumScore: 0.7, orderflowScore: 0.61, volatilityRisk: 0.12 },
        "1h": { trendScore: 0.35, momentumScore: 0.4, orderflowScore: 0.45, volatilityRisk: 0.25 }
      }
    });
    assert.equal(confluence.paperOnly, true);
    assert.equal(confluence.livePolicy, "diagnostics_or_additional_blocker_only");
    assert.ok(confluence.confluenceScore > 0 && confluence.confluenceScore <= 1);
    assert.ok(confluence.timeframeDisagreements.includes("1h"));
    const candidate = attachMultiTimeframeConfluence({ symbol: "BTCUSDT" }, { timeframes: { "15m": { trendScore: 0.8 } } });
    assert.equal(candidate.multiTimeframeConfluence.paperOnly, true);
    assert.equal(typeof candidate.confluenceScore, "number");
  });

  await runCheck("REST budget snapshot explains paused and delayed states", async () => {
    const paused = buildRestBudgetSnapshot({
      referenceNow: "2026-05-21T00:00:00.000Z",
      requestWeight: {
        banActive: true,
        bannedUntil: "2026-05-21T00:30:00.000Z",
        schedulerAction: "paused_by_ban",
        topRestCallers: { exchangeInfo: { weight: 10, count: 1 } },
        updatedAt: "2026-05-21T00:00:00.000Z"
      }
    });
    assert.equal(paused.banActive, true);
    assert.equal(paused.schedulerAction, "paused_by_ban");
    assert.equal(paused.topRestCallers[0].caller, "exchangeInfo");
    const delayed = buildRestBudgetSnapshot({ requestWeight: { nextAllowedAt: "soon" } });
    assert.equal(delayed.backoffActive, true);
    assert.equal(delayed.schedulerAction, "delayed");
  });

  await runCheck("dashboard refresh prerequisites skip REST-heavy refresh while stopped or banned", async () => {
    const calls = [];
    const bot = {
      manager: { runState: "stopped" },
      client: { getRateLimitState: () => ({ banActive: false }) },
      maybeRunExchangeTruthLoop: async () => calls.push("truth"),
      safeRefreshMarketHistorySnapshot: async () => calls.push("history"),
      safeRefreshScannerSnapshot: async () => calls.push("scanner"),
      shouldRefreshPortfolioSnapshot: () => true,
      updatePortfolioSnapshot: async () => calls.push("portfolio")
    };
    await refreshDashboardPrerequisites(bot, { referenceNow: new Date().toISOString() });
    assert.deepEqual(calls, []);
    bot.manager.runState = "running";
    bot.client.getRateLimitState = () => ({ banActive: true });
    await refreshDashboardPrerequisites(bot, { referenceNow: new Date().toISOString() });
    assert.deepEqual(calls, []);
  });

  await runCheck("dashboard panel helpers render roadmap 41 operator surfaces", async () => {
    const rest = buildRestBudgetView({ schedulerAction: "paused_by_ban", banActive: true, topRestCallers: [{ caller: "ticker", weight: 3 }] });
    assert.equal(rest.badge, "paused-by-ban");
    assert.match(renderRestBudgetPanel({ schedulerAction: "delayed", topRestCallers: [] }), /REST budget/);
    assert.match(renderSafetyPanel({ status: "manual_review_required", blockers: ["exchange_truth_mismatch"] }), /exchange_truth_mismatch/);
    assert.match(renderTradingQualityPanel({
      netEdgeGate: { status: "blocked" },
      exitIntelligence: { recommendation: "hold", confidence: 0.7 },
      paperCohorts: [{ setup: "pullback", nextPaperAction: "observe" }],
      confluence: { confluenceScore: 0.64 }
    }), /pullback/);
  });

  await runCheck("feature audit markdown is deterministic and operator-readable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap41-feature-audit-"));
    await writeFile(fs, path.join(root, ".env.example"), "ENABLE_NET_EDGE_GATE=false\nENABLE_DYNAMIC_EXIT_LEVELS=false\n");
    await writeFile(fs, path.join(root, "src/runtime/netEdgeGate.js"), "export function buildNetEdgeGate() {}\n");
    await writeFile(fs, path.join(root, "src/risk/dynamicExitLevels.js"), "export function buildDynamicExitLevels() {}\n");
    await writeFile(fs, path.join(root, "src/cli/runCli.js"), "buildNetEdgeGate(); buildDynamicExitLevels();\n");
    await writeFile(fs, path.join(root, "test/dynamicExitLevels.tests.js"), "buildDynamicExitLevels();\n");
    const audit = await buildFeatureAudit({ root, projectRoot: root, config: { enableNetEdgeGate: false, enableDynamicExitLevels: false, enableCvdConfirmation: true } });
    assert.equal(audit.schemaVersion, 2);
    const ids = audit.features.map((feature) => feature.id);
    assert.deepEqual(ids, ids.slice().sort((left, right) => {
      const rank = { P0: 0, P1: 1, P2: 2, P3: 3, complete: 9 };
      const leftRank = rank[audit.features.find((feature) => feature.id === left).priority] ?? 8;
      const rightRank = rank[audit.features.find((feature) => feature.id === right).priority] ?? 8;
      return leftRank - rightRank || left.localeCompare(right);
    }));
    const markdown = buildFeatureAuditMarkdown(audit);
    assert.match(markdown, /schemaVersion: 2/);
    assert.match(markdown, /net_edge_gate/);
    assert.match(markdown, /dynamic_exit_levels/);
    assert.match(markdown, /liveBehaviorPolicy/);
  });

  await runCheck("roadmap traceability scans open and completed roadmap files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap41-trace-"));
    await writeFile(fs, path.join(root, "docs/roadmap-41-test.md"), "# Roadmap\n- File: `src/runtime/tradingBot.js`\n- Test: `test/missing.tests.js`\n");
    await writeFile(fs, path.join(root, "docs/voltooid/roadmap-40-done.md"), "# Done\n- File: `src/cli/runCli.js`\n- Test: `test/run.js`\n");
    await writeFile(fs, path.join(root, "src/runtime/tradingBot.js"), "export {};\n");
    await writeFile(fs, path.join(root, "test/run.js"), "export {};\n");
    const trace = await buildRoadmapTraceabilityFromFiles({ projectRoot: root });
    assert.equal(trace.roadmaps.length, 2);
    const open = trace.roadmaps.find((item) => item.status === "open");
    const completed = trace.roadmaps.find((item) => item.status === "completed");
    assert.ok(open.missingTests.includes("test/missing.tests.js"));
    assert.equal(completed.missingTests.length, 0);
  });

  await runCheck("command registry marks roadmap trace read-only and internal-only commands explicit", async () => {
    const roadmap = findCommandMetadata("roadmap:trace");
    assert.equal(roadmap.readOnly, true);
    assert.equal(roadmap.requiresRuntime, false);
    assert.equal(roadmap.requiresNetwork, false);
    const internal = listInternalOnlyCommands().map((item) => item.command);
    assert.ok(internal.includes("symbol:block"));
    assert.ok(internal.includes("neural:approve-experiment"));
  });
}
