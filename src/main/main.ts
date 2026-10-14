/* PCW Care — Electron main process entry. */

import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, nativeTheme, protocol, session, shell, type MenuItemConstructorOptions } from 'electron';
import { Controller } from './controller';
import { isAllowedExternalUrl } from './links';
import { runSelfTest } from './selfTest';

const APP_ID = 'uk.co.pcworkshop.care';
const APP_ORIGIN = 'app://pcw-care';
const DEV_URL = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL || '' : '';

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

/* ── headless self-test: collect, print, exit (used in CI) ── */
if (process.argv.includes('--self-test')) {
  void runSelfTest(app.getVersion(), process.argv.includes('--full')).then(
    (code) => app.exit(code),
    () => app.exit(1),
  );
} else {
  start();
}

function start(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

  let win: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let quitting = false;
  const startHidden =
    process.argv.includes('--hidden') || (process.platform === 'darwin' && safeWasOpenedAtLogin());

  const rendererDir = path.join(__dirname, '..', 'renderer');
  const resourcesDir = app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(app.getAppPath(), 'resources');

  const showWindow = () => {
    if (!win || win.isDestroyed()) createWindow(true);
    else {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  };

  const controller = new Controller(() => win, [APP_ORIGIN + '/', ...(DEV_URL ? [DEV_URL] : [])], showWindow);

  app.on('second-instance', () => showWindow());
  app.on('before-quit', () => {
    quitting = true;
  });

  // Security: no new windows, no navigation away, no webviews, no permissions.
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      const ok = url.startsWith(APP_ORIGIN + '/') || (DEV_URL && url.startsWith(DEV_URL));
      if (!ok) {
        event.preventDefault();
        if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      }
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  function createWindow(show: boolean): void {
    win = new BrowserWindow({
      width: 1100,
      height: 720,
      minWidth: 900,
      minHeight: 600,
      show: false,
      title: 'PCW Care',
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0B1016' : '#FBFCFA',
      autoHideMenuBar: true,
      ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 18 } } : {}),
      ...(process.platform === 'linux' ? { icon: path.join(resourcesDir, 'tray.png') } : {}),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
        devTools: !app.isPackaged,
      },
    });
    win.once('ready-to-show', () => {
      if (show) win?.show();
    });
    win.on('close', (event) => {
      if (quitting) return;
      // Keep running in the tray / menu bar so the daily check carries on.
      event.preventDefault();
      win?.hide();
      const s = controller.settings.get();
      if (!s.trayHintShown && process.platform === 'win32' && Notification.isSupported()) {
        new Notification({ title: 'PCW Care is still running', body: 'You’ll find it in the system tray, by the clock. Right-click it to quit.' }).show();
        controller.settings.update({ trayHintShown: true });
      }
    });
    win.on('closed', () => {
      win = null;
    });
    if (DEV_URL) void win.loadURL(DEV_URL);
    else void win.loadURL(`${APP_ORIGIN}/index.html`);
  }

  function createTray(): void {
    const icon =
      process.platform === 'darwin'
        ? nativeImage.createFromPath(path.join(resourcesDir, 'trayTemplate.png'))
        : nativeImage.createFromPath(path.join(resourcesDir, process.platform === 'win32' ? 'tray.ico' : 'tray.png'));
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('PCW Care');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open PCW Care', click: () => showWindow() },
        {
          label: 'Run a check',
          click: () => {
            showWindow();
            controller.emit({ type: 'navigate', page: 'checks', runCheck: true });
            void controller.runCheck().catch(() => undefined);
          },
        },
        { type: 'separator' },
        {
          label: 'Quit PCW Care',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    if (process.platform !== 'darwin') tray.on('click', () => showWindow());
  }

  function buildMenu(): void {
    if (process.platform !== 'darwin') {
      Menu.setApplicationMenu(null);
      return;
    }
    const template: MenuItemConstructorOptions[] = [
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: app.isPackaged ? [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] : [{ role: 'reload' }, { role: 'toggleDevTools' }],
      },
      { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    protocol.handle('app', async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host !== 'pcw-care') return new Response('Not found', { status: 404 });
        let rel = decodeURIComponent(url.pathname);
        if (rel === '/' || rel === '') rel = '/index.html';
        const file = path.normalize(path.join(rendererDir, rel));
        if (!file.startsWith(rendererDir + path.sep)) return new Response('Not found', { status: 404 });
        const data = await fs.readFile(file);
        return new Response(data, {
          headers: {
            'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
            'Content-Security-Policy': CSP,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });

    controller.registerIpc();
    buildMenu();
    createWindow(!startHidden);
    createTray();

    // Keep the login item pointing at this copy of the app after updates.
    if (controller.settings.get().launchAtLogin === true) controller.setLaunchAtLogin(true);

    // First check shortly after start, then a daily report while linked.
    setTimeout(() => void controller.runCheck().catch(() => undefined), 2500);
    setInterval(() => void controller.dailyTick(), 30 * 60 * 1000).unref();
    controller.startRepairWatch();
    controller.updater.start();
  });

  app.on('activate', () => showWindow());
  app.on('window-all-closed', () => {
    /* stay in the tray */
  });
}

function safeWasOpenedAtLogin(): boolean {
  try {
    return app.getLoginItemSettings().wasOpenedAtLogin === true;
  } catch {
    return false;
  }
}
