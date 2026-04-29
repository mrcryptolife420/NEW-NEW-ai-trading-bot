# Architecture

## Runtime path

1. `src/cli.js` laadt config en logger en roept `src/cli/runCli.js` aan.
2. `runCli.js` routeert bot-commando's via `src/runtime/botManager.js`.
3. `BotManager` bewaakt lifecycle, mode, read-only commands en dashboard snapshots.
4. `src/runtime/tradingBot.js` blijft de centrale runtime-engine voor analyse, scanning, risk/execution, persistence en read models.
5. `src/runtime/decisionPipeline.js` vormt nu de expliciete `signal -> risk -> intent -> execution -> audit` grens.

## Lagen

### CLI
- `src/cli.js`
- `src/cli/runCli.js`

### Config
- `src/config/index.js`
- `src/config/schema.js`
- `src/config/validate.js`
- `src/config/profiles.js`

### Runtime orchestration
- `src/runtime/botManager.js`
- `src/runtime/tradingBot.js`
- `src/runtime/cycleRunner.js`
- `src/runtime/botLifecycleStateMachine.js`
- `src/runtime/persistenceCoordinator.js`

### AI / adaptive
- `src/ai/*`
- `src/runtime/onlineAdaptationController.js`
- `src/runtime/adaptiveParameterOptimizer.js`
- `src/runtime/adaptiveGovernanceService.js`
- `src/runtime/modelRegistry.js`

### Risk
- `src/risk/riskManager.js`
- `src/risk/entryGuards.js`
- `src/risk/entrySizing.js`
- `src/risk/entryFinalize.js`
- `src/risk/reasonCodes.js`

### Execution
- `src/execution/executionEngine.js`
- `src/execution/paperBroker.js`
- `src/execution/liveBroker.js`

### Dashboard
- `src/dashboard/server.js`
- `src/dashboard/public/app.js`
- `src/runtime/dashboardSnapshotBuilder.js`

### Storage / audit
- `src/storage/stateStore.js`
- `src/storage/marketHistoryStore.js`
- `src/storage/auditLogStore.js`

## Current hardening focus

- Fail-fast config validation before runtime start.
- Eén expliciete bot lifecycle met guarded transitions.
- Canonical risk verdict + reason codes.
- Structured audit logging naar NDJSON onder `data/runtime/audit/`.
- Dashboard contract v3 met expliciete `ops.*` health-secties.

## Known boundaries

- `src/runtime/tradingBot.js` is nog groot en bevat nog steeds veel orchestration.
- Strategy heuristics en execution policies gebruiken nog deels legacy string-contracten.
- Dashboard blijft poll-based; de snapshot is nu explicieter, niet event-driven.
