export const DASHBOARD_QUICK_SETTINGS = [
  {
    key: "TRADING_INTERVAL_SECONDS",
    label: "Bot interval",
    group: "Runtime",
    type: "integer",
    min: 10,
    max: 3600,
    step: 10,
    defaultValue: "120",
    liveSensitive: false,
    explanation: "Bepaalt hoeveel seconden de bot wacht tussen normale cycli. Lager reageert sneller maar gebruikt meer API-budget en CPU.",
    changes: "Schrijft TRADING_INTERVAL_SECONDS in .env. Actief na reload of herstart."
  },
  {
    key: "MAX_OPEN_POSITIONS",
    label: "Max posities",
    group: "Risk",
    type: "integer",
    min: 1,
    max: 10,
    step: 1,
    defaultValue: "4",
    liveSensitive: true,
    explanation: "Beperkt hoeveel posities tegelijk open mogen staan. Lager beperkt exposure; hoger geeft meer kansen maar meer portefeuille-risico.",
    changes: "Schrijft MAX_OPEN_POSITIONS in .env. In live mode alleen wijzigen wanneer de bot gestopt is."
  },
  {
    key: "RISK_PER_TRADE",
    label: "Risk per trade",
    group: "Risk",
    type: "number",
    min: 0.0001,
    max: 0.05,
    step: 0.001,
    defaultValue: "0.01",
    liveSensitive: true,
    explanation: "Stuurt de basispositie-grootte als fractie van kapitaal. 0.01 betekent ongeveer 1% risicobudget per trade.",
    changes: "Schrijft RISK_PER_TRADE in .env. Dashboard cap is 5% om onveilige snelle edits te vermijden."
  },
  {
    key: "MAX_POSITION_FRACTION",
    label: "Max positie fractie",
    group: "Risk",
    type: "number",
    min: 0.001,
    max: 0.5,
    step: 0.005,
    defaultValue: "0.12",
    liveSensitive: true,
    explanation: "Limiteert hoeveel van het totale kapitaal in een enkele positie mag zitten.",
    changes: "Schrijft MAX_POSITION_FRACTION in .env. Lager beperkt single-symbol exposure."
  },
  {
    key: "MAX_TOTAL_EXPOSURE_FRACTION",
    label: "Totale exposure cap",
    group: "Risk",
    type: "number",
    min: 0.01,
    max: 1,
    step: 0.01,
    defaultValue: "0.6",
    liveSensitive: true,
    explanation: "Beperkt de totale portefeuille-exposure over alle open posities.",
    changes: "Schrijft MAX_TOTAL_EXPOSURE_FRACTION in .env."
  },
  {
    key: "MAX_DAILY_DRAWDOWN",
    label: "Dagelijkse drawdown cap",
    group: "Risk",
    type: "number",
    min: 0.001,
    max: 0.2,
    step: 0.001,
    defaultValue: "0.05",
    liveSensitive: true,
    explanation: "Dagverlieslimiet waarna risk/governance nieuwe entries kan blokkeren.",
    changes: "Schrijft MAX_DAILY_DRAWDOWN in .env."
  },
  {
    key: "MIN_MODEL_CONFIDENCE",
    label: "Min model confidence",
    group: "Signal gates",
    type: "number",
    min: 0.5,
    max: 0.99,
    step: 0.005,
    defaultValue: "0.58",
    liveSensitive: true,
    explanation: "Ondergrens voor modelvertrouwen voordat een setup serieus wordt overwogen.",
    changes: "Schrijft MIN_MODEL_CONFIDENCE in .env. Verlaag dit niet blind; blockers blijven leidend."
  },
  {
    key: "ENTRY_COOLDOWN_MINUTES",
    label: "Entry cooldown",
    group: "Signal gates",
    type: "integer",
    min: 0,
    max: 1440,
    step: 5,
    defaultValue: "30",
    liveSensitive: true,
    explanation: "Wachtperiode na entries om overtrading en herhaalde signalen te beperken.",
    changes: "Schrijft ENTRY_COOLDOWN_MINUTES in .env."
  },
  {
    key: "MIN_TRADE_USDT",
    label: "Min trade USDT",
    group: "Execution",
    type: "number",
    min: 1,
    max: 100000,
    step: 1,
    defaultValue: "25",
    liveSensitive: true,
    explanation: "Minimale live/order notional in USDT voordat execution mag doorgaan.",
    changes: "Schrijft MIN_TRADE_USDT in .env."
  },
  {
    key: "PAPER_MIN_TRADE_USDT",
    label: "Paper min trade",
    group: "Paper execution",
    type: "number",
    min: 1,
    max: 100000,
    step: 1,
    defaultValue: "5",
    liveSensitive: false,
    explanation: "Minimale paper notional. Lager maakt kleine paper probes makkelijker zichtbaar.",
    changes: "Schrijft PAPER_MIN_TRADE_USDT in .env."
  },
  {
    key: "STOP_LOSS_PCT",
    label: "Stop loss",
    group: "Exit controls",
    type: "number",
    min: 0.001,
    max: 0.2,
    step: 0.001,
    defaultValue: "0.018",
    liveSensitive: true,
    explanation: "Basale stop-loss afstand als fractie van entryprijs.",
    changes: "Schrijft STOP_LOSS_PCT in .env. Dynamic exit kan dit later verder aanscherpen."
  },
  {
    key: "TAKE_PROFIT_PCT",
    label: "Take profit",
    group: "Exit controls",
    type: "number",
    min: 0.001,
    max: 0.5,
    step: 0.001,
    defaultValue: "0.032",
    liveSensitive: true,
    explanation: "Basale take-profit afstand als fractie van entryprijs.",
    changes: "Schrijft TAKE_PROFIT_PCT in .env."
  },
  {
    key: "TRAILING_STOP_PCT",
    label: "Trailing stop",
    group: "Exit controls",
    type: "number",
    min: 0.001,
    max: 0.2,
    step: 0.001,
    defaultValue: "0.018",
    liveSensitive: true,
    explanation: "Trailing stop-afstand voor winstbescherming wanneer trailing logic actief is.",
    changes: "Schrijft TRAILING_STOP_PCT in .env."
  },
  {
    key: "ENABLE_DYNAMIC_EXIT_LEVELS",
    label: "Dynamic exits",
    group: "Exit controls",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: true,
    explanation: "Laat de bot stop/take-profit niveaus aanpassen op basis van setup- en marktcontext.",
    changes: "Schrijft ENABLE_DYNAMIC_EXIT_LEVELS in .env."
  },
  {
    key: "MAX_SPREAD_BPS",
    label: "Max spread bps",
    group: "Execution",
    type: "number",
    min: 1,
    max: 500,
    step: 1,
    defaultValue: "25",
    liveSensitive: true,
    explanation: "Blokkeert entries wanneer de spread te breed is voor betrouwbare uitvoering.",
    changes: "Schrijft MAX_SPREAD_BPS in .env."
  },
  {
    key: "PAPER_FEE_BPS",
    label: "Paper fee bps",
    group: "Paper execution",
    type: "number",
    min: 0,
    max: 100,
    step: 0.1,
    defaultValue: "10",
    liveSensitive: false,
    explanation: "Simuleert handelskosten in paper PnL.",
    changes: "Schrijft PAPER_FEE_BPS in .env."
  },
  {
    key: "PAPER_SLIPPAGE_BPS",
    label: "Paper slippage bps",
    group: "Paper execution",
    type: "number",
    min: 0,
    max: 500,
    step: 0.5,
    defaultValue: "8",
    liveSensitive: false,
    explanation: "Simuleert prijsverslechtering bij paper fills.",
    changes: "Schrijft PAPER_SLIPPAGE_BPS in .env."
  },
  {
    key: "PAPER_LATENCY_MS",
    label: "Paper latency",
    group: "Paper execution",
    type: "integer",
    min: 0,
    max: 5000,
    step: 25,
    defaultValue: "250",
    liveSensitive: false,
    explanation: "Simuleert vertraging tussen signaal en paper fill.",
    changes: "Schrijft PAPER_LATENCY_MS in .env."
  },
  {
    key: "PAPER_EXPLORATION_ENABLED",
    label: "Paper exploration",
    group: "Paper learning",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: false,
    explanation: "Laat paper mode kleine leer/probe-trades overwegen wanneer alleen zachte blockers aanwezig zijn.",
    changes: "Schrijft PAPER_EXPLORATION_ENABLED in .env. Heeft geen directe live-order autoriteit."
  },
  {
    key: "PAPER_EXPLORATION_SIZE_MULTIPLIER",
    label: "Paper probe size",
    group: "Paper learning",
    type: "number",
    min: 0.1,
    max: 1,
    step: 0.01,
    defaultValue: "0.58",
    liveSensitive: false,
    explanation: "Schaalt paper learning-posities. Lager verzamelt nog signalen met minder gesimuleerde exposure.",
    changes: "Schrijft PAPER_EXPLORATION_SIZE_MULTIPLIER in .env."
  },
  {
    key: "PAPER_EXPLORATION_THRESHOLD_BUFFER",
    label: "Paper threshold buffer",
    group: "Paper learning",
    type: "number",
    min: 0,
    max: 0.2,
    step: 0.005,
    defaultValue: "0.06",
    liveSensitive: false,
    explanation: "Geeft paper mode ruimte om sterke near-threshold kandidaten als leerprobe te bewaren.",
    changes: "Schrijft PAPER_EXPLORATION_THRESHOLD_BUFFER in .env."
  },
  {
    key: "PAPER_EXPLORATION_COOLDOWN_MINUTES",
    label: "Paper cooldown",
    group: "Paper learning",
    type: "integer",
    min: 0,
    max: 1440,
    step: 5,
    defaultValue: "90",
    liveSensitive: false,
    explanation: "Wachtperiode tussen vergelijkbare paper probes. Hoger vermindert herhaling; lager leert sneller maar kan ruis verzamelen.",
    changes: "Schrijft PAPER_EXPLORATION_COOLDOWN_MINUTES in .env."
  },
  {
    key: "NEURAL_SELF_TUNING_ENABLED",
    label: "Neural paper tuning",
    group: "Neural",
    type: "boolean",
    defaultValue: "false",
    liveSensitive: false,
    explanation: "Zet offline/paper neural self-tuning aan. Safety bounds blijven leidend en live-autonomie wordt hiermee niet ingeschakeld.",
    changes: "Schrijft NEURAL_SELF_TUNING_ENABLED in .env."
  },
  {
    key: "NEURAL_SELF_TUNING_MAX_ACTIVE_EXPERIMENTS",
    label: "Neural experiment cap",
    group: "Neural",
    type: "integer",
    min: 1,
    max: 10,
    step: 1,
    defaultValue: "3",
    liveSensitive: false,
    explanation: "Beperkt hoeveel neural tuning-experimenten tegelijk actief mogen zijn.",
    changes: "Schrijft NEURAL_SELF_TUNING_MAX_ACTIVE_EXPERIMENTS in .env."
  },
  {
    key: "ENABLE_MARKET_SENTIMENT_CONTEXT",
    label: "Market sentiment context",
    group: "Data context",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: false,
    explanation: "Voegt fear/greed en marktbreedte toe aan context. Uitzetten verlaagt externe afhankelijkheden maar maakt beslissingen minder rijk.",
    changes: "Schrijft ENABLE_MARKET_SENTIMENT_CONTEXT in .env."
  },
  {
    key: "ENABLE_ONCHAIN_LITE_CONTEXT",
    label: "On-chain lite context",
    group: "Data context",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: false,
    explanation: "Voegt stablecoin- en major-asset context toe voor marktbeeld.",
    changes: "Schrijft ENABLE_ONCHAIN_LITE_CONTEXT in .env."
  },
  {
    key: "ENABLE_VOLATILITY_CONTEXT",
    label: "Volatility context",
    group: "Data context",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: false,
    explanation: "Voegt volatiliteitscontext toe zodat entries en exits risico beter kunnen inschatten.",
    changes: "Schrijft ENABLE_VOLATILITY_CONTEXT in .env."
  },
  {
    key: "ENABLE_DYNAMIC_WATCHLIST",
    label: "Dynamic watchlist",
    group: "Universe",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: false,
    explanation: "Laat de bot de watchlist dynamisch uitbreiden of rangschikken op basis van marktkwaliteit.",
    changes: "Schrijft ENABLE_DYNAMIC_WATCHLIST in .env."
  },
  {
    key: "WATCHLIST_TOP_N",
    label: "Watchlist top N",
    group: "Universe",
    type: "integer",
    min: 5,
    max: 150,
    step: 5,
    defaultValue: "60",
    liveSensitive: false,
    explanation: "Aantal top-symbolen dat de dynamische watchlist mag meenemen.",
    changes: "Schrijft WATCHLIST_TOP_N in .env."
  },
  {
    key: "MARKET_SNAPSHOT_CONCURRENCY",
    label: "Snapshot concurrency",
    group: "Performance",
    type: "integer",
    min: 1,
    max: 20,
    step: 1,
    defaultValue: "5",
    liveSensitive: false,
    explanation: "Aantal market snapshot taken dat tegelijk mag lopen. Hoger is sneller maar zwaarder.",
    changes: "Schrijft MARKET_SNAPSHOT_CONCURRENCY in .env."
  },
  {
    key: "MARKET_SNAPSHOT_BUDGET_SYMBOLS",
    label: "Snapshot symbol budget",
    group: "Performance",
    type: "integer",
    min: 4,
    max: 120,
    step: 2,
    defaultValue: "28",
    liveSensitive: false,
    explanation: "Maximaal aantal symbolen dat per snapshot diep wordt verwerkt.",
    changes: "Schrijft MARKET_SNAPSHOT_BUDGET_SYMBOLS in .env."
  },
  {
    key: "ENABLE_LOCAL_ORDER_BOOK",
    label: "Local order book",
    group: "Market data",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: false,
    explanation: "Schakelt lokale order book streams in voor microstructure en fill-impact signalen.",
    changes: "Schrijft ENABLE_LOCAL_ORDER_BOOK in .env."
  },
  {
    key: "LOCAL_BOOK_MAX_SYMBOLS",
    label: "Local book symbols",
    group: "Market data",
    type: "integer",
    min: 4,
    max: 120,
    step: 2,
    defaultValue: "28",
    liveSensitive: false,
    explanation: "Maximaal aantal symbolen waarvoor lokale order books worden bijgehouden.",
    changes: "Schrijft LOCAL_BOOK_MAX_SYMBOLS in .env."
  },
  {
    key: "ADAPTIVE_LEARNING_ENABLED",
    label: "Adaptive learning",
    group: "Learning",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: false,
    explanation: "Laat de bot leren van gesloten trades en gemiste kansen binnen safety bounds.",
    changes: "Schrijft ADAPTIVE_LEARNING_ENABLED in .env."
  },
  {
    key: "ADAPTIVE_LEARNING_MAX_THRESHOLD_SHIFT",
    label: "Learning threshold cap",
    group: "Learning",
    type: "number",
    min: 0,
    max: 0.2,
    step: 0.005,
    defaultValue: "0.04",
    liveSensitive: true,
    explanation: "Beperkt hoeveel adaptive learning thresholds mag verschuiven.",
    changes: "Schrijft ADAPTIVE_LEARNING_MAX_THRESHOLD_SHIFT in .env."
  },
  {
    key: "ENABLE_MULTI_AGENT_COMMITTEE",
    label: "AI committee",
    group: "Governance",
    type: "boolean",
    defaultValue: "true",
    liveSensitive: true,
    explanation: "Gebruikt meerdere modelchecks als extra governance-laag voor setupkwaliteit.",
    changes: "Schrijft ENABLE_MULTI_AGENT_COMMITTEE in .env."
  },
  {
    key: "COMMITTEE_MIN_CONFIDENCE",
    label: "Committee confidence",
    group: "Governance",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: "0.38",
    liveSensitive: true,
    explanation: "Minimale confidence die de committee-laag verwacht voordat ze steun geeft.",
    changes: "Schrijft COMMITTEE_MIN_CONFIDENCE in .env."
  },
  {
    key: "ABSTAIN_BAND",
    label: "Abstain band",
    group: "Governance",
    type: "number",
    min: 0,
    max: 0.2,
    step: 0.005,
    defaultValue: "0.02",
    liveSensitive: true,
    explanation: "Neutrale band rond twijfelachtige modeluitkomsten waarin de bot liever niet handelt.",
    changes: "Schrijft ABSTAIN_BAND in .env."
  }
];

const SETTING_BY_KEY = new Map(DASHBOARD_QUICK_SETTINGS.map((setting) => [setting.key, setting]));

function normalizeBoolean(value) {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return "true";
  if (["false", "0", "no", "off"].includes(normalized)) return "false";
  throw new Error("Waarde moet true of false zijn.");
}

function normalizeNumber(value, setting) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Waarde moet een geldig nummer zijn.");
  }
  if (Number.isFinite(setting.min) && numeric < setting.min) {
    throw new Error(`Waarde moet >= ${setting.min} zijn.`);
  }
  if (Number.isFinite(setting.max) && numeric > setting.max) {
    throw new Error(`Waarde moet <= ${setting.max} zijn.`);
  }
  if (setting.type === "integer" && !Number.isInteger(numeric)) {
    throw new Error("Waarde moet een geheel getal zijn.");
  }
  return setting.type === "integer" ? `${numeric}` : `${numeric}`;
}

export function listDashboardQuickSettings() {
  return DASHBOARD_QUICK_SETTINGS.map((setting) => ({ ...setting }));
}

export function normalizeDashboardQuickSettingUpdates(updates = {}) {
  const normalized = {};
  const errors = [];
  for (const [rawKey, rawValue] of Object.entries(updates || {})) {
    const key = `${rawKey || ""}`.trim().toUpperCase();
    const setting = SETTING_BY_KEY.get(key);
    if (!setting) {
      errors.push({ key, message: "Deze env key is niet toegestaan via snelle dashboard-instellingen." });
      continue;
    }
    try {
      if (setting.type === "boolean") {
        normalized[key] = normalizeBoolean(rawValue);
      } else {
        normalized[key] = normalizeNumber(rawValue, setting);
      }
    } catch (error) {
      errors.push({ key, message: error.message });
    }
  }
  return { updates: normalized, errors };
}

export function buildDashboardQuickSettingsStatus(values = {}) {
  return listDashboardQuickSettings().map((setting) => ({
    ...setting,
    value: values[setting.key] ?? "",
    effectiveValue: values[setting.key] ?? setting.defaultValue ?? ""
  }));
}

export function buildDashboardQuickSettingsPreview(values = {}, updates = {}) {
  const normalized = normalizeDashboardQuickSettingUpdates(updates);
  return {
    updates: normalized.updates,
    errors: normalized.errors,
    items: Object.keys(normalized.updates).map((key) => {
      const setting = SETTING_BY_KEY.get(key);
      return {
        ...setting,
        before: values[key] ?? "",
        after: normalized.updates[key],
        changed: (values[key] ?? "") !== normalized.updates[key]
      };
    })
  };
}
