import { useEffect, useState, type ReactElement } from 'react';
import type { Settings } from '../../shared/types';
import { relativeTime } from '../../shared/format';
import { useCare } from '../context';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { UnlinkButton } from '../components/Unlink';

export function SettingsPage() {
  const { api, state, setState, update, go } = useCare();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void api.getSettings().then(setSettings);
  }, [api]);

  const toggle = async () => {
    if (!settings) return;
    setSettings(await api.setLaunchAtLogin(!settings.launchAtLogin));
  };

  const toggleNotes = async () => {
    if (!settings) return;
    setSettings(await api.setRepairNotifications(!settings.repairNotifications));
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
          {state.mode === 'linked' ? (
            <div className="setting-row">
              <div className="grow">
                <strong id="rn">Tell me about my repairs</strong>
                <span>A notification when a repair is ready, a new invoice arrives or we reply to a ticket.</span>
              </div>
              <button
                className="switch"
                role="switch"
                aria-labelledby="rn"
                aria-checked={settings?.repairNotifications ?? true}
                disabled={!settings}
                onClick={() => void toggleNotes()}
              />
            </div>
          ) : null}
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

        <section className="card">
          <div className="card-head">
            <h2>Your privacy</h2>
          </div>
          <div className="setting-row">
            <div className="grow">
              <strong>{state.mode === 'linked' ? 'Sharing health checks with PC Workshop' : 'Nothing is shared'}</strong>
              <span>
                {state.mode === 'linked'
                  ? 'PC Workshop sees a health report about this computer — never your files, emails, browsing or passwords. App names stay on this computer.'
                  : 'While you’re not signed in, nothing leaves this computer.'}
              </span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => go('privacy')}>
              <Icon name="lock" />
              Read the full details
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
