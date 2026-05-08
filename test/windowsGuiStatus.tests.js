import { buildWindowsGuiStatus } from "../src/dashboard/guiStatus.js";

export async function registerWindowsGuiStatusTests({ runCheck, assert }) {
  await runCheck("windows gui status reports paper running and safe actions", async () => {
    const status = buildWindowsGuiStatus({
      snapshot: {
        manager: { runState: "running" },
        dashboard: {
          overview: { mode: "paper" },
          ops: { readiness: { status: "ready" }, dataFreshness: { status: "fresh" } }
        }
      },
      readiness: { ok: true, status: "ready", reasons: [] },
      config: { dashboardPort: 3011, enableExchangeProtection: true },
      projectRoot: "C:\\bot"
    });

    assert.equal(status.trayStatus, "paper");
    assert.equal(status.mode, "paper");
    assert.equal(status.safety.forceTradeAllowed, false);
    assert.equal(status.safety.exchangeFreezeOverrideAllowed, false);
    assert.equal(status.safety.exchangeProtectionEnabled, true);
    assert.equal(status.actions.canStartBot, true);
    assert.ok(status.paths.env.endsWith(".env"));
  });

  await runCheck("windows gui status highlights live mode without enabling unsafe actions", async () => {
    const status = buildWindowsGuiStatus({
      snapshot: {
        manager: { runState: "running" },
        dashboard: { overview: { mode: "live" } }
      },
      readiness: { ok: true, status: "ready" },
      config: { botMode: "live", enableExchangeProtection: true }
    });

    assert.equal(status.trayStatus, "live");
    assert.equal(status.mode, "live");
    assert.equal(status.safety.liveActionsRequireConfirmation, true);
    assert.equal(status.safety.reconcileOverrideAllowed, false);
    assert.match(status.liveWarning, /Live mode/);
  });

  await runCheck("windows gui status marks blocked safety state for tray", async () => {
    const status = buildWindowsGuiStatus({
      snapshot: {
        manager: { runState: "running" },
        dashboard: {
          overview: { mode: "paper" },
          safetySnapshot: { entryPermission: { allowed: false } },
          ops: {
            readiness: { status: "degraded" },
            alerts: { alerts: [{ severity: "critical" }] }
          }
        }
      },
      readiness: { ok: false, status: "degraded", reasons: ["exchange_safety_blocked"] },
      config: { enableExchangeProtection: true }
    });

    assert.equal(status.trayStatus, "blocked");
    assert.equal(status.readiness.ok, false);
    assert.equal(status.alerts.criticalCount, 1);
  });
}
