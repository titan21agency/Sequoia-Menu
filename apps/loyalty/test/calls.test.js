'use strict';
// Table calls (replaces ntfy.sh): menu posts with a signed table link, only staff can read the live stream.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

async function setup(opts = {}) {
  let clock = 1_800_000_000_000;
  const app = createApp({ now: () => clock, sendOtp: async () => {}, secret: 'test', secureCookies: false, inbound: null, ...opts });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  app.setStaff('cap', 'captain', 'Kareem', 'pass-1234');
  const jar = () => {
    const ck = {};
    const f = async (method, path, body, { csrf = true } = {}) => {
      const h = { cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ') };
      if (csrf) h['x-requested-with'] = 'sequoia';
      if (body) h['content-type'] = 'application/json';
      const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    f.cookie = () => Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ');
    return f;
  };
  // read SSE "msg" events until n arrived
  async function readStream(cookie, n, trigger) {
    const ac = new AbortController();
    const r = await fetch(base + '/staff/calls/stream', { headers: { cookie }, signal: ac.signal });
    if (r.status !== 200) { ac.abort(); return { status: r.status, msgs: [] }; }
    const dec = new TextDecoder(); let buf = ''; const msgs = [];
    const reader = r.body.getReader();
    if (trigger) setTimeout(trigger, 50);
    while (msgs.length < n) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: msg$/m.test(block)) msgs.push(JSON.parse(block.match(/^data: (.*)$/m)[1]));
      }
    }
    ac.abort();
    return { status: 200, msgs };
  }
  return { app, jar, readStream, tick: ms => { clock += ms; }, close: () => { app.server.closeAllConnections(); app.server.close(); } };
}

test('calls: signed table link required; unsigned/forged rejected', async () => {
  const t = await setup();
  try {
    const m = t.jar();
    assert.equal((await m('POST', '/calls', { type: 'call', table: '7' })).status, 403);
    assert.equal((await m('POST', '/calls', { type: 'call', table: '7', s: t.app.tableSig(8) })).status, 403);
    assert.equal((await m('POST', '/calls', { type: 'call', table: '7', s: t.app.tableSig(7) }, { csrf: false })).status, 403);
    assert.equal((await m('POST', '/calls', { type: 'took', table: '7', s: t.app.tableSig(7) })).status, 400);
    assert.equal((await m('POST', '/calls', { type: 'call', table: '7', s: t.app.tableSig(7), rid: 'abc123' })).status, 200);
  } finally { t.close(); }
});

test('calls: legacy unsigned links only with TABLE_QR_LEGACY', async () => {
  const t = await setup({ legacyTables: true });
  try { assert.equal((await t.jar()('POST', '/calls', { type: 'bill', table: '3', pay: 'cash' })).status, 200); } finally { t.close(); }
});

test('calls: stream needs staff login, replays history, then goes live; took/undo are staff-only', async () => {
  const t = await setup();
  try {
    const m = t.jar(); const s7 = t.app.tableSig(7);
    await m('POST', '/calls', { type: 'req', table: '7', s: s7, item: 'مياه', rid: 'r1abcd' });
    assert.equal((await t.readStream('', 1)).status, 401);
    assert.equal((await m('POST', '/staff/calls', { type: 'took', table: '7', rids: ['r1abcd'] })).status, 401);

    const s = t.jar();
    assert.equal((await s('POST', '/staff/login', { username: 'cap', password: 'pass-1234' })).status, 200);
    const got = await t.readStream(s.cookie(), 3, async () => {
      await m('POST', '/calls', { type: 'call', table: '7', s: s7, rid: 'r2abcd' });
      await s('POST', '/staff/calls', { type: 'took', table: '7', rids: ['r1abcd', 'r2abcd'] });
    });
    assert.deepEqual(got.msgs.map(x => x.body.type), ['req', 'call', 'took']);
    assert.equal(got.msgs[0].body.item, 'مياه');
    assert.equal(got.msgs[2].body.by, 'Kareem');
    assert.equal(got.msgs[0].time, 1_800_000_000_000);
  } finally { t.close(); }
});

test('calls: history older than 12 h is not replayed; per-table rate limit', async () => {
  const t = await setup();
  try {
    const m = t.jar(); const s5 = t.app.tableSig(5);
    await m('POST', '/calls', { type: 'call', table: '5', s: s5 });
    t.tick(13 * 3600e3);
    await m('POST', '/calls', { type: 'bill', table: '5', s: s5, pay: 'card' });
    const s = t.jar(); await s('POST', '/staff/login', { username: 'cap', password: 'pass-1234' });
    const got = await t.readStream(s.cookie(), 1);
    assert.deepEqual(got.msgs.map(x => x.body.type), ['bill']);
    let last; for (let i = 0; i < 25; i++) last = await m('POST', '/calls', { type: 'call', table: '5', s: s5 });
    assert.equal(last.status, 429);
  } finally { t.close(); }
});

test('report: staff-only proxy to the sheet; token added server-side', async () => {
  const sent = [];
  const t = await setup({ report: { url: 'https://sheet.example/exec', token: 'tok-123' },
    fetchImpl: async (u, init) => { sent.push({ u, body: JSON.parse(init.body) }); return { ok: true }; } });
  try {
    const anon = t.jar();
    assert.equal((await anon('POST', '/staff/report', { rows: [{ rid: 'a' }] })).status, 401);
    const s = t.jar(); await s('POST', '/staff/login', { username: 'cap', password: 'pass-1234' });
    assert.equal((await s('POST', '/staff/report', { rows: [{ rid: 'a', table: '7' }] })).status, 200);
    assert.deepEqual(sent, [{ u: 'https://sheet.example/exec', body: { token: 'tok-123', by: 'cap', rows: [{ rid: 'a', table: '7' }] } }]);
  } finally { t.close(); }
});
