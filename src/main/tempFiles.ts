/* Measures and clears the current user's temporary files folder.

   Safety rules (v1 — nothing that needs admin, nothing that touches
   documents):
   - Only the current user's own temp folder, and only when it really looks
     like one (inside the home folder and called Temp/tmp/T, or a numbered
     per-session folder inside one). Both paths are resolved to their real,
     full form first: Windows often gives TEMP in 8.3 short form
     (C:\Users\ETHANB~1\...) while the home folder is the long name, and a
     temp folder that is really a link somewhere else must not pass. On
     macOS the per-user TMPDIR (/private/var/folders/../T, owned by the user)
     is accepted too.
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
  const isTempName = (name: string) => {
    const b = name.toLowerCase();
    return b === 'temp' || b === 'tmp' || b === 't';
  };
  const base = p.basename(resolved);
  if (isTempName(base)) return true;
  // Windows per-session temp folders: ...\AppData\Local\Temp\2
  return /^\d{1,4}$/.test(base) && isTempName(p.basename(p.dirname(resolved)));
}

async function realPath(p: string): Promise<string> {
  try {
    // fs/promises realpath uses the native resolver (same as
    // fs.realpath.native): it expands Windows 8.3 short names (RUNNER~1)
    // and follows links and junctions.
    return await fs.realpath(p);
  } catch {
    return p;
  }
}

/** The temp folder to clear, as its real full path — or null if it isn't
    safely the user's own temp folder. */
export async function resolveSafeTempDir(
  dir: string,
  home: string,
  platform: string = process.platform,
): Promise<string | null> {
  if (!dir || !home) return null;
  const [realDir, realHome] = await Promise.all([realPath(dir), realPath(home)]);
  if (isSafeTempDir(realDir, realHome, platform)) return realDir;
  if (platform === 'darwin' && (await isMacUserTempDir(realDir))) return realDir;
  return null;
}

/* macOS keeps each user's temp folder outside the home folder, at
   /private/var/folders/<xx>/<random>/T (what TMPDIR points to). Accept exactly
   that shape, and only when the folder belongs to the signed-in user. */
export const MAC_USER_TEMP = /^\/private\/var\/folders\/[A-Za-z0-9_+-]+\/[A-Za-z0-9_+-]+\/T$/;

async function isMacUserTempDir(realDir: string): Promise<boolean> {
  if (!MAC_USER_TEMP.test(realDir)) return false;
  try {
    const st = await fs.lstat(realDir);
    return st.isDirectory() && typeof process.getuid === 'function' && st.uid === process.getuid();
  } catch {
    return false;
  }
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
  const safe = await resolveSafeTempDir(dir, home, opts.platform);
  if (!safe) {
    throw new Error(`Your temporary files folder (${dir}) isn't where we expected, so nothing was removed. PC Workshop can clear it for you.`);
  }
  const root = path.resolve(safe);
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
