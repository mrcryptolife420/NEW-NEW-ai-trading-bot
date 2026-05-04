import { buildOrderStyleAdvice } from "../src/execution/orderStyleAdvisor.js";

export async function registerOrderStyleAdvisorTests({ runCheck, assert }) {
  await runCheck("order style advisor recommends maker on tight spread", async () => {
    const advice = buildOrderStyleAdvice({
      spreadBps: 1.2,
      depthConfidence: 0.9,
      depthNotional: 100_000,
      positionNotional: 1_000,
      slippageConfidence: 0.85,
      makerFeeBps: 8,
      takerFeeBps: 10
    });
    assert.equal(advice.recommendedStyle, "maker_limit");
    assert.equal(advice.makerSuitable, true);
    assert.equal(advice.liveBehaviorChanged, false);
  });

  await runCheck("order style advisor prohibits market on wide spread", async () => {
    const advice = buildOrderStyleAdvice({
      spreadBps: 40,
      depthConfidence: 0.6,
      depthNotional: 50_000,
      positionNotional: 1_000,
      slippageConfidence: 0.6
    });
    assert.equal(advice.recommendedStyle, "market_prohibited");
    assert.ok(advice.warnings.includes("wide_spread"));
  });

  await runCheck("order style advisor flags liquidity drain", async () => {
    const advice = buildOrderStyleAdvice({
      spreadBps: 8,
      depthConfidence: 0.2,
      depthNotional: 500,
      positionNotional: 2_000,
      slippageConfidence: 0.22
    });
    assert.equal(advice.recommendedStyle, "market_prohibited");
    assert.ok(advice.warnings.includes("liquidity_drain"));
    assert.equal(advice.manualReviewRecommended, true);
  });

  await runCheck("order style advisor uses limit IOC for urgent exits when liquid", async () => {
    const advice = buildOrderStyleAdvice({
      mode: "exit",
      urgency: "urgent",
      spreadBps: 5,
      depthConfidence: 0.8,
      depthNotional: 80_000,
      positionNotional: 1_500,
      slippageConfidence: 0.8
    });
    assert.equal(advice.recommendedStyle, "limit_ioc");
    assert.equal(advice.takerSuitable, true);
  });

  await runCheck("order style advisor handles missing orderbook", async () => {
    const advice = buildOrderStyleAdvice({});
    assert.ok(advice.warnings.includes("missing_orderbook"));
    assert.equal(advice.manualReviewRecommended, true);
    assert.ok(Number.isFinite(advice.inputs.spreadBps));
  });

  await runCheck("order style advisor supports protective rebuild only", async () => {
    const advice = buildOrderStyleAdvice({ mode: "protective_rebuild", spreadBps: 3, depthConfidence: 0.7 });
    assert.equal(advice.recommendedStyle, "protective_rebuild_only");
    assert.ok(advice.stopLimitGapHint.diagnosticOnly);
  });
}
