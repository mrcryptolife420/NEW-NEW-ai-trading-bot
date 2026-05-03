# Data Integrity

This bot keeps JSON, NDJSON and journal files as source-of-truth. The data-integrity layer is read-only by default and exists to make recorder, replay, research and backtest trust explicit.

## Schema Versions

Central schema constants live in `src/storage/schemaVersion.js`:

- runtime state
- decision records
- trade records
- recorder frames
- incident reports
- replay records

New analytics records should include `schemaVersion`. Legacy records without a version are treated as version `0` and must be handled through safe fallback or no-op migration.

## Migrations

`src/storage/migrations/index.js` provides `migrateRecord()`.

Current migrations are intentionally conservative:

- current records are returned unchanged
- legacy missing-version records get metadata only
- future unsupported versions return an explicit warning/error state
- corrupt/non-object input returns a safe fallback record

No command in this pass rewrites existing source-of-truth files.

## Recorder Audit

`src/storage/recorderIntegrityAudit.js` checks recent recorder frames for:

- missing or mismatched schema versions
- invalid timestamps
- missing decision/trade ids
- duplicate ids
- missing config hash
- low record quality
- unknown frame types

Run:

```sh
node src/cli.js recorder:audit
```

## Storage Audit

`src/storage/storageAudit.js` summarizes runtime, journal, audit and feature-store file presence.

Run:

```sh
node src/cli.js storage:audit
```

## Replay Determinism

`src/runtime/replayDeterminism.js` builds a deterministic replay context and hashes the exact replay input. It requires injected seed/config/data inputs and does not use live clock or randomness.

`src/utils/seeded.js` provides deterministic random/id helpers for replay and tests only. Do not use these helpers for live execution ids or order ids.

## Decision Input Lineage

`src/runtime/decisionInputLineage.js` records which feature set, config hash, data hash and timestamps were used for a decision.

Tracked fields include:

- `featureSetId`
- `configHash`
- `dataHash`
- `marketSnapshotAt`
- `featureComputedAt`
- `sourceFreshness`
- deterministic `replayInputHash`

Missing or stale timestamps produce warnings such as `missing_feature_computed_timestamp` or `stale_market_snapshot`. These warnings are diagnostics only and must not loosen live entry safety. They are exposed through decision audit normalization and the dashboard fallback summary `decisionInputLineageSummary`.

## Data Freshness

`src/runtime/dataFreshnessScore.js` scores market, news, recorder and stream timestamps as `fresh`, `stale`, `degraded` or `unknown`.

The dashboard exposes this as diagnostics. It does not loosen or tighten live trading behavior directly.

## Dataset Quality Gate

`src/runtime/datasetQualityGate.js` combines recorder integrity, freshness, samples, source coverage and failure stats into:

- `blocked`
- `weak`
- `usable`
- `strong`

This gate is for research/retrain trust only. It must not auto-promote strategies or alter live thresholds.

## Backtest Integrity

`src/backtest/backtestIntegrity.js` validates backtest result shape:

- config hash present
- data hash present
- finite metrics
- trade count consistency
- no future timestamps
- no impossible PnL values

It does not change strategy behavior.

## Replay Pack Manifest

`src/runtime/replayPackManifest.js` builds deterministic replay pack manifests with input hashes and warnings for missing/duplicate samples.

Run:

```sh
node src/cli.js replay:manifest --type operator_review
```

The command is read-only and prints a manifest without writing files.
