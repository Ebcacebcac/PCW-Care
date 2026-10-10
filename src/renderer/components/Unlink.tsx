import { useState } from 'react';
import { useCare } from '../context';
import { Icon } from './Icon';
import { Modal, Spinner } from './ui';

/* "Unlink this computer" with a confirmation step (POST /unlink). */
export function UnlinkButton({ small }: { small?: boolean }) {
  const { api, setState, toast } = useCare();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setBusy(true);
    setError(null);
    const r = await api.unlink();
    setBusy(false);
    if (r.ok) {
      setConfirm(false);
      toast('This computer has been unlinked');
      setState(r.data);
    } else {
      setError(r.error.message);
    }
  }

  return (
    <>
      <button className={`btn btn-danger${small ? ' btn-sm' : ''}`} onClick={() => setConfirm(true)}>
        Unlink this computer
      </button>
      {confirm ? (
        <Modal
          title="Unlink this computer?"
          onClose={() => !busy && setConfirm(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirm(false)} disabled={busy}>
                Keep it linked
              </button>
              <button className="btn btn-danger-solid" onClick={() => void unlink()} disabled={busy}>
                {busy ? <Spinner /> : null}
                Unlink
              </button>
            </>
          }
        >
          <p>
            PC Workshop will stop receiving health checks from this computer, and you won’t be able to send tickets from PCW Care until you sign in
            again. Your Customer Hub account isn’t affected.
          </p>
          {error ? (
            <div className="alert s-bad" role="alert" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
