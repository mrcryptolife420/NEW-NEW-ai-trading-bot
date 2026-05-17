# Roadmap 05 - Codebase Consolidation en Feature Governance

## Doel

Voorkom dubbele implementaties, half-gewirede features en config drift door bestaande modules, feature audits en tests als bouwpoort te gebruiken voordat nieuw gedrag wordt toegevoegd.

## Analysebasis

Geinspecteerde hoofdmodules en tooling:

- `src/runtime/featureAudit.js`
- `src/runtime/featureWiringCompletionGate.js`
- `src/config/index.js`
- `src/config/schema.js`
- `src/config/validate.js`
- `src/config/mode.js`
- `scripts/analyze-dependencies.mjs`
- `scripts/check-imports.mjs`
- `scripts/check-env-duplicates.mjs`
- `docs/debug/inventory/*`
- `test/domainTestRegistry.js`

`npm run debug:deps` passeerde met 1471 dependency edges. `npm run feature:audit` rapporteert nog review-required items rond wiring, dashboard visibility en live-risk policies. De codebase heeft dus al governancebouwstenen; de roadmap maakt ze leidend.

## Niet dubbel bouwen

- Zoek eerst in `src/runtime/featureAudit.js` of een feature al bestaat of bewust config-only is.
- Zoek bestaande modules met `rg` of debug inventory voordat een nieuw bestand wordt toegevoegd.
- Breid bestaande registries uit: config defaults/schema/validate, reason registry, strategy registry, feature audit.
- Bouw geen nieuwe dashboard kaart zonder contract test en readmodel/snapshot eigenaar.
- Bouw geen nieuwe safety gate zonder relatie tot root blocker, risk manager of feature wiring gate.

## Fase 1 - Feature registry als bouwpoort

- Maak feature audit onderdeel van elke grotere feature-change checklist.
- Voeg per feature toe: eigenaar, activation stage, mode impact, dashboard visibility, tests, live behavior policy en rollback condition.
- Maak `module_exists_but_unused`, `config_only`, `missing_dashboard` en `missing_tests` harde review labels.
- Houd documented config-only flags expliciet gewaved met reden en deprecation plan.

## Fase 2 - Config drift verminderen

- Verbind `.env.example`, defaults, schema en validate met een generated config inventory.
- Laat onbekende en dubbele env keys blijven falen zoals nu, maar toon ook eigenaar en module wanneer mogelijk.
- Deprecate legacy umbrella flags alleen na operator config migratie.
- Voeg mode-specific config audit toe voor paper, demo en live.

## Fase 3 - Grootste modules verkleinen zonder rewrite

- Splits alleen wanneer eigenaarschap duidelijk is en tests bestaan.
- Prioriteit voor extracties uit `tradingBot.js`: dashboard summarizers, paper learning summaries, history coverage helpers en formatting helpers.
- Extracties moeten functioneel identiek zijn en eerst onder unit tests komen.
- Geen brede runtime rewrite; call path en persistence blijven gelijk.

## Fase 4 - Test ownership matrix

- Koppel elk domein aan een minimale testset: execution, risk, paper, dashboard, storage, config, replay, safety.
- Laat `domainTestRegistry.js` of debug inventory tonen welke modules zonder directe testdekking zijn.
- Voeg targeted tests toe bij high-risk wijzigingen in plaats van alleen full `npm test`.
- Voeg regressies toe voor bekende duplicatierisico's: paper/live broker split, duplicate env keys, dashboard DTO drift, feature flag zonder runtime refs.

## Fase 5 - Docs en inventory hygiene

- Houd `docs/debug/inventory` actueel na grote wijzigingen.
- Maak nieuwe roadmaps taakgericht en vervang/verwijder achterhaalde plannen na implementatie.
- Voeg in roadmaps altijd toe: bestaande module die hergebruikt wordt, verboden dubbelbouw, acceptatiecriteria en verificatie.
- Gebruik generated docs voor inventaris; gebruik handgeschreven docs voor beslissingen en operator context.

## Acceptatiecriteria

- Elke nieuwe feature heeft een bestaande of nieuwe registry entry met tests en mode policy.
- Geen nieuwe parallelle subsystemen zonder expliciete reden en verwijzing naar waarom bestaande modules niet volstaan.
- Config, docs, dashboard en tests bewegen mee met gedrag.
- Dependency analysis, imports, env checks en feature audit blijven groen.

## Validatiecommando's

- `npm run debug:deps`
- `npm run check:imports`
- `npm run check:env`
- `npm run feature:audit`
- `npm test`
