import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const desktopPackageJson = JSON.parse(await fs.readFile(path.join(root, "desktop", "package.json"), "utf8").catch(() => "{}"));
const runCliSource = await fs.readFile(path.join(root, "src", "cli", "runCli.js"), "utf8");
const registrySource = await fs.readFile(path.join(root, "src", "cli", "commandRegistry.js"), "utf8").catch(() => "");
const commandPattern = /command\s*(?:={2,3})\s*"([^"]+)"|BOT_COMMANDS\s*=\s*new Set\(\[([^\]]*)\]\)/g;
const knownCommands = new Set(["help", "--help", "-h", "commands", "version", "config:check"]);
let match;

while ((match = commandPattern.exec(runCliSource))) {
  if (match[1]) knownCommands.add(match[1]);
  if (match[2]) {
    for (const item of match[2].matchAll(/"([^"]+)"/g)) knownCommands.add(item[1]);
  }
}
for (const item of registrySource.matchAll(/command:\s*"([^"]+)"/g)) knownCommands.add(item[1]);

const failures = [];
for (const [name, script] of Object.entries(packageJson.scripts || {})) {
  const scriptPackage = /\bcd\s+desktop\b/.test(script) ? desktopPackageJson : packageJson;
  for (const ref of script.matchAll(/npm(?:\.cmd)?\s+run\s+([^\s&|]+)/g)) {
    const refName = ref[1].replace(/^['"]|['"]$/g, "");
    if (!scriptPackage.scripts?.[refName]) failures.push(`${name}: references missing npm script ${refName}`);
  }
  for (const ref of script.matchAll(/node\s+([^\s&|]+\.m?js)/g)) {
    const scriptPath = ref[1].replace(/^\.\\/, "").replace(/\\/g, "/");
    if (scriptPath.startsWith("src/cli.js")) continue;
    const exists = await fs.stat(path.join(root, scriptPath)).then((stat) => stat.isFile()).catch(() => false);
    if (!exists) failures.push(`${name}: references missing node script ${scriptPath}`);
  }
  for (const ref of script.matchAll(/node\s+src\/cli\.js\s+([^\s&|]+)/g)) {
    const command = ref[1].replace(/^['"]|['"]$/g, "");
    if (!knownCommands.has(command)) failures.push(`${name}: references unknown CLI command ${command}`);
  }
}

if (failures.length) {
  console.error(`Package script check failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log(`Package script check passed (${Object.keys(packageJson.scripts || {}).length} scripts, ${knownCommands.size} known commands).`);
