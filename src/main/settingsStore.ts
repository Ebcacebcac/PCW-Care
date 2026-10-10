/* Small JSON files in the app's userData folder. Nothing secret lives here —
   the device token is kept separately by TokenStore. */

import fs from 'node:fs';
import path from 'node:path';
import type { DeviceReport, MeResponse } from '../shared/types';

export interface StoredSettings {
  mode: 'guest' | 'linked' | null;
  /* null = the customer hasn't chosen yet (turned on after first sign-in) */
  launchAtLogin: boolean | null;
  account: MeResponse | null;
  lastReportSentAt: string | null;
  trayHintShown: boolean;
}

const DEFAULTS: StoredSettings = {
  mode: null,
  launchAtLogin: null,
  account: null,
  lastReportSentAt: null,
  trayHintShown: false,
};

export class JsonFile<T extends object> {
  constructor(
    private readonly file: string,
    private readonly defaults: T,
  ) {}

  read(): T {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<T>;
      return { ...this.defaults, ...parsed };
    } catch {
      return { ...this.defaults };
    }
  }

  write(value: T): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch {
      /* not fatal — settings just won't stick */
    }
  }
}

export class SettingsStore {
  private file: JsonFile<StoredSettings>;
  private value: StoredSettings;

  constructor(dir: string) {
    this.file = new JsonFile(path.join(dir, 'settings.json'), DEFAULTS);
    this.value = this.file.read();
  }

  get(): StoredSettings {
    return this.value;
  }

  update(patch: Partial<StoredSettings>): StoredSettings {
    this.value = { ...this.value, ...patch };
    this.file.write(this.value);
    return this.value;
  }
}

export class ReportCache {
  private file: JsonFile<{ report: DeviceReport | null }>;

  constructor(dir: string) {
    this.file = new JsonFile(path.join(dir, 'last-check.json'), { report: null });
  }

  read(): DeviceReport | null {
    const r = this.file.read().report;
    return r && typeof r === 'object' && Array.isArray(r.checks) ? r : null;
  }

  write(report: DeviceReport): void {
    this.file.write({ report });
  }
}
