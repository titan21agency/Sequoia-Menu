/*
 * Sequoia Card — captain tab. Loaded only when "كارت سيكويا" is opened.
 * Needs a staff login (server-side session). Every stamp/redeem is validated and audited on the server.
 */
(function () {
  'use strict';
  var API = '/api';
  var root, q = '', me = null, cur = null, tables = [], es = null, busy = false, msg = '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function when(t) {
    var d = new Date(t), h = d.getHours(), m = d.getMinutes();
    return d.getDate() + '/' + (d.getMonth() + 1) + ' · ' + (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' ص' : ' م');
  }
  function rid() { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }
  function call(method, path, body) {
    return fetch(API + path, {
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' } : { 'X-Requested-With': 'sequoia' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); });
  }
  var ERR = {
    card_full: 'الكارت كامل — سلّم المكافأة الأول.',
    too_soon: 'الزيارة دي اتختمت خلاص. الختم الجاي متاح بعد شوية.',
    not_full: 'الكارت لسه مكملش.',
    none: 'مفيش عميل بالرقم ده. خلّيه يسجّل من "حسابي" في المنيو.',
    rate: 'محاولات كتير. استنى شوية.',
    creds: 'اسم المستخدم أو الباسورد غلط.',
    duplicate: 'العملية دي اتسجلت قبل كده.'
  };

  var CSS = '.cc{margin-top:22px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:18px;align-items:start}' +
    '@media (max-width:760px){.cc{grid-template-columns:1fr}}' +
    '.cc-box{background:var(--cream);color:var(--navy);border-radius:24px;padding:18px;border-top:8px solid var(--navy)}' +
    '.cc-box h3{margin:0 0 12px;font-size:18px}' +
    '.cc-search{display:flex;gap:10px}' +
    '.cc-in{flex:1 1 auto;min-width:0;height:56px;border:2px solid rgba(31,42,68,.25);border-radius:16px;background:#fff;color:var(--navy);padding:0 14px;font-size:22px;text-align:center;outline:none;-webkit-user-select:text;user-select:text}' +
    '.cc-in:focus{border-color:var(--navy)}' +
    '.cc-btn{height:56px;padding:0 20px;border:0;border-radius:16px;background:var(--navy);color:var(--cream);font-size:18px;font-weight:700}' +
    '.cc-btn[disabled]{opacity:.45;cursor:default}.cc-btn[disabled]:active{transform:none}' +
    '.cc-btn.red{background:var(--accent)}' +
    '.cc-row{width:100%;display:flex;align-items:center;gap:12px;padding:10px 12px;border:0;border-bottom:1px dashed rgba(31,42,68,.2);background:transparent;color:var(--navy);font-size:17px;text-align:start;border-radius:12px}' +
    '.cc-row .num{font-size:30px;min-width:46px;text-align:center}' +
    '.cc-row small{color:var(--ink-3);font-size:14px}' +
    '.cc-big{display:flex;align-items:baseline;justify-content:center;gap:8px;margin:6px 0 4px}' +
    '.cc-big .num{font-size:84px;line-height:1}' +
    '.cc-dots{display:flex;gap:8px;justify-content:center;margin:6px 0 14px}' +
    '.cc-dots i{width:26px;height:26px;border-radius:50%;border:2px dashed rgba(31,42,68,.35)}.cc-dots i.on{background:var(--navy);border:0}' +
    '.cc-acts{display:flex;flex-direction:column;gap:10px}.cc-acts .cc-btn{height:62px;font-size:19px}' +
    '.cc-msg{min-height:24px;margin:10px 0 0;font-size:16px;font-weight:600;color:var(--accent)}.cc-msg.ok{color:#2F7A43}' +
    '.cc-ops{list-style:none;margin:16px 0 0;padding:12px 0 0;border-top:1px dashed rgba(31,42,68,.25);display:flex;flex-direction:column;gap:8px}' +
    '.cc-ops li{display:flex;justify-content:space-between;gap:8px;font-size:16px}.cc-ops small{color:var(--ink-3);font-size:14px}' +
    '.cc-login{max-width:380px;margin:30px auto 0;display:flex;flex-direction:column;gap:12px}' +
    '.cc-head{margin-top:14px;display:flex;align-items:center;gap:12px;color:var(--beige);font-size:15px}' +
    '.cc-link{height:36px;padding:0 12px;border:1.5px solid rgba(244,238,226,.3);border-radius:10px;background:transparent;font-size:14px}' +
    '.cc-empty{color:var(--ink-3);font-size:16px;margin:6px 0}';

  function login() {
    root.innerHTML = '<form class="cc-box cc-login" id="cc-login"><h3>دخول الموظفين</h3>' +
      '<input class="cc-in" name="u" autocomplete="username" placeholder="اسم المستخدم" dir="ltr" required>' +
      '<input class="cc-in" name="p" type="password" autocomplete="current-password" placeholder="الباسورد" dir="ltr" required>' +
      '<button class="press cc-btn" type="submit">دخول</button><p class="cc-msg" role="alert">' + esc(msg) + '</p></form>';
  }

  function cardBox() {
    if (!cur) return '<div class="cc-box"><h3>العميل</h3><p class="cc-empty">دوّر برقم الموبايل أو اختار عميل من الترابيزات.</p></div>';
    var c = cur.card, dots = '';
    for (var i = 0; i < c.required; i++) dots += '<i class="' + (i < c.count ? 'on' : '') + '"></i>';
    var ops = cur.ops.items.map(function (o) {
      return '<li><span>' + (o.action === 'stamp' ? 'ختم زيارة' : 'تسليم مكافأة') + (o.table ? ' · ترابيزة ' + o.table : '') + '</span><small>' + esc(o.staff || '') + ' · ' + when(o.at) + '</small></li>';
    }).join('') || '<li><small>لسه مفيش عمليات.</small></li>';
    var soon = c.nextStampAt ? '<p class="cc-empty" style="text-align:center">الختم الجاي بعد ' + when(c.nextStampAt) + '</p>' : '';
    return '<div class="cc-box"><h3>العميل <span dir="ltr" style="font-weight:500">' + esc(cur.phone) + '</span></h3>' +
      '<div class="cc-big"><span class="num" dir="ltr">' + c.count + ' / ' + c.required + '</span></div>' +
      '<div class="cc-dots" aria-hidden="true">' + dots + '</div>' + soon +
      '<div class="cc-acts">' +
        '<button class="press cc-btn" data-stamp' + (busy || c.complete || c.nextStampAt ? ' disabled' : '') + '>اختم زيارة (بعد الدفع)</button>' +
        '<button class="press cc-btn red" data-redeem' + (busy || !c.complete ? ' disabled' : '') + '>سلّم المكافأة — ' + esc(c.rewardName) + '</button>' +
      '</div>' +
      '<p class="cc-msg' + (msg && msg.charAt(0) === '✓' ? ' ok' : '') + '" role="status">' + esc(msg) + '</p>' +
      '<h3 style="margin-top:14px">آخر العمليات</h3><ul class="cc-ops">' + ops + '</ul>' +
      (cur.ops.more ? '<button class="press cc-link" data-more style="color:var(--navy);border-color:rgba(31,42,68,.3);margin-top:10px">أقدم</button>' : '') +
      '</div>';
  }

  function paint() {
    if (!me) return login();
    var rows = tables.map(function (t) {
      return '<button class="press cc-row" data-id="' + t.id + '"><span class="num">' + t.table + '</span><span style="flex:1"><span dir="ltr">' + esc(t.phone) + '</span><br><small>' + t.card.count + ' / ' + t.card.required + (t.card.complete ? ' · المكافأة جاهزة' : '') + '</small></span></button>';
    }).join('') || '<p class="cc-empty">مفيش عملاء مسجلين على ترابيزات دلوقتي.</p>';
    root.innerHTML = '<div class="cc-head"><span>' + esc(me.name) + '</span><button class="press cc-link" data-logout type="button">خروج</button></div>' +
      '<div class="cc"><div style="display:flex;flex-direction:column;gap:18px">' +
        '<form class="cc-box" id="cc-find"><h3>دوّر برقم الموبايل</h3><div class="cc-search"><input class="cc-in" name="q" type="tel" inputmode="tel" dir="ltr" placeholder="01xxxxxxxxx" maxlength="16" value="' + esc(q) + '"><button class="press cc-btn" type="submit">دوّر</button></div></form>' +
        '<div class="cc-box"><h3>على الترابيزات دلوقتي</h3>' + rows + '</div>' +
      '</div>' + cardBox() + '</div>';
  }

  function open(q) {
    return call('GET', '/staff/customer?' + q).then(function (j) {
      if (j.status === 401) { me = null; msg = 'الجلسة خلصت. ادخل تاني.'; return paint(); }
      if (j.status !== 200) { cur = null; msg = ERR[j.error] || 'حصل خطأ.'; return paint(); }
      cur = j; cur.query = q; msg = ''; paint();
    });
  }
  function loadTables() { return call('GET', '/staff/tables').then(function (j) { if (Array.isArray(j)) { tables = j; paint(); } }); }

  function act(kind) {
    if (!cur || busy) return;
    busy = true; msg = ''; paint();
    call('POST', '/staff/' + kind, { customerId: cur.id, requestId: rid() }).then(function (j) {
      busy = false;
      if (j.status === 200) { var ok = kind === 'stamp' ? '✓ اتختمت الزيارة' : '✓ اتسلمت المكافأة والكارت بدأ من جديد'; return open(cur.query).then(function () { msg = ok; paint(); }); }
      msg = ERR[j.error] || 'حصل خطأ، جرّب تاني.'; if (j.card) cur.card = j.card; paint();
    }, function () { busy = false; msg = 'مفيش اتصال.'; paint(); });
  }

  function live() {
    if (es) es.close();
    es = new EventSource(API + '/staff/stream');
    var t = null;
    function refresh() { clearTimeout(t); t = setTimeout(function () { loadTables(); }, 300); }
    es.addEventListener('presence', refresh);
    es.addEventListener('card', refresh);
  }

  function start() { paint(); loadTables(); live(); }

  function mount(el) {
    root = el;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (f.id === 'cc-login') {
        call('POST', '/staff/login', { username: f.u.value, password: f.p.value }).then(function (j) {
          if (j.status === 200) { me = { name: j.name, role: j.role }; msg = ''; start(); }
          else { msg = ERR[j.error] || 'حصل خطأ.'; login(); }
        });
      } else if (f.id === 'cc-find') {
        q = f.q.value.trim(); if (q) open('phone=' + encodeURIComponent(q));
      }
    });
    root.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-id]'))) open('id=' + b.getAttribute('data-id'));
      else if (e.target.closest('[data-stamp]')) act('stamp');
      else if (e.target.closest('[data-redeem]')) act('redeem');
      else if (e.target.closest('[data-more]') && cur) {
        var last = cur.ops.items[cur.ops.items.length - 1];
        call('GET', '/staff/customer?' + cur.query + '&before=' + last.id).then(function (j) { if (j.status === 200) { cur.ops.items = cur.ops.items.concat(j.ops.items); cur.ops.more = j.ops.more; paint(); } });
      } else if (e.target.closest('[data-logout]')) call('POST', '/staff/logout', {}).then(function () { me = null; cur = null; if (es) es.close(); paint(); });
    });
    root.innerHTML = '<p class="cc-empty" style="color:var(--beige)">لحظة…</p>';
    call('GET', '/staff/me').then(function (j) { if (j.status === 200) { me = j; start(); } else paint(); }, function () { msg = 'مفيش اتصال.'; paint(); });
  }

  window.SequoiaCaptainCard = { mount: mount };
})();
