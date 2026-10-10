import type { DeviceReport } from './types';

/* A short plain-text summary for support tickets and "Copy details". */
export function deviceSummaryText(r: DeviceReport): string {
  const lines: string[] = [];
  const d = r.device;
  lines.push(`Computer: ${[d.manufacturer, d.model].filter(Boolean).join(' ') || 'Unknown'}${d.name ? ` ("${d.name}")` : ''}`);
  if (d.serial) lines.push(`Serial: ${d.serial}`);
  lines.push(`System: ${[r.os.name, r.os.version, r.os.build ? `build ${r.os.build}` : '', r.os.arch].filter(Boolean).join(' ')}`);
  if (r.cpu.brand) lines.push(`Processor: ${r.cpu.brand}${r.cpu.cores ? ` (${r.cpu.cores} cores${r.cpu.threads ? `, ${r.cpu.threads} threads` : ''})` : ''}`);
  if (r.memory.totalGb) lines.push(`Memory: ${r.memory.totalGb} GB`);
  if (r.gpus.length) lines.push(`Graphics: ${r.gpus.join(', ')}`);
  for (const v of r.disks) lines.push(`Disk ${v.name}: ${v.type}, ${v.freeGb} GB free of ${v.sizeGb} GB, health ${v.health}`);
  if (r.battery) {
    lines.push(`Battery: ${r.battery.healthPct != null ? `${r.battery.healthPct}% health` : 'health unknown'}${r.battery.cycles != null ? `, ${r.battery.cycles} cycles` : ''}`);
  }
  if (r.uptimeHours != null) lines.push(`Up for: ${Math.round(r.uptimeHours)} hours`);
  const failing = r.checks.filter((c) => c.status === 'warn' || c.status === 'bad');
  if (failing.length) {
    lines.push('Needs attention:');
    for (const c of failing) lines.push(`- [${c.status}] ${c.title}: ${c.detail}`);
  } else {
    lines.push('All checks OK.');
  }
  lines.push(`Checked: ${r.collectedAt} (PCW Care ${r.appVersion})`);
  return lines.join('\n');
}
