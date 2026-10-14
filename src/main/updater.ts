/* Updates from GitHub Releases (Ebcacebcac/PCW-Care) via electron-updater.

   Windows: downloads in the background, then "Restart to update".
   macOS: without an Apple Developer ID signature Squirrel.Mac can't install
   updates, so unsigned builds only check — the app then says "A new
   version is available" with a button that opens the release page. Builds
   signed and notarised in CI carry `pcwCareSigned: true` in their
   package.json (electron-builder extraMetadata, see
   scripts/builder-config.cjs) and update themselves like Windows. */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/types';

const CHECK_EVERY_MS = 6 * 3600 * 1000;

export class Updater {
  private state: UpdateState = { state: 'idle' };
  private readonly manual = process.platform === 'darwin' && !packagedAsSigned();
  private started = false;

  constructor(private readonly onChange: (s: UpdateState) => void) {}

  get current(): UpdateState {
    return this.state;
  }

  private set(s: UpdateState): void {
    this.state = s;
    this.onChange(s);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (!app.isPackaged) {
      this.set({ state: 'unsupported', message: 'Updates are checked in the installed app.' });
      return;
    }
    autoUpdater.autoDownload = !this.manual;
    autoUpdater.autoInstallOnAppQuit = !this.manual;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }));
    autoUpdater.on('update-not-available', () => this.set({ state: 'none', checkedAt: new Date().toISOString() }));
    autoUpdater.on('update-available', (info) => {
      this.set(this.manual ? { state: 'available', version: info.version, manual: true } : { state: 'downloading', version: info.version, percent: 0 });
    });
    autoUpdater.on('download-progress', (p) => {
      const version = 'version' in this.state ? this.state.version : '';
      this.set({ state: 'downloading', version, percent: Math.round(p.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => this.set({ state: 'ready', version: info.version }));
    autoUpdater.on('error', () => {
      // Keep a found-but-manual update visible; otherwise report a soft error.
      if (this.state.state !== 'available') this.set({ state: 'error', message: "Couldn't check for updates. We'll try again later." });
    });

    setTimeout(() => void this.check(), 30_000);
    setInterval(() => void this.check(), CHECK_EVERY_MS).unref();
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) return this.state;
    if (this.state.state === 'downloading' || this.state.state === 'ready') return this.state;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      if (this.state.state !== 'available') this.set({ state: 'error', message: "Couldn't check for updates. Check your internet connection." });
    }
    return this.state;
  }

  install(): void {
    if (this.state.state === 'ready' && !this.manual) {
      autoUpdater.quitAndInstall(false, true);
    }
  }
}

function packagedAsSigned(): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as { pcwCareSigned?: unknown };
    return pkg.pcwCareSigned === true;
  } catch {
    return false;
  }
}
