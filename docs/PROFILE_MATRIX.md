# Profile Matrix

| Profile | BOT_MODE | CONFIG_PROFILE | PAPER_MODE_PROFILE | PAPER_EXECUTION_VENUE | Neural | Live |
| --- | --- | --- | --- | --- | --- | --- |
| beginner-paper-learning | paper | paper-learning | learn | internal | safe partial | no |
| paper-demo-spot | paper | paper-learning | demo_spot | binance_demo_spot | safe partial | no |
| paper-safe-simulation | paper | paper-safe | sim | internal | minimal | no |
| paper-neural-learning | paper | paper-learning | learn | internal | full paper-only | no |
| paper-neural-demo-spot | paper | paper-learning | demo_spot | binance_demo_spot | full paper-only | no |
| guarded-live-template | live | guarded-live | internal | internal | observe only | guarded |

All paper profiles keep `LIVE_TRADING_ACKNOWLEDGED` empty, `NEURAL_AUTO_PROMOTE_LIVE=false`, and `NEURAL_LIVE_AUTONOMY_ENABLED=false`.
