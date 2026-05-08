import assert from "node:assert/strict";
import { PaperExchangeAdapter } from "../src/exchange/adapters/paper/PaperExchangeAdapter.js";
import { SyntheticExchangeAdapter } from "../src/exchange/adapters/synthetic/SyntheticExchangeAdapter.js";
import { normalizeOrderBook, normalizeOrderResponse } from "../src/exchange/adapters/ExchangeAdapter.js";
import { resolveAccountProfile } from "../src/accounts/accountProfileRegistry.js";
import { evaluatePolicy } from "../src/policy/policyEngine.js";
import { routeBroker } from "../src/execution/brokerRouter.js";
import { checkReliabilityTargets } from "../src/ops/reliabilityTargets.js";
import { buildPrometheusMetrics } from "../src/ops/metricsExporter.js";
import { runScenarioOffline, compareScenarios } from "../src/research/scenarioLab.js";
import { calculateLiquidityScore } from "../src/market/liquidityScore.js";
import { buildSafeDegradationStatus } from "../src/ops/safeDegradation.js";
import { summarizePerformanceBudget } from "../src/ops/performanceBudget.js";
import { buildModelCard, canPromoteModel } from "../src/models/modelCard.js";
import { buildReplayTimeline } from "../src/runtime/tradeReplayTimeline.js";
import { buildAutoDocs } from "../src/docs/autoDocsGenerator.js";
import { buildDatasetManifest } from "../src/storage/dataLake.js";
import { buildBotCoachSummary } from "../src/ops/botCoach.js";

export async function registerScalabilityMultiExchangePolicyObservabilityTests({ runCheck }) {
  await runCheck("multi-exchange adapters normalize paper synthetic and exchange payloads", async () => {
    const paper = new PaperExchangeAdapter({ tickers: { BTCUSDT: { price: 50000 } } });
    assert.equal((await paper.getTicker("BTCUSDT")).price, 50000);
    assert.equal((await paper.placeOrder({ symbol: "BTCUSDT", side: "BUY", type: "MARKET", quantity: 0.01 })).status, "filled");
    assert.equal(new SyntheticExchangeAdapter().getHealth().status, "ok");
    assert.equal(normalizeOrderResponse({ orderId: 1, symbol: "btcusdt", executedQty: "2" }).symbol, "BTCUSDT");
    assert.equal(normalizeOrderBook("BTCUSDT", { bids: [["1", "2"]], asks: [] }).bids[0].quantity, 2);
  });

  runCheck("policy engine and broker router block unsafe live-main paths", () => {
    assert.equal(resolveAccountProfile("live_main", { apiSecret: "secret" }).apiSecret, "[REDACTED]");
    assert.equal(evaluatePolicy({ accountProfile: "live_main" }).decision, "block");
    assert.equal(routeBroker({ confidence: 0.2, configuredBroker: "live_main" }).targetBroker, "paper");
    assert.equal(routeBroker({ accountProfile: "live_main", configuredBroker: "live_main" }).targetBroker, "blocked");
  });

  runCheck("observability modules expose SLA metrics degradation and performance state", () => {
    assert.equal(checkReliabilityTargets({ mode: "live", metrics: { marketDataFreshnessMs: 60000 } }).status, "critical");
    assert.ok(buildPrometheusMetrics({ running: true, apiSecret: "secret" }).includes("trading_bot_running"));
    assert.ok(!buildPrometheusMetrics({ apiSecret: "secret" }).includes("secret"));
    assert.equal(buildSafeDegradationStatus({ audit_write: true }).liveEntriesBlocked, true);
    assert.equal(summarizePerformanceBudget([{ module: "policyEngine", durationMs: 50 }]).status, "warning");
  });

  runCheck("scenario lab and liquidity scoring stay offline and explain tradeability", () => {
    assert.equal(calculateLiquidityScore({ spreadBps: 200, depthUsd: 10, slippageBps: 200 }).action, "block_entries");
    const scenario = runScenarioOffline({ marketData: [{ returnPct: 0.02 }], executionAssumptions: { feeBps: 10, slippageBps: 0 } });
    assert.equal(scenario.mutatesRuntimeState, false);
    assert.equal(compareScenarios(scenario, runScenarioOffline({ marketData: [{ returnPct: 0.03 }] })).deltaNetReturn > 0, true);
  });

  runCheck("model cards data lake timeline autodocs and coach redact secrets", () => {
    const card = buildModelCard({ modelId: "m1", trainingDatasetHash: "abc", featureSchemaVersion: "v1", livePermissions: { allowed: false } });
    assert.equal(canPromoteModel(card), true);
    assert.equal(buildReplayTimeline({ markers: [{ type: "entry", price: 1 }] }).status, "ready");
    assert.equal(buildDatasetManifest({ records: [{ a: 1 }], layer: "features" }).layer, "features");
    assert.equal(buildAutoDocs({ config: { apiKey: "secret", exchangeProvider: "paper" } }).activeConfig.apiKey, "[REDACTED]");
    assert.equal(buildBotCoachSummary({ blockers: [{ reason: "low_liquidity" }] }).opensTrades, false);
  });
}

if (process.argv[1]?.endsWith("scalabilityMultiExchangePolicyObservability.tests.js")) {
  await registerScalabilityMultiExchangePolicyObservabilityTests({
    runCheck: async (name, fn) => {
      await fn();
      console.log(`ok - ${name}`);
    }
  });
}
