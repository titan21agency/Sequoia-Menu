// Sequoia menu: sections, groups and items in SQLite, edited by staff, published as one snapshot.
// - The tables are the DRAFT. Guests only ever see the latest PUBLISHED snapshot (menu_published).
// - "Sold out" is the exception: it is live at once, applied on top of the published snapshot.
// - Roles: captain = sold out only; manager = everything on the menu; owner = manager + staff accounts (server.js).
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS menu_sections(id INTEGER PRIMARY KEY, title_en TEXT NOT NULL, title_ar TEXT NOT NULL DEFAULT '', pos INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS menu_groups(id INTEGER PRIMARY KEY, section_id INTEGER NOT NULL REFERENCES menu_sections(id) ON DELETE CASCADE, label_en TEXT NOT NULL DEFAULT '', label_ar TEXT NOT NULL DEFAULT '', pos INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS menu_items(id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES menu_groups(id) ON DELETE CASCADE, name_en TEXT NOT NULL, name_ar TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL, pos INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, sold_out INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS menu_groups_section ON menu_groups(section_id, pos);
CREATE INDEX IF NOT EXISTS menu_items_group ON menu_items(group_id, pos);
CREATE TABLE IF NOT EXISTS menu_published(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, staff_id INTEGER, json TEXT NOT NULL, full TEXT NOT NULL);  -- json: what guests see; full: draft incl. hidden, for Discard
CREATE TABLE IF NOT EXISTS menu_state(k TEXT PRIMARY KEY, v INTEGER NOT NULL);
`;
const RANK = { captain: 1, manager: 2, owner: 3, admin: 3 };   // 'admin' = old name of owner
const MAX = { name: 80, title: 40, label: 40 };

function createMenu({ db, Q, send, readBody, audit, now }) {
  db.exec(SCHEMA);
  const state = k => (Q('SELECT v FROM menu_state WHERE k=?').get(k) || { v: 0 }).v;
  const bump = k => Q('INSERT INTO menu_state(k,v) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET v=v+1').run(k);
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; } };

  // ---------- input checks (all text trimmed, control characters removed) ----------
  class Bad extends Error { constructor(field) { super(field); this.field = field; } }
  const text = (v, max, field, required) => {
    const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > max || (required && !s)) throw new Bad(field);
    return s;
  };
  const price = v => { const n = (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN; if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Bad('price'); return n; };
  const id = (v, table, field) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || !Q(`SELECT 1 FROM ${table} WHERE id=?`).get(n)) throw new Bad(field); return n; };
  const flag = v => (v === true || v === 1 ? 1 : 0);

  // ---------- draft <-> snapshot ----------
  // snapshot shape (what the guest menu reads): [{ id, title, ar, groups: [{ id, label, ar, items: [[nameEn, price, nameAr, id]] }] }]
  function build({ withHidden = false } = {}) {
    const secs = Q('SELECT * FROM menu_sections ORDER BY pos, id').all();
    const groups = Q('SELECT * FROM menu_groups ORDER BY pos, id').all();
    const items = Q('SELECT * FROM menu_items ORDER BY pos, id').all();
    return secs.filter(s => withHidden || !s.hidden).map(s => {
      const out = { id: s.id, title: s.title_en, ar: s.title_ar, groups: groups.filter(g => g.section_id === s.id).map(g => ({
        id: g.id, label: g.label_en, ar: g.label_ar,
        items: items.filter(i => i.group_id === g.id && (withHidden || !i.hidden)).map(i => withHidden
          ? { id: i.id, name: i.name_en, ar: i.name_ar, price: i.price, hidden: !!i.hidden, soldOut: !!i.sold_out }
          : [i.name_en, i.price, i.name_ar, i.id]),
      })) };
      if (withHidden) out.hidden = !!s.hidden;
      return out;
    });
  }
  const latest = () => Q('SELECT * FROM menu_published ORDER BY id DESC LIMIT 1').get();
  // what changed between the published snapshot and the draft, in plain words for the admin page
  function changes() {
    const pub = latest(); const before = new Map(), after = new Map(), out = [];
    // compares the full copies (hidden items included, sold out left out: that one is live anyway)
    const walk = (secs, m) => secs.forEach(s => { m.set('s' + s.id, s.title + '|' + s.ar + '|' + !!s.hidden); s.groups.forEach(g => { m.set('g' + g.id, g.label + '|' + g.ar + '|' + s.id); g.items.forEach(i => m.set('i' + i.id, i.name + '|' + i.price + '|' + i.ar + '|' + !!i.hidden + '|' + g.id)); }); });
    const orderOf = secs => JSON.stringify(secs.map(s => [s.id, s.groups.map(g => [g.id, g.items.map(i => i.id)])]));
    const pubFull = pub ? JSON.parse(pub.full) : [];
    walk(pubFull, before);
    const draft = build({ withHidden: true }); walk(draft, after);
    const order = orderOf(draft), pubOrder = orderOf(pubFull);
    for (const [k, v] of after) if (!before.has(k)) out.push({ k, what: 'added' }); else if (before.get(k) !== v) out.push({ k, what: 'changed' });
    for (const k of before.keys()) if (!after.has(k)) out.push({ k, what: 'removed' });
    if (!out.length && order !== pubOrder) out.push({ k: 'order', what: 'reordered' });
    return out;
  }
  function publicMenu() {
    const pub = latest(); if (!pub) return null;
    const soldOut = Q('SELECT id FROM menu_items WHERE sold_out=1').all().map(r => r.id);
    return { v: pub.id + '.' + state('soldout_rev'), at: pub.at, sections: JSON.parse(pub.json), soldOut };
  }
  function publishNow(staffId) {
    const snap = build();
    const r = Q('INSERT INTO menu_published(at,staff_id,json,full) VALUES(?,?,?,?)').run(now(), staffId ?? null, JSON.stringify(snap), JSON.stringify(build({ withHidden: true })));
    Q('DELETE FROM menu_published WHERE id < ?').run(Number(r.lastInsertRowid) - 50);   // keep the last 50 versions
    return Number(r.lastInsertRowid);
  }
  // put the full copy of a published version back into the draft tables (ids kept, so sold out stays on the right items)
  function loadDraft(full) {
    const sold = new Set(Q('SELECT id FROM menu_items WHERE sold_out=1').all().map(r => r.id));
    Q('DELETE FROM menu_items').run(); Q('DELETE FROM menu_groups').run(); Q('DELETE FROM menu_sections').run();
    full.forEach((s, si) => {
      Q('INSERT INTO menu_sections(id,title_en,title_ar,pos,hidden) VALUES(?,?,?,?,?)').run(s.id, s.title, s.ar || '', si, s.hidden ? 1 : 0);
      s.groups.forEach((g, gi) => {
        Q('INSERT INTO menu_groups(id,section_id,label_en,label_ar,pos) VALUES(?,?,?,?,?)').run(g.id, s.id, g.label || '', g.ar || '', gi);
        g.items.forEach((i, ii) => Q('INSERT INTO menu_items(id,group_id,name_en,name_ar,price,pos,hidden,sold_out) VALUES(?,?,?,?,?,?,?,?)').run(i.id, g.id, i.name, i.ar || '', i.price, ii, i.hidden ? 1 : 0, sold.has(i.id) ? 1 : 0));
      });
    });
  }

  // ---------- one-time import from the built-in list in assets/menu.js ----------
  function importFrom(menuJsFile, { force = false } = {}) {
    if (!force && Q('SELECT COUNT(*) AS n FROM menu_sections').get().n) return { skipped: true };
    const src = fs.readFileSync(menuJsFile, 'utf8'); const i = src.indexOf('var SECTIONS = [');
    if (i < 0) throw new Error('SECTIONS not found in ' + menuJsFile);
    let j = src.indexOf('[', i), d = 0;
    for (; j < src.length; j++) { if (src[j] === '[') d++; else if (src[j] === ']' && !--d) break; }
    const secs = vm.runInNewContext('(' + src.slice(src.indexOf('[', i), j + 1) + ')');
    tx(() => {
      Q('DELETE FROM menu_items').run(); Q('DELETE FROM menu_groups').run(); Q('DELETE FROM menu_sections').run();
      secs.forEach((s, si) => {
        const sid = Number(Q('INSERT INTO menu_sections(title_en,title_ar,pos) VALUES(?,?,?)').run(s.title, s.ar || '', si).lastInsertRowid);
        s.groups.forEach((g, gi) => {
          const gid = Number(Q('INSERT INTO menu_groups(section_id,label_en,label_ar,pos) VALUES(?,?,?,?)').run(sid, g.label || '', g.ar || '', gi).lastInsertRowid);
          g.items.forEach((it, ii) => Q('INSERT INTO menu_items(group_id,name_en,name_ar,price,pos) VALUES(?,?,?,?,?)').run(gid, it[0], it[2] || '', it[1], ii));
        });
      });
      publishNow(null);
    });
    return { sections: secs.length, items: Q('SELECT COUNT(*) AS n FROM menu_items').get().n };
  }

  // ---------- routes ----------
  // public: GET /api/menu (published snapshot + live sold out). ETag lets phones re-check cheaply.
  function publicRoute(p, M, req, res) {
    if (p !== '/menu' || M !== 'GET') return false;
    const m = publicMenu();
    if (!m) { send(res, 404, { error: 'no menu' }); return true; }
    const etag = '"' + m.v + '"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }); res.end(); return true; }
    send(res, 200, m, { ETag: etag, 'Cache-Control': 'no-cache' });
    return true;
  }

  // staff: /api/staff/menu*  (returns false when the path is not ours)
  async function staffRoute(p, M, req, res, url, staff, ctx) {
    if (!p.startsWith('/staff/menu')) return false;
    const rank = RANK[staff.role] || 0;
    const need = r => { if (rank < RANK[r]) { send(res, 403, { error: 'role' }); return false; } return true; };
    const log = (action, detail) => audit('staff', staff.id, action, null, detail, ctx);
    const reply = extra => send(res, 200, { ok: true, changes: changes().length, ...extra });
    try {
      if (p === '/staff/menu' && M === 'GET') {
        if (!need('captain')) return true;
        const pub = latest();
        send(res, 200, { role: staff.role === 'admin' ? 'owner' : staff.role, sections: build({ withHidden: true }),
          published: pub ? { id: pub.id, at: pub.at, by: (Q('SELECT name FROM staff WHERE id=?').get(pub.staff_id) || {}).name || null } : null,
          changes: rank >= 2 ? changes() : [] });
        return true;
      }
      if (p === '/staff/menu/soldout' && M === 'POST') {
        if (!need('captain')) return true;
        const b = await readBody(req); const iid = id(b.id, 'menu_items', 'id'); const v = flag(b.soldOut);
        const it = Q('SELECT name_en, sold_out FROM menu_items WHERE id=?').get(iid);
        if (it.sold_out !== v) {
          tx(() => { Q('UPDATE menu_items SET sold_out=? WHERE id=?').run(v, iid); bump('soldout_rev'); });
          log(v ? 'menu_sold_out' : 'menu_back_in_stock', { id: iid, name: it.name_en });
        }
        send(res, 200, { ok: true, soldOut: !!v });
        return true;
      }
      if (M === 'GET' && p === '/staff/menu/log') {
        if (!need('manager')) return true;
        const before = Number(url.searchParams.get('before')) || 2 ** 53;
        const rows = Q(`SELECT a.id, a.at, a.action, a.detail, s.name AS staff FROM audit_log a LEFT JOIN staff s ON s.id=a.actor_id
          WHERE a.action LIKE 'menu_%' AND a.id<? ORDER BY a.id DESC LIMIT 51`).all(before);
        send(res, 200, { items: rows.slice(0, 50).map(r => ({ id: r.id, at: r.at, action: r.action, staff: r.staff, detail: JSON.parse(r.detail || 'null') })), more: rows.length > 50 });
        return true;
      }
      if (M === 'GET' && p === '/staff/menu/preview') {
        if (!need('manager')) return true;
        const soldOut = Q('SELECT id FROM menu_items WHERE sold_out=1').all().map(r => r.id);
        send(res, 200, { v: 'draft', preview: true, sections: build(), soldOut });
        return true;
      }
      if (M !== 'POST') { send(res, 404, { error: 'not found' }); return true; }
      if (!need('manager')) return true;
      const b = await readBody(req);

      if (p === '/staff/menu/item') {
        const d = { name_en: text(b.nameEn, MAX.name, 'nameEn', true), name_ar: text(b.nameAr, MAX.name, 'nameAr'), price: price(b.price), hidden: flag(b.hidden), group_id: id(b.groupId, 'menu_groups', 'groupId') };
        if (b.id != null) {
          const iid = id(b.id, 'menu_items', 'id'), before = Q('SELECT name_en,name_ar,price,hidden,group_id FROM menu_items WHERE id=?').get(iid);
          tx(() => {
            const pos = before.group_id === d.group_id ? undefined : (Q('SELECT COALESCE(MAX(pos),-1)+1 AS p FROM menu_items WHERE group_id=?').get(d.group_id).p);
            Q('UPDATE menu_items SET name_en=?,name_ar=?,price=?,hidden=?,group_id=?' + (pos !== undefined ? ',pos=' + pos : '') + ' WHERE id=?').run(d.name_en, d.name_ar, d.price, d.hidden, d.group_id, iid);
          });
          log('menu_item_edit', { id: iid, before, after: d });
          reply({ id: iid });
        } else {
          const r = Q('INSERT INTO menu_items(group_id,name_en,name_ar,price,pos,hidden) VALUES(?,?,?,?,(SELECT COALESCE(MAX(pos),-1)+1 FROM menu_items WHERE group_id=?),?)').run(d.group_id, d.name_en, d.name_ar, d.price, d.group_id, d.hidden);
          log('menu_item_add', { id: Number(r.lastInsertRowid), after: d });
          reply({ id: Number(r.lastInsertRowid) });
        }
        return true;
      }
      if (p === '/staff/menu/item/delete') {
        const iid = id(b.id, 'menu_items', 'id'); const before = Q('SELECT * FROM menu_items WHERE id=?').get(iid);
        Q('DELETE FROM menu_items WHERE id=?').run(iid);
        log('menu_item_delete', { id: iid, before });
        reply();
        return true;
      }
      if (p === '/staff/menu/section') {
        const d = { title_en: text(b.titleEn, MAX.title, 'titleEn', true), title_ar: text(b.titleAr, MAX.title, 'titleAr'), hidden: flag(b.hidden) };
        if (b.id != null) {
          const sid = id(b.id, 'menu_sections', 'id'), before = Q('SELECT title_en,title_ar,hidden FROM menu_sections WHERE id=?').get(sid);
          Q('UPDATE menu_sections SET title_en=?,title_ar=?,hidden=? WHERE id=?').run(d.title_en, d.title_ar, d.hidden, sid);
          log('menu_section_edit', { id: sid, before, after: d }); reply({ id: sid });
        } else {
          const sid = tx(() => {
            const s = Number(Q('INSERT INTO menu_sections(title_en,title_ar,pos,hidden) VALUES(?,?,(SELECT COALESCE(MAX(pos),-1)+1 FROM menu_sections),?)').run(d.title_en, d.title_ar, d.hidden).lastInsertRowid);
            Q("INSERT INTO menu_groups(section_id,label_en,label_ar,pos) VALUES(?,'','',0)").run(s);   // every section starts with one unnamed group
            return s;
          });
          log('menu_section_add', { id: sid, after: d }); reply({ id: sid });
        }
        return true;
      }
      if (p === '/staff/menu/section/delete') {
        const sid = id(b.id, 'menu_sections', 'id');
        if (Q('SELECT COUNT(*) AS n FROM menu_items i JOIN menu_groups g ON g.id=i.group_id WHERE g.section_id=?').get(sid).n) { send(res, 409, { error: 'not-empty' }); return true; }
        const before = Q('SELECT title_en,title_ar FROM menu_sections WHERE id=?').get(sid);
        Q('DELETE FROM menu_sections WHERE id=?').run(sid);
        log('menu_section_delete', { id: sid, before }); reply();
        return true;
      }
      if (p === '/staff/menu/group') {
        const d = { label_en: text(b.labelEn, MAX.label, 'labelEn'), label_ar: text(b.labelAr, MAX.label, 'labelAr') };
        if (b.id != null) {
          const gid = id(b.id, 'menu_groups', 'id'), before = Q('SELECT label_en,label_ar FROM menu_groups WHERE id=?').get(gid);
          Q('UPDATE menu_groups SET label_en=?,label_ar=? WHERE id=?').run(d.label_en, d.label_ar, gid);
          log('menu_group_edit', { id: gid, before, after: d }); reply({ id: gid });
        } else {
          const sid = id(b.sectionId, 'menu_sections', 'sectionId');
          const gid = Number(Q('INSERT INTO menu_groups(section_id,label_en,label_ar,pos) VALUES(?,?,?,(SELECT COALESCE(MAX(pos),-1)+1 FROM menu_groups WHERE section_id=?))').run(sid, d.label_en, d.label_ar, sid).lastInsertRowid);
          log('menu_group_add', { id: gid, section: sid, after: d }); reply({ id: gid });
        }
        return true;
      }
      if (p === '/staff/menu/group/delete') {
        const gid = id(b.id, 'menu_groups', 'id'); const g = Q('SELECT * FROM menu_groups WHERE id=?').get(gid);
        if (Q('SELECT COUNT(*) AS n FROM menu_items WHERE group_id=?').get(gid).n) { send(res, 409, { error: 'not-empty' }); return true; }
        if (Q('SELECT COUNT(*) AS n FROM menu_groups WHERE section_id=?').get(g.section_id).n < 2) { send(res, 409, { error: 'last-group' }); return true; }
        Q('DELETE FROM menu_groups WHERE id=?').run(gid);
        log('menu_group_delete', { id: gid, before: g }); reply();
        return true;
      }
      // new order of one level: { kind: 'section' | 'group' | 'item', parentId, ids: [...] } — ids must be exactly that parent's children
      if (p === '/staff/menu/reorder') {
        const K = { section: ['menu_sections', null], group: ['menu_groups', 'section_id'], item: ['menu_items', 'group_id'] }[b.kind];
        if (!K || !Array.isArray(b.ids) || b.ids.length > 500) throw new Bad('ids');
        const [table, col] = K;
        const kids = (col ? Q(`SELECT id FROM ${table} WHERE ${col}=?`).all(Number(b.parentId)) : Q(`SELECT id FROM ${table}`).all()).map(r => r.id).sort((x, y) => x - y);
        const ids = b.ids.map(Number);
        if (JSON.stringify([...ids].sort((x, y) => x - y)) !== JSON.stringify(kids) || !kids.length) throw new Bad('ids');
        tx(() => ids.forEach((x, i) => Q(`UPDATE ${table} SET pos=? WHERE id=?`).run(i, x)));
        log('menu_reorder', { kind: b.kind, parent: col ? Number(b.parentId) : null, ids }); reply();
        return true;
      }
      // { percent: -50..100, sectionId: optional, roundTo: 1 | 5 } -> prices in the draft
      if (p === '/staff/menu/bulk-price') {
        const pct = Number(b.percent), round = [1, 5].includes(Number(b.roundTo)) ? Number(b.roundTo) : 5;
        if (!Number.isFinite(pct) || pct < -50 || pct > 100 || pct === 0) throw new Bad('percent');
        const sid = b.sectionId != null ? id(b.sectionId, 'menu_sections', 'sectionId') : null;
        const rows = sid ? Q('SELECT i.id, i.price FROM menu_items i JOIN menu_groups g ON g.id=i.group_id WHERE g.section_id=?').all(sid) : Q('SELECT id, price FROM menu_items').all();
        tx(() => rows.forEach(r => Q('UPDATE menu_items SET price=? WHERE id=?').run(Math.max(0, Math.round(r.price * (1 + pct / 100) / round) * round), r.id)));
        log('menu_bulk_price', { percent: pct, section: sid, roundTo: round, items: rows.length }); reply({ items: rows.length });
        return true;
      }
      if (p === '/staff/menu/publish') {
        const ch = changes();
        if (!ch.length) { send(res, 409, { error: 'nothing' }); return true; }
        const v = publishNow(staff.id);
        log('menu_publish', { version: v, changes: ch.length }); reply({ version: v });
        return true;
      }
      if (p === '/staff/menu/discard') {
        const pub = latest(); if (!pub) { send(res, 409, { error: 'nothing' }); return true; }
        const n = changes().length;
        tx(() => loadDraft(JSON.parse(pub.full)));
        log('menu_discard', { version: pub.id, changes: n }); reply();
        return true;
      }
      send(res, 404, { error: 'not found' });
      return true;
    } catch (e) {
      if (e instanceof Bad) { send(res, 400, { error: 'bad', field: e.field }); return true; }
      throw e;
    }
  }
  return { publicRoute, staffRoute, importFrom, publicMenu, RANK };
}
module.exports = { createMenu, RANK };
