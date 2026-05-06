# Codex Next Build Plan V2

Generated: 2026-05-06

Doel: deze afvinkbare roadmap is gebaseerd op de actuele codebase, bestaande docs, feature audit, feature completion gate, readmodel status en runtime status. De vorige `docs/CODEX_NEXT_BUILD_PLAN.md` is afgerond; dit bestand bevat alleen nieuwe of verdere integratie-items die niet hetzelfde modulewerk opnieuw bouwen.

Belangrijk: alle items moeten paper-mode-first worden aangesloten. Live mode mag niet agressiever worden. Exchange safety, reconcile, manual review en unresolved execution intents blijven hard blockers.

## Scan basis

- `docs/CODEX_EXECUTION_PLAN.md`: B1 t/m B23 completed; nieuwe aanbevelingen moeten ook in de hoofdroadmap zichtbaar blijven.
- `docs/CODEX_NEXT_BUILD_PLAN.md`: N1 t/m N20 completed.
- `docs/IMPLEMENTATION_MATRIX.md`: bestaande modules, tests en live-impact status zijn leidend om duplicaten te vermijden.
- `docs/TRADING_FEATURE_INVENTORY.md`: indicatoren/features zijn al breed aanwezig; nieuwe planitems moeten vooral wiring, bewijs, tests en paper-integratie verbeteren.
- `node src/cli.js feature:audit`: 69 config flags, 12 audited features, status `review_required`; geen P0 runtime break uit audit, wel live-risk-review-needed voor enkele features.
- `node src/cli.js feature:completion-gate`: status `warn`; 12 warnings door `activation_stage_missing` ondanks fallback naar `diagnostics_only`.
- `node src/cli.js readmodel:status`: readmodel `ready`, 101 trades, 2000 decisions, 10793 blockers, 41099 audit events, maar `replayTraces: 0` en `vetoOutcomes: {}`.
- `node src/cli.js status`: bot manager ready/stopped, mode paper; readiness degraded door `market_data_rest_pressure_guarded`, public/user streams niet authoritative in deze statusrun, candidates worden duidelijk rejected door onder andere `quality_quorum_degraded` en `model_confidence_too_low`.
- Grote onderhouds-hotspots: `src/runtime/tradingBot.js` is circa 25k lines, `src/risk/riskManager.js` circa 6.8k lines, `src/execution/liveBroker.js` circa 3.2k lines.

## Niet opnieuw bouwen

Deze onderdelen bestaan al en moeten worden hergebruikt of verbeterd, niet opnieuw gebouwd:

- Feature activation/canary/anti-overfit: `src/runtime/featureActivationGovernor.js`, `src/runtime/canaryReleaseGate.js`, `src/ai/antiOverfitGovernor.js`.
- Paper/live parity en paper learning: `src/runtime/paperLiveParity.js`, `src/runtime/paperCandidateLab.js`, `src/runtime/candidateOutcomeTracker.js`, `src/runtime/paperStrategyCohortScorecard.js`, `src/runtime/shadowStrategyTournament.js`.
- Exchange safety/reconcile: `src/execution/autoReconcileCoordinator.js`, `src/execution/liveBrokerReconcile.js`, `src/execution/executionIntentLedger.js`.
- Trading path/debug: `src/runtime/tradingPathHealth.js`, `src/runtime/rootBlockerStalenessVerifier.js`, `src/runtime/dashboardEvidenceDrilldown.js`.
- Indicators/trading quality: `src/strategy/advancedIndicators.js`, `src/strategy/indicatorFeatureRegistry.js`, `src/strategy/indicatorRegimeScoring.js`, `src/strategy/setupThesis.js`, `src/strategy/exitPlanHints.js`.
- Risk/exits/portfolio: `src/risk/dynamicExitLevels.js`, `src/risk/exitIntelligenceV2.js`, `src/risk/portfolioCrowding.js`, `src/risk/postReconcileEntryLimits.js`.
- Learning analytics: `src/runtime/tradeThesis.js`, `src/runtime/exitQuality.js`, `src/runtime/vetoOutcome.js`, `src/runtime/failureLibrary.js`, `src/runtime/regimeConfusion.js`, `src/runtime/learningEvidencePipeline.js`.
- Data/replay/backtest: `src/storage/readModelStore.js`, `src/storage/readModelAnalyticsQueries.js`, `src/runtime/replayDeterminism.js`, `src/runtime/replayPackManifest.js`, `src/runtime/goldenReplayPackGenerator.js`, `src/backtest/backtestMetrics.js`, `src/backtest/backtestIntegrity.js`.

## Prioriteitsoverzicht

1. P0: Feature activation metadata completion gate warnings oplossen.
2. P1: Paper evidence spine van candidate naar outcome naar readmodel naar dashboard/report.
3. P1: Veto outcome en replay trace coverage vullen vanuit bestaande blockers/readmodel.
4. P1: Stream/readiness root-cause drilldown voor paper scans.
5. P2: Paper-to-backtest parity dossier.
6. P2: Multi-position paper stress harness.
7. P2: Strategy lifecycle evidence binder.
8. P2: Paper execution reality calibration loop.
9. P3: Dashboard operator no-trade timeline.
10. P3: TradingBot service extraction slice.
11. P3: CLI smoke matrix voor read-only operator commands.
12. P4: Data retention/storage bloat audit.

---

## V2-1 - Feature activation metadata completion gate

Status: proposed  
Priority: P0  
Initial activation: `governance_only`

Probleem: `feature:completion-gate` geeft 12 keer `activation_stage_missing`, terwijl de gate fallbackt naar `diagnostics_only`. Dit is geen live-risk break, maar maakt de governance-output minder beslisbaar.

Reuse:

- `src/runtime/featureAudit.js`
- `src/runtime/featureWiringCompletionGate.js`
- `src/runtime/featureActivationGovernor.js`
- `test/featureAudit.tests.js`

Taken:

- [ ] Voeg expliciete `activationStage` toe aan alle audited feature definitions.
- [ ] Voeg expliciete `paperModeIntegration` toe: `not_required`, `shadow_only`, `paper_only` of `offline_only`.
- [ ] Zorg dat `feature:completion-gate` geen waarschuwing meer geeft voor features die bewust diagnostics-only zijn.
- [ ] Test dat live-risk-review-needed features niet per ongeluk live-impact krijgen.
- [ ] Update `docs/FEATURE_COMPLETION_PLAN.md` en `docs/IMPLEMENTATION_MATRIX.md`.

Paper-mode aansluiting:

- [ ] Paper-only features blijven expliciet paper-only.
- [ ] Diagnostics-only features veranderen geen paper/live decisions.
- [ ] Geen automatische promotie naar live.

Acceptatie:

- [ ] `node src/cli.js feature:completion-gate` geeft `pass` of alleen inhoudelijke warnings.
- [ ] `npm test` slaagt.
- [ ] Geen tradinggedrag gewijzigd.

---

## V2-2 - Paper evidence spine

Status: proposed  
Priority: P1  
Initial activation: `paper_only`

Probleem: de repo heeft losse sterke bouwstenen voor candidate lab, outcome tracker, thesis, exit quality, failure library, cohort scorecards en readmodel analytics. De volgende stap is een traceerbare paper evidence spine per candidate/trade zonder nieuwe tradingfeature te bouwen.

Reuse:

- `src/runtime/paperCandidateLab.js`
- `src/runtime/candidateOutcomeTracker.js`
- `src/runtime/learningEvidencePipeline.js`
- `src/runtime/tradeThesis.js`
- `src/runtime/exitQuality.js`
- `src/runtime/failureLibrary.js`
- `src/storage/readModelAnalyticsQueries.js`

Taken:

- [ ] Maak een compacte paper evidence packet builder rond bestaande helpers.
- [ ] Link `decisionId`, `candidateId`, `tradeId`, `setupType`, `rootBlocker`, `thesis`, `outcome`, `exitQuality`, `failureMode`.
- [ ] Sla de packet read-only/rebuildable op via readmodel of journal reference, zonder source-of-truth migratie.
- [ ] Toon samenvatting in report/dashboard als optioneel veld.
- [ ] Voeg tests toe voor approved trade, blocked setup, missing trade en missing thesis.

Paper-mode aansluiting:

- [ ] Elke paper candidate krijgt een auditbaar evidence packet waar data beschikbaar is.
- [ ] Live krijgt hoogstens metadata/observability, geen decision impact.
- [ ] Hard-safety blockers blijven dominant.

Acceptatie:

- [ ] Packet builder is fallback-safe.
- [ ] Geen NaN/Infinity.
- [ ] `npm test` slaagt.

---

## V2-3 - Veto outcome and replay trace coverage

Status: proposed  
Priority: P1  
Initial activation: `paper_only`

Probleem: readmodel is ready, maar `vetoOutcomes` is leeg en `replayTraces` staat op 0. Daardoor kan de bot nog niet goed leren of blockers goede veto's of missed winners waren.

Reuse:

- `src/runtime/vetoOutcome.js`
- `src/runtime/candidateOutcomeTracker.js`
- `src/runtime/replayPackScoring.js`
- `src/runtime/goldenReplayPackGenerator.js`
- `src/storage/readModelStore.js`

Taken:

- [ ] Bouw een paper-only evaluator die blocked decisions koppelt aan future candle paths waar lokaal beschikbaar.
- [ ] Vul veto outcome summaries: `good_veto`, `bad_veto`, `neutral_veto`, `unknown_veto`.
- [ ] Schrijf replay trace metadata via bestaande readmodel/replay record patterns.
- [ ] Prioriteer `bad_veto` en `reconcile_uncertainty` voor replay packs.
- [ ] Voeg tests toe voor insufficient future data, avoided loser, missed winner en flat follow-through.

Paper-mode aansluiting:

- [ ] Alleen paper/offline learning.
- [ ] Geen blocker-relief zonder voldoende evidence.
- [ ] Geen live threshold changes.

Acceptatie:

- [ ] `readmodel:status` kan niet-lege veto/replay summaries tonen wanneer testdata bestaat.
- [ ] Geen bestaande journal/audit source-of-truth migratie.
- [ ] `npm test` slaagt.

---

## V2-4 - Stream/readiness root-cause drilldown for paper scans

Status: proposed  
Priority: P1  
Initial activation: `diagnostics_only`

Probleem: status toont readiness degraded door REST-pressure/stream fallback. De bestaande diagnostics zijn rijk, maar operator en paper scanner hebben een compact root-cause packet nodig dat exact zegt of de scan degraded is door streams, REST budget, missing local book, stale klines, news provider of dashboard freshness.

Reuse:

- `src/runtime/tradingPathHealth.js`
- `src/runtime/streamHealthEvidence.js`
- `src/runtime/apiDegradationPlanner.js`
- `src/runtime/restArchitectureAudit.js`
- `src/runtime/safetySnapshot.js`

Taken:

- [ ] Bouw een normalized `paperScanReadinessEvidence` summary.
- [ ] Classificeer readiness: `ready`, `degraded_but_scannable`, `observe_only`, `blocked`.
- [ ] Toon per source: public stream, local orderbook, klines, news/events, REST budget, readmodel/dashboard.
- [ ] Voeg next safe action toe: stream restart, readmodel rebuild, run once, rest cooldown, inspect provider.
- [ ] Voeg tests toe voor stream missing, REST cooldown, stale local book, stale dashboard en fresh recovery.

Paper-mode aansluiting:

- [ ] Paper scan mag doorgaan bij degraded-but-scannable als hard safety niet geraakt wordt.
- [ ] Missing data blijft candidates blokkeren waar data kwaliteit onvoldoende is.
- [ ] Live readiness wordt niet versoepeld.

Acceptatie:

- [ ] Operator ziet niet alleen `degraded`, maar de concrete degraded family.
- [ ] Geen force trade of force unlock.
- [ ] `npm test` slaagt.

---

## V2-5 - Paper-to-backtest parity dossier

Status: proposed  
Priority: P2  
Initial activation: `offline_only`

Probleem: backtest, walk-forward, paper live parity en paper analytics bestaan, maar er is nog geen dossier dat per strategy/family uitlegt waarom paper resultaten afwijken van backtest assumptions.

Reuse:

- `src/runtime/paperLiveParity.js`
- `src/backtest/backtestMetrics.js`
- `src/backtest/backtestIntegrity.js`
- `src/research/walkForwardDeploymentReport.js`
- `src/runtime/paperNetEdgeCalibrationWorkbench.js`

Taken:

- [ ] Maak een parity dossier helper voor backtest vs paper per strategy/family/session.
- [ ] Vergelijk fees, slippage, fill delay, exit quality, sample size, stale data en regime mix.
- [ ] Output: `parityStatus`, `mainDrift`, `blockingReasons`, `recommendedPaperExperiment`.
- [ ] Voeg read-only CLI/report sectie toe.
- [ ] Tests voor matching assumptions, high slippage drift, low sample en stale paper evidence.

Paper-mode aansluiting:

- [ ] Alleen report/research/paper governance.
- [ ] Geen live promotion.
- [ ] Geen threshold tweaks.

Acceptatie:

- [ ] Strategy changes kunnen eerst tegen paper reality worden getoetst.
- [ ] `npm test` slaagt.

---

## V2-6 - Multi-position paper stress harness

Status: proposed  
Priority: P2  
Initial activation: `paper_only`

Probleem: multi-position support is een expliciete invariant. Er zijn portfolio/risk helpers, maar er moet een paper stress harness komen die bewijst dat gezonde state meerdere posities kan houden en dat portfolio caps/same-symbol/crowding correct blokkeren.

Reuse:

- `src/risk/portfolioCrowding.js`
- `src/risk/postReconcileEntryLimits.js`
- `src/runtime/paperPortfolioAllocatorSimulation.js`
- `src/runtime/riskOfRuinSimulator.js`
- `src/risk/riskManager.js`

Taken:

- [ ] Maak synthetic paper scenarios voor 0, 1, 2, 3+ open positions.
- [ ] Test normal state gebruikt `MAX_OPEN_POSITIONS`.
- [ ] Test post-reconcile gebruikt post-reconcile limits en geen permanente max-1.
- [ ] Test exposure, family, cluster, regime en same-symbol rules.
- [ ] Toon paper stress summary in report/readmodel.

Paper-mode aansluiting:

- [ ] Harness draait volledig in paper/test fixtures.
- [ ] Live entry permissions blijven ongewijzigd.
- [ ] Exchange safety rood blijft alles blokkeren.

Acceptatie:

- [ ] Meerdere posities blijven aantoonbaar mogelijk in gezonde state.
- [ ] `npm test` slaagt.

---

## V2-7 - Strategy lifecycle evidence binder

Status: proposed  
Priority: P2  
Initial activation: `governance_only`

Probleem: scorecards en lifecycle bestaan, maar lifecycle-acties moeten beter kunnen verwijzen naar bewijs: trades, blockers, veto outcomes, exit quality en replay packs.

Reuse:

- `src/runtime/strategyLifecycle.js`
- `src/runtime/paperStrategyCohortScorecard.js`
- `src/runtime/failureLibrary.js`
- `src/runtime/replayPackScoring.js`
- `src/storage/readModelAnalyticsQueries.js`

Taken:

- [ ] Bouw evidence binder per strategy/regime/session.
- [ ] Link cohort status aan laatste trades, blockers, failures en replay samples.
- [ ] Output: `lifecycleStatus`, `evidenceRefs`, `whyQuarantine`, `whyDegrade`, `whyWatch`.
- [ ] Voeg dashboard/report visibility toe als optionele summary.
- [ ] Tests voor dangerous range-grid, insufficient sample, improving cohort en missing evidence.

Paper-mode aansluiting:

- [ ] Lifecycle wijzigingen blijven paper/governance first.
- [ ] Geen automatische live enablement.
- [ ] Geen live range-grid relief.

Acceptatie:

- [ ] Operator kan zien waarom een strategy degraded/quarantined/watch is.
- [ ] `npm test` slaagt.

---

## V2-8 - Paper execution reality calibration loop

Status: proposed  
Priority: P2  
Initial activation: `paper_only`

Probleem: execution attribution, fee attribution, microstructure simulator, net edge workbench en order style advisor bestaan. De volgende stap is een paper feedback loop die observed paper fills/slippage/fees per symbol/session omzet naar calibratievoorstellen zonder live behavior te wijzigen.

Reuse:

- `src/execution/microstructureFillSimulator.js`
- `src/execution/orderStyleAdvisor.js`
- `src/runtime/paperNetEdgeCalibrationWorkbench.js`
- `src/runtime/performanceLedger.js`
- `src/storage/readModelAnalyticsQueries.js`

Taken:

- [ ] Bouw paper execution reality summary per symbol/session/strategy.
- [ ] Meet expected vs observed fee/slippage/fill quality.
- [ ] Output: `calibrationStatus`, `feeDriftBps`, `slippageDriftBps`, `orderStyleHint`, `paperOnlyAdjustmentRecommendation`.
- [ ] Verbind met report/dashboard als read-only summary.
- [ ] Tests voor normal, fee drift, slippage drag, missing attribution en thin book.

Paper-mode aansluiting:

- [ ] Alleen paper calibration recommendations.
- [ ] Live order style verandert niet.
- [ ] Geen live size increase.

Acceptatie:

- [ ] Paper results worden realistischer verklaarbaar.
- [ ] `npm test` slaagt.

---

## V2-9 - Dashboard operator no-trade timeline

Status: proposed  
Priority: P3  
Initial activation: `diagnostics_only`

Probleem: candidate rejection reasons zijn zichtbaar, maar operator heeft een timeline nodig van laatste cycles: aantal candidates, root blockers, feed state, readiness, top setup en next action.

Reuse:

- `src/runtime/dashboardEvidenceDrilldown.js`
- `src/runtime/tradingPathHealth.js`
- `src/runtime/rootBlockerStalenessVerifier.js`
- `src/runtime/dashboardSnapshotBuilder.js`
- `src/dashboard/public/app.js`

Taken:

- [ ] Maak compact `noTradeTimeline` payloadveld met laatste N cycles.
- [ ] Toon per cycle: candidates, approved count, top blocker, readiness family, stale sources.
- [ ] Clear stale UI errors na bewezen fresh snapshot.
- [ ] Tests voor empty cycles, repeated blockers, stale dashboard, fresh recovery.
- [ ] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md`.

Paper-mode aansluiting:

- [ ] Paper no-trade diagnostics worden specifiek zonder trades te forceren.
- [ ] Exchange safety blijft dominante blocker.
- [ ] Live dashboard claimt niet dat entry allowed is bij stale data.

Acceptatie:

- [ ] Operator ziet waarom paper niet trade zonder generieke inactive melding.
- [ ] `npm test` slaagt.

---

## V2-10 - TradingBot service extraction slice: paper evidence publisher

Status: proposed  
Priority: P3  
Initial activation: `refactor_only`

Probleem: `src/runtime/tradingBot.js` is circa 25k lines. Er zijn al extracties, maar verdere kleine extracties verminderen regressierisico. Eerste slice moet een read-only paper evidence publisher zijn, niet signal/risk/execution logic.

Reuse:

- `src/runtime/tradingBot.js`
- `src/runtime/tradingBotDecomposition.js`
- `src/runtime/dashboardSnapshotBuilder.js`
- `src/runtime/learningEvidencePipeline.js`

Taken:

- [ ] Inspecteer bestaande extracties voordat nieuwe module wordt gemaakt.
- [ ] Extraheer alleen read-only evidence publishing uit `tradingBot.js` als dit veilig en klein kan.
- [ ] Behoud call order en payload shape.
- [ ] Tests voor identical output met minimal fixture.
- [ ] Documenteer in `docs/TRADINGBOT_DECOMPOSITION_PLAN.md`.

Paper-mode aansluiting:

- [ ] Paper evidence visibility verbetert.
- [ ] Geen entry/risk/execution gedrag wijzigt.
- [ ] Geen live codepath behavior change.

Acceptatie:

- [ ] Diff is klein en reviewbaar.
- [ ] `npm test` slaagt.

---

## V2-11 - CLI smoke matrix for read-only operator commands

Status: proposed  
Priority: P3  
Initial activation: `test_only`

Probleem: de repo heeft veel operator/read-only commands. Een smoke matrix met temp runtime moet regressies in formatters, missing data en secret redaction sneller vangen.

Reuse:

- `src/cli/runCli.js`
- bestaande command formatters/helpers
- `test/run.js`

Taken:

- [ ] Maak test helper die read-only commands met temp runtime fixtures kan simuleren.
- [ ] Dek minimaal: `feature:audit`, `feature:completion-gate`, `trading-path:debug`, `readmodel:status`, `reconcile:plan`, `exchange-safety:status`.
- [ ] Assert no secrets, graceful missing data, stable exit behavior waar testbaar.
- [ ] Geen commands die echte exchange-mutaties kunnen doen.

Paper-mode aansluiting:

- [ ] Paper/default mode blijft zonder credentials testbaar.
- [ ] Live commands blijven streng of dry-run.
- [ ] Geen runtime data van echte workspace muteren.

Acceptatie:

- [ ] CLI regressies worden in `npm test` gevangen.
- [ ] Geen live exchange calls in tests.

---

## V2-12 - Data retention and storage bloat audit

Status: proposed  
Priority: P4  
Initial activation: `diagnostics_only`

Probleem: readmodel telt inmiddels duizenden decisions/blockers/audit events. Er is storage integrity, maar operator heeft een bloat/retention audit nodig voor runtime performance en backup hygiene.

Reuse:

- `src/storage/storageAudit.js`
- `src/storage/recorderIntegrityAudit.js`
- `src/storage/schemaVersion.js`
- `src/storage/readModelStore.js`

Taken:

- [ ] Bouw retention summary per data family: runtime state, journal, audit events, recorder frames, readmodel.
- [ ] Detecteer oversized files, duplicate frames, old replay packs, stale caches, rebuild candidates.
- [ ] Output: `status`, `largestFiles`, `retentionWarnings`, `safeCleanupCandidates`.
- [ ] Alleen read-only; geen automatische delete.
- [ ] Tests voor empty data, large mock files, corrupt metadata en no data.

Paper-mode aansluiting:

- [ ] Paper analytics blijft rebuildable.
- [ ] Geen source-of-truth migratie.
- [ ] Geen automatische cleanup zonder expliciete operator actie.

Acceptatie:

- [ ] Operator ziet wanneer dataretentie de bot kan vertragen.
- [ ] `npm test` slaagt.

---

## V2-13 - Indicator warmup and feature availability reporter

Status: proposed  
Priority: P3  
Initial activation: `diagnostics_only`

Probleem: indicator registry en advanced indicators bestaan. De volgende waarde zit niet in nog meer indicators, maar in exact zien welke indicatoren per symbol/setup warm genoeg, stale of missing zijn.

Reuse:

- `src/strategy/indicatorFeatureRegistry.js`
- `src/strategy/advancedIndicators.js`
- `src/runtime/dataQualityScoreV2.js`
- `src/runtime/decisionSupportDiagnostics.js`

Taken:

- [ ] Maak feature availability summary per candidate.
- [ ] Toon warmup satisfied, missing candles, stale source, fallback used en confidence per top indicator.
- [ ] Voeg dashboard/report veld toe: `indicatorAvailabilitySummary`.
- [ ] Tests voor missing candles, stale source, fallback source, complete warmup.

Paper-mode aansluiting:

- [ ] Paper ranking mag pas later op basis van dit bewijs veranderen.
- [ ] Eerste integratie is diagnostics-only.
- [ ] Live krijgt geen positive relief door beschikbaarheid.

Acceptatie:

- [ ] Operator ziet of model confidence laag is door featurekwaliteit.
- [ ] `npm test` slaagt.

---

## V2-14 - Model confidence blocker decomposition

Status: proposed  
Priority: P2  
Initial activation: `diagnostics_only`

Probleem: status laat veel `model_confidence_too_low` en `quality_quorum_degraded` zien. Er bestaat al root-cause tooling; volgende stap is blocker decomposition per candidate family en feature source.

Reuse:

- `src/runtime/modelConfidenceRootCause.js`
- `src/runtime/rootBlockerStalenessVerifier.js`
- `src/risk/reasonRegistry.js`
- `src/runtime/dashboardEvidenceDrilldown.js`

Taken:

- [ ] Bouw per-cycle confidence decomposition summary.
- [ ] Splits lage confidence naar data quality, weak setup, regime mismatch, model calibration, execution cost, stale evidence.
- [ ] Toon top driver per symbol/family in dashboard/report.
- [ ] Tests voor weak data, weak setup, stale scorecard, high execution drag en unknown reason.

Paper-mode aansluiting:

- [ ] Paper diagnostics tonen waarom confidence laag is.
- [ ] Geen threshold lowering.
- [ ] Hard safety blijft hard.

Acceptatie:

- [ ] Operator ziet wat eerst moet herstellen om paper trades te krijgen.
- [ ] `npm test` slaagt.

---

## V2-15 - Paper setup experiment registry

Status: proposed  
Priority: P4  
Initial activation: `shadow_only`

Probleem: shadow tournament en activation governor bestaan. Een lichte experiment registry kan paper/shadow setup experiments expliciet registreren met scope, activation stage, metrics en expiry, zonder nieuwe strategies blind te activeren.

Reuse:

- `src/runtime/shadowStrategyTournament.js`
- `src/runtime/featureActivationGovernor.js`
- `src/ai/antiOverfitGovernor.js`
- `src/runtime/promotionDossier.js`

Taken:

- [ ] Maak experiment registry of breid bestaande tournament metadata uit.
- [ ] Elk experiment krijgt `experimentId`, `featureId`, `setupFamily`, `activationStage`, `startsAt`, `expiresAt`, `successMetrics`, `killCriteria`.
- [ ] Alleen `shadow_only` of `paper_only` als feature governor dit toestaat.
- [ ] Tests voor expired experiment, low sample, hard safety blocker en live promotion attempt.

Paper-mode aansluiting:

- [ ] Paper experiments zijn expliciet en eindig.
- [ ] Geen automatische live promotie.
- [ ] Geen hard-safety bypass.

Acceptatie:

- [ ] Nieuwe setup tests kunnen gecontroleerd draaien.
- [ ] `npm test` slaagt.

---

## V2-16 - News/event evidence lineage for paper candidates

Status: proposed  
Priority: P4  
Initial activation: `diagnostics_only`

Probleem: news/events/context modules bestaan en provider failures zijn zichtbaar. Paper candidates moeten kunnen tonen welke event/news evidence gebruikt, gemist of stale was.

Reuse:

- `src/news/*`
- `src/events/*`
- `src/runtime/decisionSupportDiagnostics.js`
- `src/runtime/tradingPathHealth.js`

Taken:

- [ ] Maak compact news/event lineage summary per candidate.
- [ ] Toon source, freshness, confidence, fallback used, blocking event en stale provider.
- [ ] Verbind met dashboard evidence drilldown.
- [ ] Tests voor fresh news, stale provider, blocked event, missing provider en REST cooldown.

Paper-mode aansluiting:

- [ ] Paper candidate diagnostics verbeteren.
- [ ] Missing news provider versoepelt safety niet.
- [ ] Live krijgt geen positive relief.

Acceptatie:

- [ ] Event/news blockers worden beter uitlegbaar.
- [ ] `npm test` slaagt.

---

## Implementatieprotocol voor V2

- [ ] Kies exact een V2-item per PR/commit.
- [ ] Inspecteer eerst of de module al bestaat.
- [ ] Breid bestaande modules uit als dat kan; bouw geen duplicaten.
- [ ] Voeg regressietests toe.
- [ ] Sluit paper mode expliciet aan volgens het item.
- [ ] Laat live safety gelijk of strenger.
- [ ] Run `npm test`.
- [ ] Update dit bestand en `docs/CODEX_EXECUTION_PLAN.md`.

## PR summary template

```md
### Codex update

Priority: V2-#
Status: completed / partial / blocked

Changed files:
- ...

Tests:
- ...

Roadmap:
- `docs/CODEX_NEXT_BUILD_PLAN_V2.md` updated: yes/no
- `docs/CODEX_EXECUTION_PLAN.md` updated: yes/no
- Checkboxes updated: yes/no

Safety:
- Live safety unchanged: yes
- Exchange safety unchanged: yes
- No real Binance orders in tests: yes
- Multi-position preserved: yes
- Paper-mode integration explicit: yes

Remaining issues:
- ...
```
