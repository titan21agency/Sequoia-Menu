'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const H = 3600e3;

async function setup() {
  let clock = 1_800_000_000_000; const codes = {};
  const app = createApp({ now: () => clock, sendOtp: async (p, c) => { codes[p] = c; }, secret: 'test', secureCookies: false });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const jar = () => {
    let ck = {};
    return async (method, path, body, { csrf = true, ip } = {}) => {
      const h = { cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ') };
      if (csrf) h['x-requested-with'] = 'sequoia';
      if (body) h['content-type'] = 'application/json';
      if (ip) h['x-forwarded-for'] = ip;
      const r = await fetch(base + '/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
    };
  };
  app.setStaff('captain1', 'captain', 'Kareem', 'pass-1234');
  return { app, codes, jar, tick: ms => { clock += ms; }, close: () => { app.server.closeAllConnections(); app.server.close(); } };
}
async function customerLogin(t, phone = '01012345678', ip = '1.1.1.1') {
  const c = t.jar();
  assert.equal((await c('POST', '/otp/request', { phone }, { ip })).status, 200);
  assert.equal((await c('POST', '/otp/verify', { phone, code: t.codes[phone] }, { ip })).status, 200);
  return c;
}
async function staffLogin(t) {
  const s = t.jar();
  assert.equal((await s('POST', '/staff/login', { username: 'captain1', password: 'pass-1234' })).status, 200);
  return s;
}

test('OTP never reaches the client; wrong code is generic; 5 attempts max', async () => {
  const t = await setup();
  const c = t.jar();
  const r = await c('POST', '/otp/request', { phone: '+20 101 234 5678' });
  assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.body).includes(t.codes['01012345678']));
  for (let i = 0; i < 5; i++) assert.deepEqual((await c('POST', '/otp/verify', { phone: '01012345678', code: '000000' === t.codes['01012345678'] ? '111111' : '000000' })).body, { error: 'code' });
  assert.equal((await c('POST', '/otp/verify', { phone: '01012345678', code: t.codes['01012345678'] })).status, 400, 'locked after 5 attempts');
  t.close();
});
test('OTP expires after 5 minutes, resend cooldown 60s, per-phone and per-IP limits', async () => {
  const t = await setup(); const c = t.jar();
  await c('POST', '/otp/request', { phone: '01012345678' });
  assert.equal((await c('POST', '/otp/request', { phone: '01012345678' })).status, 429);
  t.tick(5 * 60e3 + 1);
  assert.equal((await c('POST', '/otp/verify', { phone: '01012345678', code: t.codes['01012345678'] })).status, 400);
  for (let i = 0; i < 4; i++) { t.tick(61e3); assert.equal((await c('POST', '/otp/request', { phone: '01012345678' }, { ip: '9.9.9.' + i })).status, 200); }
  t.tick(61e3); assert.equal((await c('POST', '/otp/request', { phone: '01012345678' }, { ip: '9.9.9.99' })).status, 429, 'per phone');
  let last; for (let i = 0; i < 16; i++) last = await c('POST', '/otp/request', { phone: '0111' + String(1000000 + i) }, { ip: '7.7.7.7' });
  assert.equal(last.status, 429, 'per IP');
  t.close();
});
test('same response for new and existing numbers (no enumeration)', async () => {
  const t = await setup(); await customerLogin(t, '01012345678');
  const c = t.jar(); t.tick(61e3);
  const a = await c('POST', '/otp/request', { phone: '01012345678' }, { ip: '2.2.2.2' });
  const b = await c('POST', '/otp/request', { phone: '01099999999' }, { ip: '2.2.2.2' });
  assert.deepEqual(a.body, b.body); t.close();
});
test('customer cannot stamp; unauthenticated cannot reach staff endpoints; CSRF header required', async () => {
  const t = await setup(); const c = await customerLogin(t);
  assert.equal((await c('POST', '/staff/stamp', { customerId: 1, requestId: 'abcdefgh1234' })).status, 401);
  const anon = t.jar();
  for (const p of ['/staff/me', '/staff/tables', '/staff/customer?phone=01012345678', '/staff/stream']) assert.equal((await anon('GET', p)).status, 401, p);
  assert.equal((await anon('GET', '/me')).status, 401);
  const s = await staffLogin(t);
  assert.equal((await s('POST', '/staff/stamp', { customerId: 1, requestId: 'abcdefgh1234' }, { csrf: false })).status, 403);
  t.close();
});
test('session cookie is HttpOnly + SameSite and long-lived', async () => {
  const t = await setup(); const c = t.jar();
  await c('POST', '/otp/request', { phone: '01012345678' });
  const r = await fetch('http://127.0.0.1:' + t.app.server.address().port + '/api/otp/verify', { method: 'POST', headers: { 'x-requested-with': 'sequoia', 'content-type': 'application/json' }, body: JSON.stringify({ phone: '01012345678', code: t.codes['01012345678'] }) });
  const ck = r.headers.getSetCookie()[0];
  assert.match(ck, /HttpOnly/); assert.match(ck, /SameSite=Lax/); assert.match(ck, /Max-Age=15552000/);
  t.close();
});
test('full cycle: 6 stamps with cooldown, idempotency, redeem once, card resets', async () => {
  const t = await setup(); const c = await customerLogin(t); let s = await staffLogin(t);
  const id = (await s('GET', '/staff/customer?phone=01012345678')).body.id;
  let r = await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-00000001' });
  assert.equal(r.body.card.count, 1);
  r = await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-00000001' });
  assert.equal(r.body.repeated, true); assert.equal(r.body.card.count, 1, 'idempotent');
  r = await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-00000002' });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'too_soon');
  assert.equal((await s('POST', '/staff/redeem', { customerId: id, requestId: 'red-00000001' })).body.error, 'not_full');
  for (let i = 2; i <= 6; i++) { t.tick(3 * H); if (i === 5) s = await staffLogin(t); r = await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-0000000' + i + 'x' }); assert.equal(r.status, 200); }
  assert.equal(r.body.card.complete, true);
  t.tick(3 * H);
  assert.equal((await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-full-0001' })).body.error, 'card_full');
  const me = await c('GET', '/me'); assert.equal(me.body.card.complete, true); assert.equal(me.body.card.slots.length, 6);
  const [a, b] = await Promise.all([s('POST', '/staff/redeem', { customerId: id, requestId: 'red-aaaaaaaa' }), s('POST', '/staff/redeem', { customerId: id, requestId: 'red-bbbbbbbb' })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], 'double redemption blocked');
  const after = (await c('GET', '/me')).body.card;
  assert.equal(after.count, 0); assert.equal(after.rewards, 1); assert.equal(after.cycle, 2);
  const ops = (await s('GET', '/staff/customer?id=' + id)).body;
  assert.equal(ops.phone, '010•••••678', 'masked unless exact phone search');
  assert.equal(ops.ops.items[0].action, 'redeem'); assert.equal(ops.ops.items.length, 7);
  const n = t.app.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action IN('stamp','redeem','login')").get().n;
  assert.equal(n, 10, '1 customer + 2 staff logins, 6 stamps, 1 redeem'); t.close();
});
test('table presence shows masked customers to staff', async () => {
  const t = await setup(); const c = await customerLogin(t); const s = await staffLogin(t);
  await c('GET', '/me?table=8'); // unsigned QR link: ignored
  assert.equal((await s('GET', '/staff/tables')).body.length, 0);
  await c('GET', '/me?table=7&s=' + t.app.tableSig(7));
  const rows = (await s('GET', '/staff/tables')).body;
  assert.equal(rows.length, 1); assert.equal(rows[0].table, 7); assert.equal(rows[0].phone, '010•••••678');
  t.close();
});

test('review contacts: staff only, per table, last 3 h, wa.me number', async () => {
  const t = await setup(); const c = await customerLogin(t); const s = await staffLogin(t);
  assert.equal((await t.jar()('GET', '/staff/review-contacts?table=7')).status, 401);
  assert.equal((await c('GET', '/staff/review-contacts?table=7')).status, 401);
  assert.equal((await s('GET', '/staff/review-contacts?table=abc')).status, 400);
  assert.deepEqual((await s('GET', '/staff/review-contacts?table=7')).body, []);
  await c('GET', '/me?table=7&s=' + t.app.tableSig(7));
  const rows = (await s('GET', '/staff/review-contacts?table=7')).body;
  assert.equal(rows.length, 1); assert.equal(rows[0].wa, '201012345678'); assert.equal(rows[0].phone, '010•••••678');
  assert.deepEqual((await s('GET', '/staff/review-contacts?table=8')).body, []);
  t.tick(3 * H + 1);
  assert.deepEqual((await s('GET', '/staff/review-contacts?table=7')).body, []);
  t.close();
});
test('customer logout ends the session', async () => {
  const t = await setup(); const c = await customerLogin(t);
  assert.equal((await c('POST', '/me/logout', {})).status, 200);
  assert.equal((await c('GET', '/me')).status, 401); t.close();
});
