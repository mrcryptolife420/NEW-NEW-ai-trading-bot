import { buildCandidateExplainability } from "./candidateExplainability.js";
import { buildDecisionSupportDiagnostics } from "./decisionSupportDiagnostics.js";
import { buildFeatureActivationDecision } from "./featureActivationGovernor.js";
import { buildLearningEvidenceRecord } from "./learningEvidencePipeline.js";
import { getReasonDefinition } from "../risk/reasonRegistry.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, fallback = null) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function firstNonEmpty(values = [], fallback = null) {
  for (const value of values) {
    const result = text(value, null);
    if (result) return result;
  }
  return fallback;
}

function reasonCodes(candidate = {}) {
  return [
    candidate.rootBlocker,
    candidate.primaryRootBlocker,
    candidate.blockedReason,
    candidate.blocker,
    ...arr(candidate.reasons),
    ...arr(candidate.blockerReasons),
    ...arr(candidate.rejectionReasons)
  ].filter(Boolean).map((reason) => `${reason}`.toLowerCase());
}

function hasHardSafety(candidate = {}) {
  return reasonCodes(candidate).some((reason) => getReasonDefinition(reason).hardSafety);
}

function resolveCandidateState(candidate = {}) {
  if (candidate.executed || candidate.paperTradeId || candidate.execution?.status === "filled") return "approved";
  if (candidate.shadowApproved || candidate.shadowEligible) return "shadow_approved";
  if (candidate.skipped) return "skipped";
  if (candidate.approved === false || candidate.blocked === true || candidate.rootBlocker || candidate.blockedReason) return "blocked";
  if (candidate.approved === true || candidate.allowed === true) return "approved";
  return "generated";
}

function resolveSetupType(candidate = {}) {
  const strategy = obj(candidate.strategy || candidate.strategySummary || {});
  return firstNonEmpty([
    candidate.setupType,
    strategy.setupStyle,
    strategy.activeStrategy,
    strategy.id,
    candidate.strategyId,
    candidate.strategyFamily
  ], "unknown_setup");
}

function resolveBlockerFamily(candidate = {}) {
  const blocker = firstNonEmpty([
    candidate.rootBlocker,
    candidate.primaryRootBlocker,
    candidate.blockedReason,
    candidate.blocker
  ], null);
  if (!blocker) return null;
  const definition = getReasonDefinition(blocker);
  return definition.category || "other";
}

export function buildPaperCandidateLabRecord({
  candidate = {},
  decision = null,
  config = {},
  runtimeState = {},
  botMode = config.botMode || runtimeState.botMode || runtimeState.mode || "paper",
  futureMarketPath = null,
  featureActivation = null,
  now = new Date().toISOString()
} = {}) {
  const source = obj(candidate);
  const mergedDecision = obj(decision || source.decision || source);
  const state = resolveCandidateState({ ...source, ...mergedDecision });
  const hardSafety = hasHardSafety({ ...source, ...mergedDecision });
  const explainability = buildCandidateExplainability({ ...source, ...mergedDecision });
  const decisionSupport = buildDecisionSupportDiagnostics({
    candidate: { ...source, ...mergedDecision },
    config,
    botMode
  });
  const activation = featureActivation || buildFeatureActivationDecision({
    feature: {
      id: source.featureId || source.featureActivationId || "paper_candidate_lab",
      requestedStage: botMode === "paper" ? "paper_only" : "diagnostics_only",
      fallbackSafe: true,
      hasTests: true
    },
    requestedStage: botMode === "paper" ? "paper_only" : "diagnostics_only",
    evidence: { fallbackSafe: true, testsPassed: true },
    config: {
      ...config,
      allowAutoPaperFeatureActivation: botMode === "paper" ? true : config.allowAutoPaperFeatureActivation
    },
    runtimeState: { ...runtimeState, botMode }
  });
  const learningEvidence = buildLearningEvidenceRecord({
    decision: {
      ...mergedDecision,
      ...source,
      decisionId: mergedDecision.decisionId || source.decisionId || source.id || null,
      setupType: resolveSetupType({ ...source, ...mergedDecision })
    },
    futureMarketPath
  });
  const paperEligible = botMode === "paper" &&
    !hardSafety &&
    ["generated", "blocked", "approved", "skipped", "shadow_approved"].includes(state);
  return {
    candidateId: source.candidateId || source.id || mergedDecision.candidateId || null,
    decisionId: mergedDecision.decisionId || source.decisionId || null,
    symbol: source.symbol || mergedDecision.symbol || null,
    state,
    setupType: resolveSetupType({ ...source, ...mergedDecision }),
    topEvidence: explainability.topEvidence,
    topConflicts: explainability.topConflicts,
    blockerFamily: resolveBlockerFamily({ ...source, ...mergedDecision }),
    rootBlocker: firstNonEmpty([
      mergedDecision.rootBlocker,
      source.rootBlocker,
      mergedDecision.blockedReason,
      source.blockedReason
    ], null),
    featureActivationStage: activation.effectiveStage,
    paperEligibility: {
      eligible: paperEligible,
      reason: hardSafety
        ? "hard_safety_blocker"
        : botMode !== "paper"
          ? "live_diagnostics_only"
          : state === "approved"
            ? "paper_approved"
            : state
    },
    hardSafetyBlocker: hardSafety,
    runtimeApplied: botMode === "paper" && activation.paperImpactAllowed && !hardSafety,
    diagnosticsOnly: botMode !== "paper" || activation.diagnosticsOnly,
    liveBehaviorChanged: false,
    executionPermissionChanged: false,
    decisionSupport,
    explainability,
    learningEvidence,
    createdAt: now
  };
}

export function buildPaperCandidateLabRecords({ candidates = [], ...options } = {}) {
  return arr(candidates).map((candidate) => buildPaperCandidateLabRecord({ candidate, ...options }));
}

export function summarizePaperCandidateLab(records = []) {
  const items = arr(records);
  const byState = {};
  const byBlockerFamily = {};
  for (const item of items) {
    byState[item.state || "unknown"] = (byState[item.state || "unknown"] || 0) + 1;
    if (item.blockerFamily) {
      byBlockerFamily[item.blockerFamily] = (byBlockerFamily[item.blockerFamily] || 0) + 1;
    }
  }
  return {
    status: items.length ? "ready" : "empty",
    count: items.length,
    byState,
    byBlockerFamily,
    paperEligibleCount: items.filter((item) => item.paperEligibility?.eligible).length,
    hardSafetyBlockedCount: items.filter((item) => item.hardSafetyBlocker).length,
    runtimeAppliedCount: items.filter((item) => item.runtimeApplied).length,
    records: items.slice(0, 40),
    diagnosticsOnly: true,
    liveBehaviorChanged: false,
    executionPermissionChanged: false
  };
}
