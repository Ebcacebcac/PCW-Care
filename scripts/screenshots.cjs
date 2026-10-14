/* Dev tool: screenshots every screen (light + dark) using the mock bridge.
   1. npm run dev:renderer   (Vite on http://127.0.0.1:5173)
   2. node scripts/screenshots.cjs [outDir]
   Uses the `playwright` package from PLAYWRIGHT_MODULE (path) or node_modules. */
/* global document */
const path = require('node:path');
const fs = require('node:fs');

const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DEV_URL || 'http://127.0.0.1:5173/';
const out = path.resolve(process.argv[2] || 'screenshots-dev');
fs.mkdirSync(out, { recursive: true });

const shots = [
  ['signin', 'signin', 'home'],
  ['home', 'linked', 'home'],
  ['home-healthy', 'healthy', 'home'],
  ['home-checking', 'checking', 'home'],
  ['home-desktop', 'desktop', 'home'],
  ['home-mac', 'mac', 'home'],
  ['device', 'linked', 'device'],
  ['device-mac', 'mac', 'device'],
  ['checks', 'linked', 'checks'],
  ['checks-mac', 'mac', 'checks'],
  ['help', 'linked', 'help'],
  ['help-guest', 'guest', 'help'],
  ['help-maintenance', 'mac', 'help'],
  ['account', 'linked', 'account'],
  ['settings', 'linked', 'settings'],
  ['settings-mac', 'mac', 'settings'],
  ['home-guest', 'guest', 'home'],
  // 0.2
  ['home-win10', 'win10', 'home'],
  ['home-launch-ask', 'linked&launch=ask', 'home'],
  ['home-call-yes', 'scam&call=yes', 'home'],
  ['home-call-off', 'linked&call=off', 'home'],
  ['checks-win10', 'win10', 'checks'],
  ['checks-scam', 'scam', 'checks'],
  ['device-win10', 'win10', 'device'],
  ['privacy', 'linked', 'privacy'],
  ['summary', 'maintenance', 'summary'],
];

(async () => {
  const browser = await pw.chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 }, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    for (const [name, scenario, p] of shots) {
      await page.goto(`${base}?scenario=${scenario}&page=${p}`);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(out, `${name}-${scheme}.png`) });
      if (process.env.FULL) {
        const h = await page.evaluate(() => document.querySelector('.main')?.scrollHeight ?? 720);
        if (h > 720) {
          await page.setViewportSize({ width: 1100, height: Math.min(h, 3000) });
          await page.waitForTimeout(200);
          await page.screenshot({ path: path.join(out, `${name}-${scheme}-full.png`) });
          await page.setViewportSize({ width: 1100, height: 720 });
        }
      }
    }
    // a couple of interactive states
    await page.goto(`${base}?scenario=signin`);
    await page.fill('#code', 'WRONG1');
    await page.click('button[type=submit]');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, `signin-error-${scheme}.png`) });
    await page.goto(`${base}?scenario=linked&page=account`);
    await page.waitForTimeout(500);
    await page.click('text=Unlink this computer');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `unlink-confirm-${scheme}.png`) });
    await page.goto(`${base}?scenario=linked&page=checks`);
    await page.waitForTimeout(500);
    await page.click('text=Ask PC Workshop >> nth=0');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `help-prefilled-${scheme}.png`) });
    // 0.2: screenshot on a ticket, refused screenshot, privacy from sign-in
    await page.goto(`${base}?scenario=linked&page=help`);
    await page.waitForTimeout(500);
    await page.click('text=Take a screenshot');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(out, `help-screenshot-${scheme}.png`) });
    await page.goto(`${base}?scenario=linked&page=help&shot=bad`);
    await page.waitForTimeout(500);
    await page.fill('#t-subject', 'Printer error');
    await page.fill('#t-message', 'It says 0x709');
    await page.click('text=Take a screenshot');
    await page.waitForTimeout(1000);
    await page.click('text=Send ticket');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, `help-screenshot-bad-${scheme}.png`) });
    await page.goto(`${base}?scenario=signin`);
    await page.waitForTimeout(400);
    await page.click('text=What PCW Care shares');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `signin-privacy-${scheme}.png`) });
    await page.goto(`${base}?scenario=maintenance&page=home`);
    await page.waitForTimeout(500);
    await page.click('text=Request remote support');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, `home-to-remote-${scheme}.png`) });
    if (errors.length) console.log(scheme, 'errors:', errors);
    await ctx.close();
  }
  await browser.close();
  console.log('saved to', out);
})();
