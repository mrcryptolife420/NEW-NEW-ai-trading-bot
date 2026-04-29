import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, listFiles } from "../utils/fs.js";

function dateKey(at = new Date().toISOString()) {
  return `${at}`.slice(0, 10);
}

export class AuditLogStore {
  constructor(runtimeDir, { retentionDays = 30 } = {}) {
    this.auditDir = path.join(runtimeDir, "audit");
    this.retentionDays = retentionDays;
  }

  async init() {
    await ensureDir(this.auditDir);
    await this.pruneOldFiles();
  }

  resolveFilePath(at) {
    return path.join(this.auditDir, `${dateKey(at)}.ndjson`);
  }

  async append(event) {
    await ensureDir(this.auditDir);
    await fs.appendFile(this.resolveFilePath(event.at), `${JSON.stringify(event)}\n`, "utf8");
  }

  async readRecent({ limit = 100 } = {}) {
    await ensureDir(this.auditDir);
    const files = (await listFiles(this.auditDir))
      .filter((filePath) => filePath.endsWith(".ndjson"))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, 5);
    const events = [];
    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8").catch(() => "");
      const lines = content.split(/\r?\n/).filter(Boolean).reverse();
      for (const line of lines) {
        try {
          events.push(JSON.parse(line));
        } catch {
          // ignore malformed audit lines, keep summary resilient
        }
        if (events.length >= limit) {
          return events;
        }
      }
    }
    return events;
  }

  async pruneOldFiles(referenceNow = new Date()) {
    await ensureDir(this.auditDir);
    const files = (await listFiles(this.auditDir)).filter((filePath) => filePath.endsWith(".ndjson"));
    const thresholdMs = referenceNow.getTime() - this.retentionDays * 24 * 60 * 60 * 1000;
    await Promise.all(files.map(async (filePath) => {
      const basename = path.basename(filePath, ".ndjson");
      const fileDateMs = new Date(`${basename}T00:00:00.000Z`).getTime();
      if (Number.isFinite(fileDateMs) && fileDateMs < thresholdMs) {
        await fs.rm(filePath, { force: true });
      }
    }));
  }
}
