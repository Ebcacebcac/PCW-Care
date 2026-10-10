// CI: on a real Windows/macOS runner, put a stand-in PCW-Connect where its
// installer puts it (per-user location) and check PCW Care detects it — and
// that it says "not installed" before that.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PcwConnect, findPcwConnect } = require('../dist/main/pcwConnect.js');

(async () => {
  const before = await findPcwConnect();
  let target;
  if (process.platform === 'win32') {
    const dir = path.join(process.env.LOCALAPPDATA, 'PCW-Connect');
    fs.mkdirSync(dir, { recursive: true });
    target = path.join(dir, 'PCW-Connect.exe');
    fs.copyFileSync(path.join(process.env.SystemRoot, 'System32', 'whoami.exe'), target);
  } else if (process.platform === 'darwin') {
    target = path.join(os.homedir(), 'Applications', 'PCW-Connect.app');
    fs.mkdirSync(path.join(target, 'Contents', 'MacOS'), { recursive: true });
  } else {
    console.log('PCW-Connect detection only applies on Windows and macOS.');
    return;
  }
  const status = await new PcwConnect().status(false);
  const lines = [`before: ${before}`, `stand-in: ${target}`, `status: ${JSON.stringify(status)}`];
  const ok = before === null && status.installed === true;
  console.log(`::${ok ? 'notice' : 'error'} title=PCW-Connect detection ${process.platform}::${lines.join('%0A')}`);
  fs.rmSync(process.platform === 'win32' ? path.dirname(target) : target, { recursive: true, force: true });
  if (!ok) process.exit(1);
})().catch((err) => {
  console.log(`::error title=PCW-Connect detection crashed::${String((err && err.stack) || err).replace(/\n/g, '%0A')}`);
  process.exit(1);
});
