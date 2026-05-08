# Extra Production-Ready Roadmap voor de AI Trading Bot

Doel:
- Aanvullingen bovenop de bestaande roadmaps.
- Focus op productiegebruik, veiligheid, herstelbaarheid, monitoring, releaseproces en operatorcontrole.
- Geen dubbele taken rond neural basis, autonome neural replay, Windows GUI of fast execution.
- Alles afvinkbaar maken als praktische checklist.

Belangrijk:
Deze taken maken de bot niet per se slimmer, maar wel veiliger, betrouwbaarder en beter beheerbaar.

---

## 1. Production Readiness Gate

### Doel

Voordat de bot live mag draaien, moet er één centrale productiecheck zijn.

### Taken

- [ ] Maak `src/ops/productionReadinessGate.js`.
- [ ] Check bot mode.
- [ ] Check live acknowledgement.
- [ ] Check exchange protection.
- [ ] Check API key aanwezigheid zonder secrets te tonen.
- [ ] Check account permissions.
- [ ] Check runtime directory schrijfbaar.
- [ ] Check state backup status.
- [ ] Check laatste succesvolle backup.
- [ ] Check laatste succesvolle restore-test.
- [ ] Check dashboard/API bereikbaar.
- [ ] Check stream health.
- [ ] Check REST health.
- [ ] Check user stream health.
- [ ] Check open positions protection.
- [ ] Check unresolved intents.
- [ ] Check manual review flags.
- [ ] Check active alerts.
- [ ] Check neural live influence status.
- [ ] Check fast execution status.
- [ ] Check current risk budget.
- [ ] Check daily drawdown.
- [ ] Check config profile.
- [ ] Geef status: `ready`, `warning`, `blocked`.

### CLI

```bash
node src/cli.js ops:readiness
```

### Acceptance criteria

- [ ] Live mode kan optioneel geblokkeerd worden als readiness `blocked` is.
- [ ] GUI/dashboard toont exact waarom readiness niet ready is.
- [ ] Readiness gate opent nooit trades.
- [ ] Readiness gate schrijft geen secrets naar logs.

---

## 2. Safe Release Process

### Doel

Nieuwe code of instellingen mogen niet direct gevaarlijk live draaien.

### Taken

- [ ] Maak release channels: `dev`, `paper`, `live-observe`, `live-conservative`.
- [ ] Maak `RELEASE_CHANNEL` config.
- [ ] Blokkeer live-only features in `dev`.
- [ ] Blokkeer experimental features buiten `paper`.
- [ ] Vereis release notes voor live release.
- [ ] Voeg release checklist toe.
- [ ] Voeg migration checklist toe.
- [ ] Voeg rollback target toe per release.
- [ ] Sla huidige commit/config snapshot op bij bot start.
- [ ] Toon actieve release channel in dashboard.
- [ ] Maak command `ops:release-check`.

### Release checklist

- [ ] Tests groen.
- [ ] Config valid.
- [ ] State migration oké.
- [ ] Backup recent.
- [ ] Restore test recent.
- [ ] No critical alerts.
- [ ] No unresolved intents.
- [ ] Paper smoke run geslaagd.
- [ ] Live observe geslaagd indien live release.
- [ ] Rollback plan bestaat.

---

## 3. Canary Deployment voor Trading Logic

### Doel

Nieuwe tradinglogica eerst klein testen.

### Taken

- [ ] Maak `CANARY_TRADING_ENABLED=false`.
- [ ] Maak `CANARY_MAX_TRADES_PER_DAY=1`.
- [ ] Maak `CANARY_MAX_POSITION_FRACTION=0.02`.
- [ ] Maak `CANARY_ALLOWED_SYMBOLS`.
- [ ] Maak `CANARY_ALLOWED_STRATEGIES`.
- [ ] Laat canary alleen paper of live observe beginnen.
- [ ] Laat canary nooit hard safety blockers overrulen.
- [ ] Toon canary trades apart in dashboard.
- [ ] Meet canary PnL apart.
- [ ] Meet canary drawdown apart.
- [ ] Auto-disable canary bij loss streak.
- [ ] Auto-disable canary bij slippage breach.
- [ ] Auto-disable canary bij data quality issue.

### Acceptance criteria

- [ ] Nieuwe logica kan klein getest worden.
- [ ] Canary kan niet volledig kapitaal gebruiken.
- [ ] Canary status is zichtbaar.
- [ ] Canary heeft eigen rollback.

---

## 4. Disaster Recovery Plan

### Doel

Als runtime/state corrupt raakt of machine crasht, moet herstel duidelijk zijn.

### Taken

- [ ] Maak `docs/DISASTER_RECOVERY.md`.
- [ ] Beschrijf herstel bij corrupt runtime.json.
- [ ] Beschrijf herstel bij corrupt journal.json.
- [ ] Beschrijf herstel bij ontbrekende model registry.
- [ ] Beschrijf herstel bij half geschreven snapshot.
- [ ] Beschrijf herstel bij open live position na crash.
- [ ] Beschrijf herstel bij unresolved execution intent.
- [ ] Beschrijf herstel bij dashboard/API failure.
- [ ] Beschrijf herstel bij websocket failure.
- [ ] Beschrijf herstel bij Binance REST ban.
- [ ] Beschrijf herstel bij API key compromise.
- [ ] Maak command `ops:recover-preview`.
- [ ] Maak command `ops:recover-apply` met confirm flag.
- [ ] Maak recovery dry-run standaard.
- [ ] Toon recovery plan in GUI/dashboard.

### Acceptance criteria

- [ ] Recovery preview verandert niets.
- [ ] Recovery apply vereist expliciete bevestiging.
- [ ] Recovery schrijft audit event.
- [ ] Recovery kan open live positions niet per ongeluk vergeten.

---

## 5. Backup en Restore Drills

### Doel

Backups zijn pas waardevol als restore regelmatig getest wordt.

### Taken

- [ ] Maak `ops:backup-now`.
- [ ] Maak `ops:restore-test`.
- [ ] Restore test draait naar tijdelijke directory.
- [ ] Restore test valideert runtime schema.
- [ ] Restore test valideert journal schema.
- [ ] Restore test valideert model registry.
- [ ] Restore test valideert neural state.
- [ ] Restore test valideert open position consistency.
- [ ] Restore test geeft rapport.
- [ ] Dashboard toont laatste restore-test.
- [ ] Production readiness waarschuwt als restore-test te oud is.

### Acceptance criteria

- [ ] Laatste backup zichtbaar.
- [ ] Laatste restore-test zichtbaar.
- [ ] Restore-test gebruikt nooit live broker.
- [ ] Restore-test kan veilig op draaiende machine.

---

## 6. API Key Security en Rotation

### Doel

API keys veilig beheren en regelmatig kunnen roteren.

### Taken

- [ ] Maak `ops:keys-check`.
- [ ] Detecteer of API keys in `.env` staan.
- [ ] Waarschuw als keys in logs voorkomen.
- [ ] Waarschuw als keys in incident exports voorkomen.
- [ ] Voeg redaction helper toe.
- [ ] Voeg key fingerprint toe zonder key te tonen.
- [ ] Toon key age indien bekend.
- [ ] Maak API key rotation checklist.
- [ ] Maak dry-run voor nieuwe key.
- [ ] Test nieuwe key met read-only endpoint.
- [ ] Test trade permission apart.
- [ ] Blokkeer live als key permissions onverwacht zijn.
- [ ] Adviseer withdrawal permission uit te laten.
- [ ] Adviseer IP whitelist indien mogelijk.

### Acceptance criteria

- [ ] Secrets verschijnen nooit in dashboard.
- [ ] Secrets verschijnen nooit in audit export.
- [ ] Key rotation kan zonder codewijziging.
- [ ] Bot detecteert permission mismatch.

---

## 7. Account Permission Guard

### Doel

De bot mag alleen draaien met verwachte exchange-permissies.

### Taken

- [ ] Check account `canTrade`.
- [ ] Check spot permission.
- [ ] Check margin/futures permissions.
- [ ] Check of withdrawal permission actief is.
- [ ] Waarschuw als onnodige permission actief is.
- [ ] Blokkeer short/futures logic als regio/account dat niet toelaat.
- [ ] Blokkeer live als accounttype onverwacht is.
- [ ] Toon permissions in readiness report.
- [ ] Audit permission changes.

### Acceptance criteria

- [ ] Live trading stopt als permissions onverwacht veranderen.
- [ ] Bot gebruikt alleen toegestane capability.
- [ ] Dashboard toont permission status zonder secrets.

---

## 8. Incident Package Export

### Doel

Bij problemen één pakket kunnen maken om te analyseren wat er gebeurde.

### Taken

- [ ] Maak `ops:incident-export`.
- [ ] Export runtime snapshot.
- [ ] Export journal summary.
- [ ] Export laatste audit events.
- [ ] Export open positions.
- [ ] Export unresolved intents.
- [ ] Export exchange safety state.
- [ ] Export stream health.
- [ ] Export latency report.
- [ ] Export config snapshot zonder secrets.
- [ ] Export neural black box records indien relevant.
- [ ] Export fast execution queue indien relevant.
- [ ] Export dashboard health.
- [ ] Export recent errors.
- [ ] Redact secrets automatisch.
- [ ] Maak zip-bestand.
- [ ] Toon export path.

### Acceptance criteria

- [ ] Incident export bevat geen API secrets.
- [ ] Incident export is lokaal te openen.
- [ ] Incident export kan gebruikt worden voor bug reports.
- [ ] Incident export wijzigt geen bot state.

---

## 9. Operator Runbooks

### Doel

Voor veelvoorkomende problemen moet er een duidelijke handleiding zijn.

### Runbooks

- [ ] Bot start niet.
- [ ] Dashboard opent niet.
- [ ] Binance API faalt.
- [ ] Websocket disconnected.
- [ ] User stream disconnected.
- [ ] Runtime corrupt.
- [ ] Journal corrupt.
- [ ] Open position zonder protective order.
- [ ] Reconcile mismatch.
- [ ] Unresolved execution intent.
- [ ] Rate limit pressure.
- [ ] Live mode blocked.
- [ ] Neural model rollback nodig.
- [ ] Fast execution disable nodig.
- [ ] Panic pause nodig.
- [ ] API key compromise.

### Taken

- [ ] Maak `docs/RUNBOOKS.md`.
- [ ] Voeg per runbook symptomen toe.
- [ ] Voeg per runbook checks toe.
- [ ] Voeg per runbook veilige commands toe.
- [ ] Voeg per runbook verboden acties toe.
- [ ] Link runbooks in GUI/dashboard.
- [ ] Toon relevante runbook bij alert.

---

## 10. Alert Routing en Escalation

### Doel

Niet elke alert is even belangrijk. Kritieke alerts moeten anders behandeld worden.

### Alert levels

- [ ] `info`
- [ ] `warning`
- [ ] `high`
- [ ] `critical`
- [ ] `panic`

### Taken

- [ ] Maak alert severity routing.
- [ ] Critical alert pauzeert nieuwe entries.
- [ ] Panic alert schakelt fast execution uit.
- [ ] Panic alert schakelt neural influence uit.
- [ ] Alert krijgt owner/status.
- [ ] Alert krijgt acknowledged timestamp.
- [ ] Alert krijgt resolved timestamp.
- [ ] Alert krijgt runbook link.
- [ ] Alert krijgt recommended action.
- [ ] Voeg alert cooldown toe tegen spam.
- [ ] Voeg alert digest toe.

### Acceptance criteria

- [ ] Critical alerts verdwijnen niet zonder resolve.
- [ ] Entry blocking alerts zijn duidelijk.
- [ ] Alerts kunnen niet stil genegeerd worden bij live.

---

## 11. Audit Retention en Query

### Doel

Audit logs moeten bruikbaar blijven en niet alleen groeien.

### Taken

- [ ] Maak audit retention policy.
- [ ] Archive oude audit logs.
- [ ] Index audit logs per type.
- [ ] Query audit logs per symbol.
- [ ] Query audit logs per tradeTraceId.
- [ ] Query audit logs per alert.
- [ ] Query audit logs per operator action.
- [ ] Query audit logs per neural influence.
- [ ] Query audit logs per live order.
- [ ] Maak `ops:audit-query`.
- [ ] Maak `ops:audit-summary`.

### Acceptance criteria

- [ ] Audit blijft snel doorzoekbaar.
- [ ] Oude logs worden niet zomaar verwijderd zonder archive.
- [ ] Live actions blijven traceerbaar.

---

## 12. Config Snapshot en Diff

### Doel

Kunnen zien welke config wijziging mogelijk gedrag veranderde.

### Taken

- [ ] Maak config snapshot bij startup.
- [ ] Maak config snapshot bij elke reload.
- [ ] Redact secrets.
- [ ] Maak config hash.
- [ ] Maak config diff tussen runs.
- [ ] Toon risk-impacting changes.
- [ ] Toon execution-impacting changes.
- [ ] Toon neural-impacting changes.
- [ ] Toon fast-execution-impacting changes.
- [ ] Maak `ops:config-diff`.
- [ ] Blokkeer live als risk-impacting config wijzigde zonder review.

### Acceptance criteria

- [ ] Je kan achteraf zien welke config actief was bij een trade.
- [ ] Config diffs zijn zichtbaar in incident export.
- [ ] Secrets worden nooit getoond.

---

## 13. Data Retention Policy

### Doel

Duidelijk bepalen wat bewaard wordt, hoe lang, en waarvoor.

### Datatypes

- [ ] Runtime snapshots.
- [ ] Journal records.
- [ ] Audit logs.
- [ ] Data recorder frames.
- [ ] Neural black box records.
- [ ] Replay records.
- [ ] Market history.
- [ ] Incident exports.
- [ ] Backup bundles.
- [ ] Dashboard cached data.

### Taken

- [ ] Maak retention policy per datatype.
- [ ] Maak hot storage.
- [ ] Maak cold archive.
- [ ] Maak cleanup job.
- [ ] Maak archive integrity check.
- [ ] Maak storage usage report.
- [ ] Waarschuw als disk bijna vol is.
- [ ] Blokkeer training als data archive corrupt is.
- [ ] Voeg command `ops:storage-report` toe.

---

## 14. Disk, Memory en CPU Watchdog

### Doel

De bot mag niet onveilig worden door machine resources.

### Taken

- [ ] Monitor disk usage.
- [ ] Monitor memory usage.
- [ ] Monitor CPU usage.
- [ ] Monitor event loop lag.
- [ ] Monitor file write errors.
- [ ] Monitor open file handles indien mogelijk.
- [ ] Monitor dashboard response time.
- [ ] Monitor training job resource usage.
- [ ] Pause neural training bij hoge CPU/memory.
- [ ] Pause new entries bij disk write failures.
- [ ] Alert operator bij resource pressure.

### Acceptance criteria

- [ ] Bot blijft niet handelen als state niet veilig geschreven kan worden.
- [ ] Training kan trading runtime niet verstikken.
- [ ] Resource pressure zichtbaar in dashboard.

---

## 15. Time Sync en Clock Health Guard

### Doel

Trading en exchange requests zijn gevoelig voor tijdsafwijking.

### Taken

- [ ] Check lokale klok.
- [ ] Check exchange server time drift.
- [ ] Check clock sync age.
- [ ] Check request timestamp failures.
- [ ] Alert bij drift.
- [ ] Blokkeer live entries bij onveilige drift.
- [ ] Toon clock health in readiness.
- [ ] Sla drift op in incident export.

### Acceptance criteria

- [ ] Live orders worden niet geplaatst bij onbetrouwbare clock.
- [ ] Clock issues zijn duidelijk zichtbaar.

---

## 16. Multi-Mode Dry Run

### Doel

Elke belangrijke actie eerst kunnen previewen.

### Dry-run acties

- [ ] Start live mode dry-run.
- [ ] Fast execution dry-run.
- [ ] Neural live autonomy dry-run.
- [ ] Reconcile apply dry-run.
- [ ] Config change dry-run.
- [ ] Recovery apply dry-run.
- [ ] Model promotion dry-run.
- [ ] Order execution dry-run.
- [ ] Panic action dry-run.

### Taken

- [ ] Maak uniforme dry-run response.
- [ ] Toon wat zou veranderen.
- [ ] Toon safety impact.
- [ ] Toon audit event preview.
- [ ] Toon rollback plan.
- [ ] Geen state mutatie tijdens dry-run.

---

## 17. Trade Lifecycle Contract Tests

### Doel

Elke trade moet door dezelfde gecontroleerde states gaan.

### Lifecycle states

- [ ] candidate_seen
- [ ] decision_scored
- [ ] risk_checked
- [ ] intent_created
- [ ] order_submitted
- [ ] order_acknowledged
- [ ] filled
- [ ] protection_placed
- [ ] position_managed
- [ ] exit_intent_created
- [ ] exit_submitted
- [ ] closed
- [ ] journaled
- [ ] learned

### Taken

- [ ] Maak lifecycle contract.
- [ ] Test paper lifecycle.
- [ ] Test live lifecycle met mock broker.
- [ ] Test partial fill lifecycle.
- [ ] Test rejected order lifecycle.
- [ ] Test ambiguous intent lifecycle.
- [ ] Test protective order failure lifecycle.
- [ ] Test crash recovery lifecycle.

### Acceptance criteria

- [ ] Geen trade zonder audit trail.
- [ ] Geen open position zonder lifecycle state.
- [ ] Geen live position zonder protection check.

---

## 18. Synthetic Exchange Test Harness

### Doel

Exchange responses testen zonder echte Binance orders.

### Taken

- [ ] Maak synthetic exchange client.
- [ ] Simuleer successful order.
- [ ] Simuleer rejected order.
- [ ] Simuleer timeout.
- [ ] Simuleer duplicate order.
- [ ] Simuleer partial fill.
- [ ] Simuleer OCO failure.
- [ ] Simuleer rate limit.
- [ ] Simuleer server time error.
- [ ] Simuleer websocket fill event.
- [ ] Simuleer missing fill event.
- [ ] Gebruik harness in tests.
- [ ] Gebruik harness in replay stress.

### Acceptance criteria

- [ ] LiveBroker logic kan getest worden zonder exchange.
- [ ] Edge cases zijn reproduceerbaar.
- [ ] Regression tests dekken order failure paths.

---

## 19. Strategy Contract Registry

### Doel

Elke strategie moet aan dezelfde minimale contractregels voldoen.

### Contractregels

- [ ] Heeft strategy ID.
- [ ] Heeft strategy family.
- [ ] Heeft allowed regimes.
- [ ] Heeft blocked regimes.
- [ ] Heeft minimum data quality.
- [ ] Heeft max spread.
- [ ] Heeft max volatility.
- [ ] Heeft preferred execution style.
- [ ] Heeft stop logic.
- [ ] Heeft exit logic.
- [ ] Heeft risk profile.
- [ ] Heeft paper/live eligibility.
- [ ] Heeft retirement status.

### Taken

- [ ] Maak strategy contract schema.
- [ ] Valideer strategieën bij startup.
- [ ] Blokkeer strategie zonder contract.
- [ ] Toon strategy contract in dashboard.
- [ ] Voeg strategy contract diff toe bij wijzigingen.

---

## 20. Portfolio Exposure Heatmap

### Doel

Operator ziet direct waar risico geconcentreerd zit.

### Heatmap dimensies

- [ ] Symbol exposure.
- [ ] Sector/cluster exposure.
- [ ] Strategy family exposure.
- [ ] Regime exposure.
- [ ] Session exposure.
- [ ] Correlation exposure.
- [ ] Neural-attributed exposure.
- [ ] Fast-execution-attributed exposure.
- [ ] Open risk.
- [ ] Stop distance risk.

### Taken

- [ ] Maak exposure heatmap data.
- [ ] Toon heatmap in dashboard/GUI.
- [ ] Voeg exposure warnings toe.
- [ ] Blokkeer nieuwe entries bij heatmap breach.
- [ ] Voeg heatmap snapshot toe aan incident export.

---

## 21. Operator Training Mode

### Doel

Nieuwe gebruiker kan veilig leren met de bot zonder echte trades.

### Taken

- [ ] Maak `TRAINING_MODE=true`.
- [ ] Blokkeer live trading.
- [ ] Gebruik synthetic exchange.
- [ ] Toon guided walkthrough.
- [ ] Toon uitleg bij blockers.
- [ ] Toon voorbeeldincidenten.
- [ ] Toon voorbeeldreplay.
- [ ] Laat operator fake approvals oefenen.
- [ ] Laat operator recovery oefenen.
- [ ] Laat operator rollback oefenen.

### Acceptance criteria

- [ ] Training mode kan geen echte orders plaatsen.
- [ ] Training mode gebruikt geen echte API secrets.
- [ ] Training mode helpt operator workflows leren.

---

## 22. Tax en Accounting Export

### Doel

Tradingdata bruikbaar maken voor administratie.

### Taken

- [ ] Export closed trades naar CSV.
- [ ] Export fees.
- [ ] Export realized PnL.
- [ ] Export timestamps.
- [ ] Export symbol/base/quote.
- [ ] Export broker mode.
- [ ] Export execution venue.
- [ ] Export trade IDs.
- [ ] Maak maandrapport.
- [ ] Maak jaarrapport.
- [ ] Redact interne debugvelden indien nodig.

### Acceptance criteria

- [ ] Paper en live zijn gescheiden.
- [ ] Live trade export is compleet genoeg voor administratie.
- [ ] Export wijzigt geen state.

---

## 23. Privacy en Local-Only Mode

### Doel

Zoveel mogelijk lokaal houden.

### Taken

- [ ] Maak overzicht welke data lokaal blijft.
- [ ] Maak overzicht welke externe API's gebruikt worden.
- [ ] Maak local-only mode.
- [ ] Blokkeer externe non-exchange providers in local-only mode.
- [ ] Blokkeer telemetry upload.
- [ ] Dashboard toont local-only status.
- [ ] Incident export blijft lokaal.
- [ ] Geen cloud sync zonder expliciete enable.

---

## 24. Final Production Checklist

Gebruik deze checklist voordat live trading wordt aangezet.

- [ ] Production readiness is `ready`.
- [ ] Release channel is correct.
- [ ] Backup recent.
- [ ] Restore-test recent.
- [ ] No critical alerts.
- [ ] No unresolved intents.
- [ ] No manual review positions.
- [ ] Exchange protection aan.
- [ ] API permissions correct.
- [ ] Withdrawal permission uit.
- [ ] Clock health oké.
- [ ] Stream health oké.
- [ ] REST health oké.
- [ ] User stream health oké.
- [ ] Position protection monitor groen.
- [ ] Fast execution status bewust gekozen.
- [ ] Neural influence status bewust gekozen.
- [ ] Config diff reviewed.
- [ ] Risk budget reviewed.
- [ ] Emergency pause getest.
- [ ] Incident export werkt.
- [ ] Operator runbooks beschikbaar.
