# Codex Execution Plan

Deze roadmap is bedoeld als vaste leidraad voor Codex-runs in deze repo. Codex moet dit bestand gebruiken als bron van waarheid, per taak kleine PR's maken, en na elke afgeronde taak de checkbox afvinken met korte notitie.

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

- [ ] Run `npm test`.
- [ ] Run `node src/cli.js doctor`.
- [ ] Run `node src/cli.js status`.
- [ ] Run `node src/cli.js once`.
- [ ] Run `node src/cli.js readmodel:dashboard`.
- [ ] Run `node src/cli.js feature:audit`.
- [ ] Run `node src/cli.js rest:audit`.
- [ ] Documenteer resultaten in `docs/DEBUG_AUDIT_REPORT.md`.

Acceptatie:

- [ ] Alle command failures zijn gedocumenteerd.
- [ ] Bekende remaining issues staan onder `Known issues`.
- [ ] Geen live behavior gewijzigd.

## 1.2 Trading path health

- [ ] Maak of update `src/runtime/tradingPathHealth.js`.
- [ ] Voeg CLI command toe: `node src/cli.js trading-path:debug`.
- [ ] Toon `botRunning`.
- [ ] Toon `cycleFresh`.
- [ ] Toon `feedFresh`.
- [ ] Toon `readmodelFresh`.
- [ ] Toon `dashboardFresh`.
- [ ] Toon `topDecisionsCount`.
- [ ] Toon `marketSnapshotsCount`.
- [ ] Toon `blockingReasons`.
- [ ] Toon `nextAction`.

Acceptatie:

- [ ] Stale/missing data blokkeert entries.
- [ ] Fresh trading path blokkeert niet vanzelf.
- [ ] Exchange safety blijft dominante blocker.
- [ ] Tests toegevoegd voor fresh/stale/partial/missing data.

## 1.3 NaN/Infinity audit

- [ ] Controleer publieke indicator helpers.
- [ ] Controleer risk scoring/sizing helpers.
- [ ] Controleer exit level helpers.
- [ ] Controleer fee/slippage helpers.
- [ ] Controleer backtest metrics.
- [ ] Controleer dashboard summaries.
- [ ] Gebruik `src/utils/safeMath.js` waar passend.

Acceptatie:

- [ ] Geen publieke helper geeft `NaN` of `Infinity` terug.
- [ ] Tests voor lege input, korte input, zero volume, missing snapshot en extreme values.

---

# Prioriteit 2 — Docs, implementation matrix en feature inventory

Doel: voorkom dubbel werk en maak duidelijk wat implemented/partial/planned is.

## 2.1 Implementation matrix

- [ ] Maak of update `docs/IMPLEMENTATION_MATRIX.md`.
- [ ] Documenteer config modules.
- [ ] Documenteer strategy/indicator modules.
- [ ] Documenteer risk modules.
- [ ] Documenteer execution modules.
- [ ] Documenteer runtime/learning modules.
- [ ] Documenteer dashboard/readmodel modules.
- [ ] Documenteer storage/migration modules.
- [ ] Documenteer backtest/research modules.
- [ ] Documenteer operator/safety modules.

Per feature opnemen:

- [ ] Status: implemented / partial / planned / deprecated.
- [ ] Files.
- [ ] Tests.
- [ ] Runtime impact.
- [ ] Dashboard visible.
- [ ] Live impact.
- [ ] Notes / known gaps.

## 2.2 Trading feature inventory

- [ ] Maak of update `docs/TRADING_FEATURE_INVENTORY.md`.
- [ ] Documenteer bestaande indicators uit `src/strategy/indicators.js`.
- [ ] Documenteer advanced indicators indien aanwezig.
- [ ] Documenteer market/orderbook features.
- [ ] Documenteer setup thesis features.

Per feature opnemen:

- [ ] Type: trend / range / breakout / volume / volatility / orderflow / risk / diagnostic.
- [ ] Beste regime.
- [ ] Gebruik: entry / filter / exit / risk / diagnostic.
- [ ] Valkuil.
- [ ] Testdekking.
- [ ] Advies: live / paper-only / shadow / diagnostics.

Acceptatie:

- [ ] Docs beschrijven bestaande code feitelijk.
- [ ] Geen nieuwe trading behavior in deze taak.
- [ ] `npm test` slaagt.

---

# Prioriteit 3 — Indicatoren en regime-specific scoring

Doel: tradingkwaliteit verbeteren zonder live agressiever te maken.

## 3.1 Advanced indicator helpers

Controleer eerst of helpers al bestaan. Voeg alleen ontbrekende helpers toe in bestaande passende module of `src/strategy/advancedIndicators.js`.

- [ ] `anchoredVwap`.
- [ ] `emaSlopeStack`.
- [ ] `relativeVolume`.
- [ ] `bollingerKeltnerSqueeze`.
- [ ] `atrPercentile`.
- [ ] `vwapZScore`.
- [ ] `obvDivergence`.
- [ ] `spreadPercentile`.
- [ ] `orderBookImbalanceStability`.
- [ ] `slippageConfidenceScore`.

Acceptatie:

- [ ] Alle helpers zijn fallback-safe.
- [ ] Geen helper geeft `NaN` of `Infinity` terug.
- [ ] Tests voor lege, korte, normale en extreme input.
- [ ] Nieuwe features zijn diagnostics/paper/shadow-first.

## 3.2 Regime-specific indicator scoring

- [ ] Maak of update `src/strategy/indicatorRegimeScoring.js`.
- [ ] Exporteer `scoreIndicatorRegimeFit({ features, regime, setupType })`.
- [ ] Output bevat `score`.
- [ ] Output bevat `supportingIndicators`.
- [ ] Output bevat `conflictingIndicators`.
- [ ] Output bevat `warnings`.
- [ ] Output bevat `sizeHintMultiplier`.
- [ ] Output bevat `confidencePenalty`.

Regels:

- [ ] RSI/MFI/Stoch RSI zwaarder in range/mean reversion.
- [ ] Donchian/BOS/EMA slope zwaarder in trend/breakout.
- [ ] Choppiness hoog verlaagt breakout confidence.
- [ ] ATR percentile extreem hoog verlaagt confidence en size hint.
- [ ] Squeeze expansion geeft breakout-watch, geen automatische entry.
- [ ] CVD/OBV divergence geeft conflict/warning.
- [ ] Spread/slippage slecht verlaagt execution confidence.

Acceptatie:

- [ ] Tests voor trend.
- [ ] Tests voor range.
- [ ] Tests voor breakout.
- [ ] Tests voor high_vol.
- [ ] Tests voor missing features.
- [ ] Tests voor unknown regime.

---

# Prioriteit 4 — Setup thesis en exit plan hints

Doel: elke trade moet uitlegbaar zijn per setup-type.

## 4.1 Setup thesis versterken

Gebruik bestaande modules indien aanwezig:

- `src/strategy/setupThesis.js`
- `src/runtime/tradeThesis.js`

Ondersteun:

- [ ] `trend_continuation`.
- [ ] `breakout_retest`.
- [ ] `mean_reversion`.
- [ ] `liquidity_sweep_reclaim`.
- [ ] `vwap_reclaim`.
- [ ] `range_grid`.
- [ ] `failed_breakout_avoidance`.

Output moet bevatten:

- [ ] `setupType`.
- [ ] `direction`.
- [ ] `thesis`.
- [ ] `evidenceFor`.
- [ ] `evidenceAgainst`.
- [ ] `requiredConfirmation`.
- [ ] `invalidatesIf`.
- [ ] `exitPlanHint`.
- [ ] `failureModesToWatch`.
- [ ] `riskNotes`.

Acceptatie:

- [ ] Tests voor elk setup type.
- [ ] Tests voor missing data.
- [ ] Tests voor unknown setup.
- [ ] Tests voor secret redaction.
- [ ] Geen live order behavior gewijzigd.

## 4.2 Exit plan hints versterken

Gebruik bestaande module indien aanwezig:

- `src/strategy/exitPlanHints.js`

Regels:

- [ ] Trend continuation: trailing na favorable move.
- [ ] Trend continuation: stop onder structure low / ATR.
- [ ] Breakout retest: invalidation onder retest low of terug in range.
- [ ] Mean reversion: TP rond VWAP/range mid.
- [ ] Liquidity sweep: invalidation onder sweep low.
- [ ] VWAP reclaim: invalidation onder VWAP/reclaim level.

Acceptatie:

- [ ] Tests toegevoegd.
- [ ] Output fallback-safe.
- [ ] Geen live execution behavior gewijzigd.

---

# Prioriteit 5 — Multi-position en portfolio crowding

Doel: meerdere posities blijven mogelijk, maar correlated exposure wordt beperkt.

## 5.1 Portfolio crowding

Gebruik bestaande module indien aanwezig:

- `src/risk/portfolioCrowding.js`

Output moet bevatten:

- [ ] `sameSymbolBlocked`.
- [ ] `sameClusterCount`.
- [ ] `sameStrategyFamilyCount`.
- [ ] `sameRegimeCount`.
- [ ] `btcBetaExposure`.
- [ ] `crowdingRisk`: low / medium / high / blocked.
- [ ] `sizeMultiplier`.
- [ ] `reasons`.
- [ ] `remainingSlots`.

Regels:

- [ ] Same symbol duplicate blockt nieuwe entry.
- [ ] Same cluster/regime verlaagt size.
- [ ] Extreme crowding blockt.
- [ ] Gezonde state respecteert `MAX_OPEN_POSITIONS`.
- [ ] Geen hardcoded max 1 positie.

Tests:

- [ ] Geen posities => low risk.
- [ ] Diverse posities => allowed.
- [ ] Same cluster => size omlaag.
- [ ] Same symbol => blocked.
- [ ] Exposure cap => blocked.

## 5.2 Post-reconcile multi-position

- [ ] Zoek hardcoded max 1 in post-reconcile/probation/risk modules.
- [ ] Gebruik `POST_RECONCILE_MAX_OPEN_POSITIONS`.
- [ ] Gebruik `POST_RECONCILE_MAX_NEW_ENTRIES_PER_CYCLE`.
- [ ] Tweede positie toestaan als limiet 2 is.
- [ ] Derde positie blokkeren als limiet 2 is.
- [ ] Na completed probation terug naar `MAX_OPEN_POSITIONS`.

Acceptatie:

- [ ] Multi-position werkt in gezonde state.
- [ ] Exchange safety rood blokkeert alle entries.
- [ ] Reconcile/manual_review/unresolved intent blokkeert alle entries.
- [ ] `npm test` slaagt.

---

# Prioriteit 6 — Execution, stop-limit en reconcile safety

Doel: beschermorders en exits betrouwbaarder maken zonder unsafe live acties.

## 6.1 Stop-loss-limit stuck detection

- [ ] Detecteer stop triggered maar limit order unfilled.
- [ ] Detecteer actuele bid onder stopLimit.
- [ ] Markeer `stop_limit_stuck`.
- [ ] Voeg operator next action toe.
- [ ] Live: geen blind market sell zonder expliciete bestaande safe policy.

Acceptatie:

- [ ] Tests voor triggered/unfilled stop-limit.
- [ ] Tests voor illiquide move door stopLimit.
- [ ] Manual review bij ambigu bewijs.

## 6.2 Liquidity-aware stop-limit gap

- [ ] Gap gebaseerd op spread.
- [ ] Gap gebaseerd op ATR/volatility.
- [ ] Gap gebaseerd op orderbook depth.
- [ ] Gap gebaseerd op slippage confidence.
- [ ] Illiquide coins krijgen bredere stopLimit gap.

Acceptatie:

- [ ] Tests voor liquid symbol.
- [ ] Tests voor illiquid symbol.
- [ ] Tests voor high volatility.
- [ ] Geen live safety versoepeld.

## 6.3 OCO / symbol filter tests

- [ ] SELL OCO geometry: takeProfit > current > stopTrigger >= stopLimit.
- [ ] Invalid geometry blockt.
- [ ] tickSize rounding tests.
- [ ] stepSize rounding tests.
- [ ] minNotional tests.
- [ ] fee accounting tests.
- [ ] slippage sign tests.

---

# Prioriteit 7 — Learning evidence pipeline

Doel: bestaande learningmodules verbinden zodat de bot beter leert van trades, veto's en exits.

## 7.1 Pipeline

Maak of update:

- [ ] `src/runtime/learningEvidencePipeline.js`.

Verbind indien beschikbaar:

- [ ] setupThesis / tradeThesis.
- [ ] exitQuality.
- [ ] vetoOutcome.
- [ ] failureLibrary.
- [ ] regimeConfusion.
- [ ] tradeAutopsy.
- [ ] tradeAttribution.
- [ ] paperLiveParity.

Output:

- [ ] `decisionId`.
- [ ] `tradeId`.
- [ ] `symbol`.
- [ ] `setupType`.
- [ ] `thesis`.
- [ ] `exitQuality`.
- [ ] `vetoOutcome`.
- [ ] `failureMode`.
- [ ] `regimeOutcome`.
- [ ] `paperLiveParity`.
- [ ] `replayPriority`.
- [ ] `recommendedAction`.
- [ ] `confidence`.

Tests:

- [ ] Winning trade.
- [ ] Losing trade.
- [ ] Bad veto.
- [ ] Reconcile uncertainty.
- [ ] Early exit.
- [ ] Execution drag.
- [ ] Missing data fallback.

Acceptatie:

- [ ] Diagnostics/learning-only.
- [ ] Geen automatische live promotie.
- [ ] `npm test` slaagt.

---

# Prioriteit 8 — Backtest realism en research integrity

Doel: backtests minder misleidend maken.

## 8.1 Backtest metrics

Maak of update:

- [ ] `src/backtest/backtestMetrics.js`.

Metrics:

- [ ] `expectancy`.
- [ ] `profitFactor`.
- [ ] `maxDrawdown`.
- [ ] `averageR`.
- [ ] `winRate`.
- [ ] `payoffRatio`.
- [ ] `feeDrag`.
- [ ] `slippageDrag`.
- [ ] `exposureTime`.
- [ ] `turnover`.
- [ ] `sampleSizeWarning`.

## 8.2 Backtest integrity

Maak of update:

- [ ] `src/backtest/backtestIntegrity.js`.

Checks:

- [ ] Geen NaN/Infinity.
- [ ] Impossible timestamps warning.
- [ ] Trade count mismatch warning.
- [ ] Missing configHash/dataHash warning indien beschikbaar.
- [ ] No-lookahead warning als feature timestamp ontbreekt.
- [ ] Missing fees/slippage warning.

Tests:

- [ ] Empty trades.
- [ ] Winning/losing mix.
- [ ] All winners.
- [ ] All losers.
- [ ] Fee drag.
- [ ] Slippage drag.
- [ ] Impossible timestamp.
- [ ] Missing hashes.

Acceptatie:

- [ ] Backtest metrics finite.
- [ ] Geen live behavior gewijzigd.
- [ ] `npm test` slaagt.

---

# Prioriteit 9 — Dashboard en operator cockpit

Doel: dashboard moet exact tonen waarom de bot wel/niet kan traden.

## 9.1 Readmodel/dashboard summaries

Voeg fallback-safe summaries toe:

- [ ] `tradingPathHealth`.
- [ ] `exchangeSafetySummary`.
- [ ] `portfolioCrowdingSummary`.
- [ ] `indicatorRegimeSummary`.
- [ ] `learningEvidenceSummary`.
- [ ] `backtestQualitySummary`.
- [ ] `antiOverfitSummary`.
- [ ] `dataFreshnessSummary`.
- [ ] `requestBudgetSummary`.

Dashboard moet tonen:

- [ ] Can it trade now?
- [ ] Why not?
- [ ] Stale source.
- [ ] Next action.
- [ ] Top blocker.
- [ ] Open position slots.
- [ ] Portfolio crowding.
- [ ] Exchange safety.
- [ ] Post-reconcile status.
- [ ] Data freshness.

Tests:

- [ ] Empty runtime.
- [ ] Partial runtime.
- [ ] Stale runtime.
- [ ] Blocked exchange safety.
- [ ] No decisions.
- [ ] Open positions missing price.
- [ ] Unknown status.
- [ ] Polling error fallback.

Acceptatie:

- [ ] Dashboard crasht niet bij partial data.
- [ ] Dashboard claimt nooit ready als hard safety blockt.
- [ ] Operator ziet concrete nextAction.

---

# Prioriteit 10 — Engineering hardening

Doel: codekwaliteit en CI verbeteren zonder trading behavior te wijzigen.

## 10.1 Tooling

Voeg toe indien ontbrekend:

- [ ] `eslint`.
- [ ] `prettier`.
- [ ] `c8`.

Scripts:

- [ ] `lint`.
- [ ] `format:check`.
- [ ] `coverage`.

## 10.2 CI

- [ ] Voeg `.github/workflows/test.yml` toe.
- [ ] Gebruik Node 22.
- [ ] Run `npm ci`.
- [ ] Run `npm test`.
- [ ] Run lint indien haalbaar.
- [ ] Run coverage indien haalbaar.
- [ ] CI mag geen Binance secrets nodig hebben.
- [ ] CI mag geen live exchange calls doen.

Acceptatie:

- [ ] Bestaande scripts blijven werken.
- [ ] Geen trading behavior gewijzigd.
- [ ] CI workflow bestaat.

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
