/* Keeps the device token encrypted at rest with Electron's safeStorage
   (DPAPI on Windows, the Keychain on macOS). If encryption isn't available
   the token is kept in memory only — it is never written in plain text.
   The token is never logged. */

import fs from 'node:fs';
import path from 'node:path';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface FsLike {
  readFileSync(p: string): Buffer;
  writeFileSync(p: string, data: Buffer, opts?: { mode?: number }): void;
  renameSync(a: string, b: string): void;
  rmSync(p: string, opts?: { force?: boolean }): void;
  mkdirSync(p: string, opts?: { recursive?: boolean }): unknown;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;

export class TokenStore {
  private cached: string | null | undefined;

  constructor(
    private readonly file: string,
    private readonly safe: SafeStorageLike,
    private readonly fsImpl: FsLike = fs as unknown as FsLike,
  ) {}

  static isValidToken(token: unknown): token is string {
    return typeof token === 'string' && TOKEN_RE.test(token);
  }

  load(): string | null {
    if (this.cached !== undefined) return this.cached;
    let buf: Buffer;
    try {
      buf = this.fsImpl.readFileSync(this.file);
    } catch {
      this.cached = null;
      return null;
    }
    try {
      if (!this.safe.isEncryptionAvailable()) {
        this.cached = null;
        return null;
      }
      const token = this.safe.decryptString(buf);
      if (!TokenStore.isValidToken(token)) throw new Error('bad token');
      this.cached = token;
      return token;
    } catch {
      // Unreadable (e.g. copied from another computer or keychain reset): forget it.
      this.clear();
      return null;
    }
  }

  /* Returns whether the token was written to disk (false = memory only). */
  save(token: string): { persisted: boolean } {
    if (!TokenStore.isValidToken(token)) throw new Error('invalid token');
    this.cached = token;
    if (!this.safe.isEncryptionAvailable()) return { persisted: false };
    try {
      const enc = this.safe.encryptString(token);
      this.fsImpl.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      this.fsImpl.writeFileSync(tmp, enc, { mode: 0o600 });
      this.fsImpl.renameSync(tmp, this.file);
      return { persisted: true };
    } catch {
      return { persisted: false };
    }
  }

  clear(): void {
    this.cached = null;
    try {
      this.fsImpl.rmSync(this.file, { force: true });
    } catch {
      /* already gone */
    }
  }
}
