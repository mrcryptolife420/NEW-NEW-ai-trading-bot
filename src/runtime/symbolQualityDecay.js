import { clamp } from "../utils/math.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function num(value, digits = 4) {
  return Number(clamp(safeNumber(value, 0), -1_000_000, 1_000_000).toFixed(digits));
}

function lowerText(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.toLowerCase();
  }
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function unique(values) {
  return [...new Set(arr(values).filter(Boolean))];
}

function hasAnyText(source, needles) {
  const text = lowerText(source);
  return needles.some((needle) => text.includes(needle));
}

function eventTimeMs(item) {
  const value = item?.at || item?.timestamp || item?.createdAt || item?.entryAt || item?.exitAt || item?.updatedAt;
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function filterSymbol(records, symbol) {
  const wanted = lowerText(symbol);
  if (!wanted || wanted === "unknown") {
    return arr(records);
  }
  return arr(records).filter((item) => lowerText(item?.symbol || item?.candidate?.symbol) === wanted);
}

function countBlockedDecisions(decisions) {
  return arr(decisions).filter((decision) => {
    const reasons = arr(decision?.reasons || decision?.blockedReasons);
    return decision?.approved === false ||
      decision?.allow === false ||
      Boolean(decision?.rootBlocker) ||
      reasons.length > 0;
  }).length;
}

function countLowDataQuality(records) {
  return arr(records).filter((item) => {
    const qualityScore = safeNumber(
      item?.dataQualityScore ??
        item?.dataQuality?.score ??
        item?.dataQuality?.overallScore ??
        item?.marketSnapshot?.dataQualityScore,
      1
    );
    return qualityScore < 0.45 ||
      hasAnyText(item, ["low_data_quality", "data_quality", "stale", "missing market", "missing candle", "feed stale"]);
  }).length;
}

function slippageBps(item) {
  return Math.max(
    safeNumber(item?.slippageBps, 0),
    safeNumber(item?.slippageDeltaBps, 0),
    safeNumber(item?.realizedTouchSlippageBps, 0),
    safeNumber(item?.entryExecutionAttribution?.slippageDeltaBps, 0),
    safeNumber(item?.entryExecutionAttribution?.realizedTouchSlippageBps, 0),
    safeNumber(item?.exitExecutionAttribution?.slippageDeltaBps, 0)
  );
}

function executionQuality(item) {
  return safeNumber(
    item?.executionQualityScore ??
      item?.fillQualityScore ??
      item?.entryExecutionAttribution?.executionQualityScore ??
      item?.exitExecutionAttribution?.executionQualityScore,
    0.7
  );
}

function countBadFills(records, config) {
  const maxSlippageBps = Math.max(0.5, safeNumber(config.symbolQualityDecayBadSlippageBps, 6));
  return arr(records).filter((item) => {
    const makerFillRatio = safeNumber(item?.makerFillRatio ?? item?.entryExecutionAttribution?.makerFillRatio, 0.5);
    return slippageBps(item) >= maxSlippageBps ||
      executionQuality(item) < 0.42 ||
      makerFillRatio < 0.08 ||
      hasAnyText(item, ["bad_fill", "poor_slippage", "execution_drag"]);
  }).length;
}

function countStopLimitStuck(records) {
  return arr(records).filter((item) => hasAnyText(item, ["stop_limit_stuck", "stop limit stuck"])).length;
}

function countBadVeto(records) {
  return arr(records).filter((item) =>
    lowerText(item?.vetoOutcome?.outcome || item?.vetoOutcome || item?.failureMode).includes("bad_veto") ||
    hasAnyText(item, ["bad_veto", "missed winner"])
  ).length;
}

function countBadExitQuality(records) {
  const badLabels = ["late_exit", "early_exit", "execution_drag_exit", "stop_too_tight", "take_profit_too_close", "forced_reconcile_exit"];
  return arr(records).filter((item) => {
    const label = lowerText(item?.exitQuality?.label || item?.exitQuality || item?.label || item?.tradeQualityLabel);
    const captureEfficiency = safeNumber(item?.captureEfficiency ?? item?.exitEfficiencyPct, 0.6);
    return badLabels.includes(label) || captureEfficiency < 0.22;
  }).length;
}

function countCleanEvidence(records, decisions) {
  const cleanTrades = arr(records).filter((item) => {
    const pnl = safeNumber(item?.pnlQuote ?? item?.netPnlQuote, 0);
    const pnlPct = safeNumber(item?.netPnlPct ?? item?.pnlPct, 0);
    return (pnl > 0 || pnlPct > 0) &&
      executionQuality(item) >= 0.58 &&
      slippageBps(item) < 4 &&
      countBadExitQuality([item]) === 0;
  }).length;
  const cleanDecisions = arr(decisions).filter((decision) =>
    (decision?.approved === true || decision?.allow === true) &&
    arr(decision?.reasons || decision?.blockedReasons).length === 0 &&
    !decision?.rootBlocker &&
    safeNumber(decision?.dataQualityScore ?? decision?.dataQuality?.score, 0.7) >= 0.58
  ).length;
  return cleanTrades + cleanDecisions;
}

function addReason(reasons, code, count, weight, detail = null) {
  if (count <= 0) {
    return 0;
  }
  reasons.push({ code, count, weight: num(weight), detail });
  return weight;
}

function cooldownMinutesForPenalty(penalty, config) {
  const base = Math.max(15, safeNumber(config.symbolQualityDecayBaseCooldownMinutes, 45));
  const max = Math.max(base, safeNumber(config.symbolQualityDecayMaxCooldownMinutes, 240));
  if (penalty >= 0.75) {
    return max;
  }
  if (penalty >= 0.52) {
    return Math.min(max, base * 2);
  }
  if (penalty >= 0.3) {
    return base;
  }
  return 0;
}

function buildRecoveryConditions(reasonCodes) {
  const conditions = ["clean_decision_cycles_without_hard_blockers", "fresh_market_and_execution_data"];
  if (reasonCodes.includes("bad_fills") || reasonCodes.includes("poor_slippage")) {
    conditions.push("improved_fill_quality_and_slippage");
  }
  if (reasonCodes.includes("repeated_blockers")) {
    conditions.push("lower_blocker_rate_for_symbol");
  }
  if (reasonCodes.includes("stop_limit_stuck")) {
    conditions.push("no_recent_stop_limit_stuck_events");
  }
  if (reasonCodes.includes("bad_veto_outcomes")) {
    conditions.push("bad_veto_rate_normalized");
  }
  if (reasonCodes.includes("bad_exit_quality")) {
    conditions.push("exit_quality_recovered");
  }
  return unique(conditions);
}

export function buildSymbolQualityDecay({
  symbol = "unknown",
  decisions = [],
  trades = [],
  fills = [],
  events = [],
  now = null,
  nowIso = null,
  config = {}
} = {}) {
  const currentTime = nowIso || now || new Date().toISOString();
  const nowMs = new Date(currentTime).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const recentWindowHours = Math.max(1, safeNumber(config.symbolQualityDecayLookbackHours, 72));
  const minMs = safeNowMs - recentWindowHours * 3_600_000;
  const scopedDecisions = filterSymbol(decisions, symbol).filter((item) => {
    const timeMs = eventTimeMs(item);
    return !Number.isFinite(timeMs) || timeMs >= minMs;
  });
  const scopedTrades = filterSymbol(trades, symbol).filter((item) => {
    const timeMs = eventTimeMs(item);
    return !Number.isFinite(timeMs) || timeMs >= minMs;
  });
  const scopedFills = filterSymbol(fills, symbol).filter((item) => {
    const timeMs = eventTimeMs(item);
    return !Number.isFinite(timeMs) || timeMs >= minMs;
  });
  const scopedEvents = filterSymbol(events, symbol).filter((item) => {
    const timeMs = eventTimeMs(item);
    return !Number.isFinite(timeMs) || timeMs >= minMs;
  });
  const records = [...scopedTrades, ...scopedFills, ...scopedEvents, ...scopedDecisions];
  const warnings = [];
  const reasons = [];
  const totalEvidence = scopedDecisions.length + scopedTrades.length + scopedFills.length + scopedEvents.length;

  if (totalEvidence === 0) {
    warnings.push("missing_symbol_quality_data");
  }

  const repeatedBlockerThreshold = Math.max(2, safeNumber(config.symbolQualityDecayBlockerThreshold, 3));
  const badFillThreshold = Math.max(1, safeNumber(config.symbolQualityDecayBadFillThreshold, 2));
  const blockedCount = countBlockedDecisions(scopedDecisions);
  const badFillCount = countBadFills([...scopedTrades, ...scopedFills], config);
  const stuckCount = countStopLimitStuck(scopedEvents);
  const lowDataCount = countLowDataQuality([...scopedDecisions, ...scopedEvents]);
  const badVetoCount = countBadVeto(records);
  const badExitCount = countBadExitQuality(scopedTrades);
  const cleanEvidenceCount = countCleanEvidence(scopedTrades, scopedDecisions);

  let penalty = 0;
  penalty += addReason(
    reasons,
    "repeated_blockers",
    blockedCount >= repeatedBlockerThreshold ? blockedCount : 0,
    Math.min(0.32, blockedCount * 0.075),
    "recent setup blockers are noisy for this symbol"
  );
  penalty += addReason(
    reasons,
    "bad_fills",
    badFillCount >= badFillThreshold ? badFillCount : 0,
    Math.min(0.34, badFillCount * 0.11),
    "recent fills/slippage reduced execution quality"
  );
  penalty += addReason(reasons, "stop_limit_stuck", stuckCount, Math.min(0.36, stuckCount * 0.18), "protective stop-limit became stuck");
  penalty += addReason(reasons, "low_data_quality", lowDataCount, Math.min(0.24, lowDataCount * 0.08), "symbol feed quality was stale or incomplete");
  penalty += addReason(reasons, "bad_veto_outcomes", badVetoCount, Math.min(0.28, badVetoCount * 0.14), "blocked setups later looked like missed winners");
  penalty += addReason(reasons, "bad_exit_quality", badExitCount, Math.min(0.26, badExitCount * 0.1), "recent exits show avoidable quality drag");

  const recoveryCredit = Math.min(0.28, cleanEvidenceCount * 0.07);
  const missingDataPenalty = totalEvidence === 0 ? 0.08 : 0;
  const rankPenalty = clamp(penalty + missingDataPenalty - recoveryCredit, 0, 0.95);
  const qualityScore = clamp(1 - rankPenalty, 0.05, 1);
  const cooldownMinutes = cooldownMinutesForPenalty(rankPenalty, config);
  const cooldownUntil = cooldownMinutes > 0
    ? new Date(safeNowMs + cooldownMinutes * 60_000).toISOString()
    : null;
  const reasonCodes = reasons.map((item) => item.code);
  const status = totalEvidence === 0
    ? "unknown"
    : cooldownUntil
      ? "cooldown"
      : rankPenalty >= 0.2
        ? "watch"
        : "healthy";

  return {
    symbol: symbol || "unknown",
    status,
    qualityScore: num(qualityScore),
    cooldownUntil,
    rankPenalty: num(rankPenalty),
    reasons,
    recoveryConditions: buildRecoveryConditions(reasonCodes),
    evidence: {
      lookbackHours: recentWindowHours,
      blockedCount,
      badFillCount,
      stopLimitStuckCount: stuckCount,
      lowDataQualityCount: lowDataCount,
      badVetoCount,
      badExitQualityCount: badExitCount,
      cleanEvidenceCount,
      totalEvidence
    },
    universeScorerHint: {
      applyRankPenalty: num(rankPenalty),
      autoIncreaseAllowed: false
    },
    scanPlannerHint: {
      cooldownUntil,
      diagnosticsOnly: true
    },
    warnings,
    diagnosticsOnly: true,
    liveBehaviorChanged: false,
    autoPromotesRanking: false,
    generatedAt: new Date(safeNowMs).toISOString()
  };
}

export function buildSymbolQualityDecaySummary({ symbols = [], bySymbol = {}, now = null } = {}) {
  const currentTime = now || new Date().toISOString();
  const items = arr(symbols).map((symbol) => bySymbol?.[symbol] || buildSymbolQualityDecay({ symbol, now: currentTime }));
  const penalized = items.filter((item) => safeNumber(item.rankPenalty, 0) > 0);
  const coolingDown = items.filter((item) => item.cooldownUntil);
  return {
    status: coolingDown.length ? "cooldown" : penalized.length ? "watch" : items.length ? "healthy" : "unavailable",
    generatedAt: currentTime,
    trackedSymbols: items.length,
    penalizedCount: penalized.length,
    coolingDownCount: coolingDown.length,
    symbols: items.map((item) => ({
      symbol: item.symbol,
      status: item.status,
      qualityScore: item.qualityScore,
      rankPenalty: item.rankPenalty,
      cooldownUntil: item.cooldownUntil,
      reasons: arr(item.reasons).map((reason) => reason.code || reason).slice(0, 5)
    })),
    warnings: unique(items.flatMap((item) => arr(item.warnings)))
  };
}
