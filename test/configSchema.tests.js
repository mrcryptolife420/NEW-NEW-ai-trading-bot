import { parseEnvText } from "../src/config/envFile.js";
import { getTradeProfile } from "../src/config/tradeProfiles.js";

export async function registerConfigSchemaTests({
  runCheck,
  assert,
  fs,
  os,
  path,
  loadConfig,
  ConfigValidationError
}) {
  async function makeConfigProject(envLines = []) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-config-schema-"));
    const allowlist = [
      "BOT_MODE=paper",
      "TRADE_PROFILE_ID=beginner-paper-learning",
      "CONFIG_PROFILE=paper-learning",
      "CONFIG_CAPABILITY_BUNDLES=paper,dashboard,research",
      "MAX_OPEN_POSITIONS=4",
      "MAX_POSITION_FRACTION=0.15",
      "MAX_TOTAL_EXPOSURE_FRACTION=0.6",
      "RUNTIME_DIR=./runtime",
      "HISTORY_DIR=./data/history",
      "BINANCE_API_KEY=",
      "BINANCE_API_SECRET=",
      "LIVE_TRADING_ACKNOWLEDGED=",
      "ENABLE_EXCHANGE_PROTECTION=true",
      "PAPER_EXECUTION_VENUE=internal",
      "PAPER_MODE_PROFILE=learn",
      "BINANCE_API_BASE_URL="
    ].join("\n");
    await fs.writeFile(path.join(root, ".env.example"), allowlist, "utf8");
    await fs.writeFile(path.join(root, ".env"), envLines.join("\n"), "utf8");
    return root;
  }

  await runCheck("config load fails fast on invalid scalar ranges", async () => {
    const root = await makeConfigProject(["MAX_OPEN_POSITIONS=0"]);
    await assert.rejects(
      () => loadConfig(root),
      (error) => error instanceof ConfigValidationError
        && error.errors.some((item) => item.includes("maxOpenPositions") || item.includes("MAX_OPEN_POSITIONS"))
    );
  });

  await runCheck("config load fails fast on invalid cross-field combinations", async () => {
    const root = await makeConfigProject([
      "MAX_POSITION_FRACTION=0.8",
      "MAX_TOTAL_EXPOSURE_FRACTION=0.4"
    ]);
    await assert.rejects(
      () => loadConfig(root),
      (error) => error instanceof ConfigValidationError && error.errors.some((item) => item.includes("MAX_POSITION_FRACTION cannot exceed MAX_TOTAL_EXPOSURE_FRACTION"))
    );
  });

  await runCheck("config load rejects unknown env keys that look like config drift", async () => {
    const root = await makeConfigProject(["UNDECLARED_RUNTIME_FLAG=true"]);
    await assert.rejects(
      () => loadConfig(root),
      (error) => error instanceof ConfigValidationError && error.unknownKeys.includes("UNDECLARED_RUNTIME_FLAG")
    );
  });
  await runCheck("config load rejects duplicate env keys and invalid explicit scalar values", async () => {
    const duplicateRoot = await makeConfigProject([
      "MAX_OPEN_POSITIONS=4",
      "MAX_OPEN_POSITIONS=5"
    ]);
    await assert.rejects(
      () => loadConfig(duplicateRoot),
      (error) => error instanceof ConfigValidationError
        && error.errors.some((item) => item.includes(".env duplicate MAX_OPEN_POSITIONS"))
    );
    const invalidNumberRoot = await makeConfigProject(["MAX_OPEN_POSITIONS=abc"]);
    await assert.rejects(
      () => loadConfig(invalidNumberRoot),
      (error) => error instanceof ConfigValidationError
        && error.errors.some((item) => item.includes("MAX_OPEN_POSITIONS") && item.includes("abc") && item.includes("finite number"))
    );
    const invalidBooleanRoot = await makeConfigProject(["ENABLE_EXCHANGE_PROTECTION=maybe"]);
    await assert.rejects(
      () => loadConfig(invalidBooleanRoot),
      (error) => error instanceof ConfigValidationError
        && error.errors.some((item) => item.includes("ENABLE_EXCHANGE_PROTECTION") && item.includes("maybe") && item.includes("boolean"))
    );
  });

  await runCheck("config accepts catalog profile identity keys from applied profiles", async () => {
    const root = await makeConfigProject([
      "CONFIG_PROFILE=paper-learning",
      "TRADE_PROFILE_ID=beginner-paper-learning",
      "CONFIG_CAPABILITY_BUNDLES=paper,dashboard,research",
      "PAPER_MODE_PROFILE=learn",
      "PAPER_EXECUTION_VENUE=internal"
    ]);
    const config = await loadConfig(root);
    assert.equal(config.profile.id, "paper-learning");
    assert.deepEqual(config.profile.capabilityBundles, ["paper", "dashboard", "research"]);
    assert.equal(config.botMode, "paper");
  });

  await runCheck("profile env examples declare catalog-compatible profile identity", async () => {
    const projectRoot = process.cwd();
    const expectations = [
      ["paper-safe.env.example", "paper-safe-simulation"],
      ["paper-learn.env.example", "beginner-paper-learning"],
      ["binance-demo-spot.env.example", "paper-demo-spot"],
      ["live-minimal.env.example", "guarded-live-template"],
      ["live-conservative.env.example", "guarded-live-template"]
    ];
    for (const [fileName, catalogId] of expectations) {
      const profile = getTradeProfile(catalogId);
      const values = parseEnvText(await fs.readFile(path.join(projectRoot, "config", "profiles", fileName), "utf8"));
      assert.equal(values.BOT_MODE, profile.env.BOT_MODE, fileName);
      assert.equal(values.TRADE_PROFILE_ID, profile.env.TRADE_PROFILE_ID, fileName);
      assert.equal(values.CONFIG_PROFILE, profile.env.CONFIG_PROFILE, fileName);
      assert.equal(values.CONFIG_CAPABILITY_BUNDLES, profile.env.CONFIG_CAPABILITY_BUNDLES, fileName);
      assert.equal(values.PAPER_EXECUTION_VENUE, profile.env.PAPER_EXECUTION_VENUE, fileName);
    }
  });

  await runCheck("config resolves relative runtime and history directories under project root", async () => {
    const root = await makeConfigProject([
      "RUNTIME_DIR=./runtime-local",
      "HISTORY_DIR=./history-local"
    ]);
    const config = await loadConfig(root);
    assert.equal(config.runtimeDir, path.resolve(root, "runtime-local"));
    assert.equal(config.historyDir, path.resolve(root, "history-local"));
    assert.equal(config.historyDirSource, "env");
    assert.equal(config.validation.valid, true);
  });

  await runCheck("config blocks unsafe live mode without credentials, acknowledgement and protection", async () => {
    const root = await makeConfigProject([
      "BOT_MODE=live",
      "ENABLE_EXCHANGE_PROTECTION=false",
      "LIVE_TRADING_ACKNOWLEDGED=",
      "BINANCE_API_KEY=",
      "BINANCE_API_SECRET="
    ]);
    await assert.rejects(
      () => loadConfig(root),
      (error) => error instanceof ConfigValidationError
        && error.errors.some((item) => item.includes("BINANCE_API_KEY and BINANCE_API_SECRET"))
        && error.errors.some((item) => item.includes("LIVE_TRADING_ACKNOWLEDGED"))
        && error.errors.some((item) => item.includes("ENABLE_EXCHANGE_PROTECTION=true"))
    );
  });
}
