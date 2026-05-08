import { asArray, finiteNumber, mean, stableId } from "./utils.js";

function projectedPnl(record = {}, delta = 0) {
  const base = finiteNumber(record.pnlPct ?? record.netPnlPct, 0);
  const badVetoLift = record.label === "bad_rejection" ? Math.max(0, delta) * 2 : 0;
  const badEntryPenalty = record.label === "bad_entry" && delta < 0 ? Math.abs(delta) * 1.5 : 0;
  return base + badVetoLift - badEntryPenalty;
}

export function runFastNeuralReplay({ proposal = {}, cases = [], policy = {}, seed = "default" } = {}) {
  const delta = finiteNumber(proposal.change?.delta, 0);
  const items = asArray(cases);
  const baseline = items.map((item) => finiteNumber(item.pnlPct ?? item.netPnlPct, 0));
  const proposed = items.map((item) => projectedPnl(item, delta));
  const baselineExpectancy = mean(baseline);
  const proposedExpectancy = mean(proposed);
  const badEntryIncrease = proposed.filter((value, index) => value < 0 && baseline[index] >= 0).length;
  const badVetoReduction = items.filter((item) => item.label === "bad_rejection").length * Math.max(0, delta);
  const maxDrawdownDelta = Math.max(0, Math.abs(Math.min(0, ...proposed)) - Math.abs(Math.min(0, ...baseline)));
  const calibrationDelta = Math.abs(delta) * 0.1;
  const exposureDelta = finiteNumber(proposal.risk?.exposureDelta, 0);
  const riskAdjustedScore = proposedExpectancy - baselineExpectancy - maxDrawdownDelta - calibrationDelta - exposureDelta + badVetoReduction;
  const failures = [];
  if (items.length < finiteNumber(policy.minReplayCases, 5)) failures.push("insufficient_replay_cases");
  if (maxDrawdownDelta > finiteNumber(policy.maxDrawdownDelta, 0.01)) failures.push("drawdown_degradation");
  if (calibrationDelta > finiteNumber(policy.maxCalibrationDelta, 0.02)) failures.push("calibration_degradation");
  if (badEntryIncrease > finiteNumber(policy.maxBadEntryIncrease, 2)) failures.push("bad_entry_increase");
  return {
    replayResultId: stableId("neural_replay", [seed, proposal.proposalId, items.length, delta]),
    proposalId: proposal.proposalId,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    metrics: {
      totalCases: items.length,
      failedCases: failures.length,
      skippedCases: 0,
      baselineExpectancy,
      proposedExpectancy,
      deltaExpectancy: proposedExpectancy - baselineExpectancy,
      winRateDelta: winRate(proposed) - winRate(baseline),
      maxDrawdownDelta,
      calibrationDelta,
      badVetoReduction,
      badEntryIncrease,
      tradeFrequencyDelta: 0,
      exposureDelta,
      riskAdjustedScore,
      confidenceInterval: items.length ? 1 / Math.sqrt(items.length) : 1
    },
    liveSafe: {
      networkCalls: false,
      diskWritesPerCase: false,
      placesOrders: false
    }
  };
}

function winRate(values) {
  const finite = asArray(values).filter(Number.isFinite);
  return finite.length ? finite.filter((value) => value > 0).length / finite.length : 0;
}
