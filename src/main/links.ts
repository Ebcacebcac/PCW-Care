/* Which external addresses the app will open, and what each fix opens.
   The renderer never supplies a URL: it names a target or a fix id, and the
   address comes from the fixed tables below. */

import type { ContactTarget, FixId } from '../shared/types';
import { BOOK_IN_URL, EMAIL, HUB_URL, PHONE_TEL, RELEASES_URL, SUPPORT_PAGE_URL, WEBSITE } from '../shared/contact';

const ALLOWED_HOSTS = ['pcwhub.co.uk', 'pcworkshop.co.uk'];
const GITHUB_RELEASES_PREFIX = '/Ebcacebcac/PCW-Care/releases';

/* https only, on a PC Workshop domain (or the app's own GitHub releases). */
export function isAllowedExternalUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  if (ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  if (host === 'github.com' && (u.pathname === GITHUB_RELEASES_PREFIX || u.pathname.startsWith(`${GITHUB_RELEASES_PREFIX}/`))) return true;
  return false;
}

export function contactUrl(target: ContactTarget): string | null {
  switch (target) {
    case 'phone':
      return `tel:${PHONE_TEL}`;
    case 'email':
      return `mailto:${EMAIL}`;
    case 'website':
      return WEBSITE;
    case 'hub':
      return HUB_URL;
    case 'book-in':
      return BOOK_IN_URL;
    case 'support-page':
      return SUPPORT_PAGE_URL;
    case 'release-page':
      return RELEASES_URL;
    default:
      return null;
  }
}

/* Settings pages for the "Fix it" buttons. Windows uses ms-settings: and
   windowsdefender: URIs; macOS (Ventura and later) System Settings
   extension ids, which older macOS versions also route to the right pane. */
const SETTINGS: Record<'win32' | 'darwin', Partial<Record<FixId, string>>> = {
  win32: {
    'open:updates': 'ms-settings:windowsupdate',
    'open:security': 'windowsdefender:',
    'open:firewall': 'windowsdefender://network/',
    'open:storage': 'ms-settings:storagesense',
    'open:startup': 'ms-settings:startupapps',
    'open:battery': 'ms-settings:batterysaver',
  },
  darwin: {
    'open:updates': 'x-apple.systempreferences:com.apple.Software-Update-Settings.extension',
    'open:security': 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension',
    'open:encryption': 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?FileVault',
    'open:firewall': 'x-apple.systempreferences:com.apple.Network-Settings.extension?Firewall',
    'open:storage': 'x-apple.systempreferences:com.apple.settings.Storage',
    'open:battery': 'x-apple.systempreferences:com.apple.Battery-Settings.extension',
  },
};

export function settingsUrl(fix: FixId, platform: string): string | null {
  if (platform !== 'win32' && platform !== 'darwin') return null;
  return SETTINGS[platform][fix] ?? null;
}

const FIX_IDS: FixId[] = [
  'open:updates',
  'open:security',
  'open:firewall',
  'open:encryption',
  'open:storage',
  'open:startup',
  'open:battery',
  'restart',
  'clean-temp',
];

export function isFixId(v: unknown): v is FixId {
  return typeof v === 'string' && (FIX_IDS as string[]).includes(v);
}

const CONTACT_TARGETS: ContactTarget[] = ['phone', 'email', 'website', 'hub', 'book-in', 'support-page', 'release-page'];
export function isContactTarget(v: unknown): v is ContactTarget {
  return typeof v === 'string' && (CONTACT_TARGETS as string[]).includes(v);
}
