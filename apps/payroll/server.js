// Titan Payroll — employee KPI & salary tracker with logins, roles and an audit log.
// No npm dependencies: Node 22+ built-ins only (http, crypto, node:sqlite).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.PAYROLL_DATA || '/var/lib/titan-payroll';
const PORT = +process.env.PORT || 3100;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'payroll.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pass TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('admin','editor','viewer')), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT, phone TEXT, start TEXT, base REAL DEFAULT 0, fixed_pct REAL DEFAULT 70, notes TEXT, archived INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS records(month TEXT NOT NULL, emp_id INTEGER NOT NULL, absence REAL DEFAULT 0, late REAL DEFAULT 0, minor REAL DEFAULT 0, major REAL DEFAULT 0, quality REAL DEFAULT 0, meetings REAL DEFAULT 0, delivery REAL DEFAULT 0, notes TEXT, PRIMARY KEY(month, emp_id));
CREATE TABLE IF NOT EXISTS points(id INTEGER PRIMARY KEY, month TEXT NOT NULL, emp_id INTEGER NOT NULL, points REAL NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL, by_user INTEGER);
CREATE TABLE IF NOT EXISTS months(month TEXT PRIMARY KEY, bonus_budget REAL DEFAULT 0, locked INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), work_days REAL DEFAULT 26, absence REAL DEFAULT 1, late REAL DEFAULT 0.25, minor REAL DEFAULT 0.5, major REAL DEFAULT 1);
INSERT OR IGNORE INTO settings(id) VALUES(1);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, user_id INTEGER, user_name TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, label TEXT, before TEXT, after TEXT);
`);

// ---------- passwords & sessions ----------
function hashPass(p) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(p, salt, 64); return salt.toString('hex') + ':' + h.toString('hex'); }
function checkPass(p, stored) { const [s, h] = stored.split(':'); const c = crypto.scryptSync(p, Buffer.from(s, 'hex'), 64); return crypto.timingSafeEqual(c, Buffer.from(h, 'hex')); }
const SESSION_MS = 12 * 3600e3;

// ---------- CLI: node server.js set-user <username> <role> "<name>" [password] ----------
if (process.argv[2] === 'set-user') {
  const [, , , username, role = 'admin', name = username, pw] = process.argv;
  const password = pw || crypto.randomBytes(6).toString('base64url');
  db.prepare(`INSERT INTO users(username,name,pass,role) VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET pass=excluded.pass, role=excluded.role, name=excluded.name, active=1`).run(username, name, hashPass(password), role);
  console.log(`User: ${username}\nPassword: ${password}\nRole: ${role}`);
  process.exit(0);
}
if (process.argv[2] === 'backup') {
  const dir = process.argv[3] || '/var/backups/titan-payroll'; fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, new Date().toISOString().slice(0, 10) + '.db'); if (fs.existsSync(f)) fs.unlinkSync(f);
  db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(dir).filter(x => x.endsWith('.db')).sort(); while (files.length > 30) fs.unlinkSync(path.join(dir, files.shift()));
  console.log('Backup:', f); process.exit(0);
}

// ---------- helpers ----------
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };
const MONTH_RE = /^\d{4}-\d{2}$/;
const num = (v, min = 0, max = 1e9) => { const n = +v; return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0; };
const str = (v, n = 500) => String(v ?? '').slice(0, n);
function send(res, code, body, headers = {}) {
  const isStr = typeof body === 'string';
  res.writeHead(code, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(isStr ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, bad) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) { bad(new Error('too large')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { bad(new Error('bad json')); } }); });
}
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0])); }
function currentUser(req) {
  const t = cookies(req).tp_session; if (!t) return null;
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(t, Date.now());
  return row || null;
}
function audit(user, action, entity, label, before, after) {
  db.prepare('INSERT INTO audit(at,user_id,user_name,action,entity,label,before,after) VALUES(?,?,?,?,?,?,?,?)')
    .run(Date.now(), user.id, user.name, action, entity, label || '', before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}
function diff(before, after) { // keep only changed fields
  if (!before) return [null, after]; const b = {}, a = {};
  for (const k of Object.keys(after)) if (String(before[k] ?? '') !== String(after[k] ?? '')) { b[k] = before[k]; a[k] = after[k]; }
  return Object.keys(a).length ? [b, a] : [null, null];
}
const isLocked = m => !!db.prepare('SELECT locked FROM months WHERE month=?').get(m)?.locked;
const empName = id => db.prepare('SELECT name FROM employees WHERE id=?').get(id)?.name || '#' + id;

// ---------- login rate limit ----------
const fails = new Map();
function tooMany(ip) { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.t < 15 * 60e3; }
function noteFail(ip) { const f = fails.get(ip) || { n: 0, t: Date.now() }; if (Date.now() - f.t > 15 * 60e3) { f.n = 0; f.t = Date.now(); } f.n++; fails.set(ip, f); }

// ---------- API ----------
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, ''); const M = req.method;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  if (p === '/login' && M === 'POST') {
    if (tooMany(ip)) return send(res, 429, { error: 'محاولات كتير غلط. استنى ربع ساعة وجرّب تاني.' });
    const b = await readBody(req); const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(str(b.username, 60).trim().toLowerCase());
    if (!u || !checkPass(str(b.password, 200), u.pass)) { noteFail(ip); return send(res, 401, { error: 'اسم المستخدم أو الباسورد غلط.' }); }
    fails.delete(ip); const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, u.id, Date.now() + SESSION_MS);
    audit(u, 'login', 'session', '');
    return send(res, 200, { ok: true }, { 'Set-Cookie': `tp_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
  }
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (M !== 'GET' && req.headers['x-requested-with'] !== 'payroll') return send(res, 403, { error: 'forbidden' }); // CSRF guard
  const need = r => { if (ROLE_RANK[user.role] < ROLE_RANK[r]) { send(res, 403, { error: 'مش عندك صلاحية للتعديل ده.' }); return false; } return true; };

  if (p === '/logout' && M === 'POST') { db.prepare('DELETE FROM sessions WHERE token=?').run(cookies(req).tp_session); return send(res, 200, { ok: true }, { 'Set-Cookie': 'tp_session=; Path=/; Max-Age=0' }); }
  if (p === '/me') return send(res, 200, { id: user.id, name: user.name, username: user.username, role: user.role });
  if (p === '/password' && M === 'POST') {
    const b = await readBody(req); if (!checkPass(str(b.current, 200), user.pass)) return send(res, 400, { error: 'الباسورد الحالي غلط.' });
    if (str(b.next, 200).length < 8) return send(res, 400, { error: 'الباسورد الجديد لازم يكون ٨ حروف على الأقل.' });
    db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(b.next), user.id); audit(user, 'update', 'password', user.name); return send(res, 200, { ok: true });
  }

  if (p === '/data' && M === 'GET') {
    return send(res, 200, {
      employees: db.prepare('SELECT * FROM employees').all(),
      records: db.prepare('SELECT * FROM records').all(),
      points: db.prepare('SELECT p.*, u.name AS by_name FROM points p LEFT JOIN users u ON u.id=p.by_user').all(),
      months: db.prepare('SELECT * FROM months').all(),
      settings: db.prepare('SELECT * FROM settings WHERE id=1').get(),
    });
  }

  if (p === '/employees' && M === 'POST') {
    if (!need('editor')) return; const b = await readBody(req);
    const d = { name: str(b.name, 100).trim(), role: str(b.role, 100), phone: str(b.phone, 40), start: str(b.start, 10), base: num(b.base), fixed_pct: num(b.fixed_pct, 0, 100), notes: str(b.notes, 2000) };
    if (!d.name) return send(res, 400, { error: 'اكتب اسم الموظف.' });
    if (b.id) {
      const before = db.prepare('SELECT * FROM employees WHERE id=?').get(+b.id); if (!before) return send(res, 404, { error: 'not found' });
      if ((d.base !== before.base || d.fixed_pct !== before.fixed_pct) && !need('admin')) return;
      db.prepare('UPDATE employees SET name=?,role=?,phone=?,start=?,base=?,fixed_pct=?,notes=? WHERE id=?').run(d.name, d.role, d.phone, d.start, d.base, d.fixed_pct, d.notes, +b.id);
      const [bf, af] = diff(before, d); if (af) audit(user, 'update', 'employee', d.name, bf, af); return send(res, 200, { id: +b.id });
    }
    if (!need('admin')) return;
    const r = db.prepare('INSERT INTO employees(name,role,phone,start,base,fixed_pct,notes) VALUES(?,?,?,?,?,?,?)').run(d.name, d.role, d.phone, d.start, d.base, d.fixed_pct, d.notes);
    audit(user, 'create', 'employee', d.name, null, d); return send(res, 200, { id: Number(r.lastInsertRowid) });
  }
  const arch = p.match(/^\/employees\/(\d+)\/archive$/);
  if (arch && M === 'POST') { if (!need('admin')) return; db.prepare('UPDATE employees SET archived=1 WHERE id=?').run(+arch[1]); audit(user, 'archive', 'employee', empName(+arch[1])); return send(res, 200, { ok: true }); }

  if (p === '/records' && M === 'POST') {
    if (!need('editor')) return; const b = await readBody(req); const m = str(b.month, 7); const emp = +b.emp_id;
    if (!MONTH_RE.test(m) || !emp) return send(res, 400, { error: 'bad input' });
    if (isLocked(m)) return send(res, 409, { error: 'الشهر ده مقفول. افتحه الأول من الأدمن.' });
    const d = { absence: num(b.absence), late: num(b.late), minor: num(b.minor), major: num(b.major), quality: num(b.quality, 0, 100), meetings: num(b.meetings, 0, 100), delivery: num(b.delivery, 0, 100), notes: str(b.notes, 2000) };
    const before = db.prepare('SELECT * FROM records WHERE month=? AND emp_id=?').get(m, emp);
    db.prepare(`INSERT INTO records(month,emp_id,absence,late,minor,major,quality,meetings,delivery,notes) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(month,emp_id) DO UPDATE SET absence=excluded.absence,late=excluded.late,minor=excluded.minor,major=excluded.major,quality=excluded.quality,meetings=excluded.meetings,delivery=excluded.delivery,notes=excluded.notes`)
      .run(m, emp, d.absence, d.late, d.minor, d.major, d.quality, d.meetings, d.delivery, d.notes);
    const [bf, af] = diff(before, d); if (af) audit(user, before ? 'update' : 'create', 'record', `${empName(emp)} · ${m}`, bf, af);
    return send(res, 200, { ok: true });
  }

  if (p === '/points' && M === 'POST') {
    if (!need('editor')) return; const b = await readBody(req); const m = str(b.month, 7);
    if (!MONTH_RE.test(m)) return send(res, 400, { error: 'bad month' });
    if (isLocked(m)) return send(res, 409, { error: 'الشهر ده مقفول.' });
    const d = { emp_id: +b.emp_id, points: num(b.points, 0.5, 1000), reason: str(b.reason, 300).trim() };
    if (!d.reason || !d.emp_id) return send(res, 400, { error: 'اكتب السبب وعدد النقاط.' });
    db.prepare('INSERT INTO points(month,emp_id,points,reason,at,by_user) VALUES(?,?,?,?,?,?)').run(m, d.emp_id, d.points, d.reason, Date.now(), user.id);
    audit(user, 'create', 'points', `${empName(d.emp_id)} · ${m}`, null, { points: d.points, reason: d.reason }); return send(res, 200, { ok: true });
  }
  const delPt = p.match(/^\/points\/(\d+)$/);
  if (delPt && M === 'DELETE') {
    if (!need('editor')) return; const before = db.prepare('SELECT * FROM points WHERE id=?').get(+delPt[1]); if (!before) return send(res, 404, { error: 'not found' });
    if (isLocked(before.month)) return send(res, 409, { error: 'الشهر ده مقفول.' });
    db.prepare('DELETE FROM points WHERE id=?').run(+delPt[1]); audit(user, 'delete', 'points', `${empName(before.emp_id)} · ${before.month}`, { points: before.points, reason: before.reason }, null); return send(res, 200, { ok: true });
  }

  if (p === '/months' && M === 'POST') {
    if (!need('admin')) return; const b = await readBody(req); const m = str(b.month, 7); if (!MONTH_RE.test(m)) return send(res, 400, { error: 'bad month' });
    const before = db.prepare('SELECT * FROM months WHERE month=?').get(m) || { bonus_budget: 0, locked: 0 };
    const d = { bonus_budget: b.bonus_budget !== undefined ? num(b.bonus_budget) : before.bonus_budget, locked: b.locked !== undefined ? (b.locked ? 1 : 0) : before.locked };
    if (before.locked && d.locked && d.bonus_budget !== before.bonus_budget) return send(res, 409, { error: 'الشهر ده مقفول.' });
    db.prepare('INSERT INTO months(month,bonus_budget,locked) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET bonus_budget=excluded.bonus_budget, locked=excluded.locked').run(m, d.bonus_budget, d.locked);
    const [bf, af] = diff(before, d); if (af) audit(user, 'update', 'month', m, bf, af); return send(res, 200, { ok: true });
  }

  if (p === '/settings' && M === 'POST') {
    if (!need('admin')) return; const b = await readBody(req); const before = db.prepare('SELECT * FROM settings WHERE id=1').get();
    const d = { work_days: num(b.work_days, 1, 31), absence: num(b.absence, 0, 10), late: num(b.late, 0, 10), minor: num(b.minor, 0, 10), major: num(b.major, 0, 10) };
    db.prepare('UPDATE settings SET work_days=?,absence=?,late=?,minor=?,major=? WHERE id=1').run(d.work_days, d.absence, d.late, d.minor, d.major);
    const [bf, af] = diff(before, d); if (af) audit(user, 'update', 'settings', 'قواعد الخصم', bf, af); return send(res, 200, { ok: true });
  }

  if (p === '/audit' && M === 'GET') {
    const lim = Math.min(500, +url.searchParams.get('limit') || 200);
    return send(res, 200, db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(lim));
  }

  if (p === '/users' && M === 'GET') { if (!need('admin')) return; return send(res, 200, db.prepare('SELECT id,username,name,role,active FROM users ORDER BY id').all()); }
  if (p === '/users' && M === 'POST') {
    if (!need('admin')) return; const b = await readBody(req);
    const d = { username: str(b.username, 60).trim().toLowerCase(), name: str(b.name, 100).trim(), role: ['admin', 'editor', 'viewer'].includes(b.role) ? b.role : 'viewer', active: b.active === false ? 0 : 1 };
    if (b.id) {
      const before = db.prepare('SELECT id,username,name,role,active FROM users WHERE id=?').get(+b.id); if (!before) return send(res, 404, { error: 'not found' });
      if (before.id === user.id && (d.role !== 'admin' || !d.active)) return send(res, 400, { error: 'مينفعش تشيل صلاحية الأدمن من نفسك.' });
      db.prepare('UPDATE users SET name=?,role=?,active=? WHERE id=?').run(d.name || before.name, d.role, d.active, before.id);
      if (!d.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(before.id);
      let pw = null; if (b.reset) { pw = crypto.randomBytes(6).toString('base64url'); db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(pw), before.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(before.id); }
      const [bf, af] = diff(before, { name: d.name || before.name, role: d.role, active: d.active }); audit(user, 'update', 'user', before.username, bf, b.reset ? { ...(af || {}), password: 'reset' } : af);
      return send(res, 200, { ok: true, password: pw });
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(d.username) || !d.name) return send(res, 400, { error: 'اسم المستخدم: حروف إنجليزي وأرقام بس (٣ حروف على الأقل)، واكتب الاسم.' });
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(d.username)) return send(res, 400, { error: 'اسم المستخدم ده موجود.' });
    const pw = crypto.randomBytes(6).toString('base64url');
    db.prepare('INSERT INTO users(username,name,pass,role) VALUES(?,?,?,?)').run(d.username, d.name, hashPass(pw), d.role);
    audit(user, 'create', 'user', d.username, null, { name: d.name, role: d.role }); return send(res, 200, { ok: true, password: pw });
  }

  send(res, 404, { error: 'not found' });
}

const INDEX = path.join(__dirname, 'public', 'index.html');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
      return fs.createReadStream(INDEX).pipe(res);
    }
    send(res, 404, 'Not found');
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'حصل خطأ في السيرفر.' }); }
}).listen(PORT, '127.0.0.1', () => console.log('Titan Payroll on 127.0.0.1:' + PORT));
