export const REST_BAN_ENTRY_BLOCK_REASON = "binance_rest_ban_active";
export const REST_BAN_API_DEGRADATION_REASON = "binance_ban_or_418";

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRestBanPauseSummary(requestWeight = {}, { at = new Date().toISOString(), nowMs = Date.now() } = {}) {
  const banUntil = finiteNumber(requestWeight?.banUntil);
  const remainingMs = banUntil != null ? Math.max(0, banUntil - nowMs) : null;
  const active = Boolean(requestWeight?.banActive || (banUntil != null && banUntil > nowMs));
  const nextRetryAt = banUntil != null && banUntil > 0 ? new Date(banUntil).toISOString() : null;
  return {
    active,
    reason: REST_BAN_ENTRY_BLOCK_REASON,
    nextRetryAt,
    remainingMs,
    requestWeight: {
      ...(requestWeight || {}),
      banActive: active,
      banRemainingMs: remainingMs
    },
    apiDegradationSummary: {
      status: active ? "blocked" : "ready",
      degradationLevel: active ? "full_outage" : "none",
      reasons: active ? [REST_BAN_API_DEGRADATION_REASON] : [],
      blockedActions: active ? ["open_new_entries"] : [],
      retryAfterMs: remainingMs,
      nextRetryAt,
      diagnosticsOnly: true,
      liveBehaviorChanged: false
    },
    service: {
      lastHeartbeatAt: at,
      watchdogStatus: active ? "paused_rate_limit_ban" : "running",
      nextRetryAt
    },
    nextSafeAction: active
      ? "wait_for_binance_rest_ban_until_or_reduce_request_pressure"
      : "monitor_next_cycle"
  };
}
