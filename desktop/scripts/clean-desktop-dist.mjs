import fs from "node:fs/promises";
import path from "node:path";

const desktopRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(desktopRoot, "dist");

try {
  await fs.rm(distDir, { recursive: true, force: true });
  console.log(`Removed ${distDir}`);
} catch (err) {
  console.error(`Could not remove ${distDir}: ${err.message}`);
  console.error("Close the running app, installer, Explorer preview, antivirus scan, or any process holding app.asar.");
  console.error("Use npm run dist:fresh to build into dist-new without deleting the locked dist directory.");
  process.exitCode = 1;
}
