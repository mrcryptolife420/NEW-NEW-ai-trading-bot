import { clamp } from "../utils/math.js";

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function num(value, digits = 6) {
  return Number(finite(value, 0).toFixed(digits));
}

function pctDistanceBelow(entryPrice, levelPrice, bufferPct = 0) {
  const entry = finite(entryPrice, 0);
  const level = finite(levelPrice, 0);
  if (entry <= 0 || level <= 0 || level >= entry) {
    return 0;
  }
  return Math.max(0, (entry - level) / entry + bufferPct);
}

function pctDistanceAbove(entryPrice, levelPrice) {
  const entry = finite(entryPrice, 0);
  const level = finite(levelPrice, 0);
  if (entry <= 0 || level <= 0 || level <= entry) {
    return 0;
  }
  return (level - entry) / entry;
}

function resolveStrategyProfile(strategySummary = {}) {
  const family = strategySummary.family || strategySummary.strategyFamily || "unknown";
  const strategyId = strategySummary.activeStrategy || strategySummary.strategyId || strategySummary.id || "unknown";
  if (family === "breakout" || strategyId.includes("breakout")) {
    return {
      id: "breakout",
      atrStopMultiplier: 1.75,
      targetAtrMultiplier: 3.2,
      structureBufferPct: 0.0025,
      preferMomentumTarget: true
    };
  }
  if (strategyId === "trend_pullback_reclaim" || strategyId.includes("pullback") || strategyId.includes("reclaim")) {
    return {
      id: "trend_pullback_reclaim",
      atrStopMultiplier: 1.35,
      targetAtrMultiplier: 2.5,
      structureBufferPct: 0.0018,
      preferSweepStop: true
    };
  }
  if (family === "mean_reversion" || strategyId.includes("reversion")) {
    return {
      id: "mean_reversion",
      atrStopMultiplier: 1.05,
      targetAtrMultiplier: 1.55,
      structureBufferPct: 0.0012,
      preferVwapTarget: true
    };
  }
  if (family === "range_grid" || strategyId.includes("range_grid")) {
    return {
      id: "range_grid",
      atrStopMultiplier: 0.95,
      targetAtrMultiplier: 1.35,
      structureBufferPct: 0.001,
      preferRangeTarget: true
    };
  }
  return {
    id: family || "default",
    atrStopMultiplier: 1.25,
    targetAtrMultiplier: 2.0,
    structureBufferPct: 0.0015
  };
}

function chooseStopCandidate(profile, candidates, baseStopPct) {
  const usable = candidates.filter((item) => item.value > 0);
  if (!usable.length) {
    return {
      source: "fixed_fallback",
      value: baseStopPct
    };
  }
  if (profile.preferSweepStop) {
    const sweep = usable.find((item) => item.id === "liquidity_sweep");
    if (sweep) return sweep;
  }
  if (profile.id === "breakout") {
    return usable.sort((left, right) => right.value - left.value)[0];
  }
  if (["mean_reversion", "range_grid"].includes(profile.id)) {
    return usable.sort((left, right) => left.value - right.value)[0];
  }
  return usable.sort((left, right) => Math.abs(left.value - baseStopPct) - Math.abs(right.value - baseStopPct))[0];
}

function chooseTargetCandidate(profile, candidates, baseTakeProfitPct) {
  const usable = candidates.filter((item) => item.value > 0);
  if (!usable.length) {
    return {
      source: "fixed_fallback",
      value: baseTakeProfitPct
    };
  }
  if (profile.preferVwapTarget) {
    const vwap = usable.find((item) => item.id === "vwap_band");
    if (vwap) return vwap;
  }
  if (profile.preferRangeTarget) {
    const range = usable.find((item) => item.id === "resistance");
    if (range) return range;
  }
  if (profile.preferMomentumTarget) {
    return usable.sort((left, right) => right.value - left.value)[0];
  }
  return usable.sort((left, right) => Math.abs(left.value - baseTakeProfitPct) - Math.abs(right.value - baseTakeProfitPct))[0];
}

export function buildDynamicExitLevels({
  config = {},
  botMode = "paper",
  marketSnapshot = {},
  strategySummary = {},
  entryPrice = 0,
  baseStopPct = 0,
  baseTakeProfitPct = 0
} = {}) {
  const enabled = Boolean(config.enableDynamicExitLevels);
  const paperOnly = config.dynamicExitPaperOnly !== false;
  const mode = botMode || config.botMode || "paper";
  const liveMode = mode === "live";
  const market = marketSnapshot.market || {};
  const book = marketSnapshot.book || {};
  const entry = finite(entryPrice, finite(book.ask, finite(book.mid, finite(market.close, 0))));
  const baseStop = clamp(finite(baseStopPct, finite(config.stopLossPct, 0.018)), 0.001, 0.2);
  const baseTakeProfit = clamp(finite(baseTakeProfitPct, finite(config.takeProfitPct, 0.03)), 0.001, 0.5);
  const maxStopMultiplier = clamp(finite(config.maxDynamicStopMultiplier, 1.6), 1, 4);
  const minRiskReward = clamp(finite(config.minRiskReward, 1.35), 0.5, 10);
  const maxStopPct = clamp(baseStop * maxStopMultiplier, baseStop, 0.2);
  const profile = resolveStrategyProfile(strategySummary);
  const atrPct = clamp(finite(market.atrPct, finite(market.realizedVolPct, 0) * 0.65), 0, 0.25);
  const spreadFloor = clamp(finite(book.spreadBps, 0) / 10_000 * 3, 0, 0.02);
  const minViableStopPct = clamp(Math.max(0.003, spreadFloor, atrPct * 0.35), 0.001, maxStopPct);
  const structureStopPct = clamp(
    pctDistanceBelow(entry, market.swingLowPrice, profile.structureBufferPct) ||
      pctDistanceBelow(entry, market.donchianLower, profile.structureBufferPct),
    0,
    maxStopPct
  );
  const vwapGapPct = Math.max(
    0,
    finite(market.vwapGapPct, 0) / Math.max(1 + finite(market.vwapGapPct, 0), 0.2),
    finite(market.vwapLowerBandDistancePct, 0)
  );
  const vwapInvalidationStopPct = clamp(vwapGapPct + 0.001, 0, maxStopPct);
  const sweepStopPct = market.liquiditySweepLabel === "bullish_sweep" || finite(market.liquiditySweepScore, 0) > 0.45
    ? clamp(
        pctDistanceBelow(entry, market.lastLowPrice, profile.structureBufferPct) ||
          pctDistanceBelow(entry, market.donchianLower, profile.structureBufferPct),
        0,
        maxStopPct
      )
    : 0;
  const atrStopPct = clamp(Math.max(minViableStopPct, atrPct * profile.atrStopMultiplier), 0, maxStopPct);
  const stopCandidate = chooseStopCandidate(profile, [
    { id: "atr", value: atrStopPct },
    { id: "structure", value: structureStopPct },
    { id: "vwap_invalidation", value: vwapInvalidationStopPct },
    { id: "liquidity_sweep", value: sweepStopPct }
  ], baseStop);
  const suggestedStopPct = clamp(Math.max(minViableStopPct, stopCandidate.value), 0.001, maxStopPct);
  const targetByResistancePct = clamp(
    pctDistanceAbove(entry, market.resistancePrice) ||
      pctDistanceAbove(entry, market.donchianUpper) ||
      finite(market.rangeTopDistancePct, 0),
    0,
    0.5
  );
  const targetByAtrPct = clamp(Math.max(baseTakeProfit * 0.5, atrPct * profile.targetAtrMultiplier), 0, 0.5);
  const targetByVwapBandPct = clamp(
    finite(market.vwapUpperBandDistancePct, 0) ||
      Math.max(0, -finite(market.vwapGapPct, 0)) ||
      finite(market.rangeTopDistancePct, 0) * 0.55,
    0,
    0.5
  );
  const targetCandidate = chooseTargetCandidate(profile, [
    { id: "resistance", value: targetByResistancePct },
    { id: "atr", value: targetByAtrPct },
    { id: "vwap_band", value: targetByVwapBandPct }
  ], baseTakeProfit);
  const rrFloor = suggestedStopPct * minRiskReward;
  const suggestedTakeProfitPct = clamp(Math.max(targetCandidate.value, rrFloor), 0.001, 0.5);
  const paperApplies = enabled && mode === "paper";
  const liveDiagnosticsOnly = enabled && liveMode && paperOnly;
  const liveConservativeOnly = enabled && liveMode && !paperOnly;
  const effectiveStopPct = paperApplies
    ? suggestedStopPct
    : liveConservativeOnly
      ? Math.min(baseStop, suggestedStopPct)
      : baseStop;
  const effectiveTakeProfitPct = paperApplies ? suggestedTakeProfitPct : baseTakeProfit;
  const appliedMode = !enabled
    ? "disabled"
    : paperApplies
      ? "paper_dynamic"
      : liveDiagnosticsOnly
        ? "live_diagnostics_only"
        : liveConservativeOnly
          ? "live_conservative_tightening"
          : "fixed_fallback";
  return {
    enabled,
    applied: paperApplies || (liveConservativeOnly && effectiveStopPct < baseStop),
    appliedMode,
    strategyProfile: profile.id,
    paperOnly,
    baseStopPct: num(baseStop),
    baseTakeProfitPct: num(baseTakeProfit),
    atrStopPct: num(atrStopPct),
    structureStopPct: num(structureStopPct),
    vwapInvalidationStopPct: num(vwapInvalidationStopPct),
    liquiditySweepStopPct: num(sweepStopPct),
    minViableStopPct: num(minViableStopPct),
    suggestedStopPct: num(suggestedStopPct),
    targetByResistancePct: num(targetByResistancePct),
    targetByAtrPct: num(targetByAtrPct),
    targetByVwapBandPct: num(targetByVwapBandPct),
    suggestedTakeProfitPct: num(suggestedTakeProfitPct),
    effectiveStopPct: num(effectiveStopPct),
    effectiveTakeProfitPct: num(effectiveTakeProfitPct),
    maxDynamicStopPct: num(maxStopPct),
    minRiskReward: num(minRiskReward),
    stopSource: stopCandidate.id || stopCandidate.source || null,
    targetSource: targetCandidate.id || targetCandidate.source || null,
    riskReward: num(effectiveStopPct > 0 ? effectiveTakeProfitPct / effectiveStopPct : 0),
    notes: [
      enabled ? "dynamic_exit_levels_enabled" : "dynamic_exit_levels_disabled",
      paperApplies ? "paper_uses_dynamic_levels" : null,
      liveDiagnosticsOnly ? "live_logs_only_fixed_levels_preserved" : null,
      liveConservativeOnly ? "live_can_only_tighten_stop" : null,
      suggestedTakeProfitPct <= rrFloor + 1e-9 ? "min_risk_reward_floor_applied" : null
    ].filter(Boolean)
  };
}
