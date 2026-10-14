import { useEffect, type ReactNode } from 'react';
import type { CheckCategory, DeviceType, FixId, Status } from '../../shared/types';
import { Icon, type IconName } from './Icon';

export const STATUS_ICON: Record<Status, IconName> = { ok: 'check', warn: 'alert', bad: 'x', info: 'info', unknown: 'question' };
export const STATUS_WORD: Record<Status, string> = { ok: 'Good', warn: 'Worth a look', bad: 'Needs fixing', info: 'Good to know', unknown: 'Not checked' };

export function StatusIcon({ status, label }: { status: Status; label?: string }) {
  return (
    <span className={`status-icon s-${status}`} role="img" aria-label={label ?? STATUS_WORD[status]}>
      <Icon name={STATUS_ICON[status]} />
    </span>
  );
}

export function Pill({ status, children }: { status: Status; children: ReactNode }) {
  return (
    <span className={`pill s-${status}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function Bar({ pct, status }: { pct: number; status: Status }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={`bar s-${status}`} role="presentation">
      <span style={{ width: `${w}%` }} />
    </div>
  );
}

export function Spinner() {
  return <Icon name="refresh" className="spin" />;
}

export function Modal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div className="actions">{actions}</div>
      </div>
    </div>
  );
}

export const CATEGORY: Record<CheckCategory, { label: string; icon: IconName }> = {
  updates: { label: 'Updates', icon: 'updates' },
  security: { label: 'Security', icon: 'shield' },
  storage: { label: 'Storage', icon: 'disk' },
  backup: { label: 'Backup', icon: 'cloud' },
  battery: { label: 'Battery', icon: 'battery' },
  memory: { label: 'Memory', icon: 'chip' },
  performance: { label: 'Performance', icon: 'speed' },
};

export function fixLabel(fix: FixId, platform: string): string {
  const mac = platform === 'darwin';
  switch (fix) {
    case 'open:updates':
      return mac ? 'Open Software Update' : 'Open Windows Update';
    case 'open:security':
      return mac ? 'Open Privacy & Security' : 'Open Windows Security';
    case 'open:firewall':
      return 'Firewall settings';
    case 'open:encryption':
      return 'FileVault settings';
    case 'open:storage':
      return 'Storage settings';
    case 'open:startup':
      return 'Manage startup apps';
    case 'open:battery':
      return 'Battery settings';
    case 'open:backup':
      return mac ? 'Open Time Machine' : 'Backup settings';
    case 'open:apps':
      return 'Installed apps';
    case 'open:recovery-key':
      return 'Find my recovery key';
    case 'restart':
      return 'Restart now';
    case 'clean-temp':
      return 'Clear temporary files';
  }
}

export function DeviceArt({ type, platform }: { type: DeviceType; platform: string }) {
  if (type === 'desktop') {
    return (
      <svg viewBox="0 0 92 80" fill="none" aria-hidden="true">
        <rect x="8" y="6" width="76" height="50" rx="6" fill="var(--surface)" stroke="currentColor" strokeWidth="2.4" />
        <rect x="14" y="12" width="64" height="38" rx="3" fill="var(--green-50)" />
        <path d="M38 56l-3 13h22l-3-13" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" fill="var(--surface)" />
        <path d="M28 70h36" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="46" cy="31" r="9" stroke="var(--green)" strokeWidth="4" />
        <circle cx="49" cy="31" r="3.2" fill="var(--blue)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 92 80" fill="none" aria-hidden="true">
      <rect x="14" y="12" width="64" height="44" rx="5" fill="var(--surface)" stroke="currentColor" strokeWidth="2.4" />
      <rect x="20" y="18" width="52" height="32" rx="2.5" fill="var(--green-50)" />
      <path d="M6 58h80l-4 7a4 4 0 0 1-3.5 2h-65A4 4 0 0 1 10 65l-4-7Z" fill="var(--surface)" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M39 61h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {platform === 'darwin' ? (
        <path d="M46 26c2-2.6 4.4-2.6 4.4-2.6s.2 2.4-1.8 4.2M41 32.5c0-3.4 2.4-5 4.4-5 1.6 0 2.2.8 3.4.8s2-.8 3.4-.8c1.4 0 3 1 3.8 2.6-3.6 1.6-3 6.4.6 7.4-.8 2.2-2.6 4.6-4.2 4.6-1.4 0-1.8-.8-3.4-.8s-2.2.8-3.4.8C44 42.2 41 37 41 32.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      ) : (
        <>
          <circle cx="46" cy="34" r="8.5" stroke="var(--green)" strokeWidth="4" />
          <circle cx="49" cy="34" r="3" fill="var(--blue)" />
        </>
      )}
    </svg>
  );
}

export function initials(first?: string | null, last?: string | null): string {
  return `${(first ?? '').trim().charAt(0)}${(last ?? '').trim().charAt(0)}`.toUpperCase() || '?';
}
