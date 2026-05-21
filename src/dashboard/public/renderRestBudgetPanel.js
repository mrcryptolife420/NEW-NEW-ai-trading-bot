export function buildRestBudgetView(restBudget = {}) {
  const banActive = Boolean(restBudget.banActive);
  const backoffActive = Boolean(restBudget.backoffActive || restBudget.nextAllowedAt);
  const schedulerAction = restBudget.schedulerAction || (banActive ? "paused_by_ban" : backoffActive ? "delayed" : "ready");
  const status = banActive ? "paused-by-ban" : backoffActive ? "delayed" : "ready";
  return { status, badge: status, schedulerAction, banActive, backoffActive };
}

export function renderRestBudgetPanel(snapshot = {}) {
  const restBudget = snapshot.restBudget || snapshot.dashboard?.restBudget || (snapshot.schedulerAction || snapshot.topRestCallers || snapshot.banActive || snapshot.backoffActive ? snapshot : {});
  const view = buildRestBudgetView(restBudget);
  const topCallers = Array.isArray(restBudget.topRestCallers)
    ? restBudget.topRestCallers
    : Object.entries(restBudget.topRestCallers || {}).map(([caller, item]) => ({ caller, weight: item.weight || item.totalWeight || 0 }));
  return [
    `<section id="rest-budget-panel" data-status="${view.status}">`,
    `<h2>REST budget</h2>`,
    `<span id="rest-budget-badge">${view.status}</span>`,
    `<span id="rest-budget-action">${view.schedulerAction}</span>`,
    `<span id="rest-budget-freshness">${restBudget.freshness || "unknown"}</span>`,
    `<ul id="rest-budget-callers">${topCallers.slice(0, 5).map((item) => `<li>${item.caller || item.key || "unknown"}</li>`).join("")}</ul>`,
    `</section>`
  ].join("");
}
