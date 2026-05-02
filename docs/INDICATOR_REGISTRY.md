# Indicator Feature Registry

De indicator registry is een kleine, testbare laag tussen candle-features en strategy scoring. Het doel is niet om blind meer signalen toe te voegen, maar om indicatoren traceerbaar, normaliseerbaar en veilig te activeren.

## Ontwerp

De registry leeft in `src/strategy/indicatorFeatureRegistry.js` en levert een `indicatorRegistry` pack op binnen `computeMarketFeatures`.

Elk indicatorprofiel bevat:

- `id` en `label`
- vereiste `warmupCandles`
- genormaliseerde `outputs`
- relevante `strategyFamilies`
- relevante `regimes`
- kwaliteitsinformatie zoals ontbrekende features, stale status en candle coverage

Fase 1 bevat alleen:

- EMA ribbon compression/expansion
- VWAP bands
- RSI divergence
- MACD histogram divergence
- relative volume by UTC hour
- volatility-of-volatility

## Veilig gebruik

De registry wordt geconfigureerd via:

- `ENABLE_INDICATOR_FEATURE_REGISTRY=false`
- `ENABLE_INDICATOR_REGISTRY_PAPER_SCORING=false`

Als de registry uit staat, blijven de bestaande trading decisions functioneel gelijk. Als de registry aan staat, worden de indicatoren zichtbaar in feature/debug output. Strategy score-aanpassing gebeurt alleen wanneer `ENABLE_INDICATOR_REGISTRY_PAPER_SCORING=true` en `BOT_MODE=paper`.

Live mode krijgt geen threshold relief of score-uplift uit deze indicatoren. Live mag deze data alleen gebruiken voor observability en later, na bewijs, voor conservatieve risk drag.

## Featurekwaliteit

Elke registry output bevat:

- `status`: `ready`, `warmup`, `stale` of `missing`
- `qualityScore`
- `usedIndicators`
- `missingIndicators`
- `missingFeatures`
- `topPositiveFeatures`
- `topNegativeFeatures`

Dashboard- en report-lagen kunnen deze velden tonen zonder opnieuw indicatorlogica te berekenen.

## Nieuwe indicators veilig toevoegen

1. Voeg metadata toe aan `INDICATOR_FEATURE_DEFINITIONS`.
2. Implementeer de berekening als pure functie op candle fixtures.
3. Normaliseer output expliciet naar een begrensde schaal.
4. Voeg ontbrekende/warmup/stale handling toe.
5. Voeg deterministic tests toe met vaste candles.
6. Koppel pas daarna optioneel aan strategy scoring.
7. Houd live gedrag observability-only totdat paper evidence voldoende is.
