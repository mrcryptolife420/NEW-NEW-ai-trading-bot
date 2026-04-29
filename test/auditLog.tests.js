import fsSync from "node:fs";
import { AuditLogService } from "../src/runtime/auditLogService.js";
import { AuditLogStore } from "../src/storage/auditLogStore.js";

export async function registerAuditLogTests({ runCheck, assert, fs, os, path }) {
  await runCheck("audit log service persists ndjson events and summarizes recent activity", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-audit-log-"));
    const store = new AuditLogStore(runtimeDir, { retentionDays: 7 });
    const service = new AuditLogService({ store });
    await service.init();
    await service.record("signal_decision", {
      at: "2026-04-21T10:00:00.000Z",
      status: "candidate_blocked",
      symbol: "BTCUSDT",
      reasonCodes: ["max_total_exposure"]
    });
    await service.record("execution_result", {
      at: "2026-04-21T10:01:00.000Z",
      status: "blocked",
      symbol: "BTCUSDT",
      reasonCodes: ["exchange_truth_freeze"]
    });
    const todayFile = store.resolveFilePath("2026-04-21T10:01:00.000Z");
    const lines = fsSync.readFileSync(todayFile, "utf8").trim().split(/\r?\n/);
    const summary = await service.buildSummary({ limit: 20 });
    assert.equal(lines.length, 2);
    assert.equal(summary.status, "active");
    assert.equal(summary.countsByKind.signal_decision, 1);
    assert.equal(summary.countsByStatus.blocked, 1);
    assert.equal(summary.topRejectionCodes[0].code, "exchange_truth_freeze");
  });

  await runCheck("audit log summary tracks adaptive rollbacks and execution failures", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-audit-log-summary-"));
    const store = new AuditLogStore(runtimeDir, { retentionDays: 7 });
    const service = new AuditLogService({ store });
    await service.record("adaptive_change", {
      at: "2026-04-21T12:00:00.000Z",
      status: "rolled_back",
      symbol: "SOLUSDT",
      reasonCodes: ["manual_rollback"]
    });
    await service.record("execution_result", {
      at: "2026-04-21T12:01:00.000Z",
      status: "failed",
      symbol: "SOLUSDT",
      reasonCodes: ["exchange_timeout"]
    });
    const summary = await service.buildSummary({ limit: 20 });
    assert.equal(summary.recentAdaptiveChanges[0].status, "rolled_back");
    assert.equal(summary.recentExecutionFailures[0].reasonCodes[0], "exchange_timeout");
  });
}
