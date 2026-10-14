// CI helper: turns snapshot.json into GitHub annotations, so the real
// Windows/macOS readings can be seen on the run's summary page (and via the
// checks API) without downloading logs or artifacts.
//
// - one notice with the whole snapshot;
// - one annotation per 0.2 check (backup, win10_eos, …): a notice for
//   ok/info/unknown, a warning for warn/bad. Readings are facts about the
//   runner, never failures — this script only exits non-zero when the file
//   can't be read (i.e. the self-test itself crashed);
// - a warning if a sent check detail names a remote access or crashed app
//   that should have stayed on the computer (report.local, --full only).
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'snapshot.json';
let raw;
try {
  raw = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.log(`::error title=Snapshot::Could not read ${file}: ${err.message}`);
  process.exit(1);
}
const s = raw.snapshot || raw; // collect-cli --full wraps it
const report = raw.report || null;

const esc = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escTitle = (t) => esc(t).replace(/[:,]/g, ' ');
const runner = process.env.RUNNER_OS || '';

const lines = [];
const os = s.os || {};
const dev = s.device || {};
lines.push(`${os.name || os.platform} ${os.version || ''} (build ${os.build || '?'}, ${os.arch || '?'})`);
lines.push(`Device: ${dev.manufacturer || '?'} ${dev.model || '?'} · type ${dev.type || '?'} · serial ${dev.serial ? 'present' : 'missing'}`);
lines.push(`CPU: ${s.cpu?.brand || '?'} ${s.cpu?.cores ?? '?'}c/${s.cpu?.threads ?? '?'}t · RAM ${s.memory?.totalGb ?? '?'} GB · uptime ${s.uptimeHours ?? '?'} h`);
for (const d of s.disks || []) lines.push(`Disk ${d.name}: ${d.type} ${d.freeGb}/${d.sizeGb} GB free, health ${d.health}`);
lines.push(`Battery: ${s.battery ? JSON.stringify(s.battery) : 'none'}`);
for (const c of s.checks || []) lines.push(`[${c.status}] ${c.id}: ${c.detail}`);
console.log(`::notice title=${escTitle(`Snapshot ${runner}`.trim())}::${esc(lines.join('\n'))}`);

// The 0.2 checks, one annotation each.
const NEW_IDS = ['backup', 'win10_eos', 'win11_ready', 'crashes', 'remote_tools', 'antivirus_expired', 'bitlocker', 'encryption'];
const EXPECTED = {
  win32: ['backup', 'crashes', 'remote_tools', 'antivirus_expired', 'bitlocker'],
  darwin: ['backup', 'crashes', 'remote_tools', 'encryption'],
};
const checks = new Map((s.checks || []).map((c) => [c.id, c]));
for (const id of NEW_IDS) {
  const c = checks.get(id);
  if (!c) continue;
  const level = c.status === 'warn' || c.status === 'bad' ? 'warning' : 'notice';
  console.log(`::${level} title=${escTitle(`${runner} ${id} = ${c.status}`)}::${esc(c.detail)}`);
}
for (const id of EXPECTED[os.platform] || []) {
  if (!checks.has(id)) console.log(`::warning title=${escTitle(`${runner} ${id} missing`)}::The ${id} check did not appear in the snapshot.`);
}

// Local-only names must not be in anything that is sent.
if (report && report.local) {
  const names = [...(report.local.remoteTools || []), ...((report.local.stability && report.local.stability.apps) || []).map((a) => a.name)].filter(
    (n) => typeof n === 'string' && n.length >= 4,
  );
  const sent = JSON.stringify((s.checks || []).map((c) => [c.title, c.detail]));
  const leaked = names.filter((n) => sent.includes(n));
  if (leaked.length) console.log(`::warning title=Privacy::A sent check mentions a local-only app name (${leaked.length} found).`);
  const st = report.local.stability;
  console.log(
    `::notice title=${escTitle(`${runner} local-only details`)}::${esc(
      `remote tools seen: ${(report.local.remoteTools || []).length} · crashes ${st ? st.appCrashes : '?'} · unexpected shutdowns ${st ? st.unexpectedShutdowns : '?'} · crashed apps listed ${st ? st.apps.length : 0}`,
    )}`,
  );
}
