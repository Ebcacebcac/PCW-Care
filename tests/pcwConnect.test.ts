import { describe, expect, it } from 'vitest';
import { findPcwConnect, formatConnectId, idFromOutput, macCandidates, windowsCandidates } from '../src/main/pcwConnect';

const env = {
  ProgramW6432: 'C:\\Program Files',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\jane\\AppData\\Local',
};

describe('PCW-Connect install locations', () => {
  it('checks Program Files then the per-user folder, without duplicates', () => {
    expect(windowsCandidates(env)).toEqual([
      'C:\\Program Files\\PCW-Connect\\PCW-Connect.exe',
      'C:\\Program Files (x86)\\PCW-Connect\\PCW-Connect.exe',
      'C:\\Users\\jane\\AppData\\Local\\PCW-Connect\\PCW-Connect.exe',
    ]);
  });

  it('checks /Applications and ~/Applications on a Mac', () => {
    expect(macCandidates('/Users/jane')).toEqual([
      '/Applications/PCW-Connect.app',
      '/Applications/PCW Connect.app',
      '/Users/jane/Applications/PCW-Connect.app',
      '/Users/jane/Applications/PCW Connect.app',
    ]);
  });

  it('finds a per-user install on Windows', async () => {
    const want = 'C:\\Users\\jane\\AppData\\Local\\PCW-Connect\\PCW-Connect.exe';
    const found = await findPcwConnect('win32', env, 'C:\\Users\\jane', {
      file: async (p) => p === want,
      dir: async () => false,
    });
    expect(found).toBe(want);
  });

  it('finds the app in ~/Applications on a Mac', async () => {
    const found = await findPcwConnect('darwin', {}, '/Users/jane', {
      file: async () => false,
      dir: async (p) => p === '/Users/jane/Applications/PCW-Connect.app',
    });
    expect(found).toBe('/Users/jane/Applications/PCW-Connect.app');
  });

  it('reports not installed, and nothing at all on other systems', async () => {
    const none = { file: async () => false, dir: async () => false };
    expect(await findPcwConnect('win32', env, 'C:\\Users\\jane', none)).toBeNull();
    expect(await findPcwConnect('linux', env, '/home/jane', { file: async () => true, dir: async () => true })).toBeNull();
  });
});

describe('PCW-Connect ID', () => {
  it('reads the ID from --get-id output, as the Go helper does', () => {
    expect(idFromOutput('487836096\n')).toBe('487836096');
    expect(idFromOutput('[INFO] starting\r\n487 836 096\r\n')).toBe('487836096');
    expect(idFromOutput('log line\nPCW_shop-12\n')).toBe('PCW_shop-12');
    expect(idFromOutput('no id here\nabcdefgh\n')).toBeNull();
    expect(idFromOutput('')).toBeNull();
  });

  it('groups 9–10 digit IDs in threes', () => {
    expect(formatConnectId('487836096')).toBe('487 836 096');
    expect(formatConnectId('1234567890')).toBe('123 456 789 0');
    expect(formatConnectId('PCW_shop-12')).toBe('PCW_shop-12');
  });
});
