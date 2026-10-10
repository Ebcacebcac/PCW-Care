import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanTemp, isSafeTempDir, scanTemp } from '../src/main/tempFiles';

describe('isSafeTempDir', () => {
  it('accepts the usual per-user temp folders', () => {
    expect(isSafeTempDir('C:\\Users\\jane\\AppData\\Local\\Temp', 'C:\\Users\\jane', 'win32')).toBe(true);
    expect(isSafeTempDir('c:\\users\\JANE\\appdata\\local\\temp', 'C:\\Users\\jane', 'win32')).toBe(true);
    expect(isSafeTempDir('/var/folders/ab/xyz/T', '/var/folders/ab', 'darwin')).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isSafeTempDir('C:\\Windows\\Temp', 'C:\\Users\\jane', 'win32')).toBe(false);
    expect(isSafeTempDir('C:\\Users\\jane', 'C:\\Users\\jane', 'win32')).toBe(false);
    expect(isSafeTempDir('C:\\Users\\jane\\Documents', 'C:\\Users\\jane', 'win32')).toBe(false);
    expect(isSafeTempDir('/tmp', '/home/jane', 'linux')).toBe(false);
    expect(isSafeTempDir('', '/home/jane', 'linux')).toBe(false);
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
    await expect(cleanTemp(path.join(home, 'Documents'), home)).rejects.toThrow(/not in the expected place/);
    expect(fs.existsSync(path.join(home, 'Documents', 'precious.docx'))).toBe(true);
  });

  it('scan returns null for a missing folder', async () => {
    expect(await scanTemp(path.join(home, 'nope'))).toBeNull();
  });
});
