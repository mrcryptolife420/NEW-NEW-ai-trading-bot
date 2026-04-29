function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function buildPermissioningScore({
  allow = false,
  reasons = [],
  permissioningSummary = {},
  capitalGovernor = {},
  probeAdmission = {},
  entryMode = "standard",
  learningLane = null,
  missedTradeTuningApplied = {},
  policyProfile = null,
  botMode = "paper"
} = {}) {
  const normalizedReasons = [...new Set((reasons || []).filter(Boolean))];
  const hardSafetyBlocked = Boolean(permissioningSummary.hardSafetyBlocked);
  const governanceReasonCount = (permissioningSummary.governanceReasons || []).length;
  const executionReasonCount = (permissioningSummary.executionReasons || []).length;
  const portfolioReasonCount = (permissioningSummary.portfolioReasons || []).length;
  const alphaReasonCount = (permissioningSummary.alphaQualityReasons || []).length;
  const probeMode = entryMode === "paper_exploration" || entryMode === "paper_recovery_probe";
  const governanceDragBias = safeValue(policyProfile?.profile?.governanceDragBias, 0);
  let permissioningScore = 0.78;
  permissioningScore -= hardSafetyBlocked ? 0.76 : 0;
  permissioningScore -= governanceReasonCount * 0.08;
  permissioningScore -= executionReasonCount * 0.06;
  permissioningScore -= portfolioReasonCount * 0.06;
  permissioningScore -= alphaReasonCount * 0.04;
  permissioningScore -= capitalGovernor.blocked ? 0.22 : 0;
  permissioningScore -= governanceDragBias;
  permissioningScore += capitalGovernor.allowProbeEntries && !capitalGovernor.blocked ? 0.08 : 0;
  permissioningScore += probeMode ? 0.08 : 0;
  permissioningScore += probeAdmission.eligible ? 0.08 : 0;
  permissioningScore += botMode === "paper" && Boolean(missedTradeTuningApplied.paperProbeEligible) ? 0.05 : 0;
  permissioningScore += botMode === "paper" && learningLane === "probe" ? 0.04 : 0;
  permissioningScore = clamp(permissioningScore, 0, 1);
  const requiredPermissioningScore = hardSafetyBlocked ? 1 : botMode === "paper" ? 0.28 : 0.45;
  return {
    permissioningScore: num(permissioningScore, 4),
    requiredPermissioningScore: num(requiredPermissioningScore, 4),
    hardSafetyBlocked,
    probeEligible: !hardSafetyBlocked && botMode === "paper" && (probeAdmission.eligible || permissioningScore >= requiredPermissioningScore),
    qualifying: allow || permissioningScore >= requiredPermissioningScore,
    primaryRootBlocker: permissioningSummary.primaryRootBlocker || normalizedReasons[0] || null,
    governanceDragBias: num(governanceDragBias, 4)
  };
}
