/* electron-builder configuration, built from the environment so the same
   config makes unsigned builds (no secrets — exactly as before) and signed
   ones (CI with signing secrets). Loaded by ../electron-builder.cjs; unit
   tested in tests/builderConfig.test.ts. See README "Code signing".

   Windows — Azure Artifact Signing (formerly Trusted Signing), only when ALL of:
     AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET   (service principal)
     AZURE_SIGN_ENDPOINT   e.g. https://weu.codesigning.azure.net
     AZURE_SIGN_ACCOUNT    the Artifact Signing account name
     AZURE_SIGN_PROFILE    the certificate profile name
     AZURE_SIGN_PUBLISHER  optional, the certificate's subject CN (default "PC Workshop Ltd")
   macOS — Developer ID signing + notarisation, only when ALL of:
     CSC_LINK (+ CSC_KEY_PASSWORD), APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID */

'use strict';

const has = (env, k) => typeof env[k] === 'string' && env[k].trim() !== '';

function windowsSigning(env) {
  const keys = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SIGN_ENDPOINT', 'AZURE_SIGN_ACCOUNT', 'AZURE_SIGN_PROFILE'];
  if (!keys.every((k) => has(env, k))) return null;
  return {
    publisherName: has(env, 'AZURE_SIGN_PUBLISHER') ? env.AZURE_SIGN_PUBLISHER.trim() : 'PC Workshop Ltd',
    endpoint: env.AZURE_SIGN_ENDPOINT.trim(),
    codeSigningAccountName: env.AZURE_SIGN_ACCOUNT.trim(),
    certificateProfileName: env.AZURE_SIGN_PROFILE.trim(),
  };
}

function macSigning(env) {
  return ['CSC_LINK', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].every((k) => has(env, k));
}

function buildConfig(env = process.env) {
  const azure = windowsSigning(env);
  const macSigned = macSigning(env);

  const win = {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico',
    artifactName: 'PCW-Care-Setup-${version}.${ext}',
  };
  if (azure) {
    win.azureSignOptions = azure;
    win.signExecutable = true;
    // The updater checks a new installer is signed by the same publisher.
    win.verifyUpdateCodeSignature = true;
  } else {
    // No certificate: don't try to sign, and don't make the updater insist
    // on a signature it can't verify.
    win.signExecutable = false;
    win.verifyUpdateCodeSignature = false;
  }

  const mac = {
    target: [
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] },
    ],
    icon: 'build/icon.icns',
    category: 'public.app-category.utilities',
    artifactName: 'PCW-Care-${version}-mac-${arch}.${ext}',
    gatekeeperAssess: false,
  };
  if (macSigned) {
    // Developer ID from CSC_LINK; hardened runtime is required for
    // notarisation (electron-builder's default entitlements cover Electron).
    mac.hardenedRuntime = true;
    mac.notarize = true;
  } else {
    // No Apple Developer ID: ad-hoc sign ("-") so Apple Silicon will run
    // it. Hardened runtime off because ad-hoc signatures can't satisfy its
    // library validation; no notarisation without an Apple account.
    mac.identity = '-';
    mac.hardenedRuntime = false;
    mac.notarize = false;
  }

  return {
    appId: 'uk.co.pcworkshop.care',
    productName: 'PCW Care',
    copyright: 'Copyright © 2026 PC Workshop Ltd',
    directories: { output: 'release', buildResources: 'build' },
    files: ['dist/**/*', 'package.json'],
    extraResources: [{ from: 'resources', to: 'resources' }],
    asar: true,
    // Lets a signed Mac build know it can install its own updates (updater.ts).
    ...(macSigned ? { extraMetadata: { pcwCareSigned: true } } : {}),

    // Auto-update feed (latest.yml / latest-mac.yml) and installers go to the
    // GitHub Release for the tag. CI creates the draft release and publishes
    // it once both platforms have uploaded.
    publish: { provider: 'github', owner: 'Ebcacebcac', repo: 'PCW-Care', releaseType: 'draft' },

    win,
    nsis: {
      oneClick: true,
      perMachine: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'PCW Care',
      runAfterFinish: true,
      deleteAppDataOnUninstall: false,
    },
    mac,
    dmg: { title: 'PCW Care ${version}', artifactName: 'PCW-Care-${version}.${ext}' },
    linux: {
      // Only used to test packaging on Linux CI/sandboxes; not distributed.
      target: ['dir'],
      category: 'Utility',
      icon: 'build/icon.png',
    },
  };
}

module.exports = { buildConfig, windowsSigning, macSigning };
