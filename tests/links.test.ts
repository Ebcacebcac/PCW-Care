import { describe, expect, it } from 'vitest';
import { contactUrl, isAllowedExternalUrl, isContactTarget, isFixId, settingsUrl } from '../src/main/links';

describe('isAllowedExternalUrl', () => {
  it.each([
    ['https://customer.pcwhub.co.uk/book-in', true],
    ['https://pcwhub.co.uk', true],
    ['https://www.pcworkshop.co.uk/terms', true],
    ['https://github.com/Ebcacebcac/PCW-Care/releases/latest', true],
    ['http://customer.pcwhub.co.uk', false],
    ['https://pcwhub.co.uk.evil.com', false],
    ['https://evilpcwhub.co.uk', false],
    ['https://user:pass@pcwhub.co.uk', false],
    ['https://pcwhub.co.uk:8443/', false],
    ['https://github.com/Ebcacebcac/other', false],
    ['https://github.com/Ebcacebcac/PCW-Care-evil/releases', false],
    ['file:///etc/passwd', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
  ])('%s → %s', (url, ok) => {
    expect(isAllowedExternalUrl(url)).toBe(ok);
  });
});

describe('fixed targets', () => {
  it('maps contact targets to fixed addresses only', () => {
    expect(contactUrl('phone')).toBe('tel:01912859999');
    expect(contactUrl('email')).toBe('mailto:support@pcworkshop.co.uk');
    expect(contactUrl('book-in')).toBe('https://customer.pcwhub.co.uk/book-in');
    expect(isContactTarget('https://evil')).toBe(false);
    for (const t of ['website', 'hub', 'book-in', 'support-page', 'release-page'] as const) {
      expect(isAllowedExternalUrl(contactUrl(t)!)).toBe(true);
    }
  });

  it('only knows the listed fixes and platforms', () => {
    expect(isFixId('restart')).toBe(true);
    expect(isFixId('rm -rf')).toBe(false);
    expect(settingsUrl('open:updates', 'win32')).toBe('ms-settings:windowsupdate');
    expect(settingsUrl('open:startup', 'win32')).toBe('ms-settings:startupapps');
    expect(settingsUrl('open:updates', 'darwin')).toMatch(/^x-apple\.systempreferences:/);
    expect(settingsUrl('open:updates', 'linux')).toBeNull();
    expect(settingsUrl('restart', 'win32')).toBeNull();
  });
});
