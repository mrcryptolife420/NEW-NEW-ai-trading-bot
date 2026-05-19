import { buildRoadmapModuleSystemSnapshot, listRoadmapModuleDefinitions } from "../src/runtime/roadmapModuleIntegration.js";

export async function registerSystemModuleIntegrationTests({ runCheck, assert, __dashboardSmokeRender }) {
  await runCheck("system module integration exposes all roadmap modules with dashboard explanations", async () => {
    const definitions = listRoadmapModuleDefinitions();
    const systemModules = await buildRoadmapModuleSystemSnapshot({
      dashboard: {
        overview: { mode: "paper" },
        openPositions: [{ symbol: "BTCUSDT", quantity: 0.1, entryPrice: 100, stopPrice: 95, takeProfitPrice: 110 }],
        topDecisions: [{ symbol: "BTCUSDT" }],
        ops: {
          dataFreshness: { stale: false },
          health: { tradeEntryBlockingReasons: ["model_confidence_too_low"] },
          riskLocks: { manualReviewPending: false }
        },
        recentTrades: [{ pnl: 1 }]
      },
      config: { botMode: "paper" },
      now: "2026-05-20T10:00:00.000Z"
    });
    assert.equal(definitions.length, 20);
    assert.equal(systemModules.modules.length, 20);
    assert.equal(systemModules.summary.total, 20);
    assert.ok(systemModules.modules.every((item) => item.explanation && item.systemHook && item.dashboardHook));
    assert.ok(systemModules.modules.some((item) => item.id === "config_policy_compiler"));
    assert.ok(systemModules.modules.some((item) => item.status === "guarded"));
  });

  await runCheck("dashboard renders roadmap module integration panel", async () => {
    const systemModules = await buildRoadmapModuleSystemSnapshot({
      dashboard: { overview: { mode: "paper" }, ops: { dataFreshness: { stale: false } } },
      config: { botMode: "paper" },
      now: "2026-05-20T10:00:00.000Z"
    });
    const render = __dashboardSmokeRender({
      dashboard: {
        overview: { mode: "paper" },
        ops: { systemModules },
        systemModules
      }
    });
    assert.equal(render.renderIssueCount, 0);
    assert.ok(render.systemModuleText.includes("Module integratie"));
    assert.ok(render.systemModuleText.includes("Model benchmark harness"));
    assert.ok(render.systemModuleText.includes("Config policy compiler env journal"));
    assert.ok(render.systemModuleText.includes("Dashboard:"));
  });
}
