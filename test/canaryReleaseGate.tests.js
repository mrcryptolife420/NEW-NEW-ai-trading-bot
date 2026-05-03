import { buildCanaryReleaseGate, buildCanaryReleaseSummary } from "../src/runtime/canaryReleaseGate.js";
import path from "node:path";

export async function registerCanaryReleaseGateTests({ runCheck, assert, fs, os, runCli }) {
  await runCheck("canary release gate blocks promotion with low samples", async () => {
    const gate = buildCanaryReleaseGate({
      requestedState: "paper",
      evidence: { paperTrades: 3, source: "paper" },
      config: { botMode: "paper", canaryMinSamples: 20 }
    });
    assert.equal(gate.status, "blocked");
    assert.ok(gate.blockingReasons.includes("insufficient_samples"));
    assert.equal(gate.autoPromotesLive, false);
  });

  await runCheck("canary release gate blocks paper-only evidence from live promotion", async () => {
    const gate = buildCanaryReleaseGate({
      requestedState: "canary",
      evidence: { paperTrades: 50, liveTrades: 0, source: "paper" },
      paperLiveParity: { status: "passed", parityScore: 0.9 },
      safetyReview: { passed: true },
      config: { botMode: "paper", canaryMinSamples: 20 }
    });
    assert.equal(gate.status, "blocked");
    assert.ok(gate.blockingReasons.includes("paper_only_evidence_cannot_promote_live"));
    assert.equal(gate.allowedState, "shadow");
  });

  await runCheck("canary release gate blocks failed paper live parity", async () => {
    const gate = buildCanaryReleaseGate({
      currentState: "paper",
      requestedState: "canary",
      evidence: { paperTrades: 40, liveTrades: 5, source: "mixed" },
      paperLiveParity: { status: "failed", fillModelTooOptimistic: true },
      safetyReview: { passed: true },
      config: { botMode: "paper", canaryMinSamples: 20 }
    });
    assert.equal(gate.status, "blocked");
    assert.ok(gate.blockingReasons.includes("paper_live_parity_not_passed"));
  });

  await runCheck("canary release gate allows reviewed canary candidate", async () => {
    const gate = buildCanaryReleaseGate({
      currentState: "paper",
      requestedState: "canary",
      evidence: { paperTrades: 40, liveTrades: 5, source: "mixed" },
      paperLiveParity: { status: "passed", parityScore: 0.86 },
      antiOverfit: { status: "allowed", reasons: [] },
      safetyReview: { passed: true },
      config: { botMode: "paper", canaryMinSamples: 20 }
    });
    assert.equal(gate.status, "allowed");
    assert.equal(gate.allowedState, "canary");
    assert.equal(gate.autoPromotesLive, false);
  });

  await runCheck("canary release gate surfaces rollback recommendation", async () => {
    const gate = buildCanaryReleaseGate({
      currentState: "canary",
      requestedState: "limited_live",
      evidence: { paperTrades: 40, liveTrades: 25, source: "mixed" },
      rollbackWatch: { status: "rollback_recommended" },
      paperLiveParity: { status: "passed", parityScore: 0.9 },
      safetyReview: { passed: true },
      canaryReview: { passed: true },
      config: { botMode: "paper", canaryMinSamples: 20 }
    });
    assert.equal(gate.status, "blocked");
    assert.ok(gate.blockingReasons.includes("rollback_recommended"));
    assert.equal(buildCanaryReleaseSummary([gate]).status, "blocked");
  });

  await runCheck("canary status CLI is read-only and graceful without runtime data", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "canary-status-"));
    const output = [];
    const originalLog = console.log;
    console.log = (line) => output.push(line);
    try {
      await runCli({
        command: "canary:status",
        args: [],
        config: { runtimeDir, botMode: "paper" },
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        processState: { exitCode: 1 }
      });
    } finally {
      console.log = originalLog;
    }
    const parsed = JSON.parse(output.join("\n"));
    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.summary.total, 1);
    assert.equal(parsed.gates[0].autoPromotesLive, false);
  });
}
