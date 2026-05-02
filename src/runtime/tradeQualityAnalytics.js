import { clamp } from "../utils/math.js";
import { minutesBetween } from "../utils/time.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function resolveAtMs(at) {
  const ms = new Date(at || 0).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function resolveMinutesSinceEntry(position = {}, at) {
  if (!position.entryAt && !position.entryTime) {
    return null;
  }
  const entryAt = position.entryAt || new Date(position.entryTime).toISOString();
  const minutes = minutesBetween(entryAt, at);
  return Number.isFinite(minutes) ? num(Math.max(0, minutes), 2) : null;
}

function resolveTradeMfePct(trade = {}) {
  if (Number.isFinite(Number(trade.maximumFavorableExcursionPct))) {
    return Number(trade.maximumFavorableExcursionPct);
  }
  if (Number.isFinite(Number(trade.mfePct))) {
    return Number(trade.mfePct);
  }
  const entry = safeNumber(trade.entryPrice, 0);
  const best = safeNumber(trade.bestPossibleExitPrice, safeNumber(trade.highestPrice, 0));
  return entry > 0 && best > 0 ? Math.max(0, (best - entry) / entry) : 0;
}

function resolveTradeMaePct(trade = {}) {
  if (Number.isFinite(Number(trade.maximumAdverseExcursionPct))) {
    return Number(trade.maximumAdverseExcursionPct);
  }
  if (Number.isFinite(Number(trade.maePct))) {
    return Number(trade.maePct);
  }
  const entry = safeNumber(trade.entryPrice, 0);
  const worst = safeNumber(trade.worstAdversePrice, safeNumber(trade.lowestPrice, 0));
  return entry > 0 && worst > 0 ? Math.min(0, (worst - entry) / entry) : 0;
}

export function initializePositionExcursionTracking(position = {}, { price = null, at = null } = {}) {
  const entryPrice = safeNumber(position.entryPrice, safeNumber(price, 0));
  if (!entryPrice || !position) {
    return position;
  }
  position.highestPrice = safeNumber(position.highestPrice, entryPrice) || entryPrice;
  position.lowestPrice = safeNumber(position.lowestPrice, entryPrice) || entryPrice;
  position.bestPossibleExitPrice = safeNumber(position.bestPossibleExitPrice, position.highestPrice);
  position.worstAdversePrice = safeNumber(position.worstAdversePrice, position.lowestPrice);
  position.maximumFavorableExcursionPct = num(Math.max(0, (position.bestPossibleExitPrice - entryPrice) / entryPrice), 6);
  position.maximumAdverseExcursionPct = num(Math.min(0, (position.worstAdversePrice - entryPrice) / entryPrice), 6);
  position.timeToMfeMinutes = position.timeToMfeMinutes ?? resolveMinutesSinceEntry(position, at || position.entryAt);
  position.timeToMaeMinutes = position.timeToMaeMinutes ?? resolveMinutesSinceEntry(position, at || position.entryAt);
  return position;
}

export function updateOpenPositionExcursion(position = {}, {
  price = null,
  highPrice = null,
  lowPrice = null,
  at = null
} = {}) {
  if (!position || !safeNumber(position.entryPrice, 0)) {
    return position;
  }
  initializePositionExcursionTracking(position, { price, at });
  const entryPrice = safeNumber(position.entryPrice, 0);
  const high = Math.max(
    safeNumber(highPrice, Number.NEGATIVE_INFINITY),
    safeNumber(price, Number.NEGATIVE_INFINITY),
    safeNumber(position.highestPrice, entryPrice)
  );
  const low = Math.min(
    safeNumber(lowPrice, Number.POSITIVE_INFINITY),
    safeNumber(price, Number.POSITIVE_INFINITY),
    safeNumber(position.lowestPrice, entryPrice)
  );
  if (Number.isFinite(high) && high > safeNumber(position.highestPrice, entryPrice)) {
    position.highestPrice = high;
    position.bestPossibleExitPrice = high;
    position.timeToMfeMinutes = resolveMinutesSinceEntry(position, at);
  }
  if (Number.isFinite(low) && low < safeNumber(position.lowestPrice, entryPrice)) {
    position.lowestPrice = low;
    position.worstAdversePrice = low;
    position.timeToMaeMinutes = resolveMinutesSinceEntry(position, at);
  }
  position.maximumFavorableExcursionPct = num(Math.max(0, (safeNumber(position.highestPrice, entryPrice) - entryPrice) / entryPrice), 6);
  position.maximumAdverseExcursionPct = num(Math.min(0, (safeNumber(position.lowestPrice, entryPrice) - entryPrice) / entryPrice), 6);
  return position;
}

export function buildExcursionAnalyticsFromCandles({
  entryPrice = 0,
  entryAt = null,
  exitAt = null,
  candles = []
} = {}) {
  const entry = safeNumber(entryPrice, 0);
  if (!entry || !Array.isArray(candles) || !candles.length) {
    return {
      maximumFavorableExcursionPct: 0,
      maximumAdverseExcursionPct: 0,
      bestPossibleExitPrice: null,
      worstAdversePrice: null,
      timeToMfeMinutes: null,
      timeToMaeMinutes: null
    };
  }
  const entryMs = resolveAtMs(entryAt);
  const exitMs = resolveAtMs(exitAt);
  let best = entry;
  let worst = entry;
  let bestAt = null;
  let worstAt = null;
  for (const candle of candles) {
    const candleAt = safeNumber(candle.closeTime, safeNumber(candle.openTime, Number.NaN));
    if (Number.isFinite(entryMs) && Number.isFinite(candleAt) && candleAt < entryMs) {
      continue;
    }
    if (Number.isFinite(exitMs) && Number.isFinite(candleAt) && candleAt > exitMs) {
      continue;
    }
    const high = safeNumber(candle.high, safeNumber(candle.close, entry));
    const low = safeNumber(candle.low, safeNumber(candle.close, entry));
    if (high > best) {
      best = high;
      bestAt = candleAt;
    }
    if (low < worst) {
      worst = low;
      worstAt = candleAt;
    }
  }
  return {
    maximumFavorableExcursionPct: num(Math.max(0, (best - entry) / entry), 6),
    maximumAdverseExcursionPct: num(Math.min(0, (worst - entry) / entry), 6),
    bestPossibleExitPrice: num(best, 8),
    worstAdversePrice: num(worst, 8),
    timeToMfeMinutes: Number.isFinite(bestAt) && Number.isFinite(entryMs) ? num((bestAt - entryMs) / 60_000, 2) : null,
    timeToMaeMinutes: Number.isFinite(worstAt) && Number.isFinite(entryMs) ? num((worstAt - entryMs) / 60_000, 2) : null
  };
}

export function buildTradeQualityAnalytics({ position = {}, trade = {}, exitPrice = null, netPnlPct = null, reason = null, exitAt = null } = {}) {
  const entryPrice = safeNumber(trade.entryPrice, safeNumber(position.entryPrice, 0));
  const resolvedExitPrice = optionalNumber(exitPrice) ?? optionalNumber(trade.exitPrice) ?? 0;
  const resolvedNetPnlPct = optionalNumber(netPnlPct)
    ?? optionalNumber(trade.netPnlPct)
    ?? (entryPrice > 0 && resolvedExitPrice > 0 ? (resolvedExitPrice - entryPrice) / entryPrice : 0);
  const mfePct = resolveTradeMfePct({ ...position, ...trade });
  const maePct = resolveTradeMaePct({ ...position, ...trade });
  const exitEfficiencyPct = mfePct > 0 ? clamp(resolvedNetPnlPct / Math.max(mfePct, 1e-9), -1, 1.5) : (resolvedNetPnlPct > 0 ? 1 : 0);
  const gaveBackPct = Math.max(0, mfePct - resolvedNetPnlPct);
  const bestPossibleExitPrice = safeNumber(trade.bestPossibleExitPrice, safeNumber(position.bestPossibleExitPrice, safeNumber(position.highestPrice, entryPrice))) || null;
  const worstAdversePrice = safeNumber(trade.worstAdversePrice, safeNumber(position.worstAdversePrice, safeNumber(position.lowestPrice, entryPrice))) || null;
  const labels = classifyTradeQualityLabels({
    netPnlPct: resolvedNetPnlPct,
    mfePct,
    maePct,
    exitEfficiencyPct,
    gaveBackPct,
    reason: reason || trade.reason || trade.exitReason || null
  });
  return {
    maximumFavorableExcursionPct: num(mfePct, 6),
    maximumAdverseExcursionPct: num(maePct, 6),
    exitEfficiencyPct: num(exitEfficiencyPct, 6),
    gaveBackPct: num(gaveBackPct, 6),
    bestPossibleExitPrice: bestPossibleExitPrice == null ? null : num(bestPossibleExitPrice, 8),
    worstAdversePrice: worstAdversePrice == null ? null : num(worstAdversePrice, 8),
    timeToMfeMinutes: trade.timeToMfeMinutes ?? position.timeToMfeMinutes ?? null,
    timeToMaeMinutes: trade.timeToMaeMinutes ?? position.timeToMaeMinutes ?? null,
    tradeQualityLabel: labels[0] || "unclassified",
    tradeQualityLabels: labels
  };
}

export function classifyTradeQualityLabels({
  netPnlPct = 0,
  mfePct = 0,
  maePct = 0,
  exitEfficiencyPct = 0,
  gaveBackPct = 0,
  reason = null
} = {}) {
  const labels = [];
  const goodEntry = mfePct >= 0.008 || netPnlPct >= 0.004;
  const badEntry = mfePct < 0.004 && (maePct <= -0.01 || netPnlPct < -0.004);
  const goodExit = exitEfficiencyPct >= 0.45 || (netPnlPct > 0 && gaveBackPct <= Math.max(0.004, mfePct * 0.45));
  const badExit = gaveBackPct >= Math.max(0.006, mfePct * 0.65) || (mfePct >= 0.012 && exitEfficiencyPct < 0.28);
  if (goodEntry && goodExit) labels.push("good_entry_good_exit");
  if (goodEntry && badExit) labels.push("good_entry_bad_exit");
  if (badEntry && goodExit) labels.push("bad_entry_good_exit");
  if (badEntry && !goodExit) labels.push("bad_entry_bad_exit");
  if (netPnlPct >= 0 && mfePct >= 0.018 && exitEfficiencyPct < 0.35) labels.push("early_exit");
  if (netPnlPct <= 0 && mfePct >= 0.01 && gaveBackPct >= 0.012) labels.push("late_exit");
  if (["stop_loss", "protective_stop_loss", "trailing_stop"].includes(`${reason || ""}`) && mfePct >= 0.006 && netPnlPct < 0) labels.push("stop_too_tight");
  if (`${reason || ""}`.includes("take_profit") && mfePct >= Math.max(0.012, netPnlPct * 1.4) && exitEfficiencyPct < 0.72) labels.push("take_profit_too_close");
  return [...new Set(labels.length ? labels : [netPnlPct >= 0 ? "good_entry_good_exit" : "bad_entry_bad_exit"])];
}

export function buildTradePathQualitySummary(trades = []) {
  const closed = trades.filter((trade) => trade && trade.exitAt);
  const labelCounts = {};
  const enriched = closed.map((trade) => {
    const analytics = buildTradeQualityAnalytics({ trade });
    for (const label of analytics.tradeQualityLabels) {
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    }
    return { trade, analytics };
  });
  const weakest = [...enriched]
    .sort((left, right) => left.analytics.exitEfficiencyPct - right.analytics.exitEfficiencyPct || right.analytics.gaveBackPct - left.analytics.gaveBackPct)
    .slice(0, 6)
    .map(({ trade, analytics }) => ({
      id: trade.id || null,
      symbol: trade.symbol || null,
      netPnlPct: num(safeNumber(trade.netPnlPct, 0), 6),
      exitEfficiencyPct: analytics.exitEfficiencyPct,
      gaveBackPct: analytics.gaveBackPct,
      maximumFavorableExcursionPct: analytics.maximumFavorableExcursionPct,
      maximumAdverseExcursionPct: analytics.maximumAdverseExcursionPct,
      label: analytics.tradeQualityLabel,
      labels: analytics.tradeQualityLabels
    }));
  const avgExitEfficiency = average(enriched.map((item) => item.analytics.exitEfficiencyPct));
  return {
    status: closed.length < 5 ? "warmup" : avgExitEfficiency < 0.28 ? "exit_review" : "ready",
    tradeCount: closed.length,
    averageMfePct: num(average(enriched.map((item) => item.analytics.maximumFavorableExcursionPct)), 6),
    averageMaePct: num(average(enriched.map((item) => item.analytics.maximumAdverseExcursionPct)), 6),
    averageExitEfficiencyPct: num(avgExitEfficiency, 6),
    averageGaveBackPct: num(average(enriched.map((item) => item.analytics.gaveBackPct)), 6),
    labelCounts,
    weakestExitEfficiency: weakest,
    recommendedAction: avgExitEfficiency < 0.28
      ? "Review late exits, trailing protection and take-profit distance before changing entry thresholds."
      : "Keep monitoring MFE/MAE path quality; no immediate behavior change required."
  };
}
