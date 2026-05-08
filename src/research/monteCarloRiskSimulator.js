function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rng(seed = 1) {
  let state = Math.abs(Math.trunc(n(seed, 1))) || 1;
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export function simulateMonteCarloRisk({ trades = [], iterations = 1000, seed = 1, startingEquity = 1 } = {}) {
  const random = rng(seed);
  const returns = trades.map((trade) => n(trade.netPnlPct ?? trade.pnlPct, 0));
  const curves = [];
  const maxIterations = Math.max(1, Math.min(5000, Math.trunc(n(iterations, 1000))));
  for (let i = 0; i < maxIterations; i += 1) {
    let equity = n(startingEquity, 1);
    let peak = equity;
    let maxDrawdown = 0;
    let lossStreak = 0;
    let maxLossStreak = 0;
    for (let j = 0; j < returns.length; j += 1) {
      const sampled = returns[Math.floor(random() * returns.length)] ?? 0;
      const shock = (random() - 0.5) * 0.002;
      equity *= 1 + sampled + shock;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
      lossStreak = sampled < 0 ? lossStreak + 1 : 0;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
    curves.push({ finalEquity: equity, maxDrawdown, maxLossStreak });
  }
  const sorted = curves.map((curve) => curve.finalEquity).sort((a, b) => a - b);
  const drawdowns = curves.map((curve) => curve.maxDrawdown).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? n(startingEquity, 1);
  const worst5 = sorted[Math.floor(sorted.length * 0.05)] ?? n(startingEquity, 1);
  const ruin = curves.filter((curve) => curve.finalEquity <= n(startingEquity, 1) * 0.7).length / curves.length;
  return {
    iterations: maxIterations,
    medianOutcome: median,
    worst5PctOutcome: worst5,
    maxDrawdownP95: drawdowns[Math.floor(drawdowns.length * 0.95)] ?? 0,
    riskOfRuin: ruin,
    probabilityOfLossStreak: curves.filter((curve) => curve.maxLossStreak >= 4).length / curves.length,
    recommendedPositionFraction: ruin > 0.1 ? 0.25 : ruin > 0.03 ? 0.5 : 1,
    livePromotionBlocked: ruin > 0.08
  };
}
