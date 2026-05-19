# Roadmap 37 - Config Policy Compiler And Env Transaction Journal

## Analysebasis
- `src/config/index.js`, `src/config/schema.js`, `src/config/envValidation.js`, `src/config/tradeProfiles.js` en `src/config/dashboardQuickSettings.js` beheren veel config.
- `.env.example` bevat honderden keys.
- Dashboard profile apply en quick settings schrijven env updates.
- `src/runtime/botManager.js` bevat profile apply en setup actions.

## Probleem
Config is krachtig maar groot. Profile apply en quick settings hebben een transaction model nodig waarmee de operator exact ziet welke policy verandert, wat live-sensitive is en hoe rollback werkt.

## Doel
Maak een config policy compiler die env keys groepeert tot beleidspakketten en iedere wijziging transactioneel journaled.

## Niet dubbel bouwen
Roadmap 15 ging over config/env integrity. Deze roadmap maakt een hogere policy compiler en transaction journal voor operator-wijzigingen.

## Scope
- Policy groups:
  - trading mode
  - paper learning
  - live safety
  - reconcile
  - market data
  - risk sizing
  - dashboard
  - AI learning
- Env transaction journal.
- Rollback.
- Dashboard diff.

## Fase 1 - Policy compiler
- Map env keys naar policy groups.
- Voeg metadata toe:
  - default
  - safe range
  - live sensitivity
  - restart required
  - dashboard editable
  - description

## Fase 2 - Transaction journal
- Iedere env write krijgt:
  - transaction id
  - actor
  - profile/quick setting
  - before values
  - after values
  - backup path
  - verification result
  - rollback command

## Fase 3 - Rollback support
- Voeg API toe:
  - list env transactions
  - preview rollback
  - apply rollback
- Rollback mag nooit secrets loggen.

## Fase 4 - Dashboard settings UX
- Inklapbare zijpanelen per policy group.
- Toon uitleg per setting:
  - wat doet dit
  - welke module gebruikt het
  - effect op trading
  - aanbevolen range
- Voeg search toe voor env keys.

## Fase 5 - Tests
- Env parser tests.
- Profile apply transaction tests.
- Rollback tests.
- Dashboard quick settings tests.

## Acceptatiecriteria
- Iedere dashboard env wijziging heeft rollback.
- Operator ziet exact welke policy verandert.
- Live-sensitive settings vereisen expliciete bevestiging.
- Geen secret komt in journal of dashboard.

## Verwachte files
- `src/config/envFile.js`
- `src/config/envValidation.js`
- `src/config/dashboardQuickSettings.js`
- `src/config/tradeProfiles.js`
- `src/runtime/botManager.js`
- `src/dashboard/public/app.js`
- `test/configOperatorMaintenance.tests.js`
- `test/configSchema.tests.js`

