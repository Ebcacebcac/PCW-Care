/* The few things PCW Care can do to the computer in v1, all safe and
   non-destructive: open a settings page, restart (after the customer
   confirms) and clear old files from their own temp folder. */

import path from 'node:path';
import { run } from './collect/exec';

export async function restartComputer(platform: string = process.platform): Promise<boolean> {
  if (platform === 'win32') {
    const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    const shutdown = path.win32.join(root, 'System32', 'shutdown.exe');
    const r = await run(shutdown, ['/r', '/t', '5', '/c', 'PCW Care is restarting your computer.'], 15_000);
    return r.ok;
  }
  if (platform === 'darwin') {
    // Asks macOS to restart the normal way: apps get the chance to save, and
    // macOS shows its own restart confirmation.
    const r = await run('/usr/bin/osascript', ['-e', 'tell application "loginwindow" to «event aevtrrst»'], 20_000);
    return r.ok;
  }
  return false;
}
