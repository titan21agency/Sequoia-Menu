'use strict';
// Option B: customer sends "SEQ-123456" to the café on WhatsApp; Message Pro posts it to our signed webhook.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createApp } = require('../server');

const SECRET = 'hook-secret';
async function setup() {
  let clock = 1_800_000_000_000;
  const app = createApp({ now: () => clock, sendOtp: async () => {}, secret: 'test', secureCookies: false,
    inbound: { secret: SECRET, waNumber: '201000000000', inboxId: 147 } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  const browser = () => {
    const ck = {};
    return async (method, path, body) => {
      const h = { 'x-requested-with': 'sequoia', cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ') };
      if (body) h['content-type'] = 'application/json';
      const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      return { status: r.status, body: await r.json().catch(() => null) };
    };
  };
  const hook = async (payload, { secret = SECRET, ts = Math.floor(clock / 1000), tamper = false } = {}) => {
    const raw = JSON.stringify(payload);
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest('hex');
    const r = await fetch(base + '/hooks/messagepro', { method: 'POST', body: tamper ? raw.replace('SEQ', 'SEX') : raw,
      headers: { 'content-type': 'application/json', 'x-chatwoot-signature': sig, 'x-chatwoot-timestamp': String(ts) } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const msg = (content, phone = '+201012345678', extra = {}) => ({ event: 'message_created', message_type: 'incoming', private: false,
    content, inbox: { id: 147 }, sender: { phone_number: phone }, ...extra });
  return { app, browser, hook, msg, tick: ms => { clock += ms; }, close: () => { app.server.closeAllConnections(); app.server.close(); } };
}

test('inbound: start -> customer sends code from WhatsApp -> browser gets a card session', async () => {
  const t = await setup();
  try {
    const b = t.browser();
    assert.deepEqual((await b('GET', '/login/options')).body, { otp: true, whatsapp: true });
    const s = await b('POST', '/otp/inbound/start', {});
    assert.equal(s.status, 200);
    assert.match(s.body.code, /^SEQ-\d{6}$/);
    assert.equal(s.body.wa, 'https://wa.me/201000000000?text=' + s.body.code);
    assert.deepEqual((await b('GET', '/otp/inbound/status')).body, { pending: true });
    assert.equal((await b('GET', '/me')).status, 401);

    assert.equal((await t.hook(t.msg('عايز أدخل ' + s.body.code))).status, 200);
    const done = await b('GET', '/otp/inbound/status');
    assert.equal(done.status, 200); assert.equal(done.body.ok, true);
    assert.equal((await b('GET', '/me')).status, 200);
    assert.equal((await b('GET', '/otp/inbound/status')).status, 410); // one-time
    const row = t.app.db.prepare("SELECT phone FROM customers").get();
    assert.equal(row.phone, '01012345678');
  } finally { t.close(); }
});

test('inbound: bad/old/missing signature is rejected and binds nothing', async () => {
  const t = await setup();
  try {
    const b = t.browser(); const s = await b('POST', '/otp/inbound/start', {});
    assert.equal((await t.hook(t.msg(s.body.code), { secret: 'wrong' })).status, 401);
    assert.equal((await t.hook(t.msg(s.body.code), { ts: Math.floor(1_800_000_000_000 / 1000) - 600 })).status, 401);
    assert.equal((await t.hook(t.msg(s.body.code), { tamper: true })).status, 401);
    const r = await fetch(t.app.server.address && ('http://127.0.0.1:' + t.app.server.address().port + '/api/hooks/messagepro'), { method: 'POST', body: '{}' });
    assert.equal(r.status, 401);
    assert.deepEqual((await b('GET', '/otp/inbound/status')).body, { pending: true });
  } finally { t.close(); }
});

test('inbound: ignores outgoing, other inboxes, wrong codes; code expires', async () => {
  const t = await setup();
  try {
    const b = t.browser(); const s = await b('POST', '/otp/inbound/start', {});
    await t.hook(t.msg(s.body.code, undefined, { message_type: 'outgoing' }));
    await t.hook(t.msg(s.body.code, undefined, { inbox: { id: 152 } }));
    await t.hook(t.msg('SEQ-000000' === s.body.code ? 'SEQ-000001' : 'SEQ-000000'));
    assert.deepEqual((await b('GET', '/otp/inbound/status')).body, { pending: true });
    t.tick(6 * 60e3);
    await t.hook(t.msg(s.body.code));
    assert.equal((await b('GET', '/otp/inbound/status')).status, 410);
  } finally { t.close(); }
});

test('inbound: another browser cannot claim the session (needs the pending cookie)', async () => {
  const t = await setup();
  try {
    const victim = t.browser(); const s = await victim('POST', '/otp/inbound/start', {});
    await t.hook(t.msg(s.body.code));
    const other = t.browser();
    assert.equal((await other('GET', '/otp/inbound/status')).status, 410);
    assert.equal((await victim('GET', '/otp/inbound/status')).status, 200);
  } finally { t.close(); }
});

test('inbound: disabled when not configured', async () => {
  const app = createApp({ sendOtp: async () => {}, secret: 'x', secureCookies: false, inbound: null });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  try {
    assert.deepEqual(await (await fetch(base + '/login/options')).json(), { otp: true, whatsapp: false });
    assert.equal((await fetch(base + '/hooks/messagepro', { method: 'POST', body: '{}' })).status, 404);
  } finally { app.server.closeAllConnections(); app.server.close(); }
});
