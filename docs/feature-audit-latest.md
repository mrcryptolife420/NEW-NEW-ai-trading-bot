# Feature Audit

Schema version: 2
Status: complete

| Feature | Priority | Status | Activation | Live policy | Missing dashboard fields | Tests required |
| --- | --- | --- | --- | --- | --- | --- |
| breakout_retest | complete | complete | paper_only | No live auto-promotion; paper-only remains the safe default. | - | test/breakoutRetestStrategy.tests.js, test/run.js |
| dynamic_exit_levels | complete | complete | paper_only | No live behavior change in the completion batch; live remains conservative while dynamicExitPaperOnly is true. | position.dynamicExitLevels, position.suggestedStopPct, position.suggestedTakeProfitPct | test/dashboardSnapshot.tests.js |
| exit_intelligence_v2 | complete | complete | diagnostics_only | No live behavior change in the completion batch; future live use may only tighten exits after review. | position.exitIntelligenceV2, position.exitQuality, position.currentExitRecommendation | test/dashboardSnapshot.tests.js |
| failed_breakout_detector | complete | complete | diagnostics_only | Future live behavior may only add caution/blocking for negative evidence; no positive live relief. | candidate.failedBreakoutDetector, candidate.falseBreakoutRisk | test/failedBreakoutDetectorIntegration.tests.js, test/dashboardSnapshot.tests.js |
| funding_oi_matrix | complete | complete | diagnostics_only | Diagnostics first; future live use may only add negative risk drag when data quality is sufficient. | marketContext.fundingOiMatrix, marketContext.fundingOiMatrixStatus | test/fundingOiMatrixIntegration.tests.js, test/dashboardSnapshot.tests.js |
| indicator_feature_registry | complete | complete | paper_only | No live behavior change; existing paper-scoring flag remains the only scoring gate. | candidate.indicatorRegistry, candidate.topPositiveFeatures, candidate.topNegativeFeatures, candidate.missingIndicatorFeatures | test/dashboardSnapshot.tests.js |
| leadership_context | complete | complete | diagnostics_only | Diagnostics first; positive signals cannot lower live thresholds without a separate review. | candidate.leadershipContext, marketContext.btcEthLeadership | test/leadershipContextIntegration.tests.js, test/dashboardSnapshot.tests.js |
| net_edge_gate | complete | complete | diagnostics_only | Future live behavior may only block or add caution when enabled; no threshold lowering or softening. | candidate.netEdgeGate, decision.netEdgeGate, candidate.netExecutableExpectancyScore | test/netEdgeGateIntegration.tests.js, test/dashboardSnapshot.tests.js |
| sector_rotation | complete | complete | diagnostics_only | No live behavior change; keep as market diagnostics until evidence supports allocator use. | marketContext.sectorRotation, marketContext.sectorRotationScore | test/dashboardSnapshot.tests.js |
| spot_futures_divergence | complete | complete | diagnostics_only | Diagnostics first; future live use may only add caution for adverse divergence. | marketContext.spotFuturesDivergence, marketContext.spotFuturesDivergenceStatus | test/leadershipContextIntegration.tests.js, test/dashboardSnapshot.tests.js |
| trade_quality_analytics | complete | complete | diagnostics_only | No live behavior change; analytics are observational and journal/report-only. | trade.maximumFavorableExcursionPct, trade.maximumAdverseExcursionPct, trade.exitEfficiencyPct, report.tradeQualitySummary | test/dashboardSnapshot.tests.js |
| walk_forward_backtest | complete | complete | diagnostics_only | Offline only; no live behavior. | - | test/featureAudit.tests.js, test/walkForwardBacktest.tests.js |

## Config placeholder actions

| Flag | Action | Next safe action |
| --- | --- | --- |
| canaryTradingEnabled | keep | keep_disabled_until_canary_operator_workflow_is_reviewed |
| enableCvdConfirmation | deprecate | deprecate_or_wire_umbrella_flag_after_replay_review |
| enableLiquidationMagnetContext | map-to-provider | map_to_provider_flag_or_deprecate_after_config_registry_pass |
| enablePriceActionStructure | map-to-provider | deprecate_or_wire_to_indicator_registry_after_replay_review |
| enableStrategyRouter | keep | deprecate_after_operator_config_migration |
| enableTrailingProtection | map-to-provider | deprecate_or_wire_to_exit_policy_after_live_safety_review |
