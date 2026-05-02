# Feature Audit

`feature:audit` is a read-only integration audit for feature flags and partially integrated modules.

Run:

```bash
node src/cli.js feature:audit
```

or:

```bash
npm run feature:audit
```

The audit reports:

- all boolean feature flags discovered from normalized config
- whether each flag is present in `.env.example`
- source references for each flag
- targeted integration status for recent feature work
- classifications such as `complete`, `partial`, `config_only`, `module_exists_but_unused`, `missing_tests`, `missing_dashboard`, and `live_risk_review_needed`

This command must not change trading behavior. Treat `module_exists_but_unused` as a signal to either wire the module into diagnostics in a later patch or remove the flag/module deliberately. Do not enable live-affecting flags without a separate live risk review and replay evidence.
