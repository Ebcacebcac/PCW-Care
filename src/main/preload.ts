/* The only bridge between the page and the main process. Sandboxed preload:
   it may import nothing but 'electron' (types are erased at compile time). */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AppEvent, CareBridge } from '../shared/types';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(`care:${channel}`, ...args);

const bridge: CareBridge = {
  getState: () => invoke('getState'),
  link: (code) => invoke('link', String(code)),
  useWithoutSigningIn: () => invoke('useWithoutSigningIn'),
  showSignIn: () => invoke('showSignIn'),
  unlink: () => invoke('unlink'),
  getReport: () => invoke('getReport'),
  runCheck: () => invoke('runCheck'),
  runFix: (checkId, fix) => invoke('runFix', String(checkId), String(fix)),
  getSummary: () => invoke('getSummary'),
  refreshAccount: () => invoke('refreshAccount'),
  createTicket: (input) =>
    invoke('createTicket', { subject: String(input.subject), message: String(input.message), includeReport: input.includeReport === true }),
  requestRemoteSupport: (input) => invoke('requestRemoteSupport', { preferred: String(input.preferred), note: String(input.note ?? '') }),
  getConnectStatus: (withId) => invoke('getConnectStatus', withId === true),
  openConnect: () => invoke('openConnect'),
  open: (target) => invoke('open', String(target)),
  copyText: (text) => invoke('copyText', String(text)),
  getSettings: () => invoke('getSettings'),
  setLaunchAtLogin: (on) => invoke('setLaunchAtLogin', on === true),
  getUpdateState: () => invoke('getUpdateState'),
  checkForUpdates: () => invoke('checkForUpdates'),
  installUpdate: () => invoke('installUpdate'),
  onEvent: (cb) => {
    const listener = (_e: IpcRendererEvent, payload: AppEvent) => cb(payload);
    ipcRenderer.on('care:event', listener);
    return () => {
      ipcRenderer.removeListener('care:event', listener);
    };
  },
};

contextBridge.exposeInMainWorld('pcwCare', bridge);
