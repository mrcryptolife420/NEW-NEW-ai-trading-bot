import { spawnSync } from "node:child_process";

const commands = [
  ["src/cli.js", "help"],
  ["src/cli.js", "commands"],
  ["src/cli.js", "version"],
  ["src/cli.js", "config:check"]
];
const failures = [];

for (const args of commands) {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: { ...process.env, LOG_LEVEL: "error" },
    timeout: 15000
  });
  if (result.status !== 0) {
    failures.push(`node ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

if (failures.length) {
  console.error(`CLI smoke failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log(`CLI smoke passed (${commands.length} commands).`);
