/**
 * Binance spot weigert MARKET SELL onder het MIN_NOTIONAL filter (vaak ~5 USDT).
 * Deze helpers detecteren die fout en bepalen of een synthetische exit (paper/demo bookkeeping) is toegestaan.
 */

export function isBinanceMinNotionalFilterError(error) {
  const code = error?.payload?.code;
  const msg = `${error?.payload?.msg || error?.message || ""}`;
  if (code === -1013) {
    return true;
  }
  return /min_notional|MIN_NOTIONAL|notional.*filter|filter failure/i.test(msg);
}

export function resolveAllowSyntheticMinNotionalExit(config = {}) {
  const flag = config.allowSyntheticMinNotionalExit;
  if (flag === true) {
    return true;
  }
  if (flag === false) {
    return false;
  }
  return config.botMode === "paper" && String(config.paperExecutionVenue || "").toLowerCase() === "binance_demo_spot";
}
