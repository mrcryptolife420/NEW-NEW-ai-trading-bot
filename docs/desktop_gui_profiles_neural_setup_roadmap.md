# Uitgebreide roadmap: GUI wit scherm, profiles, `.env`, setup wizard en neural paper mode

Status: implemented in this pass, with manual Windows install smoke still operator-run only.  
Repo: `mrcryptolife420/NEW-NEW-ai-trading-bot`  
Doel: Windows Electron GUI betrouwbaar maken en profiles/neural setup aantoonbaar laten werken  
Datum: 2026-05-08

---

## Samenvatting

De problemen lijken samen te hangen:

- De geïnstalleerde EXE toont wit scherm omdat de Electron app `http://127.0.0.1:3011` laadt, maar de embedded dashboard-server waarschijnlijk faalt of niet klaar is.
- De desktop app gebruikt in packaged mode waarschijnlijk `resources\bot` als bot-root, niet automatisch jouw GitHub-map.
- De installer neemt `.env.example` mee, maar sluit `.env` uit. Daardoor kan de geïnstalleerde app een andere `.env` gebruiken dan jij bekijkt.
- De backend heeft wel profile-apply logica die `.env` schrijft, maar de GUI moet tonen welk `.env` pad actief is en of de write echt gelukt is.
- De bestaande paper profiles zetten neural safety-flags, maar activeren neural self-tuning/continuous learning niet volledig.
- De GUI heeft een `Beginner setup` sectie, maar geen echte wizard die je stap voor stap begeleidt.

---

## Belangrijkste vermoedelijke oorzaken

### 1. Wit scherm

Electron doet nu conceptueel:

```js
mainWindow.loadURL("http://127.0.0.1:3011")
```

Als de dashboard-server niet start, zie je wit. Er moet een zichtbare fallback error page komen.

### 2. `.env` verandert niet waar jij kijkt

In packaged mode wordt waarschijnlijk dit gebruikt:

```text
...\resources\bot\.env
```

of een andere packaged/userData locatie, terwijl jij kijkt naar:

```text
C:\Users\highlife\Documents\GitHub\Codex-ai-trading-bot-\.env
```

### 3. Profile apply is niet transparant

De backend schrijft naar `config.envPath`, maar de GUI toont niet duidelijk:

- welk bestand aangepast is
- welke keys aangepast zijn
- of de write geverifieerd is
- of de app daarna opnieuw geladen is

### 4. Neural network is niet als profiel beschikbaar

De defaults bevatten neural instellingen, maar veel belangrijke flags staan veilig uit. Er moet een expliciet profiel komen:

```text
paper-neural-learning
paper-neural-demo-spot
```

---

# P0 — Wit scherm definitief oplossen

## Doel

De GUI mag nooit meer stil wit blijven. Bij elke fout moet je exact zien wat misgaat.

## Bestanden

- `desktop/main.js`
- `desktop/package.json`
- `src/dashboard/server.js`
- `src/dashboard/public/index.html`
- `src/dashboard/public/app.js`

## Checklist

- [ ] Voeg startup logging toe in `desktop/main.js`.
- [ ] Log naar `%APPDATA%\Codex AI Trading Bot\logs\desktop-main.log`.
- [ ] Log:
  - [ ] `app.isPackaged`
  - [ ] `app.getAppPath()`
  - [ ] `process.resourcesPath`
  - [ ] resolved `botRoot`
  - [ ] resolved `dashboardUrl`
  - [ ] resolved `serverPath`
  - [ ] bestaat `src\dashboard\server.js`
  - [ ] bestaat `src\dashboard\public\index.html`
  - [ ] bestaat `src\dashboard\public\app.js`
  - [ ] actief `.env` pad
  - [ ] actief project-root pad
- [ ] Voeg `waitForDashboard()` toe vóór `loadURL`.
- [ ] Check `GET /api/health` of `/` voordat dashboard geladen wordt.
- [ ] Retry 10-15 seconden.
- [ ] Als server faalt: toon error HTML in Electron.
- [ ] Error HTML moet tonen:
  - [ ] foutmelding
  - [ ] stack
  - [ ] botRoot
  - [ ] envPath
  - [ ] dashboardUrl
  - [ ] knop `Retry`
  - [ ] knop `Open logs`
  - [ ] knop `Open active .env`
- [ ] Voeg `did-fail-load`, `console-message`, `render-process-gone` listeners toe.
- [ ] Voeg debug mode toe:

```powershell
$env:DESKTOP_DEBUG="1"
& "$env:LOCALAPPDATA\Programs\Codex AI Trading Bot\Codex AI Trading Bot.exe"
```

## Acceptatie

- [ ] EXE opent geen wit scherm meer.
- [ ] Bij server-fout verschijnt een duidelijke foutpagina.
- [ ] Logs zijn te openen vanuit tray/menu.
- [ ] De foutpagina toont het exacte actieve `.env` pad.

---

# P0 — Actieve project-root en `.env` pad fixen

## Doel

De GUI moet duidelijk en betrouwbaar één actieve configuratie gebruiken.

## Gewenste oplossing

Maak onderscheid tussen:

| Type | Voorbeeld | Doel |
| --- | --- | --- |
| Bundled code root | `...\resources\bot` | meegeleverde code |
| User config root | `%APPDATA%\Codex AI Trading Bot` of GitHub-map | `.env` |
| Runtime data root | `%LOCALAPPDATA%\Codex AI Trading Bot\runtime` | logs/runtime/history |

## Checklist

- [ ] Voeg `activeProjectRoot` setting toe.
- [ ] Default bij packaged app:
  - [ ] `%APPDATA%\Codex AI Trading Bot\project`
  - [ ] of door gebruiker gekozen GitHub-map.
- [ ] Voeg GUI-knop toe: `Kies projectmap`.
- [ ] Voeg GUI-knop toe: `Open actieve .env`.
- [ ] Voeg GUI-knop toe: `Open actieve projectmap`.
- [ ] GUI toont altijd:
  - [ ] active project root
  - [ ] active env path
  - [ ] runtime dir
  - [ ] history dir
  - [ ] packaged/bundled root
- [ ] Bij eerste start:
  - [ ] detecteer of GitHub-map bestaat
  - [ ] vraag gebruiker of die map gebruikt moet worden
  - [ ] maak `.env` aan uit `.env.example` indien ontbreekt
- [ ] Schrijf nooit stil naar een onbekende `.env`.

## Acceptatie

- [ ] Als je profile toepast, weet je exact welk `.env` bestand is aangepast.
- [ ] De app kan jouw GitHub-map als project-root gebruiken.
- [ ] Een reinstall overschrijft jouw `.env` niet.
- [ ] De GUI toont waarschuwing als hij `resources\bot\.env` gebruikt.

---

# P0 — Profile apply betrouwbaar maken

## Backend checklist

Bestanden:

- `src/runtime/botManager.js`
- `src/config/envFile.js`
- `src/config/tradeProfiles.js`
- `src/dashboard/server.js`

Aanpassen in `applyConfigProfile()`:

- [ ] Lees `.env` vóór wijziging.
- [ ] Bouw `before` object met relevante keys.
- [ ] Schrijf updates.
- [ ] Lees `.env` opnieuw.
- [ ] Bouw `after` object.
- [ ] Verifieer alle keys.
- [ ] Geef response terug met:
  - [ ] `applied`
  - [ ] `profile`
  - [ ] `projectRoot`
  - [ ] `envPath`
  - [ ] `updates`
  - [ ] `before`
  - [ ] `after`
  - [ ] `writeVerified`
  - [ ] `restarted`
  - [ ] `snapshot`

Voorbeeld response:

```json
{
  "applied": true,
  "profile": { "id": "paper-demo-spot" },
  "projectRoot": "C:\\Users\\highlife\\Documents\\GitHub\\Codex-ai-trading-bot-",
  "envPath": "C:\\Users\\highlife\\Documents\\GitHub\\Codex-ai-trading-bot-\\.env",
  "updates": {
    "BOT_MODE": "paper",
    "PAPER_MODE_PROFILE": "demo_spot",
    "PAPER_EXECUTION_VENUE": "binance_demo_spot"
  },
  "before": {
    "PAPER_MODE_PROFILE": "learn"
  },
  "after": {
    "PAPER_MODE_PROFILE": "demo_spot"
  },
  "writeVerified": true
}
```

## GUI checklist

Bestand:

- `src/dashboard/public/app.js`

- [ ] Profile card toont `Preview`.
- [ ] Profile card toont `Toepassen`.
- [ ] Preview toont exacte `.env` diff.
- [ ] Apply knop disabled tijdens request.
- [ ] Bij succes: groene banner.
- [ ] Bij fout: rode banner met echte fout.
- [ ] Toon `envPath` na apply.
- [ ] Toon `writeVerified`.
- [ ] Refresh profiles na apply.
- [ ] Refresh snapshot na apply.
- [ ] Active profile badge update direct.

## Test via PowerShell

```powershell
cd C:\Users\highlife\Documents\GitHub\Codex-ai-trading-bot-
node src\cli.js dashboard
```

In tweede PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3011/api/config/profiles
```

Profile toepassen:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3011/api/config/profile/apply `
  -Headers @{ "x-dashboard-request" = "1"; "content-type" = "application/json" } `
  -Body '{"profileId":"paper-demo-spot"}'
```

Controle:

```powershell
Select-String -Path .\.env -Pattern "BOT_MODE|CONFIG_PROFILE|PAPER_MODE_PROFILE|PAPER_EXECUTION_VENUE"
```

## Acceptatie

- [ ] Klik op `paper-demo-spot` wijzigt `.env`.
- [ ] GUI toont welk `.env` aangepast is.
- [ ] GUI toont `writeVerified=true`.
- [ ] Na restart blijft profiel actief.
- [ ] API faalt niet stil.

---

# P0 — `.env` writer hard maken

Bestand:

- `src/config/envFile.js`

Checklist:

- [ ] Maak backup vóór elke wijziging:
  - [ ] `.env.bak-YYYYMMDD-HHMMSS`
- [ ] Schrijf atomisch:
  - [ ] `.env.tmp`
  - [ ] rename naar `.env`
- [ ] Behoud comments.
- [ ] Behoud line endings waar mogelijk.
- [ ] Verwijder duplicate keys of waarschuw.
- [ ] Voeg `verifyEnvUpdates(envPath, updates)` toe.
- [ ] Geef duidelijke fout bij permission denied.
- [ ] Geef duidelijke fout bij read-only resources path.

Tests:

- [ ] Update bestaande key.
- [ ] Voeg nieuwe key toe.
- [ ] Behoud comments.
- [ ] Backup aangemaakt.
- [ ] Invalid key faalt.
- [ ] Verify faalt als write niet lukte.
- [ ] Windows pad werkt.

---

# P0 — Paper profiles corrigeren

## Huidige profiles behouden

- [ ] `beginner-paper-learning`
- [ ] `paper-demo-spot`
- [ ] `paper-safe-simulation`
- [ ] `guarded-live-template`

## Profile matrix toevoegen

Nieuw bestand:

```text
docs/PROFILE_MATRIX.md
```

Tabel:

| Profile | BOT_MODE | CONFIG_PROFILE | PAPER_MODE_PROFILE | PAPER_EXECUTION_VENUE | Neural | Live |
| --- | --- | --- | --- | --- | --- | --- |
| beginner-paper-learning | paper | paper-learning | learn | internal | safe partial | no |
| paper-demo-spot | paper | paper-learning | demo_spot | binance_demo_spot | safe partial | no |
| paper-safe-simulation | paper | paper-safe | sim | internal | minimal | no |
| paper-neural-learning | paper | paper-learning | learn | internal | full paper-only | no |
| paper-neural-demo-spot | paper | paper-learning | demo_spot | binance_demo_spot | full paper-only | no |
| guarded-live-template | live | guarded-live | internal | internal | observe only | guarded |

## Paper profile requirements

Elke paper profile moet zetten:

```env
BOT_MODE=paper
LIVE_TRADING_ACKNOWLEDGED=
NEURAL_AUTO_PROMOTE_LIVE=false
NEURAL_LIVE_AUTONOMY_ENABLED=false
```

`paper-demo-spot` moet zetten:

```env
PAPER_MODE_PROFILE=demo_spot
PAPER_EXECUTION_VENUE=binance_demo_spot
BINANCE_API_BASE_URL=https://demo-api.binance.com
BINANCE_FUTURES_API_BASE_URL=https://demo-fapi.binance.com
```

Acceptatie:

- [ ] `beginner-paper-learning` zet `PAPER_MODE_PROFILE=learn`.
- [ ] `paper-demo-spot` zet `PAPER_MODE_PROFILE=demo_spot`.
- [ ] `paper-safe-simulation` zet `PAPER_MODE_PROFILE=sim`.
- [ ] Geen paper profile zet live-autonomie aan.
- [ ] GUI toont welk paper profile actief is.

---

# P1 — Neural paper mode activeren

## Doel

Neural network actief maken in paper mode, zonder live risico.

## Nieuw profiel: `paper-neural-learning`

Toevoegen aan `src/config/tradeProfiles.js`:

```env
BOT_MODE=paper
CONFIG_PROFILE=paper-learning
CONFIG_CAPABILITY_BUNDLES=paper,dashboard,research
PAPER_MODE_PROFILE=learn
PAPER_EXECUTION_VENUE=internal

ADAPTIVE_LEARNING_ENABLED=true
ADAPTIVE_LEARNING_PAPER_CORE_UPDATES=true
ADAPTIVE_LEARNING_LIVE_CORE_UPDATES=false

ENABLE_TRANSFORMER_CHALLENGER=true
ENABLE_SEQUENCE_CHALLENGER=true
ENABLE_MULTI_AGENT_COMMITTEE=true
ENABLE_RL_EXECUTION=true

NEURAL_REPLAY_ENGINE_ENABLED=true
NEURAL_CONTINUOUS_LEARNING_ENABLED=true
NEURAL_SELF_TUNING_ENABLED=true
NEURAL_SELF_TUNING_PAPER_ONLY=true
NEURAL_AUTO_PROMOTE_PAPER=false
NEURAL_AUTO_PROMOTE_LIVE=false
NEURAL_AUTONOMY_ENABLED=true
NEURAL_AUTONOMY_LEVEL=1
NEURAL_LIVE_AUTONOMY_ENABLED=false
NEURAL_LIVE_AUTONOMY_ACKNOWLEDGED=
LIVE_TRADING_ACKNOWLEDGED=
```

## Nieuw profiel: `paper-neural-demo-spot`

Zelfde, maar:

```env
PAPER_MODE_PROFILE=demo_spot
PAPER_EXECUTION_VENUE=binance_demo_spot
BINANCE_API_BASE_URL=https://demo-api.binance.com
BINANCE_FUTURES_API_BASE_URL=https://demo-fapi.binance.com
```

## Neural GUI status

Toevoegen aan dashboard:

- [ ] Replay engine status.
- [ ] Continuous learning status.
- [ ] Self tuning status.
- [ ] Paper-only status.
- [ ] Auto promote paper status.
- [ ] Auto promote live status.
- [ ] Live autonomy status.
- [ ] Safety warning als live autonomy aan staat.

## Neural tests

- [ ] Profile `paper-neural-learning` zet `NEURAL_SELF_TUNING_ENABLED=true`.
- [ ] Profile zet `NEURAL_SELF_TUNING_PAPER_ONLY=true`.
- [ ] Profile zet `NEURAL_CONTINUOUS_LEARNING_ENABLED=true`.
- [ ] Profile zet `NEURAL_LIVE_AUTONOMY_ENABLED=false`.
- [ ] Profile zet `BOT_MODE=paper`.
- [ ] Live autonomy kan niet aan zonder aparte acknowledgement.
- [ ] Dashboard toont neural actief.
- [ ] Doctor toont neural paper-only status.

Acceptatie:

- [ ] Je kunt in GUI `Neural paper learning` kiezen.
- [ ] `.env` verandert zichtbaar.
- [ ] Dashboard toont neural actief.
- [ ] Live autonomy blijft uit.

---

# P1 — Setup wizard toevoegen

## Doel

Bij openen van de EXE moet je begeleid worden.

## Wizard stappen

1. Welkom
2. Kies project/config map
3. Kies profiel
4. Preview `.env` wijzigingen
5. Apply en verify
6. Check dependencies
7. Run doctor
8. Run paper cycle
9. Klaar en dashboard openen

## HTML/GUI checklist

Bestanden:

- `src/dashboard/public/index.html`
- `src/dashboard/public/app.js`
- `src/dashboard/public/styles.css`

Checklist:

- [ ] Voeg knop toe: `Setup wizard`.
- [ ] Toon wizard automatisch bij eerste start.
- [ ] Toon wizard automatisch als `.env` ontbreekt.
- [ ] Toon wizard automatisch als active project root onbekend is.
- [ ] Stap project root:
  - [ ] huidig pad tonen
  - [ ] knop `Kies map`
  - [ ] knop `Gebruik GitHub repo`
- [ ] Stap profiel:
  - [ ] Safe simulation
  - [ ] Beginner paper learning
  - [ ] Binance demo spot paper
  - [ ] Neural paper learning
  - [ ] Neural demo spot paper
- [ ] Stap `.env` preview:
  - [ ] diff tonen
  - [ ] secrets redacted
- [ ] Stap checks:
  - [ ] `.env` writable
  - [ ] runtime dir writable
  - [ ] dashboard public exists
  - [ ] server.js exists
  - [ ] package.json exists
- [ ] Stap doctor:
  - [ ] `/api/doctor`
- [ ] Stap paper cycle:
  - [ ] `/api/cycle`
  - [ ] alleen mogelijk als bot niet running is
- [ ] Setup complete opslaan.

## Setup state

Opslaan in:

```text
%APPDATA%\Codex AI Trading Bot\setup-state.json
```

Voorbeeld:

```json
{
  "completed": true,
  "activeProjectRoot": "C:\\Users\\highlife\\Documents\\GitHub\\Codex-ai-trading-bot-",
  "activeEnvPath": "C:\\Users\\highlife\\Documents\\GitHub\\Codex-ai-trading-bot-\\.env",
  "profileId": "paper-neural-learning",
  "lastDoctorOk": true,
  "lastPaperCycleOk": true
}
```

Acceptatie:

- [ ] Na installatie zie je setup wizard.
- [ ] Wizard toont actieve `.env`.
- [ ] Wizard kan profiel toepassen.
- [ ] Wizard kan doctor draaien.
- [ ] Wizard kan paper cycle draaien.
- [ ] Wizard kan opnieuw geopend worden.

---

# P1 — Nieuwe diagnostics endpoints

Bestand:

- `src/dashboard/server.js`

Toevoegen:

```text
GET  /api/gui/diagnostics
GET  /api/config/env
POST /api/config/project-root/select
POST /api/setup/run-checks
POST /api/setup/complete
POST /api/setup/reset
```

## `GET /api/gui/diagnostics`

Moet tonen:

```json
{
  "packaged": true,
  "botRoot": "...",
  "projectRoot": "...",
  "envPath": "...",
  "envExists": true,
  "envWritable": true,
  "dashboardPublicExists": true,
  "serverPathExists": true,
  "dashboardUrl": "http://127.0.0.1:3011"
}
```

## `GET /api/config/env`

Moet veilige config tonen:

```json
{
  "envPath": "...",
  "safeValues": {
    "BOT_MODE": "paper",
    "CONFIG_PROFILE": "paper-learning",
    "PAPER_MODE_PROFILE": "learn",
    "PAPER_EXECUTION_VENUE": "internal",
    "NEURAL_SELF_TUNING_ENABLED": "true"
  },
  "redacted": ["BINANCE_API_KEY", "BINANCE_API_SECRET"]
}
```

Acceptatie:

- [ ] Geen secrets lekken.
- [ ] GUI kan diagnostics tonen.
- [ ] GUI kan active env status tonen.

---

# P1 — Uitgebreid testplan

## Unit tests

Nieuwe tests:

```text
test/envFileAtomicUpdate.tests.js
test/tradeProfiles.tests.js
test/profileApply.tests.js
test/neuralProfiles.tests.js
test/desktopPathResolution.tests.js
```

Checklist:

- [ ] Env writer update bestaande key.
- [ ] Env writer voegt nieuwe key toe.
- [ ] Env writer behoudt comments.
- [ ] Env writer maakt backup.
- [ ] Env writer verify werkt.
- [ ] Profile catalog bevat alle profiles.
- [ ] Paper profiles zetten `BOT_MODE=paper`.
- [ ] Demo profile zet `PAPER_MODE_PROFILE=demo_spot`.
- [ ] Neural profile zet neural paper flags.
- [ ] Live profile vereist acknowledgement.
- [ ] Packaged path resolver gebruikt user-writable config root.

## Integration tests

Nieuwe tests:

```text
test/dashboardProfileApi.tests.js
test/dashboardSetupWizardApi.tests.js
test/dashboardDiagnostics.tests.js
```

Checklist:

- [ ] Start dashboard server met temp project root.
- [ ] `GET /api/config/profiles` werkt.
- [ ] `POST /api/config/profile/apply` werkt.
- [ ] Temp `.env` verandert.
- [ ] Response bevat `envPath`.
- [ ] Response bevat `writeVerified=true`.
- [ ] `GET /api/config/env` werkt.
- [ ] `GET /api/gui/diagnostics` werkt.
- [ ] Geen secrets in API response.
- [ ] `/` serveert HTML.
- [ ] `/app.js` serveert JS.
- [ ] `/styles.css` serveert CSS.

## Electron E2E tests

Nieuwe tests:

```text
desktop/test/electronStartup.test.js
desktop/test/profileApply.e2e.test.js
desktop/test/setupWizard.e2e.test.js
```

Checklist:

- [ ] Electron opent dashboard.
- [ ] Geen wit scherm.
- [ ] `#profileList` zichtbaar.
- [ ] Klik `paper-demo-spot`.
- [ ] Preview zichtbaar.
- [ ] Klik `Toepassen`.
- [ ] Success banner zichtbaar.
- [ ] `.env` aangepast.
- [ ] Klik `paper-neural-learning`.
- [ ] Neural flags zichtbaar.
- [ ] Setup wizard opent.
- [ ] Doctor knop werkt.
- [ ] Paper cycle knop werkt.

## Windows installer smoke test

Checklist:

- [ ] Build installer.
- [ ] Installeer.
- [ ] Start via Start Menu.
- [ ] Geen wit scherm.
- [ ] Open active `.env` werkt.
- [ ] Open logs werkt.
- [ ] Apply profile werkt.
- [ ] Restart app.
- [ ] Profile blijft actief.
- [ ] Neural profile blijft actief.
- [ ] Paper mode draait zonder live keys.

---

# P2 — Build/installer verbeteren

## Build locks voorkomen

Toevoegen aan `desktop/package.json`:

```json
{
  "scripts": {
    "dist:fresh": "electron-builder --win --config.directories.output=dist-new"
  }
}
```

Checklist:

- [ ] Documenteer `dist-new` workaround.
- [ ] Voeg clean script toe.
- [ ] Build faalt duidelijk als `dist` gelockt is.
- [ ] Voeg `description` en `author` toe aan `desktop/package.json`.

---

# P2 — Documentatie

Nieuwe docs:

```text
docs/DESKTOP_GUI_TROUBLESHOOTING.md
docs/PROFILE_APPLY_FLOW.md
docs/PAPER_PROFILES.md
docs/NEURAL_PAPER_MODE.md
docs/SETUP_WIZARD.md
docs/WINDOWS_INSTALLER_TEST_PLAN.md
```

Checklist:

- [ ] Leg uit waar actieve `.env` staat.
- [ ] Leg uit hoe profiles werken.
- [ ] Leg uit hoe neural paper mode werkt.
- [ ] Leg uit waarom live neural autonomy uit blijft.
- [ ] Leg uit hoe je logs opent.
- [ ] Leg uit hoe je wit scherm debugt.
- [ ] Voeg PowerShell voorbeelden toe.

---

# Implementatievolgorde

## Sprint 1

- [ ] Startup logging
- [ ] Error page in plaats van wit scherm
- [ ] Active env/project path tonen
- [ ] Logs openen vanuit GUI

## Sprint 2

- [ ] Profile apply response uitbreiden
- [ ] `.env` verify
- [ ] GUI success/error banners
- [ ] Profile refresh na apply

## Sprint 3

- [ ] User-writable config root
- [ ] Project-root selectie
- [ ] Geen silent writes naar resources
- [ ] Setup state

## Sprint 4

- [ ] Setup wizard
- [ ] Setup checks
- [ ] Doctor vanuit wizard
- [ ] Paper cycle vanuit wizard

## Sprint 5

- [ ] Neural paper profiles
- [ ] Neural dashboard summary
- [ ] Neural safety tests

## Sprint 6

- [ ] Electron E2E tests
- [ ] Windows installer smoke tests
- [ ] Docs

---

# Tijdelijke handmatige workaround

Totdat de GUI profile fix er is, kun je in jouw repo `.env` handmatig neural paper mode zetten:

```env
BOT_MODE=paper
CONFIG_PROFILE=paper-learning
CONFIG_CAPABILITY_BUNDLES=paper,dashboard,research
PAPER_MODE_PROFILE=learn
PAPER_EXECUTION_VENUE=internal

ADAPTIVE_LEARNING_ENABLED=true
ADAPTIVE_LEARNING_PAPER_CORE_UPDATES=true
ADAPTIVE_LEARNING_LIVE_CORE_UPDATES=false

ENABLE_TRANSFORMER_CHALLENGER=true
ENABLE_SEQUENCE_CHALLENGER=true
ENABLE_MULTI_AGENT_COMMITTEE=true
ENABLE_RL_EXECUTION=true

NEURAL_REPLAY_ENGINE_ENABLED=true
NEURAL_CONTINUOUS_LEARNING_ENABLED=true
NEURAL_SELF_TUNING_ENABLED=true
NEURAL_SELF_TUNING_PAPER_ONLY=true
NEURAL_AUTO_PROMOTE_PAPER=false
NEURAL_AUTO_PROMOTE_LIVE=false
NEURAL_AUTONOMY_ENABLED=true
NEURAL_AUTONOMY_LEVEL=1
NEURAL_LIVE_AUTONOMY_ENABLED=false
NEURAL_LIVE_AUTONOMY_ACKNOWLEDGED=
LIVE_TRADING_ACKNOWLEDGED=
```

Daarna:

```powershell
cd C:\Users\highlife\Documents\GitHub\Codex-ai-trading-bot-
npm test
node src\cli.js doctor
node src\cli.js dashboard
```

---

# Definitieve acceptatiecriteria

## GUI

- [ ] Geen wit scherm.
- [ ] Error page bij dashboard failure.
- [ ] Active project root zichtbaar.
- [ ] Active `.env` zichtbaar.
- [ ] Logs openbaar via GUI.
- [ ] Setup wizard zichtbaar.

## Profiles

- [ ] Apply wijzigt juiste `.env`.
- [ ] Apply toont diff.
- [ ] Apply toont `envPath`.
- [ ] Apply toont `writeVerified=true`.
- [ ] Active badge verandert.
- [ ] Restart behoudt profiel.

## Paper/demo

- [ ] Paper mode zonder live keys.
- [ ] Demo spot gebruikt `demo_spot`.
- [ ] Geen live order calls in paper/demo.
- [ ] Dashboard toont mode en venue.

## Neural

- [ ] Neural paper profile bestaat.
- [ ] Neural demo paper profile bestaat.
- [ ] Neural self tuning paper-only actief.
- [ ] Continuous learning paper-only actief.
- [ ] Replay engine actief.
- [ ] Live autonomy uit.
- [ ] Dashboard toont neural status.

## Tests

- [ ] `npm test` passed.
- [ ] Profile API tests passed.
- [ ] Env writer tests passed.
- [ ] Neural profile tests passed.
- [ ] Dashboard tests passed.
- [ ] Electron startup test passed.
- [ ] Installer smoke test passed.

## Implementatie-afronding 2026-05-08

Afgewerkt in code:
- Desktop startup logging naar `%APPDATA%\Codex AI Trading Bot\logs\desktop-main.log`.
- Electron error page bij dashboard startup/load failure in plaats van stil wit scherm.
- Tray actions voor logs en actieve `.env`.
- Timestamped `desktop:dist:fresh` build zodat gelockte `dist`/`dist-new` mappen de installer-build niet blokkeren.
- Atomic `.env` writer met backup, temp write, rename, before/after diff en `writeVerified`.
- Profile apply response met `projectRoot`, `envPath`, `updates`, `before`, `after`, `backupPath`, `writeVerified`, `mismatches`, `snapshot`.
- GUI profile preview/apply met disabled apply button tijdens request, diff, envPath en verify-resultaat.
- Nieuwe paper neural profiles: `paper-neural-learning` en `paper-neural-demo-spot`.
- Demo spot profiles zetten Binance demo REST endpoints.
- Setup wizard panel met diagnostics, checks, doctor en paper-cycle controls.
- Diagnostics/config API:
  - `GET /api/gui/diagnostics`
  - `GET /api/config/env`
  - `POST /api/setup/run-checks`
  - `POST /api/setup/complete`
  - `POST /api/setup/reset`
- Docs:
  - `docs/PROFILE_MATRIX.md`
  - `docs/DESKTOP_GUI_TROUBLESHOOTING.md`
  - `docs/PROFILE_APPLY_FLOW.md`
  - `docs/NEURAL_PAPER_MODE.md`
  - `docs/SETUP_WIZARD.md`
  - `docs/WINDOWS_INSTALLER_TEST_PLAN.md`

Geverifieerd:
- `node --check` op gewijzigde JS/MJS bestanden.
- Gerichte ESLint op gewijzigde JS-bestanden.
- Env writer smoke: comments behouden, backup gemaakt, verify true.
- Profile catalog smoke: alle zes profiles aanwezig.
- Dashboard smoke render.
- Desktop diagnose: ok.
- `npm run desktop:dist:fresh`: ok, output naar timestamped `desktop/dist-new-*`.

Nog handmatig door operator te doen:
- Installer starten via Start Menu.
- Controleren dat profile apply na restart actief blijft.
- Doctor/paper cycle vanuit de echte geïnstalleerde GUI klikken.
