import { useState } from 'react';
import type { CheckCategory, CheckResult, FixId } from '../../shared/types';
import { relativeTime } from '../../shared/format';
import { useCare } from '../context';
import { Icon } from '../components/Icon';
import { CATEGORY, Pill, Spinner, StatusIcon, fixLabel } from '../components/ui';

const ORDER: CheckCategory[] = ['updates', 'security', 'backup', 'storage', 'battery', 'memory', 'performance'];

/* Fixes worth offering even when a check is fine. */
const ALWAYS_OFFERED: FixId[] = ['clean-temp', 'open:recovery-key'];

export function Checks() {
  const { report, progress, runCheck } = useCare();
  const checks = report?.checks ?? [];
  const counts = {
    ok: checks.filter((c) => c.status === 'ok').length,
    attention: checks.filter((c) => c.status === 'warn').length,
    bad: checks.filter((c) => c.status === 'bad').length,
    info: checks.filter((c) => c.status === 'info').length,
    unknown: checks.filter((c) => c.status === 'unknown').length,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Maintenance</h1>
          <p>We check the things that keep your computer safe and running smoothly. Fixes only ever open a setting or ask you first.</p>
        </div>
        <button className="btn btn-primary" onClick={runCheck} disabled={progress.running}>
          {progress.running ? <Spinner /> : <Icon name="refresh" />}
          {progress.running ? 'Checking…' : 'Run a check'}
        </button>
      </div>

      {progress.running ? (
        <div className="running-banner" role="status">
          <Spinner />
          Checking your computer… <span>Windows and macOS updates can take up to a minute to check.</span>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="summary-bar">
            <Pill status="ok">{counts.ok} looking good</Pill>
            {counts.attention ? <Pill status="warn">{counts.attention} worth a look</Pill> : null}
            {counts.bad ? <Pill status="bad">{counts.bad} to fix</Pill> : null}
            {counts.info ? <Pill status="info">{counts.info} good to know</Pill> : null}
            {counts.unknown ? <Pill status="unknown">{counts.unknown} not checked</Pill> : null}
            <span className="meta">Last checked {relativeTime(report.collectedAt)}</span>
          </div>
          {ORDER.map((cat) => {
            const items = checks.filter((c) => c.category === cat);
            if (!items.length) return null;
            return (
              <section key={cat} className="card group" aria-labelledby={`g-${cat}`}>
                <div className="group-head">
                  <Icon name={CATEGORY[cat].icon} />
                  <h2 id={`g-${cat}`}>{CATEGORY[cat].label}</h2>
                </div>
                {items.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </section>
            );
          })}
        </>
      ) : !progress.running ? (
        <div className="card card-pad empty">No check has run yet. Press “Run a check” to start.</div>
      ) : null}
    </div>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const { api, state, askUs, toast } = useCare();
  const [busy, setBusy] = useState<FixId | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const needsWork = check.status === 'warn' || check.status === 'bad';
  const fixes = needsWork || check.status === 'unknown' ? check.fixes : check.fixes.filter((f) => ALWAYS_OFFERED.includes(f));

  async function fix(f: FixId) {
    setBusy(f);
    setOutcome(null);
    const r = await api.runFix(check.id, f);
    setBusy(null);
    if (r.ok) {
      if (r.message) setOutcome({ ok: true, text: r.message });
      else if (f.startsWith('open:')) toast('Opened in settings');
    } else if (!r.cancelled && r.message) {
      setOutcome({ ok: false, text: r.message });
    }
  }

  return (
    <div className="check-row">
      <StatusIcon status={check.status} />
      <div>
        <h3>{check.title}</h3>
        <p className="selectable">{check.detail}</p>
        {check.localNote ? (
          <p className="local-note selectable" title="Only shown on this computer — not sent to PC Workshop">
            <Icon name="lock" />
            {check.localNote}
          </p>
        ) : null}
        {outcome ? <p className={`outcome${outcome.ok ? '' : ' err'}`}>{outcome.text}</p> : null}
      </div>
      <div className="check-actions">
        {fixes.map((f, i) => (
          <button
            key={f}
            className={`btn btn-sm ${i === 0 && needsWork ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => void fix(f)}
            disabled={busy != null}
          >
            {busy === f ? <Spinner /> : null}
            {fixLabel(f, state.platform)}
          </button>
        ))}
        {needsWork || (check.status === 'info' && check.askUs) ? (
          <button className="btn btn-sm btn-ghost" onClick={() => askUs(check)}>
            Ask PC Workshop
          </button>
        ) : null}
      </div>
    </div>
  );
}
