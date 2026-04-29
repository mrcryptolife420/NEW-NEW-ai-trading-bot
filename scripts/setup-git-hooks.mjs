import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const hooksPath = '.githooks';

function readConfigValue(key) {
  try {
    return execFileSync('git', ['config', '--get', key], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const currentHooksPath = readConfigValue('core.hooksPath');
if (currentHooksPath === hooksPath) {
  console.log(`Git hooks already configured: ${hooksPath}`);
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', hooksPath], {
  cwd: repoRoot,
  stdio: 'inherit',
});

console.log(`Configured core.hooksPath=${hooksPath}`);
