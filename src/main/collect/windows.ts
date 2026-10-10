/* Windows-specific facts. Each probe is a constant PowerShell script (no
   input is ever spliced in) with its own timeout, run in parallel. Every
   section is wrapped in try/catch inside the script, so one failing cmdlet
   only blanks its own field. */

import type { RawWindows, RawWindowsInfo, RawWindowsSecurity, RawWindowsUpdates } from './raw';
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

export async function collectWindows(): Promise<RawWindows> {
  const [info, security, updates, startup, temp] = await Promise.all([
    runPowerShellJson<RawWindowsInfo>(PS_INFO, 45_000),
    runPowerShellJson<RawWindowsSecurity>(PS_SECURITY, 45_000),
    runPowerShellJson<RawWindowsUpdates>(PS_UPDATES, 75_000),
    runPowerShellJson<{ count: number | null }>(PS_STARTUP, 30_000),
    scanTemp().catch(() => null),
  ]);
  return {
    info,
    security,
    updates,
    startupCount: startup && typeof startup.count === 'number' ? startup.count : null,
    temp,
  };
}
