const PROFILE_OVERRIDES = {
  "paper-safe": {
    botMode: "paper",
    adaptiveLearningLiveCoreUpdates: false,
    enableCanaryLiveMode: false,
    allowRecoverUnsyncedPositions: false,
    historyAutoRepairEnabled: true
  },
  "paper-learning": {
    botMode: "paper",
    adaptiveLearningEnabled: true,
    adaptiveLearningPaperCoreUpdates: true,
    historyAutoRepairEnabled: true,
    researchMaxSymbols: 18
  },
  "guarded-live": {
    botMode: "live",
    liveTradingAcknowledged: "required",
    enableExchangeProtection: true,
    enableCanaryLiveMode: true,
    adaptiveLearningLiveCoreUpdates: false,
    historyAutoRepairEnabled: true
  }
};

const CAPABILITY_BUNDLES = {
  dashboard: {
    dashboardSnapshotBudgetMs: 800,
    dashboardSnapshotSlowSectionMs: 180
  },
  research: {
    researchMaxSymbols: 16,
    historyAutoRepairEnabled: true
  },
  live: {
    enableExchangeProtection: true,
    allowRecoverUnsyncedPositions: false
  },
  paper: {
    paperLatencyMs: 220,
    historyAutoRepairEnabled: true
  }
};

function parseCsv(value) {
  return `${value || ""}`
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveConfigProfiles(env = {}) {
  const requestedProfile = `${env.CONFIG_PROFILE || env.BOT_PROFILE || ""}`.trim().toLowerCase() || null;
  const requestedBundles = parseCsv(env.CONFIG_CAPABILITY_BUNDLES || env.CAPABILITY_BUNDLES || "");
  const profileOverrides = requestedProfile ? (PROFILE_OVERRIDES[requestedProfile] || {}) : {};
  const bundleOverrides = requestedBundles.reduce((acc, bundleId) => ({
    ...acc,
    ...(CAPABILITY_BUNDLES[bundleId] || {})
  }), {});
  const notes = [];
  if (requestedProfile && !PROFILE_OVERRIDES[requestedProfile]) {
    notes.push(`Unknown config profile ignored: ${requestedProfile}`);
  }
  const unknownBundles = requestedBundles.filter((bundleId) => !CAPABILITY_BUNDLES[bundleId]);
  if (unknownBundles.length) {
    notes.push(`Unknown capability bundles ignored: ${unknownBundles.join(", ")}`);
  }
  return {
    profile: requestedProfile,
    capabilityBundles: requestedBundles.filter((bundleId) => CAPABILITY_BUNDLES[bundleId]),
    overrides: {
      ...profileOverrides,
      ...bundleOverrides
    },
    notes
  };
}

export function applyResolvedConfigProfiles(config = {}, resolved = {}) {
  const next = {
    ...config,
    ...(resolved.overrides || {})
  };
  const conflicts = [];
  if (resolved.profile === "guarded-live" && next.botMode !== "live") {
    conflicts.push("guarded-live profile requires BOT_MODE=live");
  }
  if ((resolved.profile || "").startsWith("paper") && next.botMode !== "paper") {
    conflicts.push(`${resolved.profile} profile expects BOT_MODE=paper`);
  }
  next.profile = {
    id: resolved.profile || null,
    capabilityBundles: resolved.capabilityBundles || [],
    notes: resolved.notes || [],
    conflicts
  };
  return next;
}
