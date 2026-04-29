import { buildExecutionFeedbackDataset } from "../../runtime/executionFeedbackLearning.js";

export function buildExecutionFeedbackProvider({
  enabled = true,
  symbol = null,
  journal = {},
  sessionSummary = {},
  regimeSummary = {},
  strategySummary = {},
  marketSnapshot = {}
} = {}) {
  if (!enabled) {
    return {
      id: "execution_feedback",
      status: "disabled",
      enabled: false,
      score: 0,
      note: "Execution feedback provider disabled.",
      data: {}
    };
  }
  const dataset = buildExecutionFeedbackDataset({
    journal,
    symbol,
    session: sessionSummary?.session || null,
    regime: regimeSummary?.regime || null,
    family: strategySummary?.family || null
  });
  const status = dataset.status || "unavailable";

  return {
    id: "execution_feedback",
    status,
    enabled: true,
    score: dataset.executionQualityScore || 0,
    note: status === "ready"
      ? "Execution feedback built from recent scoped fills."
      : status === "warmup"
        ? "Execution feedback still warming up; scoped fill sample is small."
        : "Execution feedback unavailable for this scope.",
    data: {
      ...dataset,
      expectedSpreadBps: Number.isFinite(dataset.expectedSpreadBps) && dataset.expectedSpreadBps > 0
        ? dataset.expectedSpreadBps
        : Number.isFinite(marketSnapshot?.book?.spreadBps)
          ? Number(marketSnapshot.book.spreadBps.toFixed(2))
          : null
    }
  };
}
