import {
  buildFeatureActivationDecision,
  normalizeFeatureActivationStage,
  summarizeFeatureActivationDecisions
} from "../src/runtime/featureActivationGovernor.js";

function assertFiniteTree(assert, value, path = "value") {
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, `${path} must be finite`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assertFiniteTree(assert, child, `${path}.${key}`);
  }
}

export async function registerFeatureActivationGovernorTests({ runCheck, assert }) {
  await runCheck("feature activation defaults unknown and unsafe features to diagnostics only", async () => {
    const decision = buildFeatureActivationDecision({
      feature: { id: "new_indicator" },
      requestedStage: "paper_only",
      config: { botMode: "paper", allowAutoPaperFeatureActivation: true }
    });
    assert.equal(normalizeFeatureActivationStage("unknown_stage"), "diagnostics_only");
    assert.equal(decision.effectiveStage, "diagnostics_only");
    assert.equal(decision.diagnosticsOnly, true);
    assert.equal(decision.paperImpactAllowed, false);
    assert.equal(decision.liveImpactAllowed, false);
    assert.equal(decision.reasons.includes("feature_not_fallback_safe"), true);
    assert.equal(decision.reasons.includes("feature_missing_tests"), true);
    assertFiniteTree(assert, decision);
  });

  await runCheck("feature activation allows shadow only only after fallback safety and tests", async () => {
    const blocked = buildFeatureActivationDecision({
      feature: { id: "shadow_candidate", fallbackSafe: true },
      requestedStage: "shadow_only"
    });
    const allowed = buildFeatureActivationDecision({
      feature: { id: "shadow_candidate", fallbackSafe: true, testsPassed: true },
      requestedStage: "shadow_only"
    });
    assert.equal(blocked.effectiveStage, "diagnostics_only");
    assert.equal(blocked.reasons.includes("feature_missing_tests"), true);
    assert.equal(allowed.effectiveStage, "shadow_only");
    assert.equal(allowed.shadowOnly, true);
    assert.equal(allowed.liveImpactAllowed, false);
  });

  await runCheck("feature activation promotes to paper only only in paper mode with explicit config", async () => {
    const noConfig = buildFeatureActivationDecision({
      feature: { id: "paper_candidate", fallbackSafe: true, testsPassed: true },
      requestedStage: "paper_only",
      config: { botMode: "paper" }
    });
    const liveMode = buildFeatureActivationDecision({
      feature: { id: "paper_candidate", fallbackSafe: true, testsPassed: true },
      requestedStage: "paper_only",
      config: { botMode: "live", allowAutoPaperFeatureActivation: true }
    });
    const paper = buildFeatureActivationDecision({
      feature: { id: "paper_candidate", fallbackSafe: true, testsPassed: true },
      requestedStage: "paper_only",
      config: { botMode: "paper", allowAutoPaperFeatureActivation: true }
    });
    assert.equal(noConfig.effectiveStage, "shadow_only");
    assert.equal(noConfig.reasons.includes("paper_activation_requires_explicit_config"), true);
    assert.equal(liveMode.effectiveStage, "shadow_only");
    assert.equal(liveMode.reasons.includes("paper_activation_requires_paper_bot_mode"), true);
    assert.equal(paper.effectiveStage, "paper_only");
    assert.equal(paper.paperImpactAllowed, true);
    assert.equal(paper.liveImpactAllowed, false);
    assert.equal(paper.hardSafetyInvariant.paperMayBypassHardSafety, false);
  });

  await runCheck("feature activation blocks hard safety bypass even in paper mode", async () => {
    const decision = buildFeatureActivationDecision({
      feature: { id: "unsafe_relaxation", fallbackSafe: true, testsPassed: true, hardSafetyBypass: true },
      requestedStage: "paper_only",
      config: { botMode: "paper", allowAutoPaperFeatureActivation: true }
    });
    assert.equal(decision.effectiveStage, "diagnostics_only");
    assert.equal(decision.paperImpactAllowed, false);
    assert.equal(decision.reasons.includes("hard_safety_bypass_forbidden"), true);
    assert.equal(decision.hardSafetyInvariant.hardSafetyBypassAllowed, false);
  });

  await runCheck("feature activation forbids automatic live promotion and requires safety evidence", async () => {
    const blocked = buildFeatureActivationDecision({
      feature: { id: "live_candidate", fallbackSafe: true, testsPassed: true, autoPromote: true },
      requestedStage: "canary",
      config: { botMode: "live", allowLiveFeatureActivation: true },
      antiOverfitReview: { status: "allowed" },
      paperLiveParitySummary: { status: "aligned" },
      safetyReview: { passed: true },
      canaryReview: { passed: true }
    });
    const allowed = buildFeatureActivationDecision({
      feature: { id: "live_candidate", fallbackSafe: true, testsPassed: true },
      requestedStage: "canary",
      config: { botMode: "live", allowLiveFeatureActivation: true },
      antiOverfitReview: { status: "allowed" },
      paperLiveParitySummary: { status: "aligned" },
      safetyReview: { passed: true },
      canaryReview: { passed: true }
    });
    assert.equal(blocked.liveImpactAllowed, false);
    assert.equal(blocked.reasons.includes("automatic_live_promotion_forbidden"), true);
    assert.equal(allowed.effectiveStage, "canary");
    assert.equal(allowed.liveImpactAllowed, true);
    assert.equal(allowed.hardSafetyInvariant.automaticLivePromotionAllowed, false);
  });

  await runCheck("feature activation keeps live candidates out when anti-overfit or parity fails", async () => {
    const decision = buildFeatureActivationDecision({
      feature: { id: "live_candidate", fallbackSafe: true, testsPassed: true },
      requestedStage: "normal_live",
      config: { botMode: "live", allowLiveFeatureActivation: true },
      antiOverfitReview: { status: "blocked", reasons: ["low_samples"] },
      paperLiveParitySummary: { status: "paper_too_optimistic" },
      safetyReview: { passed: true },
      canaryReview: { passed: true }
    });
    assert.equal(decision.effectiveStage, "shadow_only");
    assert.equal(decision.liveImpactAllowed, false);
    assert.equal(decision.reasons.includes("anti_overfit_review_blocked"), true);
    assert.equal(decision.reasons.includes("paper_live_parity_not_ready"), true);
  });

  await runCheck("feature activation summary counts stages and flags live review", async () => {
    const summary = summarizeFeatureActivationDecisions([
      buildFeatureActivationDecision({ feature: { id: "a" } }),
      buildFeatureActivationDecision({
        feature: { id: "b", fallbackSafe: true, testsPassed: true },
        requestedStage: "shadow_only"
      }),
      buildFeatureActivationDecision({
        feature: { id: "c", fallbackSafe: true, testsPassed: true },
        requestedStage: "canary",
        config: { botMode: "live", allowLiveFeatureActivation: true },
        antiOverfitReview: { status: "allowed" },
        paperLiveParitySummary: { status: "aligned" },
        safetyReview: { passed: true },
        canaryReview: { passed: true }
      })
    ]);
    assert.equal(summary.count, 3);
    assert.equal(summary.countsByStage.diagnostics_only, 1);
    assert.equal(summary.countsByStage.shadow_only, 1);
    assert.equal(summary.countsByStage.canary, 1);
    assert.equal(summary.status, "live_review_required");
    assertFiniteTree(assert, summary);
  });
}
