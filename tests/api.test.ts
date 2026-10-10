import { describe, expect, it } from 'vitest';
import { CareApi, DEFAULT_API_BASE, MESSAGES, apiBase, mapHttpError } from '../src/main/api';

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  };
  return { f, calls };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function client(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, token: string | null = 'tok_abcdefghijklmnopqrstuvwxyz012345') {
  return new CareApi({ baseUrl: 'https://example.test/api/care', appVersion: '0.1.0', platform: 'win32', arch: 'x64', getToken: () => token, fetch: fetchImpl });
}

describe('mapHttpError', () => {
  it.each([
    [401, { code: 'bad_code', error: 'Invalid' }, 'bad_code'],
    [401, { code: 'unlinked' }, 'unlinked'],
    [401, null, 'unlinked'],
    [403, { code: 'not_available' }, 'not_available'],
    [403, { code: 'not_maintenance' }, 'not_maintenance'],
    [409, { code: 'already_requested' }, 'already_requested'],
    [429, { error: 'slow down' }, 'rate_limited'],
    [400, { error: 'Subject is too short.' }, 'invalid'],
    [413, null, 'invalid'],
    [500, { error: 'boom' }, 'server'],
    [502, null, 'server'],
    [404, null, 'unknown'],
  ] as const)('%i %j → %s', (status, body, code) => {
    expect(mapHttpError(status, body as never).code).toBe(code);
  });

  it('uses friendly copy for known codes, not the server text', () => {
    expect(mapHttpError(403, { code: 'not_available', error: 'nope' }).message).toBe("PCW Care isn't available for your account yet.");
    expect(mapHttpError(401, { code: 'bad_code', error: 'Invalid access code.' }).message).toBe(MESSAGES.bad_code);
  });

  it("passes a validation message through for 400s", () => {
    expect(mapHttpError(400, { error: 'Subject is too short.' }).message).toBe('Subject is too short.');
  });
});

describe('apiBase', () => {
  it('defaults to the Customer Hub', () => {
    expect(apiBase({})).toBe(DEFAULT_API_BASE);
    expect(DEFAULT_API_BASE).toBe('https://customer.pcwhub.co.uk/api/care');
  });
  it('accepts https or local http overrides, trimming the slash', () => {
    expect(apiBase({ PCW_CARE_API: 'http://127.0.0.1:3002/api/care/' })).toBe('http://127.0.0.1:3002/api/care');
    expect(apiBase({ PCW_CARE_API: 'https://staging.pcwhub.co.uk/api/care' })).toBe('https://staging.pcwhub.co.uk/api/care');
  });
  it('ignores plain http to a remote host and junk', () => {
    expect(apiBase({ PCW_CARE_API: 'http://evil.example/api' })).toBe(DEFAULT_API_BASE);
    expect(apiBase({ PCW_CARE_API: 'not a url' })).toBe(DEFAULT_API_BASE);
  });
});

describe('CareApi', () => {
  it('links without auth and sends the contract body and headers', async () => {
    const { f, calls } = fakeFetch(() => json(200, { token: 'T'.repeat(43), client: { firstName: 'Jane', lastName: 'Robson', company: null }, device: { id: 12 } }));
    const r = await client(f, null).link('ABCD1234', { name: 'PC', platform: 'win32', osVersion: 'Windows 11', model: 'X', serial: 'S', appVersion: '0.1.0' });
    expect(r.ok).toBe(true);
    const c = calls[0];
    expect(c.url).toBe('https://example.test/api/care/link');
    expect(c.init.method).toBe('POST');
    const headers = c.init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.Origin).toBeUndefined();
    expect(headers['User-Agent']).toBe('PCW-Care/0.1.0 (win32; x64)');
    expect(JSON.parse(String(c.init.body))).toEqual({
      code: 'ABCD1234',
      device: { name: 'PC', platform: 'win32', osVersion: 'Windows 11', model: 'X', serial: 'S', appVersion: '0.1.0' },
    });
  });

  it('maps a wrong code', async () => {
    const { f } = fakeFetch(() => json(401, { code: 'bad_code', error: 'Invalid access code.' }));
    const r = await client(f, null).link('NOPE', { name: '', platform: 'win32', osVersion: '', model: '', serial: '', appVersion: '0.1.0' });
    expect(r).toEqual({ ok: false, error: { code: 'bad_code', message: MESSAGES.bad_code, status: 401 } });
  });

  it('treats a 200 without a token as a server error', async () => {
    const { f } = fakeFetch(() => json(200, { client: {} }));
    const r = await client(f, null).link('X', { name: '', platform: '', osVersion: '', model: '', serial: '', appVersion: '' });
    expect(!r.ok && r.error.code).toBe('server');
  });

  it('reports offline when fetch throws (DNS, refused, timeout)', async () => {
    const { f } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const r = await client(f).me();
    expect(!r.ok && r.error.code).toBe('offline');
  });

  it('times out slow servers as offline', async () => {
    const slow = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('timeout', 'TimeoutError'))));
    const api = new CareApi({ baseUrl: 'https://x.test', appVersion: '1', platform: 'darwin', arch: 'arm64', getToken: () => 'tok_abcdefghijklmnopqrstuvwxyz', fetch: slow, timeoutMs: 50 });
    const r = await api.summary();
    expect(!r.ok && r.error.code).toBe('offline');
  });

  it('sends the bearer token and recognises unlinked', async () => {
    const { f, calls } = fakeFetch(() => json(401, { code: 'unlinked', error: 'Unlinked' }));
    const r = await client(f, 'tok_abcdefghijklmnopqrstuvwxyz012345').me();
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok_abcdefghijklmnopqrstuvwxyz012345');
    expect(!r.ok && r.error.code).toBe('unlinked');
  });

  it('refuses authenticated calls without a token, without calling the server', async () => {
    const { f, calls } = fakeFetch(() => json(200, {}));
    const r = await client(f, null).summary();
    expect(!r.ok && r.error.code).toBe('not_linked');
    expect(calls).toHaveLength(0);
  });

  it('accepts 204 for /report and posts the snapshot as-is', async () => {
    const { f, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const r = await client(f).report('{"schema":1}');
    expect(r).toEqual({ ok: true, data: null });
    expect(calls[0].init.body).toBe('{"schema":1}');
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('normalises a summary with missing lists', async () => {
    const { f } = fakeFetch(() => json(200, { jobs: null }));
    const r = await client(f).summary();
    expect(r).toEqual({ ok: true, data: { jobs: [], invoices: [], tickets: [], remoteRequest: null } });
  });

  it('maps already_requested and rate limiting', async () => {
    const r1 = await client(fakeFetch(() => json(409, { code: 'already_requested' })).f).requestRemoteSupport({ preferred: 'asap' });
    expect(!r1.ok && r1.error.code).toBe('already_requested');
    const r2 = await client(fakeFetch(() => json(429, { error: 'Too many' })).f).createTicket({ subject: 'abc', message: 'x', includeReport: true });
    expect(!r2.ok && r2.error.code).toBe('rate_limited');
  });

  it('treats a non-JSON 200 as a server error', async () => {
    const { f } = fakeFetch(() => new Response('<html>proxy</html>', { status: 200 }));
    const r = await client(f).me();
    expect(!r.ok && r.error.code).toBe('server');
  });
});
