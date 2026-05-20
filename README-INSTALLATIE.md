# Codebase-specifieke Codex agents installeren

## Plaatsing

Zet deze bestanden in de root van je repo:

```txt
Codex-ai-trading-bot-/
â”œâ”€ AGENTS.md
â”œâ”€ ANALYSE-SAMENVATTING.md
â”œâ”€ PROMPTS-CODEX.md
â””â”€ .codex/
   â”œâ”€ config.toml
   â””â”€ agents/
      â”œâ”€ cli-command-surface-auditor.toml
      â”œâ”€ core-tradingbot-lifecycle-auditor.toml
      â”œâ”€ botmanager-exchange-health-auditor.toml
      â”œâ”€ paper-live-boundary-auditor.toml
      â”œâ”€ dashboard-state-api-auditor.toml
      â”œâ”€ positions-pnl-trim-auditor.toml
      â”œâ”€ binance-rate-limit-circuitbreaker-auditor.toml
      â”œâ”€ test-contract-runner.toml
      â”œâ”€ roadmap-continuity-planner.toml
      â”œâ”€ repo-patch-implementer.toml
      â””â”€ regression-safety-gatekeeper.toml
```

## PowerShell installeren

Download `install_codebase_specific_codex_agents.ps1`, zet het in je projectroot en run:

```powershell
cd "C:\Users\highlife\Documents\GitHub\Codex-ai-trading-bot-"
powershell -ExecutionPolicy Bypass -File .\install_codebase_specific_codex_agents.ps1
```

## Daarna in Codex

Gebruik de prompts uit `PROMPTS-CODEX.md`.

Begin altijd met read-only analyse. Laat `repo_patch_implementer` pas werken nadat je een rapport hebt en Ã©Ã©n specifieke fix gekozen is.
