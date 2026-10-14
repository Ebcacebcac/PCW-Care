/* "Attach a screenshot of the problem" (0.2). The main process hides the
   PCW Care window, captures the primary screen with desktopCapturer,
   brings the window back and keeps the JPEG here. The page only gets a
   preview and an id — it can't send arbitrary data as a "screenshot". */

import crypto from 'node:crypto';
import { desktopCapturer, screen, systemPreferences, type BrowserWindow, type NativeImage } from 'electron';
import type { ScreenshotResult } from '../shared/types';

import { fitJpeg, isJpeg } from './screenshotFit';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Screenshots {
  private pending: { id: string; jpeg: Buffer } | null = null;

  take(id: unknown): Buffer | null {
    if (typeof id !== 'string' || !this.pending || this.pending.id !== id) return null;
    return this.pending.jpeg;
  }

  discard(id?: unknown): void {
    if (id === undefined || (this.pending && this.pending.id === id)) this.pending = null;
  }

  async capture(win: BrowserWindow | null): Promise<ScreenshotResult> {
    if (process.platform === 'darwin') {
      {
        const access = macScreenAccess();
        if (access === 'denied' || access === 'restricted') {
          return {
            ok: false,
            message:
              'Your Mac needs your permission first: open System Settings → Privacy & Security → Screen & System Audio Recording, turn on PCW Care, then try again.',
          };
        }
      }
    }
    const wasVisible = !!win && !win.isDestroyed() && win.isVisible();
    try {
      if (wasVisible) {
        win!.hide();
        await wait(450); // let the window finish disappearing
      }
      const display = screen.getPrimaryDisplay();
      const size = {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
      };
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size, fetchWindowIcons: false });
      if (process.platform === 'darwin' && macScreenAccess() !== 'granted') {
        // Without permission macOS hands back just the wallpaper.
        return {
          ok: false,
          message:
            'Your Mac needs your permission first: open System Settings → Privacy & Security → Screen & System Audio Recording, turn on PCW Care, then try again.',
        };
      }
      const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
      const img: NativeImage | undefined = src?.thumbnail;
      if (!img || img.isEmpty()) {
        return { ok: false, message: 'We couldn’t take a screenshot on this computer. You can still send your ticket without one.' };
      }
      const { width, height } = img.getSize();
      const fitted = fitJpeg(width, (w, q) => (w ? img.resize({ width: w, quality: 'good' }) : img).toJPEG(q));
      if (!fitted || !isJpeg(fitted.jpeg)) {
        return { ok: false, message: 'That screenshot was too big to send. You can still send your ticket without one.' };
      }
      const id = crypto.randomBytes(12).toString('hex');
      this.pending = { id, jpeg: fitted.jpeg };
      const scale = fitted.maxWidth ? fitted.maxWidth / width : 1;
      return {
        ok: true,
        id,
        dataUrl: `data:image/jpeg;base64,${fitted.jpeg.toString('base64')}`,
        bytes: fitted.jpeg.length,
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      };
    } catch {
      return { ok: false, message: 'We couldn’t take a screenshot on this computer. You can still send your ticket without one.' };
    } finally {
      if (wasVisible && win && !win.isDestroyed()) {
        win.show();
        win.focus();
      }
    }
  }
}

function macScreenAccess(): string {
  try {
    return systemPreferences.getMediaAccessStatus('screen');
  } catch {
    return 'unknown';
  }
}
