/* Headless self-test: runs every collector and check, prints the health
   snapshot as JSON and returns the exit code (0 unless something crashed).
   Used by CI on real Windows and macOS runners. No Electron imports. */

import { collectReport } from './collect';
import { shapeSnapshot } from './snapshot';
import { MAX_SNAPSHOT_BYTES } from './snapshot';

export async function runSelfTest(appVersion: string, full = false): Promise<number> {
  try {
    const report = await collectReport(appVersion);
    const snapshot = shapeSnapshot(report);
    const body = JSON.stringify(snapshot);
    const out = full ? { snapshot, report, bytes: Buffer.byteLength(body) } : snapshot;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    const counts = report.checks.reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});
    process.stderr.write(
      `self-test: ${report.checks.length} checks ${JSON.stringify(counts)} in ${report.durationMs} ms, snapshot ${Buffer.byteLength(body)} bytes (limit ${MAX_SNAPSHOT_BYTES})\n`,
    );
    if (Buffer.byteLength(body) > MAX_SNAPSHOT_BYTES) return 2;
    return 0;
  } catch (err) {
    process.stderr.write(`self-test crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
    return 1;
  }
}
