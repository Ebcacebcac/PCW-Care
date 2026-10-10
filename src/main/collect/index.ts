/* Runs every collector for this platform and turns the results into a
   DeviceReport. Never throws: anything that fails becomes "unknown". This
   module must not import Electron — the headless self-test uses it. */

import type { BatteryInfo, CheckResult, DeviceReport, DeviceType } from '../../shared/types';
import type { RawCollection, RawCommon, RawMac, RawWindows } from './raw';
import { collectCommon } from './common';
import { collectWindows } from './windows';
import { collectMac } from './mac';
import * as ev from '../checks/evaluate';

export async function collectRaw(platform: string = process.platform): Promise<RawCollection> {
  const isWin = platform === 'win32';
  const isMac = platform === 'darwin';
  const [common, windows, mac] = await Promise.all([
    collectCommon({ skipDiskLayout: isWin, skipFs: isWin }).catch(() => emptyCommon(platform)),
    isWin ? collectWindows().catch(() => null) : Promise.resolve(null),
    isMac ? collectMac().catch(() => null) : Promise.resolve(null),
  ]);
  return { common, windows, mac };
}

export async function collectReport(appVersion: string, now: () => Date = () => new Date()): Promise<DeviceReport> {
  const started = Date.now();
  let raw: RawCollection;
  try {
    raw = await collectRaw();
  } catch {
    raw = { common: emptyCommon(process.platform), windows: null, mac: null };
  }
  return buildReport(raw, { appVersion, now: now(), durationMs: Date.now() - started });
}

const JUNK = /^(to be filled.*|system product name|system manufacturer|default string|not specified|not available|none|o\.e\.m\.|oem|0+|x+|unknown|-)$/i;

export function clean(v: string | null | undefined): string {
  const s = (v ?? '').replace(/\s+/g, ' ').trim();
  return JUNK.test(s) ? '' : s;
}

function deviceType(common: RawCommon, mac: RawMac | null, model: string): DeviceType {
  if (/macbook/i.test(model)) return 'laptop';
  if (/imac|mac mini|mac pro|mac studio/i.test(model)) return 'desktop';
  if (common.battery?.hasBattery || mac?.power) return 'laptop';
  const c = common.chassisType ?? '';
  if (/notebook|laptop|portable|convertible|detachable|tablet|hand ?held/i.test(c)) return 'laptop';
  if (/desktop|tower|mini|all in one|space-saving|lunch box|pizza|stick/i.test(c)) return 'desktop';
  return 'unknown';
}

function osDetails(raw: RawCollection): DeviceReport['os'] {
  const { common, windows } = raw;
  const platform = common.platform;
  const arch = common.arch === 'arm64' ? 'arm64' : common.arch === 'x64' ? 'x64' : common.arch;
  if (platform === 'win32') {
    const info = windows?.info;
    const build = clean(info?.currentBuild) || clean(common.os?.build);
    let name = (clean(info?.caption) || clean(common.os?.distro) || clean(info?.productName) || 'Windows').replace(/^Microsoft\s+/i, '');
    if (Number(build) >= 22000) name = name.replace(/Windows 10/i, 'Windows 11');
    return { platform, name, version: clean(info?.displayVersion), build: build ? (info?.ubr ? `${build}.${info.ubr}` : build) : '', arch };
  }
  if (platform === 'darwin') {
    const codename = clean(common.os?.codename);
    return { platform, name: codename ? `macOS ${codename}` : 'macOS', version: clean(common.os?.release), build: clean(common.os?.build), arch };
  }
  return { platform, name: clean(common.os?.distro) || platform, version: clean(common.os?.release), build: clean(common.os?.build), arch };
}

export function buildReport(raw: RawCollection, opts: { appVersion: string; now: Date; durationMs: number }): DeviceReport {
  const { common, windows, mac } = raw;
  const platform = common.platform;

  // Device identity
  let manufacturer = clean(common.system?.manufacturer);
  if (/^apple/i.test(manufacturer)) manufacturer = 'Apple';
  let model = clean(common.system?.model);
  // Lenovo puts the machine type in "model" and the friendly name in "version".
  const version = clean(common.system?.version);
  if (/lenovo/i.test(manufacturer) && version && /[a-z]{3,}/i.test(version)) model = version;
  if (/^lenovo$/i.test(manufacturer)) manufacturer = 'Lenovo';
  if (mac?.hardware?.machineName) {
    const id = clean(mac.hardware.machineModel);
    model = id ? `${mac.hardware.machineName} (${id})` : mac.hardware.machineName;
  }
  const serial = clean(common.system?.serial) || clean(mac?.hardware?.serial);
  const name = (common.hostname || '').replace(/\.local$/i, '');

  // Hardware
  const cpuBrand = clean(mac?.hardware?.chip) || clean(common.cpu?.brand);
  const totalGbRaw = common.mem && common.mem.total > 0 ? common.mem.total / 1024 ** 3 : null;
  const totalGb = totalGbRaw == null ? null : totalGbRaw >= 2 ? Math.round(totalGbRaw) : Math.round(totalGbRaw * 10) / 10;
  const usedPct = common.mem && common.mem.total > 0 ? Math.round(((common.mem.total - common.mem.available) / common.mem.total) * 100) : null;

  const disks = platform === 'win32' ? ev.windowsDisks(windows?.info ?? null) : platform === 'darwin' ? ev.macDisks(common, mac) : ev.genericDisks(common);
  const battery: BatteryInfo | null = ev.batteryFromRaw(common, mac);
  const uptimeHours = common.uptimeSec != null ? Math.round((common.uptimeSec / 3600) * 10) / 10 : null;

  const checks = buildChecks({ platform, windows, mac, volumes: disks.volumes, physical: disks.physical, battery, uptimeHours, totalGb, now: opts.now });

  return {
    collectedAt: opts.now.toISOString(),
    durationMs: opts.durationMs,
    appVersion: opts.appVersion,
    device: { manufacturer, model, serial, type: deviceType(common, mac, model), name },
    os: osDetails(raw),
    cpu: {
      brand: cpuBrand,
      cores: common.cpu?.physicalCores || null,
      threads: common.cpu?.cores || null,
      speedGhz: common.cpu?.speed || null,
    },
    memory: { totalGb, usedPct },
    gpus: (common.gpus ?? []).map(clean).filter(Boolean),
    disks: disks.volumes,
    physicalDisks: disks.physical,
    battery,
    uptimeHours,
    checks,
  };
}

function buildChecks(o: {
  platform: string;
  windows: RawWindows | null;
  mac: RawMac | null;
  volumes: DeviceReport['disks'];
  physical: DeviceReport['physicalDisks'];
  battery: BatteryInfo | null;
  uptimeHours: number | null;
  totalGb: number | null;
  now: Date;
}): CheckResult[] {
  const out: (CheckResult | null)[] = [];
  if (o.platform === 'win32') {
    const w = o.windows;
    out.push(ev.evalWindowsUpdate(w?.updates ?? null, o.now));
    out.push(ev.evalPendingRestart(w?.updates ?? null));
    out.push(ev.evalWindowsAntivirus(w?.security ?? null));
    out.push(ev.evalWindowsFirewall(w?.security ?? null));
  } else if (o.platform === 'darwin') {
    const m = o.mac;
    out.push(ev.evalMacUpdates(m?.softwareUpdate ?? null));
    out.push(ev.evalMacProtection(m?.gatekeeper ?? null, m?.xprotectVersion ?? null));
    out.push(ev.evalFileVault(m?.fileVault ?? null));
    out.push(ev.evalMacFirewall(m?.firewall ?? null));
  } else {
    out.push({ id: 'updates', title: 'System updates', category: 'updates', status: 'unknown', detail: 'PCW Care checks updates on Windows and macOS only.', fixes: [] });
    out.push({ id: 'antivirus', title: 'Virus protection', category: 'security', status: 'unknown', detail: 'PCW Care checks security on Windows and macOS only.', fixes: [] });
  }
  if (o.volumes.length) {
    for (const v of o.volumes) out.push(ev.evalDiskSpace(v));
  } else {
    out.push({ id: 'disk-space', title: 'Free disk space', category: 'storage', status: 'unknown', detail: "We couldn't read your disk space.", fixes: ['open:storage'] });
  }
  out.push(ev.evalDiskHealth(o.physical));
  if (o.platform === 'win32') out.push(ev.evalTempFiles(o.windows?.temp ?? null));
  out.push(ev.evalBattery(o.battery));
  out.push(ev.evalMemory(o.totalGb));
  out.push(ev.evalUptime(o.uptimeHours, o.platform));
  if (o.platform === 'win32') out.push(ev.evalStartupApps(o.windows?.startupCount ?? null));
  return out.filter((c): c is CheckResult => c != null);
}

function emptyCommon(platform: string): RawCommon {
  return {
    platform,
    arch: process.arch,
    hostname: '',
    system: null,
    chassisType: null,
    os: null,
    cpu: null,
    mem: null,
    gpus: null,
    fs: null,
    diskLayout: null,
    battery: null,
    uptimeSec: null,
  };
}
