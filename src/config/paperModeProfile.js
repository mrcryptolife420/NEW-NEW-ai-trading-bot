import { isHardSafetyReason } from "../risk/reasonRegistry.js";

const PROFILES = {
  sim: {
    id: "sim",
    label: "Simulation parity",
    allowsLearningProbes: false,
    allowsResearchExperiments: false,
    exchangeVenue: "internal",
    posture: "live_like_paper"
  },
  learn: {
    id: "learn",
    label: "Paper learning",
    allowsLearningProbes: true,
    allowsResearchExperiments: false,
    exchangeVenue: "internal",
    posture: "bounded_learning"
  },
  research: {
    id: "research",
    label: "Research paper",
    allowsLearningProbes: true,
    allowsResearchExperiments: true,
    exchangeVenue: "internal",
    posture: "shadow_research"
  },
  demo_spot: {
    id: "demo_spot",
    label: "Binance demo spot",
    allowsLearningProbes: true,
    allowsResearchExperiments: false,
    exchangeVenue: "binance_demo_spot",
    posture: "demo_exchange_constraints"
  }
};

export const PAPER_MODE_PROFILE_IDS = Object.freeze(Object.keys(PROFILES));

export function normalizePaperModeProfileId(value = "learn") {
  const normalized = `${value || "learn"}`.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROFILES, normalized) ? normalized : "learn";
}

export function resolvePaperModeProfile(config = {}) {
  const requested = normalizePaperModeProfileId(config.paperModeProfile || (config.paperExecutionVenue === "binance_demo_spot" ? "demo_spot" : "learn"));
  const base = PROFILES[requested] || PROFILES.learn;
  const isPaper = (config.botMode || "paper") !== "live";
  return {
    ...base,
    active: isPaper,
    requested,
    effective: isPaper ? base.id : "live",
    exchangeVenue: base.id === "demo_spot" ? "binance_demo_spot" : (config.paperExecutionVenue || base.exchangeVenue || "internal"),
    canRelaxReason(reasonCode) {
      return isPaper && !isHardSafetyReason(reasonCode) && base.allowsLearningProbes;
    },
    hardSafetyRelaxable: false
  };
}
