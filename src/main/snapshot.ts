/* Shapes a DeviceReport into the health snapshot PC Workshop receives
   (POST /report, API contract v1). Only the fields listed in the contract
   are sent; strings are trimmed and capped and lists are bounded so the
   body always stays well under the server's 64 KB limit. */

import type { DeviceReport, HealthSnapshot, Status, DiskType, DeviceType } from '../shared/types';

export const MAX_SNAPSHOT_BYTES = 64 * 1024;

const STATUSES: Status[] = ['ok', 'warn', 'bad', 'unknown'];
const DISK_TYPES: DiskType[] = ['SSD', 'HDD', 'NVMe', 'unknown'];
const DEVICE_TYPES: DeviceType[] = ['laptop', 'desktop', 'unknown'];

function s(v: unknown, max = 200): string {
  if (typeof v !== 'string') return '';
  // strip control characters, collapse whitespace
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function n(v: unknown, decimals = 1): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

function oneOf<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function shapeSnapshot(r: DeviceReport): HealthSnapshot {
  const platform = r.os.platform === 'win32' || r.os.platform === 'darwin' ? r.os.platform : s(r.os.platform, 20);
  return {
    schema: 1,
    collectedAt: s(r.collectedAt, 40),
    app: { version: s(r.appVersion, 40) },
    device: {
      manufacturer: s(r.device.manufacturer),
      model: s(r.device.model),
      serial: s(r.device.serial, 100),
      type: oneOf(r.device.type, DEVICE_TYPES, 'unknown'),
      name: s(r.device.name, 100),
    },
    os: {
      platform,
      name: s(r.os.name, 100),
      version: s(r.os.version, 40),
      build: s(r.os.build, 40),
      arch: s(r.os.arch, 20),
    },
    cpu: { brand: s(r.cpu.brand), cores: n(r.cpu.cores, 0), threads: n(r.cpu.threads, 0) },
    memory: { totalGb: n(r.memory.totalGb) },
    disks: r.disks.slice(0, 16).map((d) => ({
      name: s(d.name, 60),
      type: oneOf(d.type, DISK_TYPES, 'unknown'),
      sizeGb: n(d.sizeGb) ?? 0,
      freeGb: n(d.freeGb) ?? 0,
      health: oneOf(d.health, STATUSES, 'unknown'),
    })),
    battery: r.battery
      ? {
          healthPct: n(r.battery.healthPct, 0),
          cycles: n(r.battery.cycles, 0),
          charging: typeof r.battery.charging === 'boolean' ? r.battery.charging : null,
          percent: n(r.battery.percent, 0),
        }
      : null,
    uptimeHours: n(r.uptimeHours),
    checks: r.checks.slice(0, 40).map((c) => ({
      id: s(c.id, 60),
      title: s(c.title, 100),
      status: oneOf(c.status, STATUSES, 'unknown'),
      detail: s(c.detail, 300),
    })),
  };
}

export function snapshotBody(r: DeviceReport): string {
  const body = JSON.stringify(shapeSnapshot(r));
  if (Buffer.byteLength(body, 'utf8') > MAX_SNAPSHOT_BYTES) {
    // Can't happen with the caps above, but never send something the server will refuse.
    throw new Error('snapshot too large');
  }
  return body;
}

export { deviceSummaryText } from '../shared/summary';
