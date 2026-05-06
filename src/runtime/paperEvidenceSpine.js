import { buildLearningEvidenceRecord } from "./learningEvidencePipeline.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, fallback = null) {
  if (value == null) return fallback;
  const normalized = `${value}`.trim();
  return normalized || fallback;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function idOf(record = {}) {
  return text(record.decisionId || record.candidateId || record.tradeId || record.id, null);
}

function resolveSetupType(source = {}) {
  return text(
    source.setupType ||
      source.strategyId ||
      source.strategyFamily ||
      source.strategy?.setupStyle ||
      source.strategy?.id,
    "unknown_setup"
  );
}

function resolveState({ decision = {}, candidate = {}, trade = null } = {}) {
  if (trade) return "trade_linked";
  const source = { ...obj(candidate), ...obj(decision) };
  if (source.approved === false || source.allow === false || source.rootBlocker || source.blockedReason) {
    return "blocked_setup";
  }
  if (source.approved === true || source.allow === true) {
    return "approved_without_trade";
  }
  return "observed";
}

function tradeMatchesDecision(trade = {}, decision = {}) {
  const decisionId = text(decision.decisionId || decision.id, null);
  const tradeDecisionId = text(trade.decisionId || trade.entryDecisionId || trade.metadata?.decisionId, null);
  if (decisionId && tradeDecisionId && decisionId === tradeDecisionId) return true;
  const symbol = text(decision.symbol, null);
  return Boolean(symbol && symbol === text(trade.symbol, null));
}

export function buildPaperEvidencePacket({
  decision = {},
  candidate = null,
  trade = null,
  futureMarketPath = null,
  marketAfterExit = {},
  reconcileSummary = {},
  strategySummary = {},
  now = new Date().toISOString()
} = {}) {
  const mergedCandidate = obj(candidate || decision);
  const mergedDecision = {
    ...mergedCandidate,
    ...obj(decision),
    decisionId: text(decision.decisionId || decision.id || mergedCandidate.decisionId || mergedCandidate.id, null),
    setupType: resolveSetupType({ ...mergedCandidate, ...obj(decision) })
  };
  const learningEvidence = buildLearningEvidenceRecord({
    decision: mergedDecision,
    trade,
    futureMarketPath,
    marketAfterExit,
    reconcileSummary,
    strategySummary
  });
  const state = resolveState({ decision: mergedDecision, candidate: mergedCandidate, trade });
  const rootBlocker = text(
    mergedDecision.rootBlocker ||
      mergedDecision.primaryRootBlocker ||
      mergedDecision.blockedReason ||
      mergedDecision.blocker,
    null
  );
  const packet = {
    packetId: [
      "paper_evidence",
      text(mergedDecision.decisionId, null) || text(mergedCandidate.candidateId || mergedCandidate.id, null) || text(trade?.id || trade?.tradeId, "unknown")
    ].join(":"),
    decisionId: text(mergedDecision.decisionId, null),
    candidateId: text(mergedCandidate.candidateId || mergedCandidate.id, null),
    tradeId: text(trade?.id || trade?.tradeId, null),
    symbol: text(mergedDecision.symbol || mergedCandidate.symbol || trade?.symbol, null),
    setupType: learningEvidence.setupType || mergedDecision.setupType || "unknown_setup",
    state,
    rootBlocker,
    thesis: learningEvidence.thesis,
    outcome: {
      veto: learningEvidence.vetoOutcome?.label || "unknown_veto",
      exit: learningEvidence.exitQuality?.label || "unknown_exit_quality",
      regime: learningEvidence.regimeOutcome?.realizedRegime || learningEvidence.regimeOutcome?.outcome || "unknown"
    },
    exitQuality: learningEvidence.exitQuality,
    failureMode: learningEvidence.failureMode,
    replayPriority: learningEvidence.replayPriority,
    recommendedAction: learningEvidence.recommendedAction,
    confidence: safeNumber(learningEvidence.confidence, 0.25),
    evidenceLinks: {
      hasDecision: Boolean(idOf(mergedDecision)),
      hasCandidate: Boolean(idOf(mergedCandidate)),
      hasTrade: Boolean(trade),
      hasFuturePath: Boolean(futureMarketPath),
      hasThesis: Boolean(learningEvidence.thesis?.primaryReason)
    },
    sourceOfTruth: "json_ndjson",
    readModelEligible: true,
    paperOnly: true,
    diagnosticsOnly: true,
    liveBehaviorChanged: false,
    createdAt: now
  };
  return packet;
}

export function buildPaperEvidenceSpine({
  decisions = [],
  candidates = [],
  trades = [],
  futureMarketPathsByDecisionId = {},
  limit = 50,
  now
} = {}) {
  const cappedLimit = Math.max(1, Math.min(250, Math.trunc(safeNumber(limit, 50))));
  const decisionItems = arr(decisions).slice(0, cappedLimit);
  const candidateItems = arr(candidates);
  const tradeItems = arr(trades);
  const usedTrades = new Set();
  const packets = decisionItems.map((decision) => {
    const candidate = candidateItems.find((item) => idOf(item) && idOf(item) === idOf(decision)) || decision;
    const trade = tradeItems.find((item) => !usedTrades.has(idOf(item)) && tradeMatchesDecision(item, decision)) || null;
    if (trade) usedTrades.add(idOf(trade));
    const decisionId = text(decision.decisionId || decision.id, null);
    return buildPaperEvidencePacket({
      decision,
      candidate,
      trade,
      futureMarketPath: decisionId ? futureMarketPathsByDecisionId[decisionId] : null,
      now
    });
  });
  return {
    status: packets.length ? "ready" : "empty",
    packets,
    summary: summarizePaperEvidenceSpine(packets),
    paperOnly: true,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function summarizePaperEvidenceSpine(packets = []) {
  const items = arr(packets);
  const byState = {};
  const bySetupType = {};
  const byRootBlocker = {};
  const missingLinks = {
    decision: 0,
    candidate: 0,
    trade: 0,
    futurePath: 0,
    thesis: 0
  };
  for (const packet of items) {
    byState[packet.state || "unknown"] = (byState[packet.state || "unknown"] || 0) + 1;
    bySetupType[packet.setupType || "unknown_setup"] = (bySetupType[packet.setupType || "unknown_setup"] || 0) + 1;
    if (packet.rootBlocker) {
      byRootBlocker[packet.rootBlocker] = (byRootBlocker[packet.rootBlocker] || 0) + 1;
    }
    for (const [key, hasLink] of Object.entries(obj(packet.evidenceLinks))) {
      const normalizedKey = key.startsWith("has")
        ? `${key.slice(3, 4).toLowerCase()}${key.slice(4)}`
        : key;
      if (Object.prototype.hasOwnProperty.call(missingLinks, normalizedKey) && !hasLink) {
        missingLinks[normalizedKey] += 1;
      }
    }
  }
  return {
    status: items.length ? "ready" : "empty",
    count: items.length,
    byState,
    bySetupType,
    byRootBlocker,
    missingLinks,
    topReplayCandidates: items
      .map((item) => item.replayPriority)
      .filter(Boolean)
      .sort((left, right) => safeNumber(right.priority, 0) - safeNumber(left.priority, 0))
      .slice(0, 5),
    packets: items.slice(0, 40),
    paperOnly: true,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
