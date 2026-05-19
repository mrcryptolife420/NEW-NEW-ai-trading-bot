const HARD_BLOCKERS = new Set(["exchange_safety_blocked", "hard_inventory_conflict", "manual_review_required", "protection_missing"]);

function classifyNoTradeCycle({ candidates = [], blockers = [] } = {}) {
  const reasons = blockers.map((blocker) => blocker.reason || blocker);
  const hardBlocked = reasons.some((reason) => HARD_BLOCKERS.has(reason));
  return {
    candidateCount: candidates.length,
    hardBlocked,
    classification: hardBlocked ? "valid_no_trade_hard_safety" : candidates.length > 0 ? "possible_false_negative" : "no_candidates"
  };
}

function labelFalseNegative(cycle = {}, outcome = {}) {
  return {
    ...cycle,
    falseNegative: cycle.classification === "possible_false_negative" && Number(outcome.moveBps || 0) > 50,
    outcomeMoveBps: Number(outcome.moveBps || 0)
  };
}

function proposePaperRecoveryProbe(label = {}) {
  if (!label.falseNegative || label.hardBlocked) {
    return { allowed: false, blockers: label.hardBlocked ? ["hard_safety_blocker"] : ["not_false_negative"] };
  }
  return { allowed: true, mode: "paper", maxRiskPct: 0.1, reason: "false_negative_learning_probe" };
}

export { classifyNoTradeCycle, labelFalseNegative, proposePaperRecoveryProbe };
