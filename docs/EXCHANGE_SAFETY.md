# Exchange Safety And Auto-Reconcile

Exchange safety blocks new entries when runtime state and venue truth are not reliable enough. This is intentional: reconcile, exits and protection recovery are allowed to continue, but new exposure must wait for stronger evidence.

## What Auto-Reconcile Can Do

`src/execution/autoReconcileCoordinator.js` builds a pure evidence-first plan. It can propose:

- `clear_local_reconcile_flag` when local position quantity, account balance and protective order evidence agree.
- `mark_position_flat_confirmed` when local state shows a position, but exchange balance is flat, there are no open orders/lists and recent sell evidence supports the flat state.
- `rebuild_protective_order` when a live/demo position exists, protection is missing, exchange protection is enabled, market data and symbol rules are available and OCO geometry is valid.
- `clear_exchange_safety_block` only when unlock checks also show no critical alerts, no unresolved entry/protection intents and no blocking positions.

## What Stays Manual Review

Auto-reconcile does not force-unlock ambiguous exchange truth. Manual review remains required for:

- REST and user-data stream conflicts.
- Partial fills without clear final status.
- Account balance mismatch above tolerance.
- Open orders that do not match the managed symbol or expected side.
- Invalid protective OCO geometry.
- Unknown order status or ambiguous recent fills.
- Unresolved execution intents.
- Stale exchange evidence when fresh stream or REST proof is required.

## Commands

- `node src/cli.js exchange-safety:status` shows the current entry block, blocking positions, next action and unlock eligibility.
- `node src/cli.js reconcile:plan` prints the auto-reconcile plan without changing state.
- `node src/cli.js reconcile:run` applies only safe local actions from the plan. It does not force-unlock and does not place orders from the CLI path.

## Unlock Rule

Entries can resume only when:

- The plan is `entryUnlockEligible=true`.
- There are no plan blocking reasons.
- No critical alerts are active.
- No unresolved entry/protection intents exist.
- No position is still `reconcileRequired` or `manualReviewRequired`.
- Open positions are protected or explicitly in a safe managed state.

Live mode remains stricter than paper. Lower confidence thresholds are not accepted for live safety recovery.

## Post-Reconcile Probation

After an evidence-backed exchange-safety unlock, the bot enters a temporary post-reconcile probation window. Probation limits new risk without disabling multi-position support:

- Normal healthy state still uses `MAX_OPEN_POSITIONS`, `MAX_TOTAL_EXPOSURE_FRACTION`, `MAX_POSITION_FRACTION` and existing portfolio/sector/family/regime limits.
- Probation uses `POST_RECONCILE_MAX_OPEN_POSITIONS` instead of a hardcoded single-position cap. The default is 2 live positions, with `POST_RECONCILE_PAPER_MAX_OPEN_POSITIONS` available for paper diagnostics.
- Probation limits new entries per cycle via `POST_RECONCILE_MAX_NEW_ENTRIES_PER_CYCLE`.
- Probation temporarily lowers total exposure and size via `POST_RECONCILE_MAX_TOTAL_EXPOSURE_MULTIPLIER`, `POST_RECONCILE_LIVE_SIZE_MULTIPLIER` and `POST_RECONCILE_PAPER_SIZE_MULTIPLIER`.
- Safety blockers remain dominant: exchange-safety red state, unresolved intents, reconcile-required positions and manual review still block all new entries.

Use `node src/cli.js post-reconcile:status` to inspect remaining probation slots and the exact reason an additional entry is allowed or blocked.
