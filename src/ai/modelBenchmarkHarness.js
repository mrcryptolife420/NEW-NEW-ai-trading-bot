function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCase(testCase = {}, index = 0) {
  return {
    id: String(testCase.id || `case-${index + 1}`),
    symbol: String(testCase.symbol || "UNKNOWN"),
    expectedAction: String(testCase.expectedAction || testCase.label || "hold").toLowerCase(),
    hardSafety: Boolean(testCase.hardSafety || testCase.safetyBlocked),
    stale: Boolean(testCase.stale || testCase.staleData),
    weight: Math.max(0, toNumber(testCase.weight, 1)),
    features: { ...(testCase.features || {}) }
  };
}

function buildModelBenchmarkDataset(cases = []) {
  const normalized = cases.map(normalizeCase);
  return {
    cases: normalized,
    summary: {
      count: normalized.length,
      tradableCount: normalized.filter((item) => !item.hardSafety && !item.stale).length,
      hardSafetyCount: normalized.filter((item) => item.hardSafety).length,
      staleCount: normalized.filter((item) => item.stale).length
    }
  };
}

function evaluateModel(model = {}, dataset) {
  const decisions = dataset.cases.map((testCase) => {
    const rawDecision = typeof model.predict === "function" ? model.predict(testCase) : model.decisions?.[testCase.id];
    const action = String(rawDecision?.action || rawDecision || "hold").toLowerCase();
    const confidence = Math.max(0, Math.min(1, toNumber(rawDecision?.confidence, 0)));
    const correct = action === testCase.expectedAction;
    const eligibleWin = correct && !testCase.hardSafety && !testCase.stale;
    return {
      caseId: testCase.id,
      symbol: testCase.symbol,
      action,
      expectedAction: testCase.expectedAction,
      confidence,
      correct,
      eligibleWin,
      blockedFromWinCredit: correct && !eligibleWin
    };
  });
  const weightedTotal = dataset.cases.reduce((sum, item) => sum + item.weight, 0) || 1;
  const weightedCorrect = decisions.reduce((sum, decision, index) => sum + (decision.correct ? dataset.cases[index].weight : 0), 0);
  const eligibleWins = decisions.filter((decision) => decision.eligibleWin).length;
  return {
    name: String(model.name || "model"),
    decisions,
    accuracy: weightedCorrect / weightedTotal,
    eligibleWins,
    calibrationError: Math.max(0, toNumber(model.calibrationError, 0)),
    safetyViolations: decisions.filter((decision, index) => dataset.cases[index].hardSafety && decision.action !== "hold").length
  };
}

function runModelBenchmark({ dataset, models = [] } = {}) {
  const normalizedDataset = dataset?.cases ? dataset : buildModelBenchmarkDataset(dataset || []);
  return {
    dataset: normalizedDataset.summary,
    results: models.map((model) => evaluateModel(model, normalizedDataset))
  };
}

function buildModelBenchmarkReport({ baseline, candidate, maxCalibrationRegression = 0.02 } = {}) {
  const accuracyDelta = toNumber(candidate?.accuracy) - toNumber(baseline?.accuracy);
  const calibrationDelta = toNumber(candidate?.calibrationError) - toNumber(baseline?.calibrationError);
  const safetyOk = toNumber(candidate?.safetyViolations) === 0;
  const calibrationOk = calibrationDelta <= maxCalibrationRegression;
  const promotionEligible = accuracyDelta > 0 && calibrationOk && safetyOk;
  return {
    baseline: baseline?.name || "baseline",
    candidate: candidate?.name || "candidate",
    accuracyDelta,
    calibrationDelta,
    safetyOk,
    calibrationOk,
    promotionEligible,
    blockers: [
      ...(accuracyDelta <= 0 ? ["accuracy_not_improved"] : []),
      ...(!calibrationOk ? ["calibration_regression"] : []),
      ...(!safetyOk ? ["safety_violation"] : [])
    ]
  };
}

export { buildModelBenchmarkDataset, runModelBenchmark, buildModelBenchmarkReport };
