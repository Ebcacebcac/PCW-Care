/* Cross-platform hardware facts via systeminformation. Each call has its own
   timeout and failure is recorded as null. */

import os from 'node:os';
import * as si from 'systeminformation';
import type { RawCommon } from './raw';
import { withTimeout } from './exec';

const T = 25_000;

async function safe<T>(fn: () => Promise<T>, ms = T): Promise<T | null> {
  try {
    return await withTimeout(fn(), ms);
  } catch {
    return null;
  }
}

export async function collectCommon(opts: { skipDiskLayout?: boolean; skipFs?: boolean } = {}): Promise<RawCommon> {
  const [system, chassis, osInfo, cpu, mem, graphics, fs, layout, battery] = await Promise.all([
    safe(() => si.system()),
    safe(() => si.chassis()),
    safe(() => si.osInfo()),
    safe(() => si.cpu()),
    safe(() => si.mem()),
    safe(() => si.graphics()),
    opts.skipFs ? Promise.resolve(null) : safe(() => si.fsSize()),
    opts.skipDiskLayout ? Promise.resolve(null) : safe(() => si.diskLayout()),
    safe(() => si.battery()),
  ]);

  let uptimeSec: number | null;
  try {
    uptimeSec = os.uptime();
  } catch {
    uptimeSec = null;
  }

  return {
    platform: process.platform,
    arch: process.arch,
    hostname: safeHostname(),
    system: system
      ? { manufacturer: str(system.manufacturer), model: str(system.model), version: str(system.version), serial: str(system.serial) }
      : null,
    chassisType: chassis ? str(chassis.type) : null,
    os: osInfo
      ? { distro: str(osInfo.distro), release: str(osInfo.release), build: str(osInfo.build), codename: str(osInfo.codename), arch: str(osInfo.arch) }
      : null,
    cpu: cpu
      ? {
          brand: [str(cpu.manufacturer), str(cpu.brand)].filter(Boolean).join(' '),
          manufacturer: str(cpu.manufacturer),
          physicalCores: num(cpu.physicalCores),
          cores: num(cpu.cores),
          speed: num(cpu.speed),
        }
      : null,
    mem: mem ? { total: num(mem.total), available: num(mem.available) } : null,
    gpus: graphics ? graphics.controllers.map((c) => [str(c.vendor), str(c.model)].filter(Boolean).join(' ').trim()).filter(Boolean) : null,
    fs: fs ? fs.map((f) => ({ fs: str(f.fs), mount: str(f.mount), type: str(f.type), size: num(f.size), available: num(f.available) })) : null,
    diskLayout: layout
      ? layout.map((d) => ({ name: str(d.name), type: str(d.type), interfaceType: str(d.interfaceType), size: num(d.size), smartStatus: str(d.smartStatus) }))
      : null,
    battery: battery
      ? {
          hasBattery: Boolean(battery.hasBattery),
          cycleCount: num(battery.cycleCount),
          isCharging: Boolean(battery.isCharging),
          designedCapacity: num(battery.designedCapacity),
          maxCapacity: num(battery.maxCapacity),
          percent: num(battery.percent),
          capacityUnit: str(battery.capacityUnit),
        }
      : null,
    uptimeSec,
  };
}

function safeHostname(): string {
  try {
    return os.hostname();
  } catch {
    return '';
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
