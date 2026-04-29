import fs from "node:fs/promises";
import path from "node:path";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function buildIncidentId({ symbol = null, reason = null, at = null } = {}) {
  return [symbol || "all", reason || "generic_incident", (at || "").slice(0, 19)].filter(Boolean).join("::");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function summarizeDecisionReconstruction(incident = {}) {
  const decisions = arr(incident?.buckets?.decisions || []);
  const snapshots = arr(incident?.buckets?.snapshots || []);
  const latestDecision = decisions[decisions.length - 1] || null;
  const latestSnapshot = snapshots[snapshots.length - 1] || null;
  if (!latestDecision) {
    return null;
  }
  return {
    symbol: latestDecision.symbol || null,
    at: latestDecision.at || null,
    rootBlocker: latestDecision.rootBlocker || latestDecision.dominantBlocker || latestDecision.reasons?.[0] || null,
    blockerStage: latestDecision.blockerStage || null,
    decisionScores: latestDecision.decisionScores || null,
    probeAdmission: latestDecision.probeAdmission || null,
    threshold: latestDecision.threshold || null,
    thresholdEdge: latestDecision.thresholdEdge || null,
    referencePrice: latestDecision.referencePrice || null,
    expectedNetEdge: latestDecision.expectedNetEdge || null,
    rankingInputs: {
      rankScore: latestDecision.rankScore || null,
      opportunityScore: latestDecision.opportunityScore || null
    },
    outcomeReview: latestDecision.outcomeReview || null,
    latestSnapshotAt: latestSnapshot?.at || null,
    latestSnapshotReadiness: latestSnapshot?.readiness || null
  };
}

export async function loadReplayFixture(fixturePath) {
  if (!fixturePath) {
    return null;
  }
  const raw = await fs.readFile(fixturePath, "utf8");
  return JSON.parse(raw);
}

export async function buildIncidentReplayPack({
  dataRecorder = null,
  symbol = null,
  reason = null,
  fixturePath = null
} = {}) {
  const fixture = fixturePath ? await loadReplayFixture(fixturePath) : null;
  if (fixture) {
    return {
      status: "fixture",
      incidentId: fixture.incidentId || buildIncidentId({
        symbol: fixture.symbol || symbol,
        reason: fixture.reason || reason,
        at: fixture.generatedAt || null
      }),
      symbol: fixture.symbol || symbol || null,
      reason: fixture.reason || reason || null,
      generatedAt: fixture.generatedAt || null,
      timeline: arr(fixture.timeline || []),
      fixtures: fixture,
      summary: fixture.summary || null
    };
  }
  const incident = await dataRecorder?.loadIncidentReplay?.({
    symbol,
    reason
  });
  const rejectLearningReview = await dataRecorder?.loadRejectedDecisionReview?.({
    symbol,
    rootBlocker: reason || null
  });
  const timeline = arr(incident?.timeline || []);
  const latest = timeline[timeline.length - 1] || null;
  const summary = {
    cycleCount: arr(incident?.buckets?.cycles || []).length,
    decisionCount: arr(incident?.buckets?.decisions || []).length,
    tradeCount: arr(incident?.buckets?.trades || []).length,
    snapshotCount: arr(incident?.buckets?.snapshots || []).length,
    topDecisionReasons: [...new Set(arr(incident?.buckets?.decisions || []).flatMap((item) => arr(item?.reasons || item?.blockers || []))).values()].slice(0, 6),
    latestAt: latest?.at || null,
    topRejectBlockers: arr(rejectLearningReview?.blockerStats || []).slice(0, 6),
    topAdaptiveCandidates: arr(rejectLearningReview?.adaptiveCandidates || []).slice(0, 4)
  };
  const decisionReconstruction = summarizeDecisionReconstruction({
    ...incident,
    buckets: {
      ...(incident?.buckets || {}),
      decisions: rejectLearningReview?.decisions?.length ? rejectLearningReview.decisions : incident?.buckets?.decisions || []
    }
  });
  return {
    status: incident?.status || "empty",
    incidentId: buildIncidentId({ symbol, reason, at: latest?.at || null }),
    symbol: symbol || null,
    reason: reason || null,
    generatedAt: new Date().toISOString(),
    timeline,
    summary,
    buckets: incident?.buckets || {},
    rejectLearningReview: rejectLearningReview || null,
    decisionReconstruction
  };
}

export function buildReplayDeterminismSignature(pack = {}) {
  const decision = pack.decisionReconstruction || {};
  const summary = pack.summary || {};
  return stableStringify({
    incidentId: pack.incidentId || null,
    status: pack.status || null,
    symbol: pack.symbol || null,
    reason: pack.reason || null,
    cycleCount: summary.cycleCount || 0,
    decisionCount: summary.decisionCount || 0,
    tradeCount: summary.tradeCount || 0,
    rootBlocker: decision.rootBlocker || null,
    blockerStage: decision.blockerStage || null,
    finalEdge: decision.decisionScores?.edge || null,
    permissioning: decision.decisionScores?.permissioning || null,
    probeEligible: decision.probeAdmission?.eligible || null,
    probeActivated: decision.probeAdmission?.activated || null,
    threshold: decision.threshold || null,
    thresholdEdge: decision.thresholdEdge || null,
    expectedNetEdge: decision.expectedNetEdge || null,
    topDecisionReasons: arr(summary.topDecisionReasons || []).slice(0, 6),
    topAdaptiveCandidates: arr(summary.topAdaptiveCandidates || []).slice(0, 4)
  });
}

export function compareReplayPackToFixture(pack = {}, fixture = {}) {
  const left = buildReplayDeterminismSignature(pack);
  const right = fixture.determinismSignature || stableStringify({
    incidentId: fixture.incidentId || null,
    status: fixture.status || "ready",
    symbol: fixture.symbol || null,
    reason: fixture.reason || null,
    cycleCount: fixture.summary?.cycleCount || fixture.summary?.timelineCount || 0,
    decisionCount: fixture.summary?.decisionCount || 0,
    tradeCount: fixture.summary?.tradeCount || 0,
    rootBlocker: fixture.decisionReconstruction?.rootBlocker || null,
    blockerStage: fixture.decisionReconstruction?.blockerStage || null,
    finalEdge: fixture.decisionReconstruction?.decisionScores?.edge || null,
    permissioning: fixture.decisionReconstruction?.decisionScores?.permissioning || null,
    probeEligible: fixture.decisionReconstruction?.probeAdmission?.eligible || null,
    probeActivated: fixture.decisionReconstruction?.probeAdmission?.activated || null,
    threshold: fixture.decisionReconstruction?.threshold || null,
    thresholdEdge: fixture.decisionReconstruction?.thresholdEdge || null,
    expectedNetEdge: fixture.decisionReconstruction?.expectedNetEdge || null,
    topDecisionReasons: arr(fixture.summary?.topDecisionReasons || []).slice(0, 6),
    topAdaptiveCandidates: arr(fixture.summary?.topAdaptiveCandidates || []).slice(0, 4)
  });
  return {
    deterministic: left === right,
    currentSignature: left,
    fixtureSignature: right,
    differences: left === right ? [] : [
      "replay_signature_changed",
      pack.decisionReconstruction?.rootBlocker !== fixture.decisionReconstruction?.rootBlocker ? "root_blocker_changed" : null,
      pack.decisionReconstruction?.blockerStage !== fixture.decisionReconstruction?.blockerStage ? "blocker_stage_changed" : null,
      pack.decisionReconstruction?.decisionScores?.edge !== fixture.decisionReconstruction?.decisionScores?.edge ? "final_edge_changed" : null,
      pack.decisionReconstruction?.decisionScores?.permissioning !== fixture.decisionReconstruction?.decisionScores?.permissioning ? "permissioning_changed" : null,
      pack.decisionReconstruction?.probeAdmission?.eligible !== fixture.decisionReconstruction?.probeAdmission?.eligible ? "probe_eligibility_changed" : null
    ].filter(Boolean)
  };
}

export function buildReplayRegressionFixture(pack = {}) {
  const timeline = arr(pack.timeline || []).slice(-24);
  return {
    incidentId: pack.incidentId || buildIncidentId({
      symbol: pack.symbol || null,
      reason: pack.reason || null,
      at: timeline[0]?.at || null
    }),
    generatedAt: pack.generatedAt || new Date().toISOString(),
    symbol: pack.symbol || null,
    reason: pack.reason || null,
    summary: {
      timelineCount: timeline.length,
      latestAt: timeline[timeline.length - 1]?.at || null,
      cycleCount: pack.summary?.cycleCount || arr(pack.buckets?.cycles || []).length,
      decisionCount: pack.summary?.decisionCount || arr(pack.buckets?.decisions || []).length,
      tradeCount: pack.summary?.tradeCount || arr(pack.buckets?.trades || []).length,
      snapshotCount: pack.summary?.snapshotCount || arr(pack.buckets?.snapshots || []).length,
      topDecisionReasons: arr(pack.summary?.topDecisionReasons || []).slice(0, 6),
      topAdaptiveCandidates: arr(pack.summary?.topAdaptiveCandidates || []).slice(0, 4)
    },
    decisionReconstruction: pack.decisionReconstruction || null,
    determinismSignature: buildReplayDeterminismSignature(pack),
    timeline: timeline.map((item) => ({
      at: item.at || null,
      type: item.type || null,
      symbol: item.symbol || null,
      detail: item.detail || null
    }))
  };
}

export async function writeReplayRegressionFixture({
  pack,
  fixtureDir,
  fileName
} = {}) {
  const fixture = buildReplayRegressionFixture(pack);
  const targetDir = fixtureDir || path.join(process.cwd(), "test", "fixtures");
  const targetName = fileName || `${(fixture.symbol || "incident").toLowerCase()}-${(fixture.reason || "replay").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.json`;
  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, targetName);
  await fs.writeFile(targetPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return {
    fixture,
    path: targetPath
  };
}
