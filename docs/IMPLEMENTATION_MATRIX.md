# Implementation Matrix

Safety-first implementation status for the current maintenance pass. Source-of-truth persistence remains JSON/NDJSON unless a feature explicitly says otherwise.

| Area | Status | Main files | Tests | Runtime impact | Dashboard visible | Live impact | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Config defaults split | Implemented | `src/config/defaults/*.js`, `src/config/index.js` | `test/configOperatorMaintenance.tests.js` | Config loading | No | Safety defaults preserved | Domain split only. |
| Config profile audit | Implemented | `src/config/profileAudit.js`, `src/config/index.js` | `test/configOperatorMaintenance.tests.js` | Doctor/config diagnostics | No | Blocks unsafe live profiles | Fail-fast only. |
| Paper mode profile | Diagnostics/read-only | `src/config/paperModeProfile.js`, `src/config/index.js` | `test/configOperatorMaintenance.tests.js` | Summaries/diagnostics | Partial | No live impact | Hard safety not relaxable. |
| Decision contract | Dashboard/audit metadata | `src/runtime/decisionContract.js`, `src/runtime/tradingBot.js` | `test/configOperatorMaintenance.tests.js` | Audit/readmodel shape | Yes | No live relaxation | Normalizes incomplete data. |
| Config hash | Diagnostics metadata | `src/config/configHash.js`, `src/config/index.js`, `src/runtime/tradingBot.js` | `test/configOperatorMaintenance.tests.js` | Audit lineage | Partial | No live impact | Secrets excluded. |
| Execution intent CLI | Read-only | `src/cli/runCli.js`, `src/execution/executionIntentView.js` | `test/configOperatorMaintenance.tests.js` | Operator visibility | CLI only | No live mutation | List/summary only. |
| Reconcile evidence summary | Pure helper | `src/execution/reconcileEvidenceSummary.js` | `test/configOperatorMaintenance.tests.js` | Operator diagnostics | Partial | No autofix change | Normalizes evidence only. |
| Dashboard payload normalizers | Pure helper | `src/runtime/dashboardPayloadNormalizers.js` | `test/configOperatorMaintenance.tests.js` | Dashboard/readmodel resilience | Yes | No live impact | Fallback-safe payloads. |
| Trade thesis | Analytics metadata | `src/runtime/tradeThesis.js`, `src/runtime/tradingBot.js` | `test/learningAnalyticsMaintenance.tests.js` | Paper/live metadata | Partial | No execution change | Secret-safe thesis. |
| Exit quality labels | Analytics only | `src/runtime/exitQuality.js` | `test/learningAnalyticsMaintenance.tests.js` | Closed-trade analytics | Partial | No exit behavior change | Labels only. |
| Veto outcome labels | Analytics only | `src/runtime/vetoOutcome.js` | `test/learningAnalyticsMaintenance.tests.js` | Learning analytics | Partial | No live impact | Future outcome format. |
| Failure library | Analytics only | `src/runtime/failureLibrary.js` | `test/learningAnalyticsMaintenance.tests.js` | Learning diagnostics | Partial | No live impact | Review recommendations only. |
| Regime confusion | Analytics only | `src/runtime/regimeConfusion.js` | `test/learningAnalyticsMaintenance.tests.js` | Analytics | Partial | No live impact | Matrix builder only. |
| Promotion dossier | Read-only diagnostics | `src/runtime/promotionDossier.js` | `test/learningAnalyticsMaintenance.tests.js` | Governance diagnostics | Partial | No auto promotion | Blocks weak evidence in dossier. |
| Rollback watch | Read-only diagnostics | `src/runtime/rollbackWatch.js` | `test/learningAnalyticsMaintenance.tests.js` | Operator diagnostics | Partial | No auto rollback | Recommendation only. |
| Replay pack scoring | Read-only diagnostics | `src/runtime/replayPackScoring.js` | `test/learningAnalyticsMaintenance.tests.js` | Replay prioritization | No | No live impact | Scores packs only. |
| Learning analytics CLI | Read-only | `src/runtime/learningAnalytics.js`, `src/cli/runCli.js` | `test/learningAnalyticsMaintenance.tests.js` | CLI analytics | CLI only | No live impact | Safe insufficient-data output. |
| Candidate outcome tracker | Paper-only learning evidence | `src/runtime/candidateOutcomeTracker.js`, `src/runtime/vetoOutcome.js`, `src/runtime/dashboardPayloadNormalizers.js` | `test/candidateOutcomeTracker.tests.js` | Blocked-candidate outcome analytics | Summary fields | No live impact | Reuses veto labels and never relaxes hard-safety blockers. |
| Paper exit policy lab | Shadow/paper challenger analytics | `src/runtime/paperExitPolicyLab.js`, `src/risk/exitIntelligenceV2.js`, `src/runtime/reportBuilder.js`, `src/runtime/dashboardPayloadNormalizers.js` | `test/paperExitPolicyLab.tests.js` | Paper exit challenger evidence | Report/dashboard summary | No live exit behavior change | Compares challenger hold/trim/trail/exit with actual paper exits. |
| Paper portfolio allocator simulation | Paper-only allocation diagnostics | `src/runtime/paperPortfolioAllocatorSimulation.js`, `src/risk/portfolioCrowding.js`, `src/runtime/portfolioScenarioStress.js`, `src/runtime/dashboardPayloadNormalizers.js` | `test/paperPortfolioAllocatorSimulation.tests.js` | Simulated paper allocation evidence | Summary fields | No live sizing change | Preserves multi-position support and blocks duplicate/exposure/crowding cases. |
| Data quality score v2 | Diagnostics-only data trust | `src/runtime/dataQualityScoreV2.js`, `src/runtime/dataFreshnessScore.js`, `src/runtime/decisionInputLineage.js`, `src/runtime/dashboardPayloadNormalizers.js` | `test/dataQualityScoreV2.tests.js` | Candidate/data evidence quality | Summary fields | Negative-only diagnostics | Prevents bad data from silently becoming trusted paper evidence. |
| Stream health evidence | Diagnostics-only stream/fallback truth | `src/runtime/streamHealthEvidence.js`, `src/runtime/tradingBot.js`, `src/runtime/dashboardPayloadNormalizers.js` | `test/streamHealthEvidence.tests.js` | Paper candidate evidence/readiness diagnostics | `streamHealthSummary` | No live safety relief | Reuses existing stream/fallback state and keeps REST fallback guarded. |
| Order lifecycle auditor | Governance/read-only order truth | `src/execution/orderLifecycleAuditor.js`, `src/runtime/dashboardPayloadNormalizers.js` | `test/orderLifecycleAuditor.tests.js` | Order lifecycle diagnostics | `orderLifecycleAuditSummary` | No live mutation | Flags orphaned exchange orders, stale local orders, unknown protection and unresolved intents conservatively. |
| Model confidence root-cause analyzer | Diagnostics-only confidence explanation | `src/runtime/modelConfidenceRootCause.js`, `src/risk/reasonRegistry.js`, `src/runtime/dashboardPayloadNormalizers.js` | `test/modelConfidenceRootCause.tests.js` | Candidate/decision diagnostics | `modelConfidenceRootCauseSummary` | No live threshold relief | Separates feature gaps, calibration risk, meta followthrough/neural caution and model threshold gap. |
| Paper strategy cohort scorecards | Paper-only cohort analytics | `src/runtime/paperStrategyCohortScorecard.js`, `src/runtime/strategyEvidenceScorecard.js`, `src/runtime/dashboardPayloadNormalizers.js` | `test/paperStrategyCohortScorecard.tests.js` | Paper learning analytics | `paperStrategyCohortSummary` | No live promotion | Groups candidates/vetoes/trades by strategy/family/regime/session/cluster/stage and recommends review only. |
| Operator mode | Diagnostics/readiness | `src/runtime/operatorMode.js`, `src/config/index.js` | `test/operatorSafetyTooling.tests.js` | Readiness/operator permissions | Yes | Can restrict entries | Never loosens live safety. |
| Live readiness audit | Diagnostics only | `src/runtime/liveReadinessAudit.js` | `test/operatorSafetyTooling.tests.js` | Operator readiness | Partial | Blocks readiness diagnostics | No live switch. |
| Incident reports | Read-only/safe write to runtime incidents | `src/runtime/incidentReport.js`, `src/cli/runCli.js` | `test/operatorSafetyTooling.tests.js` | Incident JSON output | Summary only | No exchange calls | Secrets redacted. |
| Panic flatten plan | Dry-run only | `src/runtime/panicFlattenPlan.js`, `src/cli/runCli.js` | `test/operatorSafetyTooling.tests.js` | CLI plan | Summary only | No orders by default | Plan requires confirmation concept. |
| Runtime safety snapshot | Dashboard diagnostics | `src/runtime/safetySnapshot.js`, `src/runtime/tradingBot.js` | `test/operatorSafetyTooling.tests.js` | Dashboard/readiness | Yes | Restrictive diagnostics | Fallback-safe. |
| Alert severity normalization | Implemented | `src/runtime/alertSeverity.js` | `test/operatorSafetyTooling.tests.js` | Readiness severity | Yes | Critical blocks readiness | Unknown => medium. |
| Auto-reconcile coordinator | Evidence-first controlled recovery | `src/execution/autoReconcileCoordinator.js`, `src/cli/runCli.js`, `src/runtime/tradingBot.js` | `test/autoReconcileCoordinator.tests.js` | Reconcile planning/limited safe actions | Yes | No force unlock | Manual review on ambiguity. |
| Exchange safety CLI visibility | Read-only/controlled | `src/cli/runCli.js`, `docs/EXCHANGE_SAFETY.md` | `test/autoReconcileCoordinator.tests.js` | Operator CLI | CLI only | No force unlock | Status/plan/run safe actions. |
| Post-reconcile probation limits | Implemented | `src/risk/postReconcileEntryLimits.js`, `src/risk/riskManager.js`, `src/runtime/tradingBot.js`, `src/cli/runCli.js` | `test/postReconcileEntryLimits.tests.js` | Entry limits during probation | Yes | Stricter during probation | Multi-position preserved. |
| Schema version helpers | Implemented | `src/storage/schemaVersion.js` | `test/dataIntegrityMaintenance.tests.js` | Storage metadata | No | No live impact | New records only. |
| Storage migration framework | Safe no-op/fallback | `src/storage/migrations/index.js` | `test/dataIntegrityMaintenance.tests.js` | Read/load fallback | No | No live impact | No mass rewrite. |
| Recorder integrity audit | Read-only diagnostics | `src/storage/recorderIntegrityAudit.js`, `src/storage/storageAudit.js` | `test/dataIntegrityMaintenance.tests.js` | Storage diagnostics | Partial | No live impact | Read-only. |
| Replay determinism context | Read-only diagnostics | `src/runtime/replayDeterminism.js`, `src/utils/seeded.js` | `test/dataIntegrityMaintenance.tests.js` | Replay/test hashing | No | No live impact | No live randomness changes. |
| Data freshness and dataset quality | Research/retrain diagnostics only | `src/runtime/dataFreshnessScore.js`, `src/runtime/datasetQualityGate.js` | `test/dataIntegrityMaintenance.tests.js` | Research trust gates | Partial | No live execution change | Blocks weak datasets only. |
| Backtest result integrity | Validation only | `src/backtest/backtestIntegrity.js` | `test/dataIntegrityMaintenance.tests.js` | Backtest validation | No | No live impact | Warnings/errors only. |
| Replay pack manifest | Read-only manifest builder | `src/runtime/replayPackManifest.js` | `test/dataIntegrityMaintenance.tests.js` | Replay metadata | No | No live impact | Stable hash. |
| Storage/data-integrity CLI | Read-only | `src/cli/runCli.js`, `src/storage/storageAudit.js` | `test/dataIntegrityMaintenance.tests.js` | CLI audit | CLI only | No live impact | No state rewrite. |
| Reason registry metadata | Implemented | `src/risk/reasonRegistry.js` | `test/safetyMaintenance.tests.js` | Risk/explain metadata | Yes | Hard safety preserved | Unknown fallback safe. |
| Secret redaction | Implemented | `src/utils/redactSecrets.js`, `src/utils/logger.js` | `test/safetyMaintenance.tests.js` | Logging safety | No | No behavior change | Redacts sensitive fields. |
| OCO geometry regressions | Implemented | `src/execution/liveBroker.js` | `test/safetyMaintenance.tests.js` | Protective preflight | No | Stricter safety | No Binance calls in tests. |
| Execution intent ledger regressions | Implemented | `src/execution/executionIntentLedger.js` | `test/executionIntentLedger.tests.js`, `test/safetyMaintenance.tests.js` | Duplicate/ambiguous intent blocking | Partial | Hard blocker preserved | Entry/protection intents separated. |
| Trading feature inventory | Documentation | `docs/TRADING_FEATURE_INVENTORY.md` | n/a | None | n/a | None | Code-grounded inventory. |
| Advanced indicator helpers | Diagnostics only | `src/strategy/advancedIndicators.js` | `test/tradingQualityUpgrade.tests.js` | Feature diagnostics | Partial | No live entry relief | Fallback-safe. |
| Indicator regime scoring | Diagnostics only | `src/strategy/indicatorRegimeScoring.js` | `test/tradingQualityUpgrade.tests.js` | Candidate diagnostics | Partial | No hard safety relief | Paper/shadow-first. |
| Setup thesis and exit hints | Dashboard diagnostics | `src/strategy/setupThesis.js`, `src/strategy/exitPlanHints.js`, `src/runtime/tradingBot.js` | `test/tradingQualityUpgrade.tests.js` | Candidate/trade explanation | Partial | No execution change | Explainability only. |
| Portfolio crowding diagnostics | Risk diagnostic helper | `src/risk/portfolioCrowding.js` | `test/tradingQualityUpgrade.tests.js` | Sizing/block diagnostics | Partial | Can only reduce/block risk | Multi-position kept. |
| Backtest quality metrics | Validation/analytics | `src/backtest/backtestMetrics.js` | `test/tradingQualityUpgrade.tests.js` | Backtest/report metrics | No | No live impact | Finite metrics. |
| Learning evidence pipeline | Analytics integration | `src/runtime/learningEvidencePipeline.js`, existing learning helpers | `test/tradingQualityUpgrade.tests.js` | Learning summaries | Partial | No live promotion | Pure/fallback-safe. |
| Anti-overfit governor | Governance diagnostics | `src/ai/antiOverfitGovernor.js` | `test/tradingQualityUpgrade.tests.js` | Change governance | Partial | Blocks unsafe promotion | No threshold relief. |
| Market snapshot flow diagnostics | Implemented | `src/runtime/marketSnapshotFlowDebug.js`, `src/runtime/tradingBot.js`, `src/cli/runCli.js` | `test/tradingPathHealth.tests.js` | Runtime diagnostics | CLI/dashboard summary | No safety bypass | Compact summaries only. |
| Paper trade lifecycle contract harness | Test/governance harness | `src/runtime/paperTradeLifecycleContract.js`, `src/execution/paperBroker.js` | `test/paperTradeLifecycleContract.tests.js` | Test-only lifecycle validation | No | No live impact | Proves paper entry/block/close contract without Binance calls or live broker usage. |

## Safety Invariants

- `BOT_MODE` default remains `paper`.
- `ENABLE_EXCHANGE_PROTECTION` default remains `true`.
- `PAPER_EXECUTION_VENUE` default remains `internal`.
- `LIVE_TRADING_ACKNOWLEDGED` default remains empty.
- New paper profiles are diagnostics-first and do not allow hard-safety relaxation.
- New CLI intent commands are read-only.
- Reconcile evidence summaries do not change autofix behavior.
- Learning analytics, promotion dossiers, rollback watch and replay-pack scoring are diagnostics only.
- No automatic live promotion or live rollback is performed.
- Operator modes can restrict entries, but do not loosen live safety.
- Panic flatten tooling is dry-run planning only.
- Incident commands are read-only except writing local incident JSON reports under the runtime directory.
- Auto-reconcile never disables exchange safety and never force-unlocks entries without evidence-backed unlock evaluation.
- Protective rebuild remains gated by exchange protection, symbol rules, market snapshot and OCO geometry validation.
- Post-reconcile probation reduces risk temporarily but does not impose a permanent single-position mode.
- Storage, recorder and replay-manifest commands are read-only and do not rewrite persisted trading state.
- Dataset quality gates are diagnostics for research/retrain trust; they do not change live execution.
- Trading-quality indicators, thesis, exit hints and regime scoring are diagnostics-first and do not loosen live entry gates.
- Portfolio crowding preserves multi-position support while blocking duplicate-symbol entries and reducing risk under crowding.
- Market snapshot flow diagnostics only persist compact snapshot summaries; they do not bypass stale-data, exchange-safety or risk blockers.
