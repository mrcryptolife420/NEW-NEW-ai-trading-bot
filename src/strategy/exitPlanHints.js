function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildExitPlanHint({ setupType, features = {}, thesis = {}, config = {} } = {}) {
  const baseTimeStop = Math.max(5, Math.round(safeNumber(config.defaultTimeStopMinutes, 90)));
  const atrPct = safeNumber(features.atrPct ?? features.atrPercentile?.currentAtrPct, 0);
  const stopBuffer = atrPct > 0 ? `${Math.round(Math.max(atrPct * 10000, 10))}bps_atr_buffer` : "structure_buffer";
  const setup = `${setupType || thesis.setupType || "trend_continuation"}`.toLowerCase();
  const common = {
    stopBuffer,
    atrStopHint: atrPct > 0 ? "use_atr_buffer_for_noise" : "atr_unavailable_use_structure",
    diagnosticOnly: true
  };

  if (setup.includes("mean_reversion")) {
    return {
      initialStopType: "range_extreme_or_vwap_extension",
      timeStopMinutes: Math.min(baseTimeStop, 60),
      partialTakeProfitHint: "take_partial_near_vwap_or_range_mid",
      trailActivationHint: "trail_only_after_vwap_touch",
      hardInvalidation: "range_extreme_breaks_without_reclaim",
      structureStopHint: "outside_range_extreme",
      targetHint: "vwap_or_range_mid",
      ...common
    };
  }
  if (setup.includes("breakout_retest")) {
    return {
      initialStopType: "below_retest_low",
      timeStopMinutes: baseTimeStop,
      partialTakeProfitHint: "take_partial_at_next_resistance_or_1r",
      trailActivationHint: "activate_after_favorable_move_and_breakout_hold",
      hardInvalidation: "retest_low_lost_or_back_inside_range",
      structureStopHint: "below_retest_low_or_back_inside_prior_range",
      targetHint: "next_resistance_or_momentum_extension",
      ...common
    };
  }
  if (setup.includes("liquidity_sweep")) {
    return {
      initialStopType: "below_sweep_low",
      timeStopMinutes: Math.min(baseTimeStop, 75),
      partialTakeProfitHint: "take_partial_at_liquidity_magnet_or_vwap",
      trailActivationHint: "activate_after_reclaim_acceptance",
      hardInvalidation: "sweep_low_lost",
      structureStopHint: "below_sweep_low",
      targetHint: "liquidity_magnet_or_vwap",
      ...common
    };
  }
  if (setup.includes("vwap_reclaim")) {
    return {
      initialStopType: "below_vwap_reclaim_level",
      timeStopMinutes: Math.min(baseTimeStop, 80),
      partialTakeProfitHint: "take_partial_at_upper_vwap_band_or_recent_high",
      trailActivationHint: "activate_after_vwap_acceptance_and_new_high",
      hardInvalidation: "vwap_reclaim_lost",
      structureStopHint: "below_vwap_or_reclaim_level",
      targetHint: "upper_vwap_band_or_recent_high",
      ...common
    };
  }
  return {
    initialStopType: "structure_low_or_atr_trailing_buffer",
    timeStopMinutes: Math.max(baseTimeStop, 90),
    partialTakeProfitHint: "avoid_early_partial_until_favorable_move",
    trailActivationHint: "activate_only_after_favorable_move",
    hardInvalidation: "trend_structure_break_or_vwap_loss",
    structureStopHint: "below_structure_low_or_atr_buffer",
    targetHint: "trail_winners_after_favorable_move",
    ...common
  };
}
