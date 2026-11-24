'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

async function setup() {
  let clock = 1_800_000_000_000;
  const app = createApp({ now: () => clock, sendOtp: async () => {}, secret: 'test', secureCookies: false });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const jar = () => {
    const ck = {};
    const f = async (method, p, body) => {
      const h = { cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; '), 'x-requested-with': 'sequoia' };
      if (body) h['content-type'] = 'application/json';
      const r = await fetch(base + '/api' + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    // read the captain stream for a moment and return the replayed message bodies
    f.replay = async () => {
      const ac = new AbortController();
      const r = await fetch(base + '/api/staff/calls/stream', { headers: { cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ') }, signal: ac.signal });
      const rd = r.body.getReader(); let txt = '';
      const stop = setTimeout(() => ac.abort(), 300);
      try { for (;;) { const { value, done } = await rd.read(); if (done) break; txt += Buffer.from(value).toString(); } } catch {}
      clearTimeout(stop);
      return txt.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)).body);
    };
    return f;
  };
  app.setStaff('cap', 'captain', 'Cap', 'pass-1234');
  return { app, jar, tick: ms => { clock += ms; }, close: () => { app.server.closeAllConnections(); app.server.close(); } };
}

test('day close needs a staff login and hides everything before it from the captain replay', async () => {
  const t = await setup();
  assert.equal((await t.jar()('POST', '/staff/day/close', {})).status, 401);
  const s = t.jar();
  assert.equal((await s('POST', '/staff/login', { username: 'cap', password: 'pass-1234' })).status, 200);
  assert.equal((await s('POST', '/staff/calls', { type: 'took', table: 4, rids: ['abc12345'] })).status, 200);
  t.tick(1000);
  assert.deepEqual((await s.replay()).map(b => b.type), ['took']);

  const c = await s('POST', '/staff/day/close', {});
  assert.equal(c.status, 200);
  assert.deepEqual(await s.replay(), [], 'nothing from before the close is replayed');

  t.tick(1000);
  await s('POST', '/staff/calls', { type: 'took', table: 5, rids: ['def12345'] });
  assert.deepEqual((await s.replay()).map(b => b.table), ['5'], 'new activity after the close still shows');
  t.close();
});
