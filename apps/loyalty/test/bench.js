// API benchmark (Phase 3). In-process server, real SQLite file (WAL), seeded data.
// Run: node apps/loyalty/test/bench.js [seconds-per-endpoint=5] [concurrency=32]
// Prints req/s, p50, p95, p99 per endpoint. Compare before/after on the same machine.
'use strict';
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { createApp } = require('../server');

const SECS = +process.argv[2] || 5, CONC = +process.argv[3] || 32;
const CUSTOMERS = 2000;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-bench-'));
  let clock = Date.now();
  const app = createApp({ dbFile: path.join(dir, 'b.db'), now: () => clock, sendOtp: async () => {}, secret: 'bench', secureCookies: false, inbound: null });
  app.setStaff('cap', 'captain', 'Cap', 'pass-1234');
  // seed: customers with some stamps + audit rows; 30 tables with presence; 500 calls in the last 12 h
  const db = app.db; const t0 = clock;
  db.exec('BEGIN');
  for (let i = 1; i <= CUSTOMERS; i++) {
    db.prepare('INSERT INTO customers(phone,created_at,last_visit_at) VALUES(?,?,?)').run('010' + String(i).padStart(8, '0'), t0, t0);
    for (let k = 0; k < i % 5; k++) {
      db.prepare('INSERT INTO stamps(customer_id,staff_id,table_number,created_at,cycle_id) VALUES(?,?,?,?,1)').run(i, 1, 1 + (i % 30), t0 - (k + 1) * 86400e3);
      db.prepare('INSERT INTO audit_log(at,actor_type,actor_id,action,customer_id,detail) VALUES(?,?,?,?,?,?)').run(t0 - (k + 1) * 86400e3, 'staff', 1, 'stamp', i, '{"table":3}');
    }
    if (i <= 60) db.prepare('INSERT INTO presence VALUES(?,?,?)').run(i, 1 + (i % 30), t0);
  }
  for (let i = 0; i < 500; i++) db.prepare('INSERT INTO calls(at,table_number,body) VALUES(?,?,?)').run(t0 - i * 60e3, 1 + (i % 30), JSON.stringify({ type: 'call', table: String(1 + (i % 30)), rid: 'r' + i }));
  db.exec('COMMIT');

  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  const H = { 'x-requested-with': 'sequoia', 'content-type': 'application/json' };
  const login = await fetch(base + '/staff/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'cap', password: 'pass-1234' }) });
  const staffCk = login.headers.getSetCookie()[0].split(';')[0];
  // a customer session, made directly (bench is not about OTP)
  const custCk = await (async () => {
    const r = await fetch(base + '/otp/request', { method: 'POST', headers: { ...H, 'x-forwarded-for': '9.9.9.9' }, body: JSON.stringify({ phone: '01000000007' }) });
    void r; const crypto = require('node:crypto');
    const code = '123456';
    db.prepare('UPDATE otps SET code_hash=? WHERE phone=?').run(crypto.createHmac('sha256', 'bench').update('01000000007:' + code).digest('hex'), '01000000007');
    const v = await fetch(base + '/otp/verify', { method: 'POST', headers: H, body: JSON.stringify({ phone: '01000000007', code }) });
    return v.headers.getSetCookie()[0].split(';')[0];
  })();

  let seq = 0;
  const cases = {
    'GET /api/me (customer card)': () => fetch(base + '/me', { headers: { cookie: custCk } }),
    'GET /api/staff/tables': () => fetch(base + '/staff/tables', { headers: { cookie: staffCk } }),
    'GET /api/staff/customer?phone=': () => fetch(base + '/staff/customer?phone=010' + String(1 + (seq++ % CUSTOMERS)).padStart(8, '0'), { headers: { cookie: staffCk } }),
    'POST /api/staff/stamp': () => { const id = 1 + (seq++ % CUSTOMERS); clock += 6000; return fetch(base + '/staff/stamp', { method: 'POST', headers: { ...H, cookie: staffCk }, body: JSON.stringify({ customerId: id, requestId: 'bench' + seq.toString(36).padStart(8, '0') }) }); },
    'POST /api/calls': () => { const n = 1 + (seq++ % 999); clock += 30e3; return fetch(base + '/calls', { method: 'POST', headers: { ...H, 'x-forwarded-for': '10.0.' + (n >> 8) + '.' + (n & 255) }, body: JSON.stringify({ type: 'call', table: n, s: app.tableSig(n) }) }); },
  };

  const out = {};
  for (const [name, fn] of Object.entries(cases)) {
    const lat = []; let errs = 0, codes = {};
    const end = performance.now() + SECS * 1000;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (performance.now() < end) {
        const s = performance.now();
        try { const r = await fn(); await r.arrayBuffer(); codes[r.status] = (codes[r.status] || 0) + 1; } catch { errs++; }
        lat.push(performance.now() - s);
      }
    }));
    lat.sort((a, b) => a - b);
    const q = p => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(2);
    out[name] = { 'req/s': Math.round(lat.length / SECS), p50: q(0.5), p95: q(0.95), p99: q(0.99), codes: JSON.stringify(codes), errs };
  }
  console.table(out);
  app.server.closeAllConnections(); app.server.close(); db.close();
  fs.rmSync(dir, { recursive: true, force: true });
})();
