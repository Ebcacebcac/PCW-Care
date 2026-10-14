import { EMAIL, PHONE_DISPLAY, WORKSHOPS } from '../../shared/contact';
import { useCare } from '../context';
import { Icon } from '../components/Icon';

/* The full privacy information (0.2). Reached from Settings and from the
   sign-in page. Keep it in step with snapshot.ts and the README's
   "What is sent to PC Workshop". */
export function Privacy({ onBack, backLabel = 'Back to Settings' }: { onBack: () => void; backLabel?: string }) {
  const { api, state } = useCare();
  const linked = state.mode === 'linked';

  return (
    <div className="page">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" />
        {backLabel}
      </button>
      <div className="page-head">
        <div>
          <h1>Your privacy</h1>
          <p>What PCW Care looks at, what stays on this computer, what is sent to PC Workshop, and how to stop it.</p>
        </div>
      </div>

      <div className="stack prose">
        <section className="card card-pad">
          <h2>In short</h2>
          <ul>
            <li>
              <b>Nothing leaves this computer unless you sign in</b> and link it to your PC Workshop account.
            </li>
            <li>
              When it’s linked, PC Workshop sees a <b>health report</b>: your computer’s make, model and serial number, its system, and the result of each
              check. Never your files, emails, photos, browsing or passwords.
            </li>
            <li>
              The names of apps you run — including any remote access app or any app that crashed — <b>stay on this computer</b>.
            </li>
            <li>
              You can <b>unlink at any time</b> from Settings or My account, and nothing more is sent.
            </li>
          </ul>
          {linked ? null : (
            <p style={{ marginTop: 10 }}>
              <b>Right now this computer isn’t linked</b>, so PCW Care isn’t sending anything to PC Workshop.
            </p>
          )}
        </section>

        <section className="card card-pad">
          <h2>What PCW Care looks at on this computer</h2>
          <p>To run its checks, PCW Care reads (without needing admin rights):</p>
          <ul>
            <li>the computer’s name, make, model, serial number and whether it’s a laptop or desktop;</li>
            <li>the Windows or macOS version, processor, memory, graphics, drives and battery;</li>
            <li>whether updates, virus protection, the firewall and drive encryption are switched on;</li>
            <li>free space, drive health, temporary files and how long since the last restart;</li>
            <li>whether a backup is set up (OneDrive, File History, Windows Backup or Time Machine);</li>
            <li>how many times apps crashed or the computer shut down unexpectedly in the last 30 days;</li>
            <li>the names of apps that are running, only to spot remote access apps that scammers use;</li>
            <li>for Windows 10, whether the computer looks ready for Windows 11.</li>
          </ul>
        </section>

        <section className="card card-pad">
          <h2>What stays on this computer</h2>
          <p>These are only ever shown to you in PCW Care, and never sent:</p>
          <ul>
            <li>the names of running apps, and which remote access app was found;</li>
            <li>which apps crashed;</li>
            <li>where your folders are kept (used to see whether they’re backed up);</li>
            <li>your check history for the monthly health summary (the last two months);</li>
            <li>your PCW-Connect ID, which is only read when you open Get help;</li>
            <li>a screenshot you take for a ticket, until you send it — if you remove it, it’s thrown away.</li>
          </ul>
        </section>

        <section className="card card-pad">
          <h2>What is sent to PC Workshop — only while linked</h2>
          <p>
            <b>A health report</b> when PCW Care starts, once a day, when you run a check, and before a ticket that includes your computer’s details.
            It contains exactly:
          </p>
          <ul>
            <li>computer name, make, model, serial number and whether it’s a laptop or desktop;</li>
            <li>Windows or macOS name, version, build and processor type;</li>
            <li>processor, number of cores and amount of memory;</li>
            <li>each drive’s name, type, size, free space and health;</li>
            <li>battery health, charge cycles and current charge (laptops);</li>
            <li>how long since the computer last restarted;</li>
            <li>
              the result of each check and the sentence you see on the Maintenance page — for crashes that’s just the numbers, and for remote access
              apps just whether one was running, never its name;
            </li>
            <li>the PCW Care version.</li>
          </ul>
          <p style={{ marginTop: 10 }}>Also, only when you use them:</p>
          <ul>
            <li>support tickets you write, with your computer’s details if you tick the box, and a screenshot if you attach one;</li>
            <li>remote support requests;</li>
            <li>
              every 15 minutes PCW Care asks for updates on your repairs, invoices and tickets, and while the Home page is open it asks every 30 seconds
              whether one of our team is calling you — these send nothing about your computer.
            </li>
          </ul>
          <p style={{ marginTop: 10 }}>
            Our team uses this to help you and to spot problems early. If you’re on a maintenance plan, we’re alerted when a check turns red (or when
            your backup or virus protection needs a look) so we can get in touch.
          </p>
        </section>

        <section className="card card-pad">
          <h2>Never collected</h2>
          <p>
            Your files, photos, emails, messages, browsing history, passwords, what you type outside PCW Care, or the contents of your screen (unless you
            choose to attach a screenshot to a ticket).
          </p>
        </section>

        <section className="card card-pad">
          <h2>How to stop sharing</h2>
          <ul>
            <li>
              <b>Unlink this computer</b> in Settings → Account, or on the My account page. PCW Care stops sending anything straight away and keeps
              working as a health checker.
            </li>
            <li>Turn off repair notifications or starting with your computer in Settings.</li>
            <li>Uninstalling PCW Care stops everything.</li>
            <li>
              To see what we hold about you, or to ask us to delete it, email <b>{EMAIL}</b> or call <b>{PHONE_DISPLAY}</b>.
            </li>
          </ul>
        </section>

        <section className="card card-pad">
          <h2>Who we are</h2>
          <p>
            PCW Care is made by <b>PC Workshop Ltd</b>, the computer repair shop in {WORKSHOPS.map((w) => w.name).join(' and ')}, Newcastle upon Tyne.
            Questions about privacy are always welcome.
          </p>
          <div className="actions" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => void api.open('email')}>
              <Icon name="mail" />
              {EMAIL}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => void api.open('phone')}>
              <Icon name="phone" />
              {PHONE_DISPLAY}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
