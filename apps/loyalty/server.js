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
PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA temp_store=MEMORY; -- NORMAL is crash-safe with WAL (may lose the last commit on power loss, never corrupts)
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, last_visit_at INTEGER, cycle INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS staff(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('captain','admin')), pass TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS stamps(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), staff_id INTEGER NOT NULL REFERENCES staff(id), table_number INTEGER, created_at INTEGER NOT NULL, cycle_id INTEGER NOT NULL, request_id TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS rewards(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), staff_id INTEGER NOT NULL REFERENCES staff(id), redeemed_at INTEGER NOT NULL, cycle_id INTEGER NOT NULL, request_id TEXT UNIQUE, UNIQUE(customer_id, cycle_id));
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor_type TEXT NOT NULL, actor_id INTEGER, action TEXT NOT NULL, customer_id INTEGER, detail TEXT, ip TEXT, device TEXT);
CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('customer','staff')), subject_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS presence(customer_id INTEGER PRIMARY KEY REFERENCES customers(id), table_number INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS inbound_logins(nonce_hash TEXT PRIMARY KEY, code TEXT NOT NULL, expires INTEGER NOT NULL, phone TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS inbound_code ON inbound_logins(code);
CREATE TABLE IF NOT EXISTS calls(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, table_number INTEGER NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS calls_at ON calls(at);
CREATE INDEX IF NOT EXISTS stamps_customer_at ON stamps(customer_id, created_at);
DROP INDEX IF EXISTS stamps_customer;
CREATE INDEX IF NOT EXISTS stamps_created ON stamps(created_at);
CREATE INDEX IF NOT EXISTS rewards_customer ON rewards(customer_id);
CREATE INDEX IF NOT EXISTS audit_customer ON audit_log(customer_id, id);
`;

function hashPass(p) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(p, salt, 64).toString('hex'); }
function checkPass(p, stored) { const [s, h] = String(stored).split(':'); const c = crypto.scryptSync(String(p), Buffer.from(s, 'hex'), 64); return crypto.timingSafeEqual(c, Buffer.from(h, 'hex')); }
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function inboundFromEnv(env = process.env) {
  const secret = env.MESSAGEPRO_WEBHOOK_SECRET, waNumber = String(env.SEQUOIA_WA_NUMBER || '').replace(/\D/g, '');
  if (!secret || !waNumber) return null;
  return { secret, waNumber, inboxId: +env.MESSAGEPRO_INBOX_ID || null };
}

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
  // prepared-statement cache: compiling SQL on every request was the main CPU cost
  const stmts = new Map();
  const Q = sql => { let st = stmts.get(sql); if (!st) { st = db.prepare(sql); stmts.set(sql, st); } return st; };
  const sendOtp = opts.sendOtp || OTP.fromEnv();
  const SECRET = opts.secret || process.env.LOYALTY_SECRET || crypto.randomBytes(32).toString('hex');
  const STATIC_ROOT = opts.staticRoot || null; // dev/test only; in production Caddy serves the menu
  const secure = opts.secureCookies !== false;
  const limited = limiter();
  const H = 3600e3;

  const otpHash = (phone, code) => crypto.createHmac('sha256', SECRET).update(phone + ':' + code).digest('hex');
  // Option B (WhatsApp inbound login): enabled when the webhook secret and the café's WhatsApp number are set.
  const INBOUND = opts.inbound !== undefined ? opts.inbound : inboundFromEnv();

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
    'Cross-Origin-Resource-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
  // dev/test static pages get the same CSP that Caddy sends in production (tools/server-setup.sh)
  const PAGE_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
  function send(res, code, body, headers = {}) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...headers });
    res.end(JSON.stringify(body));
  }
  function readRaw(req, max) {
    return new Promise((ok, bad) => {
      const parts = []; let n = 0;
      req.on('data', c => { n += c.length; if (n > max) { bad(new Error('too large')); req.destroy(); } else parts.push(c); });
      req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
      req.on('error', bad);
    });
  }
  async function readBody(req) {
    const d = await readRaw(req, 1e4);
    try { const j = d ? JSON.parse(d) : {}; return j && typeof j === 'object' ? j : {}; } catch { throw new Error('bad json'); }
  }
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]));
  function cookie(name, value, maxAgeSec, sameSite) {
    return `${name}=${value}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=${sameSite}; Path=/api; Max-Age=${maxAgeSec}`;
  }
  function newSession(kind, id, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    Q('DELETE FROM sessions WHERE expires<?').run(now());
    Q('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(token), kind, id, now() + ttlMs);
    return token;
  }
  function sessionOf(req, kind) {
    const t = cookies(req)[kind === 'staff' ? 'sq_staff' : 'sq_card'];
    if (!t || t.length > 100) return null;
    return Q('SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires>?').get(sha(t), kind, now()) || null;
  }
  function audit(actorType, actorId, action, customerId, detail, ctx) {
    Q('INSERT INTO audit_log(at,actor_type,actor_id,action,customer_id,detail,ip,device) VALUES(?,?,?,?,?,?,?,?)')
      .run(now(), actorType, actorId ?? null, action, customerId ?? null, detail ? JSON.stringify(detail) : null, ctx.ip, ctx.device);
  }
  function card(customer) {
    const stamps = Q('SELECT created_at, cycle_id FROM stamps WHERE customer_id=? AND cycle_id=?').all(customer.id, customer.cycle);
    const last = Q('SELECT MAX(created_at) AS t FROM stamps WHERE customer_id=?').get(customer.id).t;
    if (last && !stamps.some(s => s.created_at === last)) stamps.push({ created_at: last, cycle_id: -1 }); // cooldown spans cycles
    const st = R.cardState(stamps, customer.cycle, now(), CFG);
    st.rewards = Q('SELECT COUNT(*) AS n FROM rewards WHERE customer_id=?').get(customer.id).n;
    st.rewardName = CFG.REWARD_NAME;
    return st;
  }
  function ops(customerId, before, limit = 10) {
    const rows = Q(`SELECT a.id, a.at, a.action, a.detail, s.name AS staff FROM audit_log a LEFT JOIN staff s ON s.id=a.actor_id AND a.actor_type='staff'
      WHERE a.customer_id=? AND a.action IN('stamp','redeem') AND a.id<? ORDER BY a.id DESC LIMIT ?`).all(customerId, before || 2 ** 53, limit + 1);
    return { items: rows.slice(0, limit).map(r => ({ id: r.id, at: r.at, action: r.action, staff: r.staff, table: (JSON.parse(r.detail || '{}')).table ?? null })), more: rows.length > limit };
  }
  function loginCustomer(phone, t, ctx, via) {
    Q('INSERT INTO customers(phone,created_at,last_visit_at) VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET last_visit_at=excluded.last_visit_at').run(phone, t, t);
    const c = Q('SELECT * FROM customers WHERE phone=?').get(phone);
    const ttl = CFG.CUSTOMER_SESSION_DAYS * 24 * H;
    const token = newSession('customer', c.id, ttl);
    audit('customer', c.id, 'login', c.id, { via }, ctx);
    return cookie('sq_card', token, ttl / 1000, 'Lax');
  }

  // Message Pro (Chatwoot-based) signs webhooks: X-Chatwoot-Signature = "sha256=" + HMAC-SHA256(secret, `${timestamp}.${rawBody}`),
  // X-Chatwoot-Timestamp = unix seconds. Old or unsigned deliveries are rejected.
  function verifyWebhook(req, raw) {
    const ts = String(req.headers['x-chatwoot-timestamp'] || '');
    const sig = String(req.headers['x-chatwoot-signature'] || '');
    if (!/^\d{9,11}$/.test(ts) || Math.abs(now() / 1000 - +ts) > 300) return false;
    const want = Buffer.from('sha256=' + crypto.createHmac('sha256', INBOUND.secret).update(ts + '.' + raw).digest('hex'));
    const got = Buffer.from(sig);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  async function inboundHook(req, res, ctx) {
    const raw = await readRaw(req, 1e6);
    if (!verifyWebhook(req, raw)) { console.warn('webhook: rejected (signature/timestamp)'); return send(res, 401, { error: 'signature' }); }
    let ev; try { ev = JSON.parse(raw); } catch { return send(res, 400, { error: 'bad json' }); }
    const t = now();
    const incoming = ev.event === 'message_created' && (ev.message_type === 'incoming' || ev.message_type === 0) && !ev.private;
    const inboxOk = !INBOUND.inboxId || +(ev.inbox?.id ?? ev.conversation?.inbox_id) === INBOUND.inboxId;
    const text = String(ev.content || '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660));
    const m = text.match(/\bSEQ[\s-]?(\d{6})\b/i);
    if (!incoming || !inboxOk || !m) return send(res, 200, { ok: true, ignored: true });
    const phone = R.normalizePhone(ev.sender?.phone_number || ev.conversation?.meta?.sender?.phone_number || '');
    if (!phone || limited('hook:' + phone, 10, H, t)) return send(res, 200, { ok: true, ignored: true });
    const r = Q('UPDATE inbound_logins SET phone=? WHERE code=? AND expires>? AND phone IS NULL').run(phone, m[1], t);
    if (r.changes) audit('customer', null, 'whatsapp_verified', null, { phone: R.maskPhone(phone) }, ctx);
    return send(res, 200, { ok: true });
  }

  // ---------- signed table QR links: /?t=7&s=<sig>. Unsigned ?table=7 only while TABLE_QR_LEGACY=1 (old printed QRs). ----------
  const LEGACY_TABLES = opts.legacyTables ?? process.env.TABLE_QR_LEGACY === '1';
  const tableSig = n => crypto.createHmac('sha256', SECRET).update('table:' + n).digest('base64url').slice(0, 12);
  function tableOk(n, s) {
    if (typeof s === 'string' && s.length === 12) {
      const a = Buffer.from(s), b = Buffer.from(tableSig(n));
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
    return LEGACY_TABLES;
  }

  const REPORT = opts.report || { url: process.env.REPORT_SHEET_URL || '', token: process.env.REPORT_SHEET_TOKEN || '' };
  const CALL_HISTORY_MS = 12 * H;
  function addCall(msg, t) {
    if (Math.random() < 0.02) Q('DELETE FROM calls WHERE at<?').run(t - 2 * CALL_HISTORY_MS);
    const id = Number(Q('INSERT INTO calls(at,table_number,body) VALUES(?,?,?)').run(t, +msg.table, JSON.stringify(msg)).lastInsertRowid);
    publish('calls', 'msg', { id, time: t, body: msg });
    return id;
  }

  const reqId = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null);
  const tableNo = v => { const n = +v; return Number.isInteger(n) && n >= 1 && n <= 999 ? n : null; };

  // ---------- API ----------
  async function api(req, res, url) {
    const p = url.pathname.slice(4); const M = req.method;
    const ctx = { ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress, device: String(req.headers['user-agent'] || '').slice(0, 160) };
    const t = now();

    // Server-to-server webhook from Message Pro: authenticated by its HMAC signature, not by the CSRF rules below.
    if (p === '/hooks/messagepro' && M === 'POST') return INBOUND ? inboundHook(req, res, ctx) : send(res, 404, { error: 'not found' });

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
      const prev = Q('SELECT sent_at FROM otps WHERE phone=?').get(phone);
      if (prev && t - prev.sent_at < CFG.OTP_RESEND_SEC * 1000) return send(res, 429, { error: 'wait', retryIn: Math.ceil((CFG.OTP_RESEND_SEC * 1000 - (t - prev.sent_at)) / 1000) });
      if (limited('ip:' + ctx.ip, CFG.OTP_MAX_PER_IP_HOUR, H, t) || limited('ph:' + phone, CFG.OTP_MAX_PER_PHONE_HOUR, H, t))
        return send(res, 429, { error: 'rate' });
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      Q('INSERT INTO otps(phone,code_hash,expires,attempts,sent_at) VALUES(?,?,?,0,?) ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash, expires=excluded.expires, attempts=0, sent_at=excluded.sent_at')
        .run(phone, otpHash(phone, code), t + CFG.OTP_TTL_MIN * 60e3, t);
      try { await sendOtp(phone, code); } catch (e) { console.error('otp send failed', e.message); return send(res, 502, { error: 'send' }); }
      audit('customer', null, 'otp_request', null, { phone: R.maskPhone(phone) }, ctx);
      return send(res, 200, { ok: true, resendIn: CFG.OTP_RESEND_SEC }); // same answer for new and existing numbers
    }
    if (p === '/otp/verify' && M === 'POST') {
      const b = await readBody(req); const phone = R.normalizePhone(b.phone); const code = String(b.code ?? '');
      if (limited('vip:' + ctx.ip, 40, H, t)) return send(res, 429, { error: 'rate' });
      const row = phone && Q('SELECT * FROM otps WHERE phone=?').get(phone);
      const bad = () => send(res, 400, { error: 'code' }); // one generic error for every failure
      if (!row || row.expires < t || row.attempts >= CFG.OTP_MAX_ATTEMPTS || !/^\d{6}$/.test(code)) { if (row) Q('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone); return bad(); }
      const ok = crypto.timingSafeEqual(Buffer.from(otpHash(phone, code), 'hex'), Buffer.from(row.code_hash, 'hex'));
      if (!ok) { Q('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone); return bad(); }
      Q('DELETE FROM otps WHERE phone=?').run(phone);
      return send(res, 200, { ok: true }, { 'Set-Cookie': loginCustomer(phone, t, ctx, 'otp') });
    }

    // ----- customer: Option B — send "SEQ-123456" to the café on WhatsApp -----
    if (p === '/login/options' && M === 'GET') return send(res, 200, { otp: true, whatsapp: !!INBOUND });
    if (p === '/otp/inbound/start' && M === 'POST') {
      if (!INBOUND) return send(res, 404, { error: 'not found' });
      if (limited('ib:' + ctx.ip, CFG.OTP_MAX_PER_IP_HOUR, H, t)) return send(res, 429, { error: 'rate' });
      Q('DELETE FROM inbound_logins WHERE expires<?').run(t);
      let code;
      do code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      while (Q('SELECT 1 FROM inbound_logins WHERE code=?').get(code));
      const nonce = crypto.randomBytes(32).toString('base64url');
      const ttl = CFG.OTP_TTL_MIN * 60e3;
      Q('INSERT INTO inbound_logins(nonce_hash,code,expires,phone,created_at) VALUES(?,?,?,NULL,?)').run(sha(nonce), code, t + ttl, t);
      const text = 'SEQ-' + code;
      return send(res, 200, { code: text, wa: `https://wa.me/${INBOUND.waNumber}?text=${encodeURIComponent(text)}`, expiresIn: ttl / 1000 },
        { 'Set-Cookie': cookie('sq_pending', nonce, ttl / 1000, 'Strict') });
    }
    if (p === '/otp/inbound/status' && M === 'GET') {
      if (!INBOUND) return send(res, 404, { error: 'not found' });
      const n = cookies(req).sq_pending;
      const row = n && n.length < 100 && Q('SELECT * FROM inbound_logins WHERE nonce_hash=?').get(sha(n));
      if (!row || row.expires < t) return send(res, 410, { error: 'expired' });
      if (!row.phone) return send(res, 200, { pending: true });
      Q('DELETE FROM inbound_logins WHERE nonce_hash=?').run(row.nonce_hash);
      return send(res, 200, { ok: true }, { 'Set-Cookie': [loginCustomer(row.phone, t, ctx, 'whatsapp'), cookie('sq_pending', '', 0, 'Strict')] });
    }

    // ----- table calls from the menu (replaces ntfy.sh): call waiter / bill / request -----
    if (p === '/calls' && M === 'POST') {
      const b = await readBody(req); const tn = tableNo(b.table);
      if (!tn || !tableOk(tn, b.s)) return send(res, 403, { error: 'table' });
      if (!['call', 'bill', 'req'].includes(b.type)) return send(res, 400, { error: 'type' });
      if (limited('call:' + ctx.ip, 40, H, t) || limited('calltbl:' + tn, 20, 10 * 60e3, t)) return send(res, 429, { error: 'rate' });
      const msg = { type: b.type, table: String(tn), rid: /^[a-z0-9]{4,24}$/.test(b.rid) ? b.rid : t.toString(36) };
      if (b.type === 'bill') msg.pay = String(b.pay ?? '').slice(0, 40);
      if (b.type === 'req') msg.item = String(b.item ?? '').slice(0, 80);
      return send(res, 200, { ok: true, id: addCall(msg, t) });
    }

    // ----- customer: read-only card -----
    if (p.startsWith('/me')) {
      const s = sessionOf(req, 'customer');
      if (!s) return send(res, 401, { error: 'login' });
      const c = Q('SELECT * FROM customers WHERE id=?').get(s.subject_id);
      if (!c) return send(res, 401, { error: 'login' });
      if (p === '/me' && M === 'GET') {
        const tn = tableNo(url.searchParams.get('table'));
        if (tn && tableOk(tn, url.searchParams.get('s'))) { Q('INSERT INTO presence VALUES(?,?,?) ON CONFLICT(customer_id) DO UPDATE SET table_number=excluded.table_number, at=excluded.at').run(c.id, tn, t); publish('staff', 'presence', {}); }
        return send(res, 200, { phone: c.phone, card: card(c) });
      }
      if (p === '/me/stream' && M === 'GET') return stream(req, res, 'c:' + c.id);
      if (p === '/me/logout' && M === 'POST') {
        Q('DELETE FROM sessions WHERE token_hash=?').run(sha(cookies(req).sq_card));
        Q('DELETE FROM presence WHERE customer_id=?').run(c.id);
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('sq_card', '', 0, 'Lax') });
      }
      return send(res, 404, { error: 'not found' });
    }

    // ----- staff -----
    if (p === '/staff/login' && M === 'POST') {
      if (limited('slip:' + ctx.ip, 10, 15 * 60e3, t)) return send(res, 429, { error: 'rate' });
      const b = await readBody(req);
      const u = Q('SELECT * FROM staff WHERE username=? AND active=1').get(String(b.username ?? '').trim().toLowerCase().slice(0, 60));
      if (!u || !checkPass(String(b.password ?? '').slice(0, 200), u.pass)) { audit('staff', u?.id, 'login_failed', null, null, ctx); return send(res, 401, { error: 'creds' }); }
      const ttl = CFG.STAFF_SESSION_HOURS * H;
      audit('staff', u.id, 'login', null, null, ctx);
      return send(res, 200, { ok: true, name: u.name, role: u.role }, { 'Set-Cookie': cookie('sq_staff', newSession('staff', u.id, ttl), ttl / 1000, 'Strict') });
    }
    if (!p.startsWith('/staff/')) return send(res, 404, { error: 'not found' });
    const ss = sessionOf(req, 'staff');
    const staff = ss && Q('SELECT * FROM staff WHERE id=? AND active=1').get(ss.subject_id);
    if (!staff) return send(res, 401, { error: 'login' });

    if (p === '/staff/me' && M === 'GET') return send(res, 200, { name: staff.name, role: staff.role, rules: { required: CFG.STAMPS_REQUIRED, reward: CFG.REWARD_NAME, hours: CFG.MIN_HOURS_BETWEEN_STAMPS } });
    if (p === '/staff/logout' && M === 'POST') { Q('DELETE FROM sessions WHERE token_hash=?').run(sha(cookies(req).sq_staff)); return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('sq_staff', '', 0, 'Strict') }); }
    if (p === '/staff/stream' && M === 'GET') return stream(req, res, 'staff');

    // captain screen: live table calls (replays the last 12 h on connect) and took/undo updates
    if (p === '/staff/calls/stream' && M === 'GET') {
      stream(req, res, 'calls');
      for (const r of Q('SELECT id, at, body FROM calls WHERE at>? ORDER BY id').all(t - CALL_HISTORY_MS))
        res.write(`event: msg\ndata: ${JSON.stringify({ id: r.id, time: r.at, body: JSON.parse(r.body) })}\n\n`);
      return;
    }
    // captain "تمام" rows -> Google report sheet; URL + token stay on the server
    if (p === '/staff/report' && M === 'POST') {
      if (!REPORT.url) return send(res, 503, { error: 'report off' });
      const b = await readRaw(req, 2e5); let rows;
      try { rows = JSON.parse(b).rows; } catch { return send(res, 400, { error: 'bad json' }); }
      if (!Array.isArray(rows) || rows.length > 200) return send(res, 400, { error: 'bad' });
      try {
        const r = await (opts.fetchImpl || fetch)(REPORT.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ token: REPORT.token, by: staff.username, rows }), signal: AbortSignal.timeout(15000) });
        if (!r.ok) return send(res, 502, { error: 'sheet' });
      } catch { return send(res, 502, { error: 'sheet' }); }
      return send(res, 200, { ok: true });
    }
    if (p === '/staff/calls' && M === 'POST') {
      const b = await readBody(req); const tn = tableNo(b.table);
      if (!tn || !['took', 'undo'].includes(b.type)) return send(res, 400, { error: 'bad' });
      const msg = { type: b.type, table: String(tn), by: staff.name };
      if (b.type === 'took') msg.rids = (Array.isArray(b.rids) ? b.rids : []).filter(x => typeof x === 'string' && x.length <= 24).slice(0, 50);
      if (b.type === 'undo') msg.calls = (Array.isArray(b.calls) ? b.calls : []).slice(0, 50);
      if (JSON.stringify(msg).length > 8000) return send(res, 400, { error: 'bad' });
      return send(res, 200, { ok: true, id: addCall(msg, t) });
    }

    // customers signed in at a table in the last 3 hours (masked phones)
    if (p === '/staff/tables' && M === 'GET') {
      const rows = Q('SELECT p.table_number, p.at, c.id, c.phone, c.cycle FROM presence p JOIN customers c ON c.id=p.customer_id WHERE p.at>? ORDER BY p.table_number').all(t - 3 * H);
      return send(res, 200, rows.map(r => ({ id: r.id, table: r.table_number, phone: R.maskPhone(r.phone), card: card(r) })));
    }
    if (p === '/staff/customer' && M === 'GET') {
      const id = +url.searchParams.get('id'); const phone = R.normalizePhone(url.searchParams.get('phone'));
      const c = phone ? Q('SELECT * FROM customers WHERE phone=?').get(phone) : Number.isInteger(id) && id > 0 ? Q('SELECT * FROM customers WHERE id=?').get(id) : null;
      if (!c) return send(res, 404, { error: 'none' });
      return send(res, 200, { id: c.id, phone: phone ? c.phone : R.maskPhone(c.phone), card: card(c), ops: ops(c.id, +url.searchParams.get('before') || 0) });
    }
    if ((p === '/staff/stamp' || p === '/staff/redeem') && M === 'POST') {
      const b = await readBody(req); const rid = reqId(b.requestId); const cid = +b.customerId;
      if (!rid || !Number.isInteger(cid)) return send(res, 400, { error: 'bad input' });
      if (limited('act:' + staff.id, 60, 60e3, t)) return send(res, 429, { error: 'rate' });
      const isStamp = p === '/staff/stamp';
      // idempotent: the same requestId returns the original result
      const dup = Q(`SELECT customer_id FROM ${isStamp ? 'stamps' : 'rewards'} WHERE request_id=?`).get(rid);
      if (dup) { const c0 = Q('SELECT * FROM customers WHERE id=?').get(dup.customer_id); return send(res, 200, { ok: true, repeated: true, card: card(c0) }); }
      let result;
      db.exec('BEGIN IMMEDIATE');
      try {
        const c = Q('SELECT * FROM customers WHERE id=?').get(cid);
        if (!c) { db.exec('ROLLBACK'); return send(res, 404, { error: 'none' }); }
        const st = card(c);
        const block = isStamp ? R.stampBlock(st) : R.redeemBlock(st);
        if (block) { db.exec('ROLLBACK'); return send(res, 409, { error: block, card: st }); }
        const table = tableNo(b.table) ?? Q('SELECT table_number FROM presence WHERE customer_id=? AND at>?').get(cid, t - 3 * H)?.table_number ?? null;
        if (isStamp) {
          Q('INSERT INTO stamps(customer_id,staff_id,table_number,created_at,cycle_id,request_id) VALUES(?,?,?,?,?,?)').run(cid, staff.id, table, t, c.cycle, rid);
          Q('UPDATE customers SET last_visit_at=? WHERE id=?').run(t, cid);
        } else {
          Q('INSERT INTO rewards(customer_id,staff_id,redeemed_at,cycle_id,request_id) VALUES(?,?,?,?,?)').run(cid, staff.id, t, c.cycle, rid);
          Q('UPDATE customers SET cycle=cycle+1 WHERE id=?').run(cid);
        }
        audit('staff', staff.id, isStamp ? 'stamp' : 'redeem', cid, { table, cycle: c.cycle }, ctx);
        db.exec('COMMIT');
        result = card(Q('SELECT * FROM customers WHERE id=?').get(cid));
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
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEC_HEADERS, ...(file.endsWith('.html') ? { 'Content-Security-Policy': PAGE_CSP } : {}) });
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
    Q(`INSERT INTO staff(username,name,pass,role) VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET pass=excluded.pass, role=excluded.role, name=excluded.name, active=1`)
      .run(username.toLowerCase(), name || username, hashPass(pw), role);
    return pw;
  }
  return { server, db, setStaff, tableSig };
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
  if (process.argv[2] === 'table-links') {
    const [, , , base, from = '1', to = from] = process.argv;
    if (!base) { console.log('usage: node server.js table-links https://<menu domain>/ <from> [to]'); process.exit(1); }
    for (let n = +from; n <= +to; n++) { const u = new URL(base); u.searchParams.set('t', n); u.searchParams.set('s', app.tableSig(n)); console.log(n + '\t' + u); }
    process.exit(0);
  }
  const PORT = +process.env.PORT || 3200;
  app.server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`Sequoia Card API on :${PORT}${dev ? ' (dev)' : ''}`));
}
