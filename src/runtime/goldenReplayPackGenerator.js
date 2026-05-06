import { buildReplayPackManifest } from "./replayPackManifest.js";
import { scoreReplayPackCandidate } from "./replayPackScoring.js";
import { buildReplayRegressionFixture, compareReplayPackToFixture } from "./incidentReplayLab.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeSampleId(sample = {}, index = 0) {
  return sample.id || sample.decisionId || sample.tradeId || sample.incidentId || `sample_${index}`;
}

function normalizeSample(sample = {}, index = 0) {
  const scored = scoreReplayPackCandidate(sample);
  const sampleId = safeSampleId(sample, index);
  const reason = scored.reason || sample.reason || scored.packType;
  return {
    ...sample,
    id: sampleId,
    sampleId,
    replayPriority: scored.priority,
    packType: scored.packType,
    replayReason: reason,
    scope: scored.scope || sample.scope || sample.symbol || sample.strategy || null
  };
}

function packFromSample(sample = {}) {
  const decision = sample.decision || sample.decisionReconstruction || {};
  const reason = sample.replayReason || sample.reason || sample.failureMode || sample.packType || "golden_replay";
  return {
    incidentId: sample.incidentId || sample.sampleId || sample.id || null,
    status: "ready",
    symbol: sample.symbol || decision.symbol || null,
    reason,
    summary: {
      cycleCount: sample.cycleCount || 1,
      decisionCount: sample.decisionCount || (decision ? 1 : 0),
      tradeCount: sample.tradeCount || (sample.trade ? 1 : 0),
      topDecisionReasons: arr(sample.reasons || sample.blockers || [reason]).slice(0, 6),
      topAdaptiveCandidates: arr(sample.topAdaptiveCandidates || [])
    },
    decisionReconstruction: {
      rootBlocker: decision.rootBlocker || sample.rootBlocker || sample.vetoOutcome?.label || null,
      blockerStage: decision.blockerStage || sample.blockerStage || null,
      decisionScores: {
        edge: decision.decisionScores?.edge ?? decision.finalEdge ?? sample.finalEdge ?? null,
        permissioning: decision.decisionScores?.permissioning ?? sample.permissioningScore ?? null
      },
      probeAdmission: decision.probeAdmission || sample.probeAdmission || null,
      threshold: decision.threshold ?? sample.threshold ?? null,
      thresholdEdge: decision.thresholdEdge ?? sample.thresholdEdge ?? null,
      expectedNetEdge: decision.expectedNetEdge || sample.expectedNetEdge || null
    },
    timeline: arr(sample.timeline || [])
  };
}

export function buildGoldenReplayPackCandidates({
  samples = [],
  configHash = null,
  dataHash = null,
  seed = "golden_replay",
  limit = 10,
  createdAt = "1970-01-01T00:00:00.000Z"
} = {}) {
  const warnings = [];
  const normalized = arr(samples).map(normalizeSample);
  if (!normalized.length) warnings.push("missing_samples");
  if (!configHash) warnings.push("missing_config_hash");
  if (!dataHash) warnings.push("missing_data_hash");

  const selected = normalized
    .sort((left, right) => right.replayPriority - left.replayPriority || `${left.sampleId}`.localeCompare(`${right.sampleId}`))
    .slice(0, Math.max(0, Number.isFinite(limit) ? Math.trunc(limit) : 10));

  const packs = selected.map((sample) => {
    const pack = packFromSample(sample);
    const fixture = buildReplayRegressionFixture(pack);
    const manifest = buildReplayPackManifest({
      packType: sample.packType,
      samples: [sample],
      configHash,
      dataHash,
      seed,
      createdAt
    });
    return {
      sampleId: sample.sampleId,
      packType: sample.packType,
      priority: sample.replayPriority,
      reason: sample.replayReason,
      scope: sample.scope,
      manifest,
      pack,
      fixture,
      ciSafe: true,
      paperOnly: true,
      liveBehaviorChanged: false
    };
  });

  return {
    status: packs.length ? "ready" : "empty",
    packCount: packs.length,
    packs,
    warnings,
    configHash: configHash || null,
    dataHash: dataHash || null,
    seed,
    ciSafe: true,
    paperOnly: true,
    liveBehaviorChanged: false
  };
}

export function compareGoldenReplayOutput({ packCandidate = null, actualPack = null, expectedFixture = null } = {}) {
  const pack = actualPack || packCandidate?.pack || null;
  const fixture = expectedFixture || packCandidate?.fixture || null;
  if (!pack || !fixture) {
    return {
      deterministic: false,
      differences: ["missing_replay_pack_or_fixture"],
      warnings: ["missing_replay_pack_or_fixture"]
    };
  }
  return {
    ...compareReplayPackToFixture(pack, fixture),
    warnings: []
  };
}

export function summarizeGoldenReplayPacks(result = {}) {
  const packs = arr(result.packs);
  const byType = packs.reduce((acc, pack) => {
    acc[pack.packType] = (acc[pack.packType] || 0) + 1;
    return acc;
  }, {});
  return {
    status: result.status || (packs.length ? "ready" : "empty"),
    packCount: packs.length,
    highPriorityCount: packs.filter((pack) => pack.priority >= 85).length,
    byType,
    warnings: arr(result.warnings),
    ciSafe: result.ciSafe !== false,
    paperOnly: result.paperOnly !== false,
    liveBehaviorChanged: result.liveBehaviorChanged === true
  };
}
