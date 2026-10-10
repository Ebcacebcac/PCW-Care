import type { CheckCategory, DeviceReport, Status } from '../../shared/types';
import { categoryStatus, overallStatus } from '../../shared/status';
import { formatGb, relativeTime } from '../../shared/format';
import { PHONE_DISPLAY } from '../../shared/contact';
import { useCare } from '../context';
import { Icon, type IconName } from '../components/Icon';
import { Bar, DeviceArt, Spinner, StatusIcon } from '../components/ui';
import mark from '../assets/mark.png';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const { state, report, progress, runCheck, go, copy, api } = useCare();
  const first = state.mode === 'linked' ? state.account?.client.firstName : null;

  return (
    <div className="page">
      <div className="greet">
        <div>
          <h1>{first ? `${greeting()}, ${first}` : greeting()}</h1>
          <p>
            {progress.running
              ? 'Checking your computer now…'
              : report
                ? `Last checked ${relativeTime(report.collectedAt)}.`
                : 'Let’s see how your computer is doing.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={runCheck} disabled={progress.running}>
          {progress.running ? <Spinner /> : <Icon name="refresh" />}
          {progress.running ? 'Checking…' : 'Run a check'}
        </button>
      </div>

      <Hero report={report} running={progress.running} platform={state.platform} onCopy={(t) => copy(t, 'Serial number copied')} onSeeChecks={() => go('checks')} />

      {report ? <Tiles report={report} onOpen={() => go('checks')} /> : <TileSkeletons />}

      <div className="card help-strip">
        <span className="brand-mark">
          <img src={mark} alt="" />
        </span>
        <div className="grow">
          <strong>Need a hand? We’re just around the corner.</strong>
          The PC Workshop team in Gosforth and Benton can help — in person or remotely.
        </div>
        <button className="btn btn-secondary" onClick={() => void api.open('phone')}>
          <Icon name="phone" />
          {PHONE_DISPLAY}
        </button>
        <button className="btn btn-primary" onClick={() => go('help')}>
          Get help
        </button>
      </div>
    </div>
  );
}

function Hero({
  report,
  running,
  platform,
  onCopy,
  onSeeChecks,
}: {
  report: DeviceReport | null;
  running: boolean;
  platform: string;
  onCopy: (t: string) => void;
  onSeeChecks: () => void;
}) {
  const overall = report ? overallStatus(report.checks) : null;
  const status: Status = overall?.status ?? 'unknown';
  const d = report?.device;
  const model = d ? [d.manufacturer, d.model].filter(Boolean).join(' ') : '';
  const osText = report ? [report.os.name, report.os.version].filter(Boolean).join(' ') : '';

  let headline = 'Checking your computer…';
  let sub = 'This usually takes less than a minute.';
  if (report && overall) {
    if (overall.status === 'ok') {
      headline = 'Your computer looks healthy';
      sub = `All ${report.checks.filter((c) => c.status === 'ok').length} checks look good.`;
    } else if (overall.status === 'unknown') {
      headline = 'We couldn’t check everything';
      sub = 'Some checks aren’t available on this computer.';
    } else {
      headline = `${overall.attention} thing${overall.attention === 1 ? '' : 's'} need${overall.attention === 1 ? 's' : ''} attention`;
      sub = overall.problems ? 'Some of these are worth fixing soon.' : 'Nothing urgent — a few quick tidy-ups.';
    }
  } else if (!running) {
    headline = 'No check yet';
    sub = 'Run a check to see how your computer is doing.';
  }

  return (
    <div className="card hero">
      <div className="hero-device">
        <div className="device-art">
          <DeviceArt type={d?.type ?? 'laptop'} platform={platform} />
        </div>
        <div style={{ minWidth: 0 }}>
          {d ? (
            <>
              <h2 title={d.name}>{d.name || 'This computer'}</h2>
              <p className="model" title={model}>
                {model || 'Unknown model'}
              </p>
              <div className="chips">
                {d.serial ? (
                  <span className="chip">
                    Serial <b className="selectable num">{d.serial}</b>
                    <button className="icon-btn" onClick={() => onCopy(d.serial)} aria-label="Copy serial number" title="Copy serial number">
                      <Icon name="copy" />
                    </button>
                  </span>
                ) : null}
                {osText ? (
                  <span className="chip plain">
                    <b>{osText}</b>
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="skeleton" style={{ width: 200, height: 26 }} />
              <div className="skeleton" style={{ width: 160, height: 14, marginTop: 10 }} />
              <div className="skeleton" style={{ width: 220, height: 26, marginTop: 14 }} />
            </>
          )}
        </div>
      </div>
      <div className={`hero-status s-${running && !report ? 'unknown' : status}`}>
        <div className="big-status">
          {running && !report ? (
            <span className="status-icon s-unknown">
              <Spinner />
            </span>
          ) : (
            <StatusIcon status={status} />
          )}
          <div>
            <h3>{headline}</h3>
            <p>{sub}</p>
          </div>
        </div>
        {report && overall && overall.attention > 0 ? (
          <div className="actions">
            <button className="btn btn-secondary btn-sm" onClick={onSeeChecks}>
              See what to do
              <Icon name="arrowRight" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface TileSpec {
  key: CheckCategory;
  label: string;
  icon: IconName;
  value: string;
  sub: string;
  pct?: number;
}

function Tiles({ report, onOpen }: { report: DeviceReport; onOpen: () => void }) {
  const checks = report.checks;
  const tiles: TileSpec[] = [];

  const main = report.disks.length ? [...report.disks].sort((a, b) => (a.name.toUpperCase().startsWith('C') ? -1 : b.name.toUpperCase().startsWith('C') ? 1 : 0))[0] : null;
  tiles.push({
    key: 'storage',
    label: 'Storage',
    icon: 'disk',
    value: main ? `${formatGb(main.freeGb)} free` : 'Unknown',
    sub: main ? `of ${formatGb(main.sizeGb)} on ${main.name}` : 'Couldn’t read your disk',
    pct: main && main.sizeGb > 0 ? ((main.sizeGb - main.freeGb) / main.sizeGb) * 100 : undefined,
  });
  tiles.push({
    key: 'memory',
    label: 'Memory',
    icon: 'chip',
    value: report.memory.totalGb ? `${formatGb(report.memory.totalGb)}` : 'Unknown',
    sub: report.memory.usedPct != null ? `${report.memory.usedPct}% in use right now` : 'Installed memory',
    pct: report.memory.usedPct ?? undefined,
  });
  if (report.battery) {
    tiles.push({
      key: 'battery',
      label: 'Battery',
      icon: 'battery',
      value: report.battery.healthPct != null ? `${report.battery.healthPct}% health` : 'Unknown',
      sub: report.battery.cycles != null ? `${report.battery.cycles} charge cycles` : report.battery.percent != null ? `${report.battery.percent}% charged` : '',
      pct: report.battery.healthPct ?? undefined,
    });
  }
  const upd = checks.find((c) => c.id === 'updates');
  const updStatus = categoryStatus(checks, 'updates');
  tiles.push({
    key: 'updates',
    label: 'Updates',
    icon: 'updates',
    value: updStatus === 'ok' ? 'Up to date' : updStatus === 'unknown' ? 'Not checked' : checks.some((c) => c.id === 'pending-restart' && c.status === 'warn') && upd?.status === 'ok' ? 'Restart needed' : 'Needs updates',
    sub: shortDetail(upd?.detail ?? ''),
  });
  const secStatus = categoryStatus(checks, 'security');
  const av = checks.find((c) => c.id === 'antivirus');
  tiles.push({
    key: 'security',
    label: 'Security',
    icon: 'shield',
    value: secStatus === 'ok' ? 'Protected' : secStatus === 'unknown' ? 'Not checked' : secStatus === 'bad' ? 'At risk' : 'Check settings',
    sub: shortDetail(av?.detail ?? ''),
  });

  return (
    <div className="tiles" style={{ ['--tile-cols' as string]: String(tiles.length) }}>
      {tiles.map((t) => {
        const s = categoryStatus(checks, t.key);
        const barStatus: Status = t.key === 'memory' ? (t.pct != null && t.pct > 90 ? 'warn' : 'ok') : s === 'unknown' ? 'ok' : s;
        return (
          <button key={t.key} className={`card tile s-${s}`} onClick={onOpen} aria-label={`${t.label}: ${t.value}`}>
            <div className="tile-top">
              <span className="tile-icon">
                <Icon name={t.icon} />
              </span>
              <span className="dot" title={s} />
            </div>
            <span className="label">{t.label}</span>
            <span className="value num">{t.value}</span>
            {t.pct != null ? <Bar pct={t.pct} status={barStatus} /> : null}
            <span className="sub">{t.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

function shortDetail(detail: string): string {
  const first = detail.split(/(?<=\.)\s/)[0] ?? '';
  return first.replace(/^Last update installed /, 'Last update ').replace(/\.$/, '');
}

function TileSkeletons() {
  return (
    <div className="tiles">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="card tile">
          <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 10 }} />
          <div className="skeleton" style={{ width: '50%', height: 12, marginTop: 10 }} />
          <div className="skeleton" style={{ width: '80%', height: 20, marginTop: 6 }} />
          <div className="skeleton" style={{ width: '70%', height: 12, marginTop: 'auto' }} />
        </div>
      ))}
    </div>
  );
}
