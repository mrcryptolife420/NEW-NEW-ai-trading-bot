export function runWalkForwardOptimizer({ windows = [], minConsistency = 0.5 } = {}) {
  const results = windows.map((window, index) => {
    const train = Number(window.trainReturnPct) || 0;
    const test = Number(window.testReturnPct) || 0;
    return {
      index,
      trainReturnPct: train,
      testReturnPct: test,
      decayPct: train - test,
      drawdownPct: Number(window.drawdownPct) || 0,
      stable: test > 0 && Math.abs(train - test) <= Math.max(0.01, Math.abs(train) * 0.75)
    };
  });
  const consistency = results.length ? results.filter((result) => result.stable).length / results.length : 0;
  return {
    status: consistency >= minConsistency ? "usable" : "overfit_risk",
    consistency,
    results,
    blocksLivePromotion: consistency < minConsistency,
    report: {
      windows: results.length,
      performanceDecayAvg: results.reduce((sum, result) => sum + result.decayPct, 0) / Math.max(1, results.length)
    }
  };
}
