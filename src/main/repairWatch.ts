/* Repair tracker notifications (0.2). While linked, the main process polls
   GET /summary (contract v1) every 15 minutes, compares jobs, invoices and
   tickets with the last copy it stored in userData, and shows a native
   notification for each change. The very first poll — or the first after
   signing in to a different account — only stores the state, so nobody
   gets a flood of notifications about old repairs. */

import path from 'node:path';
import type { PageId, SummaryResponse } from '../shared/types';
import { formatMoney } from '../shared/format';
import { JsonFile } from './settingsStore';

export const REPAIR_POLL_MS = 15 * 60 * 1000;

export interface WatchState {
  /* Whose summary this is (device id), so a new link starts fresh. */
  owner: number | null;
  jobs: Record<string, { status: string }>;
  invoices: Record<string, { status: string; balance: number }>;
  tickets: Record<string, { status: string; updatedAt: string | null }>;
}

export interface RepairNotice {
  title: string;
  body: string;
  page: PageId;
}

export function stateFromSummary(s: SummaryResponse, owner: number | null): WatchState {
  const out: WatchState = { owner, jobs: {}, invoices: {}, tickets: {} };
  for (const j of s.jobs) if (j && j.id != null) out.jobs[String(j.id)] = { status: String(j.status ?? '') };
  for (const i of s.invoices) {
    if (i && i.id != null) out.invoices[String(i.id)] = { status: String(i.status ?? ''), balance: Number(i.balance) || 0 };
  }
  for (const t of s.tickets) if (t && t.id != null) out.tickets[String(t.id)] = { status: String(t.status ?? ''), updatedAt: t.updatedAt ?? null };
  return out;
}

function nice(status: string): string {
  const t = status.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return t || 'updated';
}

function clip(s: string, n = 60): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/* Plain-English wording for a job's new status. */
export function jobMessage(status: string, title: string, ref: string): { title: string; body: string } | null {
  const s = status.toLowerCase();
  const what = clip(title) || `Repair ${ref}`;
  if (/cancel/.test(s)) return null;
  if (/collected/.test(s)) return null; // they were there
  if (/ready|collect/.test(s)) return { title: 'Your repair is ready to collect', body: `${what} is ready. Pop in to Gosforth or Benton during opening hours.` };
  if (/complete|done|finished/.test(s)) return { title: 'Your repair is finished', body: `${what} is done.` };
  if (/part/.test(s)) return { title: 'Waiting for parts', body: `We’re waiting for parts for ${what}. We’ll let you know when they arrive.` };
  if (/quote|approv|authori/.test(s)) return { title: 'We need your go-ahead', body: `${what} has a quote waiting for you in your Customer Hub.` };
  return { title: 'Update on your repair', body: `${what} is now: ${nice(status)}.` };
}

export function diffSummary(prev: WatchState | null, next: SummaryResponse, owner: number | null): RepairNotice[] {
  if (!prev || prev.owner !== owner) return [];
  const out: RepairNotice[] = [];

  for (const j of next.jobs) {
    const before = prev.jobs[String(j.id)];
    const status = String(j.status ?? '');
    if (before && before.status === status) continue;
    if (!before) {
      out.push({ title: 'We’ve booked in your repair', body: `${clip(j.title) || 'Your device'} (${j.ref}) is with us.`, page: 'account' });
      continue;
    }
    const m = jobMessage(status, j.title, j.ref);
    if (m) out.push({ ...m, page: 'account' });
  }

  for (const i of next.invoices) {
    const before = prev.invoices[String(i.id)];
    const balance = Number(i.balance) || 0;
    if (!before && balance > 0) {
      out.push({ title: 'New invoice', body: `Invoice ${i.number} for ${formatMoney(balance)} is in your Customer Hub.`, page: 'account' });
    }
  }

  for (const t of next.tickets) {
    const before = prev.tickets[String(t.id)];
    if (!before) continue; // new tickets are usually the customer's own
    const status = String(t.status ?? '').toLowerCase();
    const tNext = Date.parse(t.updatedAt ?? '');
    const tPrev = Date.parse(before.updatedAt ?? '');
    const newer = Number.isFinite(tNext) && (!Number.isFinite(tPrev) || tNext > tPrev);
    if (status === 'waiting' && (newer || before.status !== t.status)) {
      out.push({ title: 'PC Workshop replied', body: `We’ve replied to your ticket ${t.ref}: “${clip(t.subject, 50)}”.`, page: 'account' });
    } else if ((status === 'resolved' || status === 'closed') && before.status.toLowerCase() !== status) {
      out.push({ title: 'Ticket resolved', body: `Your ticket ${t.ref} has been marked as resolved.`, page: 'account' });
    }
  }
  return out.slice(0, 5);
}

/* Several changes at once become a single notification. */
export function combineNotices(n: RepairNotice[]): RepairNotice | null {
  if (!n.length) return null;
  if (n.length === 1) return n[0];
  return { title: `${n.length} updates from PC Workshop`, body: n.map((x) => x.title).join(' · '), page: 'account' };
}

export class RepairWatchStore {
  private file: JsonFile<{ state: WatchState | null }>;

  constructor(dir: string) {
    this.file = new JsonFile(path.join(dir, 'repair-watch.json'), { state: null });
  }

  read(): WatchState | null {
    const s = this.file.read().state;
    return s && typeof s === 'object' && s.jobs && s.invoices && s.tickets ? s : null;
  }

  write(state: WatchState | null): void {
    this.file.write({ state });
  }
}
