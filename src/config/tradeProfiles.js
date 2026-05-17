export const TRADE_PROFILE_CATALOG = Object.freeze([
  {
    id: "beginner-paper-learning",
    label: "Beginner paper learning",
    mode: "paper",
    description: "Default safe paper mode with bounded learning probes and internal demo fills.",
    env: {
      BOT_MODE: "paper",
      TRADE_PROFILE_ID: "beginner-paper-learning",
      CONFIG_PROFILE: "paper-learning",
      CONFIG_CAPABILITY_BUNDLES: "paper,dashboard,research",
      PAPER_MODE_PROFILE: "learn",
      PAPER_EXECUTION_VENUE: "internal",
      BINANCE_API_BASE_URL: "",
      BINANCE_FUTURES_API_BASE_URL: "",
      PAPER_EXPLORATION_ENABLED: "true",
      PAPER_RECOVERY_PROBE_ENABLED: "true",
      PAPER_SOFT_BLOCKER_PROBE_ENABLED: "true",
      NEURAL_SELF_TUNING_PAPER_ONLY: "true",
      NEURAL_AUTO_PROMOTE_LIVE: "false",
      NEURAL_LIVE_AUTONOMY_ENABLED: "false",
      LIVE_TRADING_ACKNOWLEDGED: ""
    }
  },
  {
    id: "paper-demo-spot",
    label: "Binance demo spot paper",
    mode: "paper",
    description: "Paper learning against Binance demo spot constraints; still not live trading.",
    env: {
      BOT_MODE: "paper",
      TRADE_PROFILE_ID: "paper-demo-spot",
      CONFIG_PROFILE: "paper-learning",
      CONFIG_CAPABILITY_BUNDLES: "paper,dashboard,research",
      PAPER_MODE_PROFILE: "demo_spot",
      PAPER_EXECUTION_VENUE: "binance_demo_spot",
      BINANCE_API_BASE_URL: "https://demo-api.binance.com",
      BINANCE_FUTURES_API_BASE_URL: "https://demo-fapi.binance.com",
      PAPER_EXPLORATION_ENABLED: "true",
      PAPER_RECOVERY_PROBE_ENABLED: "true",
      PAPER_SOFT_BLOCKER_PROBE_ENABLED: "true",
      NEURAL_SELF_TUNING_PAPER_ONLY: "true",
      NEURAL_AUTO_PROMOTE_LIVE: "false",
      NEURAL_LIVE_AUTONOMY_ENABLED: "false",
      LIVE_TRADING_ACKNOWLEDGED: ""
    }
  },
  {
    id: "paper-neural-learning",
    label: "Neural paper learning",
    mode: "paper",
    description: "Full paper-only neural learning with replay, continuous learning and self tuning.",
    env: {
      BOT_MODE: "paper",
      TRADE_PROFILE_ID: "paper-neural-learning",
      CONFIG_PROFILE: "paper-learning",
      CONFIG_CAPABILITY_BUNDLES: "paper,dashboard,research",
      PAPER_MODE_PROFILE: "learn",
      PAPER_EXECUTION_VENUE: "internal",
      BINANCE_API_BASE_URL: "",
      BINANCE_FUTURES_API_BASE_URL: "",
      ADAPTIVE_LEARNING_ENABLED: "true",
      ADAPTIVE_LEARNING_PAPER_CORE_UPDATES: "true",
      ADAPTIVE_LEARNING_LIVE_CORE_UPDATES: "false",
      ENABLE_TRANSFORMER_CHALLENGER: "true",
      ENABLE_SEQUENCE_CHALLENGER: "true",
      ENABLE_MULTI_AGENT_COMMITTEE: "true",
      ENABLE_RL_EXECUTION: "true",
      NEURAL_REPLAY_ENGINE_ENABLED: "true",
      NEURAL_CONTINUOUS_LEARNING_ENABLED: "true",
      NEURAL_SELF_TUNING_ENABLED: "true",
      NEURAL_SELF_TUNING_PAPER_ONLY: "true",
      NEURAL_AUTO_PROMOTE_PAPER: "false",
      NEURAL_AUTO_PROMOTE_LIVE: "false",
      NEURAL_AUTONOMY_ENABLED: "true",
      NEURAL_AUTONOMY_LEVEL: "1",
      NEURAL_LIVE_AUTONOMY_ENABLED: "false",
      NEURAL_LIVE_AUTONOMY_ACKNOWLEDGED: "",
      LIVE_TRADING_ACKNOWLEDGED: ""
    }
  },
  {
    id: "paper-neural-demo-spot",
    label: "Neural demo spot paper",
    mode: "paper",
    description: "Full paper-only neural learning against Binance demo spot constraints.",
    env: {
      BOT_MODE: "paper",
      TRADE_PROFILE_ID: "paper-neural-demo-spot",
      CONFIG_PROFILE: "paper-learning",
      CONFIG_CAPABILITY_BUNDLES: "paper,dashboard,research",
      PAPER_MODE_PROFILE: "demo_spot",
      PAPER_EXECUTION_VENUE: "binance_demo_spot",
      BINANCE_API_BASE_URL: "https://demo-api.binance.com",
      BINANCE_FUTURES_API_BASE_URL: "https://demo-fapi.binance.com",
      ADAPTIVE_LEARNING_ENABLED: "true",
      ADAPTIVE_LEARNING_PAPER_CORE_UPDATES: "true",
      ADAPTIVE_LEARNING_LIVE_CORE_UPDATES: "false",
      ENABLE_TRANSFORMER_CHALLENGER: "true",
      ENABLE_SEQUENCE_CHALLENGER: "true",
      ENABLE_MULTI_AGENT_COMMITTEE: "true",
      ENABLE_RL_EXECUTION: "true",
      NEURAL_REPLAY_ENGINE_ENABLED: "true",
      NEURAL_CONTINUOUS_LEARNING_ENABLED: "true",
      NEURAL_SELF_TUNING_ENABLED: "true",
      NEURAL_SELF_TUNING_PAPER_ONLY: "true",
      NEURAL_AUTO_PROMOTE_PAPER: "false",
      NEURAL_AUTO_PROMOTE_LIVE: "false",
      NEURAL_AUTONOMY_ENABLED: "true",
      NEURAL_AUTONOMY_LEVEL: "1",
      NEURAL_LIVE_AUTONOMY_ENABLED: "false",
      NEURAL_LIVE_AUTONOMY_ACKNOWLEDGED: "",
      LIVE_TRADING_ACKNOWLEDGED: ""
    }
  },
  {
    id: "paper-safe-simulation",
    label: "Safe simulation",
    mode: "paper",
    description: "Conservative paper profile for live-like simulation without learning probes.",
    env: {
      BOT_MODE: "paper",
      TRADE_PROFILE_ID: "paper-safe-simulation",
      CONFIG_PROFILE: "paper-safe",
      CONFIG_CAPABILITY_BUNDLES: "paper,dashboard",
      PAPER_MODE_PROFILE: "sim",
      PAPER_EXECUTION_VENUE: "internal",
      BINANCE_API_BASE_URL: "",
      BINANCE_FUTURES_API_BASE_URL: "",
      PAPER_EXPLORATION_ENABLED: "false",
      PAPER_RECOVERY_PROBE_ENABLED: "false",
      PAPER_SOFT_BLOCKER_PROBE_ENABLED: "false",
      NEURAL_SELF_TUNING_PAPER_ONLY: "true",
      NEURAL_AUTO_PROMOTE_LIVE: "false",
      NEURAL_LIVE_AUTONOMY_ENABLED: "false",
      LIVE_TRADING_ACKNOWLEDGED: ""
    }
  },
  {
    id: "guarded-live-template",
    label: "Guarded live template",
    mode: "live",
    description: "Live config template only; requires explicit live acknowledgement before it can run.",
    requiresLiveAcknowledgement: true,
    env: {
      BOT_MODE: "live",
      TRADE_PROFILE_ID: "guarded-live-template",
      CONFIG_PROFILE: "guarded-live",
      CONFIG_CAPABILITY_BUNDLES: "live,dashboard",
      PAPER_EXECUTION_VENUE: "internal",
      BINANCE_API_BASE_URL: "",
      BINANCE_FUTURES_API_BASE_URL: "",
      NEURAL_AUTO_PROMOTE_LIVE: "false",
      NEURAL_LIVE_AUTONOMY_ENABLED: "false"
    }
  }
]);

export function getTradeProfile(profileId) {
  const id = `${profileId || ""}`.trim().toLowerCase();
  return TRADE_PROFILE_CATALOG.find((profile) => profile.id === id) || null;
}

export function buildTradeProfilePreview({ profileId, currentConfig = {} } = {}) {
  const profile = getTradeProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown trade profile: ${profileId}`);
  }
  const updates = { ...profile.env };
  const nextMode = updates.BOT_MODE || currentConfig.botMode || "paper";
  return {
    profile: {
      id: profile.id,
      label: profile.label,
      mode: profile.mode,
      description: profile.description,
      requiresLiveAcknowledgement: profile.requiresLiveAcknowledgement === true
    },
    updates,
    safeDefault: nextMode !== "live",
    warnings: nextMode === "live"
      ? ["Live profile is not applied unless LIVE_TRADING_ACKNOWLEDGED is already set correctly."]
      : []
  };
}
