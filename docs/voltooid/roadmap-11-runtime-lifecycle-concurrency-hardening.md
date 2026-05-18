# Roadmap 11 - Runtime Lifecycle & Concurrency Hardening

Status: actief
Analyse datum: 2026-05-18
Scope: `src/runtime`, `src/dashboard/server.js`, CLI mutaties, bot manager locks, shutdown/restart paden.

## Analysebasis

Deze roadmap is gebaseerd op de codebase-analyse van:

- `src/runtime/botManager.js`
- `src/runtime/botLifecycleStateMachine.js`
- `src/runtime/runtimeLiveness.js`
- `src/runtime/cycleRunner.js`
- `src/dashboard/server.js`
- `src/cli/runCli.js`
- `test/runtimeMutation.tests.js`
- `test/botLifecycle.tests.js`
- `docs/voltooid/roadmap-03-dashboard-readmodel-operator-truth.md`
- `docs/voltooid/roadmap-09-operator-desktop-setup-and-workflow-ux.md`

Belangrijk: deze roadmap dupliceert de voltooide dashboard-roadmap niet. Die ging over operator truth en setup UX. Deze roadmap gaat specifiek over lifecycle-concurrency, mutatie-idempotentie en races tussen dashboard, CLI, bot loop en shutdown/restart.

## Probleemstelling

De bot heeft meerdere mutatie-ingangen:

- dashboard routes zoals `/api/start`, `/api/stop`, `/api/config/profile/apply`, `/api/setup/complete`
- CLI commands zoals `run`, `once`, `dashboard`, `status`, `doctor`
- interne self-heal acties
- loop-afronding in `runLoop`
- reinitialisatie via env/profile wijzigingen

Er is al een `withLock` serialisatie in `BotManager`, maar de code heeft nog paden waar lifecycle-state, `runState`, `loopPromise`, `stopRequested`, `stopReason` en bot reinitialisatie elkaar kunnen kruisen. De recente `stopping -> stopping` fout bewees dat idempotentie niet overal expliciet is.

## Doel

Maak alle runtime mutaties expliciet, idempotent en observeerbaar zodat:

- dubbele stop/start requests veilig zijn
- profiel toepassen geen lifecycle race veroorzaakt
- setup complete en profiel apply betrouwbare resultaten teruggeven
- een pending stop zichtbaar blijft zonder operator-acties te blokkeren die veilig mogen wachten
- `runState` en lifecycle nooit uit elkaar driften
- stuck shutdowns detecteerbaar en herstelbaar zijn

## Fase 1 - Lifecycle Contract Matrix

Maak een contractmatrix voor elke manager-mutatie:

- `init`
- `start`
- `stop`
- `runCycleOnce`
- `refreshAnalysis`
- `setMode`
- `applyConfigProfile`
- `completeSetup`
- `forceReconcile`
- `setProbeOnly`
- policy/promotion mutaties

Per mutatie vastleggen:

- toegestane beginstates
- effect op `runState`
- effect op lifecycle
- of de mutatie mag wachten op `stopping`
- of de mutatie een pending stop mag afbreken
- of bot reinitialisatie vereist is
- of live mode extra guardrails vereist

Deliverables:

- nieuwe module `src/runtime/managerMutationContract.js`
- contract-testbestand `test/managerMutationContract.tests.js`
- dashboard/CLI mutaties verwijzen naar dezelfde contract-definities

## Fase 2 - Idempotente Mutatie Helpers

Introduceer kleine helpers in `BotManager`:

- `transitionToStopping(reason)`
- `transitionToStopped(reason)`
- `waitForStableStopped({ timeoutMs, reason })`
- `ensureNoPendingStopBeforeMutation(mutationName)`
- `markMutationStarted(name)`
- `markMutationFinished(name, result)`

De helpers moeten:

- geen illegale state-machine transities gooien voor herhaalde stop/stopped states
- wel echte verboden transities blijven weigeren
- lifecycle history bruikbaar houden
- liveness events schrijven met mutatienaam en reden

## Fase 3 - Pending Stop Queue

Voeg een expliciete pending-stop laag toe:

- `manager.pendingStop = { reason, requestedAt, timeoutMs, acceptedBy }`
- dashboard stop krijgt `accepted/pending`
- profiel apply wacht op pending stop of faalt met duidelijke operator-uitleg
- setup complete wacht op pending stop als dat veilig is
- start blokkeert zolang pending stop niet afgerond is

Dashboard response moet tonen:

- `manager.pendingStop.reason`
- `manager.pendingStop.ageMs`
- `manager.pendingStop.canRetry`
- `manager.pendingStop.safeActions`

## Fase 4 - Reinitialize Safety

Hard reinitialize paden:

- voorkom dat `reinitializeBot` parallel met loop cleanup draait
- sluit oude bot-instantie alleen een keer
- detecteer of `this.bot` tijdens async close is vervangen
- schrijf reload result met `reloadOk`, `reloadError`, `reloadStartedAt`, `reloadFinishedAt`
- maak rollback van env wijzigingen alleen waar dat veilig is

## Fase 5 - Dashboard en CLI Consistentie

Pas dashboard en CLI aan zodat ze hetzelfde gedrag rapporteren:

- start/stop/profile apply tonen dezelfde lifecycle termen
- status payload toont pending mutation
- `/api/health` en `/api/readiness` onderscheiden `stopping`, `stopped`, `ready`, `degraded`
- CLI `status` toont een korte operatoractie wanneer een stop pending blijft

## Tests

Minimaal toevoegen:

- dubbele `/api/stop` tijdens lopende cycle
- `/api/config/profile/apply` terwijl stop pending is
- `/api/setup/complete` terwijl stop pending is
- `start` tijdens stop pending blokkeert netjes
- `runLoop` sluit af vanuit `running`, `degraded`, `stopping`, `stopped`
- `reinitializeBot` faalt na env write en geeft profile apply success/failure correct terug
- self-heal live stop en dashboard stop kruisen elkaar niet

Te draaien verificatie:

- `npm.cmd test -- --grep=lifecycle`
- `npm.cmd test -- --grep=runtime mutation`
- `npm.cmd test -- --grep=profile`
- `npm.cmd run status`
- `npm.cmd test`

## Definition of Done

- Alle manager-mutaties hebben een contract.
- Geen bekende route kan `Invalid bot lifecycle transition: stopping -> stopping` of vergelijkbare idempotency-fout veroorzaken.
- Dashboard profiel toepassen werkt tijdens stopped, ready en pending-stop scenario's.
- Status payload maakt pending/stuck lifecycle states zichtbaar.
- Full test suite groen.
