'use strict';
// One-time Message Pro setup page: link code checked, token verified with the platform, saved, provider switched live.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const crypto = require('node:crypto');
const { createApp } = require('../server');

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
async function setup({ platformOk = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-setup-'));
  const settingsFile = path.join(dir, 'settings.json');
  const code = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(settingsFile, JSON.stringify({ setup: { hash: sha(code), exp: Date.now() + 3600e3 } }));
  const calls = [];
  const app = createApp({ settingsFile, secret: 'x', secureCookies: false, inbound: undefined,
    fetchImpl: async (u, init) => { calls.push({ u, token: init.headers.api_access_token }); return { ok: platformOk, status: platformOk ? 200 : 401 }; } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  const post = body => fetch(base + '/setup/messagepro', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sequoia' }, body: JSON.stringify(body) })
    .then(async r => ({ status: r.status, body: await r.json() }));
  return { app, code, settingsFile, calls, post, base, close: () => { app.server.closeAllConnections(); app.server.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const keep = {};
test.before(() => { for (const k of ['WHATSAPP_PROVIDER', 'MESSAGEPRO_TOKEN', 'MESSAGEPRO_WEBHOOK_SECRET', 'SEQUOIA_WA_NUMBER', 'MESSAGEPRO_ACCOUNT_ID', 'MESSAGEPRO_INBOX_ID']) keep[k] = process.env[k]; process.env.SEQUOIA_WA_NUMBER = '201000000000'; });
test.after(() => { for (const [k, v] of Object.entries(keep)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

test('setup: wrong or missing code is refused and saves nothing', async () => {
  const t = await setup();
  try {
    assert.equal((await t.post({ code: 'x'.repeat(32), token: 'mpa_abcdefghijkl' })).status, 403);
    assert.equal((await t.post({ token: 'mpa_abcdefghijkl' })).status, 403);
    assert.equal(t.calls.length, 0);
    assert.equal(JSON.parse(fs.readFileSync(t.settingsFile)).env, undefined);
  } finally { t.close(); }
});

test('setup: token rejected by Message Pro is not saved; link still usable', async () => {
  const t = await setup({ platformOk: false });
  try {
    const r = await t.post({ code: t.code, token: 'mpa_wrongtoken123' });
    assert.equal(r.status, 400); assert.equal(r.body.error, 'token-rejected');
    const st = JSON.parse(fs.readFileSync(t.settingsFile));
    assert.equal(st.env, undefined); assert.ok(st.setup);
  } finally { t.close(); }
});

test('setup: good token + secret saved, provider switched live, link single-use, nothing echoed', async () => {
  const t = await setup();
  try {
    const r = await t.post({ code: t.code, token: 'mpa_goodtoken12345', webhookSecret: 'whsec_abcdefgh' });
    assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.whatsappMessage, true);
    assert.ok(!JSON.stringify(r.body).includes('goodtoken'));
    assert.equal(t.calls[0].token, 'mpa_goodtoken12345');
    const st = JSON.parse(fs.readFileSync(t.settingsFile));
    assert.deepEqual(st.env, { WHATSAPP_PROVIDER: 'messagepro', MESSAGEPRO_TOKEN: 'mpa_goodtoken12345', MESSAGEPRO_WEBHOOK_SECRET: 'whsec_abcdefgh', MESSAGEPRO_ACCOUNT_ID: '129', MESSAGEPRO_INBOX_ID: '147' });
    assert.equal(st.setup, undefined);
    if (process.platform !== 'win32') assert.equal(fs.statSync(t.settingsFile).mode & 0o777, 0o600);
    assert.deepEqual(await (await fetch(t.base + '/login/options')).json(), { otp: true, whatsapp: true });
    assert.equal((await t.post({ code: t.code, token: 'mpa_goodtoken12345' })).status, 403); // single use
  } finally { t.close(); }
});
