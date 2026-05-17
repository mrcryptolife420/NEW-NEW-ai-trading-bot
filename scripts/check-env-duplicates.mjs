import fs from "node:fs/promises";
import path from "node:path";
import { collectDuplicateEnvKeys } from "../src/config/envValidation.js";

const root = process.cwd();
const targets = process.argv.slice(2).filter((item) => !item.startsWith("--"));
const files = targets.length ? targets : [".env.example", ".env"];
const failOnMissing = process.argv.includes("--require-all");
const failures = [];

for (const file of files) {
  const fullPath = path.resolve(root, file);
  let content;
  try {
    content = await fs.readFile(fullPath, "utf8");
  } catch (error) {
    if (failOnMissing || path.basename(file) !== ".env") {
      failures.push(`${file}: ${error.code === "ENOENT" ? "missing" : error.message}`);
    }
    continue;
  }
  for (const duplicate of collectDuplicateEnvKeys(content)) {
    failures.push(`${path.relative(root, fullPath)}:${duplicate.line} duplicate ${duplicate.key} (first line ${duplicate.firstLine})`);
  }
}

if (failures.length) {
  console.error(`Env duplicate check failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log(`Env duplicate check passed (${files.length} target${files.length === 1 ? "" : "s"}).`);
