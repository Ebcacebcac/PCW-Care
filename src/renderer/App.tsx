import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, CheckProgress, CheckResult, DeviceReport, PageId, UpdateState } from '../shared/types';
import { overallStatus } from '../shared/status';
import { Ctx, getBridge, type CareCtx, type HelpPrefill } from './context';
import { Icon, type IconName } from './components/Icon';
import { initials } from './components/ui';
import mark from './assets/mark.png';
import { SignIn } from './pages/SignIn';
import { Home } from './pages/Home';
import { Device } from './pages/Device';
import { Checks } from './pages/Checks';
import { Help } from './pages/Help';
import { Account } from './pages/Account';
import { SettingsPage } from './pages/Settings';

const NAV: { id: PageId; label: string; icon: IconName; linkedOnly?: boolean }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'device', label: 'My device', icon: 'laptop' },
  { id: 'checks', label: 'Maintenance', icon: 'wrench' },
  { id: 'help', label: 'Get help', icon: 'lifebuoy' },
  { id: 'account', label: 'My account', icon: 'user', linkedOnly: true },
];

export function App() {
  const api = useMemo(getBridge, []);
  const [state, setState] = useState<AppState | null>(null);
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [progress, setProgress] = useState<CheckProgress>({ running: false, startedAt: null });
  const [update, setUpdate] = useState<UpdateState>({ state: 'idle' });
  const [page, setPage] = useState<PageId>(initialPage());
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [prefill, setPrefill] = useState<HelpPrefill | null>(null);
  const toastId = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    void api.getState().then((s) => alive && setState(s));
    void api.getReport().then((r) => {
      if (!alive) return;
      setReport(r.report);
      setProgress(r.progress);
    });
    void api.getUpdateState().then((u) => alive && setUpdate(u));
    const off = api.onEvent((e) => {
      if (e.type === 'state') setState(e.state);
      else if (e.type === 'check') {
        setProgress(e.progress);
        if (e.report) setReport(e.report);
      } else if (e.type === 'update') setUpdate(e.update);
      else if (e.type === 'navigate') setPage(e.page);
    });
    return () => {
      alive = false;
      off();
    };
  }, [api]);

  useEffect(() => {
    if (state) document.documentElement.classList.add(`platform-${state.platform}`);
  }, [state]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const toast = useCallback((msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const ctx: CareCtx | null = state
    ? {
        api,
        state,
        setState,
        report,
        progress,
        update,
        page,
        go: setPage,
        runCheck: () => {
          void api.runCheck().catch(() => toast('The check didn’t finish. Please try again.'));
        },
        toast,
        copy: (text, what = 'Copied') => {
          void api.copyText(text).then(() => toast(what));
        },
        prefill,
        askUs: (check?: CheckResult) => {
          setPrefill(
            check
              ? { subject: `Help with: ${check.title}`.slice(0, 120), message: `PCW Care says: ${check.detail}\n\nCould you help me with this?` }
              : null,
          );
          setPage('help');
        },
        clearPrefill: () => setPrefill(null),
      }
    : null;

  if (!ctx || !state) return <div className="boot" />;

  if (state.mode === 'signin') {
    return (
      <Ctx.Provider value={ctx}>
        <SignIn />
        <Toasts toasts={toasts} />
      </Ctx.Provider>
    );
  }

  const current = page === 'account' && state.mode !== 'linked' ? 'home' : page;
  const attention = report ? overallStatus(report.checks) : null;
  const acc = state.account;

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <span className="brand-mark">
              <img src={mark} alt="" />
            </span>
            <span className="brand-text">
              <strong>PCW Care</strong>
              <span>by PC Workshop</span>
            </span>
          </div>
          <nav className="nav" aria-label="Main">
            {NAV.filter((n) => !n.linkedOnly || state.mode === 'linked').map((n) => (
              <button key={n.id} className={current === n.id ? 'active' : ''} aria-current={current === n.id ? 'page' : undefined} onClick={() => setPage(n.id)}>
                <Icon name={n.icon} />
                {n.label}
                {n.id === 'checks' && attention && attention.attention > 0 ? (
                  <span className={`nav-badge${attention.problems ? ' bad' : ''}`} aria-label={`${attention.attention} to look at`}>
                    {attention.attention}
                  </span>
                ) : null}
              </button>
            ))}
            <div className="nav-label">App</div>
            <button className={current === 'settings' ? 'active' : ''} aria-current={current === 'settings' ? 'page' : undefined} onClick={() => setPage('settings')}>
              <Icon name="settings" />
              Settings
              {update.state === 'available' || update.state === 'ready' ? <span className="nav-badge">1</span> : null}
            </button>
          </nav>
          <div className="sidebar-foot">
            {state.mode === 'linked' && acc ? (
              <div className="who">
                <span className="avatar">{initials(acc.client.firstName, acc.client.lastName)}</span>
                <span className="who-text">
                  <strong>
                    {acc.client.firstName} {acc.client.lastName}
                  </strong>
                  <span>Linked to PC Workshop</span>
                </span>
              </div>
            ) : (
              <div className="who">
                <span className="avatar ghost">
                  <Icon name="user" />
                </span>
                <span className="who-text">
                  <strong>Not signed in</strong>
                  <span>Checks only</span>
                </span>
                <button onClick={() => void api.showSignIn().then(setState)}>Sign in</button>
              </div>
            )}
          </div>
        </aside>
        <main className="main" ref={mainRef}>
          {current === 'home' && <Home />}
          {current === 'device' && <Device />}
          {current === 'checks' && <Checks />}
          {current === 'help' && <Help />}
          {current === 'account' && <Account />}
          {current === 'settings' && <SettingsPage />}
        </main>
      </div>
      <Toasts toasts={toasts} />
    </Ctx.Provider>
  );
}

function Toasts({ toasts }: { toasts: { id: number; msg: string }[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Icon name="check" />
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function initialPage(): PageId {
  if (import.meta.env.DEV) {
    const p = new URLSearchParams(location.search).get('page');
    if (p && ['home', 'device', 'checks', 'help', 'account', 'settings'].includes(p)) return p as PageId;
  }
  return 'home';
}
