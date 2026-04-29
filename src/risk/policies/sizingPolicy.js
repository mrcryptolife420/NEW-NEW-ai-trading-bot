function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

export function buildSizingPolicySummary({
  groupedSizing = null,
  finalQuoteAmount = 0,
  effectiveMinTradeUsdt = 0,
  meaningfulSizeFloor = 0,
  paperSizeFloorReason = null,
  entryMode = "standard",
  policyProfile = null
} = {}) {
  const groups = Array.isArray(groupedSizing?.groups) ? groupedSizing.groups : [];
  const findGroup = (id) => groups.find((group) => group.id === id) || null;
  return {
    baseSize: num(groupedSizing?.baseBudget || 0, 2),
    finalQuoteAmount: num(finalQuoteAmount, 2),
    effectiveMinTradeUsdt: num(effectiveMinTradeUsdt, 2),
    meaningfulSizeFloor: num(meaningfulSizeFloor, 2),
    paperBootstrapFloorLift: paperSizeFloorReason
      ? {
          active: true,
          reason: paperSizeFloorReason,
          probeMode: entryMode
        }
      : {
          active: false,
          reason: null,
          probeMode: entryMode
        },
    policyProfile: policyProfile
      ? {
          status: policyProfile.status || "default",
          appliedScopes: Array.isArray(policyProfile.appliedScopes) ? policyProfile.appliedScopes : [],
          thresholdShift: num(policyProfile.profile?.thresholdShift || 0, 4),
          sizeBias: num(policyProfile.profile?.sizeBias || 1, 4),
          opportunityBias: num(policyProfile.profile?.opportunityBias || 0, 4)
        }
      : null,
    components: {
      alphaConviction: findGroup("alpha_conviction"),
      executionPressure: findGroup("execution_pressure"),
      portfolioPressure: findGroup("portfolio_pressure"),
      governancePressure: findGroup("governance_pressure"),
      paperBootstrap: findGroup("paper_bootstrap_floor")
    }
  };
}
