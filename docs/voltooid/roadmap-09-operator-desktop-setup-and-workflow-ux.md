# Roadmap 09 - Operator Desktop, Setup en Workflow UX

Status: voltooid  
Voltooid op: 2026-05-17  
Aanmaakdatum: 2026-05-17  
Analysebasis: volledige codebase-inspectie, `docs/`, `docs/voltooid/`, desktop app, dashboard server/app, setup wizard, profiles, operator workflow en API-contracten.

## Eerst gecontroleerd

Voor deze roadmap is eerst gekeken in:

- `docs/`
- `docs/voltooid/`

Er is al een voltooide roadmap voor dashboard/readmodel/operator truth. Deze roadmap mag daarom geen nieuw dashboard-readmodel bouwen en geen backend/frontend waarheid dupliceren. De focus ligt op operatorervaring, setup, desktop betrouwbaarheid en workflow bovenop bestaande dashboard en runtime payloads.

## Doel

Maak de lokale operatorervaring voorspelbaar en professioneel:

- eerste setup zonder verwarring
- veilige profielkeuze met diff en preview
- desktop app die dashboardstatus betrouwbaar weergeeft
- operator actions die uitlegbaar en auditable zijn
- runbooks gekoppeld aan concrete blockers
- Windows entrypoints en service-ervaring betrouwbaarder
- geen UI-status die backendproblemen verbergt

## Belangrijkste bestaande bouwstenen

- `desktop/main.js`: Electron main process, embedded dashboard, tray, diagnostics, status polling.
- `desktop/preload.js`: desktop preload entry.
- `src/dashboard/server.js`: API routes, static serving, mutation trust checks.
- `src/dashboard/public/app.js`: dashboard rendering, profiles, setup wizard, quick actions, learning, health en explainability.
- `src/setup/setupWizard.js`: setup plan, env write en CLI summary.
- `src/config/profiles.js`: config profile resolution.
- `src/config/tradeProfiles.js`: trade profile preview.
- `src/runtime/operatorWorkflow.js`: manual review queue en SLA.
- `src/runtime/operatorActionQueue.js`: action normalisatie, dedupe, urgency en blocking actions.
- `src/runtime/operatorRunbookGenerator.js`: runbooks en operator action result.
- `src/ops/notificationRouter.js`: notification routing.
- Windows scripts: `Start-Dashboard.cmd`, `Start-BotService.cmd`, `Start-Everything.cmd`, `Install-Windows11.cmd`.

## Niet dubbel bouwen

Niet opnieuw bouwen:

- geen tweede dashboard backend
- geen tweede snapshot waarheid
- geen nieuwe config parser naast `profiles.js` en `tradeProfiles.js`
- geen losse operator-action store naast `operatorActionQueue`
- geen parallel notificatiesysteem naast `notificationRouter` en alert dispatcher

Wel doen:

- setup en profielkeuze als state machine beschrijven
- desktop diagnostics uitbreiden met actionable states
- quick actions koppelen aan runbook/preflight
- operator feedback veiliger en duidelijker maken
- Windows workflows testen en documenteren

## Bevindingen uit analyse

1. Dashboard server en frontend hebben al veel functionaliteit, inclusief profiles, setup wizard, quick actions en render smoke helpers.
2. Desktop main process start embedded dashboard, pollt GUI status en beheert tray, maar kan rijkere diagnostics en herstelroutes tonen.
3. Setup wizard kan env plannen en schrijven, maar de operatorervaring kan sterker met preview/diff/rollback.
4. Operator action queue en runbook generator bestaan, maar kunnen dichter op dashboard quick actions en manual review SLA worden aangesloten.
5. API-routecontracten slagen, dus UX-uitbreidingen moeten contract-first blijven.
6. Windows scripts zijn belangrijke entrypoints en verdienen smokechecks en operatorgerichte foutmeldingen.

## Gewenste eindstaat

Een operator kan lokaal:

- zien of setup compleet is
- veilig een profiel kiezen
- zien wat een profiel verandert
- dashboard en bot starten vanuit desktop of scripts
- blockers en operator actions begrijpen
- quick actions uitvoeren met preflight-resultaat
- incident/runbook advies zien bij problemen
- onderscheid zien tussen stale snapshot, stopped bot en backend error

## Fase 1 - Setup State Machine

Taken:

- Definieer setup states:
  - fresh_install
  - env_missing
  - profile_selected
  - paper_ready
  - dashboard_ready
  - doctor_warning
  - live_locked
  - live_preflight_required
- Laat `setupWizard`, dashboard en desktop dezelfde state gebruiken.
- Voeg duidelijke reasons toe wanneer setup niet compleet is.
- Toon live altijd als locked tenzij preflight evidence volledig is.

Acceptatiecriteria:

- Geen UI kan live readiness suggereren zonder preflight.
- Setup state is afleidbaar uit bestaande config/env/doctor data.
- Tests voor missing env, paper-ready en live-locked states.

## Fase 2 - Profile Diff en Safe Apply

Taken:

- Breid `buildTradeProfilePreview` uit met:
  - changed keys
  - risk impact
  - live impact
  - requires restart
  - rollback hint
- Voeg apply-preflight toe:
  - env writable
  - current mode safe
  - no active live position risk
  - profile known
- Maak dashboard apply-result expliciet.

Acceptatiecriteria:

- Operator ziet exact wat verandert.
- Onbekende profielvelden worden niet stil genegeerd.
- Risk-impact is zichtbaar voordat apply gebeurt.

## Fase 3 - Desktop Health Tray 2.0

Taken:

- Breid desktop tray/status uit met:
  - dashboard reachable
  - bot running
  - snapshot age
  - setup state
  - blocking operator actions
  - last error
  - mode
- Voeg herstelacties toe:
  - open dashboard
  - refresh status
  - start dashboard
  - view diagnostics
  - copy diagnostic summary
- Log desktop failures zonder secrets.

Acceptatiecriteria:

- Desktop toont niet alleen process alive, maar functionele status.
- Stale dashboard of failed backend is zichtbaar.
- Tray blijft bruikbaar wanneer dashboard niet start.

## Fase 4 - Operator Quick Actions met Preflight

Taken:

- Koppel dashboard quick actions aan `operatorRunbookGenerator`.
- Elke quick action krijgt:
  - action id
  - target
  - preflight checks
  - allowed/denied
  - denial reasons
  - before/after root blocker
  - next recommended action
- Quick actions mogen geen fake success tonen.

Acceptatiecriteria:

- UI toont denial als denial.
- Mutaties blijven via trusted mutation checks lopen.
- Tests dekken allowed en denied action result.

## Fase 5 - Guided Troubleshooting

Taken:

- Bouw een operator troubleshooting flow bovenop bestaande diagnostics:
  - no market data
  - no paper trades
  - dashboard stale
  - setup incomplete
  - REST degraded
  - stream stale
  - live locked
- Elke flow verwijst naar concrete check en command.
- Voeg runbook-link of runbook-card toe in dashboard.

Acceptatiecriteria:

- Troubleshooting is gekoppeld aan werkelijke runtime state.
- Geen generieke tekst zonder evidence.
- Operator ziet eerst veilige acties.

## Fase 6 - Windows Entry Point Hardening

Taken:

- Controleer `.cmd` entrypoints op:
  - cwd correct
  - Node/npm detectie
  - foutmelding bij ontbrekende dependencies
  - loglocatie
  - dashboard URL
  - safe default paper mode
- Voeg smokecheck documentatie toe.
- Overweeg script tests als de command files stabiel parsebaar zijn.

Acceptatiecriteria:

- Windows gebruiker kan dashboard en bot starten zonder verborgen cwd-problemen.
- Fouten geven een concrete vervolgstap.
- Scripts lekken geen secrets.

## New features

- Unified Setup State Machine.
- Profile Diff en Safe Apply.
- Desktop Health Tray 2.0.
- Quick Action Preflight Cards.
- Guided Troubleshooting flows.
- Windows Entry Point smokechecks.
- Operator diagnostic summary.

## Verificatiecommando's

Minimaal:

- `npm.cmd run check:imports`
- `npm.cmd run debug:api-contracts`
- `npm.cmd test`

Aanvullend bij dashboard/desktop:

- `npm.cmd run smoke:dashboard`
- `npm.cmd run debug:dashboard-dom`
- `npm.cmd run dashboard`
- handmatige desktop start op Windows

## Definitie van klaar

Deze roadmap is pas klaar wanneer:

- setup state eenduidig is
- profile changes vooraf zichtbaar zijn
- desktop functionele status toont
- quick actions preflight en denial reasons tonen
- troubleshooting flows evidence-based zijn
- Windows entrypoints duidelijke safe defaults en errors hebben

Na volledige uitvoering en verificatie moet dit bestand worden verplaatst naar `docs/voltooid/`.
