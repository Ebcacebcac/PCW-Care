/* DEV ONLY — a fake window.pcwCare so the renderer can run in a plain
   browser (`npm run dev:renderer`) for design work and screenshots. Never
   included in production builds (see main.tsx).

   URL options: ?scenario=signin|guest|linked|healthy|checking|desktop|mac|maintenance
                &page=home|device|checks|help|account|settings */

import type { AppEvent, AppState, CareBridge, DeviceReport, MeResponse, SummaryResponse, UpdateState } from '../../shared/types';

const q = new URLSearchParams(location.search);
const scenario = q.get('scenario') ?? 'linked';
const mac = scenario === 'mac';
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const H = 3600_000;
const D = 24 * H;

const account: MeResponse = {
  client: { firstName: 'Jane', lastName: 'Robson', company: null, email: 'jane.robson@example.co.uk' },
  device: { id: 12, name: mac ? 'Janes-MacBook-Air' : 'JANE-LAPTOP' },
  flags: { maintenance: scenario === 'maintenance' || scenario === 'mac' },
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
    os: { platform: 'win32', name: 'Windows 11 Home', version: '24H2', build: '26100.2314', arch: 'x64' },
    cpu: { brand: 'Intel Core i5-1245U', cores: 10, threads: 12, speedGhz: 1.6 },
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
      { id: 'antivirus', title: 'Virus protection', category: 'security', status: 'ok', detail: 'Protected by Microsoft Defender Antivirus.', fixes: ['open:security'] },
      { id: 'firewall', title: 'Firewall', category: 'security', status: 'ok', detail: 'Windows Firewall is on for all networks.', fixes: ['open:firewall'] },
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
    ],
  };
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
      { id: 'disk-space:Macintosh HD', title: 'Free space on Macintosh HD', category: 'storage', status: 'ok', detail: '301 GB free of 494 GB (61%).', fixes: ['open:storage'] },
      { id: 'disk-health', title: 'Disk health', category: 'storage', status: 'ok', detail: 'Your disk reports no problems.', fixes: [] },
      { id: 'battery', title: 'Battery health', category: 'battery', status: 'ok', detail: 'Holds 97% of its original charge. 88 charge cycles.', fixes: ['open:battery'] },
      { id: 'memory', title: 'Memory (RAM)', category: 'memory', status: 'ok', detail: '16 GB of memory installed.', fixes: [] },
      { id: 'uptime', title: 'Time since last restart', category: 'performance', status: 'ok', detail: 'Restarted 2 days ago.', fixes: [] },
    ],
  };
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
  createTicket: async () => {
    await wait(500);
    return { ok: true, data: { ticket: { id: 61, ref: 'T-1203' } } };
  },
  requestRemoteSupport: async () => {
    await wait(500);
    return { ok: true, data: { request: { id: 9, status: 'requested' }, ticket: { id: 62, ref: 'T-1204' } } };
  },
  open: async () => undefined,
  copyText: async (t) => {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
  },
  getSettings: async () => ({ launchAtLogin: true, launchAtLoginAvailable: true }),
  setLaunchAtLogin: async (on) => ({ launchAtLogin: on, launchAtLoginAvailable: true }),
  getUpdateState: async () => update,
  checkForUpdates: async () => update,
  installUpdate: async () => undefined,
  onEvent: (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

(window as unknown as { pcwCare: CareBridge }).pcwCare = bridge;
