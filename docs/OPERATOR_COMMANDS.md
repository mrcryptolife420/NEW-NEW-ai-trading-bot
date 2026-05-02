# Operator Commands

All commands below are intended to be safe in the default paper setup. Commands that inspect live exchange truth may perform read-only exchange requests when credentials/config allow it; they must not place orders.

| Command | Purpose | Notes |
| --- | --- | --- |
| `npm run status` / `node src/cli.js status` | Current runtime/dashboard status | Read-only manager initialization. |
| `npm run doctor` / `node src/cli.js doctor` | Operational health, config validation, readiness diagnostics | May include read-only exchange/reconcile diagnostics. |
| `npm run once` / `node src/cli.js once` | Run one bot cycle | Paper by default; live still requires live fail-fast checks and protections. |
| `npm run dashboard` / `node src/cli.js dashboard` | Start local dashboard | Uses configured dashboard port. |
| `npm run report` / `node src/cli.js report` | Build operator report | Read-only report generation. |
| `node src/cli.js intents:list` | List unresolved execution intents | Read-only ledger view. Shows symbol, kind, age, status and last step. |
| `node src/cli.js intents:summary` | Summarize execution intent ledger | Read-only counts by status/kind plus unresolved rows. |
| `npm run readmodel:rebuild` / `node src/cli.js readmodel:rebuild` | Rebuild SQLite/read-model from source-of-truth data | Rebuildable diagnostic layer, not source of truth. |
| `npm run readmodel:status` / `node src/cli.js readmodel:status` | Inspect read-model health | Read-only. |
| `node src/cli.js readmodel:dashboard` | Export read-model dashboard summary | Read-only. |
| `node src/cli.js request-budget` | Inspect REST/request-budget pressure from read-model | Read-only diagnostics. |
| `node src/cli.js learning:failures` | Summarize exit-quality and failure-library labels | Read-only analytics. |
| `node src/cli.js learning:promotion` | Build paper-to-live promotion dossier and rollback watch | Diagnostics only; no live promotion/rollback. |
| `node src/cli.js learning:replay-packs` | Rank replay candidates for bad-veto, reconcile and complexity review | Read-only analytics. |

## Safety Notes

- Do not set `BOT_MODE=live` unless the live acknowledgement, credentials and exchange protection checks pass.
- `intents:list` and `intents:summary` intentionally do not resolve, delete or mutate intents.
- `learning:*` commands intentionally do not promote strategies, roll back live settings or change thresholds.
- Paper profile values are `sim`, `learn`, `research` and `demo_spot`; hard-safety blockers remain hard in all profiles.
