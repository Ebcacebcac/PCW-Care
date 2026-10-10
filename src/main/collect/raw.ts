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

export interface RawWindows {
  info: RawWindowsInfo | null;
  security: RawWindowsSecurity | null;
  updates: RawWindowsUpdates | null;
  startupCount: number | null;
  temp: RawTemp | null;
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
}

export interface RawCollection {
  common: RawCommon;
  windows: RawWindows | null;
  mac: RawMac | null;
}
