import { buildFastExecutionDashboardSummary } from "../src/dashboard/fastExecutionDashboard.js";

export function registerFastExecutionDashboardTests({ runCheck, assert }) {
  runCheck("fast execution dashboard summary exposes all Windows GUI panels safely", () => {
    const summary = buildFastExecutionDashboardSummary({
      config: {
        botMode: "paper",
        fastExecutionEnabled: false,
        fastExecutionPaperOnly: true,
        liveFastObserveOnly: true,
        hotSymbolMax: 12,
        fastExecutionCandidateTtlMs: 5000
      },
      snapshot: {
        manager: { runState: "running", currentMode: "paper" },
        dashboard: {
          overview: { mode: "paper" },
          topDecisions: [
            { symbol: "BTCUSDT", approved: false, rootBlocker: "model_confidence_too_low", latencyMs: 25 },
            { symbol: "ETHUSDT", approved: true, latencyMs: 12 }
          ],
          immediateEntryQueue: {
            size: 1,
            items: [{ symbol: "BTCUSDT", blockedReason: "market_data_stale", latencyMs: 42 }]
          },
          streamFreshness: { status: "fresh" },
          hotSymbols: [{ symbol: "BTCUSDT", reasons: ["near_threshold"] }],
          nearThreshold: [{ symbol: "BTCUSDT", band: "within_2pct" }],
          alerts: { items: [{ severity: "high", message: "check" }] }
        }
      }
    });
    assert.equal(summary.diagnosticsOnly, true);
    assert.equal(summary.liveBehaviorChanged, false);
    assert.equal(summary.panels.overview.available, true);
    assert.equal(summary.panels.tradingControl.available, true);
    assert.equal(summary.panels.fastExecution.queueSize, 1);
    assert.equal(summary.panels.tradeDebug.blockedEntries.length, 1);
    assert.equal(summary.panels.fastExecution.hotSymbols[0].symbol, "BTCUSDT");
    assert.equal(summary.panels.fastExecution.nearThreshold[0].band, "within_2pct");
    assert.equal(summary.panels.tradeDebug.filters.symbol, true);
  });

  runCheck("fast execution dashboard command palette marks risky actions as disabled or confirmed", () => {
    const summary = buildFastExecutionDashboardSummary({});
    const liveFast = summary.commandPalette.actions.find((item) => item.name === "enable_live_fast_execution");
    const reconcile = summary.commandPalette.actions.find((item) => item.name === "force_reconcile");
    assert.equal(liveFast.liveImpact, true);
    assert.equal(liveFast.confirmationRequired, true);
    assert.equal(liveFast.enabled, false);
    assert.equal(reconcile.confirmationRequired, true);
    assert.equal(summary.commandPalette.audit.auditIdReturnedAfterAction, true);
    assert.equal(summary.commandPalette.audit.everyActionLogged, true);
    assert.equal(summary.forbiddenActions.includes("override_exchange_freeze"), true);
  });

  runCheck("fast execution dashboard summary is fallback-safe for partial snapshots", () => {
    const summary = buildFastExecutionDashboardSummary({ snapshot: { dashboard: null }, config: null });
    assert.equal(summary.panels.fastExecution.available, true);
    assert.equal(summary.panels.fastExecution.queueSize, 0);
    assert.deepEqual(summary.panels.positions.openPositions, []);
    assert.equal(summary.panels.settings.canApplyProfileBlindly, false);
  });
}
