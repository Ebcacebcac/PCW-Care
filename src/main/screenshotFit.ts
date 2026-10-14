/* Pure helpers for screenshots on tickets (0.2) — no Electron imports, so
   they're unit tested. */

/* The server's limit is 2 MB decoded (contract 0.2). */
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const QUALITIES = [82, 72, 62, 50, 40];
const MAX_WIDTHS = [2560, 1920, 1600, 1280];

/* Tries quality, then size, until the JPEG fits. Pure apart from the
   encoder/resizer passed in, so it's unit tested. */
export function fitJpeg(
  width: number,
  encode: (maxWidth: number | null, quality: number) => Buffer,
  limit = MAX_SCREENSHOT_BYTES,
): { jpeg: Buffer; maxWidth: number | null; quality: number } | null {
  const widths: (number | null)[] = [null, ...MAX_WIDTHS.filter((w) => w < width)];
  for (const w of widths) {
    for (const q of QUALITIES) {
      const jpeg = encode(w, q);
      if (jpeg.length > 0 && jpeg.length <= limit) return { jpeg, maxWidth: w, quality: q };
    }
  }
  return null;
}

export function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

