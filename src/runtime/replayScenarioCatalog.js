const SCENARIOS = [
  { id: "stream_warmup_local_book", category: "market_data_degradation", requiredAssertions: ["no_live_order", "local_book_waiting_visible"] },
  { id: "request_budget_cooldown_storm", category: "provider_cooldown", requiredAssertions: ["cooldown_deduped", "provider_impact_visible"] },
  { id: "dashboard_stop_profile_race", category: "lifecycle_race", requiredAssertions: ["no_invalid_transition", "profile_apply_reports_pending"] },
  { id: "stale_readmodel_snapshot", category: "dashboard_snapshot_drift", requiredAssertions: ["snapshot_stale_visible", "backend_truth_preserved"] },
  { id: "paper_persistence_failure", category: "paper_execution_lifecycle", requiredAssertions: ["paper_execution_not_live", "persistence_failure_visible"] },
  { id: "live_protection_ambiguous_cancel", category: "live_reconcile_protection", requiredAssertions: ["manual_review_required", "no_duplicate_sell"] },
  { id: "exchange_truth_mismatch", category: "live_reconcile_protection", requiredAssertions: ["entry_freeze", "exchange_truth_visible"] },
  { id: "confidence_collapse_stale_features", category: "model_confidence", requiredAssertions: ["root_cause_data_quality", "no_threshold_magic"] },
  { id: "news_shock_market_block", category: "market_safety", requiredAssertions: ["event_risk_blocker", "operator_reason_visible"] },
  { id: "storage_corruption_recovery", category: "storage_recovery", requiredAssertions: ["safe_degradation", "rebuild_hint_visible"] }
];

export function listReplayScenarios() {
  return SCENARIOS.map((scenario) => ({ ...scenario, requiredAssertions: [...scenario.requiredAssertions] }));
}

export function getReplayScenario(id) {
  return listReplayScenarios().find((scenario) => scenario.id === id) || null;
}

export function validateReplayPackManifest(manifest = {}) {
  const scenario = getReplayScenario(manifest.scenarioId);
  const assertions = Array.isArray(manifest.assertions) ? manifest.assertions : [];
  const missingAssertions = scenario ? scenario.requiredAssertions.filter((item) => !assertions.includes(item)) : [];
  return {
    valid: Boolean(scenario) && missingAssertions.length === 0 && Boolean(manifest.seed),
    scenarioId: manifest.scenarioId || null,
    category: scenario?.category || null,
    missingAssertions,
    requiresSeed: !manifest.seed
  };
}
