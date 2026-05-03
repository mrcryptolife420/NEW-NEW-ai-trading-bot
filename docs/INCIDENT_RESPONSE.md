# Incident Response

This runbook documents operator-safe responses. Commands here are read-only or dry-run unless explicitly stated otherwise by an existing reviewed live flow.

## Exchange Truth Freeze

1. Run `node src/cli.js doctor`.
2. Run `node src/cli.js incidents:create --type exchange_truth_freeze`.
3. Inspect `node src/cli.js intents:summary`.
4. Do not open new entries until exchange truth clears.
5. Use `node src/cli.js live:panic-plan` only to prepare a dry-run flat plan.

## Reconcile Conflict

1. Run `node src/cli.js doctor`.
2. Create an incident report with `node src/cli.js incidents:create --type reconcile_conflict --severity high`.
3. Review open positions, unmatched orders and protection status.
4. Do not manually resolve inventory drift without confirming venue truth.

## Unresolved Execution Intent

1. Run `node src/cli.js intents:list`.
2. Create an incident report with `node src/cli.js incidents:create --type execution_intent`.
3. Keep entries blocked for affected symbols until the intent is resolved or recovered by the existing lifecycle flow.

## Protection Failure

1. Run `node src/cli.js doctor`.
2. Check dashboard risk locks and lifecycle state.
3. Use `live:panic-plan` only as a dry-run review artifact.
4. Rebuild protection only through existing reviewed broker/reconcile paths.

## Dashboard Stale

1. Run `node src/cli.js status`.
2. Compare snapshot freshness, portfolio freshness and runtime cycle age.
3. Restart dashboard if needed; do not infer trading safety from stale frontend data.

## Manual Review Required

1. Run `node src/cli.js incidents:create --type manual_review`.
2. Inspect `doctor`, `status`, `intents:list` and `live:panic-plan`.
3. New entries should remain disabled for affected symbols until review is complete.

## Live Readiness

Live readiness diagnostics are advisory. They never switch the bot to live mode. Readiness is blocked by missing live acknowledgement, missing credentials, disabled exchange protection, critical alerts, unresolved intents, reconcile freeze, rollback recommendation or insufficient promotion dossier.
