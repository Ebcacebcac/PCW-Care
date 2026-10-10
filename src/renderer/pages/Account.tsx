import { useEffect, useState } from 'react';
import type { ApiError, Status, SummaryResponse } from '../../shared/types';
import { formatDate, formatMoney, relativeTime } from '../../shared/format';
import { useCare } from '../context';
import { Icon } from '../components/Icon';
import { Pill, Spinner, initials } from '../components/ui';
import { UnlinkButton } from '../components/Unlink';

function statusTone(s: string): Status {
  const v = s.toLowerCase();
  if (/(ready|complete|collected|done|paid|resolved|closed)/.test(v)) return 'ok';
  if (/(overdue|cancel|declin|fail)/.test(v)) return 'bad';
  if (/(wait|await|hold|parts|quote|unpaid|due|open|pending)/.test(v)) return 'warn';
  return 'unknown';
}

function niceStatus(s: string): string {
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function Account() {
  const { api, state, report } = useCare();
  const acc = state.account;
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void api.refreshAccount();
    void api.getSummary().then((r) => {
      if (!alive) return;
      setLoading(false);
      if (r.ok) setSummary(r.data);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [api]);

  if (!acc) return null;
  const unpaid = (summary?.invoices ?? []).filter((i) => i.balance > 0);
  const owed = unpaid.reduce((sum, i) => sum + i.balance, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div className="account-head">
          <span className="avatar">{initials(acc.client.firstName, acc.client.lastName)}</span>
          <div>
            <h1>
              {acc.client.firstName} {acc.client.lastName}
            </h1>
            <p style={{ marginTop: 2 }}>{[acc.client.company, acc.client.email].filter(Boolean).join(' · ') || 'PC Workshop customer'}</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => void api.open('hub')}>
          <Icon name="external" />
          Open Customer Hub
        </button>
      </div>

      {error ? (
        <div className={`alert s-${error.code === 'offline' ? 'unknown' : 'bad'}`} style={{ marginBottom: 16 }}>
          <Icon name="alert" />
          <span>{error.message}</span>
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card span-2">
          <div className="card-head">
            <h2>Your repairs</h2>
            <span className="sub">{summary ? `${summary.jobs.length} recent` : ''}</span>
          </div>
          {loading ? (
            <Loading />
          ) : summary && summary.jobs.length ? (
            summary.jobs.map((j) => (
              <div key={j.id} className="list-row">
                <span className="tile-icon s-unknown" style={{ width: 32, height: 32 }}>
                  <Icon name="wrench" />
                </span>
                <div className="grow">
                  <strong>{j.title || 'Repair'}</strong>
                  <small className="num">
                    {j.ref}
                    {j.updatedAt ? ` · updated ${relativeTime(j.updatedAt)}` : ''}
                  </small>
                </div>
                <Pill status={statusTone(j.status)}>{niceStatus(j.status)}</Pill>
              </div>
            ))
          ) : (
            <p className="empty">No repairs in progress.</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Invoices</h2>
            {owed > 0 ? <span className="sub money">{formatMoney(owed)} to pay</span> : null}
          </div>
          {loading ? (
            <Loading />
          ) : summary && summary.invoices.length ? (
            summary.invoices.map((inv) => (
              <div key={inv.id} className="list-row">
                <div className="grow">
                  <strong className="num">Invoice {inv.number}</strong>
                  <small>{inv.balance > 0 ? (inv.dueDate ? `Due ${formatDate(inv.dueDate)}` : 'Unpaid') : `Total ${formatMoney(inv.total)}`}</small>
                </div>
                {inv.balance > 0 ? <span className="money">{formatMoney(inv.balance)}</span> : <Pill status="ok">Paid</Pill>}
              </div>
            ))
          ) : (
            <p className="empty">Nothing to pay. Thank you!</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Support tickets</h2>
          </div>
          {loading ? (
            <Loading />
          ) : summary && summary.tickets.length ? (
            summary.tickets.map((t) => (
              <div key={t.id} className="list-row">
                <div className="grow">
                  <strong>{t.subject}</strong>
                  <small className="num">
                    {t.ref}
                    {t.updatedAt ? ` · ${relativeTime(t.updatedAt)}` : ''}
                  </small>
                </div>
                <Pill status={statusTone(t.status)}>{niceStatus(t.status)}</Pill>
              </div>
            ))
          ) : (
            <p className="empty">No tickets yet.</p>
          )}
        </section>

        <section className="card card-pad span-2 danger-zone">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <h2 className="card-title">This computer</h2>
              <p className="card-sub">
                {report?.device.name || acc.device.name || 'This computer'} is linked to your account and shares its health checks with PC Workshop.
              </p>
            </div>
            <UnlinkButton />
          </div>
        </section>
      </div>

    </div>
  );
}

function Loading() {
  return (
    <div className="empty" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Spinner /> Loading…
    </div>
  );
}
