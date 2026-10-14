import { useState, type FormEvent } from 'react';
import { useCare } from '../context';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { PHONE_DISPLAY } from '../../shared/contact';
import logo from '../assets/logo.png';
import { Privacy } from './Privacy';

export function SignIn() {
  const { api, state, setState, toast } = useCare();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = code.replace(/\s+/g, '');
    if (!value) {
      setError('Type in your access code first.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api.link(value);
    setBusy(false);
    if (r.ok) {
      toast(`Welcome, ${r.data.account?.client.firstName ?? 'and thanks'}! This computer is now linked.`);
      setState(r.data);
    } else {
      setError(r.error.message);
    }
  }

  if (privacy) {
    return (
      <div className="signin-privacy">
        <Privacy onBack={() => setPrivacy(false)} backLabel="Back to sign in" />
      </div>
    );
  }

  return (
    <div className="signin">
      <section className="signin-brand">
        <div className="signin-logo">
          <img src={logo} alt="PC Workshop" />
        </div>
        <h1>
          PCW <span>Care</span>
        </h1>
        <p className="lead">Keeps an eye on your computer and puts PC Workshop one click away.</p>
        <ul className="perks">
          <li>
            <Icon name="shieldCheck" />
            <span>
              <strong>Health checks</strong>
              Updates, virus protection, storage, battery and more — in plain English.
            </span>
          </li>
          <li>
            <Icon name="wrench" />
            <span>
              <strong>Safe fixes</strong>
              One click takes you to the right setting. Nothing changes without asking you.
            </span>
          </li>
          <li>
            <Icon name="lifebuoy" />
            <span>
              <strong>Help from people you know</strong>
              Open a ticket, book your device in or ask for remote support.
            </span>
          </li>
        </ul>
        <p className="foot">PC Workshop Ltd · Gosforth &amp; Benton, Newcastle upon Tyne</p>
      </section>

      <section className="signin-form">
        <form className="inner" onSubmit={submit} noValidate>
          <h2>Link this computer</h2>
          <p className="intro">
            Enter your Customer Hub access code — the code you use to sign in at <b>customer.pcwhub.co.uk</b>.
          </p>

          {state.notice && !error ? (
            <div className="alert s-unknown" style={{ marginBottom: 16 }}>
              <Icon name="info" />
              <span>{state.notice}</span>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="code">Access code</label>
            <input
              id="code"
              className="input code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'code-error' : undefined}
            />
          </div>

          {error ? (
            <div className="alert s-bad" id="code-error" role="alert" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          ) : null}

          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
            {busy ? <Spinner /> : <Icon name="link" />}
            {busy ? 'Linking…' : 'Link this computer'}
          </button>

          <div className="or">or</div>

          <button className="btn btn-secondary" type="button" onClick={() => void api.useWithoutSigningIn().then(setState)}>
            Use without signing in
          </button>

          <p className="small-print">
            Don’t have a code? Call us on{' '}
            <button type="button" className="link" onClick={() => void api.open('phone')}>
              {PHONE_DISPLAY}
            </button>{' '}
            and we’ll set you up.
          </p>
          <p className="small-print" style={{ marginTop: 6 }}>
            <button type="button" className="link" onClick={() => setPrivacy(true)}>
              What PCW Care shares, and what stays on your computer
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}
