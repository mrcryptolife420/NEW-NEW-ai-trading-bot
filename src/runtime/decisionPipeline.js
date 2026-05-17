import { nowIso } from "../utils/time.js";
import { buildDecisionFunnelEvidence } from "./decisionFunnel.js";

function topReasonCodes(decision = {}) {
  if (decision.riskVerdict?.rejections?.length) {
    return decision.riskVerdict.rejections.map((item) => item.code).slice(0, 6);
  }
  if (Array.isArray(decision.reasons)) {
    return decision.reasons.slice(0, 6);
  }
  return [];
}

function buildDecisionId(cycleId, symbol) {
  return `${cycleId}:${symbol || "unknown"}`;
}

async function recordSignalAudit(bot, candidates = [], cycleId, mode) {
  const topCandidates = (Array.isArray(candidates) ? candidates : []).slice(0, 6);
  await Promise.all(topCandidates.map((candidate) => bot.auditLog?.record?.("signal_decision", {
    cycleId,
    decisionId: buildDecisionId(cycleId, candidate.symbol),
    mode,
    symbol: candidate.symbol,
    status: candidate.decision?.allow ? "candidate_allowed" : "candidate_blocked",
    reasonCodes: topReasonCodes(candidate.decision),
    metrics: {
      probability: candidate.score?.probability ?? null,
      threshold: candidate.decision?.threshold ?? null,
      opportunityScore: candidate.decision?.opportunityScore ?? null,
      quoteAmount: candidate.decision?.quoteAmount ?? null
    },
    details: {
      rankScore: candidate.decision?.rankScore ?? null,
      entryMode: candidate.decision?.entryMode || "standard"
    }
  })));
}

async function recordDecisionOutcomeAudit(bot, {
  cycleId,
  mode,
  selectedCandidate = null,
  entryAttempt = {}
} = {}) {
  const selectedSymbol = selectedCandidate?.symbol || entryAttempt.selectedSymbol || null;
  const selectedDecision = selectedCandidate?.decision || {};
  const reasonCodes = topReasonCodes(selectedDecision);
  await bot.auditLog?.record?.("risk_decision", {
    cycleId,
    decisionId: buildDecisionId(cycleId, selectedSymbol),
    mode,
    symbol: selectedSymbol,
    status: selectedDecision.allow ? "allowed" : "rejected",
    reasonCodes,
    metrics: {
      quoteAmount: selectedDecision.quoteAmount ?? null,
      allocatorScore: selectedDecision.portfolioSummary?.allocatorScore ?? null
    },
    details: {
      riskVerdict: selectedDecision.riskVerdict || null
    }
  });
  await bot.auditLog?.record?.("trade_intent", {
    cycleId,
    decisionId: buildDecisionId(cycleId, selectedSymbol),
    mode,
    symbol: selectedSymbol,
    status: entryAttempt.status || "idle",
    reasonCodes: [...new Set([...(entryAttempt.blockedReasons || []), ...(entryAttempt.symbolBlockers || []).map((item) => item.reason)])].slice(0, 6),
    metrics: {
      attemptedSymbols: (entryAttempt.attemptedSymbols || []).length,
      allowedCandidates: entryAttempt.allowedCandidates || 0,
      skippedCandidates: entryAttempt.skippedCandidates || 0
    }
  });
  await bot.auditLog?.record?.("execution_result", {
    cycleId,
    decisionId: buildDecisionId(cycleId, selectedSymbol),
    mode,
    symbol: selectedSymbol,
    status: entryAttempt.openedPosition ? "executed" : (entryAttempt.status || "blocked"),
    reasonCodes: entryAttempt.openedPosition ? [] : [...new Set([...(entryAttempt.blockedReasons || []), ...(entryAttempt.entryErrors || []).map((item) => item.error)])].slice(0, 6),
    metrics: {
      opened: Boolean(entryAttempt.openedPosition),
      entryErrors: (entryAttempt.entryErrors || []).length
    }
  });
}

export async function executeDecisionPipeline(bot, {
  cycleAt = nowIso(),
  balance,
  candidates = null,
  executionBlockers = []
} = {}) {
  const mode = bot.config?.botMode || "paper";
  const resolvedCandidates = Array.isArray(candidates) ? candidates : await bot.scanCandidatesForCycle(balance);
  await recordSignalAudit(bot, resolvedCandidates, cycleAt, mode);
  const entryAttempt = await bot.openBestCandidate(resolvedCandidates, { executionBlockers });
  const selectedCandidate = resolvedCandidates.find((candidate) => candidate.symbol === (entryAttempt.selectedSymbol || entryAttempt.openedPosition?.symbol)) || resolvedCandidates[0] || null;
  const decisionFunnel = buildDecisionFunnelEvidence({
    cycleId: cycleAt,
    mode,
    candidates: resolvedCandidates,
    selectedCandidate,
    entryAttempt
  });
  if (bot.runtime && typeof bot.runtime === "object") {
    bot.runtime.signalFlow = bot.runtime.signalFlow || {};
    bot.runtime.signalFlow.lastCycle = {
      ...(bot.runtime.signalFlow.lastCycle || {}),
      decisionFunnel
    };
    bot.runtime.signalFlow.decisionFunnel = decisionFunnel;
  }
  await recordDecisionOutcomeAudit(bot, {
    cycleId: cycleAt,
    mode,
    selectedCandidate,
    entryAttempt
  });
  return {
    cycleAt,
    candidates: resolvedCandidates,
    entryAttempt,
    openedPosition: entryAttempt.openedPosition || null,
    signalDecision: selectedCandidate
      ? {
          id: buildDecisionId(cycleAt, selectedCandidate.symbol),
          decisionId: decisionFunnel.selectedDecision?.decisionId || buildDecisionId(cycleAt, selectedCandidate.symbol),
          cycleId: cycleAt,
          mode,
          symbol: selectedCandidate.symbol,
          stage: decisionFunnel.selectedDecision?.stage || null,
          primaryReason: decisionFunnel.selectedDecision?.primaryReason || null,
          reasonCodes: decisionFunnel.selectedDecision?.reasonCodes || [],
          reasonCategories: decisionFunnel.selectedDecision?.reasonCategories || {},
          nextSafeAction: decisionFunnel.selectedDecision?.nextSafeAction || null,
          probability: selectedCandidate.score?.probability ?? null,
          threshold: selectedCandidate.decision?.threshold ?? null,
          allow: Boolean(selectedCandidate.decision?.allow)
        }
      : null,
    riskVerdict: selectedCandidate?.decision?.riskVerdict || null,
    tradeIntent: {
      symbol: selectedCandidate?.symbol || null,
      status: entryAttempt.status || "idle",
      attemptedSymbols: [...(entryAttempt.attemptedSymbols || [])]
    },
    executionResult: {
      status: entryAttempt.openedPosition ? "executed" : (entryAttempt.status || "blocked"),
      openedPosition: entryAttempt.openedPosition || null,
      errors: [...(entryAttempt.entryErrors || [])]
    },
    decisionFunnel
  };
}
