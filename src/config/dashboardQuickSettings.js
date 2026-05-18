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
