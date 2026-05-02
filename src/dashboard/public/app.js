import { resolveStatusTone as statusTone } from "../../shared/statusTone.js";

const POLL_MS = 15000;
const DECISION_LIMIT = 6;
const STORAGE_KEYS = { showAllDecisions: "dashboard.showAllDecisions" };

function createElements(doc) {
  const q = (selector) => doc?.querySelector?.(selector) || null;
  return {
    modeBadge: q("#modeBadge"),
    runStateBadge: q("#runStateBadge"),
    healthBadge: q("#healthBadge"),
    refreshBadge: q("#refreshBadge"),
    controlHint: q("#controlHint"),
    operatorSummary: q("#operatorSummary"),
    startBtn: q("#startBtn"),
    stopBtn: q("#stopBtn"),
    paperBtn: q("#paperBtn"),
    liveBtn: q("#liveBtn"),
    refreshBtn: q("#refreshBtn"),
    decisionSearch: q("#decisionSearch"),
    decisionAllowedOnly: q("#decisionAllowedOnly"),
    decisionMeta: q("#decisionMeta"),
    decisionShowMoreBtn: q("#decisionShowMoreBtn"),
    overviewCards: q("#overviewCards"),
    attentionList: q("#attentionList"),
    actionList: q("#actionList"),
    quickActionsList: q("#quickActionsList"),
    focusList: q("#focusList"),
    positionsList: q("#positionsList"),
    recentTradesList: q("#recentTradesList"),
    opportunityList: q("#opportunityList"),
    healthList: q("#healthList"),
    learningList: q("#learningList"),
    diagnosticsList: q("#diagnosticsList"),
    explainabilityList: q("#explainabilityList"),
    promotionList: q("#promotionList")
  };
}

let activeDocument = typeof document !== "undefined" ? document : null;
let elements = createElements(activeDocument);
let latestSnapshot = null;
let busy = false;
let requestEpoch = 0;
let latestAppliedEpoch = 0;
let searchQuery = "";
let allowedOnly = false;
let showAllDecisions = readStoredBoolean(STORAGE_KEYS.showAllDecisions, false);
let lastSnapshotReceivedAt = null;
let latestActionResult = null;
const renderFallbackSections = new Set();

function makeNode(tag, { className = "", text = "", attrs = {} } = {}) {
  if (!activeDocument?.createElement) {
    throw new Error("dashboard_document_unavailable");
  }
  const node = activeDocument.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null || value === "") continue;
    const key = `${name}`.trim();
    const lower = key.toLowerCase();
    if (!key || lower.startsWith("on")) continue;
    node.setAttribute(key, `${value}`);
  }
  return node;
}

function replaceChildren(element, children = []) {
  if (element) {
    element.replaceChildren(...children.filter(Boolean));
  }
}

function setStyleProperty(node, name, value) {
  if (node?.style?.setProperty) {
    node.style.setProperty(name, value);
  }
}

function makeTag(text, className = "tag") {
  return makeNode("span", { className, text });
}

function makeTagList(items = []) {
  const list = makeNode("div", { className: "tag-list" });
  list.append(...items.filter(Boolean));
  return list;
}

function makeEmptyState(text) {
  return makeNode("div", { className: "empty", text });
}

function makeCard({ title, detail, tone = "neutral", body = null, metrics = [] }, className = "stack-card") {
  const node = makeNode("article", { className: `${className} ${tone}`.trim() });
  if (title) node.append(makeNode("h3", { text: title }));
  if (detail) node.append(makeNode("p", { text: detail }));
  if (body) node.append(body);
  if (metrics.length) node.append(makeTagList(metrics));
  return node;
}

function makeMetricCard({ label, value, detail, tone = "neutral" }) {
  const node = makeNode("article", { className: `overview-card ${tone}`.trim() });
  node.append(
    makeNode("h3", { text: label }),
    makeNode("div", { className: "overview-value", text: value || "-" }),
    makeNode("p", { text: detail || "-" })
  );
  return node;
}

function makeMetricRow(items = []) {
  const row = makeNode("div", { className: "metric-row" });
  for (const item of items.filter(Boolean)) {
    const metric = makeNode("div", { className: "metric" });
    metric.append(
      makeNode("span", { className: "metric-label", text: item.label || "-" }),
      makeNode("strong", { text: item.value || "-" })
    );
    if (item.detail) {
      metric.append(makeNode("span", { className: "metric-foot", text: item.detail }));
    }
    row.append(metric);
  }
  return row;
}

function compactJoin(parts = [], separator = " | ") {
  return parts.filter(Boolean).join(separator);
}

function clamp(value, min = 0, max = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : min;
}

function readStoredBoolean(key, fallback = false) {
  try {
    return typeof localStorage === "undefined" ? fallback : localStorage.getItem(key) === "1";
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key, value) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value ? "1" : "0");
    }
  } catch {}
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(Number(value))
    ? new Intl.NumberFormat("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value))
    : "-";
}

function formatMoney(value) {
  return Number.isFinite(Number(value))
    ? new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: Math.abs(Number(value)) >= 100 ? 0 : 2,
        maximumFractionDigits: Math.abs(Number(value)) >= 100 ? 0 : 2
      }).format(Number(value))
    : "$0";
}

function formatPct(value, digits = 1) {
  return Number.isFinite(Number(value)) ? `${formatNumber(Number(value) * 100, digits)}%` : "-";
}

function formatSignedPct(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return "-";
  const numeric = Number(value);
  return `${numeric >= 0 ? "+" : ""}${formatNumber(numeric * 100, digits)}%`;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("nl-NL", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
    : "-";
}

function minutesSince(value, reference = new Date().toISOString()) {
  const targetMs = value ? new Date(value).getTime() : Number.NaN;
  const referenceMs = reference ? new Date(reference).getTime() : Date.now();
  return Number.isFinite(targetMs) && Number.isFinite(referenceMs)
    ? Math.max(0, (referenceMs - targetMs) / 60000)
    : null;
}

function formatAgeCompact(value, reference = new Date().toISOString()) {
  const ageMinutes = minutesSince(value, reference);
  if (ageMinutes == null) return null;
  if (ageMinutes < 1) return "<1m";
  if (ageMinutes < 60) return `${Math.round(ageMinutes)}m`;
  if (ageMinutes < 1440) return `${formatNumber(ageMinutes / 60, 1)}u`;
  return `${formatNumber(ageMinutes / 1440, 1)}d`;
}

function titleize(value) {
  return `${value || ""}`
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase()) || "-";
}

function truncate(text, max = 120) {
  const value = `${text || ""}`.trim();
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}...`;
}

function humanizeReason(value, fallback = "-") {
  return value ? titleize(value) : fallback;
}

function buildSnapshotFreshnessSummary(snapshot) {
  const dashboard = snapshot?.dashboard || {};
  const snapshotMeta = dashboard.snapshotMeta || {};
  const generatedAt = snapshotMeta.generatedAt || dashboard.generatedAt || snapshot?.generatedAt || null;
  const analysisAt = snapshotMeta.lastAnalysisAt || dashboard.overview?.lastAnalysisAt || null;
  const cycleAt = snapshotMeta.lastCycleAt || dashboard.overview?.lastCycleAt || null;
  const portfolioAt = snapshotMeta.lastPortfolioUpdateAt || dashboard.overview?.lastPortfolioUpdateAt || null;
  const degradedFeeds = Number(snapshotMeta.dashboardFeedDegradedCount || dashboard.ops?.service?.dashboardFeeds?.degradedCount || 0);
  const analysisAgeMinutes = snapshotMeta.analysisAgeMinutes ?? minutesSince(analysisAt, generatedAt);
  const cycleAgeMinutes = snapshotMeta.cycleAgeMinutes ?? minutesSince(cycleAt, generatedAt);
  const portfolioAgeMinutes = snapshotMeta.portfolioAgeMinutes ?? minutesSince(portfolioAt, generatedAt);
  const stale = (analysisAgeMinutes != null && analysisAgeMinutes > 30) || (cycleAgeMinutes != null && cycleAgeMinutes > 30);
  const tone = degradedFeeds > 0 ? "negative" : stale ? "warning" : "positive";
  return {
    generatedAt,
    tone,
    headline: compactJoin([
      generatedAt ? `snapshot ${formatDate(generatedAt)}` : null,
      analysisAgeMinutes != null ? `analyse ${formatAgeCompact(analysisAt, generatedAt)} oud` : null
    ]),
    detail: compactJoin([
      cycleAgeMinutes != null ? `cycle ${formatAgeCompact(cycleAt, generatedAt)} oud` : null,
      portfolioAgeMinutes != null ? `portfolio ${formatAgeCompact(portfolioAt, generatedAt)} oud` : null,
      degradedFeeds > 0 ? `${degradedFeeds} feed issue(s)` : null
    ])
  };
}

function buildRecentTradeEmptyState(snapshot) {
  const decisionFunnel = snapshot?.dashboard?.ops?.signalFlow?.tradingFlowHealth?.decisionFunnel
    || snapshot?.dashboard?.ops?.signalFlow?.lastCycle?.decisionFunnel
    || snapshot?.dashboard?.report?.decisionFunnel
    || {};
  const created = Number(decisionFunnel.candidatesCreated || 0);
  const viable = Number(decisionFunnel.viableCandidates || 0);
  const attempts = Number(decisionFunnel.executionAttempts || 0);
  if (created > 0 || viable > 0 || attempts > 0) {
    return compactJoin([
      "Nog geen recente trades.",
      created > 0 ? `Laatste cycle: ${created} candidates` : null,
      viable > 0 ? `${viable} viable` : null,
      `executiepogingen ${attempts}`
    ], " ");
  }
  return "Nog geen recente trades om te tonen.";
}

function decisionPrimaryReason(decision = {}) {
  if (!decision || typeof decision !== "object") return null;
  return decision.decisionTruth?.primaryReason || decision.primaryReason || decision.blockerReasons?.[0] || decision.operatorAction || null;
}

function showDashboardRenderIssue(section, error) {
  renderFallbackSections.add(section);
  console.error?.(`dashboard_render_issue:${section}`, error);
}

function safeRenderSection(section, renderFn) {
  try {
    renderFallbackSections.delete(section);
    renderFn();
    return null;
  } catch (error) {
    showDashboardRenderIssue(section, error);
    return { section, error };
  }
}

function syncRenderHealthBanner(snapshot) {
  if (!elements.controlHint) return;
  if (renderFallbackSections.size) {
    elements.controlHint.textContent = `Dashboard rendering deels gedegradeerd: ${[...renderFallbackSections].join(", ")}`;
    return;
  }
  const readiness = snapshot?.dashboard?.ops?.readiness || snapshot?.manager?.readiness || {};
  const deck = buildOperatorDeckFromSnapshot(snapshot);
  elements.controlHint.textContent = deck.subline || readiness.note || "Overzicht geladen.";
}

function makeSignalMiniChart(decision = {}) {
  const threshold = Math.max(Number(decision.threshold) || 0, 0.0001);
  const probability = clamp(decision.probability || 0);
  const confidence = clamp(decision.confidenceBreakdown?.overallConfidence || 0);
  const edgeRatio = clamp((decision.probability || 0) / threshold);
  const chart = makeNode("div", { className: "signal-mini-chart" });
  [probability * 0.7, confidence * 0.58, edgeRatio * 0.9, probability * 0.88, confidence * 0.8].forEach((value) => {
    const bar = makeNode("span", { className: "signal-mini-bar" });
    setStyleProperty(bar, "--bar-height", `${Math.round(clamp(value, 0.12, 1) * 100)}%`);
    chart.append(bar);
  });
  return chart;
}

function makePositionGauge(position = {}) {
  const pnlPct = Number(position.unrealizedPnlPct) || 0;
  const gauge = makeNode("div", { className: `position-gauge ${pnlPct >= 0 ? "positive" : "negative"}` });
  setStyleProperty(gauge, "--gauge-fill", `${Math.round(clamp((pnlPct + 0.05) / 0.1) * 100)}%`);
  gauge.append(
    makeNode("span", { className: "position-gauge-value", text: formatSignedPct(pnlPct, 1) }),
    makeNode("span", { className: "position-gauge-label", text: "Open P/L" })
  );
  return gauge;
}

function buildMissedTradeMetricTags(analysis = {}, { compact = false } = {}) {
  const tags = [];
  if (Number.isFinite(analysis.badVetoRate)) tags.push(makeTag(`bad_veto ${formatPct(analysis.badVetoRate, compact ? 0 : 1)}`));
  if (Number.isFinite(analysis.averageMissedMovePct)) tags.push(makeTag(`avg_move ${formatPct(analysis.averageMissedMovePct, compact ? 0 : 1)}`));
  if (analysis.topOverblockedScope?.id) tags.push(makeTag(`shadow_evidence ${titleize(analysis.topOverblockedScope.id)}`));
  if ((analysis.totalCounterfactuals || 0) > 0) tags.push(makeTag(`queued_cases ${analysis.totalCounterfactuals}`));
  if (analysis.topBlocker?.id) tags.push(makeTag(`blocker ${titleize(analysis.topBlocker.id)}`));
  return tags;
}

function buildLearningDigest(snapshot) {
  const dashboard = snapshot?.dashboard || {};
  const offlineTrainer = dashboard.offlineTrainer || {};
  const adaptiveLearning = dashboard.adaptiveLearning || {};
  const badVetoLearning = dashboard.badVetoLearning || dashboard.ops?.badVetoLearning || {};
  const onlineAdaptation = dashboard.onlineAdaptation || dashboard.ops?.onlineAdaptation || {};
  const missedTradeTuning = dashboard.ops?.missedTradeTuning || {};
  const missedTrades = dashboard.ops?.learningInsights?.missedTrades || {};
  const lowConfidenceAudit = dashboard.ops?.lowConfidenceAudit || {};
  const blockerFriction = dashboard.ops?.learningInsights?.blockerFriction || {};
  const paperSizing = blockerFriction.paperSizing || {};
  const thresholdPolicy = offlineTrainer.thresholdPolicy || {};
  const topRecommendation = thresholdPolicy.topRecommendation || {};
  const parameterOptimization = adaptiveLearning.parameterOptimization || offlineTrainer.parameterOptimization || {};
  const topUniverseSymbol = (dashboard.watchlist?.topSymbols || [])[0] || {};
  const tuningStatus = missedTradeTuning.actionClass || topRecommendation.actionClass || topRecommendation.action || "observe";
  return [
    {
      title: "Adaptive learning",
      detail: compactJoin([
        titleize(adaptiveLearning.status || "warmup"),
        adaptiveLearning.note || null,
        onlineAdaptation.lastApplied?.symbol ? `laatste ${onlineAdaptation.lastApplied.symbol}` : null
      ]),
      tone: adaptiveLearning.status === "active" ? "positive" : "neutral"
    },
    {
      title: "Threshold policy",
      detail: compactJoin([
        topRecommendation.id ? `${titleize(topRecommendation.id)} ${titleize(tuningStatus)}` : titleize(thresholdPolicy.status || "stable"),
        topRecommendation.dominantFeedback ? titleize(topRecommendation.dominantFeedback) : null,
        Number.isFinite(topRecommendation.adjustment) ? `shift ${formatPct(topRecommendation.adjustment || 0, 1)}` : null
      ]),
      tone: ["scoped_harden", "tighten"].includes(tuningStatus) ? "negative" : ["scoped_soften", "paper_only"].includes(tuningStatus) ? "positive" : "neutral"
    },
    {
      title: "Missed trades",
      detail: compactJoin([
        missedTradeTuning.topBlocker ? titleize(missedTradeTuning.topBlocker) : null,
        missedTradeTuning.actionClass ? titleize(missedTradeTuning.actionClass) : null,
        missedTrades.note || missedTradeTuning.dominantFeedback || null
      ]),
      tone: missedTrades.status === "priority" ? "negative" : "neutral",
      metrics: buildMissedTradeMetricTags(missedTrades, { compact: true })
    },
    {
      title: "Confidence drivers",
      detail: compactJoin([
        titleize(lowConfidenceAudit.status || "quiet"),
        lowConfidenceAudit.dominantDriver ? `driver ${titleize(lowConfidenceAudit.dominantDriver)}` : null,
        Number.isFinite(lowConfidenceAudit.nearMissCount) ? `${lowConfidenceAudit.nearMissCount} near-miss` : null,
        lowConfidenceAudit.topDrivers?.[0]?.id ? `top ${titleize(lowConfidenceAudit.topDrivers[0].id)} x${lowConfidenceAudit.topDrivers[0].count || 0}` : null,
        lowConfidenceAudit.note || null
      ]),
      tone: lowConfidenceAudit.status === "priority" ? "warning" : lowConfidenceAudit.status === "watch" ? "neutral" : "positive"
    },
    {
      title: "Optimization",
      detail: compactJoin([
        parameterOptimization.topCandidate
          ? titleize(parameterOptimization.topCandidate.id || parameterOptimization.topCandidate)
          : null,
        parameterOptimization.scopedCandidateCount ? `${parameterOptimization.scopedCandidateCount} scoped` : null,
        parameterOptimization.livePromotionAllowed === false ? "live blocked" : null,
        parameterOptimization.note || null
      ]),
      tone: "neutral"
    },
    {
      title: "Bad-veto learning",
      detail: compactJoin([
        titleize(badVetoLearning.status || "warmup"),
        badVetoLearning.recommendations?.[0]?.blocker ? humanizeReason(badVetoLearning.recommendations[0].blocker) : null,
        badVetoLearning.recommendations?.[0]?.family ? `scope ${titleize(badVetoLearning.recommendations[0].family)}` : null,
        badVetoLearning.note || null
      ]),
      tone: badVetoLearning.status === "active" ? "positive" : "neutral"
    },
    {
      title: "Universe scorer",
      detail: compactJoin([
        topUniverseSymbol.symbol || null,
        Number.isFinite(topUniverseSymbol.universeScore) ? `score ${topUniverseSymbol.universeScore.toFixed(2)}` : null,
        topUniverseSymbol.universeScoreDrivers?.spreadStabilityScore != null ? `spread ${topUniverseSymbol.universeScoreDrivers.spreadStabilityScore.toFixed(2)}` : null,
        topUniverseSymbol.universeScoreDrivers?.paperExpectancyScore != null ? `paper ${topUniverseSymbol.universeScoreDrivers.paperExpectancyScore.toFixed(2)}` : null
      ]) || "Geen universe-score drivers beschikbaar.",
      tone: topUniverseSymbol.symbol ? "positive" : "neutral"
    },
    {
      title: "Sizing friction",
      detail: compactJoin([
        paperSizing.note || null,
        paperSizing.dominantFamily ? titleize(paperSizing.dominantFamily) : null,
        paperSizing.dominantRegime ? titleize(paperSizing.dominantRegime) : null,
        Number.isFinite(paperSizing.averageQuoteFloorRatio) ? `avg ratio ${paperSizing.averageQuoteFloorRatio.toFixed(2)}` : null
      ]),
      tone: paperSizing.tinyCount > 0 ? "warning" : paperSizing.count > 0 ? "negative" : "neutral"
    }
  ];
}

function unresolvedAlerts(snapshot) {
  return (snapshot?.dashboard?.ops?.alerts?.alerts || []).filter((item) => !item.resolvedAt && !item.muted);
}

function buildOperatorDeckFromSnapshot(snapshot) {
  const dashboard = snapshot?.dashboard || {};
  if (dashboard.operatorDeck) return dashboard.operatorDeck;
  const overview = dashboard.overview || {};
  const readiness = dashboard.ops?.readiness || snapshot?.manager?.readiness || {};
  const signalFlow = dashboard.ops?.signalFlow?.tradingFlowHealth || {};
  const paperPath = dashboard.ops?.signalFlow?.paperPathDiagnosis || signalFlow.paperPathDiagnosis || {};
  const inactivityWatchdog = dashboard.ops?.signalFlow?.tradingFlowHealth?.inactivityWatchdog || dashboard.ops?.signalFlow?.inactivityWatchdog || signalFlow.inactivityWatchdog || {};
  const decisionFunnel = signalFlow.decisionFunnel || dashboard.report?.decisionFunnel || {};
  const capitalPolicy = dashboard.ops?.capitalPolicy || {};
  const executionCost = dashboard.report?.executionCostSummary || {};
  const manualReviewQueue = dashboard.ops?.manualReviewQueue || dashboard.snapshotMeta?.manualReviewQueue || {};
  const snapshotPerformance = dashboard.snapshotMeta?.performance || {};
  const tradableDecision = (dashboard.topDecisions || []).find((item) => item.allow) || null;
  const topBlocked = (dashboard.blockedSetups || [])[0] || null;
  const urgentAlert = unresolvedAlerts(snapshot)[0] || null;
  const probeOnly = Boolean(capitalPolicy?.governor?.allowProbeEntries && capitalPolicy?.allowEntries === false);
  const dominantBlocker = signalFlow.dominantBlocker || decisionPrimaryReason(topBlocked) || (readiness.reasons || [])[0] || null;
  const cards = [
    {
      id: "system",
      label: "System state",
      value: titleize(readiness.status || "unknown"),
      detail: compactJoin([titleize(overview.mode || snapshot?.manager?.currentMode || "paper"), overview.lastCycleAt ? formatDate(overview.lastCycleAt) : null]),
      tone: readiness.status === "ready" ? "positive" : "negative"
    },
    {
      id: "focus",
      label: "Focus",
      value: tradableDecision ? `${tradableDecision.symbol} tradebaar` : titleize(readiness.status === "ready" ? "waiting" : readiness.status || "blocked"),
      detail: tradableDecision?.summary || tradableDecision?.operatorAction || humanizeReason(dominantBlocker, "Wachten op valide setup."),
      tone: tradableDecision ? "positive" : dominantBlocker ? "negative" : "neutral"
    },
    {
      id: "capital",
      label: "Capital",
      value: formatMoney(overview.equity || 0),
      detail: compactJoin([
        `Budget ${formatMoney(overview.effectiveBudget?.deployableBudget || 0)}`,
        (probeOnly || overview.effectiveBudget?.probeEntriesAllowed) && overview.effectiveBudget?.probeBudget > 0
          ? `Probe budget ${formatMoney(overview.effectiveBudget.probeBudget)}`
          : null,
        (probeOnly || overview.effectiveBudget?.probeEntriesAllowed) && overview.sizingGuide?.paperProbeQuote
          ? `Probe size ${formatMoney(overview.sizingGuide.paperProbeQuote)}`
          : null,
        probeOnly || overview.effectiveBudget?.probeEntriesAllowed ? "Probe only" : null,
        overview.sizingGuide?.effectivePaperMinTradeUsdt ? `Paper floor ${formatMoney(overview.sizingGuide.effectivePaperMinTradeUsdt)}` : null,
        Number(overview.openExposure || 0) > 0 ? `Exposure ${formatMoney(overview.openExposure || 0)}` : null
      ]),
      tone: (overview.effectiveBudget?.deployableBudget || 0) > 0 ? "positive" : "neutral"
    },
    {
      id: "freshness",
      label: "Data freshness",
      value: titleize(dashboard.ops?.service?.status || dashboard.marketHistory?.status || "unknown"),
      detail: dashboard.marketHistory?.note || "Controleer feed freshness en laatste analyse.",
      tone: dashboard.ops?.service?.status === "degraded" ? "negative" : "positive"
    }
  ];
  return {
    headline: cards[1].value,
    subline: cards[1].detail,
    dominantBlocker,
    tradeState: {
      status: tradableDecision ? "can_trade" : dominantBlocker ? "blocked" : "waiting",
      headline: cards[1].value,
      detail: cards[1].detail,
      symbol: tradableDecision?.symbol || null
    },
    cards,
    attention: [
      urgentAlert ? { title: urgentAlert.title || "Alert", detail: urgentAlert.action || urgentAlert.reason || "-", tone: "negative" } : null,
    dominantBlocker ? { title: "Dominant blocker", detail: humanizeReason(dominantBlocker), tone: "negative" } : null,
      decisionFunnel.inactivityWarning
        ? {
            title: "Decision funnel",
            detail: decisionFunnel.inactivityWarning,
            tone: signalFlow.status === "blocked" ? "negative" : "warning"
          }
        : null,
      paperPath.status && paperPath.status !== "idle"
        ? {
            title: "Paper path",
            detail: compactJoin([
              paperPath.headline || null,
              paperPath.reason ? humanizeReason(paperPath.reason) : null,
              paperPath.lastPersistedAt ? `laatste persist ${formatDate(paperPath.lastPersistedAt)}` : null
            ]),
            tone: ["persisted"].includes(paperPath.status)
              ? "positive"
              : ["executed_not_persisted", "viable_no_execution"].includes(paperPath.status)
                ? "negative"
                : "warning"
          }
        : null,
      inactivityWatchdog.active
        ? {
            title: "Functional inactivity",
            detail: compactJoin([
              inactivityWatchdog.headline || null,
              inactivityWatchdog.detail || null,
              inactivityWatchdog.recommendedAction || inactivityWatchdog.activeCases?.[0]?.action || null
            ]),
            tone: ["critical", "high"].includes(inactivityWatchdog.status) ? "negative" : "warning"
          }
        : null,
      manualReviewQueue.pendingCount
        ? {
            title: "Manual review queue",
            detail: compactJoin([
              `${manualReviewQueue.pendingCount} case(s)`,
              manualReviewQueue.overdueCount ? `${manualReviewQueue.overdueCount} overdue` : null,
              manualReviewQueue.oldestAgeMinutes != null ? `oldest ${manualReviewQueue.oldestAgeMinutes}m` : null
            ]),
            tone: manualReviewQueue.overdueCount ? "negative" : "warning"
          }
        : null,
      snapshotPerformance.slowSections?.length
        ? {
            title: "Snapshot performance",
            detail: compactJoin([
              `slow ${snapshotPerformance.slowSections.join(", ")}`,
              snapshotPerformance.totalDurationMs != null ? `${snapshotPerformance.totalDurationMs}ms totaal` : null
            ]),
            tone: snapshotPerformance.overBudget ? "warning" : "neutral"
          }
        : null,
      executionCost.reconstructedPaperFeeSample
        ? {
            title: "Execution-cost sample",
            detail: executionCost.reconstructedPaperEntryFeeCount > 0
              ? `Paper entry-fees werden voor ${executionCost.reconstructedPaperEntryFeeCount} trade(s) uit fee-config gereconstrueerd.`
              : "Een deel van de paper fee-sample werd uit fee-config gereconstrueerd.",
            tone: "neutral"
          }
        : null
    ].filter(Boolean),
    actions: dashboard.operatorDiagnostics?.actionItems || [],
    advanced: {
      topDecisionCount: (dashboard.topDecisions || []).length,
      blockedCount: (dashboard.blockedSetups || []).length,
      positionCount: (dashboard.positions || []).length,
      recentTradeCount: (dashboard.report?.recentTrades || []).length
    }
  };
}

function buildMutationHeaders() {
  return { "content-type": "application/json", "x-dashboard-request": "1" };
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: method === "GET" ? undefined : buildMutationHeaders(),
    body: method === "GET" ? undefined : JSON.stringify(body || {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload;
}

function pickSnapshot(payload) {
  return payload?.dashboard ? payload : payload?.payload ? payload.payload : payload;
}

function toneClass(value) {
  return ["positive", "negative", "warning", "neutral"].includes(value) ? value : "neutral";
}

function summaryPill(label, value, tone = "neutral") {
  const pill = makeNode("div", { className: `headline-pill ${toneClass(tone)}` });
  pill.append(makeNode("strong", { text: label }), makeNode("span", { text: value || "-" }));
  return pill;
}

function setBadge(node, text, tone = "neutral") {
  if (!node) return;
  node.textContent = text;
  node.className = `status-chip ${toneClass(tone)}`.trim();
}

function renderBadges(snapshot) {
  const manager = snapshot?.manager || {};
  const readiness = snapshot?.dashboard?.ops?.readiness || manager.readiness || {};
  const freshness = buildSnapshotFreshnessSummary(snapshot);
  setBadge(elements.modeBadge, titleize(snapshot?.dashboard?.overview?.mode || manager.currentMode || "paper"), "neutral");
  setBadge(elements.runStateBadge, titleize(manager.runState || "idle"), statusTone(manager.runState || "idle"));
  setBadge(elements.healthBadge, titleize(readiness.status || "unknown"), statusTone(readiness.status || "unknown"));
  if (elements.refreshBadge) {
    elements.refreshBadge.textContent = compactJoin([
      `Snapshot: ${formatDate(freshness.generatedAt || lastSnapshotReceivedAt || snapshot?.generatedAt)}`,
      freshness.detail || null
    ]);
  }
}

function renderHero(snapshot) {
  const deck = buildOperatorDeckFromSnapshot(snapshot);
  const children = [
    summaryPill("Status", deck.headline, deck.tradeState?.status === "can_trade" ? "positive" : deck.tradeState?.status === "blocked" ? "negative" : "neutral"),
    summaryPill("Belangrijkste reden", deck.dominantBlocker ? humanizeReason(deck.dominantBlocker) : "Geen kritieke blocker", deck.dominantBlocker ? "negative" : "positive"),
    summaryPill("Nu doen", deck.actions?.[0]?.detail || deck.actions?.[0]?.title || deck.subline || "Monitoren", "neutral")
  ];
  replaceChildren(elements.operatorSummary, children);
}

function renderOverview(snapshot) {
  const cards = buildOperatorDeckFromSnapshot(snapshot).cards || [];
  replaceChildren(elements.overviewCards, cards.map((card) => makeMetricCard(card)));
}

function renderAttention(snapshot) {
  const deck = buildOperatorDeckFromSnapshot(snapshot);
  const attention = deck.attention?.length ? deck.attention : [{ title: "Geen urgente alerts", detail: "Het systeem draait zonder directe operator-acties.", tone: "positive" }];
  const actions = deck.actions?.length
    ? deck.actions.map((item) => ({
        title: item.title || "Actie",
        detail: item.detail || item.reason || "-",
        tone: item.priority === "high" ? "negative" : item.priority === "medium" ? "warning" : "neutral"
      }))
    : [{ title: "Geen open operator tasks", detail: "Alleen blijven monitoren.", tone: "positive" }];
  replaceChildren(elements.attentionList, attention.map((item) => makeCard(item)));
  replaceChildren(elements.actionList, actions.map((item) => makeCard(item)));
}

function renderFocus(snapshot) {
  const dashboard = snapshot?.dashboard || {};
  const readiness = dashboard.ops?.readiness || snapshot?.manager?.readiness || {};
  const deck = buildOperatorDeckFromSnapshot(snapshot);
  const topDecisions = dashboard.topDecisions || [];
  const blockedSetups = dashboard.blockedSetups || [];
  const tradable = topDecisions.find((item) => item.allow);
  const blocker = blockedSetups[0];
  const cards = [
    makeCard({
      title: "Can it trade now?",
      detail: tradable ? `${tradable.symbol} staat klaar om te handelen.` : titleize(readiness.status || "waiting"),
      tone: tradable ? "positive" : readiness.status === "ready" ? "neutral" : "negative",
      body: makeMetricRow([
        { label: "Top setup", value: tradable?.symbol || "-", detail: tradable?.strategy?.strategyLabel || tradable?.strategyLabel || "-" },
        { label: "Threshold", value: formatPct(tradable?.threshold || 0, 1), detail: `Prob ${formatPct(tradable?.probability || 0, 1)}` },
        { label: "Confidence", value: formatPct(tradable?.confidenceBreakdown?.overallConfidence || 0, 1), detail: tradable?.setupQuality?.tier || "-" }
      ])
    }, "focus-card"),
    makeCard({
      title: "Dominant blocker",
      detail: deck.dominantBlocker ? humanizeReason(deck.dominantBlocker) : "Geen dominante blocker zichtbaar.",
      tone: deck.dominantBlocker ? "negative" : "positive",
      body: makeMetricRow([
        { label: "Blocked setups", value: `${blockedSetups.length}`, detail: "laatste snapshot" },
        { label: "Readiness", value: titleize(readiness.status || "unknown"), detail: compactJoin((readiness.reasons || []).slice(0, 2).map(humanizeReason)) || "-" },
        { label: "Top blocked", value: blocker?.symbol || "-", detail: blocker?.strategy?.strategyLabel || blocker?.strategyLabel || "-" }
      ])
    }, "focus-card")
  ];
  replaceChildren(elements.focusList, cards);
}

function renderPositions(snapshot) {
  const positions = snapshot?.dashboard?.positions || [];
  if (!positions.length) {
    replaceChildren(elements.positionsList, [makeEmptyState("Geen open posities.")]);
    return;
  }
  replaceChildren(elements.positionsList, positions.slice(0, 4).map((position) => {
    const entryCapital = Number(position.totalCost) || Number(position.notional) || 0;
    const lc = position.lifecycle || {};
    const lifecycleLabel = compactJoin([
      lc.state ? `lifecycle: ${titleize(lc.state)}` : null,
      lc.operatorMode && lc.operatorMode !== "normal" ? titleize(lc.operatorMode) : null
    ]);
    const needsManualReview = Boolean(lc.manualReviewRequired || lc.state === "manual_review");
    const needsReconcile = Boolean(lc.reconcileRequired || lc.state === "reconcile_required");
    const reconcileDecisionLabel = lc.autoReconcileDecision ? titleize(lc.autoReconcileDecision) : null;
    const reconcileEvidence = lc.reconcileEvidence || {};
    const reconcileHint = compactJoin([
      lc.reconcileReason ? humanizeReason(lc.reconcileReason) : null,
      Number.isFinite(Number(reconcileEvidence.quantityDiff)) && Number(reconcileEvidence.quantityDiff) > 0
        ? `qty drift ${formatNumber(reconcileEvidence.quantityDiff, 6)}`
        : null,
      Number.isFinite(Number(reconcileEvidence.priceMismatchBps))
        ? `price ${formatNumber(reconcileEvidence.priceMismatchBps, 1)} bps`
        : null,
      reconcileEvidence.protectionMissing ? "protection missing" : null,
      reconcileEvidence.snapshotPartial ? "snapshot partial" : null
    ]);
    const body = makeNode("div");
    body.append(
      makeMetricRow([
        {
          label: "PnL",
          value: formatMoney(position.unrealizedPnl || 0),
          detail: formatSignedPct(position.unrealizedPnlPct || 0, 1)
        },
        {
          label: "Ingezet",
          value: formatMoney(entryCapital),
          detail: entryCapital ? `nu ${formatMoney(position.marketValue || 0)}` : "-"
        },
        {
          label: "Entry → nu",
          value: formatMoney(position.entryPrice || 0),
          detail: formatMoney(position.currentPrice || 0)
        }
      ]),
      makePositionGauge(position)
    );
    if (lifecycleLabel) {
      body.append(makeNode("p", { className: "position-lifecycle-hint", text: lifecycleLabel }));
    }
    if (needsReconcile) {
      body.append(
        makeNode("p", {
          className: "position-lifecycle-hint",
          text: compactJoin([
            reconcileDecisionLabel ? `Auto reconcile: ${reconcileDecisionLabel}` : "Reconcile vereist",
            reconcileHint || null,
            lc.lastReconcileCheckAt ? `laatste check ${formatDate(lc.lastReconcileCheckAt)}` : null,
            lc.autoReconcileAttemptCount ? `pogingen ${lc.autoReconcileAttemptCount}` : null
          ]) || "Reconcile vereist"
        })
      );
    }
    if (lc.reconcileRetrySummary?.eventCount) {
      body.append(
        makeNode("p", {
          className: "position-lifecycle-hint",
          text: compactJoin([
            `history ${lc.reconcileRetrySummary.eventCount}`,
            lc.reconcileRetrySummary.retryCount ? `retry ${lc.reconcileRetrySummary.retryCount}` : null,
            lc.reconcileRetrySummary.escalatedAfterAttempts ? `escalated after ${lc.reconcileRetrySummary.escalatedAfterAttempts}` : null,
            lc.reconcileRetrySummary.latestReason ? humanizeReason(lc.reconcileRetrySummary.latestReason) : null
          ]) || "Reconcile history beschikbaar"
        })
      );
    }
    if (arr(lc.reconcileRetryHistory || []).length) {
      body.append(
        makeNode("p", {
          className: "position-lifecycle-hint",
          text: arr(lc.reconcileRetryHistory || [])
            .slice(-3)
            .map((item) => compactJoin([
              item.action ? humanizeReason(item.action) : humanizeReason(item.decision || "reconcile"),
              item.reason ? humanizeReason(item.reason) : null
            ]))
            .join(" | ")
        })
      );
    }
    if (lc.lastAutoReconcileAction && lc.lastAutoReconcileAction !== "verify_only") {
      body.append(
        makeNode("p", {
          className: "position-lifecycle-hint",
          text: `Laatste reconcile-actie: ${titleize(lc.lastAutoReconcileAction)}`
        })
      );
    }
    if (lc.lastAutoReconcileError) {
      body.append(
        makeNode("p", {
          className: "position-lifecycle-hint",
          text: `Reconcile fout: ${truncate(lc.lastAutoReconcileError, 120)}`
        })
      );
    }
    if (needsManualReview && position.id) {
      const row = makeNode("div", { className: "position-actions" });
      const reviewBtn = makeNode("button", { className: "ghost ghost-small", type: "button", text: "Markeer als beoordeeld" });
      reviewBtn.addEventListener("click", () =>
        mutateAndRefresh("/api/positions/review", { id: position.id, note: "dashboard manual review" }).catch((error) =>
          console.error?.("position_review_failed", error)
        )
      );
      row.append(
        reviewBtn,
        makeNode("span", { className: "position-id-hint", text: `id ${truncate(position.id, 36)}` })
      );
      body.append(row);
    }
    return makeCard({
      title: position.symbol || "-",
      detail: compactJoin([position.side ? titleize(position.side) : null, position.gridContext?.gridBand ? titleize(position.gridContext.gridBand) : null]),
      body,
      tone: Number(position.unrealizedPnl || 0) >= 0 ? "positive" : "negative"
    }, "position-card");
  }));
}

function renderRecentTrades(snapshot) {
  const trades = snapshot?.dashboard?.report?.recentTrades || [];
  if (!trades.length) {
    replaceChildren(elements.recentTradesList, [makeEmptyState(buildRecentTradeEmptyState(snapshot))]);
    return;
  }
  replaceChildren(elements.recentTradesList, trades.slice(0, 5).map((trade) => makeCard({
    title: trade.symbol || "-",
    detail: compactJoin([
      trade.brokerMode ? titleize(trade.brokerMode) : null,
      trade.strategyLabel || trade.strategyAtEntry || null,
      (trade.reasonLabel || trade.exitReason || trade.reason) ? `exit ${titleize(trade.reasonLabel || trade.exitReason || trade.reason)}` : null,
      trade.exitAt ? formatDate(trade.exitAt) : null
    ]),
    body: makeMetricRow([
      { label: "PnL", value: formatMoney(trade.pnlQuote || 0), detail: formatSignedPct(trade.netPnlPct || 0, 1) },
      { label: "Entry", value: formatMoney(trade.entryPrice || 0) },
      { label: "Exit", value: formatMoney(trade.exitPrice || 0) }
    ]),
    tone: Number(trade.pnlQuote || 0) >= 0 ? "positive" : "negative"
  }, "trade-card")));
}

function buildOpportunityCards(snapshot) {
  const topDecisions = (snapshot?.dashboard?.topDecisions || []).map((item) => ({ ...item, _kind: "decision" }));
  const blockedSetups = (snapshot?.dashboard?.blockedSetups || []).map((item) => ({ ...item, _kind: "blocked" }));
  const combined = [...topDecisions, ...blockedSetups];
  const filtered = combined.filter((item) => {
    if (allowedOnly && !item.allow) return false;
    if (!searchQuery) return true;
    const haystack = [
      item.symbol,
      item.strategy?.strategyLabel,
      item.strategyLabel,
      item.strategy?.family,
      item.marketState?.phase,
      decisionPrimaryReason(item)
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(searchQuery);
  });
  return filtered.slice(0, showAllDecisions ? Math.max(filtered.length, DECISION_LIMIT) : DECISION_LIMIT);
}

function renderOpportunityBoard(snapshot) {
  const cards = buildOpportunityCards(snapshot);
  const total = (snapshot?.dashboard?.topDecisions || []).length + (snapshot?.dashboard?.blockedSetups || []).length;
  if (elements.decisionMeta) {
    elements.decisionMeta.textContent = `${cards.length}/${total} zichtbaar`;
  }
  if (elements.decisionShowMoreBtn) {
    elements.decisionShowMoreBtn.textContent = showAllDecisions ? "Toon minder" : "Toon meer";
  }
  if (!cards.length) {
    replaceChildren(elements.opportunityList, [makeEmptyState("Geen kansen of blokkades die aan de filter voldoen.")]);
    return;
  }
  replaceChildren(elements.opportunityList, cards.map((decision) => {
    const support = decision.decisionSupportDiagnostics || {};
    const supportSummary = support.summary || {};
    const tags = [
      makeTag(decision.allow ? "tradebaar" : "blocked", decision.allow ? "tag positive" : "tag negative"),
      decision.strategy?.strategyLabel ? makeTag(decision.strategy.strategyLabel) : null,
      decision.scannerPriority?.scannerLane ? makeTag(`lane ${decision.scannerPriority.scannerLane}`) : null,
      decision.gridContext?.gridEntrySide ? makeTag(titleize(decision.gridContext.gridEntrySide)) : null,
      support.status && support.status !== "disabled" ? makeTag(`support ${titleize(support.status)}`) : null
    ].filter(Boolean);
    const body = makeNode("div");
    body.append(
      makeMetricRow([
        { label: "Prob", value: formatPct(decision.probability || 0, 1), detail: `Thr ${formatPct(decision.threshold || 0, 1)}` },
        {
          label: "Conf",
          value: formatPct(decision.confidenceBreakdown?.overallConfidence || 0, 1),
          detail: compactJoin([
            decision.setupQuality?.tier || null,
            decision.entryDiagnostics?.confidence?.finalEdge != null ? `edge ${formatPct(decision.entryDiagnostics.confidence.finalEdge || 0, 1)}` : null,
            decision.entryDiagnostics?.confidence?.paperRelief > 0 ? `relief ${formatPct(decision.entryDiagnostics.confidence.paperRelief || 0, 1)}` : null
          ]) || "-"
        },
        { label: "Reason", value: humanizeReason(decisionPrimaryReason(decision), "-"), detail: decision.marketState?.phase ? titleize(decision.marketState.phase) : "-" }
      ]),
      ...(support.status && support.status !== "disabled" ? [makeMetricRow([
        {
          label: "Net edge",
          value: Number.isFinite(Number(supportSummary.netEdgeBps)) ? `${formatNumber(supportSummary.netEdgeBps, 1)} bps` : "n/a",
          detail: support.netEdgeGate?.status ? titleize(support.netEdgeGate.status) : "-"
        },
        {
          label: "Breakout risk",
          value: Number.isFinite(Number(supportSummary.failedBreakoutRisk)) ? formatPct(supportSummary.failedBreakoutRisk, 0) : "n/a",
          detail: support.failedBreakoutDetector?.status ? titleize(support.failedBreakoutDetector.status) : "-"
        },
        {
          label: "Leadership",
          value: support.leadershipContext?.leadershipState ? titleize(support.leadershipContext.leadershipState) : "n/a",
          detail: compactJoin([
            support.spotFuturesDivergence?.status ? `basis ${titleize(support.spotFuturesDivergence.status)}` : null,
            support.fundingOiMatrix?.status ? `OI ${titleize(support.fundingOiMatrix.status)}` : null
          ]) || "-"
        }
      ])] : []),
      makeSignalMiniChart(decision),
      makeTagList(tags)
    );
    return makeCard({
      title: decision.symbol || "-",
      detail: truncate(decision.summary || decision.operatorAction || decision.executionSummary || "Geen extra samenvatting."),
      body,
      tone: decision.allow ? "positive" : "negative"
    }, "signal-card");
  }));
}

function renderHealth(snapshot) {
  const dashboard = snapshot?.dashboard || {};
  const ops = dashboard.ops || {};
  const service = dashboard.ops?.service || {};
  const history = dashboard.marketHistory || {};
  const sourceReliability = dashboard.sourceReliability?.externalFeeds || {};
  const marketProviders = dashboard.marketProviders || ops.marketProviders || {};
  const signalFlow = dashboard.ops?.signalFlow || {};
  const flowHealth = signalFlow.tradingFlowHealth || {};
  const inactivityWatchdog = flowHealth.inactivityWatchdog || signalFlow.inactivityWatchdog || {};
  const decisionFunnel = flowHealth.decisionFunnel || dashboard.report?.decisionFunnel || {};
  const alphaPermissionSplit = flowHealth.alphaPermissionSplit || {};
  const lifecycle = ops.botLifecycle || snapshot?.manager?.lifecycle || {};
  const botHealth = ops.health || snapshot?.manager?.readiness || {};
  const dataFreshness = ops.dataFreshness || {};
  const exchangeConnectivity = ops.exchangeConnectivity || {};
  const requestWeight = dashboard.requestWeight || ops.requestWeight || exchangeConnectivity.requestWeight || {};
  const readModel = dashboard.readModel || dashboard.report?.readModel || {};
  const requestBudget = readModel.requestBudget || dashboard.requestBudgetSummary || {};
  const tradingImprovements = dashboard.tradingImprovementDiagnostics || ops.tradingImprovementDiagnostics || {};
  const readModelTables = readModel.tables || {};
  const topReadModelBlocker = arr(readModel.topBlockers || [])[0] || null;
  const dangerousScorecards = arr(readModel.topScorecards || []).filter((item) => ["dangerous", "negative_edge"].includes(item.status));
  const latestReplay = readModel.latestReplay || null;
  const readModelRunbook = arr(readModel.operatorRunbooks || [])[0] || null;
  const lifecycleDiagnostics = readModel.strategyLifecycleDiagnostics || {};
  const mode = ops.mode || {};
  const topRejections = arr(ops.topRejections || []);
  const riskLocks = ops.riskLocks || {};
  const rootBlocker = ops.rootBlocker || {};
  const audit = ops.audit || {};
  const runtimeDegradationReasons = arr(botHealth.runtimeDegradationReasons || riskLocks.runtimeDegradationReasons || []);
  const entryBlockingReasons = arr(botHealth.tradeEntryBlockingReasons || riskLocks.entryBlockingReasons || []);
  const reconcileTimeline = arr(exchangeConnectivity.reconcileTimeline || ops.reconcileTimeline || []);
  const freshness = buildSnapshotFreshnessSummary(snapshot);
  const items = [
    {
      title: "Snapshot freshness",
      detail: compactJoin([
        freshness.headline || null,
        freshness.detail || null
      ]) || "Snapshot-freshness onbekend.",
      tone: freshness.tone
    },
    {
      title: "Bot lifecycle",
      detail: compactJoin([
        lifecycle.state ? titleize(lifecycle.state) : null,
        lifecycle.activity ? `activity ${titleize(lifecycle.activity)}` : null,
        lifecycle.updatedAt ? `updated ${formatAgeCompact(lifecycle.updatedAt)}` : null
      ]) || "Lifecycle onbekend.",
      tone: lifecycle.state === "degraded" ? "negative" : lifecycle.state === "running" ? "positive" : "neutral"
    },
    {
      title: "Operational health",
      detail: compactJoin([
        botHealth.status ? titleize(botHealth.status) : null,
        botHealth.reason ? humanizeReason(botHealth.reason) : null,
        service.status ? `feeds ${titleize(service.status)}` : null,
        service.note || null
      ]) || "Operationele gezondheid onbekend.",
      tone: ["blocked", "degraded"].includes(botHealth.status) || service.status === "degraded" ? "negative" : "positive"
    },
    {
      title: "Root blocker",
      detail: rootBlocker.primaryRootBlocker
        ? compactJoin([
            humanizeReason(rootBlocker.primaryRootBlocker.reason || rootBlocker.primaryRootBlocker.id || "blocker"),
            rootBlocker.primaryRootBlocker.scope ? `scope ${titleize(rootBlocker.primaryRootBlocker.scope)}` : null,
            arr(rootBlocker.primaryRootBlocker.symbols || []).length
              ? arr(rootBlocker.primaryRootBlocker.symbols || []).slice(0, 3).join(", ")
              : null,
            arr(rootBlocker.downstreamSymptoms || []).length
              ? `symptoms ${arr(rootBlocker.downstreamSymptoms || []).slice(0, 2).map(humanizeReason).join(", ")}`
              : null
          ])
        : "Geen dominante root blocker gedetecteerd.",
      tone: rootBlocker.primaryRootBlocker ? "negative" : "positive"
    },
    {
      title: "Entry blockers",
      detail: entryBlockingReasons.length
        ? compactJoin([
            entryBlockingReasons.slice(0, 3).map(humanizeReason).join(", "),
            riskLocks.manualReviewPending ? "manual review pending" : null,
            arr(riskLocks.exchangeSafetyBlockedSymbols || []).length
              ? `${arr(riskLocks.exchangeSafetyBlockedSymbols || []).length} blocked symbol(s)`
              : null
          ])
        : "Geen globale entry blockers buiten symbool-scoped safety.",
      tone: entryBlockingReasons.length || riskLocks.manualReviewPending ? "negative" : "positive"
    },
    {
      title: "Runtime degradation",
      detail: runtimeDegradationReasons.length
        ? compactJoin([
            runtimeDegradationReasons.slice(0, 3).map(humanizeReason).join(", "),
            service.status ? `feeds ${titleize(service.status)}` : null,
            service.note || null
          ])
        : "Geen aparte runtime degradation actief.",
      tone: runtimeDegradationReasons.length ? "warning" : "positive"
    },
    {
      title: "Mode & exchange",
      detail: compactJoin([
        mode.botMode ? `mode ${titleize(mode.botMode)}` : null,
        mode.tradingSource ? `source ${titleize(mode.tradingSource)}` : null,
        exchangeConnectivity.exchangeTruthStatus ? `truth ${titleize(exchangeConnectivity.exchangeTruthStatus)}` : null,
        exchangeConnectivity.globalFreezeEntries
          ? `global freeze${exchangeConnectivity.globalFreezeReason ? ` ${humanizeReason(exchangeConnectivity.globalFreezeReason)}` : ""}`
          : exchangeConnectivity.freezeEntries
            ? "entries frozen"
            : arr(exchangeConnectivity.blockedSymbols || []).length
              ? "symbol locks active"
              : null,
        exchangeConnectivity.autoReconcileSummary
          ? `auto ${exchangeConnectivity.autoReconcileSummary.autoResolvedCount || 0}/${exchangeConnectivity.autoReconcileSummary.retryCount || 0}/${exchangeConnectivity.autoReconcileSummary.manualRequiredCount || 0}`
          : null
      ]) || "Mode en exchange-status onbekend.",
      tone: exchangeConnectivity.globalFreezeEntries || exchangeConnectivity.freezeEntries ? "negative" : arr(exchangeConnectivity.blockedSymbols || []).length ? "warning" : "neutral"
    },
    {
      title: "Data freshness",
      detail: compactJoin([
        dataFreshness.lastAnalysisAt ? `analyse ${formatAgeCompact(dataFreshness.lastAnalysisAt, dataFreshness.snapshotGeneratedAt || freshness.generatedAt)}` : null,
        dataFreshness.lastCycleAt ? `cycle ${formatAgeCompact(dataFreshness.lastCycleAt, dataFreshness.snapshotGeneratedAt || freshness.generatedAt)}` : null,
        dataFreshness.lastPortfolioUpdateAt ? `portfolio ${formatAgeCompact(dataFreshness.lastPortfolioUpdateAt, dataFreshness.snapshotGeneratedAt || freshness.generatedAt)}` : null
      ]) || "Geen freshness-data beschikbaar.",
      tone: freshness.tone
    },
    { title: "Dashboard feeds", detail: compactJoin([titleize(service.status || "unknown"), service.note || null]), tone: service.status === "degraded" ? "negative" : "positive" },
    { title: "Market history", detail: compactJoin([titleize(history.status || "unknown"), history.note || null]), tone: history.status === "degraded" ? "negative" : "neutral" },
    {
      title: "Read model",
      detail: compactJoin([
        titleize(readModel.status || "unknown"),
        readModelTables.trades != null ? `${readModelTables.trades} trades` : null,
        readModelTables.decisions != null ? `${readModelTables.decisions} decisions` : null,
        readModelTables.replayTraces != null ? `${readModelTables.replayTraces} replays` : null,
        readModel.rebuiltAt ? `rebuilt ${formatAgeCompact(readModel.rebuiltAt, freshness.generatedAt)}` : null,
        readModel.error || null
      ]) || "SQLite read-model niet beschikbaar; dashboard gebruikt runtime fallback.",
      tone: readModel.status === "ready" ? "positive" : readModel.status === "unavailable" ? "warning" : "neutral"
    },
    {
      title: "Read-model blockers",
      detail: compactJoin([
        topReadModelBlocker ? `${humanizeReason(topReadModelBlocker.reason)} x${topReadModelBlocker.count || 0}` : "Geen blocker-historie in read-model.",
        dangerousScorecards.length ? `${dangerousScorecards.length} risky scorecard(s)` : null,
        readModelRunbook?.action || null,
        readModelRunbook?.actionLinks?.[0]?.command ? `actie: ${readModelRunbook.actionLinks[0].command}` : null
      ]),
      tone: dangerousScorecards.length || topReadModelBlocker ? "warning" : "neutral"
    },
    {
      title: "Strategy lifecycle",
      detail: compactJoin([
        titleize(lifecycleDiagnostics.status || "unknown"),
        lifecycleDiagnostics.dangerousCount != null ? `${lifecycleDiagnostics.dangerousCount} dangerous` : null,
        lifecycleDiagnostics.positiveCount != null ? `${lifecycleDiagnostics.positiveCount} positive` : null,
        lifecycleDiagnostics.recommendedAction || null
      ]),
      tone: lifecycleDiagnostics.dangerousCount ? "warning" : lifecycleDiagnostics.positiveCount ? "positive" : "neutral"
    },
    {
      title: "Latest replay trace",
      detail: latestReplay
        ? compactJoin([
            latestReplay.symbol || "Replay",
            titleize(latestReplay.status || "unknown"),
            latestReplay.at ? formatAgeCompact(latestReplay.at, freshness.generatedAt) : null
          ])
        : "Geen replay trace in read-model.",
      tone: latestReplay?.status === "ready" ? "positive" : latestReplay ? "warning" : "neutral"
    },
    { title: "External feeds", detail: compactJoin([`${sourceReliability.providerCount || 0} providers`, `avg ${formatPct(sourceReliability.averageScore || 0, 0)}`]), tone: Number(sourceReliability.degradedCount || 0) > 0 ? "warning" : "positive" },
    {
      title: "Market providers",
      detail: compactJoin([
        titleize(marketProviders.status || "disabled"),
        marketProviders.providerCount != null ? `${marketProviders.providerCount} providers` : null,
        Number.isFinite(marketProviders.score) ? `score ${marketProviders.score.toFixed(2)}` : null,
        Number(marketProviders.degradedCount || 0) > 0 ? `${marketProviders.degradedCount} degraded` : null,
        marketProviders.note || null
      ]) || "Geen market-provider health beschikbaar.",
      tone: ["degraded", "unavailable"].includes(marketProviders.status) ? "warning" : marketProviders.status === "ready" ? "positive" : "neutral"
    },
    {
      title: "Binance request weight",
      detail: compactJoin([
        Number.isFinite(requestWeight.usedWeight1m) ? `1m ${requestWeight.usedWeight1m}` : null,
        Number.isFinite(requestWeight.usedWeight) ? `spot ${requestWeight.usedWeight}` : null,
        requestWeight.banActive
          ? `ban actief${requestWeight.banUntil ? ` tot ${new Date(requestWeight.banUntil).toLocaleTimeString()}` : ""}`
          : requestWeight.backoffActive
            ? `backoff ${Math.ceil(Number(requestWeight.backoffRemainingMs || 0) / 1000)}s`
            : requestWeight.warningActive
              ? "pressure high"
              : null,
        requestWeight.lastRequest?.caller ? `last ${requestWeight.lastRequest.caller}` : null,
        requestBudget.topCallers?.[0]?.caller ? `top ${requestBudget.topCallers[0].caller}` : null,
        Number.isFinite(requestBudget.latestWeight1m) ? `read-model 1m ${requestBudget.latestWeight1m}` : null,
        requestBudget.status && requestBudget.status !== "ready" ? titleize(requestBudget.status) : null
      ]) || "Geen request-weight telemetrie beschikbaar.",
      tone: requestWeight.banActive ? "negative" : requestWeight.backoffActive || requestWeight.warningActive || requestBudget.rateLimitEvents ? "warning" : "neutral"
    },
    {
      title: "Trading improvement priorities",
      detail: compactJoin([
        tradingImprovements.status ? titleize(tradingImprovements.status) : null,
        tradingImprovements.requestWeight?.privateHotspots?.[0]?.caller ? `private REST ${tradingImprovements.requestWeight.privateHotspots[0].caller}` : null,
        tradingImprovements.metaCaution?.topReasons?.[0]?.id ? `meta ${humanizeReason(tradingImprovements.metaCaution.topReasons[0].id)} x${tradingImprovements.metaCaution.topReasons[0].count || 0}` : null,
        tradingImprovements.exchangeSafetyRecovery?.recoveryOnly ? "recovery-only actief" : null,
        tradingImprovements.strategyRisk?.dangerous?.[0]?.strategyId ? `risk ${tradingImprovements.strategyRisk.dangerous[0].strategyId}` : null,
        arr(tradingImprovements.backlog || []).length ? `${arr(tradingImprovements.backlog || []).filter((item) => item.status !== "observe").length}/${arr(tradingImprovements.backlog || []).length} actiepunten` : null,
        arr(tradingImprovements.backlog || [])[0]?.title || null,
        arr(tradingImprovements.priorityActions || [])[0] || null
      ]) || "Geen extra trading-improvement acties in deze snapshot.",
      tone: ["blocked_or_recovery", "action_required"].includes(tradingImprovements.status) ? "warning" : "neutral"
    },
    {
      title: "Decision funnel",
      detail: compactJoin([
        `${decisionFunnel.watchlistCount || 0} watchlist`,
        `${decisionFunnel.candidatesCreated || 0} candidates`,
        `${decisionFunnel.alphaWantedCandidates || 0} alpha-wanted`,
        `${decisionFunnel.viableCandidates || 0} viable`,
        `${decisionFunnel.permissioningDeniedCandidates || 0} governance denied`,
        `${decisionFunnel.executionAttempts || 0} attempts`,
        alphaPermissionSplit.headline || null,
        decisionFunnel.dominantReason ? humanizeReason(decisionFunnel.dominantReason) : null,
        decisionFunnel.inactivityWarning || null
      ]),
      tone: flowHealth.status === "blocked" ? "negative" : flowHealth.status === "inactive" ? "warning" : "neutral"
    },
    {
      title: "Probe lane",
      detail: compactJoin([
        decisionFunnel.probeEligibleSoftBlockedCandidates != null ? `${decisionFunnel.probeEligibleSoftBlockedCandidates || 0} eligible` : null,
        decisionFunnel.probeAttemptedCandidates != null ? `${decisionFunnel.probeAttemptedCandidates || 0} attempted` : null,
        decisionFunnel.probeOpenedCandidates != null ? `${decisionFunnel.probeOpenedCandidates || 0} opened` : null,
        decisionFunnel.topProbeEligibleSymbols?.[0]?.symbol ? `eligible ${decisionFunnel.topProbeEligibleSymbols[0].symbol}` : null,
        decisionFunnel.topProbeBlockedSymbols?.[0]?.symbol
          ? `blocked ${decisionFunnel.topProbeBlockedSymbols[0].symbol}: ${humanizeReason(decisionFunnel.topProbeBlockedSymbols[0].whyNoProbeAttempt)}`
          : null,
        decisionFunnel.probeBlockerReasons?.[0]?.id ? `reason ${humanizeReason(decisionFunnel.probeBlockerReasons[0].id)} x${decisionFunnel.probeBlockerReasons[0].count || 0}` : null
      ]) || "Geen probe-lane kandidaten in deze snapshot.",
      tone: (decisionFunnel.probeOpenedCandidates || 0) > 0
        ? "positive"
        : (decisionFunnel.topProbeBlockedSymbols || []).length
          ? "warning"
          : "neutral"
    },
    {
      title: "Risk locks",
      detail: compactJoin([
        riskLocks.exchangeTruthFreeze ? "exchange truth freeze" : null,
        riskLocks.exchangeSafetyGlobalFreeze ? "exchange safety global freeze" : null,
        exchangeConnectivity.rootBlockerPriority ? `priority ${titleize(exchangeConnectivity.rootBlockerPriority)}` : null,
        riskLocks.manualReviewPending ? "manual review pending" : null,
        arr(riskLocks.exchangeSafetyBlockedSymbols || []).length
          ? `${arr(riskLocks.exchangeSafetyBlockedSymbols || []).length} blocked symbol(s)`
          : null,
        arr(riskLocks.executionIntentBlockedSymbols || []).length
          ? `${arr(riskLocks.executionIntentBlockedSymbols || []).length} ambiguous intent symbol(s)`
          : null,
        riskLocks.capitalGovernorStatus ? `capital governor ${titleize(riskLocks.capitalGovernorStatus)}` : null,
        topRejections[0] ? `top reject ${humanizeReason(topRejections[0].code)} (${topRejections[0].count || 0})` : null
      ]) || "Geen actieve risk-locks gedetecteerd.",
      tone: riskLocks.exchangeTruthFreeze || riskLocks.exchangeSafetyGlobalFreeze || riskLocks.manualReviewPending ? "negative" : "positive"
    },
    {
      title: "Symbol safety",
      detail: arr(exchangeConnectivity.blockedSymbols || []).length
        ? compactJoin([
            exchangeConnectivity.canTradeOtherSymbols === false ? "other symbols blocked too" : "other symbols tradable",
            ...arr(exchangeConnectivity.blockedSymbols || [])
              .slice(0, 3)
              .map((item) => compactJoin([
                `${item.symbol} ${humanizeReason(item.reason || item.state || "blocked")}`,
                Number.isFinite(item.reconcileConfidence) ? `conf ${Math.round(item.reconcileConfidence * 100)}%` : null,
                item.autonomousReconcileState ? humanizeReason(item.autonomousReconcileState) : null
              ], " "))
          ])
        : "Geen symbool-specifieke exchange safety blocks.",
      tone: arr(exchangeConnectivity.blockedSymbols || []).length
        ? (exchangeConnectivity.canTradeOtherSymbols === false ? "negative" : "warning")
        : "positive"
    },
    {
      title: "Reconcile timeline",
      detail: reconcileTimeline.length
        ? reconcileTimeline
            .slice(0, 3)
            .map((item) => compactJoin([
              item.symbol || "-",
              item.action ? humanizeReason(item.action) : humanizeReason(item.decision || item.reason || "reconcile"),
              item.reason ? humanizeReason(item.reason) : null,
              Number.isFinite(item.confidence) ? `conf ${Math.round(item.confidence * 100)}%` : null
            ]))
            .join(" | ")
        : "Geen recente reconcile-attempts of auto-fixes.",
      tone: reconcileTimeline.some((item) => `${item.decision || ""}` === "NEEDS_MANUAL_REVIEW") ? "warning" : "neutral"
    },
    {
      title: "Audit trail",
      detail: compactJoin([
        audit.status ? titleize(audit.status) : null,
        audit.lastEventAt ? `last ${formatAgeCompact(audit.lastEventAt)}` : null,
        Number.isFinite(audit.eventCount) ? `${audit.eventCount} events` : null,
        audit.recentExecutionFailures?.[0]?.reasonCodes?.[0] ? `exec fail ${humanizeReason(audit.recentExecutionFailures[0].reasonCodes[0])}` : null,
        audit.recentAdaptiveChanges?.[0]?.status ? `adaptive ${titleize(audit.recentAdaptiveChanges[0].status)}` : null
      ]) || "Nog geen audit-events geregistreerd.",
      tone: audit.recentExecutionFailures?.length ? "warning" : audit.status === "active" ? "positive" : "neutral"
    },
    {
      title: "Inactivity watchdog",
      detail: inactivityWatchdog.active
        ? compactJoin([
            inactivityWatchdog.headline || null,
            inactivityWatchdog.detail || null,
            inactivityWatchdog.recommendedAction || inactivityWatchdog.activeCases?.[0]?.action || null
          ])
        : "Geen langdurige functionele inactiviteit gedetecteerd.",
      tone: inactivityWatchdog.active
        ? ["critical", "high"].includes(inactivityWatchdog.status) ? "negative" : "warning"
        : "positive"
    }
  ];
  replaceChildren(elements.healthList, items.map((item) => makeCard(item, "detail-card")));
}

function renderLearning(snapshot) {
  const digest = buildLearningDigest(snapshot);
  replaceChildren(elements.learningList, digest.map((item) => makeCard(item, "detail-card")));
  const diagnostics = snapshot?.dashboard?.operatorDiagnostics || {};
  const featureAudit = snapshot?.dashboard?.featureIntegrationAudit
    || snapshot?.dashboard?.ops?.featureIntegrationAudit
    || snapshot?.dashboard?.report?.featureIntegrationAudit
    || {};
  const topP1 = arr(featureAudit.topP1 || []);
  const topMissingDashboard = arr(featureAudit.topMissingDashboard || []);
  const cards = [
    { title: "Action items", detail: diagnostics.actionItems?.length ? diagnostics.actionItems.map((item) => item.title).slice(0, 2).join(" · ") : "Geen extra operator-diagnostiek." },
    { title: "Readiness", detail: compactJoin([titleize(snapshot?.dashboard?.ops?.readiness?.status || "unknown"), snapshot?.dashboard?.ops?.missedTradeTuning?.actionClass ? titleize(snapshot.dashboard.ops.missedTradeTuning.actionClass) : null]) },
    {
      title: "Feature completion",
      detail: compactJoin([
        featureAudit.status ? titleize(featureAudit.status) : "Onbekend",
        Number.isFinite(Number(featureAudit.incompleteCount)) ? `${featureAudit.incompleteCount} incomplete` : null,
        topP1[0]?.id ? `P1 ${titleize(topP1[0].id)}` : null,
        topMissingDashboard[0]?.id ? `dashboard ${titleize(topMissingDashboard[0].id)}` : null
      ]) || "Feature audit nog niet beschikbaar.",
      tone: topP1.length ? "warning" : topMissingDashboard.length ? "neutral" : featureAudit.status === "complete" ? "positive" : "neutral"
    }
  ];
  replaceChildren(elements.diagnosticsList, cards.map((item) => makeCard(item, "detail-card")));
}

function renderExplainability(snapshot) {
  const explainability = snapshot?.dashboard?.explainability || {};
  const replays = explainability.replays || [];
  const cards = replays.length
    ? replays.slice(0, 3).map((item) => makeCard({
        title: item.symbol || "Replay",
        detail: compactJoin([
          item.learningAttribution?.category ? titleize(item.learningAttribution.category) : null,
          item.review?.verdict ? `review ${titleize(item.review.verdict)}` : null,
          item.attributionEvidence?.reasons?.[0] ? humanizeReason(item.attributionEvidence.reasons[0]) : null,
          item.exitReason ? `exit ${titleize(item.exitReason)}` : null
        ]),
        body: makeMetricRow([
          Number.isFinite(Number(item.pnlQuote)) ? { label: "PnL", value: formatMoney(item.pnlQuote || 0), detail: formatSignedPct(item.netPnlPct || 0, 1) } : null,
          item.exitAt ? { label: "Closed", value: formatDate(item.exitAt) } : null
        ].filter(Boolean))
      }, "detail-card"))
    : [makeEmptyState("Nog geen replay of explainability-items.")];
  replaceChildren(elements.explainabilityList, cards);
}

function renderPromotion(snapshot) {
  const adaptiveLearning = snapshot?.dashboard?.adaptiveLearning || {};
  const offlineTrainer = snapshot?.dashboard?.offlineTrainer || {};
  const parameterOptimization = adaptiveLearning.parameterOptimization || offlineTrainer.parameterOptimization || {};
  const cards = [
    makeCard({
      title: "Promotion",
      detail: compactJoin([
        adaptiveLearning.modelRegistry?.status ? titleize(adaptiveLearning.modelRegistry.status) : null,
        adaptiveLearning.modelRegistry?.probationRequired ? "probation required" : null,
        adaptiveLearning.modelRegistry?.offlineTrainerReadiness ? titleize(adaptiveLearning.modelRegistry.offlineTrainerReadiness) : null
      ]) || "Geen promotion-signaal beschikbaar."
    }, "detail-card"),
    makeCard({
      title: "Parameter optimization",
      detail: compactJoin([
        parameterOptimization.topCandidate ? titleize(parameterOptimization.topCandidate) : null,
        parameterOptimization.livePromotionAllowed === false ? "live blocked" : null,
        parameterOptimization.note || null
      ]) || "Nog geen optimizer-kandidaat."
    }, "detail-card")
  ];
  replaceChildren(elements.promotionList, cards);
}

function render(snapshot) {
  renderBadges(snapshot);
  safeRenderSection("hero", () => renderHero(snapshot));
  safeRenderSection("overview", () => renderOverview(snapshot));
  safeRenderSection("attention", () => renderAttention(snapshot));
  safeRenderSection("quickActions", () => renderQuickActions(snapshot));
  safeRenderSection("focus", () => renderFocus(snapshot));
  safeRenderSection("positions", () => renderPositions(snapshot));
  safeRenderSection("recentTrades", () => renderRecentTrades(snapshot));
  safeRenderSection("opportunityBoard", () => renderOpportunityBoard(snapshot));
  safeRenderSection("health", () => renderHealth(snapshot));
  safeRenderSection("learning", () => renderLearning(snapshot));
  safeRenderSection("explainability", () => renderExplainability(snapshot));
  safeRenderSection("promotion", () => renderPromotion(snapshot));
  syncRenderHealthBanner(snapshot);
}

async function fetchSnapshot() {
  const epoch = ++requestEpoch;
  const payload = await api("/api/snapshot");
  if (epoch < latestAppliedEpoch) return;
  latestAppliedEpoch = epoch;
  latestSnapshot = pickSnapshot(payload);
  lastSnapshotReceivedAt = new Date().toISOString();
  render(latestSnapshot);
}

export function resolveQuickActionRequest(action, target) {
  const normalized = `${action || ""}`.trim().toLowerCase();
  if (!normalized) return null;
  const note = "dashboard quick action";
  if (normalized === "ack_alert") {
    return { path: "/api/alerts/ack", body: { id: target, note } };
  }
  if (normalized === "force_reconcile") {
    return { path: "/api/ops/force-reconcile", body: { note: target ? `${note} (${target})` : note } };
  }
  if (normalized === "reset_external_feeds") {
    return { path: "/api/diagnostics/action", body: { action: "reset_external_feeds", target, note } };
  }
  if (normalized === "research_focus_symbol") {
    const symbol = `${target || ""}`.trim();
    return { path: "/api/diagnostics/action", body: { action: "research_focus_symbol", target: symbol || null, note } };
  }
  if (normalized === "enable_probe_only") {
    return { path: "/api/ops/probe-only", body: { enabled: true, minutes: 90, note } };
  }
  if (normalized === "refresh_analysis") {
    return { path: "/api/diagnostics/action", body: { action: "refresh_analysis", target: target || null, note } };
  }
  if (normalized === "resolve_flat_manual_review_position") {
    return { path: "/api/diagnostics/action", body: { action: "resolve_flat_manual_review_position", target: target || null, note } };
  }
  return null;
}

async function dispatchQuickAction(action, target) {
  const request = resolveQuickActionRequest(action, target);
  if (!request) {
    console.warn?.("dashboard_unknown_quick_action", action);
    return;
  }
  await mutateAndRefresh(request.path, request.body);
}

function buildQuickActionRows(snapshot) {
  const fromSnapshot = arr(snapshot?.dashboard?.operatorDiagnostics?.quickActions);
  const hasForce = fromSnapshot.some((item) => item.action === "force_reconcile");
  const hasRefresh = fromSnapshot.some((item) => item.action === "refresh_analysis");
  const extras = [];
  if (!hasForce) {
    extras.push({
      action: "force_reconcile",
      target: null,
      label: "Force reconcile",
      detail: "Fallback voor gevallen die auto-reconcile niet veilig kon herstellen.",
      tone: "warning"
    });
  }
  if (!hasRefresh) {
    extras.push({
      action: "refresh_analysis",
      target: null,
      label: "Analyse verversen",
      detail: "Herbouw analyse-snapshot. Alleen als de bot gestopt is.",
      tone: "neutral"
    });
  }
  return [...fromSnapshot, ...extras];
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function extractActionResult(response) {
  return response?.diagnosticsActionResult ||
    response?.dashboard?.diagnosticsActionResult ||
    response?.data?.diagnosticsActionResult ||
    response?.result ||
    null;
}

export function summarizeQuickActionResult(result = null) {
  if (!result || typeof result !== "object") return null;
  const preflightChecks = arr(result.preflightChecks);
  const failedChecks = preflightChecks.filter((check) => check?.passed === false || check?.status === "failed");
  const changedState = result.changedState && typeof result.changedState === "object" ? result.changedState : {};
  const status = result.allowed === false ? "denied" : "applied";
  const rootBefore = result.rootBlockerBefore || result.before?.rootBlocker || null;
  const rootAfter = result.rootBlockerAfter || result.after?.rootBlocker || null;
  const changedKeys = Object.keys(changedState).filter((key) => changedState[key] !== false && changedState[key] != null);
  return {
    action: result.action || "quick_action",
    target: result.target || null,
    status,
    allowed: result.allowed !== false,
    failedCheckCount: failedChecks.length,
    failedChecks: failedChecks.map((check) => check.id || check.name || check.reason || "preflight_check_failed").slice(0, 4),
    denialReasons: arr(result.denialReasons || result.reasons).slice(0, 4),
    changedKeys: changedKeys.slice(0, 5),
    rootBefore,
    rootAfter,
    nextRecommendedAction: result.nextRecommendedAction || result.recommendedAction || null,
    detail: result.detail || result.message || null
  };
}

function renderQuickActionResultCard(result) {
  const summary = summarizeQuickActionResult(result);
  if (!summary) return null;
  const article = makeNode("article", { className: `quick-action quick-action-result ${toneClass(summary.allowed ? "good" : "danger")}` });
  const head = makeNode("div", { className: "quick-action-text" });
  const meta = [
    summary.target ? `target ${summary.target}` : null,
    summary.failedCheckCount ? `${summary.failedCheckCount} preflight fail` : null,
    summary.rootBefore || summary.rootAfter ? `root ${summary.rootBefore || "none"} -> ${summary.rootAfter || "none"}` : null,
    summary.nextRecommendedAction || summary.detail || summary.denialReasons.join(", ")
  ].filter(Boolean).join(" | ");
  head.append(
    makeNode("h3", { text: `Laatste actie: ${summary.action}` }),
    makeNode("p", { text: `${summary.allowed ? "Toegestaan" : "Geweigerd"}${meta ? ` - ${meta}` : ""}` })
  );
  article.append(head);
  return article;
}

function renderQuickActions(snapshot) {
  if (!elements.quickActionsList) return;
  const rows = buildQuickActionRows(snapshot);
  const resultCard = renderQuickActionResultCard(latestActionResult || snapshot?.dashboard?.diagnosticsActionResult || snapshot?.diagnosticsActionResult);
  if (!rows.length) {
    replaceChildren(elements.quickActionsList, [resultCard || makeEmptyState("Geen snelle acties beschikbaar.")].filter(Boolean));
    return;
  }
  replaceChildren(
    elements.quickActionsList,
    [
      resultCard,
      ...rows.map((item) => {
      const tone = item.tone || "neutral";
      const article = makeNode("article", { className: `quick-action ${toneClass(tone)}` });
      const head = makeNode("div", { className: "quick-action-text" });
      head.append(
        makeNode("h3", { text: item.label || titleize(item.action) || "Actie" }),
        item.detail ? makeNode("p", { text: item.detail }) : null
      );
      const btn = makeNode("button", { className: "ghost ghost-small", type: "button", text: "Uitvoeren" });
      btn.addEventListener("click", () => dispatchQuickAction(item.action, item.target).catch((error) => console.error?.("quick_action_failed", error)));
      article.append(head, btn);
      return article;
      })
    ].filter(Boolean)
  );
}

async function mutateAndRefresh(path, body = {}) {
  if (busy) return;
  busy = true;
  try {
    const response = await api(path, { method: "POST", body });
    latestActionResult = extractActionResult(response);
    const actionSummary = summarizeQuickActionResult(latestActionResult);
    if (elements.controlHint) {
      elements.controlHint.textContent = actionSummary
        ? `Actie ${actionSummary.status}: ${actionSummary.action}${actionSummary.nextRecommendedAction ? ` - ${actionSummary.nextRecommendedAction}` : ""}`
        : "Actie uitgevoerd. Snapshot vernieuwd.";
    }
    await fetchSnapshot();
  } catch (error) {
    console.error?.("dashboard_mutation_failed", error);
    if (elements.controlHint) {
      elements.controlHint.textContent = `Actie mislukt: ${error?.message || "unknown error"}`;
    }
  } finally {
    busy = false;
  }
}

function bindUi() {
  elements.refreshBtn?.addEventListener?.("click", () => fetchSnapshot().catch((error) => showDashboardRenderIssue("refresh", error)));
  elements.startBtn?.addEventListener?.("click", () => mutateAndRefresh("/api/start"));
  elements.stopBtn?.addEventListener?.("click", () => mutateAndRefresh("/api/stop"));
  elements.paperBtn?.addEventListener?.("click", () => mutateAndRefresh("/api/mode", { mode: "paper" }));
  elements.liveBtn?.addEventListener?.("click", () => mutateAndRefresh("/api/mode", { mode: "live" }));
  elements.decisionSearch?.addEventListener?.("input", (event) => {
    searchQuery = `${event?.target?.value || ""}`.trim().toLowerCase();
    if (latestSnapshot) render(latestSnapshot);
  });
  elements.decisionAllowedOnly?.addEventListener?.("change", (event) => {
    allowedOnly = Boolean(event?.target?.checked);
    if (latestSnapshot) render(latestSnapshot);
  });
  elements.decisionShowMoreBtn?.addEventListener?.("click", () => {
    showAllDecisions = !showAllDecisions;
    writeStoredBoolean(STORAGE_KEYS.showAllDecisions, showAllDecisions);
    if (latestSnapshot) render(latestSnapshot);
  });
}

function initDashboard() {
  if (!activeDocument) return;
  elements = createElements(activeDocument);
  bindUi();
  fetchSnapshot().catch((error) => showDashboardRenderIssue("bootstrap", error));
  if (typeof window !== "undefined" && window?.setInterval) {
    window.setInterval(() => {
      fetchSnapshot().catch((error) => showDashboardRenderIssue("poll", error));
    }, POLL_MS);
  }
}

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.checked = false;
    this.value = "";
    this.listeners = {};
    this.styleMap = {};
    this.style = {
      setProperty: (name, value) => {
        this.styleMap[name] = value;
      }
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = `${value}`;
    if (name === "id") {
      this.id = `${value}`;
      this.ownerDocument.register(this);
    }
  }

  append(...children) {
    this.children.push(...children.filter(Boolean));
  }

  replaceChildren(...children) {
    this.children = children.filter(Boolean);
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
}

class FakeDocument {
  constructor() {
    this.nodes = new Map();
  }

  createElement(tagName) {
    return new FakeNode(tagName, this);
  }

  register(node) {
    if (node?.id) this.nodes.set(node.id, node);
  }

  querySelector(selector) {
    if (!selector || !selector.startsWith("#")) return null;
    return this.nodes.get(selector.slice(1)) || null;
  }
}

function flattenNodeText(node) {
  if (!node) return "";
  const own = `${node.textContent || ""}`.trim();
  const childText = arr(node.children || []).map((child) => flattenNodeText(child)).filter(Boolean).join(" ");
  return compactJoin([own, childText], " ").trim();
}

function createFakeDashboardDocument() {
  const doc = new FakeDocument();
  [
    "modeBadge",
    "runStateBadge",
    "healthBadge",
    "refreshBadge",
    "controlHint",
    "operatorSummary",
    "startBtn",
    "stopBtn",
    "paperBtn",
    "liveBtn",
    "refreshBtn",
    "decisionSearch",
    "decisionAllowedOnly",
    "decisionMeta",
    "decisionShowMoreBtn",
    "overviewCards",
    "attentionList",
    "actionList",
    "quickActionsList",
    "focusList",
    "positionsList",
    "recentTradesList",
    "opportunityList",
    "healthList",
    "learningList",
    "diagnosticsList",
    "explainabilityList",
    "promotionList"
  ].forEach((id) => {
    const node = doc.createElement("div");
    node.setAttribute("id", id);
    if (id === "decisionAllowedOnly") node.checked = false;
  });
  return doc;
}

export function __dashboardSmokeRender(snapshot) {
  const previousDocument = activeDocument;
  const previousElements = elements;
  const previousSnapshot = latestSnapshot;
  const previousSearch = searchQuery;
  const previousAllowed = allowedOnly;
  const previousShowAll = showAllDecisions;
  const previousActionResult = latestActionResult;
  renderFallbackSections.clear();
  try {
    activeDocument = createFakeDashboardDocument();
    elements = createElements(activeDocument);
    latestSnapshot = snapshot;
    searchQuery = "";
    allowedOnly = false;
    showAllDecisions = false;
    latestActionResult = null;
    render(snapshot);
    return {
      renderIssueCount: renderFallbackSections.size,
      operatorSummaryChildren: elements.operatorSummary?.children?.length || 0,
      overviewCardCount: elements.overviewCards?.children?.length || 0,
      opportunityCount: elements.opportunityList?.children?.length || 0,
      refreshBadgeText: flattenNodeText(elements.refreshBadge),
      recentTradesText: flattenNodeText(elements.recentTradesList),
      healthText: flattenNodeText(elements.healthList),
      focusText: flattenNodeText(elements.focusList),
      positionsText: flattenNodeText(elements.positionsList),
      diagnosticsText: flattenNodeText(elements.diagnosticsList),
      quickActionsText: flattenNodeText(elements.quickActionsList)
    };
  } finally {
    renderFallbackSections.clear();
    activeDocument = previousDocument;
    elements = previousElements;
    latestSnapshot = previousSnapshot;
    searchQuery = previousSearch;
    allowedOnly = previousAllowed;
    showAllDecisions = previousShowAll;
    latestActionResult = previousActionResult;
  }
}

if (typeof document !== "undefined") {
  initDashboard();
}
