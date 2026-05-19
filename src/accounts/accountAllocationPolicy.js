function buildAccountAllocationPolicy(accounts = []) {
  return {
    accounts: accounts.map((account) => ({
      id: String(account.id),
      mode: String(account.mode || "paper"),
      venue: String(account.venue || account.mode || "paper"),
      maxBudget: Math.max(0, Number(account.maxBudget || account.balance || 0)),
      allowDuplicateExposure: Boolean(account.allowDuplicateExposure)
    }))
  };
}

function splitPortfolioBudget({ policy, totalBudget = 0 } = {}) {
  const accounts = policy?.accounts || [];
  const capacity = accounts.reduce((sum, account) => sum + account.maxBudget, 0) || 1;
  return accounts.map((account) => ({
    accountId: account.id,
    mode: account.mode,
    budget: Math.min(account.maxBudget, Number(totalBudget) * (account.maxBudget / capacity))
  }));
}

function validateBrokerRoute({ account, order = {}, existingExposure = [] } = {}) {
  const blockers = [];
  if (!account?.id) blockers.push("missing_account");
  if (order.mode === "live" && account?.mode !== "live") blockers.push("live_order_requires_live_account");
  if (order.mode === "live" && account?.venue === "paper") blockers.push("live_order_cannot_route_to_paper_venue");
  const duplicate = existingExposure.some((item) => item.symbol === order.symbol && item.accountId !== account?.id);
  if (duplicate && !account?.allowDuplicateExposure) blockers.push("duplicate_cross_account_exposure");
  return {
    allowed: blockers.length === 0,
    blockers
  };
}

export { buildAccountAllocationPolicy, splitPortfolioBudget, validateBrokerRoute };
