import { buildExitIntelligenceV2 } from "../risk/exitIntelligenceV2.js";
import { buildTradeQualityAnalytics } from "./tradeQualityAnalytics.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function num(value, digits = 4) {
  return Number(finite(value, 0).toFixed(digits));
}

function normalizeAction(value = "unknown") {
  const normalized = `${value || ""}`.toLowerCase();
  if (["hold", "trim", "trail", "exit"].includes(normalized)) {
    return normalized;
  }
  return "unknown";
}

function compareAction(actual = "unknown", challenger = "unknown") {
  const actualAction = normalizeAction(actual);
  const challengerAction = normalizeAction(challenger);
  if (actualAction === "unknown" || challengerAction === "unknown") {
    return "unknown";
  }
  if (actualAction === challengerAction) {
    return "matched";
  }
  if (actualAction === "exit" && ["hold", "trail"].includes(challengerAction)) {
    return "actual_more_aggressive";
  }
  if (["hold", "trail"].includes(actualAction) && ["trim", "exit"].includes(challengerAction)) {
    return "challenger_more_defensive";
  }
  return "different";
}

function inferActualExitAction(trade = {}) {
  const reason = `${trade.exitReason || trade.reason || ""}`.toLowerCase();
  if (reason.includes("trail")) return "trail";
  if (reason.includes("scale") || reason.includes("partial") || reason.includes("trim")) return "trim";
  if (trade.exitAt || trade.closedAt || trade.status === "closed") return "exit";
  return "unknown";
}

function buildUnknownDecision({ position = {}, reason = "missing_market_data", mode = "paper" } = {}) {
  return {
    status: "unknown",
    mode,
    diagnosticsOnly: mode !== "paper",
    symbol: position.symbol || null,
    challengerAction: "unknown",
    reasons: [reason],
    liveBehaviorChanged: false,
    liveCanIncreasePosition: false,
    liveCanLoosenProtection: false
  };
}

export function buildPaperExitPolicyChallengerDecision({
  position = {},
  currentPrice = null,
  marketSnapshot = {},
  config = {},
  mode = "paper",
  nowIso = new Date().toISOString()
} = {}) {
  const price = finite(currentPrice ?? marketSnapshot?.book?.mid ?? marketSnapshot?.market?.close, 0);
  if (!position?.symbol || price <= 0) {
    return buildUnknownDecision({ position, mode });
  }
  const intelligence = buildExitIntelligenceV2({
    position,
    currentPrice: price,
    marketSnapshot,
    marketStructureSummary: marketSnapshot.marketStructureSummary || {},
    newsSummary: marketSnapshot.newsSummary || {},
    announcementSummary: marketSnapshot.announcementSummary || {},
    calendarSummary: marketSnapshot.calendarSummary || {},
    exitIntelligenceSummary: position.exitIntelligenceSummary || {},
    config,
    nowIso
  });
  const challengerAction = normalizeAction(intelligence.currentExitRecommendation);
  return {
    status: "ready",
    mode,
    diagnosticsOnly: mode !== "paper",
    symbol: position.symbol,
    challengerAction,
    exitIntelligence: intelligence,
    reasons: arr(intelligence.reasons).map((item) => item.id || item).filter(Boolean),
    scores: {
      fullExitScore: num(intelligence.fullExitScore),
      partialTakeProfitScore: num(intelligence.partialTakeProfitScore),
      trailingProtectionScore: num(intelligence.trailingProtectionScore),
      timeDecayScore: num(intelligence.timeDecayScore),
      structureInvalidationScore: num(intelligence.structureInvalidationScore)
    },
    liveBehaviorChanged: false,
    liveCanIncreasePosition: false,
    liveCanLoosenProtection: false
  };
}

export function comparePaperExitPolicyToActual({
  position = {},
  trade = {},
  challengerDecision = {},
  exitAt = null
} = {}) {
  const analytics = buildTradeQualityAnalytics({
    position,
    trade,
    exitPrice: trade.exitPrice,
    netPnlPct: trade.netPnlPct,
    reason: trade.exitReason || trade.reason,
    exitAt
  });
  const actualAction = inferActualExitAction(trade);
  const challengerAction = normalizeAction(challengerDecision.challengerAction);
  return {
    symbol: trade.symbol || position.symbol || challengerDecision.symbol || null,
    tradeId: trade.id || trade.tradeId || null,
    actualAction,
    challengerAction,
    comparison: compareAction(actualAction, challengerAction),
    maximumFavorableExcursionPct: analytics.maximumFavorableExcursionPct,
    maximumAdverseExcursionPct: analytics.maximumAdverseExcursionPct,
    exitEfficiencyPct: analytics.exitEfficiencyPct,
    gaveBackPct: analytics.gaveBackPct,
    tradeQualityLabel: analytics.tradeQualityLabel,
    tradeQualityLabels: analytics.tradeQualityLabels,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function summarizePaperExitPolicyLab(records = []) {
  const items = arr(records);
  const actionCounts = {};
  const comparisonCounts = {};
  for (const record of items) {
    const action = normalizeAction(record.challengerAction);
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    const comparison = record.comparison || "unknown";
    comparisonCounts[comparison] = (comparisonCounts[comparison] || 0) + 1;
  }
  const avgExitEfficiency = items.length
    ? items.reduce((sum, item) => sum + finite(item.exitEfficiencyPct, 0), 0) / items.length
    : 0;
  const avgGaveBack = items.length
    ? items.reduce((sum, item) => sum + finite(item.gaveBackPct, 0), 0) / items.length
    : 0;
  return {
    status: items.length ? "ready" : "empty",
    count: items.length,
    challengerActionCounts: actionCounts,
    comparisonCounts,
    averageExitEfficiencyPct: num(avgExitEfficiency, 6),
    averageGaveBackPct: num(avgGaveBack, 6),
    diagnosticsOnly: true,
    liveBehaviorChanged: false,
    recent: items.slice(-10).reverse()
  };
}

export function buildPaperExitPolicyLabSummary({
  positions = [],
  trades = [],
  marketSnapshotsBySymbol = {},
  config = {},
  mode = "paper",
  nowIso = new Date().toISOString()
} = {}) {
  const decisions = arr(positions).map((position) => buildPaperExitPolicyChallengerDecision({
    position,
    currentPrice: marketSnapshotsBySymbol[position.symbol]?.book?.mid || position.markPrice || position.currentPrice,
    marketSnapshot: marketSnapshotsBySymbol[position.symbol] || {},
    config,
    mode,
    nowIso
  }));
  const comparisons = arr(trades).map((trade) => {
    const position = trade.position || {
      symbol: trade.symbol,
      entryPrice: trade.entryPrice,
      highestPrice: trade.bestPossibleExitPrice || trade.highestPrice,
      lowestPrice: trade.worstAdversePrice || trade.lowestPrice
    };
    const challengerDecision = buildPaperExitPolicyChallengerDecision({
      position,
      currentPrice: trade.exitPrice || trade.closePrice || trade.entryPrice,
      marketSnapshot: marketSnapshotsBySymbol[trade.symbol] || {},
      config,
      mode: "paper",
      nowIso: trade.exitAt || nowIso
    });
    return comparePaperExitPolicyToActual({ position, trade, challengerDecision });
  });
  return {
    ...summarizePaperExitPolicyLab(comparisons),
    openDecisionCount: decisions.length,
    openDecisions: decisions,
    mode,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export const PAPER_EXIT_POLICY_LAB_VERSION = 1;
