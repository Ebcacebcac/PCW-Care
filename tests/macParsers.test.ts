import { describe, expect, it } from 'vitest';
import { parseDiskutil, parseFileVault, parseFirewall, parsePower, parseSoftwareUpdate } from '../src/main/collect/mac';

describe('softwareupdate -l', () => {
  it('no updates', () => {
    expect(parseSoftwareUpdate('Software Update Tool\n\nFinding available software\nNo new software available.\n')).toEqual({ updates: [], cached: false });
  });
  it('lists updates with restart and recommended flags', () => {
    const out = `Software Update Tool

Finding available software
Software Update found the following new or updated software:
* Label: macOS Sequoia 15.7-24G222
\tTitle: macOS Sequoia 15.7, Version: 15.7, Size: 1234567KiB, Recommended: YES, Action: restart,
* Label: Safari18.6SequoiaAuto-18.6
\tTitle: Safari, Version: 18.6, Size: 123456KiB, Recommended: YES,
`;
    const r = parseSoftwareUpdate(out)!;
    expect(r.updates).toHaveLength(2);
    expect(r.updates[0]).toEqual({ label: 'macOS Sequoia 15.7-24G222', title: 'macOS Sequoia 15.7', recommended: true, restart: true });
    expect(r.updates[1]).toMatchObject({ title: 'Safari', restart: false });
  });
  it('unknown output → null', () => {
    expect(parseSoftwareUpdate('Could not connect to the server')).toBeNull();
  });
});

describe('other macOS parsers', () => {
  it('fdesetup', () => {
    expect(parseFileVault('FileVault is On.')).toBe('on');
    expect(parseFileVault('FileVault is Off.')).toBe('off');
    expect(parseFileVault('Encryption in progress: Percent completed = 12.3')).toBe('encrypting');
    expect(parseFileVault('')).toBeNull();
  });
  it('socketfilterfw', () => {
    expect(parseFirewall('Firewall is enabled. (State = 1)')).toBe(true);
    expect(parseFirewall('Firewall is blocking all non-essential incoming connections. (State = 2)')).toBe(true);
    expect(parseFirewall('Firewall is disabled. (State = 0)')).toBe(false);
    expect(parseFirewall('')).toBeNull();
  });
  it('diskutil info', () => {
    const r = parseDiskutil('   Volume Name:               Macintosh HD\n   SMART Status:              Verified\n   APFS Physical Store:       disk0s2\n');
    expect(r).toEqual({ smart: 'Verified', volumeName: 'Macintosh HD', wholeDisk: 'disk0' });
  });
  it('system_profiler SPPowerDataType -json', () => {
    const json = JSON.stringify({
      SPPowerDataType: [
        {
          _name: 'spbattery_information',
          sppower_battery_charge_info: { sppower_battery_is_charging: 'TRUE', sppower_battery_state_of_charge: 81 },
          sppower_battery_health_info: { sppower_battery_cycle_count: 88, sppower_battery_health: 'Good', sppower_battery_health_maximum_capacity: '97%' },
        },
        { _name: 'sppower_ac_charger_information' },
      ],
    });
    expect(parsePower(json)).toEqual({ cycles: 88, condition: 'Good', maxCapacityPct: 97, percent: 81, charging: true });
    expect(parsePower('{"SPPowerDataType":[{"_name":"sppower_ac_charger_information"}]}')).toBeNull();
    expect(parsePower('not json')).toBeNull();
  });
});
