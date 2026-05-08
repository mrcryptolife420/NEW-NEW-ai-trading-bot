import { stableId } from "../ai/neural/utils.js";

const SECRET_PATTERN = /(api[_-]?key|secret|token|authorization|webhook|signature)=?\S*/i;

export function buildOperatorNote({ type = "general", target = {}, text = "", author = "operator", createdAt = new Date().toISOString() } = {}) {
  const containsSecretWarning = SECRET_PATTERN.test(text);
  return {
    noteId: stableId("note", [type, target.id || target.symbol || target.strategyId, text, createdAt]),
    type,
    target,
    text: containsSecretWarning ? text.replace(SECRET_PATTERN, "[REDACTED]") : text,
    author,
    createdAt,
    warnings: containsSecretWarning ? ["secret_like_content_redacted"] : [],
    tradingBehaviorChanged: false
  };
}

export function searchOperatorNotes(notes = [], query = "") {
  const needle = `${query}`.toLowerCase();
  return notes.filter((note) => JSON.stringify(note).toLowerCase().includes(needle));
}
