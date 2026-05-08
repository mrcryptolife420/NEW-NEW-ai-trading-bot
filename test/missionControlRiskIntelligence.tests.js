import { buildMissionControlSummary } from "../src/ops/missionControl.js";
import { buildMarketWorthTradingScore } from "../src/market/marketWorthTradingScore.js";
import { evaluateNeverTradeWhenRules } from "../src/risk/neverTradeWhenRules.js";
import { buildTradeQualityScore } from "../src/trading/tradeQualityScore.js";
import { buildTradeReceipt } from "../src/trading/tradeReceipt.js";
import { evaluateLossPreventionAI } from "../src/ai/risk/lossPreventionAI.js";
import { buildCapitalAllocationPlan } from "../src/ai/capital/capitalAllocationAI.js";
import { evaluateDoNothingIntelligence } from "../src/ai/decision/doNothingIntelligence.js";
import { detectRealityGap } from "../src/research/realityGapDetector.js";
import { evaluateAiChangeBudget } from "../src/ai/governance/aiChangeBudget.js";
import { resolveBotPersonalityMode } from "../src/runtime/botPersonalityMode.js";
import { getRegimePlaybook } from "../src/market/regimePlaybooks.js";
import { createStrategyKillSwitch, resumeStrategyKillSwitch } from "../src/strategies/strategyKillSwitch.js";
import { evaluateOperatorMistakeProtection } from "../src/ops/operatorMistakeProtection.js";
import { buildTradingSystemScorecard } from "../src/reporting/tradingSystemScorecard.js";

export async function registerMissionControlRiskIntelligenceTests({ runCheck, assert }) {
  await runCheck("mission control summarizes blockers without order authority", () => {
    const summary = buildMissionControlSummary({
      config: { botMode: "paper" },
      readiness: { ok: false, status: "blocked", reasons: ["exchange_protection_off"] },
      snapshot: { dashboard: { ops: { neverTradeContext: { spread_too_high: true } } } }
    });
    assert.equal(summary.status, "blocked");
    assert.equal(summary.primaryBlocker, "spread_too_high");
    assert.equal(summary.entriesAllowed, false);
    assert.equal(summary.exitsManaged, true);
    assert.equal(summary.canPlaceOrders, false);
    assert.equal(summary.canIncreaseRisk, false);
  });

  await runCheck("never-trade rules are hard non-overridable blocks", () => {
    const result = evaluateNeverTradeWhenRules({ stale_order_book: true, live_ack_missing: true });
    assert.equal(result.status, "blocked");
    assert.equal(result.entriesAllowed, false);
    assert.equal(result.overridable, false);
    assert.deepEqual(result.activeRules.map((rule) => rule.id), ["stale_order_book", "live_ack_missing"]);
  });

  await runCheck("market worth score can mark whole market untradeable", () => {
    const result = buildMarketWorthTradingScore({
      btcTrendHealth: 0.05,
      ethTrendHealth: 0.05,
      marketBreadth: 0.05,
      volatilityCondition: 0.05,
      liquidityCondition: 0.05,
      exchangeReliability: 0.05,
      dataQuality: 0.05,
      stablecoinStress: 1,
      newsEventRisk: 1,
      correlationRisk: 1,
      spreadRisk: 1
    });
    assert.equal(result.status, "do_not_trade");
    assert.equal(result.entriesAllowed, false);
    assert.equal(result.riskMultiplier, 0);
  });

  await runCheck("trade quality blocks weak candidates and receipt stays explainable", () => {
    const quality = buildTradeQualityScore({ signal: 0.2, data: 0.4, liquidity: 0.3 }, { mode: "live" });
    const receipt = buildTradeReceipt({ candidate: { symbol: "BTCUSDT", direction: "long", strategy: "breakout" }, quality });
    assert.equal(quality.entriesAllowed, false);
    assert.equal(quality.blockReason, "trade_quality_below_minimum");
    assert.equal(receipt.symbol, "BTCUSDT");
    assert.equal(receipt.containsSecrets, false);
  });

  await runCheck("defensive intelligence layers cannot raise risk or force entries", () => {
    const loss = evaluateLossPreventionAI({ slippageSpikeRisk: 0.9, modelOverconfidenceRisk: 0.7 });
    const capital = buildCapitalAllocationPlan({ dataQuality: 0.4 });
    const doNothing = evaluateDoNothingIntelligence({ marketWorthTradingScore: 0.1 });
    assert.equal(loss.status, "blocked");
    assert.equal(loss.canIncreaseRisk, false);
    assert.equal(loss.canForceEntry, false);
    assert.equal(capital.status, "blocked");
    assert.equal(capital.canPlaceOrders, false);
    assert.equal(doNothing.hardCaution, true);
    assert.equal(doNothing.liveOverride, false);
  });

  await runCheck("reality gap and AI change budget reduce autonomy", () => {
    const gap = detectRealityGap({ fillGap: 1, slippageGap: 1, paperLiveGap: 1, latencyAssumptionGap: 1 });
    const budget = evaluateAiChangeBudget({ usage: { dailyChanges: 6, rollbackCooldown: true }, limits: { dailyChanges: 5 } });
    assert.equal(gap.livePromotionAllowed, false);
    assert.equal(gap.autonomyMultiplier, 0);
    assert.equal(budget.changeAllowed, false);
    assert.ok(budget.breaches.includes("dailyChanges"));
  });

  await runCheck("personality modes and playbooks only tighten risk", () => {
    const noEntries = resolveBotPersonalityMode("no_new_entries");
    const shock = getRegimePlaybook("news_shock");
    assert.equal(noEntries.entriesAllowed, false);
    assert.equal(noEntries.exitsManaged, true);
    assert.equal(shock.maxRiskMultiplier, 0);
    assert.equal(shock.fastExecutionPermission, "disabled");
  });

  await runCheck("strategy kill-switch resume requires review reason", () => {
    const killed = createStrategyKillSwitch({ scopeType: "family", scopeValue: "breakout", reason: "loss streak" });
    assert.equal(killed.status, "active");
    assert.throws(() => resumeStrategyKillSwitch(killed, {}), /reason is required/);
    const resumed = resumeStrategyKillSwitch(killed, { reason: "reviewed" });
    assert.equal(resumed.status, "resumed");
  });

  await runCheck("operator mistake protection blocks critical live mistakes", () => {
    const result = evaluateOperatorMistakeProtection({
      botMode: "live",
      binanceApiBaseUrl: "https://demo-api.binance.com",
      enableExchangeProtection: false,
      watchlist: [],
      maxTotalExposurePct: 0.9
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.blocksLive, true);
  });

  await runCheck("trading system scorecard is advisory only", () => {
    const result = buildTradingSystemScorecard({ signal: 0.9, risk: 0.2, realityGap: 0.8, previousScore: 0.7 });
    assert.equal(result.canPlaceOrders, false);
    assert.equal(result.weakestModule, "realityGap");
    assert.equal(result.recommendedFix, "review_realityGap_controls");
  });
}
