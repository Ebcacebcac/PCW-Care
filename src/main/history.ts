/* Local check history for the monthly health summary (0.2). One entry per
   check, at most one per hour, kept for 62 days in userData. Only check ids,
   titles and statuses plus the main disk's free space — no detail text,
   no app names. Never sent anywhere. */

import path from 'node:path';
import type { DeviceReport, HistoryEntry } from '../shared/types';
import { JsonFile } from './settingsStore';

const KEEP_DAYS = 62;
const MAX_ENTRIES = 400;
const MIN_GAP_MS = 60 * 60 * 1000;

export function entryFromReport(r: DeviceReport): HistoryEntry {
  const main = r.disks.length
    ? ([...r.disks].sort((a, b) => (/^C:?$/i.test(a.name) ? -1 : /^C:?$/i.test(b.name) ? 1 : 0))[0] ?? null)
    : null;
  return {
    at: r.collectedAt,
    checks: r.checks.map((c) => ({ id: c.id, title: c.title, status: c.status })),
    mainDisk: main ? { name: main.name, freeGb: main.freeGb, sizeGb: main.sizeGb } : null,
  };
}

/* Adds an entry (replacing one from the last hour) and drops old ones. */
export function appendEntry(list: HistoryEntry[], entry: HistoryEntry, now: Date): HistoryEntry[] {
  const t = Date.parse(entry.at);
  const cutoff = now.getTime() - KEEP_DAYS * 86_400_000;
  const kept = list.filter((e) => {
    const et = Date.parse(e.at);
    return Number.isFinite(et) && et >= cutoff && !(Number.isFinite(t) && Math.abs(t - et) < MIN_GAP_MS);
  });
  kept.push(entry);
  kept.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return kept.slice(-MAX_ENTRIES);
}

export class HistoryStore {
  private file: JsonFile<{ entries: HistoryEntry[] }>;

  constructor(dir: string) {
    this.file = new JsonFile(path.join(dir, 'history.json'), { entries: [] });
  }

  read(): HistoryEntry[] {
    const e = this.file.read().entries;
    return Array.isArray(e) ? e.filter((x) => x && typeof x.at === 'string' && Array.isArray(x.checks)) : [];
  }

  add(report: DeviceReport, now = new Date()): void {
    this.file.write({ entries: appendEntry(this.read(), entryFromReport(report), now) });
  }

  clear(): void {
    this.file.write({ entries: [] });
  }
}
