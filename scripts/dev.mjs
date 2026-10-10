/* `npm run dev`: compile the main process, start Vite, then launch Electron
   pointed at the dev server. Ctrl+C stops everything. */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';

const tsc = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.main.json'], { stdio: 'inherit' });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';

const child = spawn(String(electronPath), ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
