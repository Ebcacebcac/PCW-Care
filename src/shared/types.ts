/* Types shared by the main process, the preload bridge and the renderer.
   Nothing in here may import Node or Electron — the renderer uses it too. */

export type Status = 'ok' | 'warn' | 'bad' | 'unknown';

export type CheckCategory = 'storage' | 'memory' | 'battery' | 'updates' | 'security' | 'performance';

/* A fix the app can perform. The renderer only ever sends one of these ids
   back; the main process looks up what it means (never a URL or command). */
export type FixId =
  | 'open:updates'
  | 'open:security'
  | 'open:firewall'
  | 'open:encryption'
  | 'open:storage'
  | 'open:startup'
  | 'open:battery'
  | 'restart'
  | 'clean-temp';

export interface CheckResult {
  id: string;
  title: string;
  status: Status;
  detail: string;
  category: CheckCategory;
  fixes: FixId[];
  /* Suggest contacting PC Workshop (e.g. failing disk, worn battery). */
  askUs?: boolean;
}

export type DeviceType = 'laptop' | 'desktop' | 'unknown';
export type DiskType = 'SSD' | 'HDD' | 'NVMe' | 'unknown';

export interface VolumeInfo {
  name: string;
  label?: string;
  type: DiskType;
  sizeGb: number;
  freeGb: number;
  health: Status;
}

export interface PhysicalDiskInfo {
  name: string;
  type: DiskType;
  sizeGb: number;
  health: Status;
  healthText?: string;
}

export interface BatteryInfo {
  healthPct: number | null;
  cycles: number | null;
  charging: boolean | null;
  percent: number | null;
  designCapacity?: number | null;
  fullCapacity?: number | null;
  capacityUnit?: string;
  condition?: string;
}

/* Everything the app knows about the computer after a check. The contract's
   health snapshot is a trimmed copy of this (see main/snapshot.ts). */
export interface DeviceReport {
  collectedAt: string;
  durationMs: number;
  appVersion: string;
  device: {
    manufacturer: string;
    model: string;
    serial: string;
    type: DeviceType;
    name: string;
  };
  os: {
    platform: string;
    name: string;
    version: string;
    build: string;
    arch: string;
  };
  cpu: { brand: string; cores: number | null; threads: number | null; speedGhz: number | null };
  memory: { totalGb: number | null; usedPct: number | null };
  gpus: string[];
  disks: VolumeInfo[];
  physicalDisks: PhysicalDiskInfo[];
  battery: BatteryInfo | null;
  uptimeHours: number | null;
  checks: CheckResult[];
}

/* The health snapshot sent to PC Workshop (POST /report) — API contract v1. */
export interface HealthSnapshot {
  schema: 1;
  collectedAt: string;
  app: { version: string };
  device: { manufacturer: string; model: string; serial: string; type: DeviceType; name: string };
  os: { platform: string; name: string; version: string; build: string; arch: string };
  cpu: { brand: string; cores: number | null; threads: number | null };
  memory: { totalGb: number | null };
  disks: { name: string; type: DiskType; sizeGb: number; freeGb: number; health: Status }[];
  battery: null | { healthPct: number | null; cycles: number | null; charging: boolean | null; percent: number | null };
  uptimeHours: number | null;
  checks: { id: string; title: string; status: Status; detail: string }[];
}

/* ── Customer Hub API (contract v1) ── */

export interface ClientName {
  firstName: string;
  lastName: string;
  company: string | null;
}

export interface MeResponse {
  client: ClientName & { email: string | null };
  device: { id: number; name: string | null };
  flags: { maintenance: boolean };
  hubUrl: string;
}

export interface JobSummary { id: number; ref: string; title: string; status: string; updatedAt: string | null }
export interface InvoiceSummary { id: number; number: string; total: number; balance: number; status: string; dueDate: string | null }
export interface TicketSummary { id: number; ref: string; subject: string; status: string; updatedAt: string | null }
export interface RemoteRequestSummary { id: number; status: string; scheduledFor: string | null }

export interface SummaryResponse {
  jobs: JobSummary[];
  invoices: InvoiceSummary[];
  tickets: TicketSummary[];
  remoteRequest: RemoteRequestSummary | null;
}

export type ApiErrorCode =
  | 'bad_code'
  | 'not_available'
  | 'rate_limited'
  | 'unlinked'
  | 'offline'
  | 'not_maintenance'
  | 'already_requested'
  | 'invalid'
  | 'server'
  | 'not_linked'
  | 'unknown';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  status?: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/* ── App state exposed to the renderer ── */

export type AppMode = 'signin' | 'guest' | 'linked';

export interface AppState {
  mode: AppMode;
  account: MeResponse | null;
  appVersion: string;
  platform: string;
  /* Shown once on the sign-in screen, e.g. after this computer was unlinked. */
  notice: string | null;
  /* safeStorage unavailable: the link only lasts until the app closes. */
  tokenNotSaved: boolean;
}

export interface CheckProgress {
  running: boolean;
  startedAt: string | null;
}

export interface CleanTempResult {
  freedBytes: number;
  deletedFiles: number;
  skippedFiles: number;
}

export type FixOutcome =
  | { ok: true; message?: string; cleaned?: CleanTempResult }
  | { ok: false; cancelled?: boolean; message?: string };

export interface Settings {
  launchAtLogin: boolean;
  launchAtLoginAvailable: boolean;
}

export type UpdateState =
  | { state: 'idle' }
  | { state: 'unsupported'; message: string }
  | { state: 'checking' }
  | { state: 'none'; checkedAt: string }
  | { state: 'available'; version: string; manual: boolean }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export interface TicketInput { subject: string; message: string; includeReport: boolean }
export interface RemoteInput { preferred: 'asap' | 'later'; note: string }

export type ContactTarget = 'phone' | 'email' | 'website' | 'hub' | 'book-in' | 'support-page' | 'release-page';

export type AppEvent =
  | { type: 'state'; state: AppState }
  | { type: 'check'; progress: CheckProgress; report: DeviceReport | null }
  | { type: 'update'; update: UpdateState }
  | { type: 'navigate'; page: PageId; runCheck?: boolean };

export type PageId = 'home' | 'device' | 'checks' | 'help' | 'account' | 'settings';

/* The API the preload exposes as window.pcwCare. */
export interface CareBridge {
  getState(): Promise<AppState>;
  link(code: string): Promise<Result<AppState>>;
  useWithoutSigningIn(): Promise<AppState>;
  showSignIn(): Promise<AppState>;
  unlink(): Promise<Result<AppState>>;

  getReport(): Promise<{ report: DeviceReport | null; progress: CheckProgress }>;
  runCheck(): Promise<DeviceReport>;
  runFix(checkId: string, fix: FixId): Promise<FixOutcome>;

  getSummary(): Promise<Result<SummaryResponse>>;
  refreshAccount(): Promise<Result<MeResponse>>;
  createTicket(input: TicketInput): Promise<Result<{ ticket: { id: number; ref: string } }>>;
  requestRemoteSupport(input: RemoteInput): Promise<Result<{ request: { id: number; status: string }; ticket: { id: number; ref: string } }>>;

  open(target: ContactTarget): Promise<void>;
  copyText(text: string): Promise<void>;

  getSettings(): Promise<Settings>;
  setLaunchAtLogin(on: boolean): Promise<Settings>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  installUpdate(): Promise<void>;

  onEvent(cb: (e: AppEvent) => void): () => void;
}
