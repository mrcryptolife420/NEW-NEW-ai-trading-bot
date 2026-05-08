import {
  buildLiveFastObserveDecision,
  summarizeLiveFastObserve
} from "../src/runtime/liveFastObserveMode.js";

export function registerLiveFastObserveModeTests({ runCheck, assert }) {
  runCheck("live-fast observe simulates live action without execution impact", () => {
    const observation = buildLiveFastObserveDecision({
      config: { botMode: "live", liveFastObserveOnly: true },
      fastCandidate: { symbol: "BTCUSDT", probability: 0.73, createdAtMs: 1000 },
      normalDecision: { symbol: "BTCUSDT", approved: false, probability: 0.68, createdAtMs: 4000 },
      preflight: { allow: true }
    });
    assert.equal(observation.observeOnly, true);
    assert.equal(observation.fastWouldExecute, true);
    assert.equal(observation.liveBehaviorChanged, false);
    assert.equal(observation.reasons.includes("live_observe_only_no_execution"), true);
  });

  runCheck("live-fast observe records blocked fast signals", () => {
    const observation = buildLiveFastObserveDecision({
      config: { botMode: "live", liveFastObserveOnly: true },
      fastCandidate: { symbol: "ETHUSDT", probability: 0.8 },
      normalDecision: { symbol: "ETHUSDT", approved: true, probability: 0.78 },
      preflight: { allow: false, reasonCodes: ["exchange_safety_blocked"] }
    });
    assert.equal(observation.fastWouldExecute, false);
    assert.equal(observation.reasons.includes("fast_blocked:exchange_safety_blocked"), true);
  });

  runCheck("live-fast observe flags likely false triggers", () => {
    const observation = buildLiveFastObserveDecision({
      config: { botMode: "paper", liveFastObserveOnly: true },
      fastCandidate: { symbol: "SOLUSDT", probability: 0.7 },
      normalDecision: { symbol: "SOLUSDT", approved: true, probability: 0.78 },
      preflight: { allow: true }
    });
    assert.equal(observation.falseTrigger, true);
  });

  runCheck("live-fast observe summary measures faster opportunities and false triggers", () => {
    const summary = summarizeLiveFastObserve({
      observations: [
        { fastWouldExecute: true, normalWouldExecute: false, opportunityFasterMs: 3000, falseTrigger: false },
        { fastWouldExecute: true, normalWouldExecute: true, opportunityFasterMs: 1000, falseTrigger: true },
        { fastWouldExecute: false, normalWouldExecute: true, opportunityFasterMs: 0, falseTrigger: false }
      ]
    });
    assert.equal(summary.status, "observing");
    assert.equal(summary.fasterOpportunities, 1);
    assert.equal(summary.falseTriggers, 1);
    assert.equal(summary.blockedFastSignals, 1);
    assert.equal(summary.requiresOperatorApprovalForLiveFast, true);
  });
}
