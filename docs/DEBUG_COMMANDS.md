# Debug Commands

Run the foundation checks first:

```powershell
npm run check:critical
npm run check:syntax
npm run check:imports
npm run check:env
npm run test:smoke
```

Dashboard and live-preflight contract checks:

```powershell
npm run debug:api-contracts
npm run debug:dashboard-dom
npm run smoke:dashboard
node src/cli.js live:preflight
```

Then run the broader suite:

```powershell
npm test
npm run coverage
node src/cli.js doctor
node src/cli.js status
```

Test runner filters:

```powershell
npm test -- --grep=import
npm run test:unit
npm run test:integration
npm run test:safety
npm test -- --grep="state store"
npm test -- --grep="live preflight"
```

`check:env` fails on duplicate keys in `.env.example`. Local `.env` duplicate keys are warnings unless `STRICT_ENV=true`.

`debug:secrets` is intended for CI/release gating. Local `.env` findings must be reviewed by the operator and should not be auto-edited by debug automation.
