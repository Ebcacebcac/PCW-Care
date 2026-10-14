/* DEV ONLY — a fake window.pcwCare so the renderer can run in a plain
   browser (`npm run dev:renderer`) for design work and screenshots. Never
   included in production builds (see main.tsx).

   URL options: ?scenario=signin|guest|linked|healthy|checking|desktop|mac|maintenance|win10|scam
   &connect=missing (PCW-Connect not installed) | noid (installed, ID unreadable)
   &call=yes|no|off|error   verified call answer (off = older server, card hidden)
   &launch=ask              show the one-time "start when I sign in?" question
   &shot=bad                the server refuses the screenshot (400 bad_screenshot)
   &page=home|device|checks|help|account|settings|privacy|summary */

import type {
  AppEvent,
  AppState,
  CallStatus,
  CareBridge,
  CheckResult,
  DeviceReport,
  HistoryEntry,
  MeResponse,
  ScreenshotResult,
  Settings,
  Status,
  SummaryResponse,
  UpdateState,
} from '../../shared/types';

const q = new URLSearchParams(location.search);
const scenario = q.get('scenario') ?? 'linked';
const mac = scenario === 'mac';
const win10 = scenario === 'win10';
const scam = scenario === 'scam';
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const H = 3600_000;
const D = 24 * H;

const account: MeResponse = {
  client: { firstName: 'Jane', lastName: 'Robson', company: null, email: 'jane.robson@example.co.uk' },
  device: { id: 12, name: mac ? 'Janes-MacBook-Air' : 'JANE-LAPTOP' },
  flags: { maintenance: scenario === 'maintenance' || scenario === 'mac' || win10 },
  hubUrl: 'https://customer.pcwhub.co.uk',
};

function winReport(): DeviceReport {
  const healthy = scenario === 'healthy';
  const desktop = scenario === 'desktop';
  return {
    collectedAt: iso(4 * 60_000),
    durationMs: 8400,
    appVersion: '0.1.0',
    device: desktop
      ? { manufacturer: 'Dell', model: 'OptiPlex 7010', serial: '7XK2Q93', type: 'desktop', name: 'RECEPTION-PC' }
      : { manufacturer: 'Lenovo', model: 'ThinkPad T14 Gen 3', serial: 'PF3W8K2L', type: 'laptop', name: 'JANE-LAPTOP' },
    os: win10
      ? { platform: 'win32', name: 'Windows 10 Home', version: '22H2', build: '19045.6456', arch: 'x64' }
      : { platform: 'win32', name: 'Windows 11 Home', version: '24H2', build: '26100.2314', arch: 'x64' },
    cpu: win10 ? { brand: 'Intel Core i5-8250U', cores: 4, threads: 8, speedGhz: 1.6 } : { brand: 'Intel Core i5-1245U', cores: 10, threads: 12, speedGhz: 1.6 },
    memory: { totalGb: 16, usedPct: 58 },
    gpus: ['Intel Iris Xe Graphics'],
    disks: [
      { name: 'C:', label: 'Windows', type: 'NVMe', sizeGb: 476, freeGb: healthy ? 212 : 38.6, health: 'ok' },
      ...(desktop ? [{ name: 'D:', label: 'Data', type: 'HDD' as const, sizeGb: 931, freeGb: 402, health: 'ok' as const }] : []),
    ],
    physicalDisks: [
      { name: 'SAMSUNG MZVL2512HCJQ-00BL7', type: 'NVMe', sizeGb: 477, health: 'ok', healthText: 'Healthy' },
      ...(desktop ? [{ name: 'WDC WD10EZEX-08WN4A0', type: 'HDD' as const, sizeGb: 931, health: 'ok' as const, healthText: 'Healthy' }] : []),
    ],
    battery: desktop ? null : { healthPct: healthy ? 91 : 76, cycles: 412, charging: false, percent: 64, designCapacity: 52500, fullCapacity: 39900, capacityUnit: 'mWh' },
    uptimeHours: healthy ? 30 : 236,
    checks: [
      { id: 'updates', title: 'Windows Update', category: 'updates', status: 'ok', detail: 'Last update installed 6 days ago.', fixes: ['open:updates'] },
      { id: 'pending-restart', title: 'Restart to finish updates', category: 'updates', status: 'ok', detail: 'No restart needed for updates.', fixes: [] },
      ...(win10 ? win10Checks() : []),
      { id: 'antivirus', title: 'Virus protection', category: 'security', status: 'ok', detail: 'Protected by Microsoft Defender Antivirus.', fixes: ['open:security'] },
      win10
        ? {
            id: 'antivirus_expired',
            title: 'Expired antivirus',
            category: 'security',
            status: 'warn',
            detail: 'McAfee LiveSafe is installed but out of date — its subscription may have run out. Renew it, or remove it so Microsoft Defender can protect you instead.',
            fixes: ['open:security', 'open:apps'],
            askUs: true,
          }
        : { id: 'antivirus_expired', title: 'Expired antivirus', category: 'security', status: 'ok', detail: 'No other antivirus apps are installed — Microsoft Defender looks after this computer.', fixes: ['open:security'] },
      { id: 'firewall', title: 'Firewall', category: 'security', status: 'ok', detail: 'Windows Firewall is on for all networks.', fixes: ['open:firewall'] },
      win10
        ? { id: 'bitlocker', title: 'BitLocker drive encryption', category: 'security', status: 'info', detail: 'Drive encryption isn’t switched on. It protects your files if your computer is lost or stolen — ask us if you’d like it set up.', fixes: [] }
        : {
            id: 'bitlocker',
            title: 'BitLocker drive encryption',
            category: 'security',
            status: 'ok',
            detail: 'BitLocker is protecting your files. Make sure you know where your recovery key is — Windows can ask for it after a repair or a hardware change. It’s usually saved in your Microsoft account.',
            fixes: ['open:recovery-key'],
          },
      remoteToolsCheck('win32'),
      healthy
        ? { id: 'backup', title: 'Backup', category: 'backup', status: 'ok', detail: 'Your Documents, Desktop and Pictures folders are backed up to OneDrive.', fixes: ['open:backup'] }
        : {
            id: 'backup',
            title: 'Backup',
            category: 'backup',
            status: 'warn',
            detail:
              "We couldn't see a backup on this computer. If you back up another way (for example to an external drive you plug in), you can ignore this — otherwise we can help you set one up.",
            fixes: ['open:backup'],
            askUs: true,
          },
      healthy
        ? { id: 'disk-space:C:', title: 'Free space on C:', category: 'storage', status: 'ok', detail: '212 GB free of 476 GB (45%).', fixes: ['open:storage'] }
        : {
            id: 'disk-space:C:',
            title: 'Free space on C:',
            category: 'storage',
            status: 'warn',
            detail: "39 GB free of 476 GB (8%). It's getting full — clearing some space will help.",
            fixes: ['open:storage'],
          },
      ...(desktop
        ? [{ id: 'disk-space:D:', title: 'Free space on D:', category: 'storage' as const, status: 'ok' as const, detail: '402 GB free of 931 GB (43%).', fixes: ['open:storage' as const] }]
        : []),
      { id: 'disk-health', title: 'Disk health', category: 'storage', status: 'ok', detail: 'Your disk reports no problems.', fixes: [] },
      {
        id: 'temp-files',
        title: 'Temporary files',
        category: 'storage',
        status: healthy ? 'ok' : 'warn',
        detail: healthy ? '310 MB of temporary files — about 120 MB can be cleared.' : '4.2 GB of temporary files — about 3.8 GB can be cleared.',
        fixes: ['clean-temp'],
      },
      ...(desktop
        ? []
        : [
            healthy
              ? { id: 'battery', title: 'Battery health', category: 'battery' as const, status: 'ok' as const, detail: 'Holds 91% of its original charge. 412 charge cycles.', fixes: ['open:battery' as const] }
              : {
                  id: 'battery',
                  title: 'Battery health',
                  category: 'battery' as const,
                  status: 'warn' as const,
                  detail: "Holds 76% of its original charge. 412 charge cycles. It's starting to wear.",
                  fixes: ['open:battery' as const],
                  askUs: true,
                },
          ]),
      { id: 'memory', title: 'Memory (RAM)', category: 'memory', status: 'ok', detail: '16 GB of memory installed.', fixes: [] },
      healthy
        ? { id: 'uptime', title: 'Time since last restart', category: 'performance', status: 'ok', detail: 'Restarted 1 day ago.', fixes: [] }
        : {
            id: 'uptime',
            title: 'Time since last restart',
            category: 'performance',
            status: 'warn',
            detail: "Your computer hasn't restarted for 9 days. A restart clears out slowdowns and finishes updates. Shutting down doesn’t fully reset Windows — a restart does.",
            fixes: ['restart'],
          },
      { id: 'startup-apps', title: 'Apps that start with Windows', category: 'performance', status: 'ok', detail: '9 apps start when you sign in.', fixes: ['open:startup'] },
      win10
        ? {
            id: 'crashes',
            title: 'Crashes in the last 30 days',
            category: 'performance',
            status: 'warn',
            detail: '6 app crashes and 4 unexpected shutdowns in the last 30 days. Computers that keep switching off by themselves often have a hardware or overheating problem — we can take a look.',
            fixes: [],
            askUs: true,
            localNote: 'Most crashes: OUTLOOK (3), chrome (2), Teams (1).',
          }
        : {
            id: 'crashes',
            title: 'Crashes in the last 30 days',
            category: 'performance',
            status: 'ok',
            detail: '2 app crashes and 0 unexpected shutdowns in the last 30 days.',
            fixes: [],
            localNote: 'Most crashes: OUTLOOK (2).',
          },
    ],
    local: {
      remoteTools: scam ? ['AnyDesk'] : [],
      stability: win10
        ? { appCrashes: 6, unexpectedShutdowns: 4, apps: [{ name: 'OUTLOOK', count: 3 }, { name: 'chrome', count: 2 }, { name: 'Teams', count: 1 }] }
        : { appCrashes: 2, unexpectedShutdowns: 0, apps: [{ name: 'OUTLOOK', count: 2 }] },
    },
  };
}

function win10Checks(): CheckResult[] {
  return [
    {
      id: 'win10_eos',
      title: 'Windows 10 support',
      category: 'updates',
      status: 'bad',
      detail:
        'Windows 10 no longer gets security updates — Microsoft’s support ended in October 2025 and the extra year of Extended Security Updates finished on 13 October 2026. Upgrading to Windows 11 (or a new computer) keeps you safe online; we can check what’s best for you.',
      fixes: ['open:updates'],
      askUs: true,
    },
    {
      id: 'win11_ready',
      title: 'Ready for Windows 11?',
      category: 'updates',
      status: 'info',
      detail: 'Your computer is probably ready for Windows 11. We can check for you and do the upgrade, keeping your files and apps.',
      fixes: [],
      askUs: true,
    },
  ];
}

function remoteToolsCheck(platform: string): CheckResult {
  return scam
    ? {
        id: 'remote_tools',
        title: 'Remote access apps',
        category: 'security',
        status: 'warn',
        detail:
          'A remote access app is running on this computer. If you didn’t set it up yourself, or someone you don’t know asked you to install it, someone else may be able to control your computer — hang up on any caller and ring us.',
        fixes: platform === 'win32' ? ['open:apps'] : [],
        askUs: true,
        localNote: 'Running now: AnyDesk.',
      }
    : { id: 'remote_tools', title: 'Remote access apps', category: 'security', status: 'ok', detail: 'No other remote access apps are running.', fixes: [] };
}

function macReport(): DeviceReport {
  return {
    collectedAt: iso(12 * 60_000),
    durationMs: 21_300,
    appVersion: '0.1.0',
    device: { manufacturer: 'Apple', model: 'MacBook Air (Mac15,12)', serial: 'C02FK1ZJQ6L4', type: 'laptop', name: 'Janes-MacBook-Air' },
    os: { platform: 'darwin', name: 'macOS Sequoia', version: '15.6', build: '24G84', arch: 'arm64' },
    cpu: { brand: 'Apple M3', cores: 8, threads: 8, speedGhz: 4.05 },
    memory: { totalGb: 16, usedPct: 71 },
    gpus: ['Apple M3'],
    disks: [{ name: 'Macintosh HD', type: 'NVMe', sizeGb: 494.4, freeGb: 301.2, health: 'ok' }],
    physicalDisks: [{ name: 'APPLE SSD AP0512Z', type: 'NVMe', sizeGb: 500.3, health: 'ok', healthText: 'Verified' }],
    battery: { healthPct: 97, cycles: 88, charging: true, percent: 81, condition: 'Normal' },
    uptimeHours: 52,
    checks: [
      { id: 'updates', title: 'macOS updates', category: 'updates', status: 'warn', detail: '1 update available (macOS Sequoia 15.7). Your Mac will need to restart to install it.', fixes: ['open:updates'] },
      { id: 'antivirus', title: 'Built-in malware protection', category: 'security', status: 'ok', detail: 'Gatekeeper and XProtect are protecting your Mac. XProtect version 5317.', fixes: ['open:security'] },
      { id: 'encryption', title: 'FileVault disk encryption', category: 'security', status: 'ok', detail: 'Your files are encrypted if your Mac is lost or stolen.', fixes: ['open:encryption'] },
      { id: 'firewall', title: 'Firewall', category: 'security', status: 'warn', detail: 'The macOS firewall is off. Turning it on adds protection on public Wi-Fi.', fixes: ['open:firewall'] },
      remoteToolsCheck('darwin'),
      { id: 'backup', title: 'Backup', category: 'backup', status: 'ok', detail: 'Time Machine last backed up your Mac yesterday.', fixes: ['open:backup'] },
      { id: 'disk-space:Macintosh HD', title: 'Free space on Macintosh HD', category: 'storage', status: 'ok', detail: '301 GB free of 494 GB (61%).', fixes: ['open:storage'] },
      { id: 'disk-health', title: 'Disk health', category: 'storage', status: 'ok', detail: 'Your disk reports no problems.', fixes: [] },
      { id: 'battery', title: 'Battery health', category: 'battery', status: 'ok', detail: 'Holds 97% of its original charge. 88 charge cycles.', fixes: ['open:battery'] },
      { id: 'memory', title: 'Memory (RAM)', category: 'memory', status: 'ok', detail: '16 GB of memory installed.', fixes: [] },
      { id: 'uptime', title: 'Time since last restart', category: 'performance', status: 'ok', detail: 'Restarted 2 days ago.', fixes: [] },
      {
        id: 'crashes',
        title: 'Crashes in the last 30 days',
        category: 'performance',
        status: 'ok',
        detail: '3 app crashes and 0 unexpected restarts in the last 30 days.',
        fixes: [],
        localNote: 'Most crashes: Microsoft Word (2), Safari (1).',
      },
    ],
    local: {
      remoteTools: scam ? ['AnyDesk'] : [],
      stability: { appCrashes: 3, unexpectedShutdowns: 0, apps: [{ name: 'Microsoft Word', count: 2 }, { name: 'Safari', count: 1 }] },
    },
  };
}

/* A month of daily checks for the health summary. */
function mockHistory(): HistoryEntry[] {
  const base = report ?? winReport();
  const out: HistoryEntry[] = [];
  for (let d = 29; d >= 0; d--) {
    if (d % 6 === 4) continue; // computer off some days
    const at = iso(d * D + 3 * H);
    const checks = base.checks.map((c) => {
      let status: Status = c.status;
      if (c.id === 'temp-files') status = d > 12 ? 'warn' : 'ok';
      if (c.id === 'updates') status = d > 20 && d < 26 ? 'warn' : c.status;
      if (c.id.startsWith('disk-space')) status = d > 18 ? 'ok' : c.status;
      return { id: c.id, title: c.title, status };
    });
    const main = base.disks[0];
    out.push({ at, checks, mainDisk: main ? { name: main.name, freeGb: Math.round((main.freeGb + d * 1.3) * 10) / 10, sizeGb: main.sizeGb } : null });
  }
  return out;
}

/* A stand-in "screen" for the screenshot preview. */
function fakeScreenshot(): ScreenshotResult {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 1000;
  const g = c.getContext('2d');
  if (!g) return { ok: false, message: 'We couldn’t take a screenshot on this computer.' };
  const grad = g.createLinearGradient(0, 0, 1600, 1000);
  grad.addColorStop(0, '#1d4f91');
  grad.addColorStop(1, '#5b9bd5');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1600, 1000);
  g.fillStyle = '#f3f3f3';
  g.fillRect(380, 260, 840, 420);
  g.fillStyle = '#c42b1c';
  g.fillRect(380, 260, 840, 54);
  g.fillStyle = '#111';
  g.font = '600 40px sans-serif';
  g.fillText('Printer error 0x00000709', 430, 420);
  g.font = '28px sans-serif';
  g.fillText('The operation could not be completed.', 430, 480);
  g.fillStyle = '#202020';
  g.fillRect(0, 950, 1600, 50);
  const dataUrl = c.toDataURL('image/jpeg', 0.8);
  return { ok: true, id: 'mockshot', dataUrl, bytes: Math.round((dataUrl.length * 3) / 4), width: 1600, height: 1000 };
}

const summary: SummaryResponse = {
  jobs: [
    { id: 301, ref: 'PCW-4821', title: 'Lenovo ThinkPad — new battery', status: 'awaiting_parts', updatedAt: iso(5 * H) },
    { id: 297, ref: 'PCW-4790', title: 'Desktop health check & clean', status: 'ready_for_collection', updatedAt: iso(2 * D) },
  ],
  invoices: [
    { id: 88, number: 'INV-10442', total: 89.99, balance: 89.99, status: 'unpaid', dueDate: new Date(now + 9 * D).toISOString() },
    { id: 81, number: 'INV-10391', total: 45, balance: 0, status: 'paid', dueDate: iso(30 * D) },
  ],
  tickets: [
    { id: 55, ref: 'T-1187', subject: 'Printer not connecting after update', status: 'open', updatedAt: iso(26 * H) },
    { id: 49, ref: 'T-1150', subject: 'Email set-up on new laptop', status: 'resolved', updatedAt: iso(12 * D) },
  ],
  remoteRequest: scenario === 'mac' ? { id: 7, status: 'scheduled', scheduledFor: new Date(now + 2 * D).toISOString() } : null,
};

let state: AppState = {
  mode: scenario === 'signin' ? 'signin' : scenario === 'guest' ? 'guest' : 'linked',
  account: scenario === 'signin' || scenario === 'guest' ? null : account,
  appVersion: '0.1.0',
  platform: mac ? 'darwin' : 'win32',
  notice: null,
  tokenNotSaved: false,
};

const report: DeviceReport | null = scenario === 'checking' ? null : mac ? macReport() : winReport();
let settings: Settings = {
  launchAtLogin: q.get('launch') !== 'ask',
  launchAtLoginAvailable: true,
  launchAtLoginAsked: q.get('launch') !== 'ask',
  repairNotifications: true,
};
const callMode = q.get('call') ?? 'no';
const listeners = new Set<(e: AppEvent) => void>();
const emit = (e: AppEvent) => listeners.forEach((l) => l(e));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const update: UpdateState = scenario === 'mac' ? { state: 'available', version: '0.2.0', manual: true } : { state: 'none', checkedAt: iso(2 * H) };

const bridge: CareBridge = {
  getState: async () => state,
  link: async (code) => {
    await wait(500);
    if (code.toUpperCase() !== 'DEMO1234') {
      return { ok: false, error: { code: 'bad_code', message: "That code didn't work. Check it and try again — it's the code you use to sign in at customer.pcwhub.co.uk." } };
    }
    state = { ...state, mode: 'linked', account, notice: null };
    return { ok: true, data: state };
  },
  useWithoutSigningIn: async () => (state = { ...state, mode: 'guest', account: null }),
  showSignIn: async () => (state = { ...state, mode: 'signin' }),
  unlink: async () => {
    await wait(400);
    state = { ...state, mode: 'signin', account: null, notice: 'This computer has been unlinked from your account.' };
    return { ok: true, data: state };
  },
  getReport: async () => ({ report, progress: { running: scenario === 'checking', startedAt: scenario === 'checking' ? iso(3000) : null } }),
  runCheck: async () => {
    emit({ type: 'check', progress: { running: true, startedAt: new Date().toISOString() }, report });
    await wait(1500);
    const r = report ?? winReport();
    emit({ type: 'check', progress: { running: false, startedAt: null }, report: r });
    return r;
  },
  runFix: async (_id, fix) => {
    await wait(300);
    if (fix === 'clean-temp') return { ok: true, message: 'Freed 3.6 GB.', cleaned: { freedBytes: 3.6 * 1024 ** 3, deletedFiles: 1832, skippedFiles: 14 } };
    return { ok: true };
  },
  getSummary: async () => {
    await wait(250);
    return state.mode === 'linked' ? { ok: true, data: summary } : { ok: false, error: { code: 'not_linked', message: 'Sign in first.' } };
  },
  refreshAccount: async () => ({ ok: true, data: account }),
  createTicket: async (input) => {
    await wait(500);
    if (input.screenshotId && q.get('shot') === 'bad') {
      return { ok: false, error: { code: 'bad_screenshot', status: 400, message: "We couldn't attach that screenshot. Remove it and try again, or send your ticket without it." } };
    }
    return { ok: true, data: { ticket: { id: 61, ref: 'T-1203' }, ...(input.screenshotId ? { attachmentId: 4 } : {}) } };
  },
  captureScreenshot: async () => {
    await wait(600);
    return fakeScreenshot();
  },
  discardScreenshot: async () => undefined,
  getCallStatus: async (): Promise<CallStatus> => {
    await wait(200);
    if (state.mode !== 'linked' || callMode === 'off') return { state: 'unavailable' };
    if (callMode === 'yes') return { state: 'calling', staffName: 'Ethan', expiresAt: new Date(Date.now() + 8 * 60_000).toISOString() };
    if (callMode === 'error') return { state: 'error', message: "We can't reach PC Workshop right now." };
    return { state: 'not_calling' };
  },
  getHistory: async () => mockHistory(),
  requestRemoteSupport: async () => {
    await wait(500);
    return { ok: true, data: { request: { id: 9, status: 'requested' }, ticket: { id: 62, ref: 'T-1204' } } };
  },
  getConnectStatus: async (withId) => {
    await wait(withId ? 400 : 50);
    const c = q.get('connect');
    if (c === 'missing') return { supported: true, installed: false, id: null, idDisplay: null };
    if (c === 'noid' || !withId) return { supported: true, installed: true, id: null, idDisplay: null };
    return { supported: true, installed: true, id: '123456789', idDisplay: '123 456 789' };
  },
  openConnect: async () => true,
  open: async () => undefined,
  copyText: async (t) => {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
  },
  getSettings: async () => settings,
  setLaunchAtLogin: async (on) => (settings = { ...settings, launchAtLogin: on, launchAtLoginAsked: true }),
  setRepairNotifications: async (on) => (settings = { ...settings, repairNotifications: on }),
  getUpdateState: async () => update,
  checkForUpdates: async () => update,
  installUpdate: async () => undefined,
  onEvent: (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

(window as unknown as { pcwCare: CareBridge }).pcwCare = bridge;
