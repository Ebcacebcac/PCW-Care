/* PCW-Connect (PC Workshop's remote support client, a RustDesk custom build)
   on this computer: is it installed, what is this computer's ID, and open it.

   Windows looks where the PCW-Connect installer (and the Customer Hub's PC
   Workshop Connect helper, tools/pcw-connect-helper) puts it:
   Program Files\PCW-Connect\PCW-Connect.exe or the per-user
   %LOCALAPPDATA%\PCW-Connect. macOS looks for PCW-Connect.app in
   /Applications or ~/Applications.

   The ID comes from `PCW-Connect --get-id` (fixed arguments, hidden window,
   timeout) and is only fetched when the customer opens Get help — never in
   the background. */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ConnectStatus } from '../shared/types';
import { run } from './collect/exec';

export const CLIENT_NAME = 'PCW-Connect';
const MAC_APP_NAMES = ['PCW-Connect.app', 'PCW Connect.app'];
const GET_ID_TIMEOUT_MS = 15_000;
const STATUS_TTL_MS = 30_000;

type Exists = (p: string) => Promise<boolean>;

const fileExists: Exists = async (p) => {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
};

const dirExists: Exists = async (p) => {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
};

/** Candidate install locations, in the order the helper checks them. */
export function windowsCandidates(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  for (const key of ['ProgramW6432', 'ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']) {
    const d = env[key];
    if (d) {
      const p = path.win32.join(d, CLIENT_NAME, `${CLIENT_NAME}.exe`);
      if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
    }
  }
  return out;
}

export function macCandidates(home: string): string[] {
  const out: string[] = [];
  for (const root of ['/Applications', path.posix.join(home, 'Applications')]) {
    for (const name of MAC_APP_NAMES) out.push(path.posix.join(root, name));
  }
  return out;
}

/** Where PCW-Connect is installed (the .exe on Windows, the .app on macOS), or null. */
export async function findPcwConnect(
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
  exists: { file: Exists; dir: Exists } = { file: fileExists, dir: dirExists },
): Promise<string | null> {
  if (platform === 'win32') {
    for (const p of windowsCandidates(env)) if (await exists.file(p)) return p;
    return null;
  }
  if (platform === 'darwin') {
    for (const p of macCandidates(home)) if (await exists.dir(p)) return p;
    return null;
  }
  return null;
}

const digitsID = /^\d{6,16}$/;
const customID = /^[A-Za-z0-9_-]{6,16}$/;

/** Picks the ID out of `--get-id` output, which may carry log lines around
    it. Same rules as the Go helper's idFromOutput: a plain number wins
    ("487 836 096" counts), otherwise a RustDesk custom ID with a digit. */
export function idFromOutput(out: string): string | null {
  let custom: string | null = null;
  for (const line of out.split(/\r?\n/)) {
    const s = line.trim();
    const d = s.replace(/ /g, '');
    if (digitsID.test(d)) return d;
    if (!custom && customID.test(s) && /\d/.test(s)) custom = s;
  }
  return custom;
}

/** Groups a 9–10 digit ID in threes, as PCW-Connect shows it. */
export function formatConnectId(id: string): string {
  return /^\d{9,10}$/.test(id) ? id.replace(/(\d{3})(?=\d)/g, '$1 ') : id;
}

/** The program to run with --get-id: the .exe itself, or the binary inside the .app. */
async function idProgram(installed: string, platform: string): Promise<string | null> {
  if (platform === 'win32') return installed;
  const macosDir = path.posix.join(installed, 'Contents', 'MacOS');
  for (const name of [CLIENT_NAME, 'PCW Connect', 'RustDesk', 'rustdesk']) {
    const p = path.posix.join(macosDir, name);
    if (await fileExists(p)) return p;
  }
  try {
    const entries = await fs.readdir(macosDir, { withFileTypes: true });
    const first = entries.find((e) => e.isFile());
    return first ? path.posix.join(macosDir, first.name) : null;
  } catch {
    return null;
  }
}

export class PcwConnect {
  private cached: { at: number; status: ConnectStatus } | null = null;
  private id: { path: string; id: string } | null = null;

  constructor(private readonly platform: string = process.platform) {}

  /** Installed? and, when asked, this computer's ID (cached once found). */
  async status(withId: boolean): Promise<ConnectStatus> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < STATUS_TTL_MS && (!withId || this.cached.status.id || !this.cached.status.installed)) {
      return this.cached.status;
    }
    const supported = this.platform === 'win32' || this.platform === 'darwin';
    const installedAt = supported ? await findPcwConnect(this.platform) : null;
    let id: string | null = null;
    if (installedAt) {
      if (this.id && this.id.path === installedAt) id = this.id.id;
      else if (withId) {
        const prog = await idProgram(installedAt, this.platform);
        if (prog) {
          const r = await run(prog, ['--get-id'], GET_ID_TIMEOUT_MS);
          const found = idFromOutput(`${r.stdout}\n${r.stderr}`);
          if (found) {
            id = found;
            this.id = { path: installedAt, id: found };
          }
        }
      }
    }
    const status: ConnectStatus = {
      supported,
      installed: Boolean(installedAt),
      id,
      idDisplay: id ? formatConnectId(id) : null,
    };
    this.cached = { at: now, status };
    return status;
  }

  /** Opens PCW-Connect if it's installed. True when it was started. */
  async open(): Promise<boolean> {
    const installedAt = await findPcwConnect(this.platform);
    if (!installedAt) return false;
    try {
      const child =
        this.platform === 'darwin'
          ? spawn('/usr/bin/open', [installedAt], { detached: true, stdio: 'ignore', shell: false })
          : spawn(installedAt, [], { detached: true, stdio: 'ignore', shell: false, windowsHide: false });
      child.on('error', () => undefined);
      child.unref();
      return true;
    } catch {
      return false;
    }
  }
}
