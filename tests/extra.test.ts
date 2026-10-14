import { describe, expect, it } from 'vitest';
import * as ex from '../src/main/checks/extra';

const NOW = new Date('2026-10-14T12:00:00Z');

describe('backup (Windows)', () => {
  const kfm = {
    oneDriveFolders: ['C:\\Users\\jane\\OneDrive'],
    oneDriveAccount: true,
    shellFolders: { documents: 'C:\\Users\\jane\\OneDrive\\Documents', desktop: 'C:\\Users\\jane\\OneDrive\\Desktop', pictures: 'C:\\Users\\jane\\Pictures' },
  };

  it('spots Documents and Desktop moved into OneDrive (Known Folder Move)', () => {
    expect(ex.oneDriveProtectedFolders(kfm)).toEqual(['Documents', 'Desktop']);
    const r = ex.evalWindowsBackup(kfm, true, NOW);
    expect(r).toMatchObject({ id: 'backup', status: 'ok', category: 'backup' });
    expect(r.detail).toBe('Your Documents and Desktop folders are backed up to OneDrive.');
  });

  it('is case- and slash-insensitive, and needs a real sub-folder match', () => {
    expect(ex.oneDriveProtectedFolders({ oneDriveFolders: ['c:/users/JANE/onedrive/'], shellFolders: { documents: 'C:\\Users\\jane\\OneDrive\\Documents' } })).toEqual([
      'Documents',
    ]);
    // "OneDrive - Acme" is not inside "OneDrive"
    expect(ex.oneDriveProtectedFolders({ oneDriveFolders: ['C:\\Users\\jane\\OneDrive'], shellFolders: { documents: 'C:\\Users\\jane\\OneDrive - Acme\\Documents' } })).toEqual(
      [],
    );
  });

  it('warns when OneDrive is set up but not running', () => {
    expect(ex.evalWindowsBackup(kfm, false, NOW).status).toBe('warn');
  });

  it('uses File History dates', () => {
    expect(ex.evalWindowsBackup({ fileHistoryConfigured: true, fileHistoryLast: '2026-10-12T20:00:00Z' }, null, NOW)).toMatchObject({ status: 'ok' });
    const stale = ex.evalWindowsBackup({ fileHistoryConfigured: true, fileHistoryLast: '2026-08-01T20:00:00Z' }, null, NOW);
    expect(stale.status).toBe('warn');
    expect(stale.detail).toMatch(/File History last backed up your files/);
    expect(ex.evalWindowsBackup({ fileHistoryConfigured: true }, null, NOW).status).toBe('ok');
    expect(ex.evalWindowsBackup({ legacyBackupConfigured: true }, null, NOW).status).toBe('ok');
  });

  it("never claims there's no backup — only that we couldn't see one", () => {
    const r = ex.evalWindowsBackup({ oneDriveFolders: [], oneDriveAccount: false }, true, NOW);
    expect(r.status).toBe('warn');
    expect(r.detail.startsWith("We couldn't see a backup on this computer.")).toBe(true);
    expect(r.askUs).toBe(true);
    const signedIn = ex.evalWindowsBackup({ oneDriveFolders: ['C:\\Users\\jane\\OneDrive'], oneDriveAccount: true, shellFolders: { documents: 'C:\\Users\\jane\\Documents' } }, true, NOW);
    expect(signedIn.status).toBe('warn');
    expect(signedIn.detail).toMatch(/^We couldn't see a backup on this computer\. OneDrive is signed in/);
  });

  it('is unknown when nothing could be read', () => {
    expect(ex.evalWindowsBackup(null, null, NOW).status).toBe('unknown');
  });
});

describe('backup (Mac)', () => {
  it('Time Machine recent / stale / configured / off', () => {
    expect(ex.evalMacBackup({ configured: true, autoBackup: true, latest: '2026-10-13T09:00:00Z' }, null, NOW).detail).toBe('Time Machine last backed up your Mac yesterday.');
    expect(ex.evalMacBackup({ configured: true, autoBackup: true, latest: '2026-09-01T09:00:00Z' }, null, NOW).status).toBe('warn');
    expect(ex.evalMacBackup({ configured: true, autoBackup: null, latest: null }, null, NOW).status).toBe('ok');
    expect(ex.evalMacBackup({ configured: true, autoBackup: false, latest: null }, null, NOW).status).toBe('warn');
  });

  it('iCloud Desktop & Documents is "good to know", nothing is "couldn\'t see"', () => {
    expect(ex.evalMacBackup({ configured: false, autoBackup: null, latest: null }, true, NOW).status).toBe('info');
    const none = ex.evalMacBackup({ configured: false, autoBackup: null, latest: null }, false, NOW);
    expect(none.status).toBe('warn');
    expect(none.detail).toMatch(/^We couldn't see a backup on this computer\./);
    expect(ex.evalMacBackup(null, null, NOW).status).toBe('unknown');
  });
});

describe('Windows 10 end of support', () => {
  const win10 = { platform: 'win32', name: 'Windows 10 Home', build: '19045.6456' };

  it('uses the dates in constants', () => {
    expect(ex.WIN10_END_OF_SUPPORT).toBe('2025-10-14');
    expect(ex.WIN10_CONSUMER_ESU_END).toBe('2026-10-13');
  });

  it('after 13 Oct 2026: no more security updates', () => {
    const r = ex.evalWin10Eos(win10, NOW)!;
    expect(r).toMatchObject({ id: 'win10_eos', status: 'bad', askUs: true });
    expect(r.detail).toMatch(/no longer gets security updates/);
    expect(r.detail).toMatch(/13 October 2026/);
  });

  it('13 Oct 2026 itself is still covered by ESU; before Oct 2025 is info', () => {
    expect(ex.evalWin10Eos(win10, new Date('2026-10-13T18:00:00Z'))!.status).toBe('warn');
    expect(ex.evalWin10Eos(win10, new Date('2025-06-01T12:00:00Z'))!.status).toBe('info');
  });

  it('only for Windows 10 (by build), LTSC is info', () => {
    expect(ex.evalWin10Eos({ platform: 'win32', name: 'Windows 11 Home', build: '26100.2314' }, NOW)).toBeNull();
    expect(ex.evalWin10Eos({ platform: 'darwin', name: 'macOS', build: '24G84' }, NOW)).toBeNull();
    expect(ex.evalWin10Eos({ platform: 'win32', name: 'Windows 10 Enterprise LTSC 2021', build: '19044' }, NOW)!.status).toBe('info');
    expect(ex.isWindows10({ platform: 'win32', name: 'Windows 10 Pro', build: '' })).toBe(true);
  });
});

describe('Windows 11 readiness', () => {
  const win10 = { platform: 'win32', name: 'Windows 10 Home', build: '19045' };

  it.each([
    ['Intel Core i5-8250U', 'yes'],
    ['Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz', 'yes'],
    ['Intel Core i5-1245U', 'yes'],
    ['Intel Core i7-13700K', 'yes'],
    ['Intel Core Ultra 7 155H', 'yes'],
    ['Intel Core i5-7200U', 'no'],
    ['Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz', 'no'],
    ['Intel Core 2 Duo E8400', 'no'],
    ['AMD Ryzen 5 3600 6-Core Processor', 'yes'],
    ['AMD Ryzen 7 PRO 4750U', 'yes'],
    ['AMD Ryzen 5 1600', 'no'],
    ['AMD A8-6500 APU', 'no'],
    ['Snapdragon X Elite', 'yes'],
    ['Intel Xeon E5-2670', 'unknown'],
    ['', 'unknown'],
  ] as const)('%s → %s', (brand, verdict) => {
    expect(ex.cpuLikelySupported(brand)).toBe(verdict);
  });

  it('is always "info" and never claims certainty', () => {
    const ready = ex.evalWin11Ready(win10, { cpuBrand: 'Intel Core i5-8250U', ramGb: 8, systemDiskGb: 238 }, { tpmPresent: true, tpmVersion: '2.0', secureBoot: true })!;
    expect(ready.status).toBe('info');
    expect(ready.detail).toMatch(/^Your computer is probably ready for Windows 11\./);
    const old = ex.evalWin11Ready(win10, { cpuBrand: 'Intel Core i5-4590', ramGb: 4, systemDiskGb: 500 }, null)!;
    expect(old.status).toBe('info');
    expect(old.detail).toMatch(/probably not ready.*processor/);
    expect(old.detail).toMatch(/we can check for you/i);
  });

  it("follows Windows Update's own verdict when it says no", () => {
    const r = ex.evalWin11Ready(win10, { cpuBrand: 'Intel Core i5-8250U', ramGb: 8, systemDiskGb: 238 }, { upgEx: 'Red', redReason: 'TPM' })!;
    expect(r.detail).toMatch(/probably not ready/);
  });

  it('flags small memory/disk and old TPM; not on Windows 11', () => {
    const r = ex.evalWin11Ready(win10, { cpuBrand: 'Intel Core i3-10110U', ramGb: 2, systemDiskGb: 32 }, { tpmPresent: true, tpmVersion: '1.2' })!;
    expect(r.detail).toMatch(/less than 4 GB/);
    expect(r.detail).toMatch(/smaller than 64 GB/);
    expect(r.detail).toMatch(/older version/);
    expect(ex.evalWin11Ready({ platform: 'win32', name: 'Windows 11 Pro', build: '22631' }, { cpuBrand: '', ramGb: 8, systemDiskGb: 200 }, null)).toBeNull();
  });
});

describe('crash history', () => {
  it('combines Windows counts (41 and 6008 are the same shutdown)', () => {
    const s = ex.stabilityFromWindows({ appCrashes: 4, appHangs: 2, unexpected41: 3, unexpected6008: 2, apps: [{ name: 'OUTLOOK.EXE', count: 3 }, { name: 'chrome.exe', count: 3 }] });
    expect(s).toEqual({ appCrashes: 6, unexpectedShutdowns: 3, apps: [{ name: 'chrome', count: 3 }, { name: 'OUTLOOK', count: 3 }] });
  });

  it('keeps app names out of the sent detail', () => {
    const r = ex.evalCrashes({ appCrashes: 25, unexpectedShutdowns: 0, apps: [{ name: 'SecretApp', count: 25 }] }, 'win32');
    expect(r.status).toBe('warn');
    expect(r.detail).not.toMatch(/SecretApp/);
    expect(r.title).not.toMatch(/SecretApp/);
    expect(r.localNote).toMatch(/SecretApp \(25\)/);
  });

  it('thresholds and wording', () => {
    expect(ex.evalCrashes({ appCrashes: 0, unexpectedShutdowns: 0, apps: [] }, 'win32')).toMatchObject({ status: 'ok', detail: 'No crashes in the last 30 days.' });
    expect(ex.evalCrashes({ appCrashes: 1, unexpectedShutdowns: 1, apps: [] }, 'win32').detail).toBe('1 app crash and 1 unexpected shutdown in the last 30 days.');
    expect(ex.evalCrashes({ appCrashes: 1, unexpectedShutdowns: 3, apps: [] }, 'darwin').detail).toMatch(/3 unexpected restarts/);
    expect(ex.evalCrashes({ appCrashes: 1, unexpectedShutdowns: 3, apps: [] }, 'darwin').status).toBe('warn');
    expect(ex.evalCrashes(null, 'win32').status).toBe('unknown');
    expect(ex.evalCrashes({ appCrashes: null, unexpectedShutdowns: null, apps: [] }, 'win32').status).toBe('unknown');
  });

  it.each([
    ['Safari-2026-10-10-120000.ips', 'app', 'Safari'],
    ['Microsoft Word_2026-10-10-120000_Janes-MacBook.crash', 'app', 'Microsoft Word'],
    ['panic-full-2026-10-10-120000.panic', 'panic', ''],
    ['Kernel-2026-10-10-120000.ips', 'panic', ''],
    ['JetsamEvent-2026-10-10-120000.ips', 'skip', ''],
    ['WindowServer_2026-10-10-120000_Mac.cpu_resource.diag', 'skip', ''],
    ['notes.txt', 'skip', ''],
  ] as const)('macCrashApp(%s)', (f, kind, name) => {
    expect(ex.macCrashApp(f)).toEqual({ kind, name });
  });
});

describe('remote access apps', () => {
  it('finds Windows process names', () => {
    expect(ex.findRemoteTools(['explorer', 'AnyDesk', 'TeamViewer_Service', 'QuickAssist', 'svchost'])).toEqual(['AnyDesk', 'Quick Assist', 'TeamViewer']);
    expect(ex.findRemoteTools(['ScreenConnect.ClientService', 'UltraViewer_Service', 'rustdesk'])).toEqual(['RustDesk', 'ScreenConnect (ConnectWise Control)', 'UltraViewer']);
  });

  it('never flags PCW-Connect (even its RustDesk binary on a Mac)', () => {
    expect(ex.findRemoteTools(['PCW-Connect', 'pcw-connect'])).toEqual([]);
    expect(ex.findRemoteTools(['/Applications/PCW-Connect.app/Contents/MacOS/RustDesk'])).toEqual([]);
    expect(ex.findRemoteTools(['/Applications/RustDesk.app/Contents/MacOS/RustDesk'])).toEqual(['RustDesk']);
  });

  it('matches macOS paths by binary or app bundle', () => {
    expect(ex.findRemoteTools(['/Applications/AnyDesk.app/Contents/MacOS/AnyDesk', '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder'])).toEqual(['AnyDesk']);
    expect(ex.findRemoteTools(['/Applications/TeamViewer.app/Contents/Helpers/TeamViewer_Desktop'])).toEqual(['TeamViewer']);
  });

  it('keeps names out of what is sent', () => {
    const { check, found } = ex.evalRemoteTools(['AnyDesk'], 'win32');
    expect(found).toEqual(['AnyDesk']);
    expect(check).toMatchObject({ id: 'remote_tools', status: 'warn', title: 'Remote access apps' });
    expect(check.detail).not.toMatch(/AnyDesk/i);
    expect(check.localNote).toBe('Running now: AnyDesk.');
    expect(ex.evalRemoteTools([], 'win32').check.status).toBe('ok');
    expect(ex.evalRemoteTools(null, 'darwin').check.status).toBe('unknown');
  });
});

describe('expired antivirus', () => {
  // 0x041000 on & up to date (Defender), 0x061010 on but out of date, 0x060100 off
  it('ignores Defender, flags out-of-date or switched-off third-party AV', () => {
    expect(ex.evalAntivirusExpired({ av: [{ name: 'Windows Defender', state: 0x041000 }] })).toMatchObject({ status: 'ok' });
    expect(ex.evalAntivirusExpired({ av: [{ name: 'Norton 360', state: 0x061000 }] })).toMatchObject({ status: 'ok' });
    const stale = ex.evalAntivirusExpired({ av: [{ name: 'Windows Defender', state: 0x061100 }, { name: 'McAfee LiveSafe', state: 0x061010 }] });
    expect(stale).toMatchObject({ id: 'antivirus_expired', status: 'warn' });
    expect(stale.detail).toMatch(/McAfee LiveSafe is installed but out of date/);
    expect(ex.evalAntivirusExpired({ av: [{ name: 'Avast', state: 0x060100 }] }).detail).toMatch(/switched off/);
    expect(ex.evalAntivirusExpired(null).status).toBe('unknown');
    expect(ex.evalAntivirusExpired({ av: null }).status).toBe('unknown');
  });
});

describe('BitLocker', () => {
  it('on → ok with the recovery key link', () => {
    const r = ex.evalBitLocker({ protection: 1 });
    expect(r.status).toBe('ok');
    expect(r.fixes).toEqual(['open:recovery-key']);
    expect(r.detail).toMatch(/recovery key/);
    expect(ex.RECOVERY_KEY_URL).toBe('https://aka.ms/myrecoverykey');
  });
  it("off is only 'info', unreadable is 'unknown' (no nagging)", () => {
    expect(ex.evalBitLocker({ protection: 2 }).status).toBe('info');
    expect(ex.evalBitLocker({ protection: 5 }).status).toBe('info');
    expect(ex.evalBitLocker({ protection: null }).status).toBe('unknown');
    expect(ex.evalBitLocker(null).status).toBe('unknown');
  });
});
