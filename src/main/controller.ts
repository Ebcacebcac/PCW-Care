/* The app's brain in the main process: sign-in state, checks, reporting to
   PC Workshop, fixes and IPC. Every network call happens here. */

import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, safeStorage, shell, type IpcMainInvokeEvent } from 'electron';
import type {
  AppEvent,
  AppState,
  CallStatus,
  CheckProgress,
  DeviceReport,
  FixId,
  FixOutcome,
  HistoryEntry,
  MeResponse,
  RemoteInput,
  Result,
  Settings,
  TicketInput,
} from '../shared/types';
import { CareApi, apiBase, apiError } from './api';
import { TokenStore } from './tokenStore';
import { ReportCache, SettingsStore } from './settingsStore';
import { collectReport } from './collect';
import { snapshotBody } from './snapshot';
import { contactUrl, isAllowedExternalUrl, isContactTarget, isFixId, settingsUrl } from './links';
import { restartComputer } from './actions';
import { cleanTemp, scanTemp, userTempDir } from './tempFiles';
import { PcwConnect } from './pcwConnect';
import { formatBytes } from '../shared/format';
import { Updater } from './updater';
import { Screenshots } from './screenshot';
import { HistoryStore } from './history';
import { REPAIR_POLL_MS, RepairWatchStore, combineNotices, diffSummary, stateFromSummary } from './repairWatch';
import { RECOVERY_KEY_URL } from './checks/extra';

const DAY_MS = 24 * 3600 * 1000;

export class Controller {
  readonly settings: SettingsStore;
  private readonly tokens: TokenStore;
  private readonly reports: ReportCache;
  private readonly api: CareApi;
  readonly updater: Updater;
  private readonly pcwConnect = new PcwConnect();
  private readonly screenshots = new Screenshots();
  private readonly history: HistoryStore;
  private readonly repairWatch: RepairWatchStore;
  private repairTimer: NodeJS.Timeout | null = null;
  private lastCallCheck = 0;
  private lastCall: CallStatus | null = null;

  private report: DeviceReport | null;
  private inFlight: Promise<DeviceReport> | null = null;
  private progress: CheckProgress = { running: false, startedAt: null };
  private notice: string | null = null;
  private tokenNotSaved = false;

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly allowedOrigins: string[],
    private readonly showWindow: () => void,
  ) {
    const dir = app.getPath('userData');
    this.settings = new SettingsStore(dir);
    this.tokens = new TokenStore(path.join(dir, 'device-token.bin'), safeStorage);
    this.reports = new ReportCache(dir);
    this.report = this.reports.read();
    this.history = new HistoryStore(dir);
    this.repairWatch = new RepairWatchStore(dir);
    this.api = new CareApi({
      baseUrl: apiBase(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      getToken: () => this.tokens.load(),
    });
    this.updater = new Updater((update) => this.emit({ type: 'update', update }));

    // A stored "linked" mode without a readable token means sign in again.
    const s = this.settings.get();
    if (s.mode === 'linked' && !this.tokens.load()) {
      this.settings.update({ mode: null, account: null });
    }
  }

  /* ── state ── */

  get mode(): AppState['mode'] {
    const m = this.settings.get().mode;
    return m === 'linked' ? 'linked' : m === 'guest' ? 'guest' : 'signin';
  }

  state(): AppState {
    return {
      mode: this.mode,
      account: this.mode === 'linked' ? this.settings.get().account : null,
      appVersion: app.getVersion(),
      platform: process.platform,
      notice: this.notice,
      tokenNotSaved: this.tokenNotSaved,
    };
  }

  emit(e: AppEvent): void {
    const w = this.getWindow();
    if (w && !w.isDestroyed()) w.webContents.send('care:event', e);
  }

  private emitState(): void {
    this.emit({ type: 'state', state: this.state() });
  }

  /* Any authenticated call that comes back "unlinked" lands here. */
  private onUnlinked(): void {
    this.repairWatch.write(null);
    this.tokens.clear();
    this.settings.update({ mode: null, account: null });
    this.notice = 'This computer is no longer linked to your PC Workshop account. Sign in again to reconnect it.';
    this.emitState();
  }

  private async authed<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
    if (this.mode !== 'linked') return { ok: false, error: apiError('not_linked') };
    const r = await fn();
    if (!r.ok && r.error.code === 'unlinked') this.onUnlinked();
    return r;
  }

  /* ── sign in / out ── */

  async link(code: unknown): Promise<Result<AppState>> {
    const clean = typeof code === 'string' ? code.replace(/\s+/g, '').trim() : '';
    if (!clean || clean.length > 64 || !/^[\x21-\x7e]+$/.test(clean)) {
      return { ok: false, error: apiError('bad_code') };
    }
    // Use the latest check for the device details, running one if needed.
    const report = this.report ?? (await withCap(this.inFlight ?? this.runCheck(), 10_000));
    const device = {
      name: (report?.device.name || os.hostname()).slice(0, 200),
      platform: process.platform,
      osVersion: report ? [report.os.name, report.os.version, report.os.build].filter(Boolean).join(' ').slice(0, 200) : os.release(),
      model: (report?.device.model ?? '').slice(0, 200),
      serial: (report?.device.serial ?? '').slice(0, 200),
      appVersion: app.getVersion(),
    };
    const r = await this.api.link(clean, device);
    if (!r.ok) return r;
    if (!TokenStore.isValidToken(r.data.token)) return { ok: false, error: apiError('server') };
    const { persisted } = this.tokens.save(r.data.token);
    this.tokenNotSaved = !persisted;
    this.notice = null;
    const fallback: MeResponse = {
      client: { ...r.data.client, email: null },
      device: { id: r.data.device?.id ?? 0, name: device.name },
      flags: { maintenance: false },
      hubUrl: 'https://customer.pcwhub.co.uk',
    };
    // Start-at-login stays off until the customer answers the one-time
    // question the Home page shows after sign-in (launchAtLogin === null).
    this.settings.update({ mode: 'linked', account: fallback });
    this.repairWatch.write(null);
    const me = await this.api.me();
    if (me.ok) this.settings.update({ account: me.data });
    this.emitState();
    // Send PC Workshop a first health report straight away.
    if (report) void this.sendReport(report);
    else void this.runCheck().catch(() => undefined);
    void this.pollRepairs();
    return { ok: true, data: this.state() };
  }

  useWithoutSigningIn(): AppState {
    this.settings.update({ mode: 'guest', account: null });
    this.notice = null;
    this.emitState();
    return this.state();
  }

  showSignIn(): AppState {
    if (this.mode === 'guest') this.settings.update({ mode: null });
    this.emitState();
    return this.state();
  }

  async unlink(): Promise<Result<AppState>> {
    if (this.mode !== 'linked') return { ok: true, data: this.state() };
    const r = await this.api.unlink();
    if (!r.ok && r.error.code !== 'unlinked' && r.error.code !== 'not_linked') return r;
    this.tokens.clear();
    this.settings.update({ mode: null, account: null, lastReportSentAt: null });
    this.repairWatch.write(null);
    this.notice = 'This computer has been unlinked from your account.';
    this.emitState();
    return { ok: true, data: this.state() };
  }

  async refreshAccount(): Promise<Result<MeResponse>> {
    const r = await this.authed(() => this.api.me());
    if (r.ok) {
      this.settings.update({ account: r.data });
      this.emitState();
    }
    return r;
  }

  /* ── checks & reporting ── */

  getReport(): { report: DeviceReport | null; progress: CheckProgress } {
    return { report: this.report, progress: this.progress };
  }

  runCheck(): Promise<DeviceReport> {
    if (this.inFlight) return this.inFlight;
    this.progress = { running: true, startedAt: new Date().toISOString() };
    this.emit({ type: 'check', progress: this.progress, report: this.report });
    const previous = this.report;
    this.inFlight = collectReport(app.getVersion())
      .then((report) => {
        this.report = report;
        this.reports.write(report);
        this.history.add(report);
        this.notifyIfWorse(previous, report);
        void this.sendReport(report);
        return report;
      })
      .finally(() => {
        this.inFlight = null;
        this.progress = { running: false, startedAt: null };
        this.emit({ type: 'check', progress: this.progress, report: this.report });
      });
    return this.inFlight;
  }

  private async sendReport(report: DeviceReport): Promise<void> {
    if (this.mode !== 'linked') return;
    let body: string;
    try {
      body = snapshotBody(report);
    } catch {
      return;
    }
    const r = await this.authed(() => this.api.report(body));
    if (r.ok) this.settings.update({ lastReportSentAt: new Date().toISOString() });
  }

  /* Called every half hour: re-check and report once a day while linked. */
  async dailyTick(): Promise<void> {
    if (this.mode !== 'linked') return;
    const last = this.settings.get().lastReportSentAt;
    if (last && Date.now() - new Date(last).getTime() < DAY_MS) return;
    await this.runCheck().catch(() => undefined);
  }

  private notifyIfWorse(prev: DeviceReport | null, next: DeviceReport): void {
    const before = new Map((prev?.checks ?? []).map((c) => [c.id, c.status]));
    const newlyBad = next.checks.filter((c) => c.status === 'bad' && before.get(c.id) !== 'bad');
    if (!newlyBad.length || !Notification.isSupported()) return;
    const w = this.getWindow();
    if (w && w.isVisible() && w.isFocused()) return;
    const n = new Notification({
      title: newlyBad.length === 1 ? `${newlyBad[0].title} needs attention` : `${newlyBad.length} things need attention`,
      body: newlyBad.length === 1 ? newlyBad[0].detail : 'Open PCW Care to see what we found and how to fix it.',
      silent: false,
    });
    n.on('click', () => {
      this.showWindow();
      this.emit({ type: 'navigate', page: 'checks' });
    });
    n.show();
  }

  /* ── repair tracker notifications (0.2) ── */

  startRepairWatch(): void {
    if (this.repairTimer) return;
    setTimeout(() => void this.pollRepairs(), 20_000).unref();
    this.repairTimer = setInterval(() => void this.pollRepairs(), REPAIR_POLL_MS);
    this.repairTimer.unref();
  }

  async pollRepairs(): Promise<void> {
    if (this.mode !== 'linked') return;
    const r = await this.authed(() => this.api.summary());
    if (!r.ok) return;
    const owner = this.settings.get().account?.device.id ?? null;
    const prev = this.repairWatch.read();
    const notices = diffSummary(prev, r.data, owner);
    this.repairWatch.write(stateFromSummary(r.data, owner));
    const n = combineNotices(notices);
    if (!n || !this.settings.get().repairNotifications || !Notification.isSupported()) return;
    const note = new Notification({ title: n.title, body: n.body, silent: false });
    note.on('click', () => {
      this.showWindow();
      this.emit({ type: 'navigate', page: n.page });
    });
    note.show();
  }

  /* ── verified calls (0.2) ── */

  async callStatus(): Promise<CallStatus> {
    if (this.mode !== 'linked') return { state: 'unavailable' };
    // The page polls every 30 s; a double click can't hammer the server.
    if (this.lastCall && Date.now() - this.lastCallCheck < 4_000) return this.lastCall;
    const r = await this.authed(() => this.api.callStatus());
    const out: CallStatus = r.ok ? r.data : { state: 'error', message: r.error.message };
    this.lastCall = out;
    this.lastCallCheck = Date.now();
    return out;
  }

  getHistory(): HistoryEntry[] {
    return this.history.read();
  }

  /* ── fixes ── */

  async runFix(checkId: unknown, fix: unknown): Promise<FixOutcome> {
    if (typeof checkId !== 'string' || checkId.length > 100 || !isFixId(fix)) return { ok: false, message: 'Unknown action.' };
    const check = this.report?.checks.find((c) => c.id === checkId);
    if (!check || !check.fixes.includes(fix)) return { ok: false, message: 'Run a check first.' };
    return this.performFix(fix);
  }

  private async performFix(fix: FixId): Promise<FixOutcome> {
    const w = this.getWindow();
    if (fix === 'restart') {
      const opts = {
        type: 'question' as const,
        buttons: ['Restart now', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Restart your computer?',
        message: 'Restart your computer now?',
        detail: 'Save your work and close your apps first — anything that isn’t saved will be lost.',
        noLink: true,
      };
      const { response } = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts);
      if (response !== 0) return { ok: false, cancelled: true };
      const ok = await restartComputer();
      return ok ? { ok: true, message: 'Restarting…' } : { ok: false, message: "We couldn't restart your computer. Please restart it from the Start menu." };
    }
    if (fix === 'clean-temp') {
      if (process.platform !== 'win32') return { ok: false, message: 'Not available on this computer.' };
      const scan = await scanTemp(userTempDir(), 15_000);
      const opts = {
        type: 'question' as const,
        buttons: ['Clear temporary files', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: 'Clear temporary files?',
        message: `Clear about ${formatBytes(scan?.clearableBytes ?? 0)} of temporary files?`,
        detail:
          'PCW Care removes temporary files older than a day from your own temporary files folder. Files that are in use are skipped. Your documents, photos, downloads and apps are not touched.',
        noLink: true,
      };
      const { response } = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts);
      if (response !== 0) return { ok: false, cancelled: true };
      try {
        const cleaned = await cleanTemp(userTempDir(), os.homedir());
        void this.runCheck().catch(() => undefined);
        return { ok: true, cleaned, message: `Freed ${formatBytes(cleaned.freedBytes)}.` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Clearing temporary files failed.' };
      }
    }
    if (fix === 'open:recovery-key') {
      try {
        await shell.openExternal(RECOVERY_KEY_URL);
        return { ok: true };
      } catch {
        return { ok: false, message: "We couldn't open your browser." };
      }
    }
    const url = settingsUrl(fix, process.platform);
    if (!url) return { ok: false, message: 'Not available on this computer.' };
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch {
      return { ok: false, message: "We couldn't open that settings page." };
    }
  }

  /* ── help ── */

  async createTicket(input: unknown): Promise<Result<{ ticket: { id: number; ref: string } }>> {
    const i = input as Partial<TicketInput> | null;
    const subject = typeof i?.subject === 'string' ? i.subject.trim() : '';
    const message = typeof i?.message === 'string' ? i.message.trim() : '';
    const includeReport = i?.includeReport === true;
    const screenshotId = typeof i?.screenshotId === 'string' && i.screenshotId ? i.screenshotId : null;
    const jpeg = screenshotId ? this.screenshots.take(screenshotId) : null;
    if (screenshotId && !jpeg) return { ok: false, error: apiError('bad_screenshot', 400, 'That screenshot has expired. Take it again, or send your ticket without it.') };
    if (subject.length < 3 || subject.length > 120) return { ok: false, error: apiError('invalid', 400, 'Please give your ticket a subject (3 to 120 characters).') };
    if (message.length < 1 || message.length > 4000) return { ok: false, error: apiError('invalid', 400, 'Please tell us what you need help with (up to 4,000 characters).') };
    if (includeReport && this.report && this.mode === 'linked') {
      // The server attaches its latest copy of the report, so make sure it has a fresh one.
      try {
        await this.api.report(snapshotBody(this.report));
      } catch {
        /* carry on without it */
      }
    }
    const r = await this.authed(() =>
      this.api.createTicket({
        subject,
        message,
        includeReport,
        ...(jpeg ? { screenshot: { mime: 'image/jpeg' as const, data: jpeg.toString('base64') } } : {}),
      }),
    );
    if (r.ok && screenshotId) this.screenshots.discard(screenshotId);
    return r;
  }

  async requestRemoteSupport(input: unknown) {
    const i = input as Partial<RemoteInput> | null;
    const preferred = i?.preferred === 'later' ? 'later' : i?.preferred === 'asap' ? 'asap' : null;
    if (!preferred) return { ok: false as const, error: apiError('invalid', 400, 'Choose when you’d like us to connect.') };
    const note = typeof i?.note === 'string' ? i.note.trim().slice(0, 1000) : '';
    return this.authed(() => this.api.requestRemoteSupport({ preferred, ...(note ? { note } : {}) }));
  }

  /* ── settings ── */

  launchAtLoginAvailable(): boolean {
    return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
  }

  getSettings(): Settings {
    const stored = this.settings.get().launchAtLogin;
    let on = stored === true;
    if (this.launchAtLoginAvailable()) {
      try {
        on = app.getLoginItemSettings().openAtLogin;
      } catch {
        /* fall back to what we stored */
      }
    }
    const s = this.settings.get();
    return {
      launchAtLogin: on,
      launchAtLoginAvailable: this.launchAtLoginAvailable(),
      launchAtLoginAsked: s.launchAtLogin !== null,
      repairNotifications: s.repairNotifications !== false,
    };
  }

  setRepairNotifications(on: unknown): Settings {
    this.settings.update({ repairNotifications: on === true });
    return this.getSettings();
  }

  setLaunchAtLogin(on: unknown): Settings {
    const value = on === true;
    this.settings.update({ launchAtLogin: value });
    if (this.launchAtLoginAvailable()) {
      try {
        app.setLoginItemSettings({ openAtLogin: value, args: ['--hidden'] });
      } catch {
        /* not supported here */
      }
    }
    return this.getSettings();
  }

  /* ── IPC ── */

  registerIpc(): void {
    const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) => {
      ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (!this.isTrustedSender(event)) throw new Error('blocked');
        return fn(...(args as A));
      });
    };
    handle('care:getState', () => this.state());
    handle('care:link', (code: unknown) => this.link(code));
    handle('care:useWithoutSigningIn', () => this.useWithoutSigningIn());
    handle('care:showSignIn', () => this.showSignIn());
    handle('care:unlink', () => this.unlink());
    handle('care:getReport', () => this.getReport());
    handle('care:runCheck', () => this.runCheck());
    handle('care:runFix', (checkId: unknown, fix: unknown) => this.runFix(checkId, fix));
    handle('care:getSummary', () => this.authed(() => this.api.summary()));
    handle('care:refreshAccount', () => this.refreshAccount());
    handle('care:createTicket', (input: unknown) => this.createTicket(input));
    handle('care:captureScreenshot', () => this.screenshots.capture(this.getWindow()));
    handle('care:discardScreenshot', (id: unknown) => this.screenshots.discard(typeof id === 'string' ? id : undefined));
    handle('care:getCallStatus', () => this.callStatus());
    handle('care:getHistory', () => this.getHistory());
    handle('care:setRepairNotifications', (on: unknown) => this.setRepairNotifications(on));
    handle('care:requestRemoteSupport', (input: unknown) => this.requestRemoteSupport(input));
    handle('care:getConnectStatus', (withId: unknown) => this.pcwConnect.status(withId === true));
    handle('care:openConnect', () => this.pcwConnect.open());
    handle('care:open', async (target: unknown) => {
      if (!isContactTarget(target)) return;
      const url = contactUrl(target);
      if (!url) return;
      if (url.startsWith('https:') && !isAllowedExternalUrl(url)) return;
      await shell.openExternal(url).catch(() => undefined);
    });
    handle('care:copyText', (text: unknown) => {
      if (typeof text === 'string' && text.length <= 20_000) clipboard.writeText(text);
    });
    handle('care:getSettings', () => this.getSettings());
    handle('care:setLaunchAtLogin', (on: unknown) => this.setLaunchAtLogin(on));
    handle('care:getUpdateState', () => this.updater.current);
    handle('care:checkForUpdates', () => this.updater.check());
    handle('care:installUpdate', () => this.updater.install());
  }

  private isTrustedSender(event: IpcMainInvokeEvent): boolean {
    const url = event.senderFrame?.url ?? '';
    return this.allowedOrigins.some((o) => url.startsWith(o));
  }
}

function withCap<T>(p: Promise<T> | null, ms: number): Promise<T | null> {
  if (!p) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}
