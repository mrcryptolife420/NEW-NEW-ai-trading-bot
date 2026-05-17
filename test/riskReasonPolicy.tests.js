import {
  classifyReasonCategory,
  isSoftPaperReason,
  normalizeDecisionReasons,
  reasonSeverity
} from "../src/risk/policies/reasonPolicy.js";

export async function registerRiskReasonPolicyTests({ runCheck, assert }) {
  await runCheck("risk reason policy preserves category severity and sorting contracts", async () => {
    assert.equal(isSoftPaperReason("model_confidence_too_low"), true);
    assert.equal(classifyReasonCategory("exchange_safety_blocked"), "safety");
    assert.equal(classifyReasonCategory("portfolio_cvar_budget_cooled"), "risk");
    assert.equal(reasonSeverity("exchange_safety_blocked"), 5);
    assert.equal(reasonSeverity("execution_cost_budget_exceeded"), 1);
    assert.deepEqual(
      normalizeDecisionReasons(["model_confidence_too_low", "exchange_safety_blocked", "model_confidence_too_low"]),
      ["exchange_safety_blocked", "model_confidence_too_low"]
    );
  });
}
