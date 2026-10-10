import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAC_USER_TEMP, cleanTemp, isSafeTempDir, scanTemp } from '../src/main/tempFiles';

describe('isSafeTempDir', () => {
  it('accepts the usual per-user temp folders', () => {
    expect(isSafeTempDir('C:\\Users\\jane\\AppData\\Local\\Temp', 'C:\\Users\\jane', 'win32')).toBe(true);
    expect(isSafeTempDir('c:\\users\\JANE\\appdata\\local\\temp', 'C:\\Users\\jane', 'win32')).toBe(true);
    expect(isSafeTempDir('/var/folders/ab/xyz/T', '/var/folders/ab', 'darwin')).toBe(true);
    expect(isSafeTempDir('C:\\Users\\jane\\AppData\\Local\\Temp\\2', 'C:\\Users\\jane', 'win32')).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isSafeTempDir('C:\\Windows\\Temp', 'C:\\Users\\jane', 'win32')).toBe(false);
    expect(isSafeTempDir('C:\\Users\\jane', 'C:\\Users\\jane', 'win32')).toBe(false);
    expect(isSafeTempDir('C:\\Users\\jane\\Documents', 'C:\\Users\\jane', 'win32')).toBe(false);
    expect(isSafeTempDir('/tmp', '/home/jane', 'linux')).toBe(false);
    expect(isSafeTempDir('', '/home/jane', 'linux')).toBe(false);
    expect(isSafeTempDir('C:\\Users\\jane\\Documents\\2', 'C:\\Users\\jane', 'win32')).toBe(false);
  });
});

describe('scan and clean', () => {
  let home: string;
  let temp: string;
  const old = Date.now() / 1000 - 3 * 86400;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'pcw-home-'));
    temp = path.join(home, 'AppData', 'Local', 'Temp');
    fs.mkdirSync(path.join(temp, 'sub', 'deeper'), { recursive: true });
    const write = (rel: string, bytes: number, aged: boolean) => {
      const p = path.join(temp, rel);
      fs.writeFileSync(p, Buffer.alloc(bytes));
      if (aged) fs.utimesSync(p, old, old);
    };
    write('old1.tmp', 1000, true);
    write('sub/old2.log', 2000, true);
    write('sub/deeper/old3.bin', 3000, true);
    write('fresh.tmp', 500, false);
    // something outside temp that a symlink points at — must survive
    fs.mkdirSync(path.join(home, 'Documents'));
    fs.writeFileSync(path.join(home, 'Documents', 'precious.docx'), 'keep me');
    fs.utimesSync(path.join(home, 'Documents', 'precious.docx'), old, old);
    try {
      fs.symlinkSync(path.join(home, 'Documents'), path.join(temp, 'link-to-docs'), 'dir');
    } catch {
      /* symlinks may be unavailable */
    }
    fs.utimesSync(path.join(temp, 'sub', 'deeper'), old, old);
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('measures total and clearable bytes', async () => {
    const r = await scanTemp(temp);
    expect(r).toMatchObject({ totalBytes: 6500, clearableBytes: 6000, files: 4, truncated: false });
  });

  it('deletes only old regular files, never follows links, keeps the root', async () => {
    const r = await cleanTemp(temp, home);
    expect(r).toEqual({ freedBytes: 6000, deletedFiles: 3, skippedFiles: 0 });
    expect(fs.existsSync(path.join(temp, 'fresh.tmp'))).toBe(true);
    expect(fs.existsSync(path.join(temp, 'old1.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(home, 'Documents', 'precious.docx'))).toBe(true);
    expect(fs.existsSync(temp)).toBe(true);
  });

  it('refuses a folder that is not a temp folder', async () => {
    await expect(cleanTemp(path.join(home, 'Documents'), home)).rejects.toThrow(/isn't where we expected/);
    expect(fs.existsSync(path.join(home, 'Documents', 'precious.docx'))).toBe(true);
  });

  // Windows gives TEMP as C:\Users\ETHANB~1\... while the home folder is the
  // long name. A second spelling of the same home (a link here) is the same
  // situation: compared as text they don't match; resolved they do.
  it('accepts the temp folder when home and temp are spelled differently', async () => {
    const alias = `${home}-alias`;
    fs.symlinkSync(home, alias);
    try {
      const r = await cleanTemp(path.join(alias, 'AppData', 'Local', 'Temp'), home);
      expect(r.deletedFiles).toBe(3);
      expect(fs.existsSync(path.join(home, 'Documents', 'precious.docx'))).toBe(true);
    } finally {
      fs.unlinkSync(alias);
    }
  });

  it('refuses a temp folder that is really a link to somewhere outside home', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pcw-outside-'));
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'x');
    const linked = path.join(home, 'Temp');
    fs.symlinkSync(outside, linked);
    try {
      await expect(cleanTemp(linked, home)).rejects.toThrow(/isn't where we expected/);
      expect(fs.existsSync(path.join(outside, 'keep.txt'))).toBe(true);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('scan returns null for a missing folder', async () => {
    expect(await scanTemp(path.join(home, 'nope'))).toBeNull();
  });
});

describe('macOS per-user temp folder shape', () => {
  it('matches only /private/var/folders/<xx>/<id>/T', () => {
    expect(MAC_USER_TEMP.test('/private/var/folders/x8/7yq2b9xd4k1g8m0000gn/T')).toBe(true);
    expect(MAC_USER_TEMP.test('/private/var/folders/x8/7yq2b9xd4k1g8m0000gn')).toBe(false);
    expect(MAC_USER_TEMP.test('/private/var/folders/x8/7yq2b9xd4k1g8m0000gn/T/sub')).toBe(false);
    expect(MAC_USER_TEMP.test('/private/var/folders/x8/../../T')).toBe(false);
    expect(MAC_USER_TEMP.test('/var/folders/x8/abc/T')).toBe(false); // must be the resolved /private form
    expect(MAC_USER_TEMP.test('/Users/jane/T')).toBe(false);
  });
});
