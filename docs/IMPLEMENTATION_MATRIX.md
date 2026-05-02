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
| Reason registry metadata | Implemented | `src/risk/reasonRegistry.js` | `test/safetyMaintenance.tests.js` |
| Secret redaction | Implemented | `src/utils/redactSecrets.js`, `src/utils/logger.js` | `test/safetyMaintenance.tests.js` |
| OCO geometry regressions | Implemented | `src/execution/liveBroker.js` | `test/safetyMaintenance.tests.js` |
| Execution intent ledger regressions | Implemented | `src/execution/executionIntentLedger.js` | `test/executionIntentLedger.tests.js`, `test/safetyMaintenance.tests.js` |

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
