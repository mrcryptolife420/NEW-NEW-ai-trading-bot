# Roadmap 21 - Model Evaluation Benchmark Harness

Status: actief
Analyse datum: 2026-05-18
Scope: AI/model evaluation, calibration benchmark, challenger comparison, promotion evidence.

## Analysebasis

Deze roadmap is gebaseerd op analyse van:

- `src/ai/adaptiveModel.js`
- `src/ai/probabilityCalibrator.js`
- `src/ai/confidenceCalibration.js`
- `src/ai/transformerChallenger.js`
- `src/ai/sequenceChallenger.js`
- `src/ai/metaDecisionGate.js`
- `src/runtime/modelRegistry.js`
- `src/runtime/modelLifecycleDossier.js`
- `src/runtime/offlineTrainer.js`
- `src/runtime/onlineAdaptationController.js`
- `src/runtime/canaryReleaseGate.js`
- `src/runtime/promotionDossier.js`
- `test/adaptiveGovernance.tests.js`
- `test/confidenceCalibration.tests.js`
- `test/modelConfidenceRootCause.tests.js`
- `test/canaryReleaseGate.tests.js`

Niet dupliceren: roadmap 07 in `docs/voltooid/` heeft model lifecycle en adaptive learning lab afgerond. Deze roadmap gaat niet over nieuwe model governance, maar over een reproduceerbare benchmark harness die modelversies, challengers en calibration changes exact vergelijkbaar maakt.

## Probleemstelling

Er is veel modelintelligentie aanwezig, maar modelwijzigingen kunnen nog sterker worden beoordeeld met vaste benchmarksets:

- calibrated probability accuracy per regime
- false-positive/false-negative trade windows
- paper-only near-miss recovery quality
- challenger drag versus additive value
- confidence collapse under stale data
- meta gate impact op opportunity cost
- model behavior under replay packs

Zonder vaste benchmark harness blijft een modelverbetering te afhankelijk van losse tests of recente runtime state.

## Doel

Maak een deterministic model evaluation harness die elke model-, calibrator-, challenger- of meta gate wijziging kan vergelijken tegen een baseline.

## Fase 1 - Benchmark Dataset Contract

Maak een benchmark contract:

- dataset id
- source replay pack
- regime label
- feature hash
- expected opportunity class
- realized outcome
- stale-data flags
- hard-safety blockers
- paper/live eligibility

Nieuwe module:

- `src/ai/modelBenchmarkHarness.js`

## Fase 2 - Baseline Runner

Maak runners voor:

- champion adaptive model
- sequence challenger
- transformer challenger
- meta neural gate
- probability calibrator
- confidence adjudication

Output:

- Brier score
- calibration error
- opportunity capture rate
- false approval rate
- false veto rate
- confidence drift
- regime-specific degradation

## Fase 3 - Regression Report

Maak `buildModelBenchmarkReport`:

- baseline versus candidate
- significant regressions
- improvements requiring more evidence
- live-blocking regressions
- paper-only acceptable regressions
- recommended promotion stage

Geen live promotion zonder canary/replay evidence.

## Fase 4 - CLI Integratie

Nieuwe CLI commands:

- `node src/cli.js model:benchmark`
- `node src/cli.js model:benchmark --dataset golden`
- `node src/cli.js model:benchmark --compare latest`

Output moet JSON zijn en redaction-safe.

## Fase 5 - Dashboard Integratie

Dashboard panel:

- latest benchmark status
- model version
- calibration quality
- challenger contribution
- failed benchmark gates
- recommended next action

## Nieuwe Features

- Model benchmark dataset schema.
- Deterministic model comparison runner.
- Calibration regression report.
- Challenger contribution board.
- Benchmark promotion gate.

## Tests

Toevoegen:

- benchmark runner is deterministic for same seed/dataset
- stale-data cases cannot count as model win
- hard safety blockers dominate model approvals
- candidate model with worse calibration is blocked
- paper-only improvements do not imply live readiness
- dashboard fallback is safe when no benchmark exists

Te draaien:

- `npm.cmd test -- --grep=model`
- `npm.cmd test -- --grep=calibration`
- `npm.cmd test -- --grep=canary`
- `npm.cmd test -- --grep=replay`

## Definition of Done

- Model changes can be benchmarked against a stable baseline.
- Regression output is deterministic and dashboard-safe.
- Promotion gate consumes benchmark evidence.
- Live mode remains stricter than paper.
- Benchmark failures are visible in CLI and dashboard.
