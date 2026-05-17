import fs from "node:fs/promises";
import path from "node:path";
import { collectDuplicateEnvKeys } from "../src/config/envValidation.js";

const root = process.cwd();
const targets = [
  { file: ".env.example", required: true, failOnDuplicate: true },
  { file: ".env", required: false, failOnDuplicate: process.env.STRICT_ENV === "true" }
];

const failures = [];
const warnings = [];
for (const target of targets) {
  const fullPath = path.join(root, target.file);
  let content = "";
  try {
    content = await fs.readFile(fullPath, "utf8");
  } catch (error) {
    if (target.required || error.code !== "ENOENT") failures.push(`${target.file}: ${error.message}`);
    continue;
  }
  const duplicates = collectDuplicateEnvKeys(content);
  const messages = duplicates.map((item) => `${target.file}:${item.line} duplicate ${item.key} (first line ${item.firstLine})`);
  if (target.failOnDuplicate) failures.push(...messages);
  else warnings.push(...messages);
}

if (warnings.length) console.warn(`Env duplicate warnings:\n${warnings.map((item) => `- ${item}`).join("\n")}`);
if (failures.length) {
  console.error(`Env check failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Env check passed.");
