import { buildLatencyProfilerReport } from "../src/runtime/latencyProfiler.js";

export async function registerLatencyProfilerTests({ runCheck, assert }) {
  await runCheck("latency profiler computes stage percentiles and bottleneck", async () => {
    const report = buildLatencyProfilerReport({
      events: [
        {
          timestamps: {
            stream: "2026-05-08T10:00:00.000Z",
            signal: "2026-05-08T10:00:00.100Z",
            risk: "2026-05-08T10:00:00.150Z",
            intent: "2026-05-08T10:00:00.180Z",
            submit: "2026-05-08T10:00:00.260Z",
            ack: "2026-05-08T10:00:00.500Z",
            fill: "2026-05-08T10:00:00.650Z",
            dashboard: "2026-05-08T10:00:01.000Z"
          }
        }
      ]
    });

    assert.equal(report.status, "ready");
    assert.equal(report.stages.streamToSignalMs.p50, 100);
    assert.equal(report.stages.submitToAckMs.p95, 240);
    assert.equal(report.biggestBottleneck, "dashboardUpdateMs");
    assert.equal(report.diagnosticsOnly, true);
    assert.equal(report.liveBehaviorChanged, false);
  });

  await runCheck("latency profiler is fallback-safe with missing events", async () => {
    const report = buildLatencyProfilerReport({});
    assert.equal(report.status, "empty");
    assert.equal(report.eventCount, 0);
    assert.equal(report.biggestBottleneck, "insufficient_latency_samples");
    assert.ok(report.warnings.includes("latency_events_missing"));
    for (const summary of Object.values(report.stages)) {
      assert.equal(Number.isFinite(summary.p95), true);
      assert.equal(Number.isFinite(summary.average), true);
    }
  });

  await runCheck("latency profiler ignores impossible negative timestamp spans", async () => {
    const report = buildLatencyProfilerReport({
      events: [
        {
          timestamps: {
            stream: "2026-05-08T10:00:01.000Z",
            signal: "2026-05-08T10:00:00.000Z"
          }
        }
      ]
    });
    assert.equal(report.stages.streamToSignalMs.count, 0);
    assert.equal(report.stages.streamToSignalMs.p95, 0);
  });
}
