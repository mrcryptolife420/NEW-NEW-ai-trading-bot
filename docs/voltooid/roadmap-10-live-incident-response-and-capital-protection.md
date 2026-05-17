# Roadmap 10 - Live Incident Response en Capital Protection

Status: voltooid  
Voltooid op: 2026-05-17  
Aanmaakdatum: 2026-05-17  
Analysebasis: volledige codebase-inspectie, `docs/`, `docs/voltooid/`, live preflight, exchange safety, alerting, incident replay, capital governor en REST-audit.

## Eerst gecontroleerd

Voor deze roadmap is eerst gekeken in:

- `docs/`
- `docs/voltooid/`

Er is al een voltooide roadmap voor paper/live execution safety parity. Deze roadmap bouwt daarom geen tweede execution engine of paper/live broker paritylaag. De focus ligt op live incident response, capital protection, reconcile runbooks, alert severity en operator drills bovenop bestaande live safeguards.

## Doel

Maak live mode nog beter bestuurbaar en herstelbaar zonder safeguards te verzwakken:

- live preflight blijft verplicht
- exchange truth drift wordt incidentwaardig zichtbaar
- capital protection krijgt runbooks en drills
- reconcile/panic/rollback acties worden evidence-based
- alert severity en routing worden consistenter
- incident replay kan live-risico's achteraf reconstrueren
- operator kan veilige actie nemen zonder te gokken

## Belangrijkste bestaande bouwstenen

- `src/runtime/livePreflight.js`: live preflight en production evidence.
- `src/runtime/liveReadinessAudit.js`: readiness blockers en operator actions.
- `src/runtime/exchangeSafetyReconciler.js`: exchange truth, paper/live mismatch, stale truth sanitizing en safety audit.
- `src/runtime/panicFlattenPlan.js`: panic flatten plan.
- `src/runtime/operatorAlertEngine.js`: operator alerts uit readiness, exchange safety, strategy retirement, execution cost en capital governor.
- `src/runtime/operatorAlertDispatcher.js`: alert dispatch plan en outbound dispatch.
- `src/runtime/operatorActionQueue.js`: action queue en blocking operator actions.
- `src/runtime/canaryReleaseGate.js`: canary promotion safety.
- `src/runtime/rollbackWatch.js`: rollback watch.
- `src/runtime/capitalGovernor.js`: exposure budgets, drawdown, red-day streak, daily ledger.
- `src/runtime/capitalPolicyEngine.js`: capital policy snapshot en optimizer context.
- `src/runtime/operatorRunbookGenerator.js`: runbook en action result.
- `src/runtime/incidentReport.js`: incident report write/summarize.
- `src/runtime/incidentReplayLab.js`: incident replay packs en determinism signature.
- `src/runtime/portfolioScenarioStress.js`: scenario stress voor open positions.

## Niet dubbel bouwen

Niet opnieuw bouwen:

- geen tweede live preflight
- geen tweede exchange reconciler
- geen execution bypass
- geen panic flatten executor zonder bestaande broker/risk checks
- geen capital governor naast `capitalGovernor`
- geen alerting stack naast `operatorAlertEngine` en dispatcher

Wel doen:

- incident severity en runbooks uitbreiden
- reconcile evidence beter structureren
- capital protection drills en simulations toevoegen
- canary/rollback evidence verbinden met incident response
- REST critical auditpunten koppelen aan live operationele risico's

## Bevindingen uit analyse

1. Live preflight en readiness audit bestaan, maar kunnen als incident-command workflow sterker aan alerts/runbooks gekoppeld worden.
2. `exchangeSafetyReconciler` is rijk en kritisch; operatoruitleg en incidentrapportage kunnen sterker rond reconcile outcomes.
3. `panicFlattenPlan` bestaat, maar hoort een plan/preflight/runbook te blijven voordat er uitvoerende live-acties komen.
4. `operatorAlertEngine` en dispatcher bestaan, maar severity, routing en acknowledgement lifecycle kunnen uitgebreider.
5. `capitalGovernor` en `capitalPolicyEngine` zijn aanwezig, maar capital kill-switch drills en dry-run protection checks ontbreken als expliciete workflow.
6. `incidentReport` en `incidentReplayLab` bieden fundament voor reconstructie, maar live incident packs kunnen rijker.
7. `rest:audit` rapporteert critical/review-required REST-classificaties; live incident response moet deze callsites als operationeel risico zichtbaar maken.

## Gewenste eindstaat

Bij elk live-relevant incident is zichtbaar:

- severity
- affected symbols/accounts
- exchange truth status
- open position risk
- capital exposure
- allowed actions
- denied actions
- runbook
- preflight result
- notification status
- incident report id
- replay pack id
- rollback/canary impact

## Fase 1 - Live Incident Command Contract

Taken:

- Definieer een `LiveIncidentCommandState` als read-only aggregatie uit bestaande modules.
- Bronnen:
  - live preflight
  - live readiness audit
  - exchange safety audit
  - capital governor
  - capital policy
  - operator action queue
  - alert engine
  - rollback watch
  - canary gate
  - incident report
- States:
  - normal
  - watch
  - degraded
  - operator_review
  - entry_freeze
  - exit_only
  - panic_plan_required
  - live_locked

Acceptatiecriteria:

- State is afgeleid, geen tweede live truth.
- State kan zonder mutatie worden gebouwd.
- State bevat reasons en allowed actions.

## Fase 2 - Reconcile Runbooks en Evidence

Taken:

- Breid exchange safety output uit met operatorgerichte reconcile classes:
  - clean
  - stale_exchange_truth
  - position_mismatch
  - open_order_mismatch
  - paper_lifecycle_pending
  - manual_review_required
  - critical_unknown
- Koppel elke class aan runbook en preflight.
- Voeg incident report fields toe voor reconcile decisions.

Acceptatiecriteria:

- Reconcile-issues zijn niet alleen counters.
- Manual review bevat exacte reden en next action.
- Resolved state kan stale flags opruimen zonder nieuwe drift te maskeren.

## Fase 3 - Capital Protection Drills

Taken:

- Voeg dry-run drills toe:
  - daily loss lock
  - red-day streak lock
  - concentration breach
  - event cluster exposure
  - panic flatten plan
  - exit-only mode
- Gebruik `capitalGovernor`, `capitalPolicyEngine`, `portfolioScenarioStress` en `panicFlattenPlan`.
- Maak drills zichtbaar in report/dashboard als diagnostic, niet als trade action.

Acceptatiecriteria:

- Drill voert geen echte orders uit.
- Drill toont welke safeguard zou triggeren.
- Live mode mag alleen strenger worden door drill output.

## Fase 4 - Alert Severity, Routing en Acknowledgement

Taken:

- Normaliseer severity levels:
  - info
  - warning
  - high
  - critical
  - page_now
- Voeg acknowledgement lifecycle toe:
  - new
  - sent
  - acknowledged
  - snoozed
  - recovered
  - escalated
- Breid dispatcher plan uit met:
  - target channel
  - retry policy
  - redaction status
  - cooldown reason
  - last sent
- Houd secrets altijd geredacteerd.

Acceptatiecriteria:

- Critical live alerts verdwijnen niet zonder recovered/ack.
- Dispatch failures zijn zichtbaar.
- Alert spam wordt beperkt met reasoned cooldown.

## Fase 5 - Canary en Rollback Incident Integration

Taken:

- Koppel `canaryReleaseGate` en `rollbackWatch` aan incident command state.
- Incident triggers:
  - canary drift
  - failure spike
  - calibration drift
  - paper/live parity warning
  - operator review required
- Maak rollback runbook en required evidence expliciet.

Acceptatiecriteria:

- Canary failure kan live promotion blokkeren.
- Rollback is uitlegbaar en auditable.
- Missing rollback evidence blokkeert promotion.

## Fase 6 - Incident Replay Packs

Taken:

- Breid `incidentReplayLab` en `incidentReport` uit voor live incident packs:
  - recent decisions
  - exchange truth summary
  - open positions
  - alerts
  - capital state
  - data degradation
  - reconcile audit
  - config hash
- Voeg determinism signature toe voor incident regressie.
- Maak report summary voor recente incidenten.

Acceptatiecriteria:

- Incident kan achteraf gereconstrueerd worden zonder secrets.
- Replay pack is geschikt voor regressietest.
- Incident summary onderscheidt live, paper en demo.

## Fase 7 - REST Critical Operations Board

Taken:

- Gebruik `rest:audit` output om live-kritieke REST callsites te tracken.
- Classificeer:
  - must be stream backed
  - must be cache/static
  - must be request-budget guarded
  - acceptable critical reconcile with reason
- Toon live operationele risico's in report/dashboard.

Acceptatiecriteria:

- Nieuwe critical REST callsites vereisen classificatie.
- Critical reconcile calls hebben runbook/evidence.
- REST pressure kan entry freeze of degraded mode triggeren.

## New features

- Live Incident Command State.
- Reconcile Runbook Matrix.
- Capital Protection Drill Suite.
- Alert Acknowledgement Lifecycle.
- Canary/Rollback Incident Integration.
- Live Incident Replay Packs.
- REST Critical Operations Board.

## Verificatiecommando's

Minimaal:

- `npm.cmd run check:imports`
- `npm.cmd run debug:api-contracts`
- `npm.cmd run rest:audit`
- `npm.cmd test`

Aanvullend:

- `npm.cmd run doctor`
- `npm.cmd run report`
- `npm.cmd run once`
- targeted live preflight tests zonder echte live orders

## Definitie van klaar

Deze roadmap is pas klaar wanneer:

- live incident state uit bestaande truth wordt opgebouwd
- reconcile runbooks operatorgericht zijn
- capital protection drills dry-run en zichtbaar zijn
- alert acknowledgement voorkomt stille critical failures
- canary/rollback aan incident flow gekoppeld is
- live incident replay packs regressietests ondersteunen
- REST critical operations zijn geclassificeerd

Na volledige uitvoering en verificatie moet dit bestand worden verplaatst naar `docs/voltooid/`.
