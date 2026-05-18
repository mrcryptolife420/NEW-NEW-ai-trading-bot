const ROOT_CAUSES = {
  data_quality: {
    severity: "degraded",
    recoverability: "recoverable",
    operatorAction: "Inspect provider freshness and request-budget pressure.",
    reasons: ["quality_quorum_degraded", "data_quorum_observe_only", "market_data_stale", "provider_cooldown"]
  },
  model_confidence: {
    severity: "soft_block",
    recoverability: "learn_or_wait",
    operatorAction: "Review model confidence breakdown and paper evidence.",
    reasons: ["model_confidence_too_low", "meta_neural_caution", "feature_trust_low"]
  },
  strategy_fit: {
    severity: "soft_block",
    recoverability: "market_dependent",
    operatorAction: "Wait for cleaner setup or inspect strategy context mismatch.",
    reasons: ["strategy_context_mismatch", "anti_chop_context_filter", "breakout_fakeout_risk", "bearish_pattern_stack"]
  },
  execution_cost: {
    severity: "degraded",
    recoverability: "market_dependent",
    operatorAction: "Inspect spread, slippage and execution cost budget.",
    reasons: ["execution_cost_budget_blocked", "net_edge_negative", "spread_too_wide"]
  },
  live_safety: {
    severity: "hard_block",
    recoverability: "operator_review",
    operatorAction: "Resolve live safety, exchange truth or manual review before entries.",
    reasons: ["exchange_safety_blocked", "manual_review_required", "reconcile_required", "live_acknowledgement_missing"]
  },
  capital: {
    severity: "hard_block",
    recoverability: "cooldown_or_review",
    operatorAction: "Review capital governor, drawdown and recovery state.",
    reasons: ["capital_governor_blocked", "daily_loss_lock", "risk_of_ruin_high"]
  }
};

export function classifyBlockerReason(reason) {
  const id = `${reason || ""}`;
  for (const [rootCause, descriptor] of Object.entries(ROOT_CAUSES)) {
    if (descriptor.reasons.some((item) => id === item || id.includes(item))) {
      return {
        reason: id,
        rootCause,
        severity: descriptor.severity,
        recoverability: descriptor.recoverability,
        operatorAction: descriptor.operatorAction
      };
    }
  }
  return {
    reason: id,
    rootCause: "uncategorized",
    severity: "unknown",
    recoverability: "inspect",
    operatorAction: "Inspect decision details and add a reason registry mapping."
  };
}

export function buildBlockerRootCauseSummary(reasons = []) {
  const counts = new Map();
  const details = [];
  for (const item of reasons || []) {
    const reason = typeof item === "string" ? item : item?.id || item?.reason;
    const count = Number(typeof item === "object" ? item.count || 1 : 1);
    const classified = classifyBlockerReason(reason);
    details.push({ ...classified, count });
    counts.set(classified.rootCause, (counts.get(classified.rootCause) || 0) + count);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[0] || "none";
  const primaryDescriptor = ROOT_CAUSES[primary] || null;
  return {
    status: primary === "none" ? "clear" : primaryDescriptor?.severity === "hard_block" ? "blocked" : "degraded",
    primary,
    ranked: ranked.map(([rootCause, count]) => ({ rootCause, count })),
    details,
    nextBestAction: primaryDescriptor?.operatorAction || "No blockers detected."
  };
}
