# Performance Ledger

`src/runtime/performanceLedger.js` is a read-only audit helper for realized PnL, fees, fills, cost basis, partial exits, dust residuals, quote/base conversions, and trade attribution.

## Scope

The ledger consumes existing journal/trade/fill/account-delta records. It does not place orders, mutate broker state, close positions, or change live execution behavior.

## Outputs

- Per-trade records: cost basis, proceeds, average entry/exit, break-even price, realized PnL, quote/base fees, fill count, partial exit count, dust quantity, labels, and attribution.
- Per-day summary: trade count, realized PnL, fees, cost basis, proceeds, wins, losses, and win rate.
- Reconciliation checks: ledger-vs-account PnL mismatch, fill count mismatch, non-finite values, and large dust residuals.

## Safety

- Ledger status is `ok`, `warning`, or `corrupt`.
- The helper is read-only and audit-first.
- It does not relax exchange safety, reconcile, manual review, execution-intent, or protection blockers.
- Dashboard visibility is optional through `performanceLedgerSummary`, so older snapshots remain backward compatible.
