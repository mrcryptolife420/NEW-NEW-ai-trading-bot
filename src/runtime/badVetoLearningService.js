function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function classifyRecommendation(stats = {}, config = {}) {
  const minRejectCount = Math.max(4, Math.round(safeNumber(config.badVetoMinRejectCount, 6)));
  const minFalseNegativeRate = safeNumber(config.badVetoMinFalseNegativeRate, 0.55);
  const minAverageMissedR = safeNumber(config.badVetoMinAverageMissedR, 0.75);
  const rejectCount = safeNumber(stats.rejectCount, 0);
  const falseNegativeRate = safeNumber(stats.falseNegativeRate, 0);
  const averageMissedR = safeNumber(stats.averageMissedR, 0);
  if (rejectCount < minRejectCount) {
    return { status: "uncertain", reason: "sample_too_small" };
  }
  if (falseNegativeRate >= minFalseNegativeRate && averageMissedR >= minAverageMissedR) {
    return { status: "bad_veto", reason: "profitable_reject_pattern" };
  }
  if (falseNegativeRate <= 0.3 && averageMissedR <= 0.25) {
    return { status: "good_veto", reason: "rejects_protected_capital" };
  }
  return { status: "mixed", reason: "mixed_outcome_profile" };
}

function buildScopedRecommendation(stats = {}, classification = {}, config = {}) {
  if ((config.botMode || "paper") !== "paper") {
    return null;
  }
  if (classification.status !== "bad_veto") {
    return null;
  }
  const confidence = clamp(
    safeNumber(stats.falseNegativeRate, 0) * 0.42 +
      Math.min(1.2, safeNumber(stats.averageMissedR, 0)) * 0.28 +
      Math.min(1, safeNumber(stats.rejectCount, 0) / Math.max(6, safeNumber(config.badVetoMinRejectCount, 6))) * 0.2 +
      safeNumber(stats.averageEdgeScore, 0) * 0.1,
    0,
    1
  );
  return {
    blocker: stats.blocker || null,
    blockerStage: stats.blockerStage || null,
    family: stats.scope?.family || null,
    strategy: stats.scope?.strategy || null,
    regime: stats.scope?.regime || null,
    session: stats.scope?.session || null,
    condition: stats.scope?.condition || null,
    status: classification.status,
    recommendation: "bounded_paper_soften",
    thresholdShift: num(-Math.min(0.012, Math.max(0.004, safeNumber(stats.averageMissedR, 0) * 0.006)), 4),
    sizeMultiplier: num(Math.min(1.06, 1 + safeNumber(stats.falseNegativeRate, 0) * 0.05), 4),
    permissioningLift: num(Math.min(0.06, 0.015 + safeNumber(stats.falseNegativeRate, 0) * 0.03), 4),
    confidence: num(confidence, 4),
    rejectCount: stats.rejectCount || 0,
    falseNegativeRate: num(stats.falseNegativeRate || 0, 4),
    averageMissedR: num(stats.averageMissedR || 0, 4),
    reason: classification.reason
  };
}

export class BadVetoLearningService {
  constructor({ config = {}, dataRecorder = null } = {}) {
    this.config = config;
    this.dataRecorder = dataRecorder;
  }

  async buildReview({
    symbol = null,
    rootBlocker = null,
    maxFiles = 24,
    maxRecords = 400
  } = {}) {
    if (!this.dataRecorder?.loadRejectedDecisionReview) {
      return {
        status: "disabled",
        blockerStats: [],
        recommendations: [],
        note: "Rejected decision review unavailable."
      };
    }
    const review = await this.dataRecorder.loadRejectedDecisionReview({
      symbol,
      rootBlocker,
      maxFiles,
      maxRecords
    });
    const scopedRecords = arr(review.reviewRecords || review.decisions || []);
    const enrichedBlockerStats = arr(review.blockerStats || []).map((stats) => {
      const sample = scopedRecords.find((decision) =>
        normalize(decision.rootBlocker || decision.dominantBlocker) === normalize(stats.blocker) &&
        normalize(decision.blockerStage) === normalize(stats.blockerStage)
      ) || {};
      const scope = {
        family: sample.family || sample.strategySummary?.family || null,
        strategy: sample.strategy || sample.strategySummary?.activeStrategy || null,
        regime: sample.regime || sample.regimeSummary?.regime || null,
        session: sample.session || sample.sessionSummary?.session || null,
        condition: sample.marketCondition?.conditionId || sample.marketConditionSummary?.conditionId || null
      };
      const classification = classifyRecommendation(stats, this.config);
      return {
        ...stats,
        scope,
        classification: classification.status,
        classificationReason: classification.reason
      };
    });
    const recommendations = enrichedBlockerStats
      .map((stats) => buildScopedRecommendation(stats, {
        status: stats.classification,
        reason: stats.classificationReason
      }, this.config))
      .filter(Boolean)
      .sort((left, right) => (right.confidence || 0) - (left.confidence || 0) || (right.averageMissedR || 0) - (left.averageMissedR || 0))
      .slice(0, 10);
    return {
      ...review,
      blockerStats: enrichedBlockerStats,
      recommendations,
      note: recommendations.length
        ? `Bad-veto learning found ${recommendations.length} scoped paper recommendations.`
        : "Bad-veto learning found no scoped recommendation with enough evidence."
    };
  }
}
