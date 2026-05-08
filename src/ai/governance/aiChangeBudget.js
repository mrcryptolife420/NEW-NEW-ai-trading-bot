export function evaluateAiChangeBudget({ usage = {}, limits = {}, event = null } = {}) {
  const effectiveLimits = {
    dailyChanges: limits.dailyChanges ?? 5,
    weeklyChanges: limits.weeklyChanges ?? 20,
    dailyThresholdShift: limits.dailyThresholdShift ?? 0.05,
    weeklyThresholdShift: limits.weeklyThresholdShift ?? 0.12,
    dailySizeBiasShift: limits.dailySizeBiasShift ?? 0.2,
    activeExperiments: limits.activeExperiments ?? 3,
    modelPromotionsPerWeek: limits.modelPromotionsPerWeek ?? 1,
    autonomyIncreasePerPeriod: limits.autonomyIncreasePerPeriod ?? 1
  };
  const breaches = Object.entries(effectiveLimits)
    .filter(([key, limit]) => Number(usage[key] || 0) > Number(limit))
    .map(([key]) => key);
  const cooldown = Boolean(usage.rollbackCooldown || usage.drawdownCooldown || usage.calibrationBreachCooldown || usage.realityGapBreachCooldown);
  return {
    status: breaches.length || cooldown ? "blocked" : "available",
    breaches,
    cooldown,
    event,
    limits: effectiveLimits,
    usage,
    changeAllowed: breaches.length === 0 && !cooldown,
    approvalRequiredForBudgetIncrease: true,
    auditRequired: true
  };
}
