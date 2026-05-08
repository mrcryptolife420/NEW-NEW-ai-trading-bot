function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function addScore(state, symbol, reason, score) {
  if (!symbol) return;
  const key = `${symbol}`.toUpperCase();
  if (!state.has(key)) state.set(key, { symbol: key, score: 0, reasons: [] });
  const item = state.get(key);
  item.score += score;
  item.reasons.push(reason);
}

export function buildHotSymbolLane({ openPositions = [], candidates = [], marketChanges = {}, maxSymbols = 12 } = {}) {
  const state = new Map();
  for (const position of Array.isArray(openPositions) ? openPositions : []) {
    addScore(state, position.symbol, "open_position_exit_priority", 100);
  }
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const probability = finite(candidate.probability, 0);
    const threshold = finite(candidate.threshold || candidate.effectiveThreshold, 1);
    const gap = threshold - probability;
    if (gap >= 0 && gap <= threshold * 0.02) addScore(state, candidate.symbol, "within_2pct_threshold", 80);
    else if (gap >= 0 && gap <= threshold * 0.05) addScore(state, candidate.symbol, "within_5pct_threshold", 55);
    if (candidate.allow) addScore(state, candidate.symbol, "approved_candidate", 45);
    if (candidate.rootBlocker) addScore(state, candidate.symbol, `blocked_${candidate.rootBlocker}`, 10);
  }
  for (const [symbol, change] of Object.entries(marketChanges || {})) {
    if (finite(change.volumeSpikeScore, 0) > 0.7) addScore(state, symbol, "volume_spike", 35);
    if (finite(change.spreadImprovementBps, 0) > 0) addScore(state, symbol, "spread_became_acceptable", 25);
    if (finite(change.bookPressureTurn, 0) > 0.4) addScore(state, symbol, "book_pressure_positive_turn", 30);
    if (change.levelBreak === true) addScore(state, symbol, "key_level_break", 40);
    if (change.newsRiskChanged === true) addScore(state, symbol, "news_event_risk_changed", 30);
    if (change.volatilityRegimeChanged === true) addScore(state, symbol, "volatility_regime_changed", 25);
    if (finite(change.modelScoreDelta, 0) > 0.05) addScore(state, symbol, "model_score_rising_fast", 30);
  }
  const hotSymbols = [...state.values()]
    .map((item) => ({ ...item, reasons: [...new Set(item.reasons)] }))
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(1, finite(maxSymbols, 12)));
  return {
    status: hotSymbols.length ? "active" : "empty",
    hotSymbols,
    maxSymbols: Math.max(1, finite(maxSymbols, 12)),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
