/* Windows-specific facts. Each probe is a constant PowerShell script (no
   input is ever spliced in) with its own timeout, run in parallel. Every
   section is wrapped in try/catch inside the script, so one failing cmdlet
   only blanks its own field. */

import type {
  RawWindows,
  RawWindows11,
  RawWindowsBackup,
  RawWindowsBitLocker,
  RawWindowsInfo,
  RawWindowsSecurity,
  RawWindowsStability,
  RawWindowsUpdates,
} from './raw';
import { runPowerShellJson } from './exec';
import { scanTemp } from '../tempFiles';

export const PS_INFO = `
$o=[ordered]@{}
try { $cv=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
  $o.displayVersion=[string]$cv.DisplayVersion
  if (-not $o.displayVersion) { $o.displayVersion=[string]$cv.ReleaseId }
  $o.productName=[string]$cv.ProductName; $o.currentBuild=[string]$cv.CurrentBuild; $o.ubr=[string]$cv.UBR } catch {}
try { $o.caption=[string](Get-CimInstance -ClassName Win32_OperatingSystem).Caption } catch {}
try { $o.drives=@(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
  [ordered]@{ id=[string]$_.DeviceID; size=[double]$_.Size; free=[double]$_.FreeSpace; label=[string]$_.VolumeName } }) } catch { $o.drives=$null }
try { $o.physical=@(Get-PhysicalDisk | ForEach-Object {
  [ordered]@{ number=[string]$_.DeviceId; name=[string]$_.FriendlyName; mediaType=[string]$_.MediaType; busType=[string]$_.BusType; health=[string]$_.HealthStatus; size=[double]$_.Size } }) } catch { $o.physical=$null }
try { $o.partitions=@(Get-Partition | Where-Object { [string]$_.DriveLetter -match '^[A-Za-z]$' } | ForEach-Object {
  [ordered]@{ letter=[string]$_.DriveLetter; disk=[string]$_.DiskNumber } }) } catch { $o.partitions=$null }
$o | ConvertTo-Json -Depth 5 -Compress
`;

export const PS_SECURITY = `
$o=[ordered]@{}
try { $o.av=@(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntiVirusProduct | ForEach-Object {
  [ordered]@{ name=[string]$_.displayName; state=[double]$_.productState } }) } catch { $o.av=$null }
try { $o.fwProducts=@(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName FirewallProduct | ForEach-Object {
  [ordered]@{ name=[string]$_.displayName; state=[double]$_.productState } }) } catch { $o.fwProducts=$null }
try { $m=Get-MpComputerStatus
  $o.defender=[ordered]@{ amServiceEnabled=[bool]$m.AMServiceEnabled; antivirusEnabled=[bool]$m.AntivirusEnabled; realTime=[bool]$m.RealTimeProtectionEnabled; sigAgeDays=[double]$m.AntivirusSignatureAge; mode=[string]$m.AMRunningMode } } catch { $o.defender=$null }
try { $o.firewall=@(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ name=[string]$_.Name; enabled=[string]$_.Enabled } }) } catch { $o.firewall=$null }
$o | ConvertTo-Json -Depth 5 -Compress
`;

/* Windows Update history via the COM API (ResultCode 2/3 = succeeded,
   Operation 1 = install). Defender definition updates arrive daily and
   would make every PC look up to date, so they're skipped. Get-HotFix is a
   fallback. IUpdateHistoryEntry.Date is already UTC. */
export const PS_UPDATES = `
$o=[ordered]@{ lastHistoryDate=$null; lastHotfixDate=$null; rebootPending=$null; historyError=$null }
try {
  $s=New-Object -ComObject Microsoft.Update.Session
  $h=$s.CreateUpdateSearcher()
  $n=$h.GetTotalHistoryCount()
  $best=$null
  if ($n -gt 0) {
    foreach ($e in $h.QueryHistory(0, [Math]::Min($n, 300))) {
      if (($e.ResultCode -ne 2) -and ($e.ResultCode -ne 3)) { continue }
      if ($e.Operation -ne 1) { continue }
      $t=[string]$e.Title
      if ($t -match 'Security Intelligence|Definition Update|Defender Antivirus|antimalware platform|Malicious Software Removal') { continue }
      if (($best -eq $null) -or ($e.Date -gt $best)) { $best=$e.Date }
    }
  }
  if ($best -ne $null) { $o.lastHistoryDate=$best.ToString('s', [Globalization.CultureInfo]::InvariantCulture) + 'Z' }
} catch { $o.historyError=[string]$_.Exception.Message }
try { $hf=Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
  if ($hf) { $o.lastHotfixDate=([datetime]$hf.InstalledOn).ToUniversalTime().ToString('s', [Globalization.CultureInfo]::InvariantCulture) + 'Z' } } catch {}
try { $o.rebootPending = [bool]((Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')) } catch {}
$o | ConvertTo-Json -Compress
`;

export const PS_STARTUP = `
$c=$null
try { $c=@(Get-CimInstance -ClassName Win32_StartupCommand).Count } catch {}
[ordered]@{ count=$c } | ConvertTo-Json -Compress
`;

/* 0.2: backup signals for this user — OneDrive folders and where the
   Documents/Desktop/Pictures folders point (Known Folder Move), File
   History's configuration and last backup time, and whether the Windows 7
   style Backup and Restore has a valid configuration. All readable without
   admin; paths are only compared on this computer. */
export const PS_BACKUP = `
$o=[ordered]@{ oneDriveFolders=@(); oneDriveAccount=$false; shellFolders=$null; fileHistoryConfigured=$null; fileHistoryLast=$null; legacyBackupConfigured=$null }
$f=New-Object System.Collections.Generic.List[string]
foreach ($v in @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial)) { if ($v) { $f.Add([string]$v) } }
try { Get-ChildItem 'HKCU:\\Software\\Microsoft\\OneDrive\\Accounts' | ForEach-Object {
  $p=Get-ItemProperty -LiteralPath $_.PSPath
  if ($p.UserFolder) { $f.Add([string]$p.UserFolder); $o.oneDriveAccount=$true } elseif ($p.UserEmail) { $o.oneDriveAccount=$true } } } catch {}
$o.oneDriveFolders=@($f | Select-Object -Unique)
try { $u=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'
  $o.shellFolders=[ordered]@{ documents=[Environment]::ExpandEnvironmentVariables([string]$u.Personal); desktop=[Environment]::ExpandEnvironmentVariables([string]$u.Desktop); pictures=[Environment]::ExpandEnvironmentVariables([string]$u.'My Pictures') } } catch {}
try { $o.fileHistoryConfigured=[bool](Test-Path (Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\FileHistory\\Configuration\\Config1.xml')) } catch {}
try { $fh=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\FileHistory'
  if ($fh.ProtectedUpToTime) { $o.fileHistoryLast=[DateTime]::FromFileTimeUtc([int64]$fh.ProtectedUpToTime).ToString('s', [Globalization.CultureInfo]::InvariantCulture) + 'Z' } } catch {}
try { $o.legacyBackupConfigured=[bool](Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsBackup\\ValidConfig') } catch {}
$o | ConvertTo-Json -Depth 5 -Compress
`;

/* 0.2: Windows 11 readiness without admin — Secure Boot from the
   registry, the TPM from tpmtool (standard users may run it) and Windows
   Update's own compatibility verdict (TargetVersionUpgradeExperienceIndicators). */
export const PS_WIN11 = `
$o=[ordered]@{ tpmPresent=$null; tpmVersion=$null; secureBoot=$null; upgEx=$null; redReason=$null }
try { $sb=Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State'
  if ($sb.UEFISecureBootEnabled -ne $null) { $o.secureBoot=[bool]($sb.UEFISecureBootEnabled -eq 1) } } catch {}
try { $ErrorActionPreference='Continue'
  $t=& (Join-Path $env:SystemRoot 'System32\\tpmtool.exe') getdeviceinformation 2>$null
  foreach ($l in @($t)) { $s=[string]$l
    if ($s -match 'TPM Present:\\s*(\\w+)') { $o.tpmPresent=($Matches[1] -eq 'True') }
    if ($s -match 'TPM Version:\\s*([0-9.]+)') { $o.tpmVersion=$Matches[1] } } } catch {} finally { $ErrorActionPreference='Stop' }
try { $red=$null; $green=$null
  Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\TargetVersionUpgradeExperienceIndicators' | ForEach-Object {
    $p=Get-ItemProperty -LiteralPath $_.PSPath
    if ([string]$p.UpgEx -eq 'Red' -and -not $red) { $red=$p } elseif ([string]$p.UpgEx -eq 'Green' -and -not $green) { $green=$p } }
  if ($red) { $o.upgEx='Red'; $o.redReason=[string]$red.RedReason } elseif ($green) { $o.upgEx='Green' } } catch {}
$o | ConvertTo-Json -Compress
`;

/* 0.2: crashes and unexpected shutdowns in the last 30 days from the
   Application and System logs (both readable by standard users). The app
   names never leave the computer. */
export const PS_STABILITY = `
$o=[ordered]@{ appCrashes=$null; appHangs=$null; unexpected41=$null; unexpected6008=$null; apps=$null }
$since=(Get-Date).AddDays(-30)
$names=@{}
try { $e=@(Get-WinEvent -FilterHashtable @{ LogName='Application'; ProviderName='Application Error'; Id=1000; StartTime=$since } -MaxEvents 2000)
  $o.appCrashes=$e.Count
  foreach ($x in $e) { $n=[string]$x.Properties[0].Value; if ($n) { $names[$n]=1+[int]$names[$n] } } } catch { if ($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') { $o.appCrashes=0 } }
try { $e=@(Get-WinEvent -FilterHashtable @{ LogName='Application'; ProviderName='Application Hang'; Id=1002; StartTime=$since } -MaxEvents 2000)
  $o.appHangs=$e.Count
  foreach ($x in $e) { $n=[string]$x.Properties[0].Value; if ($n) { $names[$n]=1+[int]$names[$n] } } } catch { if ($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') { $o.appHangs=0 } }
try { $o.unexpected41=@(Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=41; StartTime=$since } -MaxEvents 500).Count } catch { if ($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') { $o.unexpected41=0 } }
try { $o.unexpected6008=@(Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='EventLog'; Id=6008; StartTime=$since } -MaxEvents 500).Count } catch { if ($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') { $o.unexpected6008=0 } }
$o.apps=@($names.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | ForEach-Object { [ordered]@{ name=[string]$_.Key; count=[int]$_.Value } })
$o | ConvertTo-Json -Depth 5 -Compress
`;

/* 0.2: BitLocker state of the system drive via the Shell property
   System.Volume.BitLockerProtection — manage-bde and Get-BitLockerVolume
   need admin, this doesn't. */
export const PS_BITLOCKER = `
$o=[ordered]@{ protection=$null }
try { $sh=New-Object -ComObject Shell.Application
  $v=$sh.NameSpace($env:SystemDrive + '\\').Self.ExtendedProperty('System.Volume.BitLockerProtection')
  if ($v -ne $null -and [string]$v -ne '') { $o.protection=[int]$v } } catch {}
$o | ConvertTo-Json -Compress
`;

/* 0.2: names of running processes (no paths, no command lines). Used on
   this computer only: to spot remote access apps and whether OneDrive is
   running. Never sent. */
export const PS_PROCESSES = `
$o=[ordered]@{ names=$null }
try { $o.names=@(Get-Process | ForEach-Object { [string]$_.ProcessName } | Sort-Object -Unique) } catch {}
$o | ConvertTo-Json -Compress
`;

export async function collectWindows(): Promise<RawWindows> {
  const [info, security, updates, startup, temp, backup, win11, stability, bitlocker, procs] = await Promise.all([
    runPowerShellJson<RawWindowsInfo>(PS_INFO, 45_000),
    runPowerShellJson<RawWindowsSecurity>(PS_SECURITY, 45_000),
    runPowerShellJson<RawWindowsUpdates>(PS_UPDATES, 75_000),
    runPowerShellJson<{ count: number | null }>(PS_STARTUP, 30_000),
    scanTemp().catch(() => null),
    runPowerShellJson<RawWindowsBackup>(PS_BACKUP, 30_000),
    runPowerShellJson<RawWindows11>(PS_WIN11, 30_000),
    runPowerShellJson<RawWindowsStability>(PS_STABILITY, 45_000),
    runPowerShellJson<RawWindowsBitLocker>(PS_BITLOCKER, 20_000),
    runPowerShellJson<{ names: string[] | string | null }>(PS_PROCESSES, 20_000),
  ]);
  return {
    info,
    security,
    updates,
    startupCount: startup && typeof startup.count === 'number' ? startup.count : null,
    temp,
    backup,
    win11,
    stability,
    bitlocker,
    processes: processNames(procs?.names),
  };
}

/* ConvertTo-Json turns a one-item array into a bare string. */
export function processNames(v: unknown): string[] | null {
  if (typeof v === 'string') return v ? [v] : [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return null;
}
