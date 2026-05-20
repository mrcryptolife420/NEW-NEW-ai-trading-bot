# Geconsolideerd agentrapport - open punten

Datum: 2026-05-20

Status: read-only auditrapport geconsolideerd na eerste implementatiepass.

Laatste uitgevoerde fix uit dit rapport:

- CLI `reconcile:run` gebruikt nu dezelfde reconcile-clear semantiek als broker reconcile.
- Legacy stop-tightening schrijft geen stop meer boven de actuele market mid.
- Commit: `1a9d419 fix: align reconcile cli safety guards`.

## 1. P0 kritieke bugs

Geen open P0 gevonden.

De eerder uitgevoerde safety gates waren groen:

- `npm.cmd run test:no-live-leak`
- `npm.cmd run test:safety`
- `npm.cmd run test:dashboard`
- `npm.cmd run lint`
- `npm.cmd run format:check`
- `npm.cmd run check:syntax`
- `npm.cmd run check:imports`

## 2. P1 belangrijke bugs

Open:

- Geen expliciete `typecheck` of equivalent shape-contract gate in `package.json`.
- Geen apart contract dat dashboard/API payload-shapes buiten runtime regressietests afdwingt.

Afgewerkt:

- CLI `reconcile:run` lifecycle drift naar `open` zonder OCO/protection evidence.
- Legacy stop-tightening zonder market-mid guard.

## 3. P2 verbeteringen

Open:

- `/api/start` en `/api/stop` gebruiken nog niet dezelfde dashboard action envelope als profile/apply routes.
- `test:safe` alias ontbreekt; huidig equivalent is `test:safety`.
- Coverage-percent contract ontbreekt.
- `qa` en `qa:strict` zijn zwaar en niet als standaard snelle gate ingedeeld.

## 4. Niet-aangesloten modules

Nog niet volledig opnieuw gevalideerd door agents door timeouts:

- `cli_command_surface_auditor`
- `core_tradingbot_lifecycle_auditor`
- `botmanager_exchange_health_auditor`
- `paper_live_boundary_auditor`
- `dashboard_state_api_auditor`
- `positions_pnl_trim_auditor`
- `binance_rate_limit_circuitbreaker_auditor`
- `roadmap_continuity_planner`

Wel afgerond:

- `test_contract_runner`

## 5. Paper/live safety risico's

Open aandachtspunten:

- Voeg een expliciet shape/type safety contract toe voor config, dashboard payloads en action envelopes.
- Houd `test:no-live-leak` verplicht bij wijzigingen aan broker/order-routing/live guards.

Afgewerkt:

- CLI reconcile safety parity met broker reconcile.
- Stop-tightening guard tegen stops boven marktprijs.

## 6. Dashboard/API mismatches

Open:

- Start/stop API responses zijn functioneel, maar missen dezelfde action envelope als andere dashboard mutations.
- Dashboard smoke is niet in de read-only agentrun uitgevoerd omdat dit tijdelijk een server start.

Bevestigd aanwezig:

- Dashboard action contracts.
- Lifecycle enforcement.
- Live acknowledgement enforcement.
- Side-effect-arme `/api/snapshot` met `refreshPrerequisites: false`.

## 7. Binance/rate-limit risico's

Open:

- Specialistische Binance/rate-limit agent timed out; volledige call-path audit is nog niet afgerond.
- `rest:audit` geeft nog `review_required` classificaties terug, ondanks exitcode `0`.

Bevestigd aanwezig:

- Request weight mapping voor belangrijke Binance endpoints.
- Symbol-scoped reconcile retry open-orders fetch.
- `test:no-live-leak` gate is groen.

## 8. Ontbrekende tests

Open:

- `typecheck` script ontbreekt.
- `test:safe` alias ontbreekt.
- Coverage threshold ontbreekt.
- Geen aparte test voor uniforme start/stop action envelope.
- Geen aparte test voor dashboard smoke in deze read-only auditrun.

Toegevoegd in implementatiepass:

- CLI `reconcile:run` blijft `protection_pending` zonder OCO evidence.
- Legacy stop-tightening boven market mid wordt genegeerd.

## 9. Beste implementatievolgorde

Nog open volgorde:

1. Voeg een lichtgewicht `typecheck`/shape-contract gate toe voor JS runtime payloads.
2. Maak `/api/start` en `/api/stop` response envelopes consistent met andere dashboard actions.
3. Voeg tests toe voor start/stop envelope consistentie.
4. Voeg `test:safe` alias toe als expliciete veilige testcommand alias naar `test:safety`.
5. Definieer een coverage threshold of documenteer waarom coverage alleen informatief is.
6. Draai daarna `test:no-live-leak`, `test:safety`, `test:dashboard`, `lint`, `format:check`, `check:syntax`, `check:imports`.

## 10. Een aanbevolen eerste fix

Aanbevolen eerste volgende fix:

- Voeg een lichtgewicht JS shape-contract gate toe.

Reden:

- Het project is JS-only en heeft geen `typecheck`.
- Dashboard/API/runtime payloads zijn groot en kritisch.
- Een shape-contract gate geeft snelle regressiedetectie zonder live trading, watch-mode of serverstart.
