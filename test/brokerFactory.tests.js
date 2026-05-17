import { resolveBrokerSelection } from "../src/execution/brokerFactory.js";
import { buildLivePreflight } from "../src/runtime/livePreflight.js";
import { classifyOrderCallsite, scanOrderRoutingCallsites } from "../src/runtime/orderRoutingAudit.js";

export async function registerBrokerFactoryTests({ runCheck, assert }) {
  await runCheck("broker factory resolves paper internal, demo spot and live safety matrix", async () => {
    assert.deepEqual(resolveBrokerSelection({ botMode: "paper", paperExecutionVenue: "internal" }), {
      status: "ok",
      brokerType: "PaperBroker",
      brokerMode: "paper",
      executionVenue: "internal"
    });
    assert.deepEqual(resolveBrokerSelection({ botMode: "paper", paperExecutionVenue: "binance_demo_spot" }), {
      status: "ok",
      brokerType: "DemoPaperBroker",
      brokerMode: "paper",
      executionVenue: "binance_demo_spot"
    });
    assert.deepEqual(resolveBrokerSelection({ botMode: "live", paperExecutionVenue: "internal" }), {
      status: "ok",
      brokerType: "LiveBroker",
      brokerMode: "live",
      executionVenue: "binance_spot"
    });
    assert.equal(resolveBrokerSelection({ botMode: "live", paperExecutionVenue: "binance_demo_spot" }).status, "blocked");
  });

  await runCheck("live preflight is read-only and blocks missing acknowledgements or demo venues", async () => {
    const blocked = buildLivePreflight({
      config: {
        botMode: "live",
        paperExecutionVenue: "binance_demo_spot",
        binanceApiBaseUrl: "https://demo-api.binance.com",
        enableExchangeProtection: false
      },
      runtime: { orderLifecycle: { executionIntentLedger: { unresolvedIntentIds: [] } }, ops: { alerts: { alerts: [] } } },
      doctor: { broker: { canTrade: true, permissions: ["SPOT"] } },
      promotionDossier: { status: "ready" }
    });
    assert.equal(blocked.safeToStartLive, false);
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.blockingReasons.includes("acknowledgement"));
    assert.ok(blocked.blockingReasons.includes("demo_endpoint_block"));
    assert.equal(blocked.productionEvidence.readOnly, true);
  });

  await runCheck("live preflight allows only fully acknowledged protected live config", async () => {
    const ready = buildLivePreflight({
      config: {
        botMode: "live",
        paperExecutionVenue: "internal",
        binanceApiBaseUrl: "https://api.binance.com",
        binanceApiKey: "key",
        binanceApiSecret: "secret",
        enableExchangeProtection: true,
        liveTradingAcknowledged: "I_UNDERSTAND_LIVE_TRADING_RISK"
      },
      runtime: { orderLifecycle: { executionIntentLedger: { unresolvedIntentIds: [] } }, ops: { alerts: { alerts: [] } } },
      doctor: { broker: { canTrade: true, permissions: ["SPOT"] } },
      promotionDossier: { status: "ready" }
    });
    assert.equal(ready.safeToStartLive, true);
    assert.equal(ready.status, "ready");
    assert.equal(ready.productionEvidence.apiPermissions.canTrade, true);
    assert.equal(ready.productionEvidence.protectiveOrderTruth.freezeEntries, false);
  });

  await runCheck("order routing audit classifies direct order callsites without unsafe paths", async () => {
    assert.equal(classifyOrderCallsite({ file: "src/execution/liveBroker.js", snippet: "await this.client.placeOrder({})" }), "LIVE_GATED");
    assert.equal(classifyOrderCallsite({ file: "src/execution/demoPaperBroker.js", snippet: "export class DemoPaperBroker extends LiveBroker" }), "DEMO_SAFE");
    assert.equal(classifyOrderCallsite({ file: "src/exchange/adapters/paper/PaperExchangeAdapter.js", snippet: "async placeOrder(order) {" }), "PAPER_SAFE");
    assert.equal(classifyOrderCallsite({ file: "test/liveBroker.tests.js", snippet: "await client.placeOrder({})" }), "TEST_ONLY");
    assert.equal(classifyOrderCallsite({ file: "src/random/worker.js", snippet: "await client.placeOrder({})" }), "UNSAFE");

    const audit = await scanOrderRoutingCallsites({ projectRoot: process.cwd() });
    assert.equal(audit.status, "ready");
    assert.equal(audit.unsafeCount, 0);
    assert.ok(audit.callsiteCount > 0);
    assert.ok(audit.classificationCounts.LIVE_GATED > 0);
    assert.ok(audit.classificationCounts.TEST_ONLY > 0);
  });
}
