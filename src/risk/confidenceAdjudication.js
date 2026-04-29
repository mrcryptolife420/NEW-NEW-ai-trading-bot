import { HARD_SAFETY_BLOCKERS } from "./policies/hardSafetyPolicy.js";

function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function buildSimplifiedConfidenceAdjudication({
  score = {},
  threshold = 0,
  baseThreshold = 0,
  alphaThreshold = 0,
  lowConfidencePressure = {},
  setupQuality = {},
  signalQualitySummary = {},
  dataQualitySummary = {},
  confidenceBreakdown = {},
  reasons = [],
  policyProfile = null,
  botMode = "paper"
} = {}) {
  const rawProbability = safeValue(score.rawProbability, safeValue(score.probability, 0));
  const calibratedProbability = safeValue(score.probability, 0);
  const rawEdge = rawProbability - safeValue(alphaThreshold, 0);
  const calibratedEdge = calibratedProbability - safeValue(alphaThreshold, 0);
  const thresholdInflation = Math.max(0, safeValue(threshold, 0) - safeValue(baseThreshold, 0));
  const profileGovernanceDrag = Math.max(0, safeValue(policyProfile?.profile?.governanceDragBias, 0));
  const governanceDrag = clamp(
    thresholdInflation +
      Math.max(0, safeValue(lowConfidencePressure.thresholdPenaltyStack, thresholdInflation) * 0.55) +
      Math.max(0, safeValue(lowConfidencePressure.executionCaution, 0) * 0.4) +
      Math.max(0, safeValue(lowConfidencePressure.featureTrustPenalty, 0) * 0.32) +
      profileGovernanceDrag,
    0,
    botMode === "paper" ? 0.08 : 0.06
  );
  const evidenceSupportScore = clamp(
    safeValue(setupQuality.score, 0.5) * 0.28 +
      safeValue(signalQualitySummary.overallScore, 0.5) * 0.22 +
      safeValue(dataQualitySummary.overallScore, 0.5) * 0.18 +
      safeValue(confidenceBreakdown.executionConfidence, 0.5) * 0.16 +
      safeValue(confidenceBreakdown.overallConfidence, 0.5) * 0.16,
    0,
    1
  );
  const lowConfidenceDriver = lowConfidencePressure.primaryDriver || "model_confidence";
  const suspiciousDriver = [
    "feature_trust",
    "threshold_penalty_stack",
    "auxiliary_blend_drag",
    "calibration_warmup",
    "calibration_confidence",
    "model_disagreement"
  ].includes(lowConfidenceDriver);
  const paperReliefEligible =
    botMode === "paper" &&
    !reasons.some((reason) => HARD_SAFETY_BLOCKERS.has(reason)) &&
    lowConfidencePressure.reliefEligible !== false &&
    evidenceSupportScore >= 0.62 &&
    suspiciousDriver &&
    rawProbability > calibratedProbability &&
    rawEdge >= -0.045;
  const paperRelief = paperReliefEligible
    ? clamp(
        Math.max(0, rawProbability - calibratedProbability) * 0.55 +
          Math.max(0, evidenceSupportScore - 0.62) * 0.02 +
          Math.max(0, 0.04 - governanceDrag) * 0.12,
        0,
        0.018
      )
    : 0;
  const finalEdge = calibratedEdge - governanceDrag + paperRelief;
  const finalProbability = clamp(calibratedProbability + paperRelief, 0, 1);
  const falseNegativeSuspicionScore = clamp(
    Math.max(0, rawProbability - calibratedProbability) * 4.2 +
      evidenceSupportScore * 0.34 +
      Math.max(0, -calibratedEdge) * 1.4 +
      (suspiciousDriver ? 0.12 : 0),
    0,
    1
  );
  return {
    rawProbability: num(rawProbability, 4),
    calibratedProbability: num(calibratedProbability, 4),
    finalProbability: num(finalProbability, 4),
    rawEdge: num(rawEdge, 4),
    calibratedEdge: num(calibratedEdge, 4),
    governanceDrag: num(governanceDrag, 4),
    paperRelief: num(paperRelief, 4),
    finalEdge: num(finalEdge, 4),
    confidenceEvidenceScore: num(evidenceSupportScore, 4),
    falseNegativeSuspicionScore: num(falseNegativeSuspicionScore, 4),
    lowConfidenceDriver,
    paperReliefEligible,
    reliefBlockedByHardSafety: reasons.some((reason) => HARD_SAFETY_BLOCKERS.has(reason)),
    confidenceRecoveryEligible: paperReliefEligible,
    thresholdReliefEligible: paperReliefEligible,
    thresholdRelief: num(paperRelief, 4),
    adjudicatedProbability: num(finalProbability, 4),
    effectiveProbability: num(finalProbability, 4),
    confidenceRecoveryReason: paperReliefEligible
      ? `bounded_paper_relief_${lowConfidenceDriver}`
      : reasons.some((reason) => HARD_SAFETY_BLOCKERS.has(reason))
        ? "hard_safety_blocker_present"
        : "relief_not_eligible",
    thresholdReliefReason: paperReliefEligible ? `paper_relief_${lowConfidenceDriver}` : "threshold_relief_not_eligible"
  };
}
