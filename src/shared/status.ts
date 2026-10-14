import type { CheckCategory, CheckResult, Status } from './types';

/* 'info' results are worth knowing but never count as attention. */
export function overallStatus(checks: CheckResult[]): { status: Status; attention: number; problems: number } {
  const problems = checks.filter((c) => c.status === 'bad').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  const status: Status = problems ? 'bad' : warns ? 'warn' : checks.some((c) => c.status === 'ok') ? 'ok' : 'unknown';
  return { status, attention: problems + warns, problems };
}

export function worstStatus(statuses: Status[]): Status {
  if (statuses.includes('bad')) return 'bad';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('ok')) return 'ok';
  if (statuses.includes('info')) return 'info';
  return 'unknown';
}

export function categoryStatus(checks: CheckResult[], category: CheckCategory): Status {
  return worstStatus(checks.filter((c) => c.category === category).map((c) => c.status));
}
