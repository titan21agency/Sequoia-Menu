'use strict';
// Menu admin: roles, draft vs published, sold out, validation, staff accounts, lockout, role migration.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../server');
const MENU_JS = path.join(__dirname, '..', '..', '..', 'assets', 'menu.js');

async function setup(opts = {}) {
  let clock = 1_800_000_000_000;
  const app = createApp({ now: () => clock, sendOtp: async () => {}, secret: 'test', secureCookies: false, inbound: null, ...opts });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  app.setStaff('boss', 'owner', 'Boss', 'pass-1234');
  app.setStaff('mgr', 'manager', 'Mona', 'pass-1234');
  app.setStaff('cap', 'captain', 'Kareem', 'pass-1234');
  const jar = () => {
    const ck = {};
    const f = async (method, p, body, { csrf = true, headers = {} } = {}) => {
      const h = { cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; '), ...headers };
      if (csrf) h['x-requested-with'] = 'sequoia';
      if (body) h['content-type'] = 'application/json';
      const r = await fetch(base + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      return { status: r.status, etag: r.headers.get('etag'), body: await r.json().catch(() => null) };
    };
    return f;
  };
  const login = async (u, pw = 'pass-1234') => { const s = jar(); const r = await s('POST', '/staff/login', { username: u, password: pw }); assert.equal(r.status, 200, u + ' login'); return s; };
  return { app, jar, login, tick: ms => { clock += ms; }, close: () => { app.server.closeAllConnections(); app.server.close(); } };
}
const firstItem = m => m.sections[0].groups[0].items[0];

test('menu: public menu appears after import; ETag gives 304; hidden fields never public', async () => {
  const t = await setup();
  try {
    const g = t.jar();
    assert.equal((await g('GET', '/menu')).status, 404);
    const r = t.app.menu.importFrom(MENU_JS);
    assert.ok(r.sections >= 9 && r.items > 50);
    const m = await g('GET', '/menu');
    assert.equal(m.status, 200);
    assert.equal(m.body.sections.length, r.sections);
    assert.deepEqual(Object.keys(m.body).sort(), ['at', 'sections', 'soldOut', 'v']);
    assert.equal(typeof firstItem(m.body)[1], 'number');
    assert.equal((await g('GET', '/menu', null, { headers: { 'if-none-match': m.etag } })).status, 304);
    assert.equal(t.app.menu.importFrom(MENU_JS).skipped, true);   // second import does nothing
  } finally { t.close(); }
});

test('menu: roles — captain only sold out; manager edits; guests and customers get nothing', async () => {
  const t = await setup(); t.app.menu.importFrom(MENU_JS);
  try {
    const guest = t.jar(), cap = await t.login('cap'), mgr = await t.login('mgr');
    const item = (await cap('GET', '/staff/menu')).body.sections[0].groups[0].items[0];
    assert.equal((await guest('GET', '/staff/menu')).status, 401);
    assert.equal((await guest('POST', '/staff/menu/soldout', { id: item.id, soldOut: true })).status, 401);
    assert.equal((await cap('POST', '/staff/menu/soldout', { id: item.id, soldOut: true })).status, 200);
    for (const [p, b] of [['/staff/menu/item', { id: item.id, groupId: 1, nameEn: 'X', price: 1 }], ['/staff/menu/publish', {}], ['/staff/menu/bulk-price', { percent: 10 }], ['/staff/menu/discard', {}], ['/staff/menu/item/delete', { id: item.id }]])
      assert.equal((await cap('POST', p, b)).status, 403, 'captain ' + p);
    assert.equal((await cap('GET', '/staff/menu/log')).status, 403);
    assert.equal((await cap('GET', '/staff/users')).status, 403);
    assert.equal((await mgr('GET', '/staff/users')).status, 403);
    assert.equal((await mgr('GET', '/staff/menu/log')).status, 200);
    assert.equal((await cap('POST', '/staff/menu/soldout', { id: item.id, soldOut: true }, { csrf: false })).status, 403);   // CSRF header
  } finally { t.close(); }
});

test('menu: sold out is live at once; edits wait in the draft until Publish', async () => {
  const t = await setup(); t.app.menu.importFrom(MENU_JS);
  try {
    const g = t.jar(), cap = await t.login('cap'), mgr = await t.login('mgr');
    const m0 = (await g('GET', '/menu')).body, it = firstItem(m0);
    await cap('POST', '/staff/menu/soldout', { id: it[3], soldOut: true });
    const m1 = await g('GET', '/menu');
    assert.deepEqual(m1.body.soldOut, [it[3]]);
    assert.notEqual(m1.body.v, m0.v);
    const d = (await mgr('GET', '/staff/menu')).body; const gid = d.sections[0].groups[0].id;
    const e = await mgr('POST', '/staff/menu/item', { id: it[3], groupId: gid, nameEn: it[0], nameAr: it[2], price: it[1] + 5 });
    assert.equal(e.status, 200); assert.equal(e.body.changes, 1);
    assert.equal(firstItem((await g('GET', '/menu')).body)[1], it[1]);   // guests still see the old price
    assert.equal(firstItem((await mgr('GET', '/staff/menu/preview')).body)[1], it[1] + 5);   // preview shows the draft
    assert.equal((await mgr('POST', '/staff/menu/publish', {})).status, 200);
    const m2 = (await g('GET', '/menu')).body;
    assert.equal(firstItem(m2)[1], it[1] + 5);
    assert.deepEqual(m2.soldOut, [it[3]]);   // sold out survives a publish
    assert.equal((await mgr('POST', '/staff/menu/publish', {})).status, 409);   // nothing to publish
  } finally { t.close(); }
});

test('menu: discard returns to the published menu and keeps hidden items', async () => {
  const t = await setup(); t.app.menu.importFrom(MENU_JS);
  try {
    const g = t.jar(), mgr = await t.login('mgr');
    const d = (await mgr('GET', '/staff/menu')).body; const gid = d.sections[1].groups[0].id;
    const hid = (await mgr('POST', '/staff/menu/item', { groupId: gid, nameEn: 'Secret latte', price: 99, hidden: true })).body.id;
    await mgr('POST', '/staff/menu/publish', {});   // hidden item: in the draft, not shown to guests
    assert.ok(!JSON.stringify((await g('GET', '/menu')).body).includes('Secret latte'));
    const it = d.sections[0].groups[0].items[0];
    await mgr('POST', '/staff/menu/item', { id: it.id, groupId: d.sections[0].groups[0].id, nameEn: 'Typo', price: 1 });
    await mgr('POST', '/staff/menu/item/delete', { id: d.sections[0].groups[0].items[1].id });
    assert.equal((await mgr('POST', '/staff/menu/discard', {})).status, 200);
    const after = (await mgr('GET', '/staff/menu')).body;
    assert.equal(after.changes.length, 0);
    assert.equal(after.sections[0].groups[0].items[0].name, it.name);
    assert.equal(after.sections[0].groups[0].items.length, d.sections[0].groups[0].items.length);
    assert.ok(after.sections[1].groups[0].items.some(i => i.id === hid && i.hidden));
  } finally { t.close(); }
});

test('menu: input checks — prices, names, ids, reorder sets, bulk percent', async () => {
  const t = await setup(); t.app.menu.importFrom(MENU_JS);
  try {
    const mgr = await t.login('mgr');
    const d = (await mgr('GET', '/staff/menu')).body; const sec = d.sections[0], grp = sec.groups[0];
    const bad = async (p, b, field) => { const r = await mgr('POST', p, b); assert.equal(r.status, 400, p + ' ' + JSON.stringify(b)); assert.equal(r.body.field, field); };
    for (const price of [-1, 1.5, 'abc', 1e6, null]) await bad('/staff/menu/item', { groupId: grp.id, nameEn: 'Tea', price }, 'price');
    await bad('/staff/menu/item', { groupId: grp.id, nameEn: '   ', price: 5 }, 'nameEn');
    await bad('/staff/menu/item', { groupId: grp.id, nameEn: 'x'.repeat(81), price: 5 }, 'nameEn');
    await bad('/staff/menu/item', { groupId: 99999, nameEn: 'Tea', price: 5 }, 'groupId');
    await bad('/staff/menu/item', { id: 99999, groupId: grp.id, nameEn: 'Tea', price: 5 }, 'id');
    await bad('/staff/menu/section', { titleEn: '' }, 'titleEn');
    await bad('/staff/menu/reorder', { kind: 'item', parentId: grp.id, ids: grp.items.slice(1).map(i => i.id) }, 'ids');   // one missing
    await bad('/staff/menu/reorder', { kind: 'item', parentId: grp.id, ids: [...grp.items.map(i => i.id), d.sections[1].groups[0].items[0].id] }, 'ids');   // foreign id
    await bad('/staff/menu/reorder', { kind: 'table', ids: [] }, 'ids');
    for (const percent of [0, -60, 150, 'x']) await bad('/staff/menu/bulk-price', { percent }, 'percent');
    // text is stored as text (the pages escape it); control characters are removed
    const r = await mgr('POST', '/staff/menu/item', { groupId: grp.id, nameEn: '<img src=x onerror=alert(1)>\u0007Tea', price: 5 });
    const saved = (await mgr('GET', '/staff/menu')).body.sections[0].groups[0].items.find(i => i.id === r.body.id);
    assert.equal(saved.name, '<img src=x onerror=alert(1)> Tea');
  } finally { t.close(); }
});

test('menu: reorder, bulk price, sections/groups, change log', async () => {
  const t = await setup(); t.app.menu.importFrom(MENU_JS);
  try {
    const mgr = await t.login('mgr');
    let d = (await mgr('GET', '/staff/menu')).body; const grp = d.sections[0].groups[0];
    const ids = grp.items.map(i => i.id).reverse();
    assert.equal((await mgr('POST', '/staff/menu/reorder', { kind: 'item', parentId: grp.id, ids })).status, 200);
    d = (await mgr('GET', '/staff/menu')).body;
    assert.deepEqual(d.sections[0].groups[0].items.map(i => i.id), ids);
    const before = d.sections[0].groups[0].items.map(i => i.price);
    const b = await mgr('POST', '/staff/menu/bulk-price', { percent: 10, sectionId: d.sections[0].id, roundTo: 5 });
    assert.equal(b.body.items, before.length);
    d = (await mgr('GET', '/staff/menu')).body;
    assert.deepEqual(d.sections[0].groups[0].items.map(i => i.price), before.map(p => Math.round(p * 1.1 / 5) * 5));
    assert.equal(d.sections[1].groups[0].items[0].price, (await mgr('GET', '/staff/menu/preview')).body.sections[1].groups[0].items[0][1]);   // other sections untouched
    assert.equal((await mgr('POST', '/staff/menu/section/delete', { id: d.sections[0].id })).status, 409);   // not empty
    const s = await mgr('POST', '/staff/menu/section', { titleEn: 'Sandwiches', titleAr: 'ساندويتشات' });
    const g2 = await mgr('POST', '/staff/menu/group', { sectionId: s.body.id, labelEn: 'Cold' });
    assert.equal(g2.status, 200);
    d = (await mgr('GET', '/staff/menu')).body;
    const newSec = d.sections.find(x => x.id === s.body.id);
    assert.equal(newSec.groups.length, 2);
    assert.equal((await mgr('POST', '/staff/menu/group/delete', { id: g2.body.id })).status, 200);
    assert.equal((await mgr('POST', '/staff/menu/group/delete', { id: newSec.groups[0].id })).status, 409);   // last group
    assert.equal((await mgr('POST', '/staff/menu/section/delete', { id: s.body.id })).status, 200);
    const log = (await mgr('GET', '/staff/menu/log')).body.items.map(x => x.action);
    for (const a of ['menu_reorder', 'menu_bulk_price', 'menu_section_add', 'menu_group_add', 'menu_group_delete', 'menu_section_delete']) assert.ok(log.includes(a), a);
    assert.equal((await mgr('GET', '/staff/menu/log')).body.items[0].staff, 'Mona');
  } finally { t.close(); }
});

test('staff: 5 wrong passwords lock that account for 15 minutes', async () => {
  const t = await setup();
  try {
    const s = t.jar();
    for (let i = 0; i < 4; i++) assert.equal((await s('POST', '/staff/login', { username: 'mgr', password: 'wrong-' + i })).status, 401);
    const locked = await s('POST', '/staff/login', { username: 'mgr', password: 'wrong-5' });
    assert.equal(locked.status, 429); assert.equal(locked.body.error, 'locked');
    assert.equal((await s('POST', '/staff/login', { username: 'mgr', password: 'pass-1234' })).status, 429);   // right password, still locked
    assert.equal((await t.jar()('POST', '/staff/login', { username: 'cap', password: 'pass-1234' })).status, 200);   // other accounts unaffected
    t.tick(15 * 60e3 + 1000);
    assert.equal((await s('POST', '/staff/login', { username: 'mgr', password: 'pass-1234' })).status, 200);
  } finally { t.close(); }
});

test('staff accounts: owner only; never lock yourself out; last owner kept; changes end sessions', async () => {
  const t = await setup();
  try {
    const boss = await t.login('boss'), mgr = await t.login('mgr'), cap = await t.login('cap');
    assert.equal((await mgr('POST', '/staff/users', { username: 'new1', name: 'N', role: 'captain' })).status, 403);
    const add = await boss('POST', '/staff/users', { username: 'sara.c', name: 'Sara', role: 'captain' });
    assert.equal(add.status, 200); assert.ok(add.body.password.length >= 8);
    assert.equal((await boss('POST', '/staff/users', { username: 'sara.c', name: 'Sara', role: 'captain' })).status, 409);
    for (const b of [{ username: 'x', name: 'N', role: 'captain' }, { username: 'ok_name', name: '', role: 'captain' }, { username: 'ok_name', name: 'N', role: 'admin' }])
      assert.equal((await boss('POST', '/staff/users', b)).status, 400);
    const list = (await boss('GET', '/staff/users')).body;
    assert.ok(!JSON.stringify(list).includes('pass'));   // no password hashes
    const me = list.find(u => u.username === 'boss'), capId = list.find(u => u.username === 'cap').id;
    assert.equal((await boss('POST', '/staff/users/update', { id: me.id, role: 'manager' })).status, 409);   // self
    assert.equal((await boss('POST', '/staff/users/update', { id: me.id, active: false })).status, 409);
    assert.equal((await boss('POST', '/staff/users/update', { id: capId, active: false })).status, 200);
    assert.equal((await cap('GET', '/staff/menu')).status, 401);   // deactivated: session gone
    const r = await boss('POST', '/staff/users/reset', { id: list.find(u => u.username === 'mgr').id });
    assert.equal(r.status, 200);
    assert.equal((await mgr('GET', '/staff/me')).status, 401);   // reset: signed out
    assert.equal((await t.jar()('POST', '/staff/login', { username: 'mgr', password: r.body.password })).status, 200);
    // second owner, then the first may step down; the last one may not
    const o2 = (await boss('POST', '/staff/users', { username: 'owner2', name: 'O2', role: 'owner' })).body;
    const boss2 = await t.login('owner2', o2.password);
    assert.equal((await boss2('POST', '/staff/users/update', { id: me.id, role: 'manager' })).status, 200);
    const o2id = (await boss2('GET', '/staff/users')).body.find(u => u.username === 'owner2').id;
    assert.equal((await boss2('POST', '/staff/users/update', { id: o2id, role: 'manager' })).status, 409);   // self + last owner
  } finally { t.close(); }
});

test('migration: an old database (captain/admin) becomes owner/captain, keeps stamps, and saves a copy first', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-mig-')), file = path.join(dir, 'loyalty.db');
  try {
    const old = new DatabaseSync(file);
    old.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE customers(id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, last_visit_at INTEGER, cycle INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE staff(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('captain','admin')), pass TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE stamps(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), staff_id INTEGER NOT NULL REFERENCES staff(id), table_number INTEGER, created_at INTEGER NOT NULL, cycle_id INTEGER NOT NULL, request_id TEXT UNIQUE);
      INSERT INTO staff VALUES(1,'faris','Faris','admin','x:y',1),(2,'kareem','Kareem','captain','x:y',1);
      INSERT INTO customers VALUES(1,'01000000000',1,1,1);
      INSERT INTO stamps VALUES(1,1,2,7,1,1,'r1');`);
    old.close();
    const app = createApp({ dbFile: file, secret: 'test', sendOtp: async () => {}, inbound: null });
    assert.deepEqual(app.db.prepare('SELECT username, role FROM staff ORDER BY id').all().map(r => ({ ...r })), [{ username: 'faris', role: 'owner' }, { username: 'kareem', role: 'captain' }]);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM stamps WHERE staff_id=2').get().n, 1);
    assert.equal(app.db.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.ok(fs.existsSync(file + '.before-roles.db'));
    const backup = new DatabaseSync(file + '.before-roles.db', { readOnly: true });
    assert.equal(backup.prepare("SELECT role FROM staff WHERE id=1").get().role, 'admin');   // the copy is the old state
    backup.close(); app.db.close();
    // opening again does nothing
    const again = createApp({ dbFile: file, secret: 'test', sendOtp: async () => {}, inbound: null });
    assert.equal(again.db.prepare("SELECT role FROM staff WHERE id=1").get().role, 'owner');
    again.db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
