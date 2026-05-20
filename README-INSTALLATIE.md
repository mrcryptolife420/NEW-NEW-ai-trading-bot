# Codex multi-agent pack voor crypto trading bot

## Wat zit hierin?

Deze pack bevat:
- `.codex/config.toml`
- `.codex/agents/code-mapper.toml`
- `.codex/agents/architecture-auditor.toml`
- `.codex/agents/paper-mode-auditor.toml`
- `.codex/agents/trade-lifecycle-auditor.toml`
- `.codex/agents/risk-security-reviewer.toml`
- `.codex/agents/binance-rate-limit-auditor.toml`
- `.codex/agents/test-runner.toml`
- `.codex/agents/roadmap-planner.toml`
- `.codex/agents/implementer.toml`
- `.codex/agents/regression-reviewer.toml`
- `AGENTS.md`

## Waar plaats je dit?

Plaats de map `.codex` en het bestand `AGENTS.md` in de root van je project.

Voorbeeld:

```txt
jouw-crypto-bot/
â”œâ”€ .git/
â”œâ”€ src/
â”œâ”€ package.json
â”œâ”€ AGENTS.md
â””â”€ .codex/
   â”œâ”€ config.toml
   â””â”€ agents/
      â”œâ”€ code-mapper.toml
      â”œâ”€ architecture-auditor.toml
      â”œâ”€ paper-mode-auditor.toml
      â”œâ”€ trade-lifecycle-auditor.toml
      â”œâ”€ risk-security-reviewer.toml
      â”œâ”€ binance-rate-limit-auditor.toml
      â”œâ”€ test-runner.toml
      â”œâ”€ roadmap-planner.toml
      â”œâ”€ implementer.toml
      â””â”€ regression-reviewer.toml
```

## Windows PowerShell

Vanuit je projectroot:

```powershell
mkdir .codex
mkdir .codex\agents
```

Kopieer daarna de bestanden in dezelfde structuur.

## Belangrijk

Codex moet je project als trusted zien, anders kan project-local `.codex/` config genegeerd worden.

## Goede startprompt

```txt
Gebruik mijn project-agents.

Spawn parallel:
- code_mapper
- architecture_auditor
- paper_mode_auditor
- trade_lifecycle_auditor
- risk_security_reviewer
- binance_rate_limit_auditor
- test_runner
- roadmap_planner

Doel:
analyseer de volledige codebase van mijn crypto trading bot. Controleer paper/demo/live scheiding, simulated open lifecycle, trim, dynamic stop, dynamic target, Exit v2, Binance REST ban handling, rate limits, risk controls, PnL, exposure en UI/API-koppelingen.

Maak geen codewijzigingen.

Wacht tot alle agents klaar zijn en geef daarna Ã©Ã©n geconsolideerd rapport met:
- bewezen werkende onderdelen
- niet-aangesloten modules
- bugs
- risico's
- ontbrekende tests
- roadmap-prioriteiten
- concrete files/functies waar ik moet beginnen
```

## Implementatieprompt na analyse

```txt
Gebruik de vorige analyse.

Spawn implementer voor alleen de hoogste prioriteit fix.
Spawn regression_reviewer read-only om de patch daarna te controleren.
Hou de wijziging klein.
Voeg of update tests.
Geen live-trading wijziging zonder expliciete bevestiging.
```
