# Rollback Plan

Default rollback target is the last commit and config snapshot that passed:

- `npm test`
- `node src/cli.js ops:readiness`
- `node src/cli.js ops:restore-test`
- `node src/cli.js ops:release-check`

Rollback steps:

1. Stop the bot.
2. Preserve current runtime and incident export.
3. Restore the previous code/config snapshot.
4. Run restore-test and readiness.
5. Restart in paper or live-observe first.

