# Codex Execution Plan

Deze roadmap is bedoeld als vaste leidraad voor Codex-runs in deze repo. Codex moet dit bestand gebruiken als bron van waarheid, per taak kleine PR's maken, en na elke afgeronde taak de checkbox afvinken met korte notitie.

Nieuwe aanbevelingen moeten altijd in deze hoofd-MD zichtbaar zijn. Aanvullende bestanden mogen detailinformatie bevatten, maar vervangen deze hoofdroadmap niet.

## Globale regels

- [ ] Live safety mag nooit versoepeld worden.
- [ ] Geen echte Binance orders in tests.
- [ ] Geen force-unlock van exchange safety.
- [ ] Exchange safety, reconcile, manual review en unresolved execution intents blijven hard blockers.
- [ ] Paper mode mag leren, maar hard safety nooit omzeilen.
- [ ] Meerdere open posities moeten mogelijk blijven in gezonde state via `MAX_OPEN_POSITIONS`.
- [ ] Geen hardcoded max 1 positie.
- [ ] Nieuwe tradingfeatures eerst diagnostics/paper/shadow, niet direct agressieve live execution.
- [ ] Hergebruik bestaande modules als ze al bestaan; bouw geen duplicaten.
- [ ] Elke bugfix of behavior-change krijgt regressietests.
- [ ] `npm test` moet slagen voordat een taak als afgerond mag worden.

## Feature activation policy

Nieuwe features worden niet automatisch direct aan paper mode of live mode gekoppeld. Elke nieuwe tradingfeature moet expliciet door activation stages gaan.

Stages:

- `diagnostics_only`: feature meet/rapporteert alleen en heeft geen trade-impact.
- `shadow_only`: feature simuleert beslissingen naast de echte flow, zonder orders of portfolio-impact.
- `paper_only`: feature mag paper decisions/trades beïnvloeden, maar nooit live.
- `canary`: feature mag alleen zeer beperkt live meedraaien na expliciete safety/canary-governance.
- `limited_live`: feature heeft beperkte live-impact met strengere caps.
- `normal_live`: feature is volledig toegelaten binnen normale live risk limits.

Regels:

- [ ] Nieuwe features starten standaard als `diagnostics_only`.
- [ ] Tradingfeatures mogen pas naar `shadow_only` of `paper_only` als ze fallback-safe zijn en tests hebben.
- [ ] Paper-only features mogen hard safety nooit omzeilen.
- [ ] Shadow mode mag beslissingen simuleren maar geen orders plaatsen.
- [ ] Live-impact vereist aparte promotie via anti-overfit, canary gate en safety review.
- [ ] Geen enkele feature mag automatisch van diagnostics naar live promoveren.
- [ ] Elke roadmaptaak moet expliciet vermelden of de eerste integratie `diagnostics_only`, `shadow_only`, `paper_only`, `governance_only` of `live_candidate` is.
- [ ] Automatische promotie naar `paper_only` mag alleen als `BOT_MODE=paper` en config dit expliciet toestaat.
- [ ] Automatische promotie naar live is nooit toegestaan.

## Permanente review-instructie voor nieuwe updates

Wanneer de operator vraagt om nieuwe updates, features, aanbevelingen, analyses of Codex-prompts, moet Codex/de assistent altijd eerst:

- [ ] Dit bestand `docs/CODEX_EXECUTION_PLAN.md` lezen.
- [ ] De actuele codebase opnieuw scannen of relevante modules openen.
- [ ] Controleren wat al bestaat voordat nieuwe features worden voorgesteld.
- [ ] Nieuwe zinvolle aanbevelingen toevoegen aan deze MD als nieuwe checkbox/subtaak.
- [ ] Dubbele of al bestaande taken vermijden.
- [ ] Aangeven of een aanbeveling nieuw, bestaand, partial of al afgerond is.
- [ ] Safety-regels bovenaan blijven respecteren.

Nieuwe aanbevelingen mogen alleen worden toegevoegd als ze:

- [ ] Niet al elders in deze roadmap staan.
- [ ] Geen live safety versoepelen.
- [ ] Testbaar zijn.
- [ ] Een duidelijk bestand, module of document als landingsplek hebben.
- [ ] Een duidelijke acceptatie-eis hebben.

---

## Codex prioriteitskeuze 2026-05-04

Als ik vrij mag kiezen wat als eerste de meeste waarde geeft, kies ik nu **B8 - Crypto market regime router v2**.

Reden: B8 gebruikt bestaande diagnostics uit derivatives context, portfolio stress, confidence calibration, feature activation en trading-quality helpers om setup-selectie beter uitlegbaar te maken zonder live execution te versoepelen. De eerste integratie moet `diagnostics_only` / `shadow_only` blijven.

Prioriteit ten opzichte van de rest:

1. P0 blijft altijd: runtime/test/CI/safety regressies, exchange-safety lockups, secrets of dashboard-crashes.
2. P1: B8 - Crypto market regime router v2.
3. P2: B21 - API degradation en fallback-mode planner.
4. P3: B22 - Strategy explainability snapshot voor elke candidate.
5. P4: B15 - Microstructure fill simulator voor paper/backtest.
6. P5: B20 - Walk-forward deployment report voor strategy changes.
7. P6: B16 - Strategy retirement en quarantine lifecycle.
8. P7: B17 - Risk-of-ruin en drawdown forecast monitor.
9. P8: B18 - Time-in-market en opportunity cost analyzer.
10. P9: B19 - Tax/performance ledger en realized PnL audit.
11. P10: B9 - Symbol lifecycle en listing-risk monitor.
12. P11: B10-B14 en B24-B39 blijven waardevolle backlog, maar worden na bovenstaande gekozen tenzij een ervan een P0-safety issue oplost.

Safety-notitie: deze prioriteitskeuze verandert geen tradinggedrag. Nieuwe tradingfeatures starten diagnostics/shadow-first en mogen live safety niet versoepelen.

---

## Status legenda

Gebruik deze notatie in checkboxes:

- `[ ]` nog niet gestart
- `[~]` bezig of partial
- `[x]` afgerond en getest
- `[!]` geblokkeerd, met reden in notities

Omdat Markdown standaard alleen `[ ]` en `[x]` ondersteunt, mag Codex bij partial/blocked een subregel toevoegen zoals:

```md
- [ ] Taaknaam
  - Status: partial
  - Reden: ...
```

---

# Prioriteit 1 — Debug, stabiliteit en trading-path health

Doel: de bot moet duidelijk kunnen uitleggen waarom hij wel/niet kan traden, zonder safety te omzeilen.

## 1.1 Baseline commands

- [x] Run `npm test`.
- [x] Run `node src/cli.js doctor`.
- [x] Run `node src/cli.js status`.
- [x] Run `node src/cli.js once`.
- [x] Run `node src/cli.js readmodel:dashboard`.
- [x] Run `node src/cli.js feature:audit`.
- [x] Run `node src/cli.js rest:audit`.
- [x] Documenteer resultaten in `docs/DEBUG_AUDIT_REPORT.md`.

Notitie 2026-05-03: alle baseline commands eindigden met exit code 0. `status` blijft terecht blocked door `exchange_safety_blocked` en `market_data_rest_pressure_guarded`; `once` forceerde geen trades en liet candidate rejections zichtbaar.

Acceptatie:

- [x] Alle command failures zijn gedocumenteerd.
- [x] Bekende remaining issues staan onder `Known issues`.
- [x] Geen live behavior gewijzigd.

## 1.2 Trading path health

- [x] Maak of update `src/runtime/tradingPathHealth.js`.
- [x] Voeg CLI command toe: `node src/cli.js trading-path:debug`.
- [x] Toon `botRunning`.
- [x] Toon `cycleFresh`.
- [x] Toon `feedFresh`.
- [x] Toon `readmodelFresh`.
- [x] Toon `dashboardFresh`.
- [x] Toon `topDecisionsCount`.
- [x] Toon `marketSnapshotsCount`.
- [x] Toon `blockingReasons`.
- [x] Toon `nextAction`.

Notitie 2026-05-03: module, CLI en regressietests bestaan al. `trading-path:debug` is read-only en rapporteerde huidig `status=blocked` door `exchange_safety_blocked` plus `no_decision_snapshot_created`; feed/readmodel waren fresh en dashboard snapshot unavailable werd apart getoond.

Acceptatie:

- [x] Stale/missing data blokkeert entries.
- [x] Fresh trading path blokkeert niet vanzelf.
- [x] Exchange safety blijft dominante blocker.
- [x] Tests toegevoegd voor fresh/stale/partial/missing data.

## 1.3 NaN/Infinity audit

- [x] Controleer publieke indicator helpers.
- [x] Controleer risk scoring/sizing helpers.
- [x] Controleer exit level helpers.
- [x] Controleer fee/slippage helpers.
- [x] Controleer backtest metrics.
- [x] Controleer dashboard summaries.
- [x] Gebruik `src/utils/safeMath.js` waar passend.

Notitie 2026-05-03: `src/utils/safeMath.js` bestaat met `safeNumber`, `safeRatio` en `clampFinite`. Bestaande tests dekken safe math, advanced indicators, dynamic exits, exit intelligence, fee accounting, dashboard normalizers en backtest quality metrics; `npm test` was groen in P1.1 baseline.

Acceptatie:

- [x] Geen publieke helper geeft `NaN` of `Infinity` terug.
- [x] Tests voor lege input, korte input, zero volume, missing snapshot en extreme values.

---

# Prioriteit 2 — Docs, implementation matrix en feature inventory

Doel: voorkom dubbel werk en maak duidelijk wat implemented/partial/planned is.

## 2.1 Implementation matrix

- [x] Maak of update `docs/IMPLEMENTATION_MATRIX.md`.
- [x] Documenteer config modules.
- [x] Documenteer strategy/indicator modules.
- [x] Documenteer risk modules.
- [x] Documenteer execution modules.
- [x] Documenteer runtime/learning modules.
- [x] Documenteer dashboard/readmodel modules.
- [x] Documenteer storage/migration modules.
- [x] Documenteer backtest/research modules.
- [x] Documenteer operator/safety modules.

Per feature opnemen:

- [x] Status: implemented / partial / planned / deprecated.
- [x] Files.
- [x] Tests.
- [x] Runtime impact.
- [x] Dashboard visible.
- [x] Live impact.
- [x] Notes / known gaps.

Notitie 2026-05-03: matrix uitgebreid met verplichte kolommen `Runtime impact`, `Dashboard visible`, `Live impact` en `Notes`; geen runtime code gewijzigd.

## 2.2 Trading feature inventory

- [x] Maak of update `docs/TRADING_FEATURE_INVENTORY.md`.
- [x] Documenteer bestaande indicators uit `src/strategy/indicators.js`.
- [x] Documenteer advanced indicators indien aanwezig.
- [x] Documenteer market/orderbook features.
- [x] Documenteer setup thesis features.

Per feature opnemen:

- [x] Type: trend / range / breakout / volume / volatility / orderflow / risk / diagnostic.
- [x] Beste regime.
- [x] Gebruik: entry / filter / exit / risk / diagnostic.
- [x] Valkuil.
- [x] Testdekking.
- [x] Advies: live / paper-only / shadow / diagnostics.

Acceptatie:

- [x] Docs beschrijven bestaande code feitelijk.
- [x] Geen nieuwe trading behavior in deze taak.
- [x] `npm test` slaagt.

Notitie 2026-05-03: inventory uitgebreid met expliciete `Advice` kolom voor live/paper/shadow/diagnostics gebruik. Geen runtime code gewijzigd; `npm test` was groen in P1.1 baseline.

---

# Prioriteit 3 — Indicatoren en regime-specific scoring

Doel: tradingkwaliteit verbeteren zonder live agressiever te maken.

## 3.1 Advanced indicator helpers

Controleer eerst of helpers al bestaan. Voeg alleen ontbrekende helpers toe in bestaande passende module of `src/strategy/advancedIndicators.js`.

- [x] `anchoredVwap`.
- [x] `emaSlopeStack`.
- [x] `relativeVolume`.
- [x] `bollingerKeltnerSqueeze`.
- [x] `atrPercentile`.
- [x] `vwapZScore`.
- [x] `obvDivergence`.
- [x] `spreadPercentile`.
- [x] `orderBookImbalanceStability`.
- [x] `slippageConfidenceScore`.

Acceptatie:

- [x] Alle helpers zijn fallback-safe.
- [x] Geen helper geeft `NaN` of `Infinity` terug.
- [x] Tests voor lege, korte, normale en extreme input.
- [x] Nieuwe features zijn diagnostics/paper/shadow-first.

Notitie 2026-05-03: `src/strategy/advancedIndicators.js` bevat alle gevraagde helpers. `test/tradingQualityUpgrade.tests.js` dekt empty/short/normal/extreme fallback-safety; geen live behavior gewijzigd.

## 3.2 Regime-specific indicator scoring

- [x] Maak of update `src/strategy/indicatorRegimeScoring.js`.
- [x] Exporteer `scoreIndicatorRegimeFit({ features, regime, setupType })`.
- [x] Output bevat `score`.
- [x] Output bevat `supportingIndicators`.
- [x] Output bevat `conflictingIndicators`.
- [x] Output bevat `warnings`.
- [x] Output bevat `sizeHintMultiplier`.
- [x] Output bevat `confidencePenalty`.

Regels:

- [x] RSI/MFI/Stoch RSI zwaarder in range/mean reversion.
- [x] Donchian/BOS/EMA slope zwaarder in trend/breakout.
- [x] Choppiness hoog verlaagt breakout confidence.
- [x] ATR percentile extreem hoog verlaagt confidence en size hint.
- [x] Squeeze expansion geeft breakout-watch, geen automatische entry.
- [x] CVD/OBV divergence geeft conflict/warning.
- [x] Spread/slippage slecht verlaagt execution confidence.

Acceptatie:

- [x] Tests voor trend.
- [x] Tests voor range.
- [x] Tests voor breakout.
- [x] Tests voor high_vol.
- [x] Tests voor missing features.
- [x] Tests voor unknown regime.

Notitie 2026-05-03: scoring output uitgebreid met diagnostische `sizeHintMultiplier` en `confidencePenalty`; spread/slippage conflicts en sparse-feature warnings toegevoegd. Geen live gates of thresholds gewijzigd; `npm test` geslaagd.

---

# Prioriteit 4 — Setup thesis en exit plan hints

Doel: elke trade moet uitlegbaar zijn per setup-type.

## 4.1 Setup thesis versterken

Gebruik bestaande modules indien aanwezig:

- `src/strategy/setupThesis.js`
- `src/runtime/tradeThesis.js`

Ondersteun:

- [x] `trend_continuation`.
- [x] `breakout_retest`.
- [x] `mean_reversion`.
- [x] `liquidity_sweep_reclaim`.
- [x] `vwap_reclaim`.
- [x] `range_grid`.
- [x] `failed_breakout_avoidance`.

Output moet bevatten:

- [x] `setupType`.
- [x] `direction`.
- [x] `thesis`.
- [x] `evidenceFor`.
- [x] `evidenceAgainst`.
- [x] `requiredConfirmation`.
- [x] `invalidatesIf`.
- [x] `exitPlanHint`.
- [x] `failureModesToWatch`.
- [x] `riskNotes`.

Acceptatie:

- [x] Tests voor elk setup type.
- [x] Tests voor missing data.
- [x] Tests voor unknown setup.
- [x] Tests voor secret redaction.
- [x] Geen live order behavior gewijzigd.

Notitie 2026-05-03: `src/strategy/setupThesis.js` uitgebreid als pure diagnostic helper met `range_grid`, `failed_breakout_avoidance`, `requiredConfirmation`, `exitPlanHint` en `failureModesToWatch`. Tests dekken alle setup-types, missing/unknown input en secret-safe output. Geen live execution/risk behavior gewijzigd.

## 4.2 Exit plan hints versterken

Gebruik bestaande module indien aanwezig:

- `src/strategy/exitPlanHints.js`

Regels:

- [x] Trend continuation: trailing na favorable move.
- [x] Trend continuation: stop onder structure low / ATR.
- [x] Breakout retest: invalidation onder retest low of terug in range.
- [x] Mean reversion: TP rond VWAP/range mid.
- [x] Liquidity sweep: invalidation onder sweep low.
- [x] VWAP reclaim: invalidation onder VWAP/reclaim level.

Acceptatie:

- [x] Tests toegevoegd.
- [x] Output fallback-safe.
- [x] Geen live execution behavior gewijzigd.

Notitie 2026-05-03: `src/strategy/exitPlanHints.js` versterkt met expliciete `structureStopHint`, `atrStopHint` en `targetHint` per setup-type. Tests dekken trend, breakout retest, mean reversion, liquidity sweep, VWAP reclaim, thesis fallback en missing/NaN input. Diagnostic-only; geen live execution behavior gewijzigd.

---

# Prioriteit 5 — Multi-position en portfolio crowding

Doel: meerdere posities blijven mogelijk, maar correlated exposure wordt beperkt.

## 5.1 Portfolio crowding

Gebruik bestaande module indien aanwezig:

- `src/risk/portfolioCrowding.js`

Output moet bevatten:

- [x] `sameSymbolBlocked`.
- [x] `sameClusterCount`.
- [x] `sameStrategyFamilyCount`.
- [x] `sameRegimeCount`.
- [x] `btcBetaExposure`.
- [x] `crowdingRisk`: low / medium / high / blocked.
- [x] `sizeMultiplier`.
- [x] `reasons`.
- [x] `remainingSlots`.

Regels:

- [x] Same symbol duplicate blockt nieuwe entry.
- [x] Same cluster/regime verlaagt size.
- [x] Extreme crowding blockt.
- [x] Gezonde state respecteert `MAX_OPEN_POSITIONS`.
- [x] Geen hardcoded max 1 positie.

Tests:

- [x] Geen posities => low risk.
- [x] Diverse posities => allowed.
- [x] Same cluster => size omlaag.
- [x] Same symbol => blocked.
- [x] Exposure cap => blocked.

Notitie 2026-05-03: `src/risk/portfolioCrowding.js` uitgebreid met `remainingSlots`, `maxOpenPositions` en projected exposure diagnostics. Tests dekken empty/diverse/crowded/duplicate/full-slot/exposure-cap cases. Meerdere posities blijven mogelijk tot configlimieten; geen hardcoded max 1 toegevoegd.

## 5.2 Post-reconcile multi-position

- [x] Zoek hardcoded max 1 in post-reconcile/probation/risk modules.
- [x] Gebruik `POST_RECONCILE_MAX_OPEN_POSITIONS`.
- [x] Gebruik `POST_RECONCILE_MAX_NEW_ENTRIES_PER_CYCLE`.
- [x] Tweede positie toestaan als limiet 2 is.
- [x] Derde positie blokkeren als limiet 2 is.
- [x] Na completed probation terug naar `MAX_OPEN_POSITIONS`.

Acceptatie:

- [x] Multi-position werkt in gezonde state.
- [x] Exchange safety rood blokkeert alle entries.
- [x] Reconcile/manual_review/unresolved intent blokkeert alle entries.
- [x] `npm test` slaagt.

Notitie 2026-05-03: bestaande `src/risk/postReconcileEntryLimits.js` en `test/postReconcileEntryLimits.tests.js` voldoen aan P5.2. Gerichte inspectie bevestigt config-gestuurde probation-limieten, paper/live size multipliers, post_reconcile_probe tag, exchange-safety/manual-review/unresolved-intent blockers en terugval naar `MAX_OPEN_POSITIONS` na completed probation. Geen codewijziging nodig.

---

# Prioriteit 6 — Execution, stop-limit en reconcile safety

Doel: beschermorders en exits betrouwbaarder maken zonder unsafe live acties.

## 6.1 Stop-loss-limit stuck detection

- [x] Detecteer stop triggered maar limit order unfilled.
- [x] Detecteer actuele bid onder stopLimit.
- [x] Markeer `stop_limit_stuck`.
- [x] Voeg operator next action toe.
- [x] Live: geen blind market sell zonder expliciete bestaande safe policy.

Acceptatie:

- [x] Tests voor triggered/unfilled stop-limit.
- [x] Tests voor illiquide move door stopLimit.
- [x] Manual review bij ambigu bewijs.

Notitie 2026-05-03: `src/execution/stopLimitStuck.js` toegevoegd als pure execution-safety diagnostic. De helper detecteert triggered/unfilled STOP_LOSS_LIMIT orders, bid onder stopLimit, zet `status: stop_limit_stuck`, levert een manual-review `positionPatch`, operator next action en expliciet verboden blind market-sell advies. Geen live broker mutatie of orderplaatsing toegevoegd.

## 6.2 Liquidity-aware stop-limit gap

- [x] Gap gebaseerd op spread.
- [x] Gap gebaseerd op ATR/volatility.
- [x] Gap gebaseerd op orderbook depth.
- [x] Gap gebaseerd op slippage confidence.
- [x] Illiquide coins krijgen bredere stopLimit gap.

Acceptatie:

- [x] Tests voor liquid symbol.
- [x] Tests voor illiquid symbol.
- [x] Tests voor high volatility.
- [x] Geen live safety versoepeld.

Notitie 2026-05-03: `src/execution/stopLimitGap.js` toegevoegd als pure diagnostic helper. De gap gebruikt spread, ATR/volatility, orderbook depth en slippage confidence; illiquide/fragile inputs leveren bredere buffers binnen cap. Nog niet gekoppeld aan live protective order placement, dus geen live OCO-prijswijziging zonder aparte safety review.

## 6.3 OCO / symbol filter tests

- [x] SELL OCO geometry: takeProfit > current > stopTrigger >= stopLimit.
- [x] Invalid geometry blockt.
- [x] tickSize rounding tests.
- [x] stepSize rounding tests.
- [x] minNotional tests.
- [x] fee accounting tests.
- [x] slippage sign tests.

Notitie 2026-05-03: P6.3 is afgerond met `test/executionSafetyFilters.tests.js`. De tests dekken pure OCO-geometry, tick/step/minNotional symbol filters, quote/base/third-asset fee accounting inclusief unconverted fees en slippage-sign handling. Geen live calls of tradinggedrag gewijzigd; `npm test` geslaagd.

---

# Prioriteit 7 — Learning evidence pipeline

Doel: bestaande learningmodules verbinden zodat de bot beter leert van trades, veto's en exits.

## 7.1 Pipeline

Maak of update:

- [x] `src/runtime/learningEvidencePipeline.js`.

Verbind indien beschikbaar:

- [x] setupThesis / tradeThesis.
- [x] exitQuality.
- [x] vetoOutcome.
- [x] failureLibrary.
- [x] regimeConfusion.
- [x] tradeAutopsy.
- [x] tradeAttribution.
- [x] paperLiveParity.

Output:

- [x] `decisionId`.
- [x] `tradeId`.
- [x] `symbol`.
- [x] `setupType`.
- [x] `thesis`.
- [x] `exitQuality`.
- [x] `vetoOutcome`.
- [x] `failureMode`.
- [x] `regimeOutcome`.
- [x] `paperLiveParity`.
- [x] `replayPriority`.
- [x] `recommendedAction`.
- [x] `confidence`.

Tests:

- [x] Winning trade.
- [x] Losing trade.
- [x] Bad veto.
- [x] Reconcile uncertainty.
- [x] Early exit.
- [x] Execution drag.
- [x] Missing data fallback.

Acceptatie:

- [x] Diagnostics/learning-only.
- [x] Geen automatische live promotie.
- [x] `npm test` slaagt.

Notitie 2026-05-03: P7.1 is afgerond door `src/runtime/learningEvidencePipeline.js` uit te breiden met `symbol`, `tradeAttribution`, `paperLiveParity` en bounded `confidence`. Bestaande analyticsmodules blijven read-only gekoppeld; geen live execution/risk behavior gewijzigd. `test/tradingQualityUpgrade.tests.js` dekt win/loss/bad-veto/reconcile/early-exit/execution-drag/missing-data; `npm test` geslaagd.

---

# Prioriteit 8 — Backtest realism en research integrity

Doel: backtests minder misleidend maken.

## 8.1 Backtest metrics

Maak of update:

- [x] `src/backtest/backtestMetrics.js`.

Metrics:

- [x] `expectancy`.
- [x] `profitFactor`.
- [x] `maxDrawdown`.
- [x] `averageR`.
- [x] `winRate`.
- [x] `payoffRatio`.
- [x] `feeDrag`.
- [x] `slippageDrag`.
- [x] `exposureTime`.
- [x] `turnover`.
- [x] `sampleSizeWarning`.

Notitie 2026-05-03: P8.1 is afgerond. `src/backtest/backtestMetrics.js` geeft nu ook `turnover`/`turnoverNotional` terug en blijft finite op empty, mixed, all-winner en all-loser samples. Tests staan in `test/tradingQualityUpgrade.tests.js`; `npm test` geslaagd. Geen live behavior gewijzigd.

## 8.2 Backtest integrity

Maak of update:

- [x] `src/backtest/backtestIntegrity.js`.

Checks:

- [x] Geen NaN/Infinity.
- [x] Impossible timestamps warning.
- [x] Trade count mismatch warning.
- [x] Missing configHash/dataHash warning indien beschikbaar.
- [x] No-lookahead warning als feature timestamp ontbreekt.
- [x] Missing fees/slippage warning.

Tests:

- [x] Empty trades.
- [x] Winning/losing mix.
- [x] All winners.
- [x] All losers.
- [x] Fee drag.
- [x] Slippage drag.
- [x] Impossible timestamp.
- [x] Missing hashes.

Acceptatie:

- [x] Backtest metrics finite.
- [x] Geen live behavior gewijzigd.
- [x] `npm test` slaagt.

Notitie 2026-05-03: P8.2 is afgerond. `src/backtest/backtestIntegrity.js` waarschuwt nu ook bij ontbrekende fee/slippage-evidence, naast bestaande hash, NaN/Infinity, trade-count, future timestamp en no-lookahead checks. Tests staan in `test/dataIntegrityMaintenance.tests.js` en `test/tradingQualityUpgrade.tests.js`; `npm test` geslaagd. Geen live behavior gewijzigd.

---

# Prioriteit 9 — Dashboard en operator cockpit

Doel: dashboard moet exact tonen waarom de bot wel/niet kan traden.

## 9.1 Readmodel/dashboard summaries

Voeg fallback-safe summaries toe:

- [x] `tradingPathHealth`.
- [x] `exchangeSafetySummary`.
- [x] `portfolioCrowdingSummary`.
- [x] `indicatorRegimeSummary`.
- [x] `learningEvidenceSummary`.
- [x] `backtestQualitySummary`.
- [x] `antiOverfitSummary`.
- [x] `dataFreshnessSummary`.
- [x] `requestBudgetSummary`.

Dashboard moet tonen:

- [x] Can it trade now?
- [x] Why not?
- [x] Stale source.
- [x] Next action.
- [x] Top blocker.
- [x] Open position slots.
- [x] Portfolio crowding.
- [x] Exchange safety.
- [x] Post-reconcile status.
- [x] Data freshness.

Tests:

- [x] Empty runtime.
- [x] Partial runtime.
- [x] Stale runtime.
- [x] Blocked exchange safety.
- [x] No decisions.
- [x] Open positions missing price.
- [x] Unknown status.
- [x] Polling error fallback.

Acceptatie:

- [x] Dashboard crasht niet bij partial data.
- [x] Dashboard claimt nooit ready als hard safety blockt.
- [x] Operator ziet concrete nextAction.

Notitie 2026-05-03: P9.1 is afgerond als fallback-safe dashboard/readmodel contract. `src/runtime/dashboardPayloadNormalizers.js` bevat nu expliciete `exchangeSafetySummary` en `requestBudgetSummary` fallbacks naast bestaande trading path, data freshness, learning, quality en post-reconcile summaries. Bestaande `tradingPathHealth` tests dekken stale/no-decision/exchange-safety dominance/polling recovery; `test/tradingQualityUpgrade.tests.js` dekt empty/partial/unknown-status/missing-price summary fallbacks. Geen live behavior gewijzigd; `npm test` geslaagd.

---

# Prioriteit 10 — Engineering hardening

Doel: codekwaliteit en CI verbeteren zonder trading behavior te wijzigen.

## 10.1 Tooling

Voeg toe indien ontbrekend:

- [x] `eslint`.
- [x] `prettier`.
- [x] `c8`.

Scripts:

- [x] `lint`.
- [x] `format:check`.
- [x] `coverage`.

Status: completed
Notitie: lightweight ESLint/Prettier/c8 tooling toegevoegd zonder runtime trading behavior te wijzigen.
Verificatie: `npm run lint`, `npm run format:check` en `npm test` slagen.

## 10.2 CI

- [x] Voeg `.github/workflows/test.yml` toe.
- [x] Gebruik Node 22.
- [x] Run `npm ci`.
- [x] Run `npm test`.
- [x] Run lint indien haalbaar.
- [x] Run coverage indien haalbaar.
- [x] CI mag geen Binance secrets nodig hebben.
- [x] CI mag geen live exchange calls doen.

Acceptatie:

- [x] Bestaande scripts blijven werken.
- [x] Geen trading behavior gewijzigd.
- [x] CI workflow bestaat.

Status: completed
Notitie: bestaande `ci.yml` en `test.yml` gebruiken Node 22, `npm ci`, lint, format-check, `npm test` en coverage. Er zijn geen secrets of live exchange calls toegevoegd.

---

# Nieuwe aanbevelingen backlog

Nieuwe aanbevelingen die ontstaan uit toekomstige analyses moeten hier worden toegevoegd nadat `docs/CODEX_EXECUTION_PLAN.md` en de actuele codebase opnieuw zijn gecontroleerd.

## Backlog template

```md
## B# — Titel

Bron: nieuwe analyse / operator feedback / bug / trading improvement
Status: proposed / accepted / partial / completed / rejected

- [ ] Concrete taak.
- [ ] Tests toevoegen.
- [ ] Docs bijwerken.

Acceptatie:

- [ ] ...
```

## B1 — Feature provenance en decision input lineage

Bron: nieuwe analyse / trading improvement
Status: completed

Doel: elke decision moet kunnen aantonen welke data, features, config en timestamps zijn gebruikt.

- [x] Maak of update `src/runtime/decisionInputLineage.js`.
- [x] Voeg per decision `featureSetId`, `configHash`, `dataHash`, `marketSnapshotAt`, `featureComputedAt` en `sourceFreshness` toe.
- [x] Voeg warnings toe bij missing/stale feature timestamps.
- [x] Verbind met backtest/replay integrity waar veilig.
- [x] Voeg dashboard/readmodel summary toe: `decisionInputLineageSummary`.
- [x] Tests toevoegen voor fresh input, stale input, missing timestamp, changed configHash en replay hash mismatch.
- [x] Docs bijwerken in `docs/TRADING_FEATURE_INVENTORY.md` of `docs/DATA_INTEGRITY.md`.

Acceptatie:

- [x] Decisions zijn traceerbaar naar input data en config.
- [x] Missing/stale provenance versoepelt live entries niet.
- [x] `npm test` slaagt.

Status: completed
Notitie: `decisionInputLineage` toegevoegd als pure diagnostics helper en gekoppeld aan `normalizeDecisionForAudit` plus dashboard fallback summary. Missing/stale provenance geeft alleen warnings en wijzigt geen live entry/risk/executiongedrag.

## B2 — Canary release gates voor strategie- en parameterwijzigingen

Bron: nieuwe analyse / safety improvement
Status: completed

Doel: nieuwe strategy parameters of model changes mogen niet direct normale live exposure krijgen.

- [x] Maak of update `src/runtime/canaryReleaseGate.js`.
- [x] Definieer release states: `shadow`, `paper`, `canary`, `limited_live`, `normal`, `rollback_recommended`.
- [x] Vereis minimum samples, paper/live parity en anti-overfit pass voordat promotie mogelijk is.
- [x] Verbind met `antiOverfitGovernor` en `paperLiveParity` waar veilig.
- [x] Voeg read-only CLI output toe: `node src/cli.js canary:status` indien passend.
- [x] Tests toevoegen voor low samples, paper-only evidence, failed parity, passed canary en rollback recommendation.
- [x] Docs bijwerken in `docs/OPERATOR_COMMANDS.md`.

Acceptatie:

- [x] Geen automatische live promotie.
- [x] Canary gate is diagnostics/governance-first.
- [x] Live safety blijft gelijk of strenger.
- [x] `npm test` slaagt.

Status: completed
Notitie: `canaryReleaseGate` toegevoegd als pure governance helper met read-only `canary:status`. De gate blokkeert low-sample, paper-only-live, parity-fail en rollback cases en voert geen live promotie of execution-mutaties uit.

## B3 — Alert escalation en operator action queue

Bron: nieuwe analyse / operator improvement
Status: completed

Doel: alerts moeten niet alleen getoond worden, maar prioriteit, eigenaar en aanbevolen actie krijgen.

- [x] Maak of update `src/runtime/operatorActionQueue.js`.
- [x] Normaliseer alerts naar `info`, `low`, `medium`, `high`, `critical`.
- [x] Voeg `recommendedAction`, `urgency`, `blocking`, `createdAt`, `lastSeenAt` en `dedupeKey` toe.
- [x] Critical exchange/reconcile/protection alerts moeten entry readiness blokkeren.
- [x] Voeg dashboard summary toe: `operatorActionQueueSummary`.
- [x] Voeg CLI output toe: `node src/cli.js actions:list` indien passend.
- [x] Tests toevoegen voor dedupe, escalation, resolved alerts en critical blocking.
- [x] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md`.

Acceptatie:

- [x] Operator ziet concrete acties in plaats van alleen statuslabels.
- [x] Critical alerts blokkeren entries.
- [x] Geen force unlock of live safety versoepeling.
- [x] `npm test` slaagt.

Status: completed
Notitie: `operatorActionQueue` toegevoegd als read-only actiequeue bovenop bestaande alerts. `actions:list` toont concrete operatoracties; critical exchange/reconcile/protection/manual-review acties blokkeren readiness zonder force-unlock of execution-mutaties.

## B4 — Exchange adapter contract tests

Bron: nieuwe analyse / execution safety
Status: completed

Doel: paper, demo en live exchange adapters moeten hetzelfde contract volgen zonder echte exchange-mutaties in tests.

- [x] Maak of update `test/execution/exchangeAdapterContract.tests.js`.
- [x] Definieer contract voor place order, cancel order, fetch open orders, fetch balances, fetch recent trades en symbol filters.
- [x] Test paper/demo adapters met fake exchange responses.
- [x] Test error mapping voor rate limits, minNotional, precision errors, insufficient balance en unknown order.
- [x] Test dat live adapter in tests nooit echte orders verstuurt.
- [x] Voeg fixtures toe voor Binance-like responses.
- [x] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md` of `docs/EXECUTION_SAFETY.md`.

Acceptatie:

- [x] Adapter contract is testbaar zonder Binance secrets.
- [x] Paper/demo/live behavior divergeert niet stil.
- [x] `npm test` slaagt.

Notitie 2026-05-04: `src/execution/exchangeAdapterContract.js` toegevoegd als pure contract/error-normalization helper. Contracttests gebruiken uitsluitend fake paper/demo/live adapters en fake Binance-like responses; live mutaties zijn in tests guard-fail en vereisen geen secrets.

## B5 — Model confidence calibration monitor

Bron: nieuwe analyse / AI quality improvement
Status: completed

Doel: model confidence moet gekalibreerd worden; hoge confidence mag niet structureel slechte trades opleveren zonder waarschuwing.

- [x] Maak of update `src/ai/confidenceCalibration.js`.
- [x] Bereken calibration buckets voor confidence ranges.
- [x] Meet expected vs realized win/outcome per bucket.
- [x] Voeg warnings toe bij overconfidence en underconfidence.
- [x] Verbind met `antiOverfitGovernor` zodat slechte calibration promotie blokkeert.
- [x] Voeg dashboard summary toe: `confidenceCalibrationSummary`.
- [x] Tests toevoegen voor calibrated, overconfident, underconfident en low sample cases.
- [x] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [x] Calibration is diagnostics/governance-first.
- [x] Slechte calibration kan promotie blokkeren maar forceert geen live trade wijzigingen.
- [x] `npm test` slaagt.

Notitie 2026-05-04: `src/ai/confidenceCalibration.js` toegevoegd als pure diagnostics/governance helper. Slechte calibration voedt anti-overfit promotion review en dashboard fallback visibility, zonder runtime threshold/sizing/execution gedrag te wijzigen.

## B6 — Scenario stress testing voor portfolio en open posities

Bron: nieuwe analyse / risk improvement
Status: completed

Doel: simuleer portfolio-impact bij BTC dump, volatility spike, liquidity drain en exchange data degradation.

- [x] Maak of update `src/runtime/portfolioScenarioStress.js`.
- [x] Scenario's: `btc_dump`, `eth_dump`, `alt_liquidity_drain`, `spread_spike`, `volatility_spike`, `data_stale`, `fee_slippage_spike`.
- [x] Output bevat estimated drawdown, affected positions, protection health en recommendedAction.
- [x] Verbind met `portfolioCrowding` en `safetySnapshot` waar veilig.
- [x] Voeg dashboard summary toe: `portfolioScenarioStressSummary`.
- [x] Tests toevoegen voor empty portfolio, diversified portfolio, crowded portfolio en missing prices.
- [x] Docs bijwerken in `docs/RISK_MANAGEMENT.md` indien aanwezig, anders `docs/OPERATOR_COMMANDS.md`.

Acceptatie:

- [x] Stress test is read-only/diagnostics.
- [x] Geen live execution behavior gewijzigd.
- [x] `npm test` slaagt.

Notitie 2026-05-04: `src/runtime/portfolioScenarioStress.js` toegevoegd als pure read-only helper met dashboard fallback. De helper schat drawdown/protection health en gebruikt portfolio-crowding summary; er is geen execution/risk gate aangesloten.

## B7 — Crypto derivatives context adapter

Bron: nieuwe analyse / crypto trading improvement
Status: completed

Doel: futures/derivatives context zoals funding, open interest, basis en liquidations gebruiken als diagnostics en risk filter voor spot trading.

- [x] Maak of update `src/market/derivativesContext.js`.
- [x] Voeg provider-interface toe voor funding rate, open interest delta, spot/futures basis en liquidation proximity.
- [x] Output bevat `fundingPressure`, `openInterestTrend`, `basisState`, `liquidationRisk`, `warnings` en `confidence`.
- [x] Gebruik context eerst alleen als diagnostics/paper/shadow risk input.
- [x] Voeg fallback toe als provider/data ontbreekt.
- [x] Voeg dashboard summary toe: `derivativesContextSummary`.
- [x] Tests toevoegen voor missing provider, extreme funding, rising OI, negative basis en stale data.
- [x] Docs bijwerken in `docs/TRADING_FEATURE_INVENTORY.md`.

Acceptatie:

- [x] Spot trading wordt niet automatisch agressiever.
- [x] Missing derivatives data blokkeert live niet tenzij expliciet safety-config dat vereist.
- [x] `npm test` slaagt.

Notitie 2026-05-04: bestaande `derivativesContextProvider` hergebruikt via `src/market/derivativesContext.js`, een pure normalizer voor dashboard/risk diagnostics. Missing data blijft `missingDataBlocksLive=false`; geen execution/risk gate gekoppeld.

## B8 — Crypto market regime router v2

Bron: nieuwe analyse / trading improvement
Status: completed

Doel: setup selectie aanpassen aan bredere crypto-regimes zoals BTC-led trend, alt rotation, chop, crash risk en liquidity vacuum.

- [x] Maak of update `src/runtime/cryptoRegimeRouter.js`.
- [x] Regimes: `btc_led_trend`, `eth_led_trend`, `alt_rotation`, `range_chop`, `liquidity_vacuum`, `crash_risk`, `news_shock`.
- [x] Gebruik inputs uit marketState, trendState, leadershipContext, volatilityService, orderbookDelta en universeScorer waar beschikbaar.
- [x] Output bevat allowed setup families, blocked setup families, sizeMultiplier en confidencePenalty.
- [x] Verbind met indicatorRegimeScoring als diagnostics/shadow-first.
- [x] Tests toevoegen voor elk regime en missing/ambiguous data.
- [x] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [x] Router is fallback-safe.
- [x] Router versoepelt geen hard safety blockers.
- [x] `npm test` slaagt.

Notitie 2026-05-04: `src/runtime/cryptoRegimeRouter.js` toegevoegd als pure diagnostics/shadow-first router. Output bevat regime, allowed/blocked setup families, bounded size/confidence hints, warnings, indicator-regime fit en expliciete `entryPermissionChanged=false`/`hardSafetyUnchanged=true`. Dashboard normalizer accepteert optionele `cryptoRegimeRouterSummary`; geen risk/execution gate gekoppeld.

## B9 — Symbol lifecycle en listing-risk monitor

Bron: nieuwe analyse / crypto trading improvement
Status: completed

Doel: nieuwe, hype-, low-liquidity of delisting-risk symbols strenger behandelen.

- [x] Maak of update `src/runtime/symbolLifecycleRisk.js`.
- [x] Track symbol age, recent listing risk, abnormal volume spike, spread instability, depth weakness en trading halt/delisting warnings indien beschikbaar.
- [x] Output bevat `lifecycleRisk`, `warnings`, `sizeMultiplier`, `entryAllowedDiagnostic` en `requiredEvidence`.
- [x] Verbind met universeScorer en portfolioCrowding waar veilig.
- [x] Tests toevoegen voor new listing, mature liquid symbol, illiquid hype spike, stale profile en missing profile.
- [x] Docs bijwerken in `docs/TRADING_FEATURE_INVENTORY.md`.

Notitie 2026-05-04: `src/runtime/symbolLifecycleRisk.js` toegevoegd als diagnostics-only lifecycle monitor. De helper geeft universe/risk hints (`universePenalty`, `sizeMultiplier`) en dashboard fallback, maar verandert geen universe ranking, entry permissioning of live execution.

Acceptatie:

- [x] Nieuwe/illiquide symbols krijgen strengere diagnostics of size hints.
- [x] Geen automatische live aggressiveness increase.
- [x] `npm test` slaagt.

## B10 — News/social shock circuit breaker

Bron: nieuwe analyse / crypto trading improvement
Status: completed

Doel: plotselinge news/social shocks detecteren en entry confidence verlagen of manual review adviseren.

- [x] Maak of update `src/news/shockCircuitBreaker.js`.
- [x] Gebruik bestaande news/eventClassifier/calendarService waar beschikbaar.
- [x] Detecteer exchange incident, regulatory news, token exploit/hack, delisting rumor, major listing announcement en abnormal headline velocity.
- [x] Output bevat `shockLevel`, `affectedSymbols`, `entryPenalty`, `manualReviewRecommended` en `expiryAt`.
- [x] Verbind met dashboard/readmodel summary: `newsShockSummary`.
- [x] Tests toevoegen voor hack headline, listing hype, stale news, irrelevant news en missing news provider.
- [x] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md` of `docs/TRADING_QUALITY.md`.

Notitie 2026-05-04: `src/news/shockCircuitBreaker.js` toegevoegd bovenop bestaande `eventClassifier`. De output is fallback-safe en diagnostics-first; critical shocks kunnen alleen caution/manual-review of expliciete strengere policy ondersteunen, geen live threshold relief.

Acceptatie:

- [x] Shock breaker is conservative en fallback-safe.
- [x] Critical shock kan entries blokkeren als safety policy dit vereist.
- [x] `npm test` slaagt.

## B11 — Adaptive order style advisor

Bron: nieuwe analyse / execution improvement
Status: completed

Doel: per setup/liquidity/regime adviseren welk ordertype het veiligst is zonder automatisch unsafe live behavior te wijzigen.

- [x] Maak of update `src/execution/orderStyleAdvisor.js`.
- [x] Inputs: spread, depth, volatility, slippageConfidence, setupType, urgency, position size en maker/taker fee context.
- [x] Output: `recommendedStyle`, `makerSuitable`, `takerSuitable`, `stopLimitGapHint`, `warnings`, `manualReviewRecommended`.
- [x] Ondersteun styles: `maker_limit`, `limit_ioc`, `market_prohibited`, `stop_limit_wide`, `protective_rebuild_only`.
- [x] Verbind met stop-limit stuck detection en netEdgeGate waar veilig.
- [x] Tests toevoegen voor tight spread, wide spread, liquidity drain, urgent exit en missing orderbook.
- [x] Docs bijwerken in `docs/EXECUTION_SAFETY.md` indien aanwezig, anders `docs/OPERATOR_COMMANDS.md`.

Notitie 2026-05-04: `src/execution/orderStyleAdvisor.js` toegevoegd als pure diagnostics/governance helper. De advisor gebruikt bestaande liquidity-aware stop-limit gap logic, geeft orderstijl-hints en dashboard fallback, maar wijzigt geen execution plan of live ordertype automatisch.

Acceptatie:

- [x] Advisor is diagnostics/governance-first.
- [x] Geen live ordertype wordt automatisch riskanter.
- [x] `npm test` slaagt.

## B12 — Adaptive symbol universe decay en cooldowns

Bron: nieuwe analyse / crypto trading improvement
Status: completed

Doel: symbols die tijdelijk slecht presteren, slechte fills geven of vaak blocked worden automatisch lager ranken.

- [x] Maak of update `src/runtime/symbolQualityDecay.js`.
- [x] Track recent blocked reasons, bad fills, stop_limit_stuck events, poor slippage, low data quality, bad veto outcomes en exit quality.
- [x] Output bevat `qualityScore`, `cooldownUntil`, `rankPenalty`, `reasons` en `recoveryConditions`.
- [x] Verbind met universeScorer en scanPlanner waar veilig.
- [x] Tests toevoegen voor repeated bad fills, repeated blockers, recovery after clean cycles, missing data en no penalty for healthy symbols.
- [x] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Notitie 2026-05-04: `src/runtime/symbolQualityDecay.js` toegevoegd als fallback-safe diagnostics-laag. De helper levert `qualityScore`, `rankPenalty`, `cooldownUntil`, redenen, recovery-voorwaarden en expliciete `universeScorerHint`/`scanPlannerHint` zonder live gates, ranking, sizing of exchange-safety te wijzigen. Dashboard-normalizer accepteert optioneel `symbolQualityDecaySummary`.

Acceptatie:

- [x] Slechte symbols worden tijdelijk lager gerankt zonder permanente blacklist tenzij expliciet geconfigureerd.
- [x] Gezonde symbols herstellen na clean evidence.
- [x] `npm test` slaagt.

## B13 — Stablecoin depeg en quote-asset risk monitor

Bron: nieuwe analyse / crypto risk improvement
Status: completed

Doel: USDT/USDC/FDUSD of andere quote-asset risico's detecteren zodat de bot niet blind blijft traden bij stablecoin stress.

- [x] Maak of update `src/market/stablecoinRisk.js`.
- [x] Monitor quote-asset deviation, stablecoin spread, abnormal volume, redemption/depeg headline signals en cross-pair stress.
- [x] Output bevat `stablecoinRisk`, `affectedQuotes`, `depegBps`, `warnings`, `entryPenalty`, `manualReviewRecommended`.
- [x] Verbind met `safetySnapshot`, `cryptoRegimeRouter` en dashboard summary waar veilig.
- [x] Voeg tests toe voor normal peg, mild depeg, severe depeg, missing data en stale price source.
- [x] Docs bijwerken in `docs/TRADING_FEATURE_INVENTORY.md` of `docs/RISK_MANAGEMENT.md`.

Notitie 2026-05-04: `src/market/stablecoinRisk.js` toegevoegd als pure quote-asset stressmonitor. De helper detecteert peg-afwijking, spread/volume stress, stale/missing price sources en redemption/depeg headlines. Integratie is conservative diagnostics-only via `safetySnapshot`, `cryptoRegimeRouter` en dashboard-normalizer; geen force-sell, force-unlock of live threshold relief.

Acceptatie:

- [x] Stablecoin stress kan entries conservatiever maken of manual review adviseren.
- [x] Geen automatische force-sell of force-unlock.
- [x] Missing stablecoin data versoepelt live safety niet.
- [x] `npm test` slaagt.

## B14 — Cross-exchange divergence en Binance-local price sanity

Bron: nieuwe analyse / market data quality improvement
Status: proposed

Doel: detecteren wanneer Binance-prijs afwijkt van bredere markt of wanneer lokale feed corrupt/stale lijkt.

- [ ] Maak of update `src/market/crossExchangeDivergence.js`.
- [ ] Provider-interface voor externe reference prices zonder hard dependency.
- [ ] Vergelijk Binance mid/last met reference mid/last.
- [ ] Output bevat `divergenceBps`, `referenceCount`, `confidence`, `warnings`, `staleSources`.
- [ ] Voeg `priceSanityStatus` toe aan data freshness/trading path health indien veilig.
- [ ] Tests toevoegen voor normal divergence, severe divergence, stale reference, missing references en outlier reference.
- [ ] Docs bijwerken in `docs/DATA_INTEGRITY.md` of `docs/TRADING_FEATURE_INVENTORY.md`.

Acceptatie:

- [ ] Severe divergence verlaagt confidence of blokkeert diagnostics volgens config.
- [ ] Geen externe provider vereist om tests te draaien.
- [ ] Geen live behavior agressiever.
- [ ] `npm test` slaagt.

## B15 — Microstructure fill simulator voor paper/backtest

Bron: nieuwe analyse / execution realism improvement
Status: completed

Doel: paper en backtest realistischer maken door fills te simuleren op basis van spread, depth, volume, urgency en order type.

- [x] Maak of update `src/execution/microstructureFillSimulator.js`.
- [x] Simuleer maker fill probability, taker slippage, partial fill, queue risk en timeout.
- [x] Inputs: order type, quantity, notional, spread, book depth, candle volume, volatility, latency.
- [x] Output bevat `fillProbability`, `expectedSlippageBps`, `partialFillRatio`, `timeoutRisk`, `warnings`.
- [x] Verbind met paper broker/backtest alleen waar veilig en config-gated.
- [x] Tests toevoegen voor tight spread, wide spread, thin book, high volatility, maker timeout en partial fill.
- [x] Docs bijwerken in `docs/BACKTEST_QUALITY.md` of `docs/EXECUTION_SAFETY.md`.

Acceptatie:

- [x] Paper/backtest worden realistischer, niet optimistischer zonder warning.
- [x] Geen live execution behavior gewijzigd.
- [x] `npm test` slaagt.

Notitie 2026-05-04: `src/execution/microstructureFillSimulator.js` toegevoegd als pure fallback-safe simulator voor diagnostics/config-gated paper/backtest realism. De bestaande paper execution defaults zijn niet gewijzigd; de helper maakt thin-book, wide-spread, high-volatility, partial-fill en timeout-risk expliciet en finite.

## B16 — Strategy retirement en quarantine lifecycle

Bron: nieuwe analyse / strategy governance improvement
Status: completed

Doel: strategieën die structureel slecht presteren automatisch naar watch/quarantine/retired diagnostics verplaatsen.

- [x] Maak of update `src/runtime/strategyLifecycle.js`.
- [x] States: `active`, `watch`, `quarantine`, `retired`, `shadow_only`, `retest_required`.
- [x] Criteria: drawdown, bad exit quality, bad veto ratio, poor calibration, poor paper/live parity, repeated execution drag.
- [x] Output bevat `strategyId`, `state`, `reasons`, `retestRequirements`, `recommendedAction`.
- [x] Verbind met `antiOverfitGovernor`, `failureLibrary`, `paperLiveParity` en dashboard summary waar veilig.
- [x] Tests toevoegen voor healthy strategy, watch, quarantine, retired, recovery after retest en missing stats.
- [x] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Notitie 2026-05-04: `src/runtime/strategyRetirementEngine.js` is hergebruikt als bronmodule en `src/runtime/strategyLifecycle.js` is een dunne compatibility-export. De lifecycle-helper is diagnostics-only, auto-promoot live niet en dashboard-normalisatie is fallback-safe.

Acceptatie:

- [x] Geen automatische live promotie.
- [x] Slechte strategieën kunnen diagnostisch worden gedegradeerd of live-blocked volgens bestaande safety policy.
- [x] `npm test` slaagt.

## B17 — Risk-of-ruin en drawdown forecast monitor

Bron: nieuwe analyse / portfolio risk improvement
Status: completed

Doel: naast actuele drawdown ook verwachte drawdown en risk-of-ruin op basis van trade distribution tonen.

- [x] Maak of update `src/risk/riskOfRuin.js`.
- [x] Gebruik historical trade outcomes, avg R, win rate, payoff ratio, streaks en current exposure.
- [x] Output bevat `riskOfRuinScore`, `expectedDrawdown`, `lossStreakRisk`, `recommendedSizeMultiplier`, `warnings`.
- [x] Verbind met portfolio risk dashboard en `portfolioScenarioStress` waar veilig.
- [x] Tests toevoegen voor empty history, positive expectancy, negative expectancy, high variance en high exposure.
- [x] Docs bijwerken in `docs/RISK_MANAGEMENT.md`.

Notitie 2026-05-04: `src/risk/riskOfRuin.js` toegevoegd als portfolio-facing monitor die de bestaande `riskOfRuinSimulator` hergebruikt. De output is diagnostics/governance-first, gebruikt optioneel `portfolioScenarioStress`, adviseert alleen sizeverlaging of opt-in entry blocking en verhoogt nooit live risk.

Acceptatie:

- [x] Monitor is diagnostics/governance-first.
- [x] Geen automatische live size increase.
- [x] Hoge risk-of-ruin mag size verlagen of entries blokkeren volgens config, nooit safety versoepelen.
- [x] `npm test` slaagt.

## B18 — Time-in-market en opportunity cost analyzer

Bron: nieuwe analyse / performance analytics improvement
Status: completed

Doel: meten of de bot te lang in zwakke trades blijft of kapitaal blokkeert dat beter elders gebruikt had kunnen worden.

- [x] Maak of update `src/runtime/opportunityCostAnalyzer.js`.
- [x] Meet time in market, idle capital, position stagnation, missed higher-quality candidates en capital lock.
- [x] Output bevat `timeInMarket`, `stagnationRisk`, `opportunityCostScore`, `capitalEfficiency`, `recommendedAction`.
- [x] Verbind met exit intelligence en dashboard summary waar veilig.
- [x] Tests toevoegen voor fast winner, slow loser, flat stagnant trade, idle capital en missing candidate data.
- [x] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Notitie 2026-05-04: `src/runtime/opportunityCostAnalyzer.js` toegevoegd als pure diagnostics analyzer. De dashboard normalizer accepteert optioneel `opportunityCostSummary`; aanbevelingen blijven review-only en veroorzaken geen forced exits of live behavior changes.

Acceptatie:

- [x] Analyzer is diagnostics-first.
- [x] Geen automatische forced exits zonder bestaande safe exit policy.
- [x] `npm test` slaagt.

## B19 — Tax/performance ledger en realized PnL audit

Bron: nieuwe analyse / accounting and audit improvement
Status: completed

Doel: realized PnL, fees, fills, cost basis en trade attribution auditable maken voor performance review.

- [x] Maak of update `src/runtime/performanceLedger.js`.
- [x] Track realized PnL, fees, cost basis, average entry, partial exits, dust, quote/base conversions en trade attribution.
- [x] Output bevat per trade en per day summary.
- [x] Voeg reconciliation checks toe tussen local ledger, fills en account deltas.
- [x] Tests toevoegen voor partial fills, partial exits, fees in quote/base, dust, break-even en negative PnL.
- [x] Docs bijwerken in `docs/OPERATOR_COMMANDS.md` of `docs/PERFORMANCE_LEDGER.md`.

Notitie 2026-05-04: `src/runtime/performanceLedger.js` toegevoegd als read-only audit helper. De ledger normaliseert trade/fill/account-delta records, geeft per-trade en per-day summaries, detecteert dust/account/fill mismatches en wijzigt geen live executiongedrag.

Acceptatie:

- [x] Ledger is audit/read-only first.
- [x] Geen live execution behavior gewijzigd.
- [x] `npm test` slaagt.

## B20 — Walk-forward deployment report voor strategy changes

Bron: nieuwe analyse / research-to-production improvement
Status: completed

Doel: voor elke strategy/config wijziging een compact rapport maken met walk-forward, regime split en safety summary voordat het naar paper/canary gaat.

- [x] Maak of update `src/research/walkForwardDeploymentReport.js`.
- [x] Combineer backtest metrics, regime split, sample size, failure modes, calibration, anti-overfit verdict en canary gate status.
- [x] Output bevat `deploymentStatus`, `blockingReasons`, `warnings`, `recommendedNextStep`.
- [x] Voeg CLI command toe: `node src/cli.js research:deployment-report` indien passend.
- [x] Tests toevoegen voor not enough samples, weak regime, strong report, failed anti-overfit en missing backtest data.
- [x] Docs bijwerken in `docs/BACKTEST_QUALITY.md` of `docs/TRADING_QUALITY.md`.

Acceptatie:

- [x] Rapport is read-only/governance-first.
- [x] Geen automatische live promotie.
- [x] `npm test` slaagt.

Notitie 2026-05-04: `src/research/walkForwardDeploymentReport.js` en read-only CLI `node src/cli.js research:deployment-report` toegevoegd. Rapport combineert backtest metrics, regime split, failure/calibration, anti-overfit en canary gate; sterke evidence levert hoogstens `paper_candidate`, nooit automatische live promotie.

## B21 — API degradation en fallback-mode planner

Bron: nieuwe analyse / runtime reliability improvement
Status: completed

Doel: als Binance/API/data providers degraderen, moet de bot automatisch uitleggen welke veilige fallback-mode geldt.

- [x] Maak of update `src/runtime/apiDegradationPlanner.js`.
- [x] Detecteer REST budget pressure, repeated 429/5xx, stale websocket/user stream, partial data provider outage en latency spikes.
- [x] Output bevat `degradationLevel`, `allowedModes`, `blockedActions`, `recommendedAction`, `retryAfterMs`.
- [x] Verbind met tradingPathHealth, requestBudget en safetySnapshot waar veilig.
- [x] Tests toevoegen voor normal, rate limited, stale stream, partial outage en full outage.
- [x] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md`.

Acceptatie:

- [x] Degradatie kan entries blokkeren of observe/protect-only adviseren.
- [x] Geen force unlock.
- [x] `npm test` slaagt.

Notitie 2026-05-04: `src/runtime/apiDegradationPlanner.js` toegevoegd als pure diagnostics/safety-posture helper. De planner classificeert normal/degraded/partial_outage/rate_limited/full_outage, geeft allowed modes en blocked actions terug, en is optioneel zichtbaar in trading path health, safety snapshot en dashboard normalizer. Geen live execution, force-unlock of exchange-safety bypass toegevoegd.

## B22 — Strategy explainability snapshot voor elke candidate

Bron: nieuwe analyse / explainability improvement
Status: completed

Doel: niet alleen uitgevoerde trades, maar ook afgewezen candidates moeten compact uitlegbaar zijn.

- [x] Maak of update `src/runtime/candidateExplainability.js`.
- [x] Per candidate output: setupType, top evidence, top conflicts, blocker, score components, regime fit, execution fit, risk fit.
- [x] Verbind met dashboard top decisions en replay/debug waar veilig.
- [x] Tests toevoegen voor approved candidate, blocked candidate, missing features, unknown regime en execution conflict.
- [x] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [x] Afgewezen kansen zijn uitlegbaar.
- [x] Geen live behavior gewijzigd.
- [x] `npm test` slaagt.

Notitie 2026-05-04: `src/runtime/candidateExplainability.js` toegevoegd als pure read-only helper met per-candidate score components, evidence/conflicts, blocker, regime/execution/risk fit en fallback-safe summary. Dashboard normalizer accepteert optionele `candidateExplainabilitySummary`; geen ranking, sizing, entry gate of execution behavior gewijzigd.

## B23 — Feature Activation Governor

Bron: operator request / live-safety governance
Status: completed
Eerste integratie: governance_only

Doel: nieuwe tradingfeatures mogen niet ongemerkt live-impact krijgen. De activation governor bepaalt of een feature hoogstens `diagnostics_only`, `shadow_only`, `paper_only`, `canary`, `limited_live` of `normal_live` mag draaien.

- [x] Controleer bestaande modules: `featureActivationGovernor`, `canaryReleaseGate`, `antiOverfitGovernor`, `paperLiveParity`, `safetySnapshot`.
- [x] Maak `src/runtime/featureActivationGovernor.js` omdat er nog geen bestaande module was.
- [x] Default onbekende/nieuwe features naar `diagnostics_only`.
- [x] Sta `shadow_only` pas toe als feature fallback-safe is en tests heeft.
- [x] Sta `paper_only` alleen toe in `BOT_MODE=paper` en met expliciete config.
- [x] Blokkeer paper-only hard-safety bypass.
- [x] Blokkeer automatische live-promotie altijd.
- [x] Vereis live config, anti-overfit pass, paper/live parity, safety review en canary review voor live-impact.
- [x] Voeg summary helper toe voor activation stages.
- [x] Voeg regressietests toe.
- [x] Run `npm test`.

Acceptatie:

- [x] Geen automatische live promotie.
- [x] Geen live safety versoepeld.
- [x] Paper-only kan hard safety niet omzeilen.
- [x] Governor is fallback-safe en geeft geen NaN/Infinity.
- [x] `npm test` slaagt.

Notitie 2026-05-03: `src/runtime/featureActivationGovernor.js` toegevoegd als pure governance helper. Geen runtime execution/risk path aangesloten; dus geen live behavior wijziging. Tests toegevoegd in `test/featureActivationGovernor.tests.js`.

---

# Codex werkprotocol

Codex moet bij elke PR:

1. Deze file lezen.
2. Exact één prioriteit of kleine subtaak kiezen.
3. Geen unrelated changes doen.
4. Tests toevoegen.
5. `npm test` draaien.
6. Deze file bijwerken:
   - checkbox op `[x]` zetten voor afgeronde items
   - korte notitie toevoegen onder de prioriteit
   - remaining issues vermelden
7. PR summary schrijven met:
   - wat is gedaan
   - welke files zijn geraakt
   - welke tests zijn toegevoegd
   - welke live behavior NIET is gewijzigd
   - safety invariants preserved

## PR notitie template

```md
### Codex update

Priority: P# - naam
Status: completed / partial / blocked

Changed files:
- ...

Tests:
- ...

Safety:
- Live safety unchanged: yes/no
- Exchange safety unchanged: yes/no
- No real Binance orders in tests: yes/no
- Multi-position preserved: yes/no

Remaining issues:
- ...
```

---

# Laatste algemene acceptatiecriteria

Een fase is pas klaar als:

- [ ] `npm test` slaagt.
- [ ] Geen live safety versoepeld is.
- [ ] Geen echte Binance orders in tests zitten.
- [ ] Geen duplicate modules zijn gebouwd als bestaande modules konden worden uitgebreid.
- [ ] Docs zijn bijgewerkt.
- [ ] Deze roadmap is afgevinkt voor de afgeronde taak.
