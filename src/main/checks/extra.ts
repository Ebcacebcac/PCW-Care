/* PCW Care 0.2 checks: backup, Windows 10 end of support, Windows 11
   readiness, crash history, remote access apps, expired antivirus,
   BitLocker. Pure functions like evaluate.ts — no I/O, unit tested.

   Privacy rule for this file: anything that names an app the customer runs
   (remote access tools, crashed apps) goes in `localNote` or
   DeviceReport.local, never in `detail` or `title` — those are sent to
   PC Workshop in the health snapshot. */

import type { CheckResult, LocalDetails, Status } from '../../shared/types';
import { agoText, daysBetween } from '../../shared/format';
import type { RawMac, RawWindows11, RawWindowsBackup, RawWindowsBitLocker, RawWindowsSecurity, RawWindowsStability } from '../collect/raw';
import { decodeProductState } from './evaluate';

function result(partial: Omit<CheckResult, 'fixes'> & { fixes?: CheckResult['fixes'] }): CheckResult {
  return { fixes: [], ...partial };
}

/* ── Backup ── */

const NO_BACKUP = "We couldn't see a backup on this computer.";
const NO_BACKUP_MORE = ' If you back up another way (for example to an external drive you plug in), you can ignore this — otherwise we can help you set one up.';
const BACKUP_STALE_DAYS = 14;

function normPath(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

/* Which of Documents / Desktop / Pictures live inside an OneDrive folder
   (OneDrive "Known Folder Move", which Windows Backup also turns on). */
export function oneDriveProtectedFolders(raw: RawWindowsBackup | null | undefined): string[] {
  const roots = (raw?.oneDriveFolders ?? []).filter((r): r is string => typeof r === 'string' && r.trim().length > 2).map(normPath);
  if (!roots.length) return [];
  const sf = raw?.shellFolders ?? {};
  const out: string[] = [];
  const pairs: [string, string | null | undefined][] = [
    ['Documents', sf.documents],
    ['Desktop', sf.desktop],
    ['Pictures', sf.pictures],
  ];
  for (const [label, p] of pairs) {
    if (typeof p !== 'string' || !p) continue;
    const n = normPath(p);
    if (roots.some((r) => n === r || n.startsWith(r + '\\'))) out.push(label);
  }
  return out;
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function evalWindowsBackup(raw: RawWindowsBackup | null | undefined, oneDriveRunning: boolean | null, now: Date): CheckResult {
  const base = { id: 'backup', title: 'Backup', category: 'backup' as const, fixes: ['open:backup' as const] };
  if (!raw) return result({ ...base, status: 'unknown', detail: "We couldn't check for a backup on this computer." });

  const kfm = oneDriveProtectedFolders(raw);
  const fhDate = raw.fileHistoryLast ? new Date(raw.fileHistoryLast) : null;
  const fhValid = fhDate && !Number.isNaN(fhDate.getTime()) && fhDate.getTime() > Date.UTC(2010, 0, 1) && fhDate.getTime() <= now.getTime() + 86_400_000;
  const fhDays = fhValid ? Math.max(0, daysBetween(fhDate, now)) : null;

  if (kfm.length) {
    const what = `Your ${listText(kfm)} ${kfm.length === 1 ? 'folder is' : 'folders are'} backed up to OneDrive.`;
    if (oneDriveRunning === false) {
      return result({
        ...base,
        status: 'warn',
        detail: `${what} But OneDrive isn't running at the moment, so new changes aren't being copied. Open OneDrive to start it again.`,
      });
    }
    return result({ ...base, status: 'ok', detail: what });
  }
  if (fhDays != null) {
    if (fhDays <= BACKUP_STALE_DAYS) return result({ ...base, status: 'ok', detail: `File History last backed up your files ${agoText(fhDays)}.` });
    return result({
      ...base,
      status: 'warn',
      detail: `File History last backed up your files ${agoText(fhDays)}. Plug in your backup drive so it can catch up.`,
    });
  }
  if (raw.fileHistoryConfigured) return result({ ...base, status: 'ok', detail: 'File History is set up to back up your files.' });
  if (raw.legacyBackupConfigured) return result({ ...base, status: 'ok', detail: 'Windows Backup and Restore is set up on this computer.' });
  if (raw.oneDriveAccount) {
    return result({
      ...base,
      status: 'warn',
      detail: `${NO_BACKUP} OneDrive is signed in, but your Documents and Desktop aren't being backed up to it — only files you put in the OneDrive folder are copied.`,
      askUs: true,
    });
  }
  return result({ ...base, status: 'warn', detail: NO_BACKUP + NO_BACKUP_MORE, askUs: true });
}

export function evalMacBackup(tm: RawMac['timeMachine'], iCloud: boolean | null | undefined, now: Date): CheckResult {
  const base = { id: 'backup', title: 'Backup', category: 'backup' as const, fixes: ['open:backup' as const] };
  if (tm == null && iCloud == null) return result({ ...base, status: 'unknown', detail: "We couldn't check for a backup on this Mac." });
  const latest = tm?.latest ? new Date(tm.latest) : null;
  const days = latest && !Number.isNaN(latest.getTime()) && latest.getTime() <= now.getTime() + 86_400_000 ? Math.max(0, daysBetween(latest, now)) : null;
  if (days != null) {
    if (days <= BACKUP_STALE_DAYS) return result({ ...base, status: 'ok', detail: `Time Machine last backed up your Mac ${agoText(days)}.` });
    return result({
      ...base,
      status: 'warn',
      detail: `Time Machine last backed up your Mac ${agoText(days)}. Connect your backup drive so it can catch up.`,
    });
  }
  if (tm?.configured) {
    if (tm.autoBackup === false) {
      return result({ ...base, status: 'warn', detail: 'Time Machine is set up, but automatic backups are switched off.' });
    }
    return result({ ...base, status: 'ok', detail: 'Time Machine is set up to back up your Mac.' });
  }
  if (iCloud) {
    return result({
      ...base,
      status: 'info',
      detail: 'Your Desktop and Documents look like they’re kept in iCloud Drive. For a full backup of your Mac, Time Machine with an external drive is worth having too.',
    });
  }
  return result({ ...base, status: 'warn', detail: NO_BACKUP + NO_BACKUP_MORE, askUs: true });
}

/* ── Windows 10 end of support ── */

/* Windows 10 support ended on 14 October 2025. Consumer Extended Security
   Updates (ESU) carried on for one more year, to 13 October 2026. */
export const WIN10_END_OF_SUPPORT = '2025-10-14';
export const WIN10_CONSUMER_ESU_END = '2026-10-13';

export function windowsBuildNumber(build: string): number | null {
  const n = parseInt(String(build).split('.')[0] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isWindows10(os: { platform: string; name: string; build: string }): boolean {
  if (os.platform !== 'win32') return false;
  const b = windowsBuildNumber(os.build);
  if (b != null) return b >= 10240 && b < 22000;
  return /windows 10/i.test(os.name);
}

function endOfDayUk(dateIso: string): number {
  // The last day counts in full (UK time is never more than 1 h from UTC).
  return new Date(`${dateIso}T23:59:59Z`).getTime();
}

export function evalWin10Eos(os: { platform: string; name: string; build: string }, now: Date): CheckResult | null {
  if (!isWindows10(os)) return null;
  const base = { id: 'win10_eos', title: 'Windows 10 support', category: 'updates' as const };
  if (/\b(LTSC|LTSB)\b/i.test(os.name)) {
    return result({ ...base, status: 'info', detail: 'This is a long-term edition of Windows 10, which gets security updates for longer than the normal versions.' });
  }
  const t = now.getTime();
  if (t > endOfDayUk(WIN10_CONSUMER_ESU_END)) {
    return result({
      ...base,
      status: 'bad',
      detail:
        'Windows 10 no longer gets security updates — Microsoft’s support ended in October 2025 and the extra year of Extended Security Updates finished on 13 October 2026. Upgrading to Windows 11 (or a new computer) keeps you safe online; we can check what’s best for you.',
      fixes: ['open:updates'],
      askUs: true,
    });
  }
  if (t > endOfDayUk(WIN10_END_OF_SUPPORT)) {
    return result({
      ...base,
      status: 'warn',
      detail:
        'Microsoft’s support for Windows 10 ended on 14 October 2025. Security updates only carry on until 13 October 2026 if this computer is enrolled in Extended Security Updates. It’s time to plan an upgrade — we can help.',
      fixes: ['open:updates'],
      askUs: true,
    });
  }
  return result({ ...base, status: 'info', detail: 'Microsoft’s support for Windows 10 ends on 14 October 2025. It’s worth planning an upgrade to Windows 11.' });
}

/* ── Windows 11 readiness (a rough guide, never authoritative) ── */

export type CpuVerdict = 'yes' | 'no' | 'unknown';

/* Approximates Microsoft's supported processor lists: Intel 8th generation
   and newer, AMD Ryzen 2000 and newer, Qualcomm Snapdragon. */
export function cpuLikelySupported(brand: string): CpuVerdict {
  const b = brand.replace(/\(r\)|\(tm\)|®|™/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!b) return 'unknown';
  if (/snapdragon|qualcomm/i.test(b)) return 'yes';
  if (/core\s*ultra/i.test(b)) return 'yes';
  const intel = /\bi[3579]-?\s?(\d{4,5})[a-z]*/i.exec(b);
  if (intel) {
    const digits = intel[1];
    // i5-10400 / i7-12700 (5 digits) and i5-1245U / i7-1165G7 (4 digits
    // starting with 1) are 10th gen and later; i5-8250U is 8th.
    const gen = digits.length === 5 || digits[0] === '1' ? parseInt(digits.slice(0, 2), 10) : parseInt(digits[0], 10);
    if (gen >= 8) return 'yes';
    // 7th gen: only a handful (e.g. i7-7820HQ) made the list — treat as no.
    return 'no';
  }
  if (/core\s*2|pentium\s*(dual|d\b|4)|athlon\s*(64|ii)|phenom|\bfx-\d|\bA\d{1,2}-\d{4}/i.test(b)) return 'no';
  const ryzen = /ryzen\s*(?:\d|threadripper)?\s*(?:pro\s*)?(\d)(\d{3})/i.exec(b);
  if (ryzen) return parseInt(ryzen[1], 10) >= 2 ? 'yes' : 'no';
  if (/ryzen/i.test(b)) return 'unknown';
  return 'unknown';
}

export function evalWin11Ready(
  os: { platform: string; name: string; build: string },
  hw: { cpuBrand: string; ramGb: number | null; systemDiskGb: number | null },
  raw: RawWindows11 | null | undefined,
): CheckResult | null {
  if (!isWindows10(os)) return null;
  const base = { id: 'win11_ready', title: 'Ready for Windows 11?', category: 'updates' as const, status: 'info' as Status };
  const reasons: string[] = [];
  const cpu = cpuLikelySupported(hw.cpuBrand);
  if (cpu === 'no') reasons.push('its processor is older than Windows 11 supports');
  if (hw.ramGb != null && hw.ramGb < 4) reasons.push('it has less than 4 GB of memory');
  if (hw.systemDiskGb != null && hw.systemDiskGb > 0 && hw.systemDiskGb < 64) reasons.push('its main drive is smaller than 64 GB');
  const tpmVer = raw?.tpmVersion ? parseFloat(raw.tpmVersion) : NaN;
  if (raw?.tpmPresent === false) reasons.push('we couldn’t find a security chip (TPM)');
  else if (Number.isFinite(tpmVer) && tpmVer < 2) reasons.push('its security chip (TPM) is an older version');

  // Windows Update's own compatibility check, when it has run.
  const upg = (raw?.upgEx ?? '').toLowerCase();
  const wuSaysNo = upg === 'red';
  const wuSaysYes = upg === 'green';

  const sb = raw?.secureBoot === false ? ' Secure Boot is switched off, but that can usually be turned on.' : '';
  if (!reasons.length && !wuSaysNo) {
    const sure = wuSaysYes || (cpu === 'yes' && raw?.tpmPresent === true);
    return result({
      ...base,
      detail: `${sure ? 'Your computer is probably ready for Windows 11.' : 'Your computer might be ready for Windows 11 — we couldn’t check everything.'}${sb} We can check for you and do the upgrade, keeping your files and apps.`,
      askUs: true,
    });
  }
  const why = reasons.length ? ` (${listText(reasons)})` : '';
  return result({
    ...base,
    detail: `Your computer is probably not ready for Windows 11${why}. We can check for you and talk through the options, including upgrades or a replacement.`,
    askUs: true,
  });
}

/* ── Crash / stability history ── */

export function stabilityFromWindows(raw: RawWindowsStability | null | undefined): LocalDetails['stability'] {
  if (!raw) return null;
  const crashes = typeof raw.appCrashes === 'number' ? raw.appCrashes : null;
  const hangs = typeof raw.appHangs === 'number' ? raw.appHangs : null;
  const appCrashes = crashes == null && hangs == null ? null : (crashes ?? 0) + (hangs ?? 0);
  const a = typeof raw.unexpected41 === 'number' ? raw.unexpected41 : null;
  const b = typeof raw.unexpected6008 === 'number' ? raw.unexpected6008 : null;
  // One unexpected shutdown usually logs both 41 and 6008.
  const unexpectedShutdowns = a == null && b == null ? null : Math.max(a ?? 0, b ?? 0);
  return { appCrashes, unexpectedShutdowns, apps: cleanApps(raw.apps) };
}

function cleanApps(apps: { name: string; count: number }[] | null | undefined): { name: string; count: number }[] {
  return (apps ?? [])
    .filter((x) => x && typeof x.name === 'string' && x.name.trim() && typeof x.count === 'number' && x.count > 0)
    .map((x) => ({ name: x.name.replace(/\.exe$/i, '').trim().slice(0, 60), count: Math.round(x.count) }))
    .sort((p, q) => q.count - p.count || p.name.localeCompare(q.name))
    .slice(0, 10);
}

export function stabilityFromMac(raw: RawMac['stability']): LocalDetails['stability'] {
  if (!raw) return null;
  return { appCrashes: raw.appCrashes, unexpectedShutdowns: raw.panics, apps: cleanApps(raw.apps) };
}

/* Mac crash report file names: "Safari-2026-10-10-120000.ips",
   "Microsoft Word_2026-10-10-120000_MacBook.crash", panics as
   "panic-full-2026-10-10-120000.panic" or "Kernel-….ips". */
export function macCrashApp(fileName: string): { kind: 'app' | 'panic' | 'skip'; name: string } {
  const f = fileName.trim();
  if (!/\.(ips|crash|panic)$/i.test(f)) return { kind: 'skip', name: '' };
  if (/^(panic|kernel)[-_]/i.test(f) || /\.panic$/i.test(f)) return { kind: 'panic', name: '' };
  if (/^(JetsamEvent|ExcUserFault_|ExcResource|LowBattery|shutdown_stall|Sandbox|SiriSearch|stacks)/i.test(f)) return { kind: 'skip', name: '' };
  if (/\.(cpu_resource|wakeups_resource|diskwrites_resource|spin|hang|diag)\./i.test(f)) return { kind: 'skip', name: '' };
  const m = /^(.+?)[-_]\d{4}-\d{2}-\d{2}-\d{6}/.exec(f);
  const name = (m ? m[1] : f.replace(/\.(ips|crash)$/i, '')).trim();
  return name ? { kind: 'app', name } : { kind: 'skip', name: '' };
}

const CRASH_WARN = 20;
const SHUTDOWN_WARN = 3;

export function evalCrashes(s: LocalDetails['stability'], platform: string): CheckResult {
  const base = { id: 'crashes', title: 'Crashes in the last 30 days', category: 'performance' as const };
  if (!s || (s.appCrashes == null && s.unexpectedShutdowns == null)) {
    return result({ ...base, status: 'unknown', detail: "We couldn't read this computer's crash history." });
  }
  const c = s.appCrashes ?? 0;
  const u = s.unexpectedShutdowns ?? 0;
  const shutdownWord = platform === 'darwin' ? 'unexpected restart' : 'unexpected shutdown';
  const parts = [`${c} app crash${c === 1 ? '' : 'es'}`];
  if (s.unexpectedShutdowns != null) parts.push(`${u} ${shutdownWord}${u === 1 ? '' : 's'}`);
  const counts = `${parts.join(' and ')} in the last 30 days.`;
  const localNote = s.apps.length ? `Most crashes: ${s.apps.slice(0, 3).map((a) => `${a.name} (${a.count})`).join(', ')}.` : undefined;
  if (u >= SHUTDOWN_WARN) {
    return result({
      ...base,
      status: 'warn',
      detail: `${counts} Computers that keep switching off by themselves often have a hardware or overheating problem — we can take a look.`,
      askUs: true,
      localNote,
    });
  }
  if (c >= CRASH_WARN) {
    return result({ ...base, status: 'warn', detail: `${counts} That’s more than usual — updates or a tidy-up often help.`, askUs: true, localNote });
  }
  return result({ ...base, status: 'ok', detail: c === 0 && u === 0 ? 'No crashes in the last 30 days.' : counts, localNote });
}

/* ── Remote access apps (scam protection) ── */

/* Process names (Windows, without .exe) and macOS executable/app names
   of third-party remote access apps. Matched case-insensitively on the
   whole name. PC Workshop's own PCW-Connect is never flagged. */
export const REMOTE_TOOLS: { label: string; names: RegExp }[] = [
  { label: 'AnyDesk', names: /^anydesk/i },
  { label: 'TeamViewer', names: /^(teamviewer|tv_w32|tv_x64)/i },
  { label: 'UltraViewer', names: /^ultraviewer/i },
  { label: 'ScreenConnect (ConnectWise Control)', names: /^(screenconnect|connectwisecontrol|connectwise)/i },
  { label: 'LogMeIn', names: /^(logmein|lmiguardian|lmi_rescue|lmi-rescue|gotoassist|goto ?resolve)/i },
  { label: 'Splashtop', names: /^(splashtop|srservice|srmanager|srstreamer|strwinclt|sragent)$/i },
  { label: 'RustDesk', names: /^rustdesk/i },
  { label: 'Quick Assist', names: /^quickassist$/i },
  { label: 'SupRemo', names: /^supremo/i },
  { label: 'Ammyy Admin', names: /^(ammyy|aa_v3)/i },
  { label: 'Chrome Remote Desktop', names: /^(remoting_host|remoting_me2me_host|chrome ?remote ?desktop ?host)$/i },
  { label: 'VNC', names: /^(winvnc|tvnserver|vncserver|vncagent|vncserverui)$/i },
  { label: 'Zoho Assist', names: /^(zohoassist|zaservice|za_connect|zohomeeting)/i },
  { label: 'BeyondTrust (Bomgar)', names: /^bomgar/i },
  { label: 'AeroAdmin', names: /^aeroadmin/i },
  { label: 'LiteManager', names: /^(romserver|romviewer|litemanager)/i },
  { label: 'RemotePC', names: /^remotepc/i },
  { label: 'Iperius Remote', names: /^iperiusremote/i },
  { label: 'NetSupport', names: /^(client32|netsupport)/i },
  { label: 'HopToDesk', names: /^hoptodesk/i },
  { label: 'DWService', names: /^dwagent/i },
  { label: 'Getscreen', names: /^getscreen/i },
];

const OURS = /pcw[ -_]?connect/i;

/* Windows gives bare process names; macOS gives full executable paths
   ("/Applications/AnyDesk.app/Contents/MacOS/AnyDesk"), where the .app
   bundle name is checked too and anything inside PCW-Connect.app (whose
   binary may be called RustDesk) is skipped. Returns display labels. */
export function findRemoteTools(processes: string[] | null | undefined): string[] {
  const found = new Set<string>();
  for (const raw of processes ?? []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const p = raw.trim();
    if (OURS.test(p)) continue;
    const parts = p.split(/[\\/]/).filter(Boolean);
    const base = (parts[parts.length - 1] ?? p).replace(/\.exe$/i, '');
    const bundle = parts.find((x) => /\.app$/i.test(x))?.replace(/\.app$/i, '') ?? null;
    for (const t of REMOTE_TOOLS) {
      if (t.names.test(base) || (bundle && t.names.test(bundle.replace(/\s+/g, '')))) found.add(t.label);
    }
  }
  return [...found].sort();
}

export function evalRemoteTools(processes: string[] | null | undefined, platform: string): { check: CheckResult; found: string[] } {
  const base = { id: 'remote_tools', title: 'Remote access apps', category: 'security' as const };
  if (processes == null) {
    return { check: result({ ...base, status: 'unknown', detail: "We couldn't check for remote access apps." }), found: [] };
  }
  const found = findRemoteTools(processes);
  if (!found.length) {
    return { check: result({ ...base, status: 'ok', detail: 'No other remote access apps are running.' }), found };
  }
  return {
    check: result({
      ...base,
      status: 'warn',
      detail:
        'A remote access app is running on this computer. If you didn’t set it up yourself, or someone you don’t know asked you to install it, someone else may be able to control your computer — hang up on any caller and ring us.',
      fixes: platform === 'win32' ? ['open:apps'] : [],
      askUs: true,
      localNote: `Running now: ${found.join(', ')}.`,
    }),
    found,
  };
}

/* ── Expired / switched-off antivirus (Windows Security Center) ── */

const MICROSOFT_AV = /windows defender|microsoft defender/i;

export function evalAntivirusExpired(raw: RawWindowsSecurity | null): CheckResult {
  const base = { id: 'antivirus_expired', title: 'Expired antivirus', category: 'security' as const, fixes: ['open:security' as const] };
  if (!raw || raw.av == null) return result({ ...base, status: 'unknown', detail: "We couldn't read which antivirus apps are installed." });
  const third = (raw.av ?? [])
    .filter((p) => p && p.name && !MICROSOFT_AV.test(p.name) && Number.isFinite(p.state))
    .map((p) => ({ name: p.name.trim().slice(0, 60), ...decodeProductState(p.state) }));
  const stale = third.filter((p) => !p.enabled || !p.upToDate);
  if (!third.length) return result({ ...base, status: 'ok', detail: 'No other antivirus apps are installed — Microsoft Defender looks after this computer.' });
  if (!stale.length) return result({ ...base, status: 'ok', detail: `${third.map((p) => p.name).join(' and ')} ${third.length === 1 ? 'is' : 'are'} on and up to date.` });
  const p = stale[0];
  const state = !p.enabled ? 'switched off' : 'out of date';
  return result({
    ...base,
    status: 'warn',
    detail: `${p.name} is installed but ${state} — its subscription may have run out. Renew it, or remove it so Microsoft Defender can protect you instead.`,
    fixes: ['open:security', 'open:apps'],
    askUs: true,
  });
}

/* ── BitLocker (Windows) ── */

export const RECOVERY_KEY_URL = 'https://aka.ms/myrecoverykey';

/* System.Volume.BitLockerProtection: 1 on, 2 off, 3 encrypting,
   4 decrypting, 5 suspended, 6 on (locked), 8 waiting for activation. */
export function evalBitLocker(raw: RawWindowsBitLocker | null | undefined): CheckResult {
  const base = { id: 'bitlocker', title: 'BitLocker drive encryption', category: 'security' as const };
  const v = raw?.protection;
  switch (v) {
    case 1:
    case 6:
    case 3:
      return result({
        ...base,
        status: 'ok',
        detail: `${v === 3 ? 'BitLocker is encrypting your drive.' : 'BitLocker is protecting your files.'} Make sure you know where your recovery key is — Windows can ask for it after a repair or a hardware change. It’s usually saved in your Microsoft account.`,
        fixes: ['open:recovery-key'],
      });
    case 5:
      return result({
        ...base,
        status: 'info',
        detail: 'BitLocker is paused — Windows does this for a restart during updates and turns it back on afterwards.',
        fixes: ['open:recovery-key'],
      });
    case 2:
    case 8:
    case 4:
      return result({
        ...base,
        status: 'info',
        detail: 'Drive encryption isn’t switched on. It protects your files if your computer is lost or stolen — ask us if you’d like it set up.',
      });
    default:
      return result({ ...base, status: 'unknown', detail: 'Windows doesn’t let us read the encryption setting without admin rights — nothing to worry about.' });
  }
}
