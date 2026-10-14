import { useEffect, useMemo, useState } from 'react';
import type { HistoryEntry } from '../../shared/types';
import { monthlySummary } from '../../shared/monthly';
import { formatDate, formatGb } from '../../shared/format';
import { useCare } from '../context';
import { Icon } from '../components/Icon';
import { Pill, Spinner, StatusIcon } from '../components/ui';

/* Monthly health summary (0.2) for maintenance plan customers — worked
   out from the check history kept on this computer. */
export function Summary() {
  const { api, go, goRemoteSupport, state } = useCare();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const maintenance = state.account?.flags.maintenance === true;

  useEffect(() => {
    let alive = true;
    void api.getHistory().then((e) => alive && setEntries(e));
    return () => {
      alive = false;
    };
  }, [api]);

  const sum = useMemo(() => (entries ? monthlySummary(entries, new Date()) : null), [entries]);

  return (
    <div className="page">
      <button className="back-link" onClick={() => go('home')}>
        <Icon name="arrowLeft" />
        Back to Home
      </button>
      <div className="page-head">
        <div>
          <h1>Your monthly health summary</h1>
          <p>
            {sum ? `${formatDate(sum.from)} to ${formatDate(sum.to)}. ` : ''}
            Made on this computer from PCW Care’s checks{maintenance ? ' — part of your maintenance plan' : ''}.
          </p>
        </div>
      </div>

      {!sum ? (
        <div className="card card-pad empty">
          <Spinner />
        </div>
      ) : sum.checks === 0 ? (
        <div className="card card-pad empty">No checks in the last 30 days yet. PCW Care checks once a day while it’s running.</div>
      ) : (
        <div className="stack">
          <div className="stat-row">
            <div className="card stat">
              <div className="label">Checks run</div>
              <div className="value num">{sum.checks}</div>
              <div className="sub">
                on {sum.daysChecked} day{sum.daysChecked === 1 ? '' : 's'}
              </div>
            </div>
            <div className="card stat">
              <div className="label">Looking good now</div>
              <div className="value num">{sum.latestCounts.ok}</div>
              <div className="sub">at the latest check</div>
            </div>
            <div className="card stat">
              <div className="label">Still to look at</div>
              <div className="value num" style={{ color: sum.issues.length ? 'var(--amber)' : undefined }}>
                {sum.issues.length}
              </div>
              <div className="sub">{sum.resolved.length ? `${sum.resolved.length} sorted this month` : 'nothing sorted yet'}</div>
            </div>
            <div className="card stat">
              <div className="label">{sum.disk ? `Free space on ${sum.disk.name}` : 'Free space'}</div>
              <div className="value num">{sum.disk ? formatGb(sum.disk.lastFreeGb) : '—'}</div>
              <div className="sub">{sum.disk ? diskTrend(sum.disk.firstFreeGb, sum.disk.lastFreeGb) : ''}</div>
            </div>
          </div>

          <section className="card">
            <div className="card-head">
              <h2>Still needs a look</h2>
              <span className="sub">from the latest check</span>
            </div>
            {sum.issues.length ? (
              sum.issues.map((i) => (
                <div key={i.id} className="list-row">
                  <StatusIcon status={i.latest ?? 'warn'} />
                  <div className="grow">
                    <strong>{i.title}</strong>
                    <small>
                      Flagged in {i.times} check{i.times === 1 ? '' : 's'} this month
                    </small>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => go('checks')}>
                    See what to do
                  </button>
                </div>
              ))
            ) : (
              <p className="empty">Nothing — everything we check looked fine at the latest check.</p>
            )}
          </section>

          {sum.resolved.length ? (
            <section className="card">
              <div className="card-head">
                <h2>Sorted this month</h2>
              </div>
              {sum.resolved.map((i) => (
                <div key={i.id} className="list-row">
                  <StatusIcon status="ok" />
                  <div className="grow">
                    <strong>{i.title}</strong>
                    <small>Was flagged {i.times} time{i.times === 1 ? '' : 's'}, fine now</small>
                  </div>
                  <Pill status="ok">Sorted</Pill>
                </div>
              ))}
            </section>
          ) : null}

          <div className="card card-pad help-strip" style={{ marginTop: 0 }}>
            <div className="grow">
              <strong>Want us to look at anything?</strong>
              {maintenance ? 'Remote support is included in your plan — we connect, you watch.' : 'Open a ticket or give us a call.'}
            </div>
            {maintenance ? (
              <button className="btn btn-primary" onClick={goRemoteSupport}>
                <Icon name="remote" />
                Request remote support
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => go('help')}>
                Get help
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function diskTrend(first: number, last: number): string {
  const d = Math.round((last - first) * 10) / 10;
  if (Math.abs(d) < 1) return 'about the same as a month ago';
  return d < 0 ? `${formatGb(-d)} less than a month ago` : `${formatGb(d)} more than a month ago`;
}
