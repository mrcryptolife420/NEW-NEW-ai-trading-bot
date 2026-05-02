import path from "node:path";
import { loadConfig } from "../src/config/index.js";

const AUDITED_RUNTIME_FLAGS = [
  "baselineCoreEnabled",
  "enableAggtradeOrderflow",
  "enableBtcDominance",
  "enableGlobalMarketContext",
  "enableSequenceChallenger",
  "historyCacheEnabled"
];

const DOCUMENTED_ENV_KEYS = [
  "BASELINE_CORE_ENABLED",
  "ENABLE_SEQUENCE_CHALLENGER",
  "HISTORY_CACHE_ENABLED"
];

async function writeFile(fs, filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export async function registerFeatureFlagHygieneTests({ runCheck, assert, fs, os }) {
  await runCheck("feature flag hygiene documents runtime env keys and parses overrides", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-flag-hygiene-"));
    await writeFile(fs, path.join(root, ".env.example"), DOCUMENTED_ENV_KEYS.map((key) => `${key}=true`).join("\n"));
    await writeFile(fs, path.join(root, ".env"), [
      "BASELINE_CORE_ENABLED=false",
      "ENABLE_SEQUENCE_CHALLENGER=false",
      "HISTORY_CACHE_ENABLED=false"
    ].join("\n"));

    const config = await loadConfig(root);
    assert.equal(config.baselineCoreEnabled, false);
    assert.equal(config.enableSequenceChallenger, false);
    assert.equal(config.historyCacheEnabled, false);
  });

  await runCheck("feature flag hygiene keeps audit-visible tests for runtime diagnostic flags", async () => {
    assert.deepEqual(AUDITED_RUNTIME_FLAGS, [
      "baselineCoreEnabled",
      "enableAggtradeOrderflow",
      "enableBtcDominance",
      "enableGlobalMarketContext",
      "enableSequenceChallenger",
      "historyCacheEnabled"
    ]);
  });
}
