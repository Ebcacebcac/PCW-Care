import { createContext, useContext } from 'react';
import type { AppState, CareBridge, CheckProgress, CheckResult, DeviceReport, PageId, UpdateState } from '../shared/types';

export interface HelpPrefill {
  subject: string;
  message: string;
}

export interface CareCtx {
  api: CareBridge;
  state: AppState;
  setState: (s: AppState) => void;
  report: DeviceReport | null;
  progress: CheckProgress;
  update: UpdateState;
  page: PageId;
  go: (page: PageId) => void;
  runCheck: () => void;
  toast: (msg: string) => void;
  copy: (text: string, what?: string) => void;
  prefill: HelpPrefill | null;
  askUs: (check?: CheckResult) => void;
  clearPrefill: () => void;
}

export const Ctx = createContext<CareCtx | null>(null);

export function useCare(): CareCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCare outside provider');
  return c;
}

export function getBridge(): CareBridge {
  const b = (window as unknown as { pcwCare?: CareBridge }).pcwCare;
  if (!b) throw new Error('PCW Care bridge missing');
  return b;
}
