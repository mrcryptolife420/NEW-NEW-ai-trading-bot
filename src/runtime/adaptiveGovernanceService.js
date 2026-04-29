import { nowIso } from "../utils/time.js";

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, numeric));
}

function nextVersion(state = {}) {
  return (Number(state.proposalVersion || state.activeAdaptationVersion || 0) || 0) + 1;
}

export class AdaptiveGovernanceService {
  constructor(config = {}) {
    this.config = config;
  }

  buildInitialState(state = {}) {
    return {
      proposalVersion: Number(state.proposalVersion || state.activeAdaptationVersion || 0) || 0,
      activeAdaptationVersion: Number(state.activeAdaptationVersion || 0) || 0,
      lastKnownGoodVersion: Number(state.lastKnownGoodVersion || 0) || 0,
      rollbackCandidateVersion: Number(state.rollbackCandidateVersion || 0) || 0,
      proposals: Array.isArray(state.proposals) ? [...state.proposals].slice(0, 20) : [],
      lastChangeAt: state.lastChangeAt || null
    };
  }

  evaluateProposal({
    state = {},
    trade = {},
    runtimeApplied = [],
    analysisOnly = [],
    now = nowIso()
  } = {}) {
    const current = this.buildInitialState(state);
    const mode = trade.brokerMode || this.config.botMode || "paper";
    const proposalVersion = nextVersion(current);
    const boundedRuntimeApplied = (runtimeApplied || []).map((item) => ({
      ...item,
      thresholdBias: clamp(item.thresholdBias, -0.01, 0.01),
      sizeBias: clamp(item.sizeBias, 0.92, 1.08),
      confidenceBias: clamp(item.confidenceBias, -0.03, 0.03),
      cautionPenalty: clamp(item.cautionPenalty, 0, 0.08)
    }));
    const hasRuntimeChanges = boundedRuntimeApplied.length > 0;
    const status = !hasRuntimeChanges
      ? "shadow"
      : mode === "live"
        ? "shadow"
        : (trade.pnlQuote || 0) >= 0
          ? "applied"
          : "review_required";
    const proposal = {
      version: proposalVersion,
      at: now,
      symbol: trade.symbol || null,
      mode,
      status,
      runtimeApplied: boundedRuntimeApplied,
      analysisOnly: Array.isArray(analysisOnly) ? analysisOnly.slice(0, 8) : [],
      rollbackEligible: mode !== "live" && hasRuntimeChanges
    };
    const nextState = {
      ...current,
      proposalVersion,
      activeAdaptationVersion: status === "applied" ? proposalVersion : current.activeAdaptationVersion,
      lastKnownGoodVersion: status === "applied" ? proposalVersion : current.lastKnownGoodVersion,
      rollbackCandidateVersion: status === "applied" ? proposalVersion : current.rollbackCandidateVersion,
      proposals: [proposal, ...current.proposals].slice(0, 20),
      lastChangeAt: now
    };
    return {
      state: nextState,
      proposal,
      applied: status === "applied"
    };
  }

  rollback(state = {}, {
    reason = "manual_rollback",
    now = nowIso()
  } = {}) {
    const current = this.buildInitialState(state);
    const proposalVersion = nextVersion(current);
    const rollback = {
      version: proposalVersion,
      at: now,
      status: "rolled_back",
      reason
    };
    return {
      state: {
        ...current,
        proposalVersion,
        activeAdaptationVersion: current.lastKnownGoodVersion || 0,
        rollbackCandidateVersion: current.lastKnownGoodVersion || 0,
        proposals: [rollback, ...current.proposals].slice(0, 20),
        lastChangeAt: now
      },
      rollback
    };
  }
}
