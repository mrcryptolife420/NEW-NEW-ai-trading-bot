# Implementation Matrix

Safety-first implementation status for the current maintenance pass. Source-of-truth persistence remains JSON/NDJSON unless a feature explicitly says otherwise.

| Area | Status | Main files | Tests |
| --- | --- | --- | --- |
| Config defaults split | Implemented | `src/config/defaults/*.js`, `src/config/index.js` | `test/configOperatorMaintenance.tests.js` |
| Config profile audit | Implemented | `src/config/profileAudit.js`, `src/config/index.js` | `test/configOperatorMaintenance.tests.js` |
| Paper mode profile | Diagnostics/read-only | `src/config/paperModeProfile.js`, `src/config/index.js` | `test/configOperatorMaintenance.tests.js` |
| Decision contract | Dashboard/audit metadata | `src/runtime/decisionContract.js`, `src/runtime/tradingBot.js` | `test/configOperatorMaintenance.tests.js` |
| Config hash | Diagnostics metadata | `src/config/configHash.js`, `src/config/index.js`, `src/runtime/tradingBot.js` | `test/configOperatorMaintenance.tests.js` |
| Execution intent CLI | Read-only | `src/cli/runCli.js`, `src/execution/executionIntentView.js` | `test/configOperatorMaintenance.tests.js` |
| Reconcile evidence summary | Pure helper | `src/execution/reconcileEvidenceSummary.js` | `test/configOperatorMaintenance.tests.js` |
| Dashboard payload normalizers | Pure helper | `src/runtime/dashboardPayloadNormalizers.js` | `test/configOperatorMaintenance.tests.js` |
| Trade thesis | Analytics metadata | `src/runtime/tradeThesis.js`, `src/runtime/tradingBot.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Exit quality labels | Analytics only | `src/runtime/exitQuality.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Veto outcome labels | Analytics only | `src/runtime/vetoOutcome.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Failure library | Analytics only | `src/runtime/failureLibrary.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Regime confusion | Analytics only | `src/runtime/regimeConfusion.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Promotion dossier | Read-only diagnostics | `src/runtime/promotionDossier.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Rollback watch | Read-only diagnostics | `src/runtime/rollbackWatch.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Replay pack scoring | Read-only diagnostics | `src/runtime/replayPackScoring.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Learning analytics CLI | Read-only | `src/runtime/learningAnalytics.js`, `src/cli/runCli.js` | `test/learningAnalyticsMaintenance.tests.js` |
| Operator mode | Diagnostics/readiness | `src/runtime/operatorMode.js`, `src/config/index.js` | `test/operatorSafetyTooling.tests.js` |
| Live readiness audit | Diagnostics only | `src/runtime/liveReadinessAudit.js` | `test/operatorSafetyTooling.tests.js` |
| Incident reports | Read-only/safe write to runtime incidents | `src/runtime/incidentReport.js`, `src/cli/runCli.js` | `test/operatorSafetyTooling.tests.js` |
| Panic flatten plan | Dry-run only | `src/runtime/panicFlattenPlan.js`, `src/cli/runCli.js` | `test/operatorSafetyTooling.tests.js` |
| Runtime safety snapshot | Dashboard diagnostics | `src/runtime/safetySnapshot.js`, `src/runtime/tradingBot.js` | `test/operatorSafetyTooling.tests.js` |
| Alert severity normalization | Implemented | `src/runtime/alertSeverity.js` | `test/operatorSafetyTooling.tests.js` |
| Auto-reconcile coordinator | Evidence-first controlled recovery | `src/execution/autoReconcileCoordinator.js`, `src/cli/runCli.js`, `src/runtime/tradingBot.js` | `test/autoReconcileCoordinator.tests.js` |
| Exchange safety CLI visibility | Read-only/controlled | `src/cli/runCli.js`, `docs/EXCHANGE_SAFETY.md` | `test/autoReconcileCoordinator.tests.js` |
| Post-reconcile probation limits | Implemented | `src/risk/postReconcileEntryLimits.js`, `src/risk/riskManager.js`, `src/runtime/tradingBot.js`, `src/cli/runCli.js` | `test/postReconcileEntryLimits.tests.js` |
| Schema version helpers | Implemented | `src/storage/schemaVersion.js` | `test/dataIntegrityMaintenance.tests.js` |
| Storage migration framework | Safe no-op/fallback | `src/storage/migrations/index.js` | `test/dataIntegrityMaintenance.tests.js` |
| Recorder integrity audit | Read-only diagnostics | `src/storage/recorderIntegrityAudit.js`, `src/storage/storageAudit.js` | `test/dataIntegrityMaintenance.tests.js` |
| Replay determinism context | Read-only diagnostics | `src/runtime/replayDeterminism.js`, `src/utils/seeded.js` | `test/dataIntegrityMaintenance.tests.js` |
| Data freshness and dataset quality | Research/retrain diagnostics only | `src/runtime/dataFreshnessScore.js`, `src/runtime/datasetQualityGate.js` | `test/dataIntegrityMaintenance.tests.js` |
| Backtest result integrity | Validation only | `src/backtest/backtestIntegrity.js` | `test/dataIntegrityMaintenance.tests.js` |
| Replay pack manifest | Read-only manifest builder | `src/runtime/replayPackManifest.js` | `test/dataIntegrityMaintenance.tests.js` |
| Storage/data-integrity CLI | Read-only | `src/cli/runCli.js`, `src/storage/storageAudit.js` | `test/dataIntegrityMaintenance.tests.js` |
| Reason registry metadata | Implemented | `src/risk/reasonRegistry.js` | `test/safetyMaintenance.tests.js` |
| Secret redaction | Implemented | `src/utils/redactSecrets.js`, `src/utils/logger.js` | `test/safetyMaintenance.tests.js` |
| OCO geometry regressions | Implemented | `src/execution/liveBroker.js` | `test/safetyMaintenance.tests.js` |
| Execution intent ledger regressions | Implemented | `src/execution/executionIntentLedger.js` | `test/executionIntentLedger.tests.js`, `test/safetyMaintenance.tests.js` |
| Trading feature inventory | Documentation | `docs/TRADING_FEATURE_INVENTORY.md` | n/a |
| Advanced indicator helpers | Diagnostics only | `src/strategy/advancedIndicators.js` | `test/tradingQualityUpgrade.tests.js` |
| Indicator regime scoring | Diagnostics only | `src/strategy/indicatorRegimeScoring.js` | `test/tradingQualityUpgrade.tests.js` |
| Setup thesis and exit hints | Dashboard diagnostics | `src/strategy/setupThesis.js`, `src/strategy/exitPlanHints.js`, `src/runtime/tradingBot.js` | `test/tradingQualityUpgrade.tests.js` |
| Portfolio crowding diagnostics | Risk diagnostic helper | `src/risk/portfolioCrowding.js` | `test/tradingQualityUpgrade.tests.js` |
| Backtest quality metrics | Validation/analytics | `src/backtest/backtestMetrics.js` | `test/tradingQualityUpgrade.tests.js` |

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
