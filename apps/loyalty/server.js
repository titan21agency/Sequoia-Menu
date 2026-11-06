// Sequoia Card — loyalty API (customers, OTP login, stamps, rewards, staff, audit log).
// No npm dependencies: Node 22+ built-ins only (http, crypto, node:sqlite), same as apps/payroll.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const CFG = require('./config');
const R = require('./rules');
const OTP = require('./otp');

const SCHEMA = `
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, last_visit_at INTEGER, cycle INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS staff(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('captain','admin')), pass TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS stamps(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), staff_id INTEGER NOT NULL REFERENCES staff(id), table_number INTEGER, created_at INTEGER NOT NULL, cycle_id INTEGER NOT NULL, request_id TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS rewards(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), staff_id INTEGER NOT NULL REFERENCES staff(id), redeemed_at INTEGER NOT NULL, cycle_id INTEGER NOT NULL, request_id TEXT UNIQUE, UNIQUE(customer_id, cycle_id));
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor_type TEXT NOT NULL, actor_id INTEGER, action TEXT NOT NULL, customer_id INTEGER, detail TEXT, ip TEXT, device TEXT);
CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('customer','staff')), subject_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS presence(customer_id INTEGER PRIMARY KEY REFERENCES customers(id), table_number INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS stamps_customer ON stamps(customer_id);
CREATE INDEX IF NOT EXISTS stamps_created ON stamps(created_at);
CREATE INDEX IF NOT EXISTS rewards_customer ON rewards(customer_id);
CREATE INDEX IF NOT EXISTS audit_customer ON audit_log(customer_id, id);
`;

function hashPass(p) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(p, salt, 64).toString('hex'); }
function checkPass(p, stored) { const [s, h] = String(stored).split(':'); const c = crypto.scryptSync(String(p), Buffer.from(s, 'hex'), 64); return crypto.timingSafeEqual(c, Buffer.from(h, 'hex')); }
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---------- tiny fixed-window rate limiter ----------
function limiter() {
  const m = new Map();
  return (key, max, windowMs, now) => {
    let e = m.get(key);
    if (!e || now >= e.reset) { e = { n: 0, reset: now + windowMs }; m.set(key, e); }
    if (m.size > 50000) for (const [k, v] of m) if (now >= v.reset) m.delete(k);
    return ++e.n > max;
  };
}

function createApp(opts = {}) {
  const now = opts.now || (() => Date.now());
  const db = new DatabaseSync(opts.dbFile || ':memory:');
  db.exec(SCHEMA);
  const sendOtp = opts.sendOtp || OTP.fromEnv();
  const SECRET = opts.secret || process.env.LOYALTY_SECRET || crypto.randomBytes(32).toString('hex');
  const STATIC_ROOT = opts.staticRoot || null; // dev/test only; in production Caddy serves the menu
  const secure = opts.secureCookies !== false;
  const limited = limiter();
  const H = 3600e3;

  const otpHash = (phone, code) => crypto.createHmac('sha256', SECRET).update(phone + ':' + code).digest('hex');

  // ---------- live updates (SSE): channel 'c:<customerId>' for the customer card, 'staff' for the captain tab ----------
  const subs = new Map();
  function publish(ch, ev, data) {
    for (const res of subs.get(ch) || []) res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function stream(req, res, ch) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.write('retry: 5000\n\n');
    if (!subs.has(ch)) subs.set(ch, new Set());
    subs.get(ch).add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); subs.get(ch)?.delete(res); });
  }

  // ---------- helpers ----------
  const SEC_HEADERS = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
  function send(res, code, body, headers = {}) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...headers });
    res.end(JSON.stringify(body));
  }
  function readBody(req) {
    return new Promise((ok, bad) => {
      let d = ''; req.on('data', c => { d += c; if (d.length > 1e4) { bad(new Error('too large')); req.destroy(); } });
      req.on('end', () => { try { const j = d ? JSON.parse(d) : {}; ok(j && typeof j === 'object' ? j : {}); } catch { bad(new Error('bad json')); } });
    });
  }
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]));
  function cookie(name, value, maxAgeSec, sameSite) {
    return `${name}=${value}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=${sameSite}; Path=/api; Max-Age=${maxAgeSec}`;
  }
  function newSession(kind, id, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(token), kind, id, now() + ttlMs);
    return token;
  }
  function sessionOf(req, kind) {
    const t = cookies(req)[kind === 'staff' ? 'sq_staff' : 'sq_card'];
    if (!t || t.length > 100) return null;
    return db.prepare('SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires>?').get(sha(t), kind, now()) || null;
  }
  function audit(actorType, actorId, action, customerId, detail, ctx) {
    db.prepare('INSERT INTO audit_log(at,actor_type,actor_id,action,customer_id,detail,ip,device) VALUES(?,?,?,?,?,?,?,?)')
      .run(now(), actorType, actorId ?? null, action, customerId ?? null, detail ? JSON.stringify(detail) : null, ctx.ip, ctx.device);
  }
  function card(customer) {
    const stamps = db.prepare('SELECT created_at, cycle_id FROM stamps WHERE customer_id=? AND cycle_id=?').all(customer.id, customer.cycle);
    const last = db.prepare('SELECT MAX(created_at) AS t FROM stamps WHERE customer_id=?').get(customer.id).t;
    if (last && !stamps.some(s => s.created_at === last)) stamps.push({ created_at: last, cycle_id: -1 }); // cooldown spans cycles
    const st = R.cardState(stamps, customer.cycle, now(), CFG);
    st.rewards = db.prepare('SELECT COUNT(*) AS n FROM rewards WHERE customer_id=?').get(customer.id).n;
    st.rewardName = CFG.REWARD_NAME;
    return st;
  }
  function ops(customerId, before, limit = 10) {
    const rows = db.prepare(`SELECT a.id, a.at, a.action, a.detail, s.name AS staff FROM audit_log a LEFT JOIN staff s ON s.id=a.actor_id AND a.actor_type='staff'
      WHERE a.customer_id=? AND a.action IN('stamp','redeem') AND a.id<? ORDER BY a.id DESC LIMIT ?`).all(customerId, before || 2 ** 53, limit + 1);
    return { items: rows.slice(0, limit).map(r => ({ id: r.id, at: r.at, action: r.action, staff: r.staff, table: (JSON.parse(r.detail || '{}')).table ?? null })), more: rows.length > limit };
  }
  const reqId = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null);
  const tableNo = v => { const n = +v; return Number.isInteger(n) && n >= 1 && n <= 999 ? n : null; };

  // ---------- API ----------
  async function api(req, res, url) {
    const p = url.pathname.slice(4); const M = req.method;
    const ctx = { ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress, device: String(req.headers['user-agent'] || '').slice(0, 160) };
    const t = now();

    // CSRF: state changes must come from our own pages (custom header + same-origin check).
    if (M !== 'GET') {
      if (req.headers['x-requested-with'] !== 'sequoia') return send(res, 403, { error: 'forbidden' });
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'forbidden' });
    }

    // ----- customer: OTP login -----
    if (p === '/otp/request' && M === 'POST') {
      const b = await readBody(req); const phone = R.normalizePhone(b.phone);
      if (!phone) return send(res, 400, { error: 'phone' });
      const prev = db.prepare('SELECT sent_at FROM otps WHERE phone=?').get(phone);
      if (prev && t - prev.sent_at < CFG.OTP_RESEND_SEC * 1000) return send(res, 429, { error: 'wait', retryIn: Math.ceil((CFG.OTP_RESEND_SEC * 1000 - (t - prev.sent_at)) / 1000) });
      if (limited('ip:' + ctx.ip, CFG.OTP_MAX_PER_IP_HOUR, H, t) || limited('ph:' + phone, CFG.OTP_MAX_PER_PHONE_HOUR, H, t))
        return send(res, 429, { error: 'rate' });
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      db.prepare('INSERT INTO otps(phone,code_hash,expires,attempts,sent_at) VALUES(?,?,?,0,?) ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash, expires=excluded.expires, attempts=0, sent_at=excluded.sent_at')
        .run(phone, otpHash(phone, code), t + CFG.OTP_TTL_MIN * 60e3, t);
      try { await sendOtp(phone, code); } catch (e) { console.error('otp send failed', e.message); return send(res, 502, { error: 'send' }); }
      audit('customer', null, 'otp_request', null, { phone: R.maskPhone(phone) }, ctx);
      return send(res, 200, { ok: true, resendIn: CFG.OTP_RESEND_SEC }); // same answer for new and existing numbers
    }
    if (p === '/otp/verify' && M === 'POST') {
      const b = await readBody(req); const phone = R.normalizePhone(b.phone); const code = String(b.code ?? '');
      if (limited('vip:' + ctx.ip, 40, H, t)) return send(res, 429, { error: 'rate' });
      const row = phone && db.prepare('SELECT * FROM otps WHERE phone=?').get(phone);
      const bad = () => send(res, 400, { error: 'code' }); // one generic error for every failure
      if (!row || row.expires < t || row.attempts >= CFG.OTP_MAX_ATTEMPTS || !/^\d{6}$/.test(code)) { if (row) db.prepare('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone); return bad(); }
      const ok = crypto.timingSafeEqual(Buffer.from(otpHash(phone, code), 'hex'), Buffer.from(row.code_hash, 'hex'));
      if (!ok) { db.prepare('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone); return bad(); }
      db.prepare('DELETE FROM otps WHERE phone=?').run(phone);
      db.prepare('INSERT INTO customers(phone,created_at,last_visit_at) VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET last_visit_at=excluded.last_visit_at').run(phone, t, t);
      const c = db.prepare('SELECT * FROM customers WHERE phone=?').get(phone);
      const ttl = CFG.CUSTOMER_SESSION_DAYS * 24 * H;
      const token = newSession('customer', c.id, ttl);
      audit('customer', c.id, 'login', c.id, null, ctx);
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('sq_card', token, ttl / 1000, 'Lax') });
    }

    // ----- customer: read-only card -----
    if (p.startsWith('/me')) {
      const s = sessionOf(req, 'customer');
      if (!s) return send(res, 401, { error: 'login' });
      const c = db.prepare('SELECT * FROM customers WHERE id=?').get(s.subject_id);
      if (!c) return send(res, 401, { error: 'login' });
      if (p === '/me' && M === 'GET') {
        const tn = tableNo(url.searchParams.get('table'));
        if (tn) { db.prepare('INSERT INTO presence VALUES(?,?,?) ON CONFLICT(customer_id) DO UPDATE SET table_number=excluded.table_number, at=excluded.at').run(c.id, tn, t); publish('staff', 'presence', {}); }
        return send(res, 200, { phone: c.phone, card: card(c) });
      }
      if (p === '/me/stream' && M === 'GET') return stream(req, res, 'c:' + c.id);
      if (p === '/me/logout' && M === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(cookies(req).sq_card));
        db.prepare('DELETE FROM presence WHERE customer_id=?').run(c.id);
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('sq_card', '', 0, 'Lax') });
      }
      return send(res, 404, { error: 'not found' });
    }

    // ----- staff -----
    if (p === '/staff/login' && M === 'POST') {
      if (limited('slip:' + ctx.ip, 10, 15 * 60e3, t)) return send(res, 429, { error: 'rate' });
      const b = await readBody(req);
      const u = db.prepare('SELECT * FROM staff WHERE username=? AND active=1').get(String(b.username ?? '').trim().toLowerCase().slice(0, 60));
      if (!u || !checkPass(String(b.password ?? '').slice(0, 200), u.pass)) { audit('staff', u?.id, 'login_failed', null, null, ctx); return send(res, 401, { error: 'creds' }); }
      const ttl = CFG.STAFF_SESSION_HOURS * H;
      audit('staff', u.id, 'login', null, null, ctx);
      return send(res, 200, { ok: true, name: u.name, role: u.role }, { 'Set-Cookie': cookie('sq_staff', newSession('staff', u.id, ttl), ttl / 1000, 'Strict') });
    }
    if (!p.startsWith('/staff/')) return send(res, 404, { error: 'not found' });
    const ss = sessionOf(req, 'staff');
    const staff = ss && db.prepare('SELECT * FROM staff WHERE id=? AND active=1').get(ss.subject_id);
    if (!staff) return send(res, 401, { error: 'login' });

    if (p === '/staff/me' && M === 'GET') return send(res, 200, { name: staff.name, role: staff.role, rules: { required: CFG.STAMPS_REQUIRED, reward: CFG.REWARD_NAME, hours: CFG.MIN_HOURS_BETWEEN_STAMPS } });
    if (p === '/staff/logout' && M === 'POST') { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(cookies(req).sq_staff)); return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('sq_staff', '', 0, 'Strict') }); }
    if (p === '/staff/stream' && M === 'GET') return stream(req, res, 'staff');

    // customers signed in at a table in the last 3 hours (masked phones)
    if (p === '/staff/tables' && M === 'GET') {
      const rows = db.prepare('SELECT p.table_number, p.at, c.id, c.phone, c.cycle FROM presence p JOIN customers c ON c.id=p.customer_id WHERE p.at>? ORDER BY p.table_number').all(t - 3 * H);
      return send(res, 200, rows.map(r => ({ id: r.id, table: r.table_number, phone: R.maskPhone(r.phone), card: card(r) })));
    }
    if (p === '/staff/customer' && M === 'GET') {
      const id = +url.searchParams.get('id'); const phone = R.normalizePhone(url.searchParams.get('phone'));
      const c = phone ? db.prepare('SELECT * FROM customers WHERE phone=?').get(phone) : Number.isInteger(id) && id > 0 ? db.prepare('SELECT * FROM customers WHERE id=?').get(id) : null;
      if (!c) return send(res, 404, { error: 'none' });
      return send(res, 200, { id: c.id, phone: phone ? c.phone : R.maskPhone(c.phone), card: card(c), ops: ops(c.id, +url.searchParams.get('before') || 0) });
    }
    if ((p === '/staff/stamp' || p === '/staff/redeem') && M === 'POST') {
      const b = await readBody(req); const rid = reqId(b.requestId); const cid = +b.customerId;
      if (!rid || !Number.isInteger(cid)) return send(res, 400, { error: 'bad input' });
      if (limited('act:' + staff.id, 60, 60e3, t)) return send(res, 429, { error: 'rate' });
      const isStamp = p === '/staff/stamp';
      // idempotent: the same requestId returns the original result
      const dup = db.prepare(`SELECT customer_id FROM ${isStamp ? 'stamps' : 'rewards'} WHERE request_id=?`).get(rid);
      if (dup) { const c0 = db.prepare('SELECT * FROM customers WHERE id=?').get(dup.customer_id); return send(res, 200, { ok: true, repeated: true, card: card(c0) }); }
      let result;
      db.exec('BEGIN IMMEDIATE');
      try {
        const c = db.prepare('SELECT * FROM customers WHERE id=?').get(cid);
        if (!c) { db.exec('ROLLBACK'); return send(res, 404, { error: 'none' }); }
        const st = card(c);
        const block = isStamp ? R.stampBlock(st) : R.redeemBlock(st);
        if (block) { db.exec('ROLLBACK'); return send(res, 409, { error: block, card: st }); }
        const table = tableNo(b.table) ?? db.prepare('SELECT table_number FROM presence WHERE customer_id=? AND at>?').get(cid, t - 3 * H)?.table_number ?? null;
        if (isStamp) {
          db.prepare('INSERT INTO stamps(customer_id,staff_id,table_number,created_at,cycle_id,request_id) VALUES(?,?,?,?,?,?)').run(cid, staff.id, table, t, c.cycle, rid);
          db.prepare('UPDATE customers SET last_visit_at=? WHERE id=?').run(t, cid);
        } else {
          db.prepare('INSERT INTO rewards(customer_id,staff_id,redeemed_at,cycle_id,request_id) VALUES(?,?,?,?,?)').run(cid, staff.id, t, c.cycle, rid);
          db.prepare('UPDATE customers SET cycle=cycle+1 WHERE id=?').run(cid);
        }
        audit('staff', staff.id, isStamp ? 'stamp' : 'redeem', cid, { table, cycle: c.cycle }, ctx);
        db.exec('COMMIT');
        result = card(db.prepare('SELECT * FROM customers WHERE id=?').get(cid));
      } catch (e) { try { db.exec('ROLLBACK'); } catch {} if (/UNIQUE/.test(e.message)) return send(res, 409, { error: 'duplicate' }); throw e; }
      publish('c:' + cid, 'card', result); publish('staff', 'card', { id: cid });
      return send(res, 200, { ok: true, card: result });
    }
    return send(res, 404, { error: 'not found' });
  }

  // ---------- static files (dev/test only) ----------
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
  function serveStatic(req, res, url) {
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(STATIC_ROOT, rel));
    if (!file.startsWith(STATIC_ROOT) || /\/(\.git|tools|apps)(\/|$)/.test(rel) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEC_HEADERS });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    let url; try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (STATIC_ROOT && req.method === 'GET') return serveStatic(req, res, url);
      send(res, 404, { error: 'not found' });
    } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server' }); }
  });

  function setStaff(username, role, name, password) {
    if (!['captain', 'admin'].includes(role)) throw new Error('role must be captain or admin');
    const pw = password || crypto.randomBytes(6).toString('base64url');
    db.prepare(`INSERT INTO staff(username,name,pass,role) VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET pass=excluded.pass, role=excluded.role, name=excluded.name, active=1`)
      .run(username.toLowerCase(), name || username, hashPass(pw), role);
    return pw;
  }
  return { server, db, setStaff };
}

module.exports = { createApp };

// ---------- CLI ----------
if (require.main === module) {
  const DATA_DIR = process.env.LOYALTY_DATA || path.join(__dirname, '.data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dev = process.env.NODE_ENV !== 'production';
  if (!dev && !process.env.LOYALTY_SECRET) { console.error('LOYALTY_SECRET is required in production'); process.exit(1); }
  const app = createApp({
    dbFile: path.join(DATA_DIR, 'loyalty.db'),
    staticRoot: process.env.STATIC_ROOT ? path.resolve(process.env.STATIC_ROOT) : null,
    secureCookies: !dev,
  });
  if (process.argv[2] === 'set-staff') {
    const [, , , username, role = 'captain', name, pw] = process.argv;
    if (!username) { console.log('usage: node server.js set-staff <username> <captain|admin> "<name>" [password]'); process.exit(1); }
    console.log(`User: ${username}\nPassword: ${app.setStaff(username, role, name, pw)}\nRole: ${role}`);
    process.exit(0);
  }
  const PORT = +process.env.PORT || 3200;
  app.server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`Sequoia Card API on :${PORT}${dev ? ' (dev)' : ''}`));
}
