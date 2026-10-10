// CI helper: turns snapshot.json into one GitHub notice annotation, so the
// real Windows/macOS readings can be seen on the run's summary page (and via
// the checks API) without downloading logs or artifacts.
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'snapshot.json';
const raw = JSON.parse(readFileSync(file, 'utf8'));
const s = raw.snapshot || raw; // collect-cli --full wraps it

const lines = [];
const os = s.os || {};
const dev = s.device || {};
lines.push(`${os.name || os.platform} ${os.version || ''} (build ${os.build || '?'}, ${os.arch || '?'})`);
lines.push(`Device: ${dev.manufacturer || '?'} ${dev.model || '?'} · type ${dev.type || '?'} · serial ${dev.serial ? 'present' : 'missing'}`);
lines.push(`CPU: ${s.cpu?.brand || '?'} ${s.cpu?.cores ?? '?'}c/${s.cpu?.threads ?? '?'}t · RAM ${s.memory?.totalGb ?? '?'} GB · uptime ${s.uptimeHours ?? '?'} h`);
for (const d of s.disks || []) lines.push(`Disk ${d.name}: ${d.type} ${d.freeGb}/${d.sizeGb} GB free, health ${d.health}`);
lines.push(`Battery: ${s.battery ? JSON.stringify(s.battery) : 'none'}`);
for (const c of s.checks || []) lines.push(`[${c.status}] ${c.id}: ${c.detail}`);

const esc = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const title = `Snapshot ${process.env.RUNNER_OS || ''}`.trim();
console.log(`::notice title=${esc(title).replace(/[:,]/g, ' ')}::${esc(lines.join('\n'))}`);
