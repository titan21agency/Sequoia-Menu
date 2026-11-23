'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');

// a tiny valid JPEG header + padding is enough for the server's checks
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString('base64');

async function setup() {
  const codes = {};
  const photoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-mem-'));
  const app = createApp({ sendOtp: async (p, c) => { codes[p] = c; }, secret: 'test', secureCookies: false, photoDir });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const jar = () => {
    const ck = {};
    return async (method, p, body) => {
      const h = { cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; '), 'x-requested-with': 'sequoia' };
      if (body) h['content-type'] = 'application/json';
      const r = await fetch(base + '/api' + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      const type = r.headers.get('content-type') || '';
      return { status: r.status, body: type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
    };
  };
  app.setStaff('owner', 'admin', 'Owner', 'pass-1234');
  app.setStaff('cap', 'captain', 'Cap', 'pass-1234');
  const login = async (phone) => {
    const c = jar();
    await c('POST', '/otp/request', { phone });
    assert.equal((await c('POST', '/otp/verify', { phone, code: codes[phone] })).status, 200);
    return c;
  };
  return { app, jar, login, photoDir, close: () => { app.server.closeAllConnections(); app.server.close(); fs.rmSync(photoDir, { recursive: true, force: true }); } };
}

test('memory needs a login, saves the card and the picks, and lists only your own', async () => {
  const t = await setup();
  assert.equal((await t.jar()('POST', '/me/memories', { drink: 'x' })).status, 401);
  const a = await t.login('01012345678'), b = await t.login('01112345678');
  const r = await a('POST', '/me/memories', { with_whom: 'سارة', drink: 'سبانش لاتيه', sky: 'sunset', quote: 'النيل حلو', rec_book: 'ثلاثية غرناطة', story: 'أول\nخروجة' });
  assert.equal(r.status, 200);
  assert.equal(r.body.item.sky, 'sunset'); assert.equal(r.body.item.story, 'أول\nخروجة'); assert.equal(r.body.item.photo, false);
  assert.equal((await a('GET', '/me/memories')).body.items.length, 1);
  assert.equal((await b('GET', '/me/memories')).body.items.length, 0);
  assert.equal((await a('POST', '/me/memories', { sky: 'purple-ish' })).status, 400, 'unknown sky alone is empty');
  t.close();
});

test('photo is stored only with consent and only as a real JPEG; owner sees it, captain does not', async () => {
  const t = await setup();
  const a = await t.login('01012345678');
  assert.equal((await a('POST', '/me/memories', { drink: 'شاي', photo: JPEG })).body.error, 'consent');
  assert.equal((await a('POST', '/me/memories', { drink: 'شاي', consent: true, photo: 'data:image/png;base64,AAAA' })).body.error, 'photo');
  const ok = await a('POST', '/me/memories', { drink: 'شاي', consent: true, photo: JPEG });
  assert.equal(ok.status, 200); assert.equal(ok.body.item.photo, true);
  assert.equal(fs.readdirSync(t.photoDir).length, 1);
  const mine = await a('GET', '/me/memories/' + ok.body.item.id + '/photo');
  assert.equal(mine.status, 200); assert.equal(mine.body[0], 0xff);

  const other = await t.login('01112345678');
  assert.equal((await other('GET', '/me/memories/' + ok.body.item.id + '/photo')).status, 404);

  const cap = t.jar(); await cap('POST', '/staff/login', { username: 'cap', password: 'pass-1234' });
  assert.equal((await cap('GET', '/staff/memories')).status, 403);
  const owner = t.jar(); await owner('POST', '/staff/login', { username: 'owner', password: 'pass-1234' });
  const list = await owner('GET', '/staff/memories');
  assert.equal(list.status, 200); assert.equal(list.body.items[0].phone, '01012345678');
  assert.equal((await owner('GET', '/staff/memories/' + ok.body.item.id + '/photo')).status, 200);

  assert.equal((await a('DELETE', '/me/memories/' + ok.body.item.id)).status, 200);
  assert.equal(fs.readdirSync(t.photoDir).length, 0, 'deleting the memory deletes its photo');
  t.close();
});
