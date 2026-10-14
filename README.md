# PCW Care

PCW Care is PC Workshop Ltd's desktop app for customers' Windows and Mac
computers — think Lenovo Vantage or Dell SupportAssist, but for PC Workshop.
It shows how the computer is doing, runs maintenance checks in plain English,
gets the customer help, and links to their
[Customer Hub](https://customer.pcwhub.co.uk) account.

- **Home** — the computer at a glance (name, model, serial, system), an overall
  status and tiles for storage, memory, battery, updates and security; the
  one-time "start when I sign in?" question; "We never cold-call you" and
  "Is this really PC Workshop calling?" (verified calls, polled every 30 s
  while Home is visible); and, for maintenance plan customers, "Your
  maintenance plan" with a monthly health summary built from local history.
- **My device** — full specs, with "Copy details" for support calls.
- **Maintenance** — checks with ok / worth a look / needs fixing / good to
  know / not checked results, each with a safe fix (opens the right settings page, offers a
  restart, or clears old temporary files after asking) or "Ask PC Workshop".
- **Get help** — support tickets (optionally with the computer's details and
  a screenshot of the problem),
  remote support requests for maintenance customers, booking a device in,
  PCW-Connect, scam advice, two-step verification tips and contact details
  for both workshops.
- **My account** — open repairs, unpaid invoices, recent tickets; unlink.
- **Privacy** — the full privacy information (Settings, and the sign-in page).
- Runs in the tray / menu bar, checks once a day and reports to PC Workshop
  while linked, and shows a notification if something turns bad. While
  linked it also polls `/summary` every 15 minutes and notifies about repair,
  invoice and ticket changes (Settings → "Tell me about my repairs"; the first
  poll only stores state).

### Checks

| id | Windows | macOS |
|---|---|---|
| `updates`, `pending-restart` | Windows Update history, pending reboot | `softwareupdate -l` |
| `win10_eos` | Windows 10 only: support ended 14 Oct 2025, consumer ESU ended 13 Oct 2026 (dates in `checks/extra.ts`) | — |
| `win11_ready` | Windows 10 only, always `info`: CPU generation heuristic, RAM ≥ 4 GB, drive ≥ 64 GB, TPM (tpmtool), Secure Boot (registry), Windows Update's own verdict | — |
| `antivirus`, `antivirus_expired` | Security Center `productState` (third-party AV off / out of date) | Gatekeeper + XProtect |
| `firewall` | profiles / third-party | socketfilterfw |
| `bitlocker` / `encryption` | Shell `System.Volume.BitLockerProtection` (no admin; unreadable = unknown, off = info; on → recovery key link) | FileVault via `fdesetup status` (id stays `encryption`) |
| `remote_tools` | running process names vs known remote access apps (PCW-Connect excluded) | `ps -axo comm=` paths |
| `backup` | OneDrive Known Folder Move (+ running), File History, Backup and Restore | Time Machine (`tmutil`, prefs), iCloud Desktop & Documents |
| disk space, `disk-health`, `temp-files` | | |
| `battery`, `memory`, `uptime`, `startup-apps` | | |
| `crashes` | Application 1000/1002, System 41/6008, last 30 days | `DiagnosticReports` `.ips`/`.crash`/`.panic`, last 30 days |

Statuses are `ok`, `warn`, `bad`, `info` and `unknown`; `backup` says "We
couldn't see a backup on this computer" — never that there definitely is none.
App names (remote access apps, crashed apps) go in `CheckResult.localNote` /
`DeviceReport.local` and are never sent.

It talks to the Customer Hub's `/api/care` endpoints (API contract v1). It can
also be used without signing in: the health checks still work and the help
actions open the website, email or phone instead.

## Stack

| | |
|---|---|
| Shell | Electron 44 (main process in TypeScript, CommonJS) |
| Screens | React 19 + Vite 8, bundled fonts, strict CSP |
| Hardware data | `systeminformation` 5 plus fixed PowerShell / macOS commands |
| Packaging | electron-builder 26 — NSIS (Windows x64), DMG + ZIP (macOS universal) |
| Updates | electron-updater 6 from GitHub Releases (`Ebcacebcac/PCW-Care`) |
| Tests | Vitest, ESLint (typescript-eslint), TypeScript 6 |

## Layout

```
src/main/            Electron main process (all network + system access)
  main.ts            app lifecycle, window, tray, app:// protocol, CSP, security
  controller.ts      sign-in state, checks, reporting, fixes, IPC handlers
  preload.ts         the narrow window.pcwCare bridge (contextBridge)
  api.ts             Customer Hub client + error mapping
  tokenStore.ts      device token, encrypted with safeStorage
  collect/           collectors: common (systeminformation), windows, mac
  checks/evaluate.ts pure functions: raw facts → ok/warn/bad/unknown
  checks/extra.ts    0.2 checks (backup, Windows 10/11, crashes, remote tools, …)
  snapshot.ts        DeviceReport → contract health snapshot (≤ 64 KB)
  repairWatch.ts     /summary diffing for repair notifications
  history.ts         local check history (monthly summary)
  screenshot*.ts     ticket screenshots (desktopCapturer, JPEG ≤ 2 MB)
  tempFiles.ts       measure / clear the user's own temp folder
  updater.ts         electron-updater wrapper
  collect-cli.ts     headless self-test (plain Node)
src/shared/          types, formatting, contact details (used by both sides)
src/renderer/        React screens; mock/ is a dev-only fake bridge
tests/               Vitest unit tests
scripts/             dev runner, icon generator, screenshot tool, fake API
build/               app icons (icon.png 1024, icon.ico, icon.icns)
resources/           tray icons (shipped next to the app)
```

## Development

Node 22+.

```bash
npm install
npm run dev            # Vite + Electron with hot reload for the screens
npm run dev:renderer   # screens only, in a browser, with a mock bridge
                       #   http://127.0.0.1:5173/?scenario=linked&page=home
                       #   scenarios: signin guest linked healthy checking desktop mac maintenance win10 scam
                       #   &call=yes|no|off|error  &launch=ask  &shot=bad  &page=…|privacy|summary
npm start              # production build, run in Electron

npm run typecheck
npm run lint
npm test
npm run self-test      # collect a real snapshot and print it (no Electron)
```

To try sign-in without the real server, run the fake API and point the app at
it:

```bash
node scripts/fake-api.mjs                                  # codes: DEMO1234, PLAIN123, NOTYET01
PCW_CARE_API=http://127.0.0.1:3999/api/care npm start
```

`PCW_CARE_API` overrides the default `https://customer.pcwhub.co.uk/api/care`
(https anywhere, or plain http to `127.0.0.1`/`localhost` only).

The app also accepts `--self-test` (`"PCW Care.exe" --self-test`) to run the
same check from an installed copy, and `--hidden` (used by "start when I sign
in") to start in the tray.

`npm run icons` regenerates the icons from the PC Workshop logo in the
`pcw-hub-2.1` checkout (needs Python 3 with Pillow).

## Releasing

1. Bump `version` in `package.json` (e.g. `0.2.0`, and run `npm install` so
   the lockfile matches) and push to `main`.
2. GitHub Actions (`.github/workflows/build.yml`) runs the checks and, because
   there's no `v0.2.0` tag yet, creates a draft release, builds the Windows
   installer and the macOS DMG/ZIP on real runners, uploads them with
   `latest.yml` / `latest-mac.yml`, then publishes the release (which creates
   the tag). Pushes that don't change the version just run the checks.
   Pushing a matching `vX.Y.Z` tag also works; a tag that doesn't match
   `package.json` stops the run.

Installed copies check GitHub Releases on start-up and every 6 hours.
Windows downloads the update in the background and offers "Restart to update".
macOS (unsigned) can't install updates itself, so Settings says "A new version
is available" with a button to the release page.

Local builds: `npm run dist:win` (on Windows), `npm run dist:mac` (on a Mac),
`npm run dist:dir` (unpacked, any OS — handy for checking the config).

## Code signing

Signing is driven by the environment (`electron-builder.cjs` →
`scripts/builder-config.cjs`). With no secrets, builds are exactly as before:

- **Windows** unsigned: SmartScreen warns "Windows protected your PC";
  customers click **More info → Run anyway**. `verifyUpdateCodeSignature` is
  off.
- **macOS** ad-hoc signed (needed for Apple Silicon), not notarised: the
  first time, customers go to **System Settings → Privacy & Security → Open
  Anyway**; updates are "download from the releases page".

To sign in CI, add to the GitHub repository:

- Windows — **Azure Artifact Signing** (Trusted Signing): secrets
  `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`; variables
  `AZURE_SIGN_ENDPOINT` (e.g. `https://weu.codesigning.azure.net`),
  `AZURE_SIGN_ACCOUNT`, `AZURE_SIGN_PROFILE` and optionally
  `AZURE_SIGN_PUBLISHER` (the certificate's CN, default "PC Workshop Ltd").
  All six must be set; then `win.azureSignOptions` is used and
  `verifyUpdateCodeSignature` is turned on.
- macOS — **Developer ID + notarisation**: secrets `CSC_LINK` (base64 .p12),
  `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`. Then hardened runtime and notarisation are on, and the app
  is stamped `pcwCareSigned: true` so it installs its own updates.

The "Signing credentials" step only exports values that are set and prints
a notice saying whether each platform was signed.

## What is sent to PC Workshop

Nothing leaves the computer unless it's linked to a Customer Hub account.
While linked, PCW Care sends a health snapshot when it starts, once a day,
after a check is run, and before a ticket that includes the computer's
details. The snapshot contains exactly:

- computer name, manufacturer, model, serial number, laptop or desktop;
- Windows/macOS name, version, build and architecture;
- processor name, cores and threads; total memory;
- each drive's name, type, size, free space and health;
- battery health %, charge cycles, charging state and charge %;
- hours since the last restart;
- each check's id, title, result and the sentence shown to the customer
  (crashes as counts only; remote access apps as "one is running", never
  the name);
- the PCW Care version.

When linking, it also sends the computer name, platform, system version,
model, serial and app version. Every request carries a
`PCW-Care/<version> (<platform>; <arch>)` user agent. Files, browsing,
passwords, the names of installed or running apps and anything typed outside
PCW Care are never sent. Running process names are read locally to spot
remote access apps; they, crashed app names, folder locations and the check
history (`history.json`, 62 days) stay on the computer.

Also only while linked: tickets (with a screenshot only when the customer
takes one — it stays in the main process until sent and is discarded if
removed), `/summary` every 15 minutes for repair notifications, and
`/call-status` every 30 s while Home is visible. A 404 from a 0.2 endpoint
hides that feature. The in-app Privacy page says the same in plain English.

## Security notes

- All network calls happen in the main process (Node `fetch`, no cookies, no
  `Origin`). The page has `connect-src 'none'`.
- `contextIsolation` on, `nodeIntegration` off, sandboxed renderer, a narrow
  preload API, IPC only accepted from the app's own page.
- The page is served from a private `app://pcw-care` scheme with a strict CSP;
  no remote code, fonts or images.
- New windows, navigation and webviews are blocked; links open in the browser
  only for `https` PC Workshop domains (and this repo's releases page).
- The device token is encrypted with Electron `safeStorage` (DPAPI on Windows,
  Keychain on macOS) and never logged. If encryption isn't available it's kept
  in memory only.
- Every command is a fixed program with a fixed argument list and a timeout;
  no shell, no user input. Fixes never need admin rights and never delete
  documents: "Clear temporary files" only removes files older than a day from
  the user's own temp folder, skipping anything in use, after confirmation.
