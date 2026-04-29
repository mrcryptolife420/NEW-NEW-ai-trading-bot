import path from "node:path";
import {
  buildIncidentReplayPack,
  compareReplayPackToFixture,
  loadReplayFixture,
  buildReplayRegressionFixture,
  writeReplayRegressionFixture
} from "./incidentReplayLab.js";

export class ReplayLabService {
  constructor({ config = {}, dataRecorder = null } = {}) {
    this.config = config;
    this.dataRecorder = dataRecorder;
  }

  async run(options = {}) {
    const symbol = `${options.symbol || ""}`.trim().toUpperCase() || null;
    const reason = `${options.reason || ""}`.trim() || null;
    const fixturePath = options.fixturePath ? path.resolve(options.fixturePath) : null;
    const compareFixturePath = options.compareFixturePath ? path.resolve(options.compareFixturePath) : null;
    const pack = await buildIncidentReplayPack({
      dataRecorder: this.dataRecorder,
      symbol,
      reason,
      fixturePath
    });
    const regression = buildReplayRegressionFixture(pack);
    const replayComparison = compareFixturePath
      ? compareReplayPackToFixture(pack, await loadReplayFixture(compareFixturePath))
      : null;
    let fixtureWrite = null;
    if (options.writeFixture) {
      const fixtureDir = options.fixtureDir
        ? path.resolve(options.fixtureDir)
        : path.join(this.config.projectRoot || process.cwd(), "test", "fixtures");
      fixtureWrite = await writeReplayRegressionFixture({
        pack,
        fixtureDir,
        fileName: options.fileName || `incident-${(symbol || "all").toLowerCase()}-${(reason || "general").toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}.json`
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      symbol,
      reason,
      status: pack.status || "ready",
      source: pack.source || null,
      summary: pack.summary || null,
      buckets: pack.buckets || {},
      rejectLearningReview: pack.rejectLearningReview || null,
      decisionReconstruction: pack.decisionReconstruction || null,
      regression,
      replayComparison,
      fixtureWrite
    };
  }
}
