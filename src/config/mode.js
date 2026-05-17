export function resolveModeMatrix(config = {}) {
  const botMode = `${config.botMode || "paper"}`.trim().toLowerCase();
  const paperExecutionVenue = `${config.paperExecutionVenue || "internal"}`.trim().toLowerCase();
  const accountProfile = `${config.accountProfile || (botMode === "live" ? "live" : paperExecutionVenue === "binance_demo_spot" ? "demo" : "paper")}`.trim().toLowerCase();
  const exchangeProvider = `${config.exchangeProvider || "binance"}`.trim().toLowerCase();
  return {
    botMode,
    paperExecutionVenue,
    accountProfile,
    exchangeProvider,
    label: botMode === "live" ? "Live / Binance Spot" : paperExecutionVenue === "binance_demo_spot" ? "Paper / Binance Demo Spot" : "Paper / internal"
  };
}

export function isInternalPaper(config = {}) {
  const mode = resolveModeMatrix(config);
  return mode.botMode === "paper" && mode.paperExecutionVenue === "internal";
}

export function isDemoPaper(config = {}) {
  const mode = resolveModeMatrix(config);
  return mode.botMode === "paper" && mode.paperExecutionVenue === "binance_demo_spot";
}

export function isLive(config = {}) {
  return resolveModeMatrix(config).botMode === "live";
}

export function isLiveUnsafe(config = {}) {
  const mode = resolveModeMatrix(config);
  return mode.botMode === "live" && (
    mode.paperExecutionVenue !== "internal"
    || !config.binanceApiKey
    || !config.binanceApiSecret
    || config.enableExchangeProtection !== true
    || config.liveTradingAcknowledged !== "I_UNDERSTAND_LIVE_TRADING_RISK"
    || `${config.binanceApiBaseUrl || ""}`.toLowerCase().includes("demo-api.binance.com")
  );
}
