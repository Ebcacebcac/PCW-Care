/* A stand-in for the Customer Hub's /api/care endpoints (contract v1), for
   trying PCW Care without the real server:

     node scripts/fake-api.mjs            # listens on http://127.0.0.1:3999
     PCW_CARE_API=http://127.0.0.1:3999/api/care npm start

   Codes: DEMO1234 links (maintenance customer), PLAIN123 links (no
   maintenance), NOTYET01 → not_available, anything else → bad_code. */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3999);
const tokens = new Map(); // token -> { maintenance }
let reports = 0;
let remote = null;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size <= 70 * 1024) chunks.push(c);
  });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/^\/api\/care/, '');
    let body;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch {
      return send(res, 400, { error: 'Bad JSON', code: 'invalid' });
    }
    console.log(`${req.method} ${path} origin=${req.headers.origin ?? '-'} ua=${req.headers['user-agent']} bytes=${size}`);
    if (req.method === 'POST' && path === '/link') {
      const code = String(body.code || '').toUpperCase();
      if (code === 'NOTYET01') return send(res, 403, { error: "PCW Care isn't available for your account yet.", code: 'not_available' });
      if (code !== 'DEMO1234' && code !== 'PLAIN123') return send(res, 401, { error: 'Invalid access code.', code: 'bad_code' });
      const token = crypto.randomBytes(32).toString('base64url');
      tokens.set(token, { maintenance: code === 'DEMO1234', device: body.device });
      console.log('  linked device', JSON.stringify(body.device));
      return send(res, 200, { token, client: { firstName: 'Jane', lastName: 'Robson', company: null }, device: { id: 12 } });
    }
    const auth = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const session = auth && tokens.get(auth[1]);
    if (!session) return send(res, 401, { error: 'This computer is not linked.', code: 'unlinked' });
    if (req.method === 'GET' && path === '/me') {
      return send(res, 200, {
        client: { firstName: 'Jane', lastName: 'Robson', company: null, email: 'jane@example.co.uk' },
        device: { id: 12, name: session.device?.name ?? null },
        flags: { maintenance: session.maintenance },
        hubUrl: 'https://customer.pcwhub.co.uk',
      });
    }
    if (req.method === 'GET' && path === '/summary') {
      return send(res, 200, {
        jobs: [{ id: 1, ref: 'PCW-4821', title: 'Laptop — new battery', status: 'awaiting_parts', updatedAt: new Date().toISOString() }],
        invoices: [{ id: 2, number: 'INV-10442', total: 89.99, balance: 89.99, status: 'unpaid', dueDate: new Date(Date.now() + 9 * 864e5).toISOString() }],
        tickets: [],
        remoteRequest: remote,
      });
    }
    if (req.method === 'POST' && path === '/report') {
      if (size > 64 * 1024) return send(res, 413, { error: 'Too large', code: 'invalid' });
      reports++;
      console.log(`  report #${reports}: ${body.checks?.length} checks, schema ${body.schema}`);
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'POST' && path === '/tickets') {
      const s = String(body.subject || '');
      if (s.length < 3) return send(res, 400, { error: 'Subject must be 3–120 characters.', code: 'invalid' });
      return send(res, 200, { ticket: { id: 61, ref: 'T-1203' } });
    }
    if (req.method === 'POST' && path === '/remote-support') {
      if (!session.maintenance) return send(res, 403, { error: 'Maintenance customers only.', code: 'not_maintenance' });
      if (remote) return send(res, 409, { error: 'Already requested.', code: 'already_requested' });
      remote = { id: 9, status: 'requested', scheduledFor: null };
      return send(res, 200, { request: { id: 9, status: 'requested' }, ticket: { id: 62, ref: 'T-1204' } });
    }
    if (req.method === 'POST' && path === '/unlink') {
      tokens.delete(auth[1]);
      res.writeHead(204);
      return res.end();
    }
    send(res, 404, { error: 'Not found', code: 'not_found' });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`fake PCW Care API on http://127.0.0.1:${PORT}/api/care`));
