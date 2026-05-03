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
| `node src/cli.js incidents:create --type manual_review` | Create a local incident report from runtime state | Safe local write under runtime incidents directory; no exchange calls. |
| `node src/cli.js incidents:summary` | List local incident reports | Read-only. |
| `node src/cli.js live:panic-plan` | Build panic flatten plan | Dry-run only; no orders or cancels. |
| `node src/cli.js reconcile:plan` | Build evidence-first auto-reconcile plan | Read-only. Shows safe actions, missing evidence, confidence and entry-unlock eligibility. |
| `node src/cli.js reconcile:run` | Apply only safe auto-reconcile actions | Mutates local runtime state only for evidence-proven flag clear/flat confirmation; no force unlock and no direct CLI order placement. Protective rebuilds require an existing broker flow. |
| `node src/cli.js exchange-safety:status` | Explain current exchange-safety entry block | Read-only. Shows blocking positions, next action and whether entries can be unlocked. |
| `node src/cli.js storage:audit` | Inspect runtime/journal/audit/feature-store file presence | Read-only. |
| `node src/cli.js recorder:audit` | Audit recent recorder frames for schema, timestamp, duplicate id and quality issues | Read-only. |
| `node src/cli.js replay:manifest --type operator_review` | Build a deterministic replay pack manifest from recent runtime decisions | Read-only; does not write unless a future explicit write flag is added. |

## Safety Notes

- Do not set `BOT_MODE=live` unless the live acknowledgement, credentials and exchange protection checks pass.
- `intents:list` and `intents:summary` intentionally do not resolve, delete or mutate intents.
- `learning:*` commands intentionally do not promote strategies, roll back live settings or change thresholds.
- `incidents:*` commands do not place orders. `incidents:create` only writes a local JSON report.
- `live:panic-plan` is a dry-run planner and never flattens automatically.
- `reconcile:plan` never mutates state. Use it first when entries are blocked by exchange safety.
- `reconcile:run` does not force-unlock entries. It only applies actions whose evidence clears the coordinator rules.
- `exchange-safety:status` is the fastest read-only view for why entries are blocked and what evidence is missing.
- `storage:audit`, `recorder:audit` and `replay:manifest` do not mutate trading state or call Binance.
- Paper profile values are `sim`, `learn`, `research` and `demo_spot`; hard-safety blockers remain hard in all profiles.

## Operator Mode

Set `OPERATOR_MODE=active|observe_only|protect_only|maintenance|stopped`.

`active` preserves normal behavior subject to risk/safety gates. `observe_only`, `protect_only`, `maintenance` and `stopped` do not allow new entries in the diagnostics layer; `protect_only` and `maintenance` still allow safe position management/reconcile planning.
