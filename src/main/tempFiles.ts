/* Measures and clears the current user's temporary files folder.

   Safety rules (v1 — nothing that needs admin, nothing that touches
   documents):
   - Only the current user's own temp folder, and only when it really looks
     like one (inside the home folder and called Temp/tmp/T).
   - Only regular files older than a day (installers and running apps keep
     fresh files there); never the folder itself.
   - Symlinks and Windows junctions are never followed or removed.
   - Locked or protected files are skipped silently.
   - Bounded by a file count and a time limit. */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CleanTempResult } from '../shared/types';
import type { RawTemp } from './collect/raw';

export const MIN_AGE_MS = 24 * 3600 * 1000;
const MAX_FILES = 200_000;

export function userTempDir(): string {
  return os.tmpdir();
}

export function isSafeTempDir(dir: string, home: string, platform: string = process.platform): boolean {
  if (!dir || !home) return false;
  const p = platform === 'win32' ? path.win32 : path.posix;
  const resolved = p.resolve(dir);
  const homeResolved = p.resolve(home);
  const norm = (s: string) => (platform === 'win32' ? s.toLowerCase() : s);
  const rel = p.relative(norm(homeResolved), norm(resolved));
  if (!rel || rel.startsWith('..') || p.isAbsolute(rel)) return false; // must be strictly inside home
  const base = p.basename(resolved).toLowerCase();
  return base === 'temp' || base === 'tmp' || base === 't';
}

interface WalkOptions {
  minAgeMs: number;
  now: number;
  deadline: number;
  maxFiles: number;
}

interface WalkStats {
  totalBytes: number;
  clearableBytes: number;
  files: number;
  truncated: boolean;
}

async function walk(
  dir: string,
  opts: WalkOptions,
  stats: WalkStats,
  onClearable?: (file: string, size: number) => Promise<void>,
  onDirDone?: (dir: string) => Promise<void>,
): Promise<void> {
  if (stats.truncated) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (stats.files >= opts.maxFiles || Date.now() > opts.deadline) {
      stats.truncated = true;
      return;
    }
    const full = path.join(dir, entry.name);
    let st: import('node:fs').Stats;
    try {
      st = await fs.lstat(full); // lstat: never follow links or junctions
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      await walk(full, opts, stats, onClearable, onDirDone);
      if (onDirDone) await onDirDone(full);
      continue;
    }
    if (!st.isFile()) continue;
    stats.files++;
    stats.totalBytes += st.size;
    if (opts.now - st.mtimeMs >= opts.minAgeMs) {
      stats.clearableBytes += st.size;
      if (onClearable) await onClearable(full, st.size);
    }
  }
}

export async function scanTemp(dir = userTempDir(), timeLimitMs = 20_000, now = Date.now()): Promise<RawTemp | null> {
  try {
    const st = await fs.lstat(dir);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }
  const stats: WalkStats = { totalBytes: 0, clearableBytes: 0, files: 0, truncated: false };
  await walk(dir, { minAgeMs: MIN_AGE_MS, now, deadline: Date.now() + timeLimitMs, maxFiles: MAX_FILES }, stats);
  return { dir, ...stats };
}

export async function cleanTemp(
  dir = userTempDir(),
  home = os.homedir(),
  opts: { timeLimitMs?: number; now?: number; platform?: string } = {},
): Promise<CleanTempResult> {
  if (!isSafeTempDir(dir, home, opts.platform)) {
    throw new Error('The temporary files folder is not in the expected place, so nothing was removed.');
  }
  const root = path.resolve(dir);
  const result: CleanTempResult = { freedBytes: 0, deletedFiles: 0, skippedFiles: 0 };
  const stats: WalkStats = { totalBytes: 0, clearableBytes: 0, files: 0, truncated: false };
  await walk(
    root,
    { minAgeMs: MIN_AGE_MS, now: opts.now ?? Date.now(), deadline: Date.now() + (opts.timeLimitMs ?? 120_000), maxFiles: MAX_FILES },
    stats,
    async (file, size) => {
      try {
        await fs.unlink(file);
        result.freedBytes += size;
        result.deletedFiles++;
      } catch {
        result.skippedFiles++; // in use or protected — leave it
      }
    },
    async (sub) => {
      if (path.resolve(sub) === root) return;
      try {
        const st = await fs.lstat(sub);
        // leave folders something has touched recently — an app may be using them
        if ((opts.now ?? Date.now()) - st.mtimeMs < MIN_AGE_MS) return;
        await fs.rmdir(sub); // only succeeds when empty
      } catch {
        /* not empty or in use */
      }
    },
  );
  return result;
}
