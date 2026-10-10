import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TokenStore, type SafeStorageLike } from '../src/main/tokenStore';

// A stand-in for Electron's safeStorage: reversible but not plain text.
function fakeSafe(available = true): SafeStorageLike & { calls: number } {
  return {
    calls: 0,
    isEncryptionAvailable: () => available,
    encryptString(s: string) {
      this.calls++;
      return Buffer.from(Buffer.from(s, 'utf8').map((b) => b ^ 0x5a));
    },
    decryptString(b: Buffer) {
      const out = Buffer.from(b.map((x) => x ^ 0x5a)).toString('utf8');
      if (!/^[A-Za-z0-9_-]+$/.test(out)) throw new Error('decrypt failed');
      return out;
    },
  };
}

const TOKEN = 'Abc_def-0123456789ghijklmnopqrstuvwxyzABCDEF';
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcw-token-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('TokenStore', () => {
  it('round-trips the token and never writes it in plain text', () => {
    const file = path.join(dir, 'device-token.bin');
    const store = new TokenStore(file, fakeSafe());
    expect(store.save(TOKEN)).toEqual({ persisted: true });
    const raw = fs.readFileSync(file);
    expect(raw.toString('utf8')).not.toContain(TOKEN);
    expect(new TokenStore(file, fakeSafe()).load()).toBe(TOKEN);
  });

  it('keeps the token in memory only when encryption is unavailable', () => {
    const file = path.join(dir, 'device-token.bin');
    const store = new TokenStore(file, fakeSafe(false));
    expect(store.save(TOKEN)).toEqual({ persisted: false });
    expect(fs.existsSync(file)).toBe(false);
    expect(store.load()).toBe(TOKEN);
    expect(new TokenStore(file, fakeSafe(false)).load()).toBeNull();
  });

  it('forgets an unreadable file', () => {
    const file = path.join(dir, 'device-token.bin');
    fs.writeFileSync(file, Buffer.from([0x00, 0xff, 0x10]));
    expect(new TokenStore(file, fakeSafe()).load()).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('returns null when nothing is stored, and clear() removes it', () => {
    const file = path.join(dir, 'device-token.bin');
    const store = new TokenStore(file, fakeSafe());
    expect(store.load()).toBeNull();
    store.save(TOKEN);
    store.clear();
    expect(store.load()).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    const store = new TokenStore(path.join(dir, 't.bin'), fakeSafe());
    expect(() => store.save('short')).toThrow();
    expect(() => store.save('has spaces in it and is long enough')).toThrow();
    expect(TokenStore.isValidToken(TOKEN)).toBe(true);
  });
});
