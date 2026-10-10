import { describe, expect, it } from 'vitest';
import { buildReport, clean } from '../src/main/collect';
import type { RawCollection, RawCommon } from '../src/main/collect/raw';
import { MAX_SNAPSHOT_BYTES, shapeSnapshot, snapshotBody } from '../src/main/snapshot';
import { deviceSummaryText } from '../src/shared/summary';

const NOW = new Date('2026-10-10T12:00:00Z');

function common(over: Partial<RawCommon> = {}): RawCommon {
  return {
    platform: 'win32',
    arch: 'x64',
    hostname: 'JANE-LAPTOP',
    system: { manufacturer: 'LENOVO', model: '21AH00FGUK', version: 'ThinkPad T14 Gen 3', serial: 'PF3W8K2L' },
    chassisType: 'Notebook',
    os: { distro: 'Microsoft Windows 10 Home', release: '10.0.26100', build: '26100', codename: '', arch: 'x64' },
    cpu: { brand: 'Intel Core™ i5-1245U', manufacturer: 'Intel', physicalCores: 10, cores: 12, speed: 1.6 },
    mem: { total: 16 * 1024 ** 3 - 300 * 1024 ** 2, available: 7 * 1024 ** 3 },
    gpus: ['Intel Iris Xe Graphics'],
    fs: null,
    diskLayout: null,
    battery: { hasBattery: true, cycleCount: 412, isCharging: false, designedCapacity: 52500, maxCapacity: 39900, percent: 64, capacityUnit: 'mWh' },
    uptimeSec: 9 * 86400,
    ...over,
  };
}

const winRaw: RawCollection = {
  common: common(),
  windows: {
    info: {
      caption: 'Microsoft Windows 11 Home',
      displayVersion: '24H2',
      currentBuild: '26100',
      ubr: '2314',
      drives: [{ id: 'C:', size: 511_101_108_224, free: 41_000_000_000, label: 'Windows' }],
      physical: [{ number: '0', name: 'SAMSUNG MZVL2512', mediaType: 'SSD', busType: 'NVMe', health: 'Healthy', size: 512_110_190_592 }],
      partitions: [{ letter: 'C', disk: '0' }],
    },
    security: {
      av: [{ name: 'Windows Defender', state: 397568 }],
      firewall: [
        { name: 'Domain', enabled: 'True' },
        { name: 'Private', enabled: 'True' },
        { name: 'Public', enabled: 'True' },
      ],
    },
    updates: { lastHistoryDate: '2026-10-04T03:00:00Z', lastHotfixDate: '2026-09-10T00:00:00Z', rebootPending: false },
    startupCount: 9,
    temp: { dir: 'C:\\Users\\jane\\AppData\\Local\\Temp', totalBytes: 4.2 * 1024 ** 3, clearableBytes: 3.8 * 1024 ** 3, files: 1200, truncated: false },
  },
  mac: null,
};

describe('buildReport (Windows)', () => {
  const r = buildReport(winRaw, { appVersion: '0.1.0', now: NOW, durationMs: 1234 });

  it('identifies the device in plain terms', () => {
    expect(r.device).toEqual({ manufacturer: 'Lenovo', model: 'ThinkPad T14 Gen 3', serial: 'PF3W8K2L', type: 'laptop', name: 'JANE-LAPTOP' });
    expect(r.os).toEqual({ platform: 'win32', name: 'Windows 11 Home', version: '24H2', build: '26100.2314', arch: 'x64' });
    expect(r.memory.totalGb).toBe(16);
    expect(r.cpu).toMatchObject({ cores: 10, threads: 12 });
    expect(r.disks[0]).toMatchObject({ name: 'C:', type: 'NVMe', sizeGb: 476, health: 'ok' });
    expect(r.battery).toMatchObject({ healthPct: 76, cycles: 412 });
  });

  it('runs the Windows checks in order', () => {
    expect(r.checks.map((c) => c.id)).toEqual([
      'updates',
      'pending-restart',
      'antivirus',
      'firewall',
      'disk-space:C:',
      'disk-health',
      'temp-files',
      'battery',
      'memory',
      'uptime',
      'startup-apps',
    ]);
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
    expect(by).toMatchObject({ updates: 'ok', antivirus: 'ok', 'disk-space:C:': 'warn', battery: 'warn', uptime: 'warn', 'temp-files': 'warn' });
  });

  it('fixes Windows 11 being called Windows 10', () => {
    const r2 = buildReport({ ...winRaw, windows: { ...winRaw.windows!, info: { ...winRaw.windows!.info, caption: undefined } } }, { appVersion: '0.1.0', now: NOW, durationMs: 1 });
    expect(r2.os.name).toBe('Windows 11 Home');
  });

  it('degrades to unknown when every Windows probe failed', () => {
    const r3 = buildReport(
      { common: common({ system: null, battery: null, chassisType: null, mem: null, uptimeSec: null }), windows: { info: null, security: null, updates: null, startupCount: null, temp: null }, mac: null },
      { appVersion: '0.1.0', now: NOW, durationMs: 1 },
    );
    const by = Object.fromEntries(r3.checks.map((c) => [c.id, c.status]));
    expect(by).toEqual({ updates: 'unknown', antivirus: 'unknown', firewall: 'unknown', 'disk-space': 'unknown', 'disk-health': 'unknown', memory: 'unknown', uptime: 'unknown' });
  });
});

describe('buildReport (macOS and others)', () => {
  it('builds a Mac report', () => {
    const r = buildReport(
      {
        common: common({
          platform: 'darwin',
          arch: 'arm64',
          hostname: 'Janes-MacBook-Air.local',
          system: { manufacturer: 'Apple Inc.', model: 'Mac15,12', version: '', serial: 'C02FK1ZJQ6L4' },
          os: { distro: 'macOS', release: '15.6', build: '24G84', codename: 'Sequoia', arch: 'arm64' },
          fs: [
            { fs: '/dev/disk3s1s1', mount: '/', type: 'APFS', size: 494_384_795_648, available: 301_200_000_000 },
            { fs: '/dev/disk3s5', mount: '/System/Volumes/Data', type: 'APFS', size: 494_384_795_648, available: 301_200_000_000 },
          ],
          diskLayout: [{ name: 'APPLE SSD AP0512Z', type: 'SSD', interfaceType: 'PCIe', size: 500_277_790_720, smartStatus: 'Ok' }],
          battery: { hasBattery: true, cycleCount: 88, isCharging: true, designedCapacity: 0, maxCapacity: 0, percent: 81, capacityUnit: 'mWh' },
        }),
        windows: null,
        mac: {
          hardware: { machineName: 'MacBook Air', machineModel: 'Mac15,12', chip: 'Apple M3', serial: 'C02FK1ZJQ6L4' },
          softwareUpdate: { updates: [], cached: false },
          gatekeeper: true,
          xprotectVersion: '5317',
          fileVault: 'on',
          firewall: false,
          smart: 'Verified',
          volumeName: 'Macintosh HD',
          power: { cycles: 88, condition: 'Normal', maxCapacityPct: 97, percent: 81, charging: true },
        },
      },
      { appVersion: '0.1.0', now: NOW, durationMs: 1 },
    );
    expect(r.device).toMatchObject({ manufacturer: 'Apple', model: 'MacBook Air (Mac15,12)', type: 'laptop', name: 'Janes-MacBook-Air' });
    expect(r.os).toMatchObject({ name: 'macOS Sequoia', version: '15.6', arch: 'arm64' });
    expect(r.cpu.brand).toBe('Apple M3');
    expect(r.disks).toEqual([{ name: 'Macintosh HD', type: 'NVMe', sizeGb: 494.4, freeGb: 301.2, health: 'ok' }]);
    expect(r.checks.map((c) => c.id)).toEqual(['updates', 'antivirus', 'encryption', 'firewall', 'disk-space:Macintosh HD', 'disk-health', 'battery', 'memory', 'uptime']);
  });

  it('cleans placeholder OEM strings', () => {
    expect(clean('To be filled by O.E.M.')).toBe('');
    expect(clean('System Product Name')).toBe('');
    expect(clean('  OptiPlex   7010 ')).toBe('OptiPlex 7010');
  });
});

describe('shapeSnapshot', () => {
  const report = buildReport(winRaw, { appVersion: '0.1.0', now: NOW, durationMs: 1234 });

  it('matches the contract exactly', () => {
    const s = shapeSnapshot(report);
    expect(Object.keys(s)).toEqual(['schema', 'collectedAt', 'app', 'device', 'os', 'cpu', 'memory', 'disks', 'battery', 'uptimeHours', 'checks']);
    expect(s.schema).toBe(1);
    expect(s.app).toEqual({ version: '0.1.0' });
    expect(Object.keys(s.cpu)).toEqual(['brand', 'cores', 'threads']);
    expect(Object.keys(s.memory)).toEqual(['totalGb']);
    expect(Object.keys(s.disks[0])).toEqual(['name', 'type', 'sizeGb', 'freeGb', 'health']);
    expect(Object.keys(s.battery!)).toEqual(['healthPct', 'cycles', 'charging', 'percent']);
    expect(Object.keys(s.checks[0])).toEqual(['id', 'title', 'status', 'detail']);
    expect(s.uptimeHours).toBe(216);
  });

  it('caps strings, strips control characters and bounds lists', () => {
    const huge = {
      ...report,
      device: { ...report.device, model: 'x'.repeat(10_000) + '\u0007' },
      disks: Array.from({ length: 100 }, (_, i) => ({ name: `D${i}`, type: 'SSD' as const, sizeGb: 1, freeGb: 1, health: 'ok' as const })),
      checks: Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, title: 't'.repeat(500), status: 'weird' as never, detail: 'd\n\r'.repeat(5000), category: 'memory' as const, fixes: [] })),
    };
    const s = shapeSnapshot(huge);
    expect(s.device.model.length).toBe(200);
    expect(s.disks).toHaveLength(16);
    expect(s.checks).toHaveLength(40);
    expect(s.checks[0].status).toBe('unknown');
    expect(s.checks[0].detail).not.toMatch(/[\n\r]/);
    expect(Buffer.byteLength(snapshotBody(huge))).toBeLessThan(MAX_SNAPSHOT_BYTES);
  });

  it('device summary text for tickets lists what needs attention', () => {
    const t = deviceSummaryText(report);
    expect(t).toContain('Serial: PF3W8K2L');
    expect(t).toContain('Windows 11 Home 24H2');
    expect(t).toContain('[warn] Free space on C:');
  });
});
