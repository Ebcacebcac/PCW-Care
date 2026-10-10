/* Pure functions that turn raw collector output into plain-English
   ok / warn / bad / unknown results. No I/O here — everything is unit
   tested with recorded inputs. */

import type { CheckResult, DiskType, PhysicalDiskInfo, Status, VolumeInfo, BatteryInfo } from '../../shared/types';
import { agoText, daysBetween, formatBytes, formatGb } from '../../shared/format';
import type { RawCommon, RawMac, RawTemp, RawWindowsInfo, RawWindowsSecurity, RawWindowsUpdates } from '../collect/raw';

const NOT_CHECKED = "We couldn't check this on this computer.";

function result(partial: Omit<CheckResult, 'fixes'> & { fixes?: CheckResult['fixes'] }): CheckResult {
  return { fixes: [], ...partial };
}

/* ── Updates ── */

export function evalWindowsUpdate(raw: RawWindowsUpdates | null, now: Date): CheckResult {
  const base = { id: 'updates', title: 'Windows Update', category: 'updates' as const, fixes: ['open:updates' as const] };
  const dates = [raw?.lastHistoryDate, raw?.lastHotfixDate]
    .map((d) => (d ? new Date(d) : null))
    .filter((d): d is Date => d != null && !Number.isNaN(d.getTime()) && d.getTime() <= now.getTime() + 86_400_000);
  if (!dates.length) {
    return result({ ...base, status: 'unknown', detail: "We couldn't find when Windows last installed an update. Open Windows Update to check." });
  }
  const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
  const days = Math.max(0, daysBetween(latest, now));
  const when = `Last update installed ${agoText(days)}.`;
  if (days <= 35) return result({ ...base, status: 'ok', detail: when });
  if (days <= 75) return result({ ...base, status: 'warn', detail: `${when} Windows normally updates every month — it's worth checking for updates.` });
  return result({ ...base, status: 'bad', detail: `${when} Your computer is missing important security updates.`, askUs: true });
}

export function evalPendingRestart(raw: RawWindowsUpdates | null): CheckResult | null {
  if (!raw || raw.rebootPending == null) return null;
  const base = { id: 'pending-restart', title: 'Restart to finish updates', category: 'updates' as const };
  if (raw.rebootPending) {
    return result({ ...base, status: 'warn', detail: 'Windows has installed updates that need a restart to finish.', fixes: ['restart'] });
  }
  return result({ ...base, status: 'ok', detail: 'No restart needed for updates.' });
}

export function evalMacUpdates(raw: RawMac['softwareUpdate']): CheckResult {
  const base = { id: 'updates', title: 'macOS updates', category: 'updates' as const, fixes: ['open:updates' as const] };
  if (!raw) {
    return result({ ...base, status: 'unknown', detail: "We couldn't reach Apple to check for updates. Open Software Update to check." });
  }
  if (!raw.updates.length) {
    return result({ ...base, status: 'ok', detail: raw.cached ? 'No updates were waiting at the last check.' : 'Your Mac is up to date.' });
  }
  const n = raw.updates.length;
  const names = raw.updates.slice(0, 2).map((u) => u.title).join(', ');
  const restart = raw.updates.some((u) => u.restart) ? ' Your Mac will need to restart to install them.' : '';
  return result({ ...base, status: 'warn', detail: `${n} update${n === 1 ? '' : 's'} available (${names}${n > 2 ? ', …' : ''}).${restart}` });
}

/* ── Security (Windows) ── */

/* Security Center productState: the second byte says whether the product is
   switched on (0x10/0x11), the low byte whether its definitions are up to
   date (0x00) or out of date (0x10). */
export function decodeProductState(state: number): { enabled: boolean; upToDate: boolean } {
  const hex = Math.trunc(state).toString(16).padStart(6, '0');
  const enabledByte = hex.slice(2, 4);
  const sigByte = hex.slice(4, 6);
  return { enabled: enabledByte === '10' || enabledByte === '11', upToDate: sigByte === '00' };
}

export function evalWindowsAntivirus(raw: RawWindowsSecurity | null): CheckResult {
  const base = { id: 'antivirus', title: 'Virus protection', category: 'security' as const, fixes: ['open:security' as const] };
  const products = (raw?.av ?? []).filter((p) => p && p.name);
  const decoded = products.map((p) => ({ name: p.name, ...decodeProductState(p.state) }));
  const active = decoded.filter((p) => p.enabled);
  const defender = raw?.defender ?? null;

  if (active.length) {
    const good = active.find((p) => p.upToDate);
    if (good) return result({ ...base, status: 'ok', detail: `Protected by ${good.name}.` });
    return result({ ...base, status: 'warn', detail: `${active[0].name} is on, but its virus definitions are out of date.` });
  }
  if (decoded.length) {
    return result({
      ...base,
      status: 'bad',
      detail: `${decoded.map((p) => p.name).join(' and ')} ${decoded.length === 1 ? 'is' : 'are'} installed but switched off. Your computer isn't protected against viruses.`,
      askUs: true,
    });
  }
  // No Security Center data (e.g. Windows Server) — fall back to Defender's own status.
  if (defender) {
    if (defender.antivirusEnabled && defender.realTime) {
      if (defender.sigAgeDays > 7 && defender.sigAgeDays < 10_000) {
        return result({ ...base, status: 'warn', detail: `Microsoft Defender is on, but its virus definitions are ${defender.sigAgeDays} days old.` });
      }
      return result({ ...base, status: 'ok', detail: 'Protected by Microsoft Defender Antivirus.' });
    }
    if (/passive/i.test(defender.mode)) {
      return result({ ...base, status: 'unknown', detail: 'Microsoft Defender is in passive mode, so another antivirus should be protecting you.' });
    }
    return result({ ...base, status: 'bad', detail: "Microsoft Defender's real-time protection is switched off.", askUs: true });
  }
  return result({ ...base, status: 'unknown', detail: "We couldn't read your antivirus status. Open Windows Security to check." });
}

export function evalWindowsFirewall(raw: RawWindowsSecurity | null): CheckResult {
  const base = { id: 'firewall', title: 'Firewall', category: 'security' as const, fixes: ['open:firewall' as const] };
  const thirdParty = (raw?.fwProducts ?? []).map((p) => ({ name: p.name, ...decodeProductState(p.state) })).filter((p) => p.enabled);
  const profiles = raw?.firewall ?? null;
  if (thirdParty.length) return result({ ...base, status: 'ok', detail: `Protected by ${thirdParty[0].name}.` });
  if (!profiles || !profiles.length) {
    return result({ ...base, status: 'unknown', detail: "We couldn't read the firewall settings. Open Windows Security to check." });
  }
  const off = profiles.filter((p) => !/^(true|1)$/i.test(String(p.enabled)));
  if (!off.length) return result({ ...base, status: 'ok', detail: 'Windows Firewall is on for all networks.' });
  if (off.length === profiles.length) {
    return result({ ...base, status: 'bad', detail: 'Windows Firewall is switched off.' });
  }
  const names = off.map((p) => p.name).join(' and ');
  return result({ ...base, status: 'warn', detail: `Windows Firewall is off for ${names} networks.` });
}

/* ── Security (Mac) ── */

export function evalMacProtection(gatekeeper: boolean | null, xprotectVersion: string | null): CheckResult {
  const base = { id: 'antivirus', title: 'Built-in malware protection', category: 'security' as const, fixes: ['open:security' as const] };
  if (gatekeeper === false) {
    return result({ ...base, status: 'bad', detail: 'Gatekeeper is switched off, so apps from anywhere can run without being checked.', askUs: true });
  }
  if (gatekeeper === true) {
    const xp = xprotectVersion && xprotectVersion !== 'present' ? ` XProtect version ${xprotectVersion}.` : '';
    return result({ ...base, status: 'ok', detail: `Gatekeeper and XProtect are protecting your Mac.${xp}` });
  }
  return result({ ...base, status: 'unknown', detail: "We couldn't read Gatekeeper's status." });
}

export function evalFileVault(fv: RawMac['fileVault']): CheckResult {
  const base = { id: 'encryption', title: 'FileVault disk encryption', category: 'security' as const, fixes: ['open:encryption' as const] };
  switch (fv) {
    case 'on':
      return result({ ...base, status: 'ok', detail: 'Your files are encrypted if your Mac is lost or stolen.' });
    case 'encrypting':
      return result({ ...base, status: 'ok', detail: 'FileVault is encrypting your disk.' });
    case 'off':
    case 'decrypting':
      return result({ ...base, status: 'warn', detail: 'FileVault is off. Anyone with your Mac could read your files. Make a note of your recovery key if you turn it on.' });
    default:
      return result({ ...base, status: 'unknown', detail: "We couldn't read FileVault's status." });
  }
}

export function evalMacFirewall(on: boolean | null): CheckResult {
  const base = { id: 'firewall', title: 'Firewall', category: 'security' as const, fixes: ['open:firewall' as const] };
  if (on === true) return result({ ...base, status: 'ok', detail: 'The macOS firewall is on.' });
  if (on === false) return result({ ...base, status: 'warn', detail: 'The macOS firewall is off. Turning it on adds protection on public Wi-Fi.' });
  return result({ ...base, status: 'unknown', detail: "We couldn't read the firewall setting." });
}

/* ── Storage ── */

const WIN_GB = 1024 ** 3;
const MAC_GB = 1e9;

export function bytesToGb(bytes: number, platform: string): number {
  // Match what the customer sees: Explorer counts in GiB, Finder in GB.
  return Math.round((bytes / (platform === 'darwin' ? MAC_GB : WIN_GB)) * 10) / 10;
}

export function windowsDiskType(mediaType: string, busType: string): DiskType {
  if (/nvme/i.test(busType)) return 'NVMe';
  if (/ssd/i.test(mediaType)) return 'SSD';
  if (/hdd/i.test(mediaType)) return 'HDD';
  return 'unknown';
}

export function windowsHealth(h: string): Status {
  if (/^healthy$/i.test(h)) return 'ok';
  if (/warning/i.test(h)) return 'warn';
  if (/unhealthy/i.test(h)) return 'bad';
  return 'unknown';
}

export function smartHealth(s: string | null | undefined): Status {
  if (!s) return 'unknown';
  if (/verified|^ok$|healthy/i.test(s)) return 'ok';
  if (/fail|predicted/i.test(s)) return 'bad';
  return 'unknown';
}

export function windowsDisks(info: RawWindowsInfo | null): { volumes: VolumeInfo[]; physical: PhysicalDiskInfo[] } {
  const physical: (PhysicalDiskInfo & { number: string; usb: boolean })[] = (info?.physical ?? [])
    .filter((d) => d && d.size > 0)
    .map((d) => ({
      number: String(d.number),
      usb: /usb/i.test(d.busType || ''),
      name: d.name || `Disk ${d.number}`,
      type: windowsDiskType(d.mediaType || '', d.busType || ''),
      sizeGb: bytesToGb(d.size, 'win32'),
      health: windowsHealth(d.health || ''),
      healthText: d.health || undefined,
    }));
  const internal = physical.filter((d) => !d.usb);
  const partByLetter = new Map((info?.partitions ?? []).map((p) => [String(p.letter).toUpperCase(), String(p.disk)]));
  const volumes: VolumeInfo[] = (info?.drives ?? [])
    .filter((d) => d && d.id && d.size > 0)
    .map((d) => {
      const letter = d.id.replace(':', '').toUpperCase();
      const diskNo = partByLetter.get(letter);
      const disk = diskNo != null ? physical.find((p) => p.number === diskNo) : internal.length === 1 ? internal[0] : undefined;
      return {
        name: d.id.toUpperCase(),
        label: d.label || undefined,
        type: disk?.type ?? 'unknown',
        sizeGb: bytesToGb(d.size, 'win32'),
        freeGb: bytesToGb(d.free, 'win32'),
        health: disk?.health ?? 'unknown',
      };
    });
  return { volumes, physical: physical.map(({ number: _n, usb: _u, ...rest }) => rest) };
}

export function macDisks(common: RawCommon, mac: RawMac | null): { volumes: VolumeInfo[]; physical: PhysicalDiskInfo[] } {
  const health = smartHealth(mac?.smart);
  const layout = common.diskLayout ?? [];
  const internal = layout.find((d) => !/usb|thunderbolt/i.test(d.interfaceType)) ?? layout[0];
  const type: DiskType = internal ? (/nvme|pci/i.test(internal.interfaceType) ? 'NVMe' : /ssd/i.test(internal.type) ? 'SSD' : /hd/i.test(internal.type) ? 'HDD' : 'SSD') : 'SSD';
  const fsList = common.fs ?? [];
  const data = fsList.find((f) => f.mount === '/System/Volumes/Data') ?? fsList.find((f) => f.mount === '/');
  const volumes: VolumeInfo[] = data
    ? [{ name: mac?.volumeName || 'Macintosh HD', type, sizeGb: bytesToGb(data.size, 'darwin'), freeGb: bytesToGb(data.available, 'darwin'), health }]
    : [];
  const physical: PhysicalDiskInfo[] = internal
    ? [{ name: internal.name || 'Internal disk', type, sizeGb: bytesToGb(internal.size, 'darwin'), health, healthText: mac?.smart ?? undefined }]
    : [];
  return { volumes, physical };
}

export function genericDisks(common: RawCommon): { volumes: VolumeInfo[]; physical: PhysicalDiskInfo[] } {
  const skip = /^(\/boot|\/snap|\/run|\/dev|\/sys|\/proc|\/var\/lib\/docker)/;
  const volumes: VolumeInfo[] = (common.fs ?? [])
    .filter((f) => f.size > 1e9 && f.mount && !skip.test(f.mount) && !/tmpfs|overlay|squashfs/i.test(f.type))
    .slice(0, 8)
    .map((f) => ({ name: f.mount, type: 'unknown', sizeGb: bytesToGb(f.size, 'linux'), freeGb: bytesToGb(f.available, 'linux'), health: 'unknown' }));
  const physical: PhysicalDiskInfo[] = (common.diskLayout ?? []).slice(0, 8).map((d) => ({
    name: d.name || 'Disk',
    type: /nvme/i.test(d.interfaceType) ? 'NVMe' : /ssd/i.test(d.type) ? 'SSD' : /hd/i.test(d.type) ? 'HDD' : 'unknown',
    sizeGb: bytesToGb(d.size, 'linux'),
    health: smartHealth(d.smartStatus),
    healthText: d.smartStatus || undefined,
  }));
  return { volumes, physical };
}

export function evalDiskSpace(v: VolumeInfo): CheckResult {
  const id = `disk-space:${v.name}`;
  const title = `Free space on ${v.name}`;
  const base = { id, title, category: 'storage' as const, fixes: ['open:storage' as const] };
  if (!(v.sizeGb > 0)) return result({ ...base, status: 'unknown', detail: NOT_CHECKED });
  const pct = (v.freeGb / v.sizeGb) * 100;
  const text = `${formatGb(v.freeGb)} free of ${formatGb(v.sizeGb)} (${Math.round(pct)}%).`;
  if (v.freeGb < 8 || pct < 5) {
    return result({ ...base, status: 'bad', detail: `${text} Your computer is nearly full, which slows it down and can stop updates installing.` });
  }
  if (v.freeGb < 20 || pct < 10) {
    return result({ ...base, status: 'warn', detail: `${text} It's getting full — clearing some space will help.` });
  }
  return result({ ...base, status: 'ok', detail: text });
}

export function evalDiskHealth(disks: PhysicalDiskInfo[]): CheckResult {
  const base = { id: 'disk-health', title: 'Disk health', category: 'storage' as const };
  if (!disks.length) return result({ ...base, status: 'unknown', detail: "We couldn't read your disk's health." });
  const bad = disks.filter((d) => d.health === 'bad');
  const warn = disks.filter((d) => d.health === 'warn');
  if (bad.length) {
    return result({
      ...base,
      status: 'bad',
      detail: `${bad[0].name} is reporting a fault. Back up your files now and let us take a look.`,
      askUs: true,
    });
  }
  if (warn.length) {
    return result({ ...base, status: 'warn', detail: `${warn[0].name} is showing early warning signs. Make sure your files are backed up.`, askUs: true });
  }
  if (disks.every((d) => d.health === 'ok')) {
    return result({ ...base, status: 'ok', detail: disks.length === 1 ? 'Your disk reports no problems.' : 'Your disks report no problems.' });
  }
  return result({ ...base, status: 'unknown', detail: "Your disk doesn't report its health to us." });
}

export function evalTempFiles(temp: RawTemp | null): CheckResult | null {
  if (!temp) return null;
  const base = { id: 'temp-files', title: 'Temporary files', category: 'storage' as const };
  const total = formatBytes(temp.totalBytes);
  const clearable = formatBytes(temp.clearableBytes);
  const gb = temp.clearableBytes / 1024 ** 3;
  const detail = `${total} of temporary files${temp.clearableBytes > 0 ? ` — about ${clearable} can be cleared` : ''}.`;
  if (gb >= 2) return result({ ...base, status: 'warn', detail, fixes: ['clean-temp'] });
  return result({ ...base, status: 'ok', detail, fixes: temp.clearableBytes > 50 * 1024 * 1024 ? ['clean-temp'] : [] });
}

/* ── Battery ── */

export function batteryFromRaw(common: RawCommon, mac: RawMac | null): BatteryInfo | null {
  const b = common.battery;
  const mp = mac?.power ?? null;
  if (!(b && b.hasBattery) && !mp) return null;
  let healthPct: number | null = null;
  if (mp?.maxCapacityPct != null) healthPct = mp.maxCapacityPct;
  else if (b && b.designedCapacity > 0 && b.maxCapacity > 0) healthPct = Math.min(100, Math.round((b.maxCapacity / b.designedCapacity) * 100));
  const cycles = mp?.cycles ?? (b && b.cycleCount > 0 ? b.cycleCount : null);
  return {
    healthPct,
    cycles,
    charging: mp?.charging ?? (b ? b.isCharging : null),
    percent: mp?.percent ?? (b ? Math.round(b.percent) : null),
    designCapacity: b && b.designedCapacity > 0 ? b.designedCapacity : null,
    fullCapacity: b && b.maxCapacity > 0 ? b.maxCapacity : null,
    capacityUnit: b?.capacityUnit || undefined,
    condition: mp?.condition ?? undefined,
  };
}

export function evalBattery(b: BatteryInfo | null): CheckResult | null {
  if (!b) return null;
  const base = { id: 'battery', title: 'Battery health', category: 'battery' as const, fixes: ['open:battery' as const] };
  const cycles = b.cycles != null ? ` ${b.cycles} charge cycles.` : '';
  if (b.condition && /service|replace|poor|check/i.test(b.condition)) {
    return result({ ...base, status: 'bad', detail: `macOS says the battery needs servicing (${b.condition}).${cycles}`, askUs: true });
  }
  if (b.healthPct == null) {
    return result({ ...base, status: 'unknown', detail: `We couldn't read the battery's capacity.${cycles}` });
  }
  const text = `Holds ${b.healthPct}% of its original charge.${cycles}`;
  if (b.healthPct < 60) return result({ ...base, status: 'bad', detail: `${text} It's worn out — a new battery would last much longer.`, askUs: true });
  if (b.healthPct < 80) return result({ ...base, status: 'warn', detail: `${text} It's starting to wear.`, askUs: true });
  return result({ ...base, status: 'ok', detail: text });
}

/* ── Performance ── */

export function evalUptime(hours: number | null, platform: string): CheckResult {
  const base = { id: 'uptime', title: 'Time since last restart', category: 'performance' as const };
  if (hours == null) return result({ ...base, status: 'unknown', detail: NOT_CHECKED });
  const days = Math.floor(hours / 24);
  if (days > 7) {
    const fastStartup = platform === 'win32' ? ' Shutting down doesn’t fully reset Windows — a restart does.' : '';
    return result({
      ...base,
      status: 'warn',
      detail: `Your computer hasn't restarted for ${days} days. A restart clears out slowdowns and finishes updates.${fastStartup}`,
      fixes: ['restart'],
    });
  }
  const h = Math.max(1, Math.round(hours));
  const text = hours < 24 ? `Restarted ${h} hour${h === 1 ? '' : 's'} ago.` : `Restarted ${days} day${days === 1 ? '' : 's'} ago.`;
  return result({ ...base, status: 'ok', detail: text });
}

export function evalStartupApps(count: number | null): CheckResult | null {
  if (count == null) return null;
  const base = { id: 'startup-apps', title: 'Apps that start with Windows', category: 'performance' as const, fixes: ['open:startup' as const] };
  if (count > 15) {
    return result({ ...base, status: 'warn', detail: `${count} apps start when you sign in, which can make start-up slow. Turn off the ones you don't need.` });
  }
  return result({ ...base, status: 'ok', detail: `${count} app${count === 1 ? '' : 's'} start${count === 1 ? 's' : ''} when you sign in.` });
}

export function evalMemory(totalGb: number | null): CheckResult {
  const base = { id: 'memory', title: 'Memory (RAM)', category: 'memory' as const };
  if (totalGb == null || !(totalGb > 0)) return result({ ...base, status: 'unknown', detail: NOT_CHECKED });
  if (totalGb < 3.5) {
    return result({ ...base, status: 'warn', detail: `${formatGb(totalGb)} of memory is tight for today's apps — an upgrade would make a real difference.`, askUs: true });
  }
  return result({ ...base, status: 'ok', detail: `${formatGb(totalGb)} of memory installed.` });
}

export { overallStatus, worstStatus } from '../../shared/status';
