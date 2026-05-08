import { redactSecrets } from "../utils/redactSecrets.js";

export const ACCOUNT_PROFILES = {
  paper: { id: "paper", exchangeProvider: "paper", brokerMode: "paper", riskBudgetPct: 1, live: false, neuralLiveAutonomy: false, fastExecution: true },
  binance_demo: { id: "binance_demo", exchangeProvider: "binance", brokerMode: "demo", riskBudgetPct: 0.25, live: false, neuralLiveAutonomy: false, fastExecution: false },
  live_small: { id: "live_small", exchangeProvider: "binance", brokerMode: "live", riskBudgetPct: 0.05, live: true, neuralLiveAutonomy: false, fastExecution: false },
  live_main: { id: "live_main", exchangeProvider: "binance", brokerMode: "live", riskBudgetPct: 0.02, live: true, neuralLiveAutonomy: false, fastExecution: false },
  neural_sandbox: { id: "neural_sandbox", exchangeProvider: "synthetic", brokerMode: "paper", riskBudgetPct: 0.1, live: false, neuralLiveAutonomy: true, fastExecution: false },
  research_only: { id: "research_only", exchangeProvider: "synthetic", brokerMode: "research", riskBudgetPct: 0, live: false, neuralLiveAutonomy: false, fastExecution: false },
  operator_training: { id: "operator_training", exchangeProvider: "paper", brokerMode: "paper", riskBudgetPct: 0, live: false, neuralLiveAutonomy: false, fastExecution: false }
};

export function resolveAccountProfile(id = "paper", overrides = {}) {
  const profile = { ...(ACCOUNT_PROFILES[id] || ACCOUNT_PROFILES.paper), ...overrides };
  if (profile.id === "live_main" && profile.neuralLiveAutonomy !== true) profile.neuralLiveAutonomy = false;
  return redactSecrets(profile);
}

export function buildAccountProfileStatus({ profiles = ACCOUNT_PROFILES, pnl = {}, exposure = {} } = {}) {
  return Object.values(profiles).map((profile) => redactSecrets({
    ...profile,
    pnl: pnl[profile.id] || { realized: 0, unrealized: 0 },
    exposure: exposure[profile.id] || { notional: 0, symbols: [] }
  }));
}
