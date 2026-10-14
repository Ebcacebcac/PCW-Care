import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { CareApi, mapHttpError, parseCallStatus } from '../src/main/api';
import { combineNotices, diffSummary, jobMessage, stateFromSummary } from '../src/main/repairWatch';
import { appendEntry, entryFromReport } from '../src/main/history';
import { monthlySummary } from '../src/shared/monthly';
import { overallStatus, worstStatus } from '../src/shared/status';
import { fitJpeg, isJpeg, MAX_SCREENSHOT_BYTES } from '../src/main/screenshotFit';
import { parseTmDestinations, parseTmLatest, parseTmPrefs, tallyCrashFiles } from '../src/main/collect/mac';
import { processNames } from '../src/main/collect/windows';
import { isFixId, settingsUrl } from '../src/main/links';
import type { DeviceReport, HistoryEntry, SummaryResponse } from '../src/shared/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function client(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const api = new CareApi({
    baseUrl: 'https://example.test/api/care',
    appVersion: '0.2.0',
    platform: 'win32',
    arch: 'x64',
    getToken: () => 'tok_abcdefghijklmnopqrstuvwxyz012345',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return respond(url, init);
    },
  });
  return { api, calls };
}

describe('GET /call-status', () => {
  it('parses a verified call', () => {
    const exp = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(parseCallStatus({ calling: true, staffName: 'Ethan', startedAt: 'x', expiresAt: exp })).toEqual({ state: 'calling', staffName: 'Ethan', expiresAt: exp });
  });

  it('anything odd is "not calling" — never a false yes', () => {
    expect(parseCallStatus({ calling: false })).toEqual({ state: 'not_calling' });
    expect(parseCallStatus({ calling: 'true' })).toEqual({ state: 'not_calling' });
    expect(parseCallStatus(null)).toEqual({ state: 'not_calling' });
    expect(parseCallStatus({ calling: true, staffName: 'Ethan', expiresAt: '2020-01-01T00:00:00Z' })).toEqual({ state: 'not_calling' });
    expect(parseCallStatus({ calling: true, staffName: '\u0007' + 'x'.repeat(100) })).toMatchObject({ state: 'calling' });
    expect((parseCallStatus({ calling: true, staffName: 'x'.repeat(100) }) as { staffName: string }).staffName).toHaveLength(40);
  });

  it('a 404 from an older server hides the feature', async () => {
    const { api, calls } = client(() => json(404, { error: 'Not found' }));
    expect(await api.callStatus()).toEqual({ ok: true, data: { state: 'unavailable' } });
    expect(calls[0].url).toBe('https://example.test/api/care/call-status');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  it('other failures stay errors', async () => {
    const { api } = client(() => json(500, { error: 'boom' }));
    const r = await api.callStatus();
    expect(r.ok).toBe(false);
  });
});

describe('tickets with a screenshot', () => {
  it('sends the optional screenshot field', async () => {
    const { api, calls } = client(() => json(201, { ticket: { id: 1, ref: 'T-1' }, attachmentId: 7 }));
    const r = await api.createTicket({ subject: 'Help', message: 'Printer', includeReport: false, screenshot: { mime: 'image/jpeg', data: 'AAAA' } });
    expect(r).toEqual({ ok: true, data: { ticket: { id: 1, ref: 'T-1' }, attachmentId: 7 } });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ subject: 'Help', message: 'Printer', includeReport: false, screenshot: { mime: 'image/jpeg', data: 'AAAA' } });
  });

  it('maps 400 bad_screenshot to a friendly message', () => {
    const e = mapHttpError(400, { code: 'bad_screenshot', error: 'The screenshot must be a PNG or JPEG image.' });
    expect(e.code).toBe('bad_screenshot');
    expect(e.message).toMatch(/couldn't attach that screenshot/);
    expect(mapHttpError(400, { error: 'Subject too short' }).code).toBe('invalid');
  });

  it('fits a JPEG under 2 MB by lowering quality, then size', () => {
    const sizes: [number | null, number][] = [];
    const r = fitJpeg(3840, (w, q) => {
      sizes.push([w, q]);
      const bytes = (w ?? 3840) * q * 12; // pretend size
      return Buffer.alloc(bytes, 0xff);
    });
    expect(r).not.toBeNull();
    expect(r!.jpeg.length).toBeLessThanOrEqual(MAX_SCREENSHOT_BYTES);
    expect(sizes[0]).toEqual([null, 82]);
    expect(fitJpeg(1000, () => Buffer.alloc(MAX_SCREENSHOT_BYTES + 1))).toBeNull();
    expect(isJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpeg(Buffer.from('PNG!'))).toBe(false);
  });
});

describe('repair tracker notifications', () => {
  const base: SummaryResponse = {
    jobs: [{ id: 1, ref: 'PCW-1', title: 'Lenovo laptop — new battery', status: 'awaiting_parts', updatedAt: '2026-10-10T10:00:00Z' }],
    invoices: [{ id: 5, number: 'INV-5', total: 45, balance: 0, status: 'paid', dueDate: null }],
    tickets: [{ id: 9, ref: 'T-9', subject: 'Printer', status: 'open', updatedAt: '2026-10-10T10:00:00Z' }],
    remoteRequest: null,
  };

  it('the first poll only stores state (no flood)', () => {
    expect(diffSummary(null, base, 12)).toEqual([]);
  });

  it('a different linked device starts fresh', () => {
    expect(diffSummary(stateFromSummary(base, 11), { ...base, jobs: [{ ...base.jobs[0], status: 'ready_for_collection' }] }, 12)).toEqual([]);
  });

  it('nothing changed → nothing shown', () => {
    expect(diffSummary(stateFromSummary(base, 12), base, 12)).toEqual([]);
  });

  it('job ready to collect', () => {
    const n = diffSummary(stateFromSummary(base, 12), { ...base, jobs: [{ ...base.jobs[0], status: 'ready_for_collection' }] }, 12);
    expect(n).toEqual([{ title: 'Your repair is ready to collect', body: expect.stringContaining('Lenovo laptop'), page: 'account' }]);
  });

  it('new job, new unpaid invoice, staff reply, resolved ticket', () => {
    const next: SummaryResponse = {
      jobs: [...base.jobs, { id: 2, ref: 'PCW-2', title: 'iMac', status: 'booked', updatedAt: null }],
      invoices: [...base.invoices, { id: 6, number: 'INV-6', total: 89.99, balance: 89.99, status: 'unpaid', dueDate: null }],
      tickets: [
        { ...base.tickets[0], status: 'waiting', updatedAt: '2026-10-11T09:00:00Z' },
        { id: 10, ref: 'T-10', subject: 'New', status: 'open', updatedAt: null },
      ],
      remoteRequest: null,
    };
    const prev = stateFromSummary({ ...base, tickets: [...base.tickets, { id: 11, ref: 'T-11', subject: 'Old', status: 'waiting', updatedAt: '2026-10-01T00:00:00Z' }] }, 12);
    next.tickets.push({ id: 11, ref: 'T-11', subject: 'Old', status: 'resolved', updatedAt: '2026-10-11T00:00:00Z' });
    const n = diffSummary(prev, next, 12);
    expect(n.map((x) => x.title)).toEqual(['We’ve booked in your repair', 'New invoice', 'PC Workshop replied', 'Ticket resolved']);
    expect(n[1].body).toMatch(/INV-6 for £89\.99/);
    const one = combineNotices(n)!;
    expect(one.title).toBe('4 updates from PC Workshop');
    expect(combineNotices([])).toBeNull();
  });

  it('plain-English job statuses', () => {
    expect(jobMessage('Completed', 'PC', 'PCW-1')!.title).toBe('Your repair is finished');
    expect(jobMessage('awaiting_parts', 'PC', 'PCW-1')!.title).toBe('Waiting for parts');
    expect(jobMessage('collected', 'PC', 'PCW-1')).toBeNull();
    expect(jobMessage('cancelled', 'PC', 'PCW-1')).toBeNull();
    expect(jobMessage('on_bench', 'PC', 'PCW-1')!.body).toBe('PC is now: on bench.');
  });
});

describe('check history and the monthly summary', () => {
  const NOW = new Date('2026-10-14T12:00:00Z');
  const entry = (daysAgo: number, statuses: Record<string, 'ok' | 'warn' | 'bad' | 'info'>, free = 100): HistoryEntry => ({
    at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    checks: Object.entries(statuses).map(([id, status]) => ({ id, title: id.toUpperCase(), status })),
    mainDisk: { name: 'C:', freeGb: free, sizeGb: 476 },
  });

  it('keeps one entry an hour and 62 days', () => {
    let list: HistoryEntry[] = [entry(70, { a: 'ok' }), entry(1, { a: 'ok' })];
    list = appendEntry(list, entry(1, { a: 'warn' }), NOW); // same moment → replaces
    expect(list).toHaveLength(1);
    expect(list[0].checks[0].status).toBe('warn');
    list = appendEntry(list, entry(0, { a: 'ok' }), NOW);
    expect(list).toHaveLength(2);
  });

  it('entryFromReport keeps only ids, titles and statuses', () => {
    const r = {
      collectedAt: NOW.toISOString(),
      disks: [{ name: 'D:', type: 'HDD', sizeGb: 900, freeGb: 400, health: 'ok' }, { name: 'C:', type: 'NVMe', sizeGb: 476, freeGb: 40, health: 'ok' }],
      checks: [{ id: 'remote_tools', title: 'Remote access apps', status: 'warn', detail: 'x', category: 'security', fixes: [], localNote: 'Running now: AnyDesk.' }],
    } as unknown as DeviceReport;
    const e = entryFromReport(r);
    expect(e).toEqual({ at: NOW.toISOString(), checks: [{ id: 'remote_tools', title: 'Remote access apps', status: 'warn' }], mainDisk: { name: 'C:', freeGb: 40, sizeGb: 476 } });
    expect(JSON.stringify(e)).not.toMatch(/AnyDesk/);
  });

  it('summarises the last 30 days', () => {
    const s = monthlySummary(
      [
        entry(40, { backup: 'bad' }), // too old
        entry(20, { backup: 'warn', temp: 'warn', updates: 'ok' }, 120),
        entry(10, { backup: 'warn', temp: 'ok', updates: 'bad' }, 110),
        entry(1, { backup: 'warn', temp: 'ok', updates: 'ok', win11: 'info' }, 100),
      ],
      NOW,
    );
    expect(s.checks).toBe(3);
    expect(s.daysChecked).toBe(3);
    expect(s.issues.map((i) => [i.id, i.latest, i.times])).toEqual([['backup', 'warn', 3]]);
    expect(s.resolved.map((i) => [i.id, i.worst])).toEqual([
      ['temp', 'warn'],
      ['updates', 'bad'],
    ]);
    expect(s.latestCounts).toEqual({ ok: 2, attention: 1, info: 1, unknown: 0 });
    expect(s.disk).toEqual({ name: 'C:', firstFreeGb: 120, lastFreeGb: 100, sizeGb: 476 });
    expect(monthlySummary([], NOW).checks).toBe(0);
  });

  it("'info' never counts as attention", () => {
    const checks = [
      { id: 'a', title: 'A', status: 'ok' as const, detail: '', category: 'memory' as const, fixes: [] },
      { id: 'b', title: 'B', status: 'info' as const, detail: '', category: 'updates' as const, fixes: [] },
    ];
    expect(overallStatus(checks)).toEqual({ status: 'ok', attention: 0, problems: 0 });
    expect(worstStatus(['info', 'unknown'])).toBe('info');
    expect(worstStatus(['info', 'ok'])).toBe('ok');
  });
});

describe('macOS 0.2 parsers', () => {
  it('Time Machine destinations', () => {
    expect(parseTmDestinations('No destinations configured.')).toBe(false);
    expect(parseTmDestinations('====================================================\nName          : Backups\nKind          : Local\nID            : 1A2B\n')).toBe(true);
    expect(parseTmDestinations('')).toBeNull();
  });

  it('latest backup path (local time) and prefs', () => {
    const iso = parseTmLatest('/Volumes/Backups/Backups.backupdb/Mac/2026-10-13-101530\n');
    expect(iso).toBe(new Date(2026, 9, 13, 10, 15, 30).toISOString());
    expect(parseTmLatest('Unable to locate machine directory for host.')).toBeNull();
    const p = parseTmPrefs(`{
    AutoBackup = 1;
    Destinations = ( { SnapshotDates = ( "2026-09-01 08:00:00 +0000", "2026-10-12 21:30:00 +0100" ); } );
}`);
    expect(p).toEqual({ autoBackup: true, latest: '2026-10-12T20:30:00.000Z' });
    expect(parseTmPrefs('')).toEqual({ autoBackup: null, latest: null });
  });

  it('counts crash reports from the last 30 days', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    const day = 86_400_000;
    const t = tallyCrashFiles(
      [
        { name: 'Safari-2026-10-10-120000.ips', mtimeMs: now - 4 * day },
        { name: 'Safari-2026-10-11-120000.ips', mtimeMs: now - 3 * day },
        { name: 'Mail-2026-08-01-120000.ips', mtimeMs: now - 70 * day },
        { name: 'panic-full-2026-10-12-120000.panic', mtimeMs: now - 2 * day },
        { name: 'JetsamEvent-2026-10-12-120000.ips', mtimeMs: now - 2 * day },
      ],
      now,
    );
    expect(t).toEqual({ appCrashes: 2, panics: 1, apps: [{ name: 'Safari', count: 2 }] });
  });
});

describe('Windows process list', () => {
  it('copes with ConvertTo-Json flattening', () => {
    expect(processNames(['a', 'b', ''])).toEqual(['a', 'b']);
    expect(processNames('only')).toEqual(['only']);
    expect(processNames(null)).toBeNull();
    expect(processNames(undefined)).toBeNull();
  });
});

describe('new fixes', () => {
  it('are known ids with fixed targets', () => {
    expect(isFixId('open:backup')).toBe(true);
    expect(isFixId('open:apps')).toBe(true);
    expect(isFixId('open:recovery-key')).toBe(true);
    expect(settingsUrl('open:backup', 'win32')).toBe('ms-settings:backup');
    expect(settingsUrl('open:apps', 'win32')).toBe('ms-settings:appsfeatures');
    expect(settingsUrl('open:backup', 'darwin')).toMatch(/Time-Machine/);
    expect(settingsUrl('open:apps', 'darwin')).toBeNull();
  });
});

describe('electron-builder config (signing is env-driven)', () => {
  const require = createRequire(import.meta.url);
  const { buildConfig, windowsSigning, macSigning } = require('../scripts/builder-config.cjs');
  const azure = {
    AZURE_TENANT_ID: 't',
    AZURE_CLIENT_ID: 'c',
    AZURE_CLIENT_SECRET: 's',
    AZURE_SIGN_ENDPOINT: 'https://weu.codesigning.azure.net',
    AZURE_SIGN_ACCOUNT: 'pcw',
    AZURE_SIGN_PROFILE: 'pcw-public',
  };
  const apple = { CSC_LINK: 'base64', APPLE_ID: 'a@b.c', APPLE_APP_SPECIFIC_PASSWORD: 'x', APPLE_TEAM_ID: 'TEAM' };

  it('with no secrets builds unsigned exactly as before', () => {
    const c = buildConfig({});
    expect(c.win).toMatchObject({ signExecutable: false, verifyUpdateCodeSignature: false });
    expect(c.win.azureSignOptions).toBeUndefined();
    expect(c.mac).toMatchObject({ identity: '-', hardenedRuntime: false, notarize: false, gatekeeperAssess: false });
    expect(c.extraMetadata).toBeUndefined();
    expect(c.appId).toBe('uk.co.pcworkshop.care');
    expect(c.publish).toEqual({ provider: 'github', owner: 'Ebcacebcac', repo: 'PCW-Care', releaseType: 'draft' });
    expect(c.win.artifactName).toBe('PCW-Care-Setup-${version}.${ext}');
  });

  it('signs Windows with Azure Artifact Signing only when everything is set', () => {
    expect(windowsSigning({ ...azure, AZURE_SIGN_PROFILE: '' })).toBeNull();
    const c = buildConfig(azure);
    expect(c.win.azureSignOptions).toEqual({
      publisherName: 'PC Workshop Ltd',
      endpoint: 'https://weu.codesigning.azure.net',
      codeSigningAccountName: 'pcw',
      certificateProfileName: 'pcw-public',
    });
    expect(c.win.verifyUpdateCodeSignature).toBe(true);
    expect(c.mac.identity).toBe('-'); // Windows secrets don't sign the Mac
  });

  it('signs and notarises macOS only when everything is set', () => {
    expect(macSigning({ ...apple, APPLE_TEAM_ID: ' ' })).toBe(false);
    const c = buildConfig(apple);
    expect(c.mac).toMatchObject({ hardenedRuntime: true, notarize: true });
    expect(c.mac.identity).toBeUndefined();
    expect(c.extraMetadata).toEqual({ pcwCareSigned: true });
    expect(c.win.signExecutable).toBe(false);
  });
});
