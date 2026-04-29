import { nowIso } from "../utils/time.js";

const CATEGORY_RULES = [
  { match: /^operator_/, category: "operator", scope: "workflow" },
  { match: /^dashboard_feed_/, category: "dashboard", scope: "feed" },
  { match: /^entry_/, category: "execution", scope: "entry" },
  { match: /^paper_/, category: "paper", scope: "lifecycle" },
  { match: /^position_/, category: "execution", scope: "position" },
  { match: /^cycle_/, category: "runtime", scope: "cycle" },
  { match: /^stream_/, category: "runtime", scope: "stream" },
  { match: /^self_heal_/, category: "runtime", scope: "self_heal" },
  { match: /^exchange_truth_/, category: "risk", scope: "exchange_truth" },
  { match: /^market_scan_/, category: "market", scope: "scanner" },
  { match: /^research_/, category: "research", scope: "workflow" }
];

function inferCategory(type = "") {
  const normalized = `${type || ""}`.trim().toLowerCase();
  const match = CATEGORY_RULES.find((rule) => rule.match.test(normalized));
  return match?.category || "runtime";
}

function inferScope(type = "", category = "runtime") {
  const normalized = `${type || ""}`.trim().toLowerCase();
  const match = CATEGORY_RULES.find((rule) => rule.match.test(normalized));
  if (match?.scope) {
    return match.scope;
  }
  const firstToken = normalized.split("_")[0];
  return firstToken || category;
}

export function buildDomainEvent(type, payload = {}) {
  const eventAt = payload.at || nowIso();
  const category = payload.category || inferCategory(type);
  const scope = payload.scope || inferScope(type, category);
  return {
    at: eventAt,
    type,
    category,
    scope,
    domainType: `${category}.${scope}.${type}`,
    ...payload
  };
}

export function recordDomainEvent(journal, type, payload = {}) {
  if (!journal || typeof journal !== "object") {
    return buildDomainEvent(type, payload);
  }
  journal.events = Array.isArray(journal.events) ? journal.events : [];
  const event = buildDomainEvent(type, payload);
  journal.events.push(event);
  return event;
}
