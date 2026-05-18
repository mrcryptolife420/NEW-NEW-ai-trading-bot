const PROVIDERS = [
  { id: "binance_rest", group: "market", criticality: "critical", freshnessSloMs: 30_000, budgetClass: "core" },
  { id: "binance_stream", group: "market", criticality: "critical", freshnessSloMs: 10_000, budgetClass: "core" },
  { id: "binance_cms", group: "announcements", criticality: "medium", freshnessSloMs: 900_000, budgetClass: "context" },
  { id: "news_rss", group: "news", criticality: "low", freshnessSloMs: 900_000, budgetClass: "context" },
  { id: "market_sentiment", group: "sentiment", criticality: "low", freshnessSloMs: 1_800_000, budgetClass: "context" },
  { id: "volatility", group: "volatility", criticality: "medium", freshnessSloMs: 600_000, budgetClass: "context" }
];

export function listProviderSloRegistry() {
  return PROVIDERS.map((provider) => ({ ...provider }));
}

export function getProviderSlo(id) {
  return listProviderSloRegistry().find((provider) => provider.id === id) || null;
}
