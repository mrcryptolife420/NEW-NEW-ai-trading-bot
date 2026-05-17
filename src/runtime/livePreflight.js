import { buildLiveReadinessAudit } from "./liveReadinessAudit.js";

function check(id, passed, detail = null) {
  return { id, status: passed ? "passed" : "failed", passed: Boolean(passed), detail };
}

function isDemoEndpoint(config = {}) {
  return `${config.binanceApiBaseUrl || ""}`.toLowerCase().includes("demo-api.binance.com");
}

function buildProductionEvidence({ runtime = {}, account = {}, exchangeSummary = {} } = {}) {
  const clockHealth = runtime.clockHealth || runtime.timeSync || {};
  const driftMs = Number(clockHealth.driftMs ?? clockHealth.clockDriftMs);
  const apiPermissions = runtime.exchangeTruth?.apiPermissions || runtime.accountPermissions || {
    canTrade: account.canTrade,
    permissions: account.permissions || []
  };
  const streamHealth = runtime.streamHealth || {};
  const restHealth = runtime.ops?.apiDegradationSummary || {};
  return {
    readOnly: true,
    clockHealth: {
      status: Number.isFinite(driftMs) && Math.abs(driftMs) > 1000 ? "warning" : clockHealth.status || "unknown",
      driftMs: Number.isFinite(driftMs) ? driftMs : null
    },
    apiPermissions: {
      canTrade: apiPermissions.canTrade ?? null,
      withdraw: apiPermissions.withdraw ?? null,
      permissions: apiPermissions.permissions || account.permissions || []
    },
    streamHealth: {
      status: streamHealth.status || "unknown",
      userStreamStatus: streamHealth.userStream?.status || null
    },
    restHealth: {
      status: restHealth.degradationLevel || restHealth.status || "unknown",
      blockedActions: restHealth.blockedActions || []
    },
    protectiveOrderTruth: {
      staleProtectiveSymbols: exchangeSummary.staleProtectiveSymbols || runtime.exchangeTruth?.staleProtectiveSymbols || [],
      freezeEntries: Boolean(exchangeSummary.freezeEntries || runtime.exchangeTruth?.freezeEntries)
    }
  };
}

export function buildLivePreflight({ config = {}, runtime = {}, doctor = {}, exchangeSummary = {}, promotionDossier = {}, rollbackWatch = {} } = {}) {
  const account = doctor.account || doctor.broker || doctor;
  const permissions = Array.isArray(account.permissions) ? account.permissions : [];
  const productionEvidence = buildProductionEvidence({ runtime, account, exchangeSummary });
  const readiness = buildLiveReadinessAudit({
    config,
    doctor,
    runtimeState: runtime,
    exchangeSummary: exchangeSummary || runtime.exchangeTruth || {},
    promotionDossier,
    rollbackWatch
  });
  const checks = [
    check("acknowledgement", config.liveTradingAcknowledged === "I_UNDERSTAND_LIVE_TRADING_RISK", "LIVE_TRADING_ACKNOWLEDGED"),
    check("api_credentials", Boolean(config.binanceApiKey && config.binanceApiSecret), "BINANCE_API_KEY and BINANCE_API_SECRET"),
    check("exchange_protection", config.enableExchangeProtection === true, "ENABLE_EXCHANGE_PROTECTION=true"),
    check("demo_endpoint_block", !isDemoEndpoint(config) && config.paperExecutionVenue !== "binance_demo_spot", "Live must not use demo spot endpoint or paper demo venue"),
    check("account_can_trade", account.canTrade === true, account.canTrade === undefined ? "unknown" : account.canTrade),
    check("spot_permission", permissions.includes("SPOT"), permissions.length ? permissions : "unknown"),
    check("unresolved_execution_intents", !readiness.blockingReasons.includes("unresolved_execution_intents"), "runtime order lifecycle"),
    check("critical_alerts", !readiness.blockingReasons.includes("critical_alert_active"), "runtime alerts"),
    check("clock_health", productionEvidence.clockHealth.status !== "warning" || config.botMode !== "live", productionEvidence.clockHealth),
    check("api_withdraw_disabled", productionEvidence.apiPermissions.withdraw !== true, productionEvidence.apiPermissions),
    check("stream_rest_health", !(productionEvidence.restHealth.blockedActions || []).includes("open_new_entries"), productionEvidence.restHealth),
    check("protective_order_truth", !productionEvidence.protectiveOrderTruth.freezeEntries && !productionEvidence.protectiveOrderTruth.staleProtectiveSymbols.length, productionEvidence.protectiveOrderTruth)
  ];
  const safeToStartLive = config.botMode === "live" && checks.every((item) => item.passed) && readiness.status !== "blocked";
  return {
    status: safeToStartLive ? "ready" : "blocked",
    safeToStartLive,
    readOnly: true,
    checks,
    productionEvidence,
    readiness,
    blockingReasons: [
      ...new Set([
        ...checks.filter((item) => !item.passed).map((item) => item.id),
        ...readiness.blockingReasons
      ])
    ]
  };
}
