function arr(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function text(value, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeEvidenceItem(item, fallbackId = "evidence") {
  if (typeof item === "string") {
    return { id: item, score: 0, reason: item };
  }
  const source = objectOrFallback(item, {});
  return {
    id: text(source.id || source.name || source.feature || fallbackId),
    score: clamp(source.score ?? source.weight ?? source.value ?? source.impact, -1, 1),
    reason: text(source.reason || source.note || source.description || source.id || fallbackId)
  };
}

function sortedEvidence(items, direction = "positive") {
  return arr(items)
    .map((item, index) => normalizeEvidenceItem(item, `${direction}_${index + 1}`))
    .filter((item) => direction === "positive" ? item.score >= 0 : item.score <= 0)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 6);
}

function scoreComponent(value, fallback = 0) {
  const parsed = finite(value, fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveSetupType(candidate) {
  return text(
    candidate.setupType ||
      candidate.strategy?.setupStyle ||
      candidate.strategy?.activeStrategy ||
      candidate.strategySummary?.setupStyle ||
      candidate.strategySummary?.activeStrategy ||
      candidate.family ||
      candidate.strategyFamily,
    "unknown_setup"
  );
}

function resolveBlocker(candidate) {
  const rootBlocker = candidate.rootBlocker || candidate.primaryRootBlocker || candidate.blocker || candidate.blockedReason;
  if (rootBlocker) return text(rootBlocker);
  const reasons = arr(candidate.reasons || candidate.blockerReasons || candidate.rejectionReasons);
  return reasons.length ? text(reasons[0]) : null;
}

function buildExecutionFit(candidate) {
  const execution = objectOrFallback(candidate.execution || candidate.executionPlan || candidate.executionFit || {});
  const cost = objectOrFallback(candidate.executionCost || candidate.executionCostSummary || {});
  const spreadBps = finite(execution.spreadBps ?? candidate.spreadBps, 0);
  const expectedSlippageBps = finite(execution.expectedSlippageBps ?? cost.expectedSlippageBps, 0);
  const confidence = clamp(execution.confidence ?? execution.executionConfidence ?? (spreadBps > 35 || expectedSlippageBps > 18 ? 0.35 : 0.7));
  const conflicts = [];
  if (spreadBps > 35) conflicts.push("spread_too_high");
  if (expectedSlippageBps > 18) conflicts.push("slippage_too_high");
  if (execution.style === "market_prohibited") conflicts.push("market_order_prohibited");
  return {
    score: confidence,
    spreadBps,
    expectedSlippageBps,
    style: execution.style || execution.entryStyle || null,
    conflicts
  };
}

function buildRiskFit(candidate) {
  const risk = objectOrFallback(candidate.risk || candidate.riskSummary || candidate.riskFit || {});
  const allowed = candidate.approved === true || risk.allowed === true || risk.status === "approved";
  const blocked = candidate.approved === false || risk.blocked === true || ["blocked", "rejected"].includes(`${risk.status || ""}`);
  const score = blocked ? 0.2 : allowed ? 0.8 : clamp(risk.score ?? risk.riskFitScore ?? 0.55);
  return {
    score,
    status: blocked ? "blocked" : allowed ? "approved" : text(risk.status, "unknown"),
    reasons: arr(risk.reasons || candidate.reasons || candidate.blockerReasons).slice(0, 8)
  };
}

function buildRegimeFit(candidate) {
  const regimeFit = objectOrFallback(
    candidate.regimeFit ||
      candidate.indicatorRegimeSummary ||
      candidate.tradingQualitySummary?.regimeFit ||
      candidate.tradingQuality?.regimeFit,
    {}
  );
  return {
    regime: text(candidate.regime || candidate.regimeSummary?.regime || candidate.marketRegime, "unknown"),
    score: clamp(regimeFit.score ?? candidate.regimeFitScore ?? 0.5),
    supportingIndicators: arr(regimeFit.supportingIndicators).slice(0, 6).map((item, index) => normalizeEvidenceItem(item, `regime_support_${index + 1}`)),
    conflictingIndicators: arr(regimeFit.conflictingIndicators).slice(0, 6).map((item, index) => normalizeEvidenceItem(item, `regime_conflict_${index + 1}`)),
    warnings: arr(regimeFit.warnings)
  };
}

export function buildCandidateExplainability(candidate = {}) {
  const source = objectOrFallback(candidate, {});
  const regimeFit = buildRegimeFit(source);
  const executionFit = buildExecutionFit(source);
  const riskFit = buildRiskFit(source);
  const directEvidence = arr(source.topEvidence).length
    ? source.topEvidence
    : arr(source.evidenceFor).length
      ? source.evidenceFor
      : source.tradingQualitySummary?.bestEvidence
        ? [source.tradingQualitySummary.bestEvidence]
        : [];
  const directConflicts = arr(source.topConflicts).length
    ? source.topConflicts
    : arr(source.evidenceAgainst).length
      ? source.evidenceAgainst
      : source.tradingQualitySummary?.mainConflict
        ? [source.tradingQualitySummary.mainConflict]
        : [];
  const supporting = [
    ...arr(directEvidence),
    ...arr(source.supportingIndicators || regimeFit.supportingIndicators),
    ...arr(source.positiveFeatures || source.featureContributions?.positive)
  ];
  const conflicts = [
    ...arr(directConflicts),
    ...arr(source.conflictingIndicators || regimeFit.conflictingIndicators),
    ...arr(source.negativeFeatures || source.featureContributions?.negative),
    ...executionFit.conflicts.map((id) => ({ id, score: -0.4, reason: id }))
  ];
  const probability = scoreComponent(source.probability ?? source.score?.probability ?? source.modelProbability, 0);
  const threshold = scoreComponent(source.threshold ?? source.score?.threshold, 0);
  const approved = source.approved === true || source.decision === "approved" || source.status === "approved";
  const blocker = resolveBlocker(source);
  const warnings = [];
  if (!source || !Object.keys(source).length) warnings.push("candidate_missing");
  if (regimeFit.regime === "unknown") warnings.push("regime_unknown");
  if (!sortedEvidence(supporting, "positive").length) warnings.push("positive_evidence_missing");

  return {
    symbol: text(source.symbol, "UNKNOWN"),
    setupType: resolveSetupType(source),
    approved: Boolean(approved && !blocker),
    blocker,
    topEvidence: sortedEvidence(supporting, "positive"),
    topConflicts: sortedEvidence(conflicts, "negative"),
    scoreComponents: {
      probability,
      threshold,
      edge: scoreComponent(source.netEdgeScore ?? source.netExecutableExpectancyScore ?? source.expectedNetEdgeBps, 0),
      modelConfidence: scoreComponent(source.confidence ?? source.modelConfidence ?? source.confidenceBreakdown?.modelConfidence, 0),
      regimeFit: regimeFit.score,
      executionFit: executionFit.score,
      riskFit: riskFit.score
    },
    regimeFit,
    executionFit,
    riskFit,
    warnings,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function summarizeCandidateExplainability(candidates = [], { limit = 12 } = {}) {
  const items = arr(candidates).slice(0, Math.max(0, finite(limit, 12))).map(buildCandidateExplainability);
  return {
    status: items.length ? "ready" : "empty",
    count: items.length,
    items,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
