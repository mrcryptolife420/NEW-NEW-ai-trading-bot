# Roadmap 33 - Operator Action Simulator And Safe Controls

## Analysebasis
- `src/dashboard/actionRouteContracts.js` beschrijft gevoelige dashboard acties.
- `src/runtime/botManager.js` voert dashboard mutaties met locks uit.
- `src/runtime/tradingBot.js` heeft actions zoals force reconcile, probe-only, policy approval, flat resolution.
- `src/dashboard/public/app.js` toont quick actions maar niet altijd volledige before/after impact.

## Probleem
Operator acties zijn krachtig, maar de gebruiker ziet niet altijd vooraf wat een actie exact gaat wijzigen. Dat vergroot kans op verkeerd gebruik, vooral bij reconcile/manual review, profile apply, probe-only en policy transitions.

## Doel
Voeg een action simulator toe die iedere mutatie eerst als preview kan tonen met preflight, expected mutations, risk impact en rollback instructies.

## Niet dubbel bouwen
Roadmap 12 ging over API action contracts. Deze roadmap maakt daar een operator simulator en UX-control laag bovenop.

## Scope
- Preview endpoint voor mutaties.
- Before/after diff voor runtime/config/dashboard.
- Safety labels per actie.
- Confirmatieflow voor live-sensitive acties.
- Audit log met operator intent.

## Fase 1 - Action simulation contract
- Voeg `simulateAction(action, body)` toe.
- Contract output:
  - allowed
  - blockers
  - required confirmation
  - changed paths
  - affected symbols
  - risk impact
  - rollback option
  - safe alternative

## Fase 2 - Dashboard UX
- Iedere quick action krijgt:
  - Preview
  - Apply
  - Result
  - View diff
- Voor reconcile acties:
  - toon welke open order wordt geannuleerd
  - toon welke intent wordt resolved
  - toon of position lokaal gesloten wordt

## Fase 3 - Env/profile actions
- Profile apply preview toont:
  - env keys before/after
  - restart required
  - live risk acknowledgement status
  - keys die niet veranderd worden
- Quick settings krijgen transaction id en write verification.

## Fase 4 - Mutation safety
- Centraliseer in `managerMutationContract`.
- Voeg per action toe:
  - read-only preview
  - idempotency key
  - lock scope
  - max runtime duration
  - stale snapshot guard

## Fase 5 - Tests
- API contract tests voor preview/apply consistentie.
- Dashboard smoke tests voor action result card.
- Regression tests dat live-sensitive actions confirmation vereisen.

## Acceptatiecriteria
- Geen dashboard mutatie zonder preview-capable contract.
- Operator ziet exact wat reconcile gaat doen voordat het gebeurt.
- Mutaties schrijven audit events met before/after summary.
- Failed actions tonen concrete herstelstap.

## Verwachte files
- `src/dashboard/actionRouteContracts.js`
- `src/runtime/botManager.js`
- `src/runtime/managerMutationContract.js`
- `src/runtime/auditLogService.js`
- `src/dashboard/public/app.js`
- `test/operatorSafetyTooling.tests.js`
- `test/dashboardSnapshot.tests.js`

