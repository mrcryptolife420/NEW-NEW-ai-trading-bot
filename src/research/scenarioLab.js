import crypto from "node:crypto";

export function buildScenario(input = {}) {
  const scenario = {
    id: input.id || "scenario",
    marketData: input.marketData || [],
    configOverrides: input.configOverrides || {},
    policyOverrides: input.policyOverrides || {},
    strategyVariant: input.strategyVariant || "baseline",
    modelVariant: input.modelVariant || "baseline",
    executionAssumptions: input.executionAssumptions || { feeBps: 10, slippageBps: 5 },
    shock: input.shock || null
  };
  return { ...scenario, hash: hashScenario(scenario) };
}

export function runScenarioOffline(input = {}) {
  const scenario = buildScenario(input);
  const rows = scenario.marketData.map((row) => applyShock(row, scenario.shock));
  const grossReturn = rows.reduce((sum, row) => sum + Number(row.returnPct || 0), 0);
  const cost = rows.length * (Number(scenario.executionAssumptions.feeBps || 0) + Number(scenario.executionAssumptions.slippageBps || 0)) / 10000;
  return { scenario, result: { rows: rows.length, grossReturn, netReturn: grossReturn - cost }, mutatesRuntimeState: false, usesLiveBroker: false };
}

export function compareScenarios(baseline = {}, challenger = {}) {
  const base = baseline.result || runScenarioOffline(baseline).result;
  const next = challenger.result || runScenarioOffline(challenger).result;
  return { baseline: base, challenger: next, deltaNetReturn: next.netReturn - base.netReturn };
}

function applyShock(row, shock) {
  if (!shock) return row;
  return { ...row, price: Number(row.price || 0) * (1 + Number(shock.pricePct || 0)), returnPct: Number(row.returnPct || 0) + Number(shock.returnPct || 0) };
}

function hashScenario(scenario) {
  return crypto.createHash("sha256").update(JSON.stringify(scenario)).digest("hex");
}
