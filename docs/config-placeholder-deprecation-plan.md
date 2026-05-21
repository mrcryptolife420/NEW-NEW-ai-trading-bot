# Config placeholder deprecation plan

This file documents legacy/config-only placeholders retained for backward compatibility. No live behavior changes are made by this plan.

| Flag | Action | Rationale |
| --- | --- | --- |
| enableCvdConfirmation | deprecate | Concrete orderflow/indicator modules own CVD behavior. |
| enableLiquidationMagnetContext | map-to-provider | Provider-level derivatives/liquidation context should own this. |
| enablePriceActionStructure | map-to-provider | Core indicator/market-structure providers already compute structure. |
| enableStrategyRouter | keep | Strategy routing is mandatory; keep as compatibility metadata until migration. |
| enableTrailingProtection | map-to-provider | Exit policy/trailing parameters own behavior; provider mapping is safer than umbrella gating. |
| canaryTradingEnabled | keep | Canary remains disabled unless reviewed operator workflow exists. |

Validation policy: warn only, never fail old config files solely for these placeholders. Feature audit exposes placeholderAction as keep, deprecate, or map-to-provider.
