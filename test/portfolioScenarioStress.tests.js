import { buildPortfolioScenarioStress } from "../src/runtime/portfolioScenarioStress.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";
import { buildSafetySnapshot } from "../src/runtime/safetySnapshot.js";

const marketSnapshots = {
  BTCUSDT: { price: 50000 },
  ETHUSDT: { price: 3000 },
  SOLUSDT: { price: 150 }
};

export async function registerPortfolioScenarioStressTests({ runCheck, assert }) {
  await runCheck("portfolio scenario stress handles empty portfolio safely", async () => {
    const summary = buildPortfolioScenarioStress({ openPositions: [], accountEquity: 10000 });
    assert.equal(summary.status, "ok");
    assert.equal(summary.positionCount, 0);
    assert.equal(summary.protectionHealth.status, "empty");
    assert.equal(Number.isFinite(summary.estimatedDrawdownPct), true);
  });

  await runCheck("portfolio scenario stress estimates diversified portfolio drawdown", async () => {
    const summary = buildPortfolioScenarioStress({
      openPositions: [
        { symbol: "BTCUSDT", quantity: 0.02, entryPrice: 50000, protected: true, btcBeta: 1 },
        { symbol: "ETHUSDT", quantity: 0.3, entryPrice: 3000, protected: true, btcBeta: 0.75 }
      ],
      marketSnapshots,
      accountEquity: 25000,
      config: { maxOpenPositions: 5, maxTotalExposureFraction: 0.8 }
    });
    assert.ok(["ok", "watch"].includes(summary.status));
    assert.equal(summary.positionCount, 2);
    assert.equal(summary.protectionHealth.status, "protected");
    assert.equal(summary.portfolioCrowding.multiPositionSupported, true);
  });

  await runCheck("portfolio scenario stress flags crowded unprotected portfolio", async () => {
    const summary = buildPortfolioScenarioStress({
      openPositions: [
        { symbol: "SOLUSDT", quantity: 20, entryPrice: 150, cluster: "solana", regime: "breakout", strategyFamily: "breakout", btcBeta: 1.1 },
        { symbol: "RAYUSDT", quantity: 300, entryPrice: 3, markPrice: 3, cluster: "solana", regime: "breakout", strategyFamily: "breakout", btcBeta: 1.2 },
        { symbol: "JUPUSDT", quantity: 900, entryPrice: 1, markPrice: 1, cluster: "solana", regime: "breakout", strategyFamily: "breakout", btcBeta: 1.15 }
      ],
      marketSnapshots,
      accountEquity: 5000,
      config: { maxOpenPositions: 5, maxTotalExposureFraction: 1 }
    });
    assert.ok(["stress", "blocked"].includes(summary.status));
    assert.equal(summary.protectionHealth.status, "unprotected_positions");
    assert.ok(["medium", "high", "blocked"].includes(summary.portfolioCrowding.crowdingRisk));
    assert.notEqual(summary.recommendedAction, "monitor");
  });

  await runCheck("portfolio scenario stress degrades on missing prices", async () => {
    const summary = buildPortfolioScenarioStress({
      openPositions: [{ symbol: "MISSINGUSDT", quantity: 10, entryPrice: 0 }],
      marketSnapshots: {},
      accountEquity: 10000
    });
    assert.equal(summary.status, "degraded");
    assert.ok(summary.warnings.includes("missing_prices"));
    assert.equal(summary.recommendedAction, "refresh_market_prices_before_using_stress_output");
  });

  await runCheck("dashboard normalizer keeps portfolio scenario stress summary optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.portfolioScenarioStressSummary.status, "unavailable");
    const nested = normalizeDashboardSnapshotPayload({
      risk: { portfolioScenarioStressSummary: { status: "watch", scenarioCount: 7 } }
    });
    assert.equal(nested.portfolioScenarioStressSummary.status, "watch");
    assert.equal(nested.portfolioScenarioStressSummary.scenarioCount, 7);
  });

  await runCheck("safety snapshot surfaces portfolio scenario stress as diagnostics", async () => {
    const snapshot = buildSafetySnapshot({
      liveReadiness: { status: "ready" },
      operatorMode: { mode: "active" },
      portfolioScenarioStressSummary: {
        status: "stress",
        recommendedAction: "reduce_new_risk_and_review_protection"
      }
    });
    assert.equal(snapshot.overallStatus, "degraded");
    assert.ok(snapshot.topRisks.includes("portfolio_scenario_stress"));
    assert.deepEqual(snapshot.operatorActions, ["reduce_new_risk_and_review_protection"]);
  });
}
