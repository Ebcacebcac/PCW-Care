/* Client for the Customer Hub's PCW Care API (contract v1). Runs only in
   the main process with Node's fetch: no cookies, no Origin header. Every
   failure is mapped to a friendly ApiError — nothing here throws. */

import type { ApiError, ApiErrorCode, CallStatus, MeResponse, Result, SummaryResponse } from '../shared/types';
import { PHONE_DISPLAY } from '../shared/contact';

export const DEFAULT_API_BASE = 'https://customer.pcwhub.co.uk/api/care';

export function apiBase(env: NodeJS.ProcessEnv = process.env): string {
  const v = (env.PCW_CARE_API || '').trim();
  if (v) {
    try {
      const u = new URL(v);
      const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
      // https anywhere, plain http only for a local dev server
      if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return v.replace(/\/+$/, '');
    } catch {
      /* ignore a malformed override */
    }
  }
  return DEFAULT_API_BASE;
}

export interface LinkDevice {
  name: string;
  platform: string;
  osVersion: string;
  model: string;
  serial: string;
  appVersion: string;
}

export interface LinkResponse {
  token: string;
  client: { firstName: string; lastName: string; company: string | null };
  device: { id: number };
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const MESSAGES: Record<ApiErrorCode, string> = {
  bad_code: "That code didn't work. Check it and try again — it's the code you use to sign in at customer.pcwhub.co.uk.",
  bad_screenshot: "We couldn't attach that screenshot. Remove it and try again, or send your ticket without it.",
  not_available: "PCW Care isn't available for your account yet.",
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  unlinked: 'This computer is no longer linked to your account. Please sign in again.',
  offline: "We can't reach PC Workshop right now. Check you're connected to the internet and try again.",
  not_maintenance: `Remote support requests are part of our maintenance plans. Call us on ${PHONE_DISPLAY} and we'll help.`,
  already_requested: "You've already asked for remote support — we'll be in touch soon.",
  invalid: 'Something in the form needs another look.',
  server: `PC Workshop's system had a problem. Please try again in a few minutes, or call us on ${PHONE_DISPLAY}.`,
  not_linked: 'Sign in with your Customer Hub access code to use this.',
  unknown: `Something went wrong. Please try again, or call us on ${PHONE_DISPLAY}.`,
};

export function apiError(code: ApiErrorCode, status?: number, message?: string): ApiError {
  return { code, message: message || MESSAGES[code], status };
}

/* Maps an HTTP status and error body to the app's error codes. */
export function mapHttpError(status: number, body: { error?: unknown; code?: unknown } | null): ApiError {
  const code = typeof body?.code === 'string' ? body.code : '';
  const serverMsg = typeof body?.error === 'string' ? body.error.slice(0, 300) : '';
  if (status === 401) return apiError(code === 'bad_code' ? 'bad_code' : 'unlinked', status);
  if (status === 403 && code === 'not_available') return apiError('not_available', status);
  if (status === 403 && code === 'not_maintenance') return apiError('not_maintenance', status);
  if (status === 409 && code === 'already_requested') return apiError('already_requested', status);
  if (status === 400 && code === 'bad_screenshot') return apiError('bad_screenshot', status);
  if (status === 429) return apiError('rate_limited', status);
  if (status === 400 || status === 413 || status === 422) return apiError('invalid', status, serverMsg || undefined);
  if (status >= 500) return apiError('server', status);
  if (code === 'bad_code' || code === 'not_available' || code === 'unlinked') return apiError(code, status);
  return apiError('unknown', status, serverMsg || undefined);
}

export class CareApi {
  constructor(
    private readonly opts: {
      baseUrl: string;
      appVersion: string;
      platform: string;
      arch: string;
      getToken: () => string | null;
      fetch?: FetchLike;
      timeoutMs?: number;
    },
  ) {}

  get userAgent(): string {
    return `PCW-Care/${this.opts.appVersion} (${this.opts.platform}; ${this.opts.arch})`;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<Result<T>> {
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': this.userAgent };
    if (auth) {
      const token = this.opts.getToken();
      if (!token) return { ok: false, error: apiError('not_linked') };
      headers.Authorization = `Bearer ${token}`;
    }
    let payload: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const f = this.opts.fetch ?? (globalThis.fetch as FetchLike);
    let res: Response;
    try {
      res = await f(`${this.opts.baseUrl}${path}`, {
        method,
        headers,
        body: payload,
        redirect: 'error',
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 20_000),
      });
    } catch {
      return { ok: false, error: apiError('offline') };
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      return { ok: false, error: apiError('offline') };
    }
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) return { ok: false, error: mapHttpError(res.status, json as { error?: unknown; code?: unknown } | null) };
    if (res.status === 204) return { ok: true, data: null as T };
    if (json == null || typeof json !== 'object') return { ok: false, error: apiError('server', res.status) };
    return { ok: true, data: json as T };
  }

  link(code: string, device: LinkDevice): Promise<Result<LinkResponse>> {
    return this.request<LinkResponse>('POST', '/link', { code, device }, false).then((r) => {
      if (r.ok && (typeof r.data?.token !== 'string' || !r.data.token)) return { ok: false, error: apiError('server') };
      return r;
    });
  }

  me(): Promise<Result<MeResponse>> {
    return this.request<MeResponse>('GET', '/me');
  }

  summary(): Promise<Result<SummaryResponse>> {
    return this.request<SummaryResponse>('GET', '/summary').then((r) =>
      r.ok
        ? {
            ok: true as const,
            data: {
              jobs: Array.isArray(r.data.jobs) ? r.data.jobs : [],
              invoices: Array.isArray(r.data.invoices) ? r.data.invoices : [],
              tickets: Array.isArray(r.data.tickets) ? r.data.tickets : [],
              remoteRequest: r.data.remoteRequest ?? null,
            },
          }
        : r,
    );
  }

  report(snapshotJson: string): Promise<Result<null>> {
    return this.request<null>('POST', '/report', snapshotJson);
  }

  /* `screenshot` is the contract 0.2 addition; older servers ignore it. */
  createTicket(input: {
    subject: string;
    message: string;
    includeReport: boolean;
    screenshot?: { mime: 'image/jpeg' | 'image/png'; data: string };
  }): Promise<Result<{ ticket: { id: number; ref: string }; attachmentId?: number }>> {
    return this.request('POST', '/tickets', input);
  }

  /* GET /call-status (contract 0.2). A 404 means the server doesn't have
     it yet: the feature is hidden rather than shown as an error. */
  async callStatus(): Promise<Result<CallStatus>> {
    const r = await this.request<unknown>('GET', '/call-status');
    if (!r.ok) {
      if (r.error.status === 404) return { ok: true, data: { state: 'unavailable' } };
      return r;
    }
    return { ok: true, data: parseCallStatus(r.data) };
  }

  requestRemoteSupport(input: { preferred: 'asap' | 'later'; note?: string }): Promise<
    Result<{ request: { id: number; status: string }; ticket: { id: number; ref: string } }>
  > {
    return this.request('POST', '/remote-support', input);
  }

  unlink(): Promise<Result<null>> {
    return this.request<null>('POST', '/unlink', {});
  }
}

/* Validates GET /call-status. Anything unexpected counts as "not calling"
   — never as a verified call. */
export function parseCallStatus(body: unknown): CallStatus {
  const b = body as { calling?: unknown; staffName?: unknown; expiresAt?: unknown } | null;
  if (!b || typeof b !== 'object' || b.calling !== true) return { state: 'not_calling' };
  const name = typeof b.staffName === 'string' ? b.staffName.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 40) : '';
  let expiresAt: string | null = null;
  if (typeof b.expiresAt === 'string') {
    const t = new Date(b.expiresAt);
    if (!Number.isNaN(t.getTime())) {
      if (t.getTime() <= Date.now()) return { state: 'not_calling' };
      expiresAt = t.toISOString();
    }
  }
  return { state: 'calling', staffName: name || 'Someone', expiresAt };
}
