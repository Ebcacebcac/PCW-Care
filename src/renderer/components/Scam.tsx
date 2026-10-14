/* Scam protection (0.2): "We never cold-call you" and the verified-call
   check ("Is this really PC Workshop calling?"). */

import { useCallback, useEffect, useState } from 'react';
import type { CallStatus } from '../../shared/types';
import { PHONE_DISPLAY } from '../../shared/contact';
import { useCare } from '../context';
import { Icon } from './Icon';
import { Spinner } from './ui';

export const CALL_POLL_MS = 30_000;

export function NeverColdCall({ full = false, className = '' }: { full?: boolean; className?: string }) {
  const { api } = useCare();
  return (
    <section className={`card card-pad help-card ${className}`}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="icon-tile">
          <Icon name="shieldCheck" />
        </span>
        <div>
          <h2 className="card-title">We never cold-call you</h2>
          <p style={{ marginTop: 2 }}>Scammers often pretend to be from a computer company. Here’s what we will never do.</p>
        </div>
      </div>
      <ul className="never-list">
        <li>
          <Icon name="x" />
          <span>
            <b>Ring you out of the blue</b> about viruses, refunds or problems with your computer.
          </span>
        </li>
        <li>
          <Icon name="x" />
          <span>
            <b>Ask you to install AnyDesk, TeamViewer or similar.</b> We only use PCW-Connect, and only after you’ve asked us for help.
          </span>
        </li>
        <li>
          <Icon name="x" />
          <span>
            <b>Ask for bank details, card numbers or gift cards</b> over the phone.
          </span>
        </li>
        {full ? (
          <li>
            <Icon name="x" />
            <span>
              <b>Pressure you to act right now.</b> Microsoft, Apple, BT and your bank don’t cold-call about computer problems either.
            </span>
          </li>
        ) : null}
      </ul>
      <div className="actions">
        <span style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'center', flex: 1, minWidth: 180 }}>Not sure? Hang up and ring us yourself.</span>
        <button className="btn btn-secondary btn-sm" onClick={() => void api.open('phone')}>
          <Icon name="phone" />
          {PHONE_DISPLAY}
        </button>
      </div>
    </section>
  );
}

/* Polls GET /call-status every 30 s while the page is visible, plus on
   demand. 'unavailable' (older server, or not signed in) hides the card. */
export function useCallStatus(enabled: boolean): { status: CallStatus | null; checkedAt: string | null; busy: boolean; check: () => void } {
  const { api } = useCare();
  const [status, setStatus] = useState<CallStatus | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await api.getCallStatus();
    setStatus(s);
    setCheckedAt(new Date().toISOString());
  }, [api]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void api.getCallStatus().then((s) => {
        if (!alive) return;
        setStatus(s);
        setCheckedAt(new Date().toISOString());
      });
    };
    tick();
    const t = setInterval(tick, CALL_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [api, enabled]);

  const check = useCallback(() => {
    setBusy(true);
    void load().finally(() => setBusy(false));
  }, [load]);

  return { status, checkedAt, busy, check };
}

export function CallCheck({ call }: { call: ReturnType<typeof useCallStatus> }) {
  const { status, checkedAt, busy, check } = call;
  if (status?.state === 'unavailable') return null;

  let answer;
  if (!status) {
    answer = (
      <div className="call-answer s-unknown">
        <span className="status-icon s-unknown">
          <Spinner />
        </span>
        <div>
          <strong>Checking…</strong>
        </div>
      </div>
    );
  } else if (status.state === 'calling') {
    answer = (
      <div className="call-answer s-ok" role="status">
        <span className="status-icon s-ok">
          <Icon name="check" />
        </span>
        <div>
          <strong>Yes — {status.staffName} from PC Workshop is calling you now.</strong>
          <span>Our system confirms it{status.expiresAt ? ` until ${timeOf(status.expiresAt)}` : ''}. It’s safe to carry on.</span>
        </div>
      </div>
    );
  } else if (status.state === 'not_calling') {
    answer = (
      <div className="call-answer s-bad" role="status">
        <span className="status-icon s-bad">
          <Icon name="phoneOff" />
        </span>
        <div>
          <strong>No — we are not calling you right now. Hang up.</strong>
          <span>If you rang us yourself on {PHONE_DISPLAY}, you’re talking to us.</span>
        </div>
      </div>
    );
  } else {
    answer = (
      <div className="call-answer s-unknown" role="status">
        <span className="status-icon s-unknown">
          <Icon name="question" />
        </span>
        <div>
          <strong>We couldn’t check just now.</strong>
          <span>If in doubt, hang up and call us on {PHONE_DISPLAY}.</span>
        </div>
      </div>
    );
  }

  return (
    <section className="card card-pad help-card call-card">
      <div className="call-head">
        <span className="icon-tile blue">
          <Icon name="phone" />
        </span>
        <div>
          <h2 className="card-title">Is this really PC Workshop calling?</h2>
          <p style={{ marginTop: 2 }}>When one of our team rings you, they confirm it here. If it doesn’t say yes, it isn’t us.</p>
        </div>
      </div>
      {answer}
      <div className="actions" style={{ alignItems: 'center' }}>
        <span className="call-meta" style={{ flex: 1 }}>
          {checkedAt ? `Checked at ${timeOf(checkedAt)} · updates every 30 seconds` : ''}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={check} disabled={busy}>
          {busy ? <Spinner /> : <Icon name="refresh" />}
          Check again
        </button>
      </div>
    </section>
  );
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}
