# Release Checklist

1. Run `npm test`.
2. Run `node src/cli.js ops:readiness`.
3. Run `node src/cli.js ops:release-check`.
4. Run `node src/cli.js ops:backup-now`.
5. Run `node src/cli.js ops:restore-test`.
6. Confirm no critical alerts, unresolved intents, or manual review positions.
7. Confirm release channel: `dev`, `paper`, `live-observe`, or `live-conservative`.
8. Confirm rollback target in `docs/ROLLBACK_PLAN.md`.
9. For live release, complete live-observe before live-conservative.

