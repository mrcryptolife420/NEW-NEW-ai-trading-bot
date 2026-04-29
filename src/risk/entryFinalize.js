function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

export function buildReasonProfiles(reasons = [], { classifyReasonCategory, reasonSeverity }) {
  const blockerCategoryCounts = reasons.reduce((acc, reason) => {
    const category = classifyReasonCategory(reason);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const reasonSeverityProfile = reasons.reduce((acc, reason) => {
    const severity = reasonSeverity(reason);
    if (severity >= 4) {
      acc.hard += 1;
    } else if (severity >= 3) {
      acc.medium += 1;
    } else {
      acc.soft += 1;
    }
    return acc;
  }, { hard: 0, medium: 0, soft: 0 });
  return {
    blockerCategoryCounts,
    reasonSeverityProfile
  };
}

export function buildPermissioningSummary({
  allow = false,
  reasons = [],
  hardSafetyBlockers = new Set(),
  classifyReasonCategory,
  blockerDecomposition = {},
  probeAdmission = {}
} = {}) {
  const normalizedReasons = [...new Set((reasons || []).filter(Boolean))];
  const hardSafetyReasons = normalizedReasons.filter((reason) => hardSafetyBlockers.has(reason));
  const alphaQualityReasons = normalizedReasons.filter((reason) => classifyReasonCategory(reason) === "quality");
  const governanceReasons = normalizedReasons.filter((reason) => ["governance", "event"].includes(classifyReasonCategory(reason)));
  const executionReasons = normalizedReasons.filter((reason) => classifyReasonCategory(reason) === "execution");
  const portfolioReasons = normalizedReasons.filter((reason) => ["risk", "regime"].includes(classifyReasonCategory(reason)));
  const downstreamSymptoms = [...new Set(blockerDecomposition.downstreamBlockers || [])];
  const primaryRootBlocker = blockerDecomposition.rootBlocker || normalizedReasons[0] || null;
  const probeEligibleSoftBlocked = Boolean(probeAdmission?.eligible);
  const probeActivated = Boolean(probeAdmission?.activated);
  const softBlockerOnly = Boolean(probeAdmission?.softBlockedOnly);
  const probeRejectedReason = probeAdmission?.probeRejectedReason || probeAdmission?.whyNoProbeAttempt || null;
  let decisionClass = "allowed";
  if (probeActivated || probeEligibleSoftBlocked) {
    decisionClass = "probe_eligible_soft_blocked";
  } else if (!allow) {
    decisionClass = hardSafetyReasons.length
      ? "hard_safety_blocked"
      : alphaQualityReasons.length && !governanceReasons.length && !executionReasons.length && !portfolioReasons.length
        ? "alpha_rejected"
        : softBlockerOnly && governanceReasons.length
          ? "soft_governance_blocked"
        : governanceReasons.length && !alphaQualityReasons.length
          ? "governance_blocked"
          : executionReasons.length && !alphaQualityReasons.length && !governanceReasons.length
            ? "execution_blocked"
            : "mixed_blocked";
  }
  return {
    hardSafetyBlocked: hardSafetyReasons.length > 0,
    decisionClass,
    primaryRootBlocker,
    hardSafetyReasons,
    alphaQualityReasons,
    governanceReasons,
    executionReasons,
    portfolioReasons,
    probeEligibleSoftBlocked,
    paperRecoveryProbeEligible: probeEligibleSoftBlocked,
    probeActivated,
    softBlockerOnly,
    probeRejectedReason,
    downstreamSymptoms,
    blockerSequence: blockerDecomposition.blockerSequence || normalizedReasons
  };
}

export function buildEntryDiagnosticsSummary({
  regimeSummary,
  strategySummary,
  allow,
  marketStateSummary,
  marketConditionId,
  marketConditionConfidence,
  marketConditionRisk,
  marketConditionSummary,
  score,
  threshold,
  candidateApprovalReasons,
  reasons,
  rankedRejectingFactors = [],
  blockerCategoryCounts,
  reasonSeverityProfile,
  ambiguityScore,
  ambiguityThreshold,
  decisionContextConfidence,
  entryTimingRefinement = {},
  probeAdmission = {}
}) {
  return {
    regime: regimeSummary.regime || null,
    setupFamily: strategySummary?.family || null,
    activeStrategy: strategySummary?.activeStrategy || null,
    phase: marketStateSummary.phase || null,
    marketCondition: {
      id: marketConditionId || null,
      confidence: num(marketConditionConfidence, 4),
      risk: num(marketConditionRisk, 4),
      posture: marketConditionSummary.posture || null,
      drivers: [...(marketConditionSummary.drivers || [])].slice(0, 3)
    },
    thresholdBuffer: num(score.probability - threshold, 4),
    strongestConfirmingFactors: candidateApprovalReasons.slice(0, 4),
    strongestRejectingFactors: (rankedRejectingFactors.length ? rankedRejectingFactors : reasons).slice(0, 4),
    decision: allow ? "tradeable" : "blocked",
    decisionPrimaryReason: allow
      ? (candidateApprovalReasons[0] || null)
      : ((rankedRejectingFactors[0] || reasons[0]) || null),
    blockerCategoryCounts,
    reasonSeverityProfile,
    ambiguityScore: num(ambiguityScore, 4),
    ambiguityThreshold: num(ambiguityThreshold, 4),
    decisionContextConfidence: num(decisionContextConfidence, 4),
    timingState: entryTimingRefinement.state || null,
    timingPrimaryReason: entryTimingRefinement.primaryReason || null,
    timingScore: num(entryTimingRefinement.timingScore || 0, 4),
    probeLane: {
      paperRecoveryProbeEligible: Boolean(probeAdmission.paperRecoveryProbeEligible || probeAdmission.eligible),
      probeEligibleSoftBlockedCandidate: Boolean(probeAdmission.probeEligibleSoftBlockedCandidate || probeAdmission.eligible),
      softBlockedOnly: Boolean(probeAdmission.softBlockedOnly),
      whyNoProbeAttempt: probeAdmission.whyNoProbeAttempt || null
    }
  };
}
