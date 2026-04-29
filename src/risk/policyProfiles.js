function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_PROFILE = {
  id: "default",
  label: "Default policy",
  thresholdShift: 0,
  alphaEdgeBoost: 0,
  governanceDragBias: 0,
  sizeBias: 1,
  opportunityBias: 0,
  executionAggressivenessBias: 0,
  exitHoldBias: 0,
  notes: []
};

const PROFILE_CATALOG = {
  family: {
    breakout: {
      id: "family:breakout",
      label: "Breakout family",
      thresholdShift: -0.004,
      alphaEdgeBoost: 0.02,
      sizeBias: 1.03,
      executionAggressivenessBias: 0.04,
      notes: ["Breakout families krijgen iets meer ruimte bij bevestigde continuation context."]
    },
    mean_reversion: {
      id: "family:mean_reversion",
      label: "Mean reversion family",
      thresholdShift: 0.003,
      governanceDragBias: 0.01,
      sizeBias: 0.96,
      executionAggressivenessBias: -0.03,
      notes: ["Mean reversion blijft voorzichtiger wanneer edge brozer is."]
    },
    range_grid: {
      id: "family:range_grid",
      label: "Range-grid family",
      thresholdShift: 0.004,
      sizeBias: 0.94,
      governanceDragBias: 0.015,
      notes: ["Range-grid wordt iets strenger buiten ideale range-context."]
    }
  },
  strategy: {
    market_structure_break: {
      id: "strategy:market_structure_break",
      label: "Market structure break",
      thresholdShift: -0.003,
      alphaEdgeBoost: 0.018,
      sizeBias: 1.04,
      executionAggressivenessBias: 0.03
    },
    ema_trend: {
      id: "strategy:ema_trend",
      label: "EMA trend",
      thresholdShift: -0.002,
      alphaEdgeBoost: 0.012,
      sizeBias: 1.02,
      exitHoldBias: 0.03
    },
    zscore_reversion: {
      id: "strategy:zscore_reversion",
      label: "Z-score reversion",
      thresholdShift: 0.002,
      governanceDragBias: 0.008,
      sizeBias: 0.97,
      exitHoldBias: -0.02
    }
  },
  regime: {
    trend: {
      id: "regime:trend",
      label: "Trend regime",
      thresholdShift: -0.003,
      alphaEdgeBoost: 0.014,
      sizeBias: 1.03,
      opportunityBias: 0.018
    },
    range: {
      id: "regime:range",
      label: "Range regime",
      thresholdShift: 0.002,
      governanceDragBias: 0.008,
      sizeBias: 0.96,
      opportunityBias: -0.01
    },
    high_vol: {
      id: "regime:high_vol",
      label: "High-vol regime",
      thresholdShift: 0.003,
      governanceDragBias: 0.016,
      sizeBias: 0.94,
      executionAggressivenessBias: -0.02
    }
  },
  session: {
    us: {
      id: "session:us",
      label: "US session",
      thresholdShift: -0.002,
      sizeBias: 1.02,
      opportunityBias: 0.012
    },
    asia: {
      id: "session:asia",
      label: "Asia session",
      thresholdShift: 0.002,
      governanceDragBias: 0.008,
      sizeBias: 0.96,
      executionAggressivenessBias: -0.02
    },
    off_hours: {
      id: "session:off_hours",
      label: "Off-hours session",
      thresholdShift: 0.003,
      governanceDragBias: 0.01,
      sizeBias: 0.93,
      executionAggressivenessBias: -0.03
    }
  },
  condition: {
    breakout_release: {
      id: "condition:breakout_release",
      label: "Breakout release",
      thresholdShift: -0.005,
      alphaEdgeBoost: 0.024,
      sizeBias: 1.06,
      opportunityBias: 0.03,
      executionAggressivenessBias: 0.05,
      exitHoldBias: 0.05
    },
    trend_continuation: {
      id: "condition:trend_continuation",
      label: "Trend continuation",
      thresholdShift: -0.003,
      alphaEdgeBoost: 0.016,
      sizeBias: 1.03,
      exitHoldBias: 0.04
    },
    low_liquidity_caution: {
      id: "condition:low_liquidity_caution",
      label: "Low liquidity caution",
      thresholdShift: 0.004,
      governanceDragBias: 0.02,
      sizeBias: 0.9,
      opportunityBias: -0.02,
      executionAggressivenessBias: -0.05
    },
    range_acceptance: {
      id: "condition:range_acceptance",
      label: "Range acceptance",
      thresholdShift: 0.002,
      sizeBias: 0.95,
      exitHoldBias: -0.02
    }
  }
};

function resolveCatalogEntry(scopeType, scopeId) {
  if (!scopeId) {
    return null;
  }
  return PROFILE_CATALOG?.[scopeType]?.[scopeId] || null;
}

function mergeProfiles(base = {}, next = {}) {
  return {
    ...base,
    thresholdShift: safeNumber(base.thresholdShift, 0) + safeNumber(next.thresholdShift, 0),
    alphaEdgeBoost: safeNumber(base.alphaEdgeBoost, 0) + safeNumber(next.alphaEdgeBoost, 0),
    governanceDragBias: safeNumber(base.governanceDragBias, 0) + safeNumber(next.governanceDragBias, 0),
    sizeBias: safeNumber(base.sizeBias, 1) * safeNumber(next.sizeBias, 1),
    opportunityBias: safeNumber(base.opportunityBias, 0) + safeNumber(next.opportunityBias, 0),
    executionAggressivenessBias: safeNumber(base.executionAggressivenessBias, 0) + safeNumber(next.executionAggressivenessBias, 0),
    exitHoldBias: safeNumber(base.exitHoldBias, 0) + safeNumber(next.exitHoldBias, 0),
    notes: [...new Set([...(base.notes || []), ...(next.notes || [])])]
  };
}

export function resolvePolicyProfile({
  botMode = "paper",
  strategySummary = {},
  regimeSummary = {},
  sessionSummary = {},
  marketConditionSummary = {}
} = {}) {
  const scopes = [
    { scopeType: "family", scopeId: strategySummary.family || null },
    { scopeType: "strategy", scopeId: strategySummary.activeStrategy || strategySummary.strategyId || null },
    { scopeType: "regime", scopeId: regimeSummary.regime || null },
    { scopeType: "session", scopeId: sessionSummary.session || null },
    { scopeType: "condition", scopeId: marketConditionSummary.conditionId || null }
  ];
  const applied = scopes
    .map(({ scopeType, scopeId }) => {
      const entry = resolveCatalogEntry(scopeType, scopeId);
      return entry ? { scopeType, scopeId, ...entry } : null;
    })
    .filter(Boolean);

  let merged = { ...DEFAULT_PROFILE };
  for (const profile of applied) {
    merged = mergeProfiles(merged, profile);
  }

  const liveDamp = botMode === "live" ? 0.45 : 1;
  const paperBoost = botMode === "paper" ? 1 : 0;
  const resolved = {
    id: merged.id || "default",
    label: merged.label || "Default policy",
    thresholdShift: num(clamp(safeNumber(merged.thresholdShift, 0) * liveDamp, -0.01, 0.01), 4),
    alphaEdgeBoost: num(clamp(safeNumber(merged.alphaEdgeBoost, 0) * (botMode === "live" ? 0.6 : 1), -0.04, 0.05), 4),
    governanceDragBias: num(clamp(safeNumber(merged.governanceDragBias, 0) * (botMode === "live" ? 1.1 : 1), -0.02, 0.04), 4),
    sizeBias: num(clamp(1 + (safeNumber(merged.sizeBias, 1) - 1) * (botMode === "live" ? 0.5 : 1), 0.88, 1.12), 4),
    opportunityBias: num(clamp(safeNumber(merged.opportunityBias, 0) * (paperBoost ? 1 : 0.65), -0.04, 0.05), 4),
    executionAggressivenessBias: num(clamp(safeNumber(merged.executionAggressivenessBias, 0) * (botMode === "live" ? 0.5 : 1), -0.08, 0.08), 4),
    exitHoldBias: num(clamp(safeNumber(merged.exitHoldBias, 0) * (botMode === "live" ? 0.6 : 1), -0.08, 0.08), 4),
    notes: [...new Set(merged.notes || [])].slice(0, 6)
  };

  return {
    status: applied.length ? "scoped" : "default",
    botMode,
    appliedScopes: applied.map((item) => ({
      scopeType: item.scopeType,
      scopeId: item.scopeId,
      id: item.id || null,
      label: item.label || null
    })),
    profile: resolved
  };
}
