/* What the collectors gather, before any judgement is made. Every field can
   be null: null means "couldn't find out", which the evaluators turn into an
   "unknown" result. */

export interface RawCommon {
  platform: string;
  arch: string;
  hostname: string;
  system: { manufacturer: string; model: string; version: string; serial: string } | null;
  chassisType: string | null;
  os: { distro: string; release: string; build: string; codename: string; arch: string } | null;
  cpu: { brand: string; manufacturer: string; physicalCores: number; cores: number; speed: number } | null;
  mem: { total: number; available: number } | null;
  gpus: string[] | null;
  fs: { fs: string; mount: string; type: string; size: number; available: number }[] | null;
  diskLayout: { name: string; type: string; interfaceType: string; size: number; smartStatus: string }[] | null;
  battery: {
    hasBattery: boolean;
    cycleCount: number;
    isCharging: boolean;
    designedCapacity: number;
    maxCapacity: number;
    percent: number;
    capacityUnit: string;
  } | null;
  uptimeSec: number | null;
}

export interface RawWindowsInfo {
  displayVersion?: string;
  productName?: string;
  caption?: string;
  currentBuild?: string;
  ubr?: string;
  drives?: { id: string; size: number; free: number; label: string }[] | null;
  physical?: { number: string; name: string; mediaType: string; busType: string; health: string; size: number }[] | null;
  partitions?: { letter: string; disk: string }[] | null;
}

export interface RawWindowsSecurity {
  av?: { name: string; state: number }[] | null;
  fwProducts?: { name: string; state: number }[] | null;
  defender?: {
    amServiceEnabled: boolean;
    antivirusEnabled: boolean;
    realTime: boolean;
    sigAgeDays: number;
    mode: string;
  } | null;
  firewall?: { name: string; enabled: string }[] | null;
}

export interface RawWindowsUpdates {
  lastHistoryDate?: string | null;
  lastHotfixDate?: string | null;
  rebootPending?: boolean | null;
  historyError?: string | null;
}

export interface RawTemp {
  dir: string;
  totalBytes: number;
  clearableBytes: number;
  files: number;
  truncated: boolean;
}

/* 0.2 — backup signals a standard user can read. Paths are only compared
   locally (never sent). */
export interface RawWindowsBackup {
  /* OneDrive sync folders (env vars + HKCU\Software\Microsoft\OneDrive\Accounts\*\UserFolder). */
  oneDriveFolders?: string[] | null;
  /* An OneDrive account is signed in (Accounts\* has a UserEmail or UserFolder). */
  oneDriveAccount?: boolean | null;
  /* Where Documents / Desktop / Pictures really are (User Shell Folders). */
  shellFolders?: { documents?: string | null; desktop?: string | null; pictures?: string | null } | null;
  /* File History: configured for this user, and the last time it protected files (ISO). */
  fileHistoryConfigured?: boolean | null;
  fileHistoryLast?: string | null;
  /* Windows 7-style "Backup and Restore" has a valid configuration. */
  legacyBackupConfigured?: boolean | null;
}

/* 0.2 — Windows 11 readiness signals (no admin). */
export interface RawWindows11 {
  tpmPresent?: boolean | null;
  tpmVersion?: string | null;
  secureBoot?: boolean | null;
  /* Windows Update's own appraiser verdict, if it has run: "Green"/"Red"/… */
  upgEx?: string | null;
  redReason?: string | null;
}

/* 0.2 — event log counts for the last 30 days. App names stay local. */
export interface RawWindowsStability {
  appCrashes?: number | null;
  appHangs?: number | null;
  unexpected41?: number | null;
  unexpected6008?: number | null;
  apps?: { name: string; count: number }[] | null;
}

/* 0.2 — BitLocker via the Shell's System.Volume.BitLockerProtection
   property on C: (readable without admin). null = couldn't tell. */
export interface RawWindowsBitLocker {
  protection?: number | null;
}

export interface RawWindows {
  info: RawWindowsInfo | null;
  security: RawWindowsSecurity | null;
  updates: RawWindowsUpdates | null;
  startupCount: number | null;
  temp: RawTemp | null;
  /* 0.2 additions — optional so older recorded inputs still type-check. */
  backup?: RawWindowsBackup | null;
  win11?: RawWindows11 | null;
  stability?: RawWindowsStability | null;
  bitlocker?: RawWindowsBitLocker | null;
  /* Running process names (local only — matched against remote access apps). */
  processes?: string[] | null;
}

export interface MacUpdateItem {
  label: string;
  title: string;
  recommended: boolean;
  restart: boolean;
}

export interface RawMac {
  hardware: { machineName: string; machineModel: string; chip: string; serial: string } | null;
  softwareUpdate: { updates: MacUpdateItem[]; cached: boolean } | null;
  gatekeeper: boolean | null;
  xprotectVersion: string | null;
  fileVault: 'on' | 'off' | 'encrypting' | 'decrypting' | null;
  firewall: boolean | null;
  smart: string | null;
  volumeName: string | null;
  power: { cycles: number | null; condition: string | null; maxCapacityPct: number | null; percent: number | null; charging: boolean | null } | null;
  /* 0.2 additions */
  timeMachine?: RawTimeMachine | null;
  /* ~/Library/Mobile Documents/com~apple~CloudDocs/{Desktop,Documents} exist. */
  iCloudDesktopDocuments?: boolean | null;
  stability?: RawMacStability | null;
  /* Running executables, full paths (local only). */
  processes?: string[] | null;
}

export interface RawTimeMachine {
  /* At least one destination is set up (tmutil destinationinfo). */
  configured: boolean | null;
  /* Automatic backups are on (com.apple.TimeMachine AutoBackup). */
  autoBackup: boolean | null;
  /* The latest completed backup (ISO), when it could be read. */
  latest: string | null;
}

export interface RawMacStability {
  appCrashes: number;
  panics: number;
  apps: { name: string; count: number }[];
}

export interface RawCollection {
  common: RawCommon;
  windows: RawWindows | null;
  mac: RawMac | null;
}
