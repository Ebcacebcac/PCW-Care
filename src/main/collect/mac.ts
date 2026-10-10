/* macOS-specific facts from the built-in command-line tools, each with a
   fixed argument list and its own timeout. Nothing here needs admin. */

import fs from 'node:fs/promises';
import type { MacUpdateItem, RawMac } from './raw';
import { run } from './exec';

const XPROTECT_PLISTS = [
  '/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist',
  '/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist',
];

export async function collectMac(): Promise<RawMac> {
  const [hardware, softwareUpdate, gatekeeper, xprotectVersion, fileVault, firewall, disk, power] = await Promise.all([
    hardwareInfo(),
    softwareUpdates(),
    gatekeeperStatus(),
    xprotect(),
    fileVaultStatus(),
    firewallStatus(),
    diskInfo(),
    powerInfo(),
  ]);
  return { hardware, softwareUpdate, gatekeeper, xprotectVersion, fileVault, firewall, smart: disk.smart, volumeName: disk.volumeName, power };
}

async function hardwareInfo(): Promise<RawMac['hardware']> {
  const r = await run('/usr/sbin/system_profiler', ['SPHardwareDataType', '-json', '-detailLevel', 'mini'], 30_000);
  try {
    const j = JSON.parse(r.stdout) as { SPHardwareDataType?: Record<string, string>[] };
    const h = j.SPHardwareDataType?.[0];
    if (!h) return null;
    return {
      machineName: h.machine_name || '',
      machineModel: h.machine_model || h.model_number || '',
      chip: h.chip_type || h.cpu_type || '',
      serial: h.serial_number || '',
    };
  } catch {
    return null;
  }
}

/* `softwareupdate -l` contacts Apple and can be slow; if it times out, the
   cached result of macOS's own background scan (--no-scan) is used. */
async function softwareUpdates(): Promise<RawMac['softwareUpdate']> {
  let r = await run('/usr/sbin/softwareupdate', ['-l'], 90_000);
  let cached = false;
  if (r.timedOut) {
    r = await run('/usr/sbin/softwareupdate', ['-l', '--no-scan'], 20_000);
    cached = true;
  }
  return parseSoftwareUpdate(r.stdout + '\n' + r.stderr, cached);
}

export function parseSoftwareUpdate(text: string, cached = false): RawMac['softwareUpdate'] {
  if (/No new software available/i.test(text)) return { updates: [], cached };
  const updates: MacUpdateItem[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\*\s*Label:\s*(.+)$/.exec(lines[i]);
    if (!m) continue;
    const details = lines[i + 1] ?? '';
    const title = /Title:\s*([^,]+)/.exec(details)?.[1]?.trim() ?? m[1].trim();
    updates.push({
      label: m[1].trim(),
      title,
      recommended: /Recommended:\s*YES/i.test(details),
      restart: /Action:\s*restart/i.test(details) || /\[restart\]/i.test(details),
    });
  }
  if (updates.length) return { updates, cached };
  return null; // couldn't tell (offline, error, unexpected output)
}

async function gatekeeperStatus(): Promise<boolean | null> {
  const r = await run('/usr/sbin/spctl', ['--status'], 10_000);
  const t = (r.stdout + r.stderr).toLowerCase();
  if (t.includes('assessments enabled')) return true;
  if (t.includes('assessments disabled')) return false;
  return null;
}

async function xprotect(): Promise<string | null> {
  for (const p of XPROTECT_PLISTS) {
    try {
      const xml = await fs.readFile(p, 'utf8');
      const m = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(xml);
      if (m) return m[1].trim();
      return 'present';
    } catch {
      /* try the next location */
    }
  }
  return null;
}

export function parseFileVault(text: string): RawMac['fileVault'] {
  if (/FileVault is On/i.test(text)) return 'on';
  if (/FileVault is Off/i.test(text)) return 'off';
  if (/Encryption in progress/i.test(text)) return 'encrypting';
  if (/Decryption in progress/i.test(text)) return 'decrypting';
  return null;
}

async function fileVaultStatus(): Promise<RawMac['fileVault']> {
  const r = await run('/usr/bin/fdesetup', ['status'], 10_000);
  return parseFileVault(r.stdout + r.stderr);
}

export function parseFirewall(text: string): boolean | null {
  const m = /State\s*=\s*(\d)/.exec(text);
  if (m) return m[1] !== '0';
  if (/is enabled/i.test(text)) return true;
  if (/is disabled/i.test(text)) return false;
  return null;
}

async function firewallStatus(): Promise<boolean | null> {
  const r = await run('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate'], 10_000);
  return parseFirewall(r.stdout + r.stderr);
}

export function parseDiskutil(text: string): { smart: string | null; volumeName: string | null; wholeDisk: string | null } {
  const smart = /SMART Status:\s*(.+)/.exec(text)?.[1]?.trim() ?? null;
  const volumeName = /Volume Name:\s*(.+)/.exec(text)?.[1]?.trim() ?? null;
  const wholeDisk = /APFS Physical Store:\s*(disk\d+)/.exec(text)?.[1] ?? null;
  return { smart, volumeName, wholeDisk };
}

/* The SMART status of the startup disk. For APFS, `diskutil info /` may say
   "Not Supported" for the synthesised container, so the physical store is
   asked as well. */
async function diskInfo(): Promise<{ smart: string | null; volumeName: string | null }> {
  const root = parseDiskutil((await run('/usr/sbin/diskutil', ['info', '/'], 20_000)).stdout);
  let smart = root.smart;
  if (!smart || /not supported/i.test(smart)) {
    const store = root.wholeDisk && /^disk\d+$/.test(root.wholeDisk) ? root.wholeDisk.replace(/s\d+$/, '') : 'disk0';
    const phys = parseDiskutil((await run('/usr/sbin/diskutil', ['info', store], 20_000)).stdout);
    if (phys.smart) smart = phys.smart;
  }
  return { smart, volumeName: root.volumeName };
}

interface PowerItem {
  _name?: string;
  sppower_battery_health_info?: {
    sppower_battery_cycle_count?: number;
    sppower_battery_health?: string;
    sppower_battery_health_maximum_capacity?: string;
  };
  sppower_battery_charge_info?: {
    sppower_battery_state_of_charge?: number;
    sppower_battery_is_charging?: string;
  };
}

export function parsePower(json: string): RawMac['power'] {
  try {
    const j = JSON.parse(json) as { SPPowerDataType?: PowerItem[] };
    const b = j.SPPowerDataType?.find((x) => x._name === 'spbattery_information' || x.sppower_battery_health_info);
    if (!b) return null;
    const h = b.sppower_battery_health_info ?? {};
    const c = b.sppower_battery_charge_info ?? {};
    const pct = h.sppower_battery_health_maximum_capacity ? parseInt(h.sppower_battery_health_maximum_capacity, 10) : NaN;
    return {
      cycles: typeof h.sppower_battery_cycle_count === 'number' ? h.sppower_battery_cycle_count : null,
      condition: h.sppower_battery_health ?? null,
      maxCapacityPct: Number.isFinite(pct) ? pct : null,
      percent: typeof c.sppower_battery_state_of_charge === 'number' ? c.sppower_battery_state_of_charge : null,
      charging: c.sppower_battery_is_charging ? c.sppower_battery_is_charging === 'TRUE' : null,
    };
  } catch {
    return null;
  }
}

async function powerInfo(): Promise<RawMac['power']> {
  const r = await run('/usr/sbin/system_profiler', ['SPPowerDataType', '-json'], 30_000);
  return parsePower(r.stdout);
}
