function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function buildEdgeScore({
  score = {},
  adjudicatedProbability = null,
  threshold = 0,
  alphaThreshold = 0,
  setupQuality = {},
  signalQualitySummary = {},
  confidenceBreakdown = {},
  expectedNetEdge = {},
  lowConfidencePressure = {},
  policyProfile = null,
  botMode = "paper"
} = {}) {
  const effectiveProbability = safeValue(adjudicatedProbability, safeValue(score.probability, 0));
  const edgeToThreshold = effectiveProbability - safeValue(threshold, 0);
  const edgeToAlphaThreshold = effectiveProbability - safeValue(alphaThreshold, 0);
  const expectancyBias = (safeValue(expectedNetEdge.expectancyScore, 0.5) - 0.5) * 0.28;
  const profileAlphaEdgeBoost = safeValue(policyProfile?.profile?.alphaEdgeBoost, 0);
  const qualityBias =
    (safeValue(setupQuality.score, 0.5) - 0.5) * 0.34 +
    (safeValue(signalQualitySummary.overallScore, 0.5) - 0.5) * 0.2 +
    (safeValue(confidenceBreakdown.overallConfidence, 0.5) - 0.5) * 0.18 +
    profileAlphaEdgeBoost;
  const pressureDrag = Math.max(0, -safeValue(lowConfidencePressure.edgeToThreshold, 0)) * 0.42;
  const edgeScore = clamp(
    0.5 +
      edgeToThreshold * 2.8 +
      edgeToAlphaThreshold * 1.6 +
      expectancyBias +
      qualityBias -
      pressureDrag,
    0,
    1
  );
  const requiredEdgeScore = botMode === "paper" ? 0.46 : 0.52;
  return {
    edgeScore: num(edgeScore, 4),
    requiredEdgeScore: num(requiredEdgeScore, 4),
    edgeToThreshold: num(edgeToThreshold, 4),
    edgeToAlphaThreshold: num(edgeToAlphaThreshold, 4),
    expectancyBias: num(expectancyBias, 4),
    qualityBias: num(qualityBias, 4),
    profileAlphaEdgeBoost: num(profileAlphaEdgeBoost, 4),
    pressureDrag: num(pressureDrag, 4),
    qualifying: edgeScore >= requiredEdgeScore,
    effectiveProbability: num(effectiveProbability, 4)
  };
}
