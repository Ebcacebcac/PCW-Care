import { useEffect, useState, type ReactElement } from 'react';
import type { Settings } from '../../shared/types';
import { relativeTime } from '../../shared/format';
import { useCare } from '../context';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { UnlinkButton } from '../components/Unlink';

export function SettingsPage() {
  const { api, state, setState, update } = useCare();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void api.getSettings().then(setSettings);
  }, [api]);

  const toggle = async () => {
    if (!settings) return;
    setSettings(await api.setLaunchAtLogin(!settings.launchAtLogin));
  };

  const check = async () => {
    setChecking(true);
    await api.checkForUpdates();
    setChecking(false);
  };

  let updateText = 'PCW Care checks for updates automatically.';
  let updateAction: ReactElement | null = (
    <button className="btn btn-secondary btn-sm" onClick={() => void check()} disabled={checking || update.state === 'checking'}>
      {checking || update.state === 'checking' ? <Spinner /> : <Icon name="refresh" />}
      Check for updates
    </button>
  );
  switch (update.state) {
    case 'unsupported':
      updateText = update.message;
      updateAction = null;
      break;
    case 'checking':
      updateText = 'Checking for updates…';
      break;
    case 'none':
      updateText = `You have the latest version (checked ${relativeTime(update.checkedAt)}).`;
      break;
    case 'available':
      updateText = `A new version is available: ${update.version}.${update.manual ? ' Download it from our releases page and open it to update.' : ''}`;
      updateAction = update.manual ? (
        <button className="btn btn-primary btn-sm" onClick={() => void api.open('release-page')}>
          <Icon name="download" />
          Get version {update.version}
        </button>
      ) : null;
      break;
    case 'downloading':
      updateText = `Downloading version ${update.version}… ${update.percent}%`;
      updateAction = null;
      break;
    case 'ready':
      updateText = `Version ${update.version} is ready to install.`;
      updateAction = (
        <button className="btn btn-primary btn-sm" onClick={() => void api.installUpdate()}>
          Restart to update
        </button>
      );
      break;
    case 'error':
      updateText = update.message;
      break;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>PCW Care version {state.appVersion}</p>
        </div>
      </div>

      <div className="stack">
        <section className="card">
          <div className="card-head">
            <h2>General</h2>
          </div>
          <div className="setting-row">
            <div className="grow">
              <strong id="lal">Start PCW Care when I sign in</strong>
              <span>
                {settings && !settings.launchAtLoginAvailable
                  ? 'Available in the installed app.'
                  : 'PCW Care runs quietly in the background and checks your computer once a day.'}
              </span>
            </div>
            <button
              className="switch"
              role="switch"
              aria-labelledby="lal"
              aria-checked={settings?.launchAtLogin ?? false}
              disabled={!settings || !settings.launchAtLoginAvailable}
              onClick={() => void toggle()}
            />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Updates</h2>
          </div>
          <div className="setting-row">
            <div className="grow">
              <strong>PCW Care {state.appVersion}</strong>
              <span>{updateText}</span>
            </div>
            {updateAction}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Account</h2>
          </div>
          <div className="setting-row">
            <div className="grow">
              {state.mode === 'linked' && state.account ? (
                <>
                  <strong>
                    Linked to {state.account.client.firstName} {state.account.client.lastName}
                  </strong>
                  <span>Unlinking stops this computer sharing its health checks with PC Workshop.</span>
                </>
              ) : (
                <>
                  <strong>Not signed in</strong>
                  <span>Sign in with your Customer Hub access code to send tickets and share health checks with PC Workshop.</span>
                </>
              )}
            </div>
            {state.mode === 'linked' ? (
              <UnlinkButton small />
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => void api.showSignIn().then(setState)}>
                Sign in
              </button>
            )}
          </div>
          {state.tokenNotSaved ? (
            <div className="setting-row">
              <div className="alert s-warn" style={{ flex: 1 }}>
                <Icon name="alert" />
                <span>This computer can’t store your sign-in securely, so you’ll need to sign in again next time PCW Care starts.</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Your privacy</h2>
          <p className="card-sub" style={{ marginTop: 6 }}>
            PCW Care only sends information to PC Workshop while this computer is linked to your account. It sends it when PCW Care starts, once a
            day, when you run a check, and with a support ticket if you tick “Include my computer’s details”. This is exactly what’s sent:
          </p>
          <ul className="privacy-list">
            <li>Computer name, make, model, serial number and whether it’s a laptop or desktop</li>
            <li>Windows or macOS version, build and processor type</li>
            <li>Processor, number of cores and amount of memory</li>
            <li>Each drive’s name, type, size, free space and health</li>
            <li>Battery health, charge cycles and current charge (laptops)</li>
            <li>How long since the computer last restarted</li>
            <li>The result of each maintenance check, as shown on the Maintenance page</li>
            <li>The PCW Care version</li>
          </ul>
          <p className="card-sub" style={{ marginTop: 10 }}>
            <b>Never sent:</b> your files, photos, emails, browsing history, passwords, the apps you use, or anything you type outside PCW Care.
            When you’re not signed in, nothing leaves your computer.
          </p>
        </section>
      </div>
    </div>
  );
}
