/* Runs a fixed program with a fixed argument array — never through a shell,
   never with user input — and always with a timeout. Failures resolve to
   null (with the reason) rather than throwing, so a collector can turn them
   into an "unknown" result. */

import { execFile } from 'node:child_process';
import path from 'node:path';

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  error?: string;
}

export function run(file: string, args: readonly string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    try {
      execFile(
        file,
        [...args],
        {
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
          encoding: 'utf8',
          shell: false,
        },
        (err, stdout, stderr) => {
          const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
          const timedOut = Boolean(e && e.killed);
          resolve({
            ok: !e,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            code: e ? (typeof e.code === 'number' ? e.code : null) : 0,
            timedOut,
            error: e ? (timedOut ? 'timed out' : e.message) : undefined,
          });
        },
      );
    } catch (err) {
      resolve({ ok: false, stdout: '', stderr: '', code: null, timedOut: false, error: String(err) });
    }
  });
}

/* Full path to Windows PowerShell 5.1 (always present on Windows 10/11),
   so a stray powershell.exe earlier on PATH can't be picked up. */
export function powershellPath(): string {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/* Runs a constant PowerShell script and parses the JSON it prints. The
   script is passed base64-encoded (UTF-16LE), which avoids any quoting
   rules on the Windows command line. */
export async function runPowerShellJson<T>(script: string, timeoutMs: number): Promise<T | null> {
  const prelude =
    "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" +
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;';
  const encoded = Buffer.from(prelude + script, 'utf16le').toString('base64');
  const r = await run(
    powershellPath(),
    ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    timeoutMs,
  );
  if (!r.stdout.trim()) return null;
  return parseJsonLoose<T>(r.stdout);
}

/* PowerShell may print warnings before the JSON; take from the first brace. */
export function parseJsonLoose<T>(text: string): T | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    return null;
  }
}

/* Resolves to the value, or null when the promise rejects or takes too long. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}
