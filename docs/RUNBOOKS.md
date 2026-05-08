# Operator Runbooks

Each runbook starts with read-only checks. Mutating recovery requires explicit confirmation.

## Bot start failure

Symptoms: CLI exits, service restarts, no cycle heartbeat.
Checks: `node src/cli.js doctor`, `node src/cli.js ops:readiness`.
Safe commands: `node src/cli.js status`, `node src/cli.js ops:storage-report`.
Forbidden: deleting runtime state before backup review.

## Dashboard does not open

Symptoms: browser cannot reach dashboard, API readiness missing.
Checks: `node src/cli.js ops:readiness`, port and process status.
Safe commands: `node src/cli.js dashboard`.
Forbidden: trusting old screenshots or cached dashboard data.

## Binance API failure

Symptoms: REST errors, degraded exchange truth, readiness warning.
Checks: `node src/cli.js ops:keys-check`, `node src/cli.js rest:audit`.
Safe commands: read-only status and doctor.
Forbidden: repeated live retries during rate pressure.

## Websocket or user stream disconnected

Symptoms: stale stream health, no user stream events, stale fills.
Checks: readiness stream checks and exchange truth.
Safe commands: `node src/cli.js status`.
Forbidden: opening live entries while fills/protection are stale.

## Runtime or journal corrupt

Symptoms: state load errors, missing dashboard history, schema warnings.
Checks: `node src/cli.js ops:restore-test`.
Safe commands: `node src/cli.js ops:recover-preview`.
Forbidden: hand-editing live position state without exchange reconciliation.

## Open position without protective order

Symptoms: stale protective symbols, exchange safety blocked.
Checks: `node src/cli.js exchange-safety:status`, readiness.
Safe commands: reconcile plan preview.
Forbidden: opening more entries in the same symbol.

## Reconcile mismatch or unresolved intent

Symptoms: unresolved intent IDs, exchange-only or local-only orders.
Checks: `node src/cli.js reconcile:plan`, `node src/cli.js ops:readiness`.
Safe commands: `node src/cli.js ops:recover-preview`.
Forbidden: clearing intents without exchange evidence.

## Live mode blocked

Symptoms: readiness blocked, live acknowledgement missing, protection disabled.
Checks: `node src/cli.js ops:release-check`.
Safe commands: `node src/cli.js ops:readiness`.
Forbidden: weakening safety gates to force entries.

## Neural rollback or fast execution disable

Symptoms: neural influence warning, fast execution warning, panic alert.
Checks: neural readiness and release check.
Safe commands: neural read-only CLI reports and dry-run ops commands.
Forbidden: enabling live autonomy without release and readiness passing.

## Panic pause

Symptoms: critical or panic alert, unexpected exposure, exchange mismatch.
Checks: readiness, incident export.
Safe commands: `node src/cli.js ops:incident-export`, panic dry-run.
Forbidden: hidden/manual state changes without audit.

## API key compromise

Symptoms: unexpected permissions, unknown orders, leaked key suspicion.
Checks: `node src/cli.js ops:keys-check`.
Safe commands: disable/rotate key outside the bot, then run readiness.
Forbidden: continuing live trading with the suspected key.

