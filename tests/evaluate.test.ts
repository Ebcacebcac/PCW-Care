import { describe, expect, it } from 'vitest';
import * as ev from '../src/main/checks/evaluate';
import type { RawCommon } from '../src/main/collect/raw';

const NOW = new Date('2026-10-10T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe('Windows Update', () => {
  it('is ok within a month, warn after, bad after ~2.5 months', () => {
    expect(ev.evalWindowsUpdate({ lastHistoryDate: daysAgo(3) }, NOW)).toMatchObject({ status: 'ok', detail: 'Last update installed 3 days ago.' });
    expect(ev.evalWindowsUpdate({ lastHistoryDate: daysAgo(50) }, NOW).status).toBe('warn');
    expect(ev.evalWindowsUpdate({ lastHotfixDate: daysAgo(120) }, NOW)).toMatchObject({ status: 'bad', askUs: true });
  });
  it('takes the newer of history and Get-HotFix', () => {
    expect(ev.evalWindowsUpdate({ lastHistoryDate: daysAgo(90), lastHotfixDate: daysAgo(2) }, NOW).status).toBe('ok');
  });
  it('is unknown with no usable dates, and offers Windows Update', () => {
    const r = ev.evalWindowsUpdate({ lastHistoryDate: 'garbage', lastHotfixDate: null }, NOW);
    expect(r.status).toBe('unknown');
    expect(r.fixes).toEqual(['open:updates']);
    expect(ev.evalWindowsUpdate(null, NOW).status).toBe('unknown');
  });
});

describe('pending restart', () => {
  it('warns with a restart fix, ok otherwise, hidden when unknown', () => {
    expect(ev.evalPendingRestart({ rebootPending: true })).toMatchObject({ status: 'warn', fixes: ['restart'] });
    expect(ev.evalPendingRestart({ rebootPending: false })?.status).toBe('ok');
    expect(ev.evalPendingRestart({})).toBeNull();
  });
});

describe('Security Center product state', () => {
  it('decodes enabled / up to date', () => {
    expect(ev.decodeProductState(397568)).toEqual({ enabled: true, upToDate: true }); // 0x061100 Defender on
    expect(ev.decodeProductState(393472)).toEqual({ enabled: false, upToDate: true }); // 0x060100 off
    expect(ev.decodeProductState(397584)).toEqual({ enabled: true, upToDate: false }); // 0x061110 out of date
    expect(ev.decodeProductState(266240)).toEqual({ enabled: true, upToDate: true }); // 0x041000 third-party on
  });

  it('antivirus: ok / warn / bad / Defender fallback / unknown', () => {
    expect(ev.evalWindowsAntivirus({ av: [{ name: 'Windows Defender', state: 397568 }] })).toMatchObject({ status: 'ok', detail: 'Protected by Windows Defender.' });
    expect(ev.evalWindowsAntivirus({ av: [{ name: 'Norton', state: 397584 }] }).status).toBe('warn');
    expect(ev.evalWindowsAntivirus({ av: [{ name: 'Windows Defender', state: 393472 }] })).toMatchObject({ status: 'bad', askUs: true });
    expect(
      ev.evalWindowsAntivirus({ av: [{ name: 'Windows Defender', state: 393472 }, { name: 'Bitdefender', state: 266240 }] }).detail,
    ).toBe('Protected by Bitdefender.');
    expect(ev.evalWindowsAntivirus({ av: null, defender: { amServiceEnabled: true, antivirusEnabled: true, realTime: true, sigAgeDays: 1, mode: 'Normal' } }).status).toBe('ok');
    expect(ev.evalWindowsAntivirus({ av: null, defender: { amServiceEnabled: true, antivirusEnabled: true, realTime: false, sigAgeDays: 1, mode: 'Normal' } }).status).toBe('bad');
    expect(ev.evalWindowsAntivirus(null).status).toBe('unknown');
  });

  it('firewall: all on / some off / all off / third party', () => {
    const on = [{ name: 'Domain', enabled: 'True' }, { name: 'Private', enabled: 'True' }, { name: 'Public', enabled: 'True' }];
    expect(ev.evalWindowsFirewall({ firewall: on }).status).toBe('ok');
    expect(ev.evalWindowsFirewall({ firewall: [...on.slice(0, 2), { name: 'Public', enabled: 'False' }] })).toMatchObject({
      status: 'warn',
      detail: 'Windows Firewall is off for Public networks.',
    });
    expect(ev.evalWindowsFirewall({ firewall: on.map((p) => ({ ...p, enabled: 'False' })) }).status).toBe('bad');
    expect(ev.evalWindowsFirewall({ firewall: on.map((p) => ({ ...p, enabled: 'False' })), fwProducts: [{ name: 'ESET Firewall', state: 266240 }] }).status).toBe('ok');
    expect(ev.evalWindowsFirewall({ firewall: null }).status).toBe('unknown');
  });
});

describe('macOS checks', () => {
  it('updates', () => {
    expect(ev.evalMacUpdates({ updates: [], cached: false }).status).toBe('ok');
    const r = ev.evalMacUpdates({ updates: [{ label: 'x', title: 'macOS Sequoia 15.7', recommended: true, restart: true }], cached: false });
    expect(r.status).toBe('warn');
    expect(r.detail).toContain('macOS Sequoia 15.7');
    expect(r.detail).toContain('restart');
    expect(ev.evalMacUpdates(null).status).toBe('unknown');
  });
  it('Gatekeeper, FileVault, firewall', () => {
    expect(ev.evalMacProtection(true, '5317').detail).toContain('5317');
    expect(ev.evalMacProtection(false, null).status).toBe('bad');
    expect(ev.evalMacProtection(null, null).status).toBe('unknown');
    expect(ev.evalFileVault('on').status).toBe('ok');
    expect(ev.evalFileVault('encrypting').status).toBe('ok');
    expect(ev.evalFileVault('off').status).toBe('warn');
    expect(ev.evalFileVault(null).status).toBe('unknown');
    expect(ev.evalMacFirewall(true).status).toBe('ok');
    expect(ev.evalMacFirewall(false).status).toBe('warn');
    expect(ev.evalMacFirewall(null).status).toBe('unknown');
  });
});

describe('storage', () => {
  const vol = (sizeGb: number, freeGb: number) => ({ name: 'C:', type: 'SSD' as const, sizeGb, freeGb, health: 'ok' as const });
  it('free space thresholds', () => {
    expect(ev.evalDiskSpace(vol(476, 120))).toMatchObject({ id: 'disk-space:C:', status: 'ok', detail: '120 GB free of 476 GB (25%).' });
    expect(ev.evalDiskSpace(vol(476, 40)).status).toBe('warn'); // 8%
    expect(ev.evalDiskSpace(vol(119, 15)).status).toBe('warn'); // < 20 GB
    expect(ev.evalDiskSpace(vol(476, 7)).status).toBe('bad');
    expect(ev.evalDiskSpace(vol(2000, 90)).status).toBe('bad'); // 4.5%
    expect(ev.evalDiskSpace(vol(0, 0)).status).toBe('unknown');
  });

  it('maps Windows drives to physical disks', () => {
    const { volumes, physical } = ev.windowsDisks({
      drives: [
        { id: 'C:', size: 511_101_108_224, free: 128_849_018_880, label: 'Windows' },
        { id: 'D:', size: 1_000_202_039_296, free: 500_000_000_000, label: 'Data' },
      ],
      physical: [
        { number: '0', name: 'Samsung SSD 980', mediaType: 'SSD', busType: 'NVMe', health: 'Healthy', size: 512_110_190_592 },
        { number: '1', name: 'WDC WD10EZEX', mediaType: 'HDD', busType: 'SATA', health: 'Warning', size: 1_000_204_886_016 },
      ],
      partitions: [
        { letter: 'C', disk: '0' },
        { letter: 'D', disk: '1' },
      ],
    });
    expect(volumes[0]).toMatchObject({ name: 'C:', type: 'NVMe', health: 'ok', sizeGb: 476, freeGb: 120 });
    expect(volumes[1]).toMatchObject({ name: 'D:', type: 'HDD', health: 'warn' });
    expect(physical.map((p) => p.health)).toEqual(['ok', 'warn']);
    expect(ev.evalDiskHealth(physical)).toMatchObject({ status: 'warn', askUs: true });
  });

  it('uses the only internal disk when partitions are unreadable', () => {
    const { volumes } = ev.windowsDisks({
      drives: [{ id: 'C:', size: 256e9, free: 100e9, label: '' }],
      physical: [{ number: '0', name: 'SSD', mediaType: 'SSD', busType: 'SATA', health: 'Healthy', size: 256e9 }],
      partitions: null,
    });
    expect(volumes[0]).toMatchObject({ type: 'SSD', health: 'ok' });
  });

  it('disk health', () => {
    expect(ev.evalDiskHealth([]).status).toBe('unknown');
    expect(ev.evalDiskHealth([{ name: 'A', type: 'SSD', sizeGb: 1, health: 'ok' }]).status).toBe('ok');
    expect(ev.evalDiskHealth([{ name: 'A', type: 'SSD', sizeGb: 1, health: 'bad' }])).toMatchObject({ status: 'bad', askUs: true });
    expect(ev.smartHealth('Verified')).toBe('ok');
    expect(ev.smartHealth('Failing')).toBe('bad');
    expect(ev.smartHealth('Not Supported')).toBe('unknown');
  });

  it('temp files', () => {
    expect(ev.evalTempFiles(null)).toBeNull();
    const big = ev.evalTempFiles({ dir: 'x', totalBytes: 5 * 1024 ** 3, clearableBytes: 4 * 1024 ** 3, files: 10, truncated: false });
    expect(big).toMatchObject({ status: 'warn', fixes: ['clean-temp'] });
    expect(ev.evalTempFiles({ dir: 'x', totalBytes: 10e6, clearableBytes: 1e6, files: 3, truncated: false })).toMatchObject({ status: 'ok', fixes: [] });
  });
});

describe('battery', () => {
  const common = (b: Partial<NonNullable<RawCommon['battery']>> | null): RawCommon => ({
    platform: 'win32',
    arch: 'x64',
    hostname: 'pc',
    system: null,
    chassisType: null,
    os: null,
    cpu: null,
    mem: null,
    gpus: null,
    fs: null,
    diskLayout: null,
    uptimeSec: null,
    battery: b ? { hasBattery: true, cycleCount: 0, isCharging: false, designedCapacity: 0, maxCapacity: 0, percent: 50, capacityUnit: 'mWh', ...b } : null,
  });

  it('computes wear from design vs full capacity', () => {
    const b = ev.batteryFromRaw(common({ designedCapacity: 50000, maxCapacity: 43000, cycleCount: 210 }), null)!;
    expect(b).toMatchObject({ healthPct: 86, cycles: 210 });
    expect(ev.evalBattery(b)?.status).toBe('ok');
    expect(ev.evalBattery({ ...b, healthPct: 70 })?.status).toBe('warn');
    expect(ev.evalBattery({ ...b, healthPct: 50 })).toMatchObject({ status: 'bad', askUs: true });
    expect(ev.evalBattery({ ...b, healthPct: null })?.status).toBe('unknown');
  });

  it('prefers macOS figures and flags "Service Recommended"', () => {
    const b = ev.batteryFromRaw(common(null), {
      hardware: null,
      softwareUpdate: null,
      gatekeeper: null,
      xprotectVersion: null,
      fileVault: null,
      firewall: null,
      smart: null,
      volumeName: null,
      power: { cycles: 1012, condition: 'Service Recommended', maxCapacityPct: 71, percent: 40, charging: false },
    })!;
    expect(b).toMatchObject({ healthPct: 71, cycles: 1012 });
    expect(ev.evalBattery(b)?.status).toBe('bad');
  });

  it('no battery → no check', () => {
    expect(ev.batteryFromRaw(common(null), null)).toBeNull();
    expect(ev.evalBattery(null)).toBeNull();
  });
});

describe('performance & memory', () => {
  it('uptime over a week suggests a restart', () => {
    expect(ev.evalUptime(200, 'win32')).toMatchObject({ status: 'warn', fixes: ['restart'] });
    expect(ev.evalUptime(200, 'win32').detail).toContain('Shutting down');
    expect(ev.evalUptime(200, 'darwin').detail).not.toContain('Windows');
    expect(ev.evalUptime(5, 'win32')).toMatchObject({ status: 'ok', detail: 'Restarted 5 hours ago.' });
    expect(ev.evalUptime(0.2, 'win32').detail).toBe('Restarted 1 hour ago.');
    expect(ev.evalUptime(null, 'win32').status).toBe('unknown');
  });
  it('startup apps', () => {
    expect(ev.evalStartupApps(null)).toBeNull();
    expect(ev.evalStartupApps(1)?.detail).toBe('1 app starts when you sign in.');
    expect(ev.evalStartupApps(22)?.status).toBe('warn');
  });
  it('memory', () => {
    expect(ev.evalMemory(16).status).toBe('ok');
    expect(ev.evalMemory(2).status).toBe('warn');
    expect(ev.evalMemory(null).status).toBe('unknown');
  });
  it('overall status', () => {
    const c = (status: 'ok' | 'warn' | 'bad' | 'unknown') => ({ id: status, title: '', status, detail: '', category: 'memory' as const, fixes: [] });
    expect(ev.overallStatus([c('ok'), c('ok')])).toEqual({ status: 'ok', attention: 0, problems: 0 });
    expect(ev.overallStatus([c('ok'), c('warn'), c('bad')])).toEqual({ status: 'bad', attention: 2, problems: 1 });
    expect(ev.overallStatus([c('unknown')]).status).toBe('unknown');
  });
});
