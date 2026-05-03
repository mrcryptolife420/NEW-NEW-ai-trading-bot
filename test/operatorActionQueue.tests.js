import path from "node:path";
import {
  buildOperatorActionQueue,
  hasBlockingOperatorActions,
  normalizeOperatorAction
} from "../src/runtime/operatorActionQueue.js";
import { buildLiveReadinessAudit } from "../src/runtime/liveReadinessAudit.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerOperatorActionQueueTests({ runCheck, assert, fs, os, runCli }) {
  await runCheck("operator action queue normalizes severity urgency and action fields", async () => {
    const action = normalizeOperatorAction({
      id: "exchange_safety_blocked",
      severity: "CRITICAL",
      reason: "exchange_truth_freeze",
      title: "Exchange freeze",
      at: "2026-05-04T10:00:00.000Z"
    }, { nowIso: "2026-05-04T10:05:00.000Z" });
    assert.equal(action.severity, "critical");
    assert.equal(action.urgency, "immediate");
    assert.equal(action.blocking, true);
    assert.equal(action.recommendedAction, "run_exchange_safety_status_and_reconcile_plan");
    assert.equal(action.createdAt, "2026-05-04T10:00:00.000Z");
    assert.equal(action.lastSeenAt, "2026-05-04T10:00:00.000Z");
  });

  await runCheck("operator action queue dedupes and keeps highest severity", async () => {
    const queue = buildOperatorActionQueue({
      nowIso: "2026-05-04T10:00:00.000Z",
      alerts: [
        { id: "same", dedupeKey: "k1", severity: "low", action: "first" },
        { id: "same", dedupeKey: "k1", severity: "high", action: "second" },
        { id: "other", severity: "medium" }
      ]
    });
    assert.equal(queue.totalCount, 2);
    assert.equal(queue.items[0].dedupeKey, "k1");
    assert.equal(queue.items[0].severity, "high");
    assert.equal(queue.items[0].recommendedAction, "second");
  });

  await runCheck("operator action queue resolved alerts are not active blockers", async () => {
    const queue = buildOperatorActionQueue({
      alerts: [
        { id: "exchange_safety_blocked", severity: "critical", resolvedAt: "2026-05-04T10:00:00.000Z" }
      ]
    });
    assert.equal(queue.activeCount, 0);
    assert.equal(queue.criticalBlockingCount, 0);
    assert.equal(queue.status, "clear");
    assert.equal(hasBlockingOperatorActions(queue), false);
  });

  await runCheck("critical operator actions block live readiness", async () => {
    const queue = buildOperatorActionQueue({
      alerts: [{ id: "exchange_reconcile_required", severity: "critical", reason: "reconcile_required" }]
    });
    const audit = buildLiveReadinessAudit({
      config: {
        liveTradingAcknowledged: "I_UNDERSTAND_LIVE_TRADING_RISK",
        binanceApiKey: "k",
        binanceApiSecret: "s",
        enableExchangeProtection: true
      },
      runtimeState: { operatorActionQueueSummary: queue },
      promotionDossier: { status: "ready" },
      rollbackWatch: { status: "normal" }
    });
    assert.equal(queue.status, "blocked");
    assert.equal(audit.status, "blocked");
    assert.ok(audit.blockingReasons.includes("critical_operator_action_active"));
  });

  await runCheck("dashboard normalizer keeps operator action queue optional", async () => {
    const minimal = normalizeDashboardSnapshotPayload({});
    assert.equal(minimal.operatorActionQueueSummary.status, "clear");
    assert.equal(minimal.operatorActionQueueSummary.activeCount, 0);
    const nested = normalizeDashboardSnapshotPayload({
      ops: {
        operatorActionQueue: {
          status: "blocked",
          criticalBlockingCount: 1,
          items: [{ id: "exchange_safety_blocked" }]
        }
      }
    });
    assert.equal(nested.operatorActionQueueSummary.status, "blocked");
    assert.equal(nested.operatorActionQueueSummary.criticalBlockingCount, 1);
  });

  await runCheck("actions list CLI is read-only and graceful without runtime alerts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "actions-list-"));
    const runtimeDir = path.join(root, "runtime");
    const output = [];
    const previousLog = console.log;
    console.log = (line) => output.push(line);
    try {
      await runCli({
        command: "actions:list",
        args: [],
        config: { runtimeDir, operatorActionQueueMaxItems: 20 },
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        processState: { exitCode: 1 }
      });
    } finally {
      console.log = previousLog;
    }
    const parsed = JSON.parse(output.join("\n"));
    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.status, "clear");
    assert.equal(parsed.activeCount, 0);
  });
}
