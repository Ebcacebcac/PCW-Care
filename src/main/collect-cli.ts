/* `node dist/main/collect-cli.js [--full]` — the self-test without Electron. */

import fs from 'node:fs';
import path from 'node:path';
import { runSelfTest } from './selfTest';

function appVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

void runSelfTest(appVersion(), process.argv.includes('--full')).then((code) => {
  // systeminformation can leave handles open; exit explicitly.
  process.exit(code);
});
