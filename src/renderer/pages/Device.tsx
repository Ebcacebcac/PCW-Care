import type { ReactNode } from 'react';
import { deviceSummaryText } from '../../shared/summary';
import { formatGb, formatUptime, relativeTime } from '../../shared/format';
import { useCare } from '../context';
import { Icon } from '../components/Icon';
import { Bar, Pill, Spinner } from '../components/ui';
import type { Status } from '../../shared/types';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const HEALTH_WORD: Record<Status, string> = { ok: 'Healthy', warn: 'Warning', bad: 'Failing', info: 'OK', unknown: 'Unknown' };

export function Device() {
  const { report, progress, copy, runCheck } = useCare();

  if (!report) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>My device</h1>
            <p>Everything PC Workshop might ask you about your computer.</p>
          </div>
        </div>
        <div className="card card-pad empty">
          {progress.running ? (
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <Spinner /> Reading your computer’s details…
            </span>
          ) : (
            <button className="btn btn-primary" onClick={runCheck}>
              Run a check
            </button>
          )}
        </div>
      </div>
    );
  }

  const d = report.device;
  const os = report.os;
  const b = report.battery;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My device</h1>
          <p>Everything PC Workshop might ask you about your computer. Details from {relativeTime(report.collectedAt)}.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => copy(deviceSummaryText(report), 'Details copied — paste them into an email or ticket')}>
          <Icon name="copy" />
          Copy details
        </button>
      </div>

      <div className="grid-2">
        <section className="card card-pad">
          <h2 className="card-title">About this computer</h2>
          <dl className="dl" style={{ marginTop: 10 }}>
            <Row label="Computer name">{d.name || '—'}</Row>
            <Row label="Manufacturer">{d.manufacturer || '—'}</Row>
            <Row label="Model">{d.model || '—'}</Row>
            <Row label="Serial number">
              {d.serial ? (
                <>
                  <span className="selectable num">{d.serial}</span>
                  <button className="icon-btn" onClick={() => copy(d.serial, 'Serial number copied')} aria-label="Copy serial number" title="Copy">
                    <Icon name="copy" />
                  </button>
                </>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Type">{d.type === 'laptop' ? 'Laptop' : d.type === 'desktop' ? 'Desktop' : '—'}</Row>
          </dl>
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Operating system</h2>
          <dl className="dl" style={{ marginTop: 10 }}>
            <Row label="System">{os.name || '—'}</Row>
            <Row label="Version">{os.version || '—'}</Row>
            <Row label="Build">
              <span className="selectable num">{os.build || '—'}</span>
            </Row>
            <Row label="Architecture">{os.arch === 'arm64' ? 'ARM (64-bit)' : os.arch === 'x64' ? '64-bit (x64)' : os.arch || '—'}</Row>
            <Row label="Running for">{formatUptime(report.uptimeHours)}</Row>
          </dl>
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Processor &amp; memory</h2>
          <dl className="dl" style={{ marginTop: 10 }}>
            <Row label="Processor">{report.cpu.brand || '—'}</Row>
            <Row label="Cores / threads">
              <span className="num">
                {report.cpu.cores ?? '—'} cores · {report.cpu.threads ?? '—'} threads
              </span>
            </Row>
            {report.cpu.speedGhz ? <Row label="Base speed">{report.cpu.speedGhz.toFixed(2)} GHz</Row> : null}
            <Row label="Memory (RAM)">{report.memory.totalGb ? formatGb(report.memory.totalGb) : '—'}</Row>
            {report.memory.usedPct != null ? <Row label="In use now">{report.memory.usedPct}%</Row> : null}
          </dl>
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Graphics</h2>
          <dl className="dl" style={{ marginTop: 10 }}>
            {report.gpus.length ? (
              report.gpus.map((g, i) => (
                <Row key={`${g}-${i}`} label={report.gpus.length > 1 ? `Graphics ${i + 1}` : 'Graphics'}>
                  {g}
                </Row>
              ))
            ) : (
              <Row label="Graphics">—</Row>
            )}
          </dl>
        </section>

        <section className="card card-pad span-2">
          <h2 className="card-title">Storage</h2>
          {report.disks.length ? (
            report.disks.map((v) => {
              const used = v.sizeGb > 0 ? ((v.sizeGb - v.freeGb) / v.sizeGb) * 100 : 0;
              const st: Status = v.sizeGb > 0 && (v.freeGb < 8 || v.freeGb / v.sizeGb < 0.05) ? 'bad' : v.freeGb < 20 || v.freeGb / v.sizeGb < 0.1 ? 'warn' : 'ok';
              return (
                <div key={v.name} className="volume">
                  <div>
                    <span className="name">
                      {v.name}
                      {v.label ? ` · ${v.label}` : ''}
                    </span>
                    <div className="meta num">
                      {formatGb(v.freeGb)} free of {formatGb(v.sizeGb)} · {v.type === 'unknown' ? 'Drive' : v.type}
                    </div>
                  </div>
                  <Pill status={v.health}>{HEALTH_WORD[v.health]}</Pill>
                  <Bar pct={used} status={st} />
                </div>
              );
            })
          ) : (
            <p className="card-sub" style={{ marginTop: 8 }}>
              We couldn’t read your drives.
            </p>
          )}
          {report.physicalDisks.length ? (
            <dl className="dl" style={{ marginTop: 6 }}>
              {report.physicalDisks.map((p, i) => (
                <Row key={`${p.name}-${i}`} label={report.physicalDisks.length > 1 ? `Disk ${i + 1}` : 'Physical disk'}>
                  <span>
                    {p.name} · {p.type === 'unknown' ? '' : `${p.type} · `}
                    {formatGb(p.sizeGb)} · <span title={p.healthText}>{HEALTH_WORD[p.health]}</span>
                  </span>
                </Row>
              ))}
            </dl>
          ) : null}
        </section>

        {b ? (
          <section className="card card-pad span-2">
            <h2 className="card-title">Battery</h2>
            <div className="battery-row" style={{ marginTop: 12 }}>
              <div>
                <div className="big-number num">{b.healthPct != null ? `${b.healthPct}%` : '—'}</div>
                <div className="card-sub">of its original capacity</div>
              </div>
              <div style={{ flex: 1 }}>
                <Bar pct={b.healthPct ?? 0} status={b.healthPct == null ? 'unknown' : b.healthPct < 60 ? 'bad' : b.healthPct < 80 ? 'warn' : 'ok'} />
              </div>
            </div>
            <dl className="dl">
              <Row label="Charge cycles">{b.cycles ?? '—'}</Row>
              {b.designCapacity && b.fullCapacity ? (
                <Row label="Capacity">
                  <span className="num">
                    {b.fullCapacity.toLocaleString('en-GB')} of {b.designCapacity.toLocaleString('en-GB')} {b.capacityUnit || ''} when new
                  </span>
                </Row>
              ) : null}
              {b.condition ? <Row label="macOS says">{b.condition}</Row> : null}
              <Row label="Charge now">
                {b.percent != null ? `${b.percent}%` : '—'}
                {b.charging ? ' · charging' : ''}
              </Row>
            </dl>
          </section>
        ) : null}

        <LocalOnly />
      </div>
    </div>
  );
}

/* Stability and remote access apps (0.2): the names are shown here and
   nowhere else — they're never sent to PC Workshop. */
function LocalOnly() {
  const { report, state } = useCare();
  const local = report?.local;
  if (!local || (!local.stability && !local.remoteTools)) return null;
  const st = local.stability;
  const mac = state.platform === 'darwin';
  return (
    <section className="card card-pad span-2">
      <h2 className="card-title">Stability and remote access</h2>
      <p className="card-sub local-only-note">
        <Icon name="lock" />
        Only shown on this computer. PC Workshop gets the numbers, never the app names.
      </p>
      <dl className="dl" style={{ marginTop: 10 }}>
        {st ? (
          <>
            <Row label="App crashes (30 days)">
              <span className="num">{st.appCrashes ?? '—'}</span>
            </Row>
            <Row label={mac ? 'Unexpected restarts' : 'Unexpected shutdowns'}>
              <span className="num">{st.unexpectedShutdowns ?? '—'}</span>
            </Row>
            {st.apps.length ? (
              <Row label="Apps that crashed">
                <span className="selectable">{st.apps.map((a) => `${a.name} (${a.count})`).join(', ')}</span>
              </Row>
            ) : null}
          </>
        ) : null}
        {local.remoteTools ? (
          <Row label="Remote access apps running">
            {local.remoteTools.length ? <span className="selectable">{local.remoteTools.join(', ')}</span> : 'None (PCW-Connect doesn’t count)'}
          </Row>
        ) : null}
      </dl>
    </section>
  );
}
