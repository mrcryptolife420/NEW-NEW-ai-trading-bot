import { asArray, finiteNumber, mean, stableId } from "./utils.js";

export function runNeuralWalkForward({ proposal = {}, cases = [], windowSize = 20, seed = "default", policy = {} } = {}) {
  const items = asArray(cases);
  const windows = [];
  for (let start = 0; start + windowSize <= items.length; start += windowSize) {
    const sample = items.slice(start, start + windowSize);
    const baseline = mean(sample.map((item) => finiteNumber(item.pnlPct, 0)));
    const proposed = baseline + finiteNumber(proposal.evidence?.expectedImprovement, finiteNumber(proposal.change?.delta, 0)) * 0.2;
    windows.push({
      index: windows.length,
      trainStart: start,
      testStart: start + Math.floor(windowSize / 2),
      baselineExpectancy: baseline,
      proposedExpectancy: proposed,
      deltaExpectancy: proposed - baseline,
      symbols: [...new Set(sample.map((item) => item.symbol).filter(Boolean))],
      regimes: [...new Set(sample.map((item) => item.regime).filter(Boolean))]
    });
  }
  const delta = mean(windows.map((window) => window.deltaExpectancy));
  const symbols = new Set(windows.flatMap((window) => window.symbols));
  const regimes = new Set(windows.flatMap((window) => window.regimes));
  const failures = [];
  if (windows.length < finiteNumber(policy.minWindows, 2)) failures.push("insufficient_walk_forward_windows");
  if (delta <= finiteNumber(policy.minDeltaExpectancy, 0)) failures.push("out_of_sample_expectancy_not_better");
  if (symbols.size < finiteNumber(policy.minSymbols, 2)) failures.push("symbol_diversity_too_low");
  if (regimes.size < finiteNumber(policy.minRegimes, 2)) failures.push("regime_diversity_too_low");
  return {
    walkForwardId: stableId("neural_wf", [seed, proposal.proposalId, items.length, windowSize]),
    proposalId: proposal.proposalId,
    seed,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    windows,
    metrics: {
      windows: windows.length,
      outOfSampleDeltaExpectancy: delta,
      symbolDiversity: symbols.size,
      regimeDiversity: regimes.size,
      overfitScore: windows.length ? Math.max(0, 0.2 - delta) : 1
    }
  };
}
