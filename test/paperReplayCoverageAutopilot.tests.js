import { buildPaperReplayCoverageAutopilot } from "../src/runtime/paperReplayCoverageAutopilot.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerPaperReplayCoverageAutopilotTests({ runCheck, assert }) {
  await runCheck("paper replay coverage empty history produces blocked coverage", async () => {
    const summary = buildPaperReplayCoverageAutopilot({
      symbols: ["BTCUSDT"],
      timeframes: ["1m"],
      requiredCandles: 100,
      historyCoverage: {}
    });
    assert.equal(summary.status, "blocked");
    assert.equal(summary.symbols[0].missingCandles, 100);
    assert.ok(summary.warnings.includes("empty_history_detected"));
    assert.equal(summary.dryRunOnly, true);
  });

  await runCheck("paper replay coverage partial history produces targeted backfill plan", async () => {
    const summary = buildPaperReplayCoverageAutopilot({
      symbols: ["ETHUSDT"],
      timeframes: ["1m"],
      requiredCandles: 100,
      historyCoverage: { ETHUSDT: { "1m": { candleCount: 40 } } }
    });
    assert.equal(summary.status, "weak");
    assert.equal(summary.backfillPlan.length, 1);
    assert.equal(summary.backfillPlan[0].symbol, "ETHUSDT");
    assert.equal(summary.backfillPlan[0].missingCandles, 60);
  });

  await runCheck("paper replay coverage full history is usable", async () => {
    const summary = buildPaperReplayCoverageAutopilot({
      symbols: ["SOLUSDT"],
      timeframes: ["1m"],
      requiredCandles: 100,
      historyCoverage: { SOLUSDT: { "1m": { candleCount: 120 } } }
    });
    assert.equal(summary.status, "usable");
    assert.equal(summary.backfillPlan.length, 0);
    assert.equal(summary.symbols[0].coverageRatio, 1);
  });

  await runCheck("paper replay coverage request-budget cap prevents unsafe backfill plan", async () => {
    const summary = buildPaperReplayCoverageAutopilot({
      symbols: ["XRPUSDT", "ADAUSDT"],
      timeframes: ["1m"],
      requiredCandles: 5000,
      historyCoverage: {},
      config: { paperReplayMaxBackfillWeight: 5, paperReplayCandlesPerRequest: 1000, paperReplayWeightPerRequest: 2 }
    });
    assert.ok(summary.backfillPlan.length < 2);
    assert.ok(summary.warnings.includes("request_budget_cap_prevents_full_backfill_plan"));
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("paper replay coverage tags weak strategy without live behavior", async () => {
    const summary = buildPaperReplayCoverageAutopilot({
      botMode: "live",
      symbols: ["BNBUSDT"],
      timeframes: ["1m"],
      requiredCandles: 100,
      historyCoverage: { BNBUSDT: { "1m": { candleCount: 10 } } },
      strategies: [{ id: "breakout_retest", symbols: ["BNBUSDT"] }]
    });
    assert.equal(summary.strategyTags[0].tags[0], "replay_coverage_weak");
    assert.equal(summary.diagnosticsOnly, true);
    assert.equal(summary.paperOnly, false);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("paper replay coverage dashboard fallback is safe", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.paperReplayCoverageSummary.status, "empty");
    const summary = buildPaperReplayCoverageAutopilot({
      symbols: ["LTCUSDT"],
      requiredCandles: 10,
      historyCoverage: { LTCUSDT: { "1m": { candleCount: 10 } } }
    });
    const normalized = normalizeDashboardSnapshotPayload({ paperReplayCoverageSummary: summary });
    assert.equal(normalized.paperReplayCoverageSummary.status, "usable");
  });
}
