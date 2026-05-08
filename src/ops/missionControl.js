import { buildMarketWorthTradingScore } from "../market/marketWorthTradingScore.js";
import { evaluateNeverTradeWhenRules } from "../risk/neverTradeWhenRules.js";
import { resolveBotPersonalityMode } from "../runtime/botPersonalityMode.js";

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function buildMissionControlSummary({ snapshot = {}, config = {}, readiness = null, now = new Date().toISOString() } = {}) {
  const dashboard = snapshot.dashboard || {};
  const ops = dashboard.ops || {};
  const effectiveReadiness = readiness || ops.readiness || snapshot.manager?.readiness || {};
  const modePolicy = resolveBotPersonalityMode(first(ops.personalityMode, config.botPersonalityMode, config.botMode === "live" ? "conservative_live" : "learning_paper"));
  const marketWorth = buildMarketWorthTradingScore(first(ops.marketWorth, dashboard.marketWorth, {}));
  const neverTrade = evaluateNeverTradeWhenRules(first(ops.neverTradeContext, {}));
  const readinessBlocked = effectiveReadiness.ok === false || !["ready", "unknown", undefined].includes(effectiveReadiness.status);
  const entriesAllowed = Boolean(modePolicy.entriesAllowed && marketWorth.entriesAllowed && neverTrade.entriesAllowed && !readinessBlocked);
  const primaryBlocker = first(
    neverTrade.primaryRule,
    marketWorth.blockReason,
    ops.signalFlow?.dominantBlocker,
    (effectiveReadiness.reasons || [])[0],
    entriesAllowed ? null : "entries_not_allowed"
  );
  const largestRisk = first(ops.riskLocks?.[0]?.reason, ops.largestRisk, marketWorth.status === "do_not_trade" ? "market_not_worth_trading" : null, "none");
  const status = entriesAllowed ? "ready" : "blocked";
  return {
    status,
    generatedAt: now,
    botMode: first(snapshot.manager?.currentMode, ops.mode?.botMode, config.botMode, "paper"),
    operatorMode: first(ops.operatorModeSummary?.mode, "active"),
    entriesAllowed,
    exitsManaged: modePolicy.exitsManaged !== false,
    primaryBlocker,
    largestRisk,
    lastTradeDecision: first(ops.lastTradeDecision, dashboard.lastDecision, null),
    whyTrading: entriesAllowed ? "Entries zijn toegestaan binnen mode, readiness, market-worth en hard-block checks." : `Entries geblokkeerd door ${primaryBlocker}.`,
    blockingModule: neverTrade.primaryRule ? "neverTradeWhenRules" : marketWorth.blockReason ? "marketWorthTradingScore" : readinessBlocked ? "operationalReadiness" : "botPersonalityMode",
    nextBestAction: primaryBlocker ? `Open runbook voor ${primaryBlocker} en herstel de onderliggende blocker voordat entries worden toegestaan.` : "Monitor candidates en execution readiness.",
    liveReadiness: first(ops.liveReadiness, effectiveReadiness.status, "unknown"),
    neuralReadiness: first(ops.neuralReadiness, "unknown"),
    fastExecutionReadiness: first(ops.fastExecutionReadiness, "unknown"),
    dataFreshness: first(ops.dataFreshness, "unknown"),
    exchangeSafety: first(ops.exchangeSafety, "unknown"),
    positionProtection: first(ops.positionProtection, "unknown"),
    marketWorth,
    neverTrade,
    modePolicy,
    runbook: primaryBlocker ? `docs/RUNBOOKS.md#${primaryBlocker}` : "docs/RUNBOOKS.md",
    canPlaceOrders: false,
    canIncreaseRisk: false
  };
}
