/* The monthly health summary (0.2), worked out from the check history kept
   on this computer (main/history.ts). Pure — used by the renderer. */

import type { HistoryEntry, Status } from './types';
import { worstStatus } from './status';

export interface MonthlyIssue {
  id: string;
  title: string;
  worst: Status;
  /* Status at the latest check (null if the check no longer runs). */
  latest: Status | null;
  /* How many checks it was flagged in. */
  times: number;
}

export interface MonthlySummary {
  from: string;
  to: string;
  checks: number;
  daysChecked: number;
  latest: HistoryEntry | null;
  latestCounts: { ok: number; attention: number; info: number; unknown: number };
  issues: MonthlyIssue[];
  resolved: MonthlyIssue[];
  disk: { name: string; firstFreeGb: number; lastFreeGb: number; sizeGb: number } | null;
}

export const SUMMARY_DAYS = 30;

export function monthlySummary(entries: HistoryEntry[], now: Date, days = SUMMARY_DAYS): MonthlySummary {
  const from = new Date(now.getTime() - days * 86_400_000);
  const inRange = entries
    .filter((e) => {
      const t = Date.parse(e.at);
      return Number.isFinite(t) && t >= from.getTime() && t <= now.getTime() + 60_000;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latest = inRange[inRange.length - 1] ?? null;
  const latestStatus = new Map((latest?.checks ?? []).map((c) => [c.id, c.status]));
  const flagged = new Map<string, { title: string; statuses: Status[] }>();
  for (const e of inRange) {
    for (const c of e.checks) {
      if (c.status !== 'warn' && c.status !== 'bad') continue;
      const f = flagged.get(c.id) ?? { title: c.title, statuses: [] };
      f.title = c.title;
      f.statuses.push(c.status);
      flagged.set(c.id, f);
    }
  }
  const all: MonthlyIssue[] = [...flagged].map(([id, f]) => ({
    id,
    title: f.title,
    worst: worstStatus(f.statuses),
    latest: latestStatus.get(id) ?? null,
    times: f.statuses.length,
  }));
  const open = (i: MonthlyIssue) => i.latest === 'warn' || i.latest === 'bad';
  const rank = (s: Status) => (s === 'bad' ? 0 : 1);
  const issues = all.filter(open).sort((a, b) => rank(a.latest ?? 'warn') - rank(b.latest ?? 'warn') || a.title.localeCompare(b.title));
  const resolved = all.filter((i) => !open(i)).sort((a, b) => a.title.localeCompare(b.title));

  const latestChecks = latest?.checks ?? [];
  const latestCounts = {
    ok: latestChecks.filter((c) => c.status === 'ok').length,
    attention: latestChecks.filter((c) => c.status === 'warn' || c.status === 'bad').length,
    info: latestChecks.filter((c) => c.status === 'info').length,
    unknown: latestChecks.filter((c) => c.status === 'unknown').length,
  };

  const withDisk = inRange.filter((e) => e.mainDisk && e.mainDisk.sizeGb > 0);
  const firstDisk = withDisk[0]?.mainDisk ?? null;
  const lastDisk = withDisk[withDisk.length - 1]?.mainDisk ?? null;
  const disk =
    firstDisk && lastDisk && firstDisk.name === lastDisk.name
      ? { name: lastDisk.name, firstFreeGb: firstDisk.freeGb, lastFreeGb: lastDisk.freeGb, sizeGb: lastDisk.sizeGb }
      : null;

  const dayKeys = new Set(inRange.map((e) => new Date(e.at).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })));
  return {
    from: from.toISOString(),
    to: now.toISOString(),
    checks: inRange.length,
    daysChecked: dayKeys.size,
    latest,
    latestCounts,
    issues,
    resolved,
    disk,
  };
}
