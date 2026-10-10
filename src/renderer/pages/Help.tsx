import { useEffect, useState, type FormEvent } from 'react';
import type { ConnectStatus, RemoteRequestSummary } from '../../shared/types';
import { EMAIL, HOURS_NOTE, PHONE_DISPLAY, WORKSHOPS } from '../../shared/contact';
import { formatDateTime } from '../../shared/format';
import { useCare } from '../context';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';

export function Help() {
  const { state } = useCare();
  const linked = state.mode === 'linked';
  const maintenance = linked && state.account?.flags.maintenance === true;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Get help</h1>
          <p>Talk to the PC Workshop team — real people in Newcastle who know your computer.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="span-2">{linked ? <TicketForm /> : <TicketSignedOut />}</div>
        {maintenance ? <RemoteSupport /> : null}
        <ConnectCard />
        <BookInCard />
        {maintenance ? <WebsiteCard /> : null}
        <Contact />
      </div>
    </div>
  );
}

function TicketForm() {
  const { api, prefill, clearPrefill, report } = useCare();
  const [subject, setSubject] = useState(prefill?.subject ?? '');
  const [message, setMessage] = useState(prefill?.message ?? '');
  const [include, setInclude] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (prefill) {
      setSubject(prefill.subject);
      setMessage(prefill.message);
      setDone(null);
      clearPrefill();
    }
  }, [prefill, clearPrefill]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = subject.trim();
    const m = message.trim();
    if (s.length < 3) return setError('Please add a short subject (at least 3 characters).');
    if (!m) return setError('Please tell us what you need help with.');
    setBusy(true);
    setError(null);
    const r = await api.createTicket({ subject: s, message: m, includeReport: include });
    setBusy(false);
    if (r.ok) {
      setDone(r.data.ticket.ref);
      setSubject('');
      setMessage('');
    } else {
      setError(r.error.message);
    }
  }

  if (done) {
    return (
      <section className="card card-pad">
        <div className="ticket-done" role="status">
          <span className="eyebrow">Ticket opened</span>
          <span className="ticket-ref num">{done}</span>
          <p className="card-sub">Thanks — we’ve got it. We’ll reply in your Customer Hub and by email.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => void api.open('hub')}>
              <Icon name="external" />
              View in Customer Hub
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDone(null)}>
              Open another ticket
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card card-pad">
      <form onSubmit={submit} noValidate>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
          <span className="help-card">
            <span className="icon-tile">
              <Icon name="ticket" />
            </span>
          </span>
          <div>
            <h2 className="card-title">Open a support ticket</h2>
            <p className="card-sub">Tell us what’s wrong and we’ll get back to you.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-subject">Subject</label>
          <input id="t-subject" className="input" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. My laptop is running slowly" />
        </div>
        <div className="field">
          <label htmlFor="t-message">How can we help?</label>
          <textarea id="t-message" className="textarea" value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} placeholder="What’s happening, and when did it start?" />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
          <span>
            Include my computer’s details
            <small>
              {report
                ? 'Model, serial number, system version and anything our checks flagged — it saves you looking them up.'
                : 'We’ll include your computer’s details once a check has run.'}
            </small>
          </span>
        </label>
        {error ? (
          <div className="alert s-bad" role="alert" style={{ marginTop: 14 }}>
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="form-foot">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <Spinner /> : null}
            {busy ? 'Sending…' : 'Send ticket'}
          </button>
          <span className="count num">{message.length.toLocaleString('en-GB')} / 4,000</span>
        </div>
      </form>
    </section>
  );
}

function TicketSignedOut() {
  const { api, setState } = useCare();
  return (
    <section className="card card-pad help-card">
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span className="icon-tile">
          <Icon name="ticket" />
        </span>
        <div>
          <h2 className="card-title">Open a support ticket</h2>
          <p>Sign in with your Customer Hub access code to send tickets straight from here — or get in touch by phone or email.</p>
        </div>
      </div>
      <div className="actions">
        <button className="btn btn-primary" onClick={() => void api.showSignIn().then(setState)}>
          Sign in
        </button>
        <button className="btn btn-secondary" onClick={() => void api.open('email')}>
          <Icon name="mail" />
          Email us
        </button>
        <button className="btn btn-secondary" onClick={() => void api.open('phone')}>
          <Icon name="phone" />
          {PHONE_DISPLAY}
        </button>
      </div>
    </section>
  );
}

function RemoteSupport() {
  const { api, toast } = useCare();
  const [live, setLive] = useState<RemoteRequestSummary | null | undefined>(undefined);
  const [preferred, setPreferred] = useState<'asap' | 'later'>('asap');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api.getSummary().then((r) => {
      if (alive) setLive(r.ok ? r.data.remoteRequest : null);
    });
    return () => {
      alive = false;
    };
  }, [api]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const r = await api.requestRemoteSupport({ preferred, note });
    setBusy(false);
    if (r.ok) {
      setLive({ id: r.data.request.id, status: r.data.request.status, scheduledFor: null });
      toast(`Request sent — ticket ${r.data.ticket.ref}`);
    } else if (r.error.code === 'already_requested') {
      setNotice(r.error.message);
      const s = await api.getSummary();
      if (s.ok) setLive(s.data.remoteRequest);
    } else {
      setError(r.error.message);
    }
  }

  return (
    <section className="card card-pad help-card">
      <span className="icon-tile blue">
        <Icon name="remote" />
      </span>
      <h2 className="card-title">Remote support</h2>
      {live === undefined ? (
        <p>
          <Spinner /> Checking for an open request…
        </p>
      ) : live && live.status !== 'done' && live.status !== 'cancelled' ? (
        <>
          <div className="alert s-ok">
            <Icon name="check" />
            <span>
              {live.status === 'scheduled' && live.scheduledFor
                ? `We’ll connect on ${formatDateTime(live.scheduledFor)}.`
                : live.status === 'started'
                  ? 'A technician is connecting now — keep an eye out for the request on your screen.'
                  : 'We’ve got your request and will be in touch to arrange a time.'}
            </span>
          </div>
          {notice ? <p>{notice}</p> : null}
          <p>When we connect, you’ll be asked to approve it on this computer. Nothing happens without your say-so.</p>
        </>
      ) : (
        <form onSubmit={submit}>
          <p style={{ marginBottom: 12 }}>Part of your maintenance plan: we connect to your computer and sort it out while you watch.</p>
          <div className="choice-row" role="radiogroup" aria-label="When should we connect?">
            <button type="button" role="radio" aria-checked={preferred === 'asap'} className={`choice${preferred === 'asap' ? ' selected' : ''}`} onClick={() => setPreferred('asap')}>
              <span className="radio" />
              <span>
                <strong>As soon as possible</strong>
                <small>We’ll be in touch shortly</small>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={preferred === 'later'} className={`choice${preferred === 'later' ? ' selected' : ''}`} onClick={() => setPreferred('later')}>
              <span className="radio" />
              <span>
                <strong>Arrange a time</strong>
                <small>We’ll agree one with you</small>
              </span>
            </button>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="r-note">Anything we should know? (optional)</label>
            <textarea id="r-note" className="textarea" style={{ minHeight: 70 }} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error ? (
            <div className="alert s-bad" role="alert" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          ) : null}
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              Request remote support
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ConnectCard() {
  const { api } = useCare();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    let live = true;
    // Quick "is it installed?" first, then the ID (PCW-Connect takes a moment to answer).
    void api.getConnectStatus(false).then((s) => {
      if (!live) return;
      setStatus(s);
      if (s.installed) void api.getConnectStatus(true).then((full) => live && setStatus(full));
    });
    return () => {
      live = false;
    };
  }, [api]);

  if (status && !status.supported) return null;

  if (status?.installed) {
    return (
      <section className="card card-pad help-card">
        <span className="icon-tile">
          <Icon name="remote" />
        </span>
        <h2 className="card-title">PCW-Connect is installed</h2>
        <p>If one of our technicians asks to connect, open PCW-Connect and read them this computer’s ID. You’ll be asked to accept before anyone can see your screen.</p>
        <div className="connect-id">
          <span className="connect-id-label">Your ID</span>
          {status.idDisplay ? (
            <>
              <strong className="connect-id-value selectable num">{status.idDisplay}</strong>
              <button
                className="btn btn-ghost btn-sm"
                aria-label="Copy your PCW-Connect ID"
                onClick={() => {
                  void api.copyText(status.id ?? '');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Icon name="copy" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </>
          ) : (
            <span className="connect-id-missing">Shown in PCW-Connect when you open it</span>
          )}
        </div>
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => void api.openConnect().then((ok) => setOpenFailed(!ok))}
          >
            <Icon name="external" />
            Open PCW-Connect
          </button>
        </div>
        {openFailed ? (
          <div className="alert s-bad" role="alert">
            <Icon name="alert" />
            <span>PCW-Connect wouldn’t open. Try it from the Start menu, or call us on {PHONE_DISPLAY}.</span>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="card card-pad help-card">
      <span className="icon-tile blue">
        <Icon name="download" />
      </span>
      <h2 className="card-title">Download PCW-Connect</h2>
      <p>
        {status
          ? 'PCW-Connect isn’t on this computer yet. If one of our technicians has asked to connect, get it from the support page and give them the code they ask for.'
          : 'Checking whether PCW-Connect is installed…'}
      </p>
      <div className="actions">
        <button className="btn btn-secondary" onClick={() => void api.open('support-page')}>
          <Icon name="external" />
          Open the support page
        </button>
      </div>
    </section>
  );
}

function BookInCard() {
  const { api } = useCare();
  return (
    <section className="card card-pad help-card">
      <span className="icon-tile">
        <Icon name="calendar" />
      </span>
      <h2 className="card-title">Book my device in</h2>
      <p>Bring your computer to our Gosforth or Benton workshop. Pick a day and time that suits you.</p>
      <div className="actions">
        <button className="btn btn-secondary" onClick={() => void api.open('book-in')}>
          <Icon name="external" />
          Book a drop-off
        </button>
      </div>
    </section>
  );
}

function WebsiteCard() {
  const { api } = useCare();
  return (
    <section className="card card-pad help-card">
      <span className="icon-tile">
        <Icon name="globe" />
      </span>
      <h2 className="card-title">Your Customer Hub</h2>
      <p>Track repairs, see invoices and message the team online at customer.pcwhub.co.uk.</p>
      <div className="actions">
        <button className="btn btn-secondary" onClick={() => void api.open('hub')}>
          <Icon name="external" />
          Open Customer Hub
        </button>
      </div>
    </section>
  );
}

function Contact() {
  const { api } = useCare();
  return (
    <section className="card card-pad span-2">
      <h2 className="card-title">Contact us</h2>
      <p className="card-sub" style={{ marginBottom: 14 }}>
        Give us a call, drop us an email or pop into either workshop.
      </p>
      <div className="contact-grid">
        <button className="contact-btn" onClick={() => void api.open('phone')}>
          <Icon name="phone" />
          <span style={{ minWidth: 0 }}>
            <small>Call us</small>
            <strong className="num">{PHONE_DISPLAY}</strong>
          </span>
        </button>
        <button className="contact-btn" onClick={() => void api.open('email')}>
          <Icon name="mail" />
          <span style={{ minWidth: 0 }}>
            <small>Email us</small>
            <strong>{EMAIL}</strong>
          </span>
        </button>
        <button className="contact-btn" onClick={() => void api.open('website')}>
          <Icon name="globe" />
          <span style={{ minWidth: 0 }}>
            <small>Website</small>
            <strong>pcworkshop.co.uk</strong>
          </span>
        </button>
      </div>
      <div className="workshops">
        {WORKSHOPS.map((w) => (
          <div key={w.name} className="workshop">
            <h3>{w.name} workshop</h3>
            <address className="selectable">
              {w.addressLines.map((l) => (
                <span key={l}>
                  {l}
                  <br />
                </span>
              ))}
            </address>
            <dl className="hours">
              {w.hours.map((h) => (
                <div key={h.days} style={{ display: 'contents' }}>
                  <dt>{h.days}</dt>
                  <dd className="num">{h.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="card-sub" style={{ marginTop: 14, fontSize: 12.5 }}>
        {HOURS_NOTE} Sunday visits are by appointment — give us a ring to arrange one.
      </p>
    </section>
  );
}
