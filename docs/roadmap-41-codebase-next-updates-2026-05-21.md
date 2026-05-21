# Roadmap 41 - Codebase Next Updates

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task.

**Datum:** 2026-05-21

**Doel:** vervolg-roadmap op basis van actuele codebase-analyse met 5 updates, 5 verbeteringen, 5 bugs met fixes en 5 extra trading updates.

**Architectuur:** deze repo is een Node.js/ESM crypto trading bot met CLI entrypoint `src/cli.js`, command orchestration in `src/cli/runCli.js`, runtime orchestration in `src/runtime/botManager.js`, de feitelijke core lifecycle in `src/runtime/tradingBot.js`, execution/broker safety in `src/execution/**`, Binance REST in `src/binance/client.js`, risk/strategy in `src/risk/**` en `src/strategy/**`, dashboard in `src/dashboard/**`, en safety regressies in `test/**`.

**Analysebasis:**

- `package.json`: 78 scripts, met veilige QA scripts zoals `check:syntax`, `check:imports`, `typecheck`, `test:safe`, `debug:package-scripts`, `debug:order-routing`, `debug:api-contracts`.
- Broninventaris: `src` bevat circa 445 source-like files / 127k regels; grootste hotspot is `src/runtime/tradingBot.js` met circa 26k regels.
- Testinventaris: `test` bevat circa 139 source-like files / 55k regels; grootste hotspot is `test/run.js` met circa 33k regels.
- Veilig uitgevoerde checks tijdens analyse:
  - `node scripts/check-package-scripts.mjs` passed: 78 scripts, 122 dispatched commands, 42 registry commands.
  - `node scripts/check-api-route-contracts.mjs` passed: 48 routes.
  - `node scripts/check-order-routing.mjs` passed: 182 private-order callsites, unsafeCount 0.
  - `node src/cli.js feature:audit` eindigde met `findings: []`.
- Bestaande roadmaps 01-40 staan in `docs/voltooid/**`; deze roadmap vermijdt dubbele items en bouwt voort op de afgeronde safety foundations.

**Niet uitvoeren tijdens implementatie zonder expliciete toestemming:** `npm run live`, exchange write actions, long-running watch/dev servers, productie-migraties of dashboard smoke server in unattended mode.

---

## Scope en prioriteiten

1. Live trading blijft beschermd: nieuwe features mogen live alleen blokkeren, verscherpen of read-only diagnosticeren totdat review/evidence compleet is.
2. Paper/demo/live scheiding blijft leidend: elke update krijgt tests die bewijzen dat paper geen live broker raakt.
3. Grote files worden incrementeel opgesplitst zonder gedragswijziging vóórdat nieuwe features worden toegevoegd.
4. Operator surfaces moeten exact tonen of iets read-only, mutating, long-running of live-sensitive is.
5. Elke taak sluit af met minimaal: `npm run check:syntax`, `npm run check:imports`, `npm run typecheck`, gerichte tests, en waar relevant `npm run test:no-live-leak`.

---

## 5 Updates

### Update 1 - Runtime lifecycle slice map voor `tradingBot.js`

**Probleem:** `src/runtime/tradingBot.js` is met circa 26k regels de grootste onderhoudshotspot. Veel roadmap modules zijn aanwezig, maar de lifecycle-ownership is moeilijk te reviewen.

**Doel:** maak een expliciete slice map zonder gedragswijziging.

**Files:**

- Create: `src/runtime/tradingBotSliceMap.js`
- Modify: `src/runtime/tradingBot.js`
- Test: `test/tradingBotSliceMap.tests.js`

**Implementatiestappen:**

1. Voeg een read-only map toe met slices: prerequisites, market data, candidate building, risk decision, execution, post-cycle persistence, dashboard projection.
2. Exporteer `buildTradingBotSliceMap()` met per slice: owner file, belangrijkste functies, live-risk class, test files.
3. Voeg in `tradingBot.js` alleen een import/export of metadata hook toe; geen runtime flow wijzigen.
4. Test dat elke slice een owner, liveRisk en minstens 1 test target heeft.

**Acceptatie:**

- `node test/run.js --grep="trading bot slice map"` passed.
- Geen behavior change in `npm run test:safe`.

---

### Update 2 - Command registry wordt volledige source of truth

**Probleem:** `commandRegistry.js` bevat 42 registry commands, terwijl package validation 122 dispatched commands detecteert. De huidige check is groen, maar metadata coverage is nog niet volledig genoeg voor operator safety.

**Doel:** alle CLI branches krijgen metadata of een expliciete internal/test-only uitzondering.

**Files:**

- Modify: `src/cli/commandRegistry.js`
- Modify: `src/cli/runCli.js`
- Modify: `scripts/check-package-scripts.mjs`
- Test: `test/run.js` of `test/cliCommandRegistry.tests.js`

**Implementatiestappen:**

1. Voeg metadata toe voor alle mutating/live-sensitive branches: `neural:*`, `live:*`, `ops:*`, `research:*`, `docs:*`, `reconcile:*`.
2. Voeg velden toe: `mutating`, `longRunning`, `liveSensitive`, `requiresConfirmation`, `supportsDryRun`.
3. Laat `check-package-scripts.mjs` rapporteren welke branches bewust internal-only zijn.
4. Voeg tests toe voor registry coverage en voor package-script/registry/runCli drift.

**Acceptatie:**

- `npm run debug:package-scripts` passed.
- Help/commands output toont live-sensitive en mutating status.

---

### Update 3 - Feature-audit dossier export naar Markdown

**Probleem:** `node src/cli.js feature:audit` geeft JSON met dossiers, maar operators moeten dit makkelijk in docs kunnen reviewen zonder ruwe JSON output te lezen.

**Doel:** genereer een compact Markdown dossier uit de bestaande feature audit.

**Files:**

- Modify: `src/runtime/featureAudit.js`
- Modify: `src/cli/runCli.js`
- Create: `docs/feature-audit-latest.md` via command output of explicit `--write` flag
- Test: `test/featureAudit.tests.js`

**Implementatiestappen:**

1. Voeg `buildFeatureAuditMarkdown(report)` toe.
2. Voeg CLI optie toe: `node src/cli.js feature:audit --format=markdown` en optioneel `--write=docs/feature-audit-latest.md`.
3. Markdown moet per feature tonen: status, activationStage, liveBehaviorPolicy, missing dashboard fields, testsRequired.
4. Default JSON behavior blijft ongewijzigd.

**Acceptatie:**

- Markdown bevat minimaal de features `indicator_feature_registry`, `dynamic_exit_levels`, `exit_intelligence_v2`, `trade_quality_analytics`, `breakout_retest`, `net_edge_gate`.
- Geen live behavior change.

---

### Update 4 - REST budget state in dashboard/readmodel

**Probleem:** Binance REST state bevat nu `nextAllowedAt` en `schedulerAction`, maar operator surfaces moeten deze concreet tonen zodat bans/backoffs verklaarbaar zijn.

**Doel:** REST budget status zichtbaar maken in dashboard snapshot en cached readmodel.

**Files:**

- Modify: `src/runtime/dashboardSnapshotBuilder.js`
- Modify: `src/runtime/reportBuilder.js`
- Modify: `src/dashboard/public/app.js`
- Test: `test/dashboardSnapshot.tests.js`
- Test: `test/binanceRestArchitecture.tests.js`

**Implementatiestappen:**

1. Voeg `restBudget` section toe met `banActive`, `backoffActive`, `nextAllowedAt`, `schedulerAction`, `topRestCallers`.
2. UI toont compacte badge: ready, delayed, paused-by-ban.
3. Cached readmodel mag stale status tonen, maar moet timestamp en freshness tonen.
4. Test dat ban-active snapshot geen live REST refresh afdwingt.

**Acceptatie:**

- Dashboard snapshot bevat REST scheduler action.
- `npm run test:dashboard` blijft groen.

---

### Update 5 - Roadmap traceability command voor roadmap 41+

**Probleem:** eerdere roadmaps staan in `docs/voltooid/**`, maar nieuwe roadmap items hebben geen automatische koppeling naar tests, files en status.

**Doel:** voeg een read-only traceability command toe voor open roadmaps.

**Files:**

- Modify: `src/docs/runtimeArchitectureMap.js`
- Modify: `src/cli/commandRegistry.js`
- Modify: `src/cli/runCli.js`
- Test: `test/roadmapTraceability.tests.js`

**Implementatiestappen:**

1. Voeg command `roadmap:trace` toe als read-only, no network.
2. Scan `docs/roadmap-*.md` en `docs/voltooid/roadmap-*.md`.
3. Rapporteer per roadmap: status, mentioned files, mentioned tests, missing tests.
4. Geen writes tenzij `--write` expliciet wordt toegevoegd in latere roadmap.

**Acceptatie:**

- `node src/cli.js roadmap:trace` werkt zonder runtime init.
- Command metadata is readOnly true.

---

## 5 Verbeteringen

### Verbetering 1 - Splits `test/run.js` per domein

**Probleem:** `test/run.js` is circa 33k regels. Nieuwe regressies zijn moeilijk te plaatsen en merge-conflicten worden waarschijnlijker.

**Fixrichting:** verplaats clusters naar domeinbestanden zonder testgedrag te veranderen.

**Files:**

- Modify: `test/run.js`
- Create/extend: `test/runtimeManager.tests.js`, `test/cliRuntime.tests.js`, `test/liveBrokerSafety.tests.js`, `test/dashboardSafety.tests.js`
- Modify: `test/domainTestRegistry.js`

**Acceptatie:**

- `npm run test:safe` blijft hetzelfde aantal safety cases draaien of meer.
- `test/run.js` daalt stapsgewijs onder 20k regels.

---

### Verbetering 2 - Shared numeric utilities voor duplicated `safeNumber` / `average`

**Probleem:** veel modules definiëren lokaal `safeNumber`, `num`, `average` of vergelijkbare fallback helpers.

**Fixrichting:** centrale utility, incrementeel toepassen in low-risk modules.

**Files:**

- Create: `src/utils/numberSafety.js`
- Modify low-risk modules eerst: `src/ai/modelBenchmarkHarness.js`, `src/ai/antiOverfitGovernor.js`, `src/runtime/runtimePerformanceSnapshot.js`
- Test: bestaande module tests

**Acceptatie:**

- Geen behavioral diff in tests.
- Utility heeft tests voor NaN, Infinity, numeric strings, null, undefined.

---

### Verbetering 3 - Dashboard frontend component boundaries

**Probleem:** `src/dashboard/public/app.js` is circa 2300 regels en bevat rendering, formatting en UI state door elkaar.

**Fixrichting:** pure render helpers per panel extraheren.

**Files:**

- Create: `src/dashboard/public/renderSafetyPanel.js`
- Create: `src/dashboard/public/renderRestBudgetPanel.js`
- Create: `src/dashboard/public/renderTradingQualityPanel.js`
- Modify: `src/dashboard/public/app.js`
- Test: `scripts/check-dashboard-dom-contract.mjs`, `test/dashboardSnapshot.tests.js`

**Acceptatie:**

- DOM id contract blijft groen.
- Geen dashboard server nodig voor unit-level checks.

---

### Verbetering 4 - Config placeholder deprecation plan

**Probleem:** `featureAudit.js` markeert meerdere legacy/config-only flags als placeholder, zoals `enableCvdConfirmation`, `enableLiquidationMagnetContext`, `enablePriceActionStructure`, `enableStrategyRouter`, `enableTrailingProtection`.

**Fixrichting:** maak een migratieplan en warnings zonder live behavior change.

**Files:**

- Modify: `src/runtime/featureAudit.js`
- Modify: `src/config/validate.js`
- Create: `docs/config-placeholder-deprecation-plan.md`
- Test: `test/configSchema.tests.js`, `test/featureAudit.tests.js`

**Acceptatie:**

- Oude config blijft compatibel.
- Audit toont per placeholder: keep, deprecate, or map-to-provider.

---

### Verbetering 5 - Generated debug inventory freshness guard

**Probleem:** `docs/debug/INVENTORY_SUMMARY.md` is gegenereerd op 2026-05-09 en kan achterlopen op actuele files/scripts/routes.

**Fixrichting:** voeg freshness check toe aan debug inventory of QA strict.

**Files:**

- Modify: `scripts/generate-debug-inventory.mjs`
- Modify: `scripts/check-critical-files.mjs` of nieuw `scripts/check-debug-inventory-freshness.mjs`
- Test: script-level test in `test/run.js` of nieuw `test/debugInventory.tests.js`

**Acceptatie:**

- Check faalt als inventory ouder is dan gewijzigde `src/**`, `test/**`, `package.json` of `scripts/**`.
- Check is read-only en print geen secrets.

---

## 5 Bugs met fixes

### Bug 1 - Registry coverage is groen maar incompleet als operator-safety contract

**Symptoom:** `debug:package-scripts` is groen, maar registry bevat 42 commands tegenover 122 dispatched commands. Dit is geen directe runtime bug, maar wel een command-safety blind spot.

**Fix:** maak coverage expliciet: elke branch moet registry metadata of `internalOnly: true` krijgen.

**Tests:**

- `test/cliCommandRegistry.tests.js`: branch zonder metadata faalt tenzij internal-only allowlist.
- `npm run debug:package-scripts`.

---

### Bug 2 - Request queue heeft nog geen expliciete rejection-regressietest

**Symptoom:** `enqueueRequestWeightFetch()` reset de queue via `run.catch(() => {})`, maar er is nog geen specifieke test die bewijst dat een gefaalde fetch latere requests niet permanent blokkeert.

**Fix:** voeg een test toe: eerste request reject/500, tweede request success; verwacht dat tweede request nog door de queue loopt.

**Files:**

- Modify: `test/binanceRestArchitecture.tests.js`

**Tests:**

- `node test/run.js --grep="request-weight queue recovers"`.

---

### Bug 3 - Stopped lightweight snapshot mist operator-facing reason detail

**Symptoom:** `buildLightweightSnapshot()` voorkomt herinitialisatie, maar de snapshot kan te weinig context geven waarom dashboard data leeg is.

**Fix:** voeg `snapshot.reason`, `botNeedsReinitialize`, `lastStopAt`, `stopReason` en `safeToPoll: true` toe aan lightweight snapshot contract.

**Files:**

- Modify: `src/runtime/botManager.js`
- Modify: `src/dashboard/public/app.js`
- Test: `test/run.js` of `test/dashboardSnapshot.tests.js`

**Tests:**

- Stopped snapshot reinitialiseert niet en toont reason.

---

### Bug 4 - Feature audit markdown/output is niet machine-stabiel

**Symptoom:** feature audit JSON kan groot zijn en order/format kan per wijziging lastig diffbaar zijn.

**Fix:** sorteer audit features deterministisch op priority/id en voeg `schemaVersion` toe.

**Files:**

- Modify: `src/runtime/featureAudit.js`
- Test: `test/featureAudit.tests.js`

**Tests:**

- Snapshot/order test: dezelfde input geeft dezelfde sorted ids.

---

### Bug 5 - Manual-review reason strings zijn verspreid over reconcile/live broker

**Symptoom:** `manual_review_required` en onderliggende reasons worden op veel plekken opgebouwd, waardoor dashboard, reconcile en blocker root-cause uit elkaar kunnen lopen.

**Fix:** centraliseer manual-review reason registry.

**Files:**

- Create: `src/execution/manualReviewReasonRegistry.js`
- Modify: `src/execution/liveBrokerReconcile.js`
- Modify: `src/execution/autoReconcileCoordinator.js`
- Modify: `src/runtime/blockerRootCauseGraph.js`
- Test: `test/autoReconcileCoordinator.tests.js`, `test/rootBlockerOrchestrator.tests.js`

**Tests:**

- Elk manual-review reason heeft severity, operator action en dashboard label.

---

## 5 Extra Trading Updates

### Trading Update 1 - Net-edge gate operator surface

**Doel:** `net_edge_gate` is aanwezig als live-block-only style feature, maar de operator moet zien welke cost/slippage/edge component de beslissing blokkeert.

**Files:**

- Modify: `src/runtime/dashboardSnapshotBuilder.js`
- Modify: `src/dashboard/public/app.js`
- Test: `test/dashboardSnapshot.tests.js`, `test/netEdgeGateIntegration.tests.js` indien aanwezig/nieuw

**Live policy:** alleen blokkeren of diagnostisch tonen; nooit thresholds verlagen.

**Acceptatie:** dashboard toont `candidate.netEdgeGate`, `decision.netEdgeGate`, `candidate.netExecutableExpectancyScore`.

---

### Trading Update 2 - Dynamic exit levels zichtbaar per open positie

**Doel:** maak paper-only dynamic stop/target suggesties zichtbaar zonder live exits te wijzigen.

**Files:**

- Modify: `src/runtime/tradingBot.js`
- Modify: `src/runtime/dashboardSnapshotBuilder.js`
- Modify: `src/dashboard/public/app.js`
- Test: `test/dynamicExitLevels.tests.js`, `test/dashboardSnapshot.tests.js`

**Live policy:** zolang `dynamicExitPaperOnly` true is, geen live stop/target mutatie; future live use mag alleen tightening na review.

**Acceptatie:** open position toont suggested stop/take-profit en policy reason.

---

### Trading Update 3 - Exit Intelligence v2 decision card

**Doel:** `exitIntelligenceV2` bestaat, maar moet als compacte decision card in dashboard/report zichtbaar zijn.

**Files:**

- Modify: `src/runtime/reportBuilder.js`
- Modify: `src/dashboard/public/app.js`
- Test: `test/exitIntelligenceV2.tests.js`, `test/dashboardSnapshot.tests.js`

**Live policy:** diagnostics-only; toekomstige live actie mag alleen bescherming aanscherpen.

**Acceptatie:** card toont recommendation, confidence, MFE/MAE context, blocker reason.

---

### Trading Update 4 - Paper cohort auto-watchlist voor missed winners

**Doel:** false-negative/missed-trade learning bestaat; voeg een paper-only watchlist toe die gemiste winnaars groepeert per regime/setup/symbol.

**Files:**

- Modify: `src/runtime/falseNegativeRecoveryEngine.js`
- Modify: `src/runtime/noTradeTimeline.js`
- Modify: `src/dashboard/public/app.js`
- Test: `test/noTradeTimeline.tests.js`, `test/paperStrategyCohortScorecard.tests.js`

**Live policy:** geen live probe op hard-safety blockers; alleen paper observe/probe suggestions.

**Acceptatie:** dashboard toont top 5 cohorts met next paper action en hard-safety exclusion count.

---

### Trading Update 5 - Multi-timeframe confluence score als paper-only strategy input

**Doel:** voeg een expliciete confluence score toe uit bestaande trend/momentum/volatility/orderflow features, zodat strategieën beter verklaarbaar worden.

**Files:**

- Create: `src/strategy/multiTimeframeConfluence.js`
- Modify: `src/strategy/strategyRouter.js`
- Modify: `src/runtime/tradingBot.js`
- Test: `test/multiTimeframeConfluence.tests.js`, `test/strategyValidationCostsPortfolioUx.tests.js`

**Live policy:** paper-only scoring eerst; live mode mag score alleen als diagnostics of additional blocker gebruiken tot promotion dossier compleet is.

**Acceptatie:** candidate bevat `confluenceScore`, `confluenceDrivers`, `timeframeDisagreements`; paper replay bewijst geen hard-safety softening.

---

## Implementatievolgorde

1. Bug 2: request queue rejection-regressietest.
2. Bug 3: lightweight snapshot reason detail.
3. Update 4: REST budget zichtbaar in dashboard/readmodel.
4. Update 2 + Bug 1: command registry full coverage.
5. Verbetering 1: test/run.js domeinsplitsing.
6. Update 1: tradingBot slice map.
7. Trading Update 1: net-edge operator surface.
8. Trading Update 2: dynamic exit levels visibility.
9. Trading Update 3: exit intelligence decision card.
10. Trading Update 4 en 5: paper-only trading intelligence.
11. Verbetering 2-5 en Update 3/5 als onderhoudslaag.

---

## Verificatie per PR

Minimale veilige checks:

```bash
npm run check:syntax
npm run check:imports
npm run typecheck
npm run test:safe
node scripts/check-package-scripts.mjs
node scripts/check-api-route-contracts.mjs
node scripts/check-order-routing.mjs
```

Aanvullend per scope:

- Dashboard/UI: `npm run test:dashboard` en `node scripts/check-dashboard-dom-contract.mjs`.
- Live/order safety: `npm run test:no-live-leak`.
- Feature wiring: `node src/cli.js feature:audit`.
- Config changes: `npm run check:env` en relevante config tests.

---

## Definition of Done

- Elke roadmap item heeft een test of expliciete read-only verificatie.
- Geen live order path wordt versoepeld.
- Paper-only features blijven paper-only totdat promotion evidence dossier compleet is.
- Dashboard toont mutating/live-sensitive states duidelijk.
- Nieuwe docs verwijzen naar echte paden: `src/runtime/tradingBot.js` is de core lifecycle; er is geen `src/core/tradingBot.js`.
