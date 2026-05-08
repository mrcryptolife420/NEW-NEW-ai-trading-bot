export const EXCHANGE_CAPABILITY_MATRIX = {
  binance: { liveTrading: true, paperTrading: false, userStream: true, marketStream: true, oco: true, rateLimitTelemetry: true },
  paper: { liveTrading: false, paperTrading: true, userStream: false, marketStream: false, oco: false, rateLimitTelemetry: true },
  synthetic: { liveTrading: false, paperTrading: true, userStream: false, marketStream: true, oco: false, rateLimitTelemetry: true, deterministicData: true }
};

export function getExchangeCapabilities(provider = "binance") {
  return EXCHANGE_CAPABILITY_MATRIX[provider] || EXCHANGE_CAPABILITY_MATRIX.binance;
}
