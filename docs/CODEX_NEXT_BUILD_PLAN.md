# Codex Next Build Plan

Generated: 2026-05-05

Purpose: code-grounded, non-duplicate roadmap for the next useful build work. This plan is intentionally paper-mode-first. It does not implement new trading behavior by itself.

## Safety Rules

- [ ] Live safety remains unchanged or stricter.
- [ ] No real Binance orders in tests.
- [ ] No force-unlock of exchange safety.
- [ ] Exchange safety, reconcile, manual review and unresolved execution intents remain hard blockers.
- [ ] Paper mode can learn, but hard-safety blockers cannot be relaxed.
- [ ] Healthy multi-position behavior must keep using `MAX_OPEN_POSITIONS`, `MAX_TOTAL_EXPOSURE_FRACTION`, `MAX_POSITION_FRACTION` and portfolio/family/regime limits.
- [ ] No hardcoded max-one-position behavior.
- [ ] New trading features start as `diagnostics_only`, `shadow_only` or `paper_only`.
- [ ] Paper-mode wiring must be explicit for every build item.
- [ ] Do not build duplicate modules when an existing module can be extended.

## Scan Basis

This plan is based on the current codebase scan of:

- `package.json`
- `docs/CODEX_EXECUTION_PLAN.md`
- `docs/IMPLEMENTATION_MATRIX.md`
- `docs/TRADING_FEATURE_INVENTORY.md`
- `docs/TRADING_QUALITY.md`
- `docs/CODEX_ADDITIONAL_RECOMMENDATIONS_B24_B31.md`
- `docs/DEBUG_AUDIT_REPORT.md`
- `docs/TRADING_PATH_INACTIVE_DEBUG.md`
- `src/ai`
- `src/backtest`
- `src/binance`
- `src/cli`
- `src/config`
- `src/dashboard`
- `src/events`
- `src/execution`
- `src/market`
- `src/news`
- `src/research`
- `src/risk`
- `src/runtime`
- `src/storage`
- `src/strategy`
- `src/utils`
- `test`

Current feature audit summary at scan time:

- 69 feature flags.
- 12 audited feature groups.
- 66 complete flag classifications.
- 10 live-risk-review-needed classifications.
- 5 documented config-only placeholders.
- `feature:audit` status: `review_required`, not failed.

Current runtime/status evidence at scan time:

- Paper mode is active.
- Readiness is degraded by `market_data_rest_pressure_guarded`.
- Candidate generation exists, but candidates were rejected by model/meta/data-quality reasons such as `model_confidence_too_low`, `meta_followthrough_caution`, `quality_quorum_degraded` and relative weakness.
- Market provider optional contexts are often disabled by config, so new work should first improve paper diagnostics and evidence capture rather than loosen entry gates.

## Existing Capabilities To Reuse, Not Rebuild

- Feature activation and promotion governance: `src/runtime/featureActivationGovernor.js`, `src/runtime/canaryReleaseGate.js`, `src/ai/antiOverfitGovernor.js`, `src/runtime/paperLiveParity.js`.
- Exchange safety and reconcile recovery: `src/execution/autoReconcileCoordinator.js`, `src/execution/reconcileEvidenceSummary.js`, `src/runtime/liveReadinessAudit.js`, `src/runtime/safetySnapshot.js`.
- Trading path diagnostics: `src/runtime/tradingPathHealth.js`, `src/runtime/marketSnapshotFlowDebug.js`, `src/runtime/apiDegradationPlanner.js`, `src/runtime/restBudgetGovernor.js`.
- Candidate and decision explainability: `src/runtime/candidateExplainability.js`, `src/runtime/decisionInputLineage.js`, `src/runtime/decisionSupportDiagnostics.js`, `src/runtime/decisionContract.js`.
- Strategy and indicator layers: `src/strategy/indicators.js`, `src/strategy/advancedIndicators.js`, `src/strategy/indicatorFeatureRegistry.js`, `src/strategy/indicatorRegimeScoring.js`, `src/strategy/setupThesis.js`, `src/strategy/exitPlanHints.js`, `src/strategy/failedBreakoutDetector.js`, `src/strategy/strategyRouter.js`.
- Market context modules: `src/market/derivativesContext.js`, `src/market/derivativesMatrix.js`, `src/market/leadershipContext.js`, `src/market/crossExchangeDivergence.js`, `src/market/stablecoinRisk.js`, `src/runtime/cryptoRegimeRouter.js`, `src/runtime/symbolLifecycleRisk.js`, `src/runtime/symbolQualityDecay.js`.
- Risk and portfolio modules: `src/risk/portfolioCrowding.js`, `src/risk/postReconcileEntryLimits.js`, `src/risk/dynamicExitLevels.js`, `src/risk/exitIntelligenceV2.js`, `src/risk/riskOfRuin.js`, `src/runtime/portfolioScenarioStress.js`, `src/runtime/opportunityCostAnalyzer.js`.
- Execution realism and safety: `src/execution/microstructureFillSimulator.js`, `src/execution/orderStyleAdvisor.js`, `src/execution/stopLimitGap.js`, `src/execution/stopLimitStuck.js`, `src/execution/feeAccounting.js`, `src/execution/executionIntentLedger.js`.
- Learning analytics: `src/runtime/tradeThesis.js`, `src/runtime/exitQuality.js`, `src/runtime/vetoOutcome.js`, `src/runtime/failureLibrary.js`, `src/runtime/regimeConfusion.js`, `src/runtime/learningEvidencePipeline.js`, `src/runtime/promotionDossier.js`, `src/runtime/rollbackWatch.js`, `src/runtime/replayPackScoring.js`.
- Data integrity and replay: `src/storage/schemaVersion.js`, `src/storage/migrations/index.js`, `src/storage/recorderIntegrityAudit.js`, `src/runtime/replayDeterminism.js`, `src/runtime/replayPackManifest.js`, `src/backtest/backtestMetrics.js`, `src/backtest/backtestIntegrity.js`, `src/runtime/walkForwardBacktest.js`.

## Priority Order

1. P0: Paper evidence capture and data-quality truth. The bot already has many diagnostics, but not all are stitched into one paper-learning loop.
2. P1: Paper-mode decision lifecycle and candidate outcome tracking. This helps explain why no paper trades happen without loosening blockers.
3. P2: Paper execution realism and exit challenger analysis. This improves learning quality before any live review.
4. P3: Operator/dashboard evidence drilldowns. This reduces silent failure and stale status confusion.
5. P4: Governance/CI gates that keep new features from becoming config-only or accidentally live-impacting.
6. P5: Paper-mode root-cause analytics for confidence, strategy cohorts, labels and replay evidence. These items should be built only after the P0/P1 evidence path is reliable.

## Next Build Backlog

### N1 - Paper Candidate Lab

Status: completed
Priority: P0
Initial activation: `paper_only` plus `diagnostics_only` in live

Goal: connect existing candidate diagnostics into one paper-only evaluation layer so every generated candidate gets a paper learning record, even when it is blocked.

Reuse:

- `src/runtime/candidateExplainability.js`
- `src/runtime/decisionSupportDiagnostics.js`
- `src/runtime/learningEvidencePipeline.js`
- `src/runtime/featureActivationGovernor.js`
- `src/runtime/tradingBot.js`
- `src/storage/readModelStore.js`

Do not duplicate:

- Do not build another candidate explainability module.
- Do not build another feature activation governor.

Paper-mode connection:

- [ ] Add a paper-only candidate lab record for each candidate: generated, blocked, approved, skipped, shadow-approved.
- [ ] Store `candidateId`, `decisionId`, `setupType`, top evidence, top conflicts, blocker family, feature activation stage and paper eligibility.
- [ ] Make live mode emit diagnostics only with `runtimeApplied=false`.
- [ ] Add dashboard/readmodel summary: `paperCandidateLabSummary`.

Tests:

- [ ] Blocked candidate is recorded without executing.
- [ ] Approved paper candidate is recorded with paper eligibility.
- [ ] Live mode produces diagnostics only and cannot change execution permission.
- [ ] Hard-safety blocker remains hard in paper.
- [ ] Missing candidate fields are fallback-safe.

Acceptance:

- [ ] Paper mode has an auditable candidate trail.
- [ ] No live threshold, ranking, sizing or execution behavior changes.
- [ ] `npm test` passes.

### N2 - Candidate Outcome Tracker

Status: completed
Priority: P0
Initial activation: `paper_only`

Goal: evaluate what happened after blocked or skipped paper candidates over fixed horizons without forcing trades.

Reuse:

- `src/runtime/vetoOutcome.js`
- `src/runtime/badVetoLearningService.js`
- `src/runtime/learningEvidencePipeline.js`
- `src/runtime/replayPackScoring.js`
- `src/runtime/marketHistory.js`

Do not duplicate:

- Do not build a second veto labeler.
- Do not build a separate failure library.

Paper-mode connection:

- [x] Queue candidate outcome observations for 15m, 1h and 4h horizons.
- [x] Label outcomes as `good_veto`, `bad_veto`, `neutral_veto` or `unknown_veto`.
- [x] Attach blocker family, strategy family, regime and feature quality to each outcome.
- [x] Expose `missedWinnerSummary` and `badVetoSummary` in dashboard/readmodel.

Tests:

- [x] Avoided loser becomes `good_veto`.
- [x] Missed winner becomes `bad_veto`.
- [x] Flat/noisy path becomes `neutral_veto`.
- [x] Missing future candles becomes `unknown_veto`.
- [x] Exchange-safety blocked candidate cannot be used to relax hard safety.

Acceptance:

- [x] Paper blocked decisions become measurable learning evidence.
- [x] Hard blockers are not softened by bad-veto evidence.
- [x] `npm test` passes.

Notitie 2026-05-05: N2 is afgerond met `src/runtime/candidateOutcomeTracker.js` en `test/candidateOutcomeTracker.tests.js`. De tracker gebruikt bestaande veto-labeling, queue't 15m/1h/4h observaties, bewaart blocker/strategy/regime/feature-quality context, exposeert `missedWinnerSummary`/`badVetoSummary` via dashboard normalizers en markeert hard-safety outcomes altijd als niet-relaxable.

### N3 - Paper Exit Policy Lab

Status: completed
Priority: P1
Initial activation: `shadow_only` / `paper_only`

Goal: compare existing paper exits against alternative exit plans without changing live exits.

Reuse:

- `src/risk/exitIntelligenceV2.js`
- `src/risk/dynamicExitLevels.js`
- `src/strategy/exitPlanHints.js`
- `src/runtime/exitQuality.js`
- `src/runtime/tradeQualityAnalytics.js`
- `src/runtime/opportunityCostAnalyzer.js`

Do not duplicate:

- Do not replace fixed stop-loss/take-profit.
- Do not create another exit intelligence module.

Paper-mode connection:

- [x] For paper positions, record challenger exit decisions: hold, trim, trail, exit.
- [x] Compare actual paper exit to challenger exit using MFE, MAE, exit efficiency and gave-back percent.
- [x] Add `paperExitPolicyLabSummary` to report/dashboard.
- [x] Keep live mode as diagnostics-only unless a later explicit safety review approves stricter behavior.

Tests:

- [x] Trend winner suggests trail, not full exit.
- [x] Failed breakout suggests exit.
- [x] Time decay suggests trim/exit.
- [x] Missing candles return safe unknown recommendation.
- [x] Live recommendation never increases position or loosens protection.

Acceptance:

- [x] Paper exits produce measurable challenger evidence.
- [x] No live exit behavior is changed.
- [x] `npm test` passes.

Notitie 2026-05-05: N3 is afgerond met `src/runtime/paperExitPolicyLab.js` en `test/paperExitPolicyLab.tests.js`. Het lab gebruikt bestaande `exitIntelligenceV2` en `tradeQualityAnalytics`, vergelijkt challenger-acties met werkelijke paper exits, exposeert `paperExitPolicyLabSummary` via report/dashboard normalizers en markeert live altijd als diagnostics-only zonder position increase of protection loosening.

### N4 - Paper Portfolio Allocator Simulation

Status: completed
Priority: P1
Initial activation: `paper_only`

Goal: simulate portfolio allocation choices in paper mode using existing risk and crowding diagnostics before changing real sizing.

Reuse:

- `src/risk/portfolioCrowding.js`
- `src/runtime/portfolioScenarioStress.js`
- `src/risk/riskOfRuin.js`
- `src/runtime/opportunityCostAnalyzer.js`
- `src/runtime/capitalGovernor.js`
- `src/runtime/candidateRanking.js`

Do not duplicate:

- Do not build a second capital governor.
- Do not impose max-one-position behavior.

Paper-mode connection:

- [x] Simulate alternative candidate portfolios per cycle.
- [x] Respect `MAX_OPEN_POSITIONS`, exposure caps, sector/family/regime limits and post-reconcile limits.
- [x] Tag suggested paper allocations as `paper_allocator_simulated`.
- [x] Expose `paperAllocatorSimulationSummary` in dashboard/readmodel.

Tests:

- [x] Multiple positions remain allowed when within limits.
- [x] Same-symbol duplicate remains blocked.
- [x] Crowded family/regime lowers simulated size.
- [x] Exposure cap blocks simulated entry.
- [x] Live mode outputs diagnostics only.

Acceptance:

- [x] Paper allocation learning improves without changing live sizing.
- [x] Multi-position support is preserved.
- [x] `npm test` passes.

Notitie 2026-05-05: N4 is afgerond met `src/runtime/paperPortfolioAllocatorSimulation.js` en `test/paperPortfolioAllocatorSimulation.tests.js`. De simulatie gebruikt bestaande portfolio crowding en scenario stress, respecteert max open positions/exposure/family/regime/post-reconcile limieten, tagt voorstellen als `paper_allocator_simulated`, exposeert `paperAllocatorSimulationSummary` via dashboard normalizers en houdt live mode diagnostics-only.

### N5 - Data Quality Score V2

Status: proposed
Priority: P1
Initial activation: `diagnostics_only`

Goal: unify candle/ticker/orderbook/source quality into one symbol-level score consumed by paper diagnostics.

Reuse:

- `src/runtime/dataFreshnessScore.js`
- `src/runtime/tradingPathHealth.js`
- `src/runtime/decisionInputLineage.js`
- `src/market/crossExchangeDivergence.js`
- `src/market/stablecoinRisk.js`
- `src/storage/recorderIntegrityAudit.js`

Do not duplicate:

- Do not rebuild existing freshness scoring.
- Do not rebuild cross-exchange sanity checks.

Paper-mode connection:

- [ ] Add `dataQualityScore` per symbol/candidate in paper decision records.
- [ ] Add explicit missing/stale/anomaly reasons.
- [ ] Let paper learning filter unreliable evidence from scorecards.
- [ ] Live may only use negative quality as caution/blocking after review.

Tests:

- [ ] Clean candles/orderbook produce high quality.
- [ ] Missing candle gap lowers quality.
- [ ] Impossible OHLC lowers quality.
- [ ] Stale ticker lowers quality.
- [ ] Missing optional provider does not mark data as safe.

Acceptance:

- [ ] Bad data cannot silently become trusted paper evidence.
- [ ] Missing data does not loosen live safety.
- [ ] `npm test` passes.

### N6 - Stream Health Monitor And Failover Evidence

Status: proposed
Priority: P1
Initial activation: `diagnostics_only`

Goal: make public/user stream health explicit, especially around local order book readiness and REST fallback pressure.

Reuse:

- `src/runtime/streamCoordinator.js`
- `src/runtime/apiDegradationPlanner.js`
- `src/runtime/tradingPathHealth.js`
- `src/runtime/restBudgetGovernor.js`
- `src/market/localOrderBook.js`

Do not duplicate:

- Do not build a second REST budget governor.
- Do not force REST fallback when streams are unhealthy.

Paper-mode connection:

- [ ] Add stream health to paper candidate evidence.
- [ ] Mark paper learning records that relied on REST fallback.
- [ ] Expose `streamHealthSummary` and stream replacement availability in dashboard/readmodel.

Tests:

- [ ] Healthy streams produce `ready`.
- [ ] Stale user stream blocks live readiness diagnostics.
- [ ] Local book stream not ready explains guarded depth fallback.
- [ ] Reconnect storm marks degraded.
- [ ] Missing stream metadata is fallback-safe.

Acceptance:

- [ ] Operator can see whether paper decisions used stream or fallback data.
- [ ] No force-unlock or live safety relief.
- [ ] `npm test` passes.

### N7 - Order Lifecycle And Orphan Order Auditor

Status: proposed
Priority: P1
Initial activation: `governance_only`

Goal: make every order lifecycle state auditable and block ambiguous exchange truth.

Reuse:

- `src/execution/executionIntentLedger.js`
- `src/execution/autoReconcileCoordinator.js`
- `src/execution/liveBrokerReconcile.js`
- `src/execution/reconcileEvidenceSummary.js`
- `src/runtime/liveReadinessAudit.js`

Do not duplicate:

- Do not replace auto-reconcile.
- Do not add automatic cancels unless a later safe policy explicitly allows it.

Paper-mode connection:

- [ ] Mirror paper order lifecycle states for learning/debug consistency.
- [ ] Mark paper-only orphan simulations separately from live exchange truth.
- [ ] Add `orderLifecycleAuditSummary` to dashboard/readmodel.

Tests:

- [ ] Clean lifecycle passes.
- [ ] Exchange-only order becomes `orphaned`.
- [ ] Local-only stale order becomes degraded.
- [ ] Unknown protective order blocks entries.
- [ ] Tests use fake exchange data only.

Acceptance:

- [ ] Ambiguous order state is visible and conservative.
- [ ] No live mutation is added.
- [ ] `npm test` passes.

### N8 - Paper Replay Coverage Autopilot

Status: proposed
Priority: P2
Initial activation: `paper_only`

Goal: turn replay coverage gaps into explicit paper/research tasks so learning is not trusted on empty history.

Reuse:

- `src/runtime/marketReplayEngine.js`
- `src/runtime/replayDeterminism.js`
- `src/runtime/replayPackManifest.js`
- `src/runtime/replayPackScoring.js`
- `src/market/historicalDataLoader.js`
- `src/storage/marketHistoryStore.js`

Do not duplicate:

- Do not build another replay engine.
- Do not perform unbounded backfills automatically.

Paper-mode connection:

- [ ] Detect missing candles per symbol/timeframe needed by paper learning.
- [ ] Build a dry-run backfill plan with request-budget estimate.
- [ ] Mark strategies as `replay_coverage_weak` when coverage is poor.
- [ ] Expose `paperReplayCoverageSummary` in dashboard/readmodel.

Tests:

- [ ] Empty history produces blocked/weak coverage.
- [ ] Partial history produces targeted backfill plan.
- [ ] Full history produces usable coverage.
- [ ] Request-budget cap prevents unsafe backfill plan.
- [ ] No live runtime behavior changes.

Acceptance:

- [ ] Paper learning knows when replay evidence is too weak.
- [ ] Backfills remain controlled and observable.
- [ ] `npm test` passes.

### N9 - Golden Replay Regression Pack Generator

Status: proposed
Priority: P2
Initial activation: `governance_only`

Goal: convert important incidents and paper learning samples into deterministic replay fixtures for regression protection.

Reuse:

- `src/runtime/replayPackManifest.js`
- `src/runtime/replayDeterminism.js`
- `src/runtime/replayPackScoring.js`
- `src/runtime/incidentReplayLab.js`
- `src/utils/seeded.js`

Do not duplicate:

- Do not build a separate deterministic hashing system.

Paper-mode connection:

- [ ] Generate fixture candidates from bad vetoes, missed winners, reconcile uncertainty and execution drag.
- [ ] Add replay pack metadata with config/data hash and seed.
- [ ] Add CI-safe golden replay test runner for selected packs.

Tests:

- [ ] Same replay pack gives stable hash.
- [ ] Changed decision output produces diff.
- [ ] Missing sample is warning, not crash.
- [ ] Bad veto/reconcile uncertainty receive high priority.

Acceptance:

- [ ] Regression packs protect paper learning and safety behavior.
- [ ] No automatic live promotion.
- [ ] `npm test` passes.

### N10 - Paper Net-Edge Calibration Workbench

Status: proposed
Priority: P2
Initial activation: `paper_only`

Goal: make fees, slippage, spread and fill realism measurable per symbol/session/order style before enabling stricter net-edge gates.

Reuse:

- `src/runtime/netEdgeGate.js`
- `src/execution/feeAccounting.js`
- `src/execution/microstructureFillSimulator.js`
- `src/execution/orderStyleAdvisor.js`
- `src/runtime/paperLiveParity.js`
- `src/runtime/performanceLedger.js`

Do not duplicate:

- Do not create another fee/slippage accounting path.

Paper-mode connection:

- [ ] Calculate realized vs simulated paper execution drag.
- [ ] Report per symbol/session/order style net-edge error.
- [ ] Generate paper-only calibration recommendations.
- [ ] Keep live gate disabled unless separate live risk review enables stricter blocking.

Tests:

- [ ] High fees lower net edge.
- [ ] Slippage model mismatch creates calibration warning.
- [ ] Thin book lowers fill confidence.
- [ ] Live mode cannot lower thresholds from positive net-edge diagnostics.

Acceptance:

- [ ] Paper fills become more realistic and auditable.
- [ ] No live safety relief.
- [ ] `npm test` passes.

### N11 - Dashboard Evidence Drilldown

Status: proposed
Priority: P3
Initial activation: `diagnostics_only`

Goal: make the dashboard show one compact evidence chain for why the bot did or did not paper-trade.

Reuse:

- `src/runtime/dashboardPayloadNormalizers.js`
- `src/runtime/dashboardSnapshotBuilder.js`
- `src/runtime/viewMappers.js`
- `src/dashboard/public/app.js`
- `src/runtime/rootBlockerOrchestrator.js`
- `src/runtime/candidateExplainability.js`
- `src/runtime/tradingPathHealth.js`

Do not duplicate:

- Do not create a parallel dashboard payload contract.

Paper-mode connection:

- [ ] Add `paperDecisionEvidenceDrilldown` to decision cards.
- [ ] Show root blocker, feature quality, setup thesis, net edge, portfolio crowding and exchange-safety dominance.
- [ ] Clear stale frontend polling errors after successful snapshot fetch.
- [ ] Keep old snapshot fallback compatibility.

Tests:

- [ ] Empty runtime dashboard does not crash.
- [ ] Blocked exchange safety remains dominant.
- [ ] Fresh paper candidate shows evidence chain.
- [ ] Stale dashboard does not falsely claim trading allowed.
- [ ] Frontend polling error clears after success.

Acceptance:

- [ ] Operator can distinguish no-alpha, bad-data, safety-blocked and dashboard-stale states.
- [ ] No entry permission changes.
- [ ] `npm test` passes.

### N12 - Feature Wiring Completion Gate

Status: proposed
Priority: P3
Initial activation: `governance_only`

Goal: prevent future config-only or half-wired feature flags from silently accumulating.

Reuse:

- `src/runtime/featureAudit.js`
- `src/runtime/featureActivationGovernor.js`
- `src/config/schema.js`
- `src/config/defaults`
- `test/featureAudit.tests.js`
- GitHub Actions test workflow

Do not duplicate:

- Do not replace `feature:audit`.

Paper-mode connection:

- [ ] Require each new trading flag to declare activation stage and paper-mode integration status.
- [ ] Fail or warn when `paper_only` feature lacks tests or dashboard/readmodel visibility.
- [ ] Add waiver list for intentionally documented config placeholders.
- [ ] Add CI-safe command: `node src/cli.js feature:completion-gate`.

Tests:

- [ ] Complete feature passes gate.
- [ ] Config-only feature without waiver fails/warns as configured.
- [ ] Paper-only feature without tests is rejected.
- [ ] Live-impact feature without safety review is rejected.

Acceptance:

- [ ] Future work stays connected and testable.
- [ ] No trading behavior changes.
- [ ] `npm test` passes.

### N13 - Model Confidence Root-Cause Analyzer

Status: proposed
Priority: P1
Initial activation: `diagnostics_only` / `paper_only`

Goal: explain why `model_confidence_too_low`, `meta_followthrough_caution` and related model/meta blockers dominate without changing thresholds.

Reuse:

- `src/ai/confidenceCalibration.js`
- `src/ai/metaDecisionGate.js`
- `src/ai/probabilityCalibrator.js`
- `src/runtime/candidateExplainability.js`
- `src/runtime/decisionSupportDiagnostics.js`
- `src/risk/reasonRegistry.js`

Do not duplicate:

- Do not build another probability model.
- Do not tune thresholds or confidence cutoffs in this item.

Paper-mode connection:

- [ ] Add per-candidate confidence driver breakdown: feature gaps, calibration bucket, meta gate, followthrough evidence, stale data and execution friction.
- [ ] Add `modelConfidenceRootCause` to paper candidate lab records.
- [ ] Add dashboard/readmodel summary: `modelConfidenceRootCauseSummary`.
- [ ] Live mode remains diagnostics-only and cannot lower thresholds.

Tests:

- [ ] Low confidence from missing/stale features is explained.
- [ ] Low confidence from calibration risk is explained.
- [ ] Meta followthrough caution is separated from model probability.
- [ ] Unknown reason falls back to safe `other`.
- [ ] Positive confidence evidence does not relax live gates.

Acceptance:

- [ ] Operator can see why confidence is low.
- [ ] No threshold, ranking, sizing or execution behavior changes.
- [ ] `npm test` passes.

### N14 - Paper Strategy Cohort Scorecard Builder

Status: proposed
Priority: P1
Initial activation: `paper_only`

Goal: group paper candidates, veto outcomes and trades into cohorts by strategy, regime, session, symbol cluster and feature activation stage.

Reuse:

- `src/runtime/strategyEvidenceScorecard.js`
- `src/runtime/tradeAutopsy.js`
- `src/runtime/tradeAttribution.js`
- `src/runtime/learningEvidencePipeline.js`
- `src/runtime/strategyRetirementEngine.js`
- `src/storage/readModelStore.js`

Do not duplicate:

- Do not replace existing scorecards.
- Do not auto-retire or auto-promote strategies from this builder.

Paper-mode connection:

- [ ] Build paper-only cohort records for generated candidates, blocked candidates and closed paper trades.
- [ ] Track sample size, win/loss, bad-veto rate, exit-quality mix, execution drag and data-quality warnings per cohort.
- [ ] Add `paperStrategyCohortSummary` to dashboard/readmodel.
- [ ] Feed only diagnostics into strategy lifecycle until separate review.

Tests:

- [ ] Empty cohorts are fallback-safe.
- [ ] Low sample cohort is marked weak evidence.
- [ ] Bad-veto-heavy cohort is visible but does not relax hard safety.
- [ ] Negative-edge cohort recommends review/quarantine only.
- [ ] Live mode cannot auto-promote from paper cohort evidence.

Acceptance:

- [ ] Paper evidence becomes cohort-queryable.
- [ ] No automatic live promotion or threshold changes.
- [ ] `npm test` passes.

### N15 - Shadow Strategy Challenger Tournament

Status: proposed
Priority: P2
Initial activation: `shadow_only`

Goal: compare existing strategy challengers against champion decisions without orders or portfolio impact.

Reuse:

- `src/ai/sequenceChallenger.js`
- `src/ai/transformerChallenger.js`
- `src/ai/strategyMetaSelector.js`
- `src/ai/strategyAllocationBandit.js`
- `src/runtime/canaryReleaseGate.js`
- `src/runtime/featureActivationGovernor.js`
- `src/runtime/replayPackScoring.js`

Do not duplicate:

- Do not build another strategy router.
- Do not route challenger output into live execution.

Paper-mode connection:

- [ ] Persist challenger decisions beside champion decisions as `shadow_challenger`.
- [ ] Compare would-trade, would-block, setup type, root blocker and hypothetical paper outcome.
- [ ] Add `shadowStrategyTournamentSummary` to dashboard/readmodel.
- [ ] Gate any future paper influence through `featureActivationGovernor`.

Tests:

- [ ] Challenger can disagree without executing.
- [ ] Champion execution path remains unchanged.
- [ ] Shadow decisions persist separately.
- [ ] Hard-safety blocker dominates challenger approval.
- [ ] Missing challenger output is fallback-safe.

Acceptance:

- [ ] Strategy alternatives become measurable without execution risk.
- [ ] No live behavior changes.
- [ ] `npm test` passes.

### N16 - Operator Review Label Workbench

Status: proposed
Priority: P2
Initial activation: `paper_only` / `diagnostics_only`

Goal: make human labels useful for paper learning without directly changing trading behavior.

Reuse:

- `src/ai/tradeLabeler.js`
- `src/runtime/exitQuality.js`
- `src/runtime/failureLibrary.js`
- `src/runtime/vetoOutcome.js`
- `src/runtime/learningAnalytics.js`
- `src/runtime/operatorActionQueue.js`

Do not duplicate:

- Do not build another label taxonomy if existing labels are sufficient.
- Do not apply labels directly to live strategy changes.

Paper-mode connection:

- [ ] Add a review queue for paper trades, blocked candidates and uncertain veto outcomes.
- [ ] Persist labels with source, reviewer, confidence and createdAt.
- [ ] Feed labels into paper scorecards and failure summaries only.
- [ ] Add `operatorReviewLabelSummary` to dashboard/readmodel.

Tests:

- [ ] Valid label is accepted.
- [ ] Invalid label is rejected.
- [ ] Label persists without changing trading decisions.
- [ ] Label can attach to trade, candidate or veto observation.
- [ ] Live mode treats labels as diagnostics only.

Acceptance:

- [ ] Human review improves paper analytics.
- [ ] No live threshold/risk/execution changes.
- [ ] `npm test` passes.

### N17 - Watchlist Coverage Balancer

Status: proposed
Priority: P2
Initial activation: `paper_only`

Goal: improve paper learning coverage by detecting symbols/regimes that are under-sampled or over-sampled in the watchlist.

Reuse:

- `src/runtime/watchlistResolver.js`
- `src/runtime/universeScorer.js`
- `src/runtime/universeSelector.js`
- `src/runtime/symbolQualityDecay.js`
- `src/runtime/symbolLifecycleRisk.js`
- `src/storage/marketHistoryStore.js`

Do not duplicate:

- Do not replace universe scoring or watchlist resolution.
- Do not force trading under-sampled symbols.

Paper-mode connection:

- [ ] Add coverage stats by symbol, cluster, regime and setup family.
- [ ] Suggest paper scan emphasis for under-sampled but data-healthy symbols.
- [ ] Penalize low-quality or stale-data symbols from paper learning trust.
- [ ] Add `watchlistCoverageSummary` to dashboard/readmodel.

Tests:

- [ ] Empty watchlist gives safe warning.
- [ ] Over-sampled symbol is detected.
- [ ] Under-sampled but healthy symbol is suggested for paper scan only.
- [ ] Low data quality prevents trust.
- [ ] Live universe selection is unchanged.

Acceptance:

- [ ] Paper learning gets broader, cleaner evidence.
- [ ] No live watchlist or execution behavior changes.
- [ ] `npm test` passes.

### N18 - Paper Trade Lifecycle Contract Harness

Status: completed
Priority: P0
Initial activation: `governance_only`

Goal: add deterministic contract tests that prove the paper path can move from candidate to risk decision to paper broker to journal/readmodel/dashboard without Binance calls.

Reuse:

- `src/runtime/decisionPipeline.js`
- `src/risk/entryGuards.js`
- `src/risk/entrySizing.js`
- `src/execution/paperBroker.js`
- `src/runtime/dataRecorder.js`
- `src/storage/readModelStore.js`
- `src/runtime/dashboardSnapshotBuilder.js`

Do not duplicate:

- Do not build another paper broker.
- Do not weaken blockers to force a paper trade.

Paper-mode connection:

- [x] Build synthetic fixture scenarios for approved paper entry, blocked hard-safety setup, blocked model-confidence setup and closed paper trade.
- [x] Assert journal/readmodel/dashboard fields line up.
- [x] Add a read-only CLI smoke command only if useful after tests exist.
  - Notitie: geen extra CLI smoke command toegevoegd; de contract-harness draait direct in `npm test` en gebruikt geen live broker of Binance calls.

Tests:

- [x] Approved paper fixture creates a paper trade record.
- [x] Hard-safety fixture blocks before broker.
- [x] Model-confidence fixture reports blocker without execution.
- [x] Closed paper fixture updates trade quality/readmodel summary.
- [x] No live broker is instantiated.

Acceptance:

- [x] Paper path has end-to-end regression coverage.
- [x] No safety gate is loosened.
- [x] `npm test` passes.

Notitie 2026-05-05: N18 is afgerond met `src/runtime/paperTradeLifecycleContract.js` en `test/paperTradeLifecycleContract.tests.js`. De harness bewijst approved paper entry/close, hard-safety block-before-broker, model-confidence block-before-execution, readmodel/dashboard linkage, trade-quality aanwezigheid en afwezigheid van live broker gebruik.

### N19 - Readmodel Analytics Query Pack

Status: proposed
Priority: P3
Initial activation: `diagnostics_only`

Goal: add stable readmodel query helpers for paper analytics so dashboard/report code does not re-derive everything from raw snapshots.

Reuse:

- `src/storage/readModelStore.js`
- `src/runtime/dashboardPayloadNormalizers.js`
- `src/runtime/reportBuilder.js`
- `src/runtime/learningAnalytics.js`

Do not duplicate:

- Do not migrate source-of-truth away from JSON/NDJSON.
- Do not create a second SQLite store.

Paper-mode connection:

- [ ] Add query helpers for paper candidates, blocker timelines, veto outcomes, paper trades, exit quality and cohort scorecards.
- [ ] Make queries fallback-safe when readmodel is missing or stale.
- [ ] Expose query status in `readmodel:status`.
- [ ] Add `paperAnalyticsReadmodelSummary` to dashboard/report.

Tests:

- [ ] Empty readmodel returns empty safe result.
- [ ] Missing table returns degraded summary, not crash.
- [ ] Corrupt SQLite can be rebuilt.
- [ ] Query output remains JSON-serializable.
- [ ] Source-of-truth remains JSON/NDJSON.

Acceptance:

- [ ] Paper analytics become queryable and dashboard-safe.
- [ ] No persistence source-of-truth migration.
- [ ] `npm test` passes.

### N20 - Root Blocker Staleness Verifier

Status: proposed
Priority: P1
Initial activation: `governance_only`

Goal: detect root blockers that may be stale and prove what evidence is required before they can clear.

Reuse:

- `src/runtime/rootBlockerOrchestrator.js`
- `src/execution/autoReconcileCoordinator.js`
- `src/runtime/tradingPathHealth.js`
- `src/risk/reasonRegistry.js`
- `src/runtime/operatorActionQueue.js`

Do not duplicate:

- Do not build a force-unlock path.
- Do not replace root blocker priority.

Paper-mode connection:

- [ ] Add root blocker age, last evidence timestamp, required evidence and safe next action to paper status.
- [ ] Mark blockers as `stale_suspected` only when hard-safety evidence is absent and data freshness supports it.
- [ ] Add dashboard/readmodel summary: `rootBlockerStalenessSummary`.
- [ ] Keep exchange safety, reconcile, manual review and unresolved intents dominant.

Tests:

- [ ] Fresh hard blocker is not stale.
- [ ] Old dashboard-only blocker can be stale-suspected.
- [ ] Exchange safety blocker requires reconcile evidence.
- [ ] Unresolved intent blocks stale clear.
- [ ] Missing evidence never unlocks entries.

Acceptance:

- [ ] Operator sees why a blocker remains active and what clears it.
- [ ] No force unlock or safety bypass.
- [ ] `npm test` passes.

## Duplicate Or Rejected Suggestions

Do not propose these as new modules because the codebase already has them:

- Feature activation governor.
- Canary release gate.
- Anti-overfit governor.
- Paper/live parity diagnostics.
- Stablecoin depeg monitor.
- Cross-exchange divergence checker.
- Crypto derivatives context.
- Leadership context.
- Advanced indicator helper pack.
- Indicator feature registry.
- Dynamic exit levels.
- Exit intelligence v2.
- Trade quality analytics.
- Failure library.
- Veto outcome labeler.
- Promotion dossier.
- Rollback watch.
- Auto-reconcile coordinator.
- Panic flatten dry-run planner.
- Schema versioning and migration framework.
- Replay determinism and replay pack manifest.
- Backtest metrics and backtest integrity helpers.

Also do not duplicate older proposed backlog items from `docs/CODEX_ADDITIONAL_RECOMMENDATIONS_B24_B31.md`, including:

- WebSocket heartbeat / stream failover monitor.
- Order lifecycle and orphan order auditor.
- Position thesis aging.
- Signal expiry and alpha decay.
- Liquidity capacity and market impact estimator.
- Exchange incident guard.
- Balance drift and dust monitor.
- Strategy conflict resolver.
- Clock skew monitor.
- Market data quality and candle anomaly detector.
- Feature drift monitor.
- Session liquidity profile.
- Exit ladder analytics.
- Security audit.
- Dependency/runtime guard.
- Decision replay diff.

## Implementation Template For Each Item

Before implementing any item:

- [ ] Re-read `docs/CODEX_EXECUTION_PLAN.md`.
- [ ] Re-read this file.
- [ ] Verify the listed reuse modules still exist.
- [ ] Search for duplicate module names and similar helpers.
- [ ] Implement only one item at a time.
- [ ] Add regression tests.
- [ ] Wire paper mode explicitly.
- [ ] Keep live mode diagnostics-only unless the item is governance/safety-blocking.
- [ ] Run `npm test`.
- [ ] Update this file and `docs/CODEX_EXECUTION_PLAN.md`.
