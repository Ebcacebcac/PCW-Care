// CI: prove "Clear temporary files" accepts this machine's real temp folder
// (Windows runners use an 8.3 short TEMP like C:\Users\RUNNER~1\..., macOS a
// /var/folders/../T outside home) and that clearing actually works.
const os = require('node:os');
const { isSafeTempDir, resolveSafeTempDir, cleanTemp } = require('../dist/main/tempFiles.js');

(async () => {
  const dir = os.tmpdir();
  const home = os.homedir();
  const raw = isSafeTempDir(dir, home);
  const resolved = await resolveSafeTempDir(dir, home);
  const lines = [`TEMP ${dir}`, `home ${home}`, `text-only check: ${raw}`, `resolved: ${resolved}`];
  if (!resolved) {
    console.log(`::error title=Temp folder refused::${lines.join('%0A')}`);
    process.exit(1);
  }
  const r = await cleanTemp(dir, home, { timeLimitMs: 60_000 });
  lines.push(`cleaned: ${r.deletedFiles} files, ${r.freedBytes} bytes freed, ${r.skippedFiles} skipped`);
  console.log(`::notice title=Temp clean ${process.platform}::${lines.join('%0A')}`);
})().catch((err) => {
  console.log(`::error title=Temp clean crashed::${String(err && err.stack || err).replace(/\n/g, '%0A')}`);
  process.exit(1);
});
