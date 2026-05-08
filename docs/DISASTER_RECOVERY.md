# Disaster Recovery

Use dry-run commands first. Do not place live orders from recovery tooling.

## Corrupt runtime.json

1. Stop the bot.
2. Run `node src/cli.js ops:recover-preview`.
3. Run `node src/cli.js ops:restore-test`.
4. Restore from the latest verified backup only after reviewing open positions and unresolved intents.

## Corrupt journal.json

1. Stop the bot.
2. Preserve the corrupt file for audit.
3. Use the latest backup bundle and compare trade counts with exchange truth before resuming live mode.

## Missing model registry

1. Keep trading in paper or live-observe.
2. Rebuild model state from journal/replay data.
3. Do not promote neural influence until readiness and release checks are clean.

## Half-written snapshot

1. Remove stale `.tmp` files only after the bot is stopped.
2. Run `node src/cli.js ops:restore-test`.
3. Start with `node src/cli.js status` before `run`.

## Open live position after crash

1. Do not assume local state is authoritative.
2. Compare exchange position, open orders, protective orders, and execution intents.
3. Keep new entries paused until protection is verified.

## Unresolved execution intent

1. Run `node src/cli.js ops:readiness`.
2. Inspect unresolved IDs in the report.
3. Reconcile exchange truth before clearing or retrying any intent.

## Dashboard/API failure

1. Use CLI status and readiness as source of truth.
2. Restart dashboard only after runtime write health is clean.
3. Treat stale dashboard snapshots as stale, not as a healthy bot.

## Websocket or user stream failure

1. Keep entries paused if live stream freshness is unknown.
2. Use REST reconciliation as a temporary truth source.
3. Resume entries only after stream health is current.

## Binance REST ban or rate pressure

1. Stop nonessential polling.
2. Keep recovery/protective checks only.
3. Do not retry aggressively.

## API key compromise

1. Disable the key in Binance immediately.
2. Rotate environment variables.
3. Run `node src/cli.js ops:keys-check`.
4. Run readiness before any live restart.

