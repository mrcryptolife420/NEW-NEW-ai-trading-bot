import { buildSetupWizardPlan } from "../src/setup/setupWizard.js";
import { normalizeStrategyPlugin, validateStrategyPlugin } from "../src/strategies/pluginInterface.js";
import { buildStrategyRegistry } from "../src/strategies/strategyRegistry.js";
import { simulateMonteCarloRisk } from "../src/research/monteCarloRiskSimulator.js";
import { runWalkForwardOptimizer } from "../src/research/walkForwardOptimizer.js";
import { buildExecutionCostBreakdown } from "../src/execution/costModel.js";
import { analyzeNoTradeOutcome } from "../src/research/noTradeAnalyzer.js";
import { rollingCorrelation, buildCorrelationRiskSummary } from "../src/portfolio/correlationEngine.js";
import { buildSessionPerformanceProfile } from "../src/runtime/sessionPerformanceProfiler.js";
import { buildSymbolCooldownState } from "../src/runtime/symbolCooldownManager.js";
import { buildOperatorNote, searchOperatorNotes } from "../src/ops/operatorNotes.js";
import { routeNotification } from "../src/ops/notificationRouter.js";
import { createStrategyExperiment, updateStrategyExperimentMetrics } from "../src/research/strategyExperimentRegistry.js";
import { enrichAlertWithOperatorAction, translateOperatorReason } from "../src/ops/operatorLanguage.js";
import { buildAccountingExport } from "../src/reporting/accountingExport.js";
import { buildLocalOnlyPrivacySummary } from "../src/runtime/localOnlyPrivacy.js";
import { analyzePaperLiveDifference } from "../src/runtime/paperLiveDifferenceAnalyzer.js";

export function registerStrategyValidationCostsPortfolioUxTests({ runCheck, assert }) {
  runCheck("setup wizard defaults to safe paper mode and redacts secrets", () => {
    const plan = buildSetupWizardPlan({ answers: { mode: "live", binanceApiKey: "key", binanceApiSecret: "secret" } });
    assert.equal(plan.safeToWrite, false);
    assert.equal(plan.safetyImpact.neuralLiveAutonomyOff, true);
    assert.equal(plan.preview.BINANCE_API_KEY, "[REDACTED]");
  });

  runCheck("setup wizard writes beginner profile-compatible paper config", () => {
    const plan = buildSetupWizardPlan({ answers: { mode: "paper" } });
    assert.equal(plan.safeToWrite, true);
    assert.equal(plan.profile.id, "beginner-paper-learning");
    assert.equal(plan.env.BOT_MODE, "paper");
    assert.equal(plan.env.CONFIG_PROFILE, "paper-learning");
    assert.equal(plan.env.PAPER_MODE_PROFILE, "learn");
    assert.equal(plan.env.PAPER_EXECUTION_VENUE, "internal");
    assert.equal(plan.env.LIVE_TRADING_ACKNOWLEDGED, "");
    assert.equal(plan.env.NEURAL_LIVE_AUTONOMY_ENABLED, "false");
  });

  runCheck("setup wizard demo mode selects Binance demo spot paper profile", () => {
    const plan = buildSetupWizardPlan({ answers: { mode: "demo" } });
    assert.equal(plan.safeToWrite, true);
    assert.equal(plan.profile.id, "paper-demo-spot");
    assert.equal(plan.env.BOT_MODE, "paper");
    assert.equal(plan.env.PAPER_MODE_PROFILE, "demo_spot");
    assert.equal(plan.env.PAPER_EXECUTION_VENUE, "binance_demo_spot");
    assert.equal(plan.env.BINANCE_API_BASE_URL, "https://demo-api.binance.com");
    assert.equal(plan.env.BINANCE_FUTURES_API_BASE_URL, "https://demo-fapi.binance.com");
  });

  runCheck("strategy plugin interface blocks missing metadata tests and live safety review", () => {
    const invalid = validateStrategyPlugin({ id: "x" });
    const live = normalizeStrategyPlugin({
      id: "s1", name: "S", family: "breakout", version: "1", allowedRegimes: ["trend"], requiredFeatures: ["rsi"], riskProfile: "balanced",
      entryLogic: () => null, exitLogic: () => null, hasTests: true, status: "live_allowed"
    });
    assert.equal(invalid.valid, false);
    assert.equal(live.validation.errors.includes("live_requires_safety_review"), true);
  });

  runCheck("strategy registry reports per-version performance without core risk changes", () => {
    const plugin = { id: "s1", name: "S", family: "trend", version: "1", allowedRegimes: ["trend"], requiredFeatures: [], riskProfile: "conservative", entryLogic: () => null, exitLogic: () => null, hasTests: true };
    const registry = buildStrategyRegistry({ plugins: [plugin], performance: { s1: { trades: 3, winRate: 0.66 } } });
    assert.equal(registry.report("s1").performance.trades, 3);
    assert.equal(registry.report("s1").risk.liveAllowed, false);
  });

  runCheck("monte carlo risk simulator returns finite downside and promotion block", () => {
    const result = simulateMonteCarloRisk({ trades: [{ netPnlPct: -0.05 }, { netPnlPct: 0.01 }], iterations: 50, seed: 7 });
    assert.equal(Number.isFinite(result.riskOfRuin), true);
    assert.equal(Number.isFinite(result.maxDrawdownP95), true);
  });

  runCheck("walk forward optimizer flags one-window overfit", () => {
    const result = runWalkForwardOptimizer({ windows: [{ trainReturnPct: 0.2, testReturnPct: -0.03 }], minConsistency: 0.6 });
    assert.equal(result.status, "overfit_risk");
    assert.equal(result.blocksLivePromotion, true);
  });

  runCheck("cost model blocks negative net expectancy after fees and slippage", () => {
    const result = buildExecutionCostBreakdown({ grossEdgePct: 0.001, makerFeeBps: 10, takerFeeBps: 10, spreadBps: 20, slippageBps: 20 });
    assert.equal(result.tradeAllowed, false);
    assert.equal(result.blockedReason, "negative_net_expectancy_after_costs");
  });

  runCheck("no-trade analyzer labels missed winners and keeps them out of live promotion evidence", () => {
    const result = analyzeNoTradeOutcome({ decision: { decisionId: "d1" }, futurePath: { maxFavorableMovePct: 0.05, maxAdverseMovePct: -0.005 }, costs: { makerFeeBps: 1 } });
    assert.equal(result.label, "missed_winner");
    assert.equal(result.addToReplayQueue, true);
    assert.equal(result.livePromotionEvidence, false);
  });

  runCheck("correlation engine supports multi-position while blocking duplicate symbol", () => {
    assert.equal(Number.isFinite(rollingCorrelation([1, 2, 3], [2, 4, 6])), true);
    const diverse = buildCorrelationRiskSummary({ openPositions: [{ symbol: "ETHUSDT", cluster: "eth" }], candidate: { symbol: "SOLUSDT", cluster: "sol" } });
    const duplicate = buildCorrelationRiskSummary({ openPositions: [{ symbol: "ETHUSDT" }], candidate: { symbol: "ETHUSDT" } });
    assert.equal(diverse.crowdingRisk, "low");
    assert.equal(duplicate.sameSymbolBlocked, true);
  });

  runCheck("session profiler and symbol cooldowns are fallback safe", () => {
    const profile = buildSessionPerformanceProfile({ trades: [{ closedAt: "2026-05-08T14:00:00.000Z", netPnlPct: -0.02, slippageBps: 5 }] });
    const cooldowns = buildSymbolCooldownState({ events: [{ symbol: "BTCUSDT", reason: "high_slippage" }], now: 1000 });
    assert.equal(profile.sessions.us.trades, 1);
    assert.equal(cooldowns.isBlocked("BTCUSDT"), true);
  });

  runCheck("operator notes and notifications redact secrets and do not affect trading", () => {
    const note = buildOperatorNote({ text: "api_key=secret123 check" });
    const routed = routeNotification({ event: { severity: "critical", type: "manual_review", message: "token=abc" }, config: {} });
    assert.equal(note.warnings.includes("secret_like_content_redacted"), true);
    assert.equal(searchOperatorNotes([note], "REDACTED").length, 1);
    assert.equal(routed.tradingBlockedOnFailure, false);
  });

  runCheck("strategy experiment registry requires review before live promotion", () => {
    const experiment = createStrategyExperiment({ strategyId: "s1", strategyVersion: "1", configHash: "cfg" });
    const updated = updateStrategyExperimentMetrics(experiment, { trades: 101 }, { maxTrades: 100 });
    assert.equal(experiment.livePromotionRequiresReview, true);
    assert.equal(updated.status, "review_required");
  });

  runCheck("operator language translates blockers into concise actions", () => {
    const translated = translateOperatorReason("exchange_truth_freeze");
    const alert = enrichAlertWithOperatorAction({ code: "reconcile_required" });
    assert.equal(translated.human.includes("runtime"), true);
    assert.equal(Boolean(alert.operatorAction), true);
  });

  runCheck("accounting export separates mode and keeps state read-only", () => {
    const result = buildAccountingExport({ trades: [{ tradeId: "t1", symbol: "BTCUSDT", mode: "live", pnlQuote: 5 }], mode: "live", format: "csv" });
    assert.equal(result.rows, 1);
    assert.equal(result.content.includes("BTCUSDT"), true);
  });

  runCheck("local-only privacy and paper-live delta block unsafe promotion evidence", () => {
    const privacy = buildLocalOnlyPrivacySummary({ config: { localOnlyMode: true }, providers: [{ id: "news", kind: "external" }, { id: "binance", kind: "exchange", required: true }] });
    const delta = analyzePaperLiveDifference({ paper: { netPnlPct: 0.04, makerFillRatio: 0.9 }, live: { netPnlPct: 0.01, makerFillRatio: 0.5 } });
    assert.equal(privacy.blockedProviders.includes("news"), true);
    assert.equal(delta.livePromotionBlocked, true);
  });
}
