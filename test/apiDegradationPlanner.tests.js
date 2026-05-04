import { buildApiDegradationPlan } from "../src/runtime/apiDegradationPlanner.js";
import { buildTradingPathHealth } from "../src/runtime/tradingPathHealth.js";
import { buildSafetySnapshot } from "../src/runtime/safetySnapshot.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

const now = "2026-05-04T12:00:00.000Z";

export async function registerApiDegradationPlannerTests({ runCheck, assert }) {
  await runCheck("api degradation planner reports normal mode", async () => {
    const plan = buildApiDegradationPlan({
      now,
      requestBudget: { usedWeight1m: 120, maxWeight1m: 1200 },
      streamStatus: { connected: true, lastMessageAt: "2026-05-04T11:59:30.000Z" },
      userStreamStatus: { connected: true, lastMessageAt: "2026-05-04T11:59:40.000Z" },
      providerHealth: { binance: { status: "ready" }, news: { status: "ready" } }
    });
    assert.equal(plan.degradationLevel, "normal");
    assert.ok(plan.allowedModes.includes("active"));
    assert.equal(plan.blockedActions.includes("open_new_entries"), false);
    assert.equal(plan.forceUnlock, false);
  });

  await runCheck("api degradation planner guards entries under rate limit pressure", async () => {
    const plan = buildApiDegradationPlan({
      now,
      requestBudget: { usedWeight1m: 1180, maxWeight1m: 1200, backoffActive: true, retryAfterMs: 45000 },
      recentErrors: [{ status: 429 }, { code: "RATE_LIMIT" }],
      providerHealth: { binance: { status: "ready" } }
    });
    assert.equal(plan.degradationLevel, "rate_limited");
    assert.ok(plan.blockedActions.includes("open_new_entries"));
    assert.ok(plan.blockedActions.includes("non_critical_rest_calls"));
    assert.ok(plan.retryAfterMs >= 45000);
  });

  await runCheck("api degradation planner detects stale streams", async () => {
    const plan = buildApiDegradationPlan({
      now,
      requestBudget: { usedWeight1m: 100, maxWeight1m: 1200 },
      streamStatus: { connected: true, lastMessageAt: "2026-05-04T11:50:00.000Z" },
      userStreamStatus: { connected: false, lastMessageAt: "2026-05-04T11:45:00.000Z" },
      providerHealth: { binance: { status: "ready" } }
    });
    assert.equal(plan.degradationLevel, "partial_outage");
    assert.ok(plan.reasons.includes("stale_public_stream"));
    assert.ok(plan.reasons.includes("stale_user_stream"));
    assert.ok(plan.allowedModes.includes("protect_only"));
  });

  await runCheck("api degradation planner detects partial provider outage", async () => {
    const plan = buildApiDegradationPlan({
      now,
      requestBudget: { usedWeight1m: 300, maxWeight1m: 1200 },
      streamStatus: { connected: true, lastMessageAt: "2026-05-04T11:59:30.000Z" },
      providerHealth: {
        binance: { status: "ready" },
        news: { status: "failed" },
        sentiment: { status: "stale" }
      }
    });
    assert.equal(plan.degradationLevel, "partial_outage");
    assert.ok(plan.reasons.includes("partial_provider_outage"));
    assert.ok(plan.reasons.includes("stale_provider_data"));
  });

  await runCheck("api degradation planner detects full outage", async () => {
    const plan = buildApiDegradationPlan({
      now,
      requestBudget: { usedWeight1m: 200, maxWeight1m: 1200 },
      providerHealth: {
        binance: { status: "failed" },
        news: { status: "down" }
      }
    });
    assert.equal(plan.degradationLevel, "full_outage");
    assert.ok(plan.blockedActions.includes("rebuild_protection_without_fresh_exchange_truth"));
    assert.equal(plan.recommendedAction, "stop_new_entries_and_require_operator_review");
  });

  await runCheck("api degradation planner detects latency spike", async () => {
    const plan = buildApiDegradationPlan({
      now,
      requestBudget: { usedWeight1m: 100, maxWeight1m: 1200 },
      streamStatus: { connected: true, lastMessageAt: "2026-05-04T11:59:30.000Z" },
      providerHealth: { binance: { status: "ready" } },
      latencySummary: { p95Ms: 5000 }
    });
    assert.equal(plan.degradationLevel, "partial_outage");
    assert.ok(plan.reasons.includes("latency_spike"));
    assert.ok(Number.isFinite(plan.evidence.latencyMs));
  });

  await runCheck("trading path health surfaces api degradation without force unlock", async () => {
    const plan = buildApiDegradationPlan({
      now,
      requestBudget: { usedWeight1m: 1180, maxWeight1m: 1200 },
      recentErrors: [{ status: 429 }, { status: 429 }],
      providerHealth: { binance: { status: "ready" } }
    });
    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        running: true,
        lastCycleAt: "2026-05-04T11:59:30.000Z",
        watchlist: ["BTCUSDT"],
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-04T11:59:40.000Z" } },
        latestDecisions: [{ symbol: "BTCUSDT", marketData: { status: "ready" } }]
      },
      dashboardSnapshot: { generatedAt: "2026-05-04T11:59:50.000Z" },
      readmodelSummary: { status: "ready", lastRefreshAt: "2026-05-04T11:59:55.000Z" },
      apiDegradationSummary: plan
    });
    assert.ok(health.blockingReasons.includes("api_degradation_blocks_entries"));
    assert.ok(health.staleSources.includes("api_degradation_rate_limited"));
    assert.equal(health.apiDegradationSummary.forceUnlock, false);
  });

  await runCheck("safety snapshot blocks entry permission under api degradation", async () => {
    const snapshot = buildSafetySnapshot({
      liveReadiness: { status: "ready" },
      operatorMode: { mode: "active" },
      apiDegradationSummary: {
        degradationLevel: "partial_outage",
        blockedActions: ["open_new_entries"],
        recommendedAction: "switch_to_observe_or_protect_only_until_feeds_recover"
      }
    });
    assert.equal(snapshot.entryPermission.allowed, false);
    assert.ok(snapshot.topRisks.includes("api_degradation"));
    assert.deepEqual(snapshot.operatorActions, ["switch_to_observe_or_protect_only_until_feeds_recover"]);
  });

  await runCheck("dashboard normalizer keeps api degradation optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.apiDegradationSummary.degradationLevel, "normal");
    const nested = normalizeDashboardSnapshotPayload({
      ops: { apiDegradationSummary: { degradationLevel: "rate_limited", blockedActions: ["open_new_entries"] } }
    });
    assert.equal(nested.apiDegradationSummary.degradationLevel, "rate_limited");
    assert.ok(nested.apiDegradationSummary.blockedActions.includes("open_new_entries"));
  });
}
