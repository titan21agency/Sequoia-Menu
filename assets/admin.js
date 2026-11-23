/*
 * Sequoia menu admin (staff, Arabic). Same staff login as the captain screen.
 * captain: sold out only · manager: whole menu + publish + change log · owner: manager + staff accounts.
 * The server checks every role again; hiding buttons here is only for clarity.
 */
(function () {
  'use strict';
  var app = document.getElementById('app'), bar = document.getElementById('bar'), sheet = document.getElementById('sheet'), toastEl = document.getElementById('toast');
  var S = { me: null, tab: 'menu', data: null, open: {}, log: null, users: null };
  var ROLE = { owner: 'مالك', manager: 'مدير', captain: 'كابتن' };
  var RANK = { captain: 1, manager: 2, owner: 3 };
  var AR = '٠١٢٣٤٥٦٧٨٩';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function can(r) { return S.me && RANK[S.me.role] >= RANK[r]; }
  function digits(v) { return String(v).replace(/[٠-٩]/g, function (d) { return AR.indexOf(d); }).trim(); }
  function when(t) { return new Date(t).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }

  // ---------- plain-language errors ----------
  var FIELD = {
    nameEn: 'اكتب اسم الصنف بالإنجليزي (لحد ٨٠ حرف).', nameAr: 'الاسم بالعربي طويل قوي (لحد ٨٠ حرف).',
    price: 'السعر لازم يكون رقم صحيح من 0 لـ 100000 جنيه.', groupId: 'اختار المجموعة.', id: 'الحاجة دي اتمسحت. حدّث الصفحة.',
    titleEn: 'اكتب اسم القسم بالإنجليزي (لحد ٤٠ حرف).', titleAr: 'اسم القسم بالعربي طويل قوي.', labelEn: 'اسم المجموعة طويل قوي (لحد ٤٠ حرف).', labelAr: 'اسم المجموعة طويل قوي.',
    percent: 'النسبة لازم تكون بين ‎-50% و‎+100% ومش صفر.', ids: 'الترتيب اتغيّر من جهاز تاني. حدّث الصفحة وجرّب تاني.',
    username: 'اسم المستخدم: حروف إنجليزي صغيرة وأرقام و . _ - من 3 لـ 30.', name: 'اكتب الاسم (لحد ٦٠ حرف).', role: 'اختار الوظيفة.', sectionId: 'اختار القسم.'
  };
  var ERR = {
    'not-empty': 'فيها أصناف. انقل الأصناف أو امسحها الأول.', 'last-group': 'لازم يفضل في القسم مجموعة واحدة على الأقل.',
    nothing: 'مفيش تعديلات لسه متنشرتش.', role: 'الصلاحية دي مش ليك.', self: 'مينفعش تقفل حسابك أو تشيل منه صلاحية المالك.',
    'last-owner': 'لازم يفضل مالك واحد على الأقل.', taken: 'اسم المستخدم ده موجود. اختار اسم تاني.', none: 'الحساب ده مش موجود.',
    rate: 'محاولات كتير. استنى شوية وجرّب تاني.', creds: 'اسم المستخدم أو الباسورد غلط.'
  };
  function errText(e) {
    if (!e || !e.status) return 'مفيش اتصال. اتأكد من النت وجرّب تاني.';
    var b = e.body || {};
    if (b.error === 'bad' && FIELD[b.field]) return FIELD[b.field];
    if (b.error === 'locked') return 'الحساب اتقفل بعد ٥ محاولات غلط. جرّب بعد ' + Math.ceil((b.retryIn || 900) / 60) + ' دقيقة.';
    return ERR[b.error] || 'حصلت مشكلة. جرّب تاني.';
  }

  // ---------- API ----------
  function api(method, path, body) {
    return fetch('/api' + path, {
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' } : { 'X-Requested-With': 'sequoia' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && path !== '/staff/login') { S.me = null; showLogin(); }
        if (!r.ok) { var e = new Error(j.error || 'http'); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    });
  }
  function busy(b, on) { if (!b) return; b.disabled = on; b.classList.toggle('is-loading', on); if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); }
  var toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 2600); }

  // ---------- login ----------
  function showLogin(msg) {
    bar.hidden = true; closeSheet();
    app.innerHTML = '<div class="login"><header><h1>إدارة المنيو</h1></header><form class="card" id="lf" novalidate>' +
      '<h2>دخول الموظفين</h2><label for="lu">اسم المستخدم</label><input id="lu" type="text" dir="ltr" autocomplete="username" autocapitalize="none" required>' +
      '<label for="lp">الباسورد</label><input id="lp" type="password" dir="ltr" autocomplete="current-password" required>' +
      '<div class="err" id="le" role="alert">' + esc(msg || '') + '</div>' +
      '<div class="actions"><button class="btn primary grow" type="submit">ادخل</button></div></form></div>';
    var f = document.getElementById('lf');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = f.querySelector('button'), u = document.getElementById('lu').value.trim(), p = document.getElementById('lp').value;
      if (!u || !p) { document.getElementById('le').textContent = 'اكتب اسم المستخدم والباسورد.'; return; }
      busy(b, true);
      api('POST', '/staff/login', { username: u, password: p }).then(function () { return boot(); }, function (er) { document.getElementById('le').textContent = errText(er); })
        .then(function () { busy(b, false); });
    });
    document.getElementById('lu').focus();
  }
  function boot() {
    return api('GET', '/staff/me').then(function (me) {
      S.me = { name: me.name, role: me.role === 'admin' ? 'owner' : me.role };
      return loadMenu();
    }, function (e) { if (e.status !== 401) showLogin(errText(e)); });
  }
  function loadMenu() { return api('GET', '/staff/menu').then(function (d) { S.data = d; draw(); }); }

  // ---------- layout ----------
  function draw() {
    var tabs = [['menu', 'المنيو']];
    if (can('manager')) tabs.push(['log', 'سجل التعديلات']);
    if (can('owner')) tabs.push(['users', 'الموظفين']);
    app.innerHTML = '<header><h1>منيو سيكويا</h1><div class="who"><span>' + esc(S.me.name) + '</span><span class="chip">' + ROLE[S.me.role] + '</span>' +
      '<button class="btn link" data-act="logout">خروج</button></div></header>' +
      (tabs.length > 1 ? '<nav class="tabs" role="tablist">' + tabs.map(function (t) { return '<button class="tab" role="tab" aria-selected="' + (S.tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav>' : '') +
      '<div id="view"></div>';
    if (S.tab === 'log') drawLog(); else if (S.tab === 'users') drawUsers(); else drawMenu();
    drawBar();
  }
  function drawBar() {
    if (!can('manager') || S.tab !== 'menu') { bar.hidden = true; return; }
    var n = S.data.changes.length, pub = S.data.published;
    bar.hidden = false;
    bar.innerHTML = '<div class="wrap"><div class="msg">' + (n
      ? '<b>' + n + ' تعديل</b> في المسودة، لسه مش ظاهر للزباين.'
      : 'كل التعديلات منشورة.' + (pub ? ' آخر نشر ' + esc(when(pub.at)) + (pub.by ? ' · ' + esc(pub.by) : '') : '')) + '</div>' +
      '<a class="btn secondary" href="./?preview=1#tracks" target="_blank" rel="noopener">معاينة</a>' +
      (n ? '<button class="btn link" data-act="discard">إلغاء التعديلات</button>' : '') +
      '<button class="btn primary" data-act="publish"' + (n ? '' : ' disabled') + '>انشر المنيو</button></div>';
  }

  // ---------- menu tab ----------
  function drawMenu() {
    var v = document.getElementById('view'), secs = S.data.sections, mgr = can('manager');
    v.innerHTML = (mgr ? '' : '<p class="sub" style="color:var(--beige)">تقدر تعلّم الأصناف اللي خلصت. التعديلات التانية للمدير.</p>') +
      secs.map(function (s, si) {
        var open = S.open[s.id] || secs.length === 1, n = s.groups.reduce(function (a, g) { return a + g.items.length; }, 0);
        var out = s.groups.reduce(function (a, g) { return a + g.items.filter(function (i) { return i.soldOut; }).length; }, 0);
        return '<section class="card">' +
          '<div class="sec-h"><button class="icon" data-act="toggle" data-id="' + s.id + '" aria-expanded="' + !!open + '" aria-label="' + (open ? 'اقفل' : 'افتح') + ' ' + esc(s.ar || s.title) + '">' + (open ? '▾' : '◂') + '</button>' +
          '<div class="grow" data-act="toggle" data-id="' + s.id + '"><h2>' + esc(s.ar || s.title) + (s.hidden ? '<span class="tag">مخفي</span>' : '') + '</h2>' +
          '<div class="sub"><span class="ltr">' + esc(s.title) + '</span> · ' + n + ' صنف' + (out ? ' · ' + out + ' خلص' : '') + '</div></div>' +
          (mgr ? '<button class="icon" data-act="sec-up" data-i="' + si + '" aria-label="طلّع القسم لفوق"' + (si ? '' : ' disabled') + '>▲</button>' +
            '<button class="icon" data-act="sec-down" data-i="' + si + '" aria-label="نزّل القسم لتحت"' + (si < secs.length - 1 ? '' : ' disabled') + '>▼</button>' +
            '<button class="icon" data-act="sec-edit" data-id="' + s.id + '" aria-label="عدّل القسم">✎</button>' : '') + '</div>' +
          (open ? s.groups.map(function (g, gi) { return group(s, g, gi); }).join('') +
            (mgr ? '<button class="add" data-act="grp-add" data-id="' + s.id + '">+ مجموعة جديدة</button>' : '') : '') +
          '</section>';
      }).join('') +
      (mgr ? '<button class="add" style="color:var(--cream);border-color:rgba(244,238,226,.4)" data-act="sec-add">+ قسم جديد</button>' +
        '<div class="actions"><button class="btn secondary" data-act="bulk">غيّر الأسعار بنسبة</button></div>' : '');
  }
  function group(s, g, gi) {
    var mgr = can('manager');
    return '<div class="grp">' +
      ((g.label || g.ar || s.groups.length > 1) ? '<div class="grp-h"><span class="grow">' + esc(g.ar || g.label || 'بدون اسم') + (g.label ? ' · <span class="ltr">' + esc(g.label) + '</span>' : '') + '</span>' +
        (mgr ? '<button class="icon" data-act="grp-edit" data-id="' + g.id + '" aria-label="عدّل المجموعة">✎</button>' : '') + '</div>' : '') +
      g.items.map(function (it, ii) {
        return '<div class="item' + (it.hidden ? ' is-hidden' : '') + '"><div class="grow"><div class="nm">' + esc(it.ar || it.name) + (it.hidden ? '<span class="tag">مخفي</span>' : '') + '</div>' +
          '<div class="en ltr">' + esc(it.name) + '</div></div><span class="pr ltr">' + esc(it.price) + '</span>' +
          '<button class="sw" data-act="sold" data-id="' + it.id + '" aria-pressed="' + it.soldOut + '" aria-label="' + esc(it.ar || it.name) + ': ' + (it.soldOut ? 'خلص، دوس عشان يرجع متاح' : 'متاح، دوس لو خلص') + '">' + (it.soldOut ? 'خلص' : 'متاح') + '</button>' +
          (mgr ? '<button class="icon" data-act="it-up" data-g="' + g.id + '" data-i="' + ii + '" aria-label="طلّع لفوق"' + (ii ? '' : ' disabled') + '>▲</button>' +
            '<button class="icon" data-act="it-edit" data-id="' + it.id + '" aria-label="عدّل ' + esc(it.ar || it.name) + '">✎</button>' : '') + '</div>';
      }).join('') +
      (mgr ? '<button class="add" data-act="it-add" data-g="' + g.id + '">+ صنف جديد</button>' : '') + '</div>';
  }
  function find(kind, id) {
    id = +id;
    for (var a = 0; a < S.data.sections.length; a++) {
      var s = S.data.sections[a]; if (kind === 's' && s.id === id) return s;
      for (var b = 0; b < s.groups.length; b++) {
        var g = s.groups[b]; if (kind === 'g' && g.id === id) return { g: g, s: s };
        for (var c = 0; c < g.items.length; c++) if (kind === 'i' && g.items[c].id === id) return { it: g.items[c], g: g, s: s };
      }
    }
    return null;
  }
  function groupOptions(sel) {
    return S.data.sections.map(function (s) {
      return '<optgroup label="' + esc(s.ar || s.title) + '">' + s.groups.map(function (g) {
        return '<option value="' + g.id + '"' + (g.id === sel ? ' selected' : '') + '>' + esc((s.ar || s.title) + (g.ar || g.label ? ' · ' + (g.ar || g.label) : '')) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }
  function after(p, msg) { return p.then(function (r) { if (msg) toast(msg); return loadMenu().then(function () { return r; }); }); }

  // ---------- sheets ----------
  function openSheet(html, onSubmit) {
    sheet.innerHTML = '<form class="panel" role="dialog" aria-modal="true" aria-labelledby="sh-t" novalidate>' + html + '<div class="err" id="sh-e" role="alert"></div></form>';
    sheet.hidden = false;
    var f = sheet.querySelector('form');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = f.querySelector('[type=submit]'); busy(b, true);
      // only an explicit true keeps the sheet open (it opened another sheet, e.g. a new password)
      Promise.resolve().then(onSubmit.bind(null, f)).then(function (keep) { if (keep !== true) closeSheet(); }, function (er) { document.getElementById('sh-e').textContent = errText(er); })
        .then(function () { if (b.isConnected) busy(b, false); });
    });
    var first = f.querySelector('input,select,button'); if (first) first.focus();
  }
  function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; }
  sheet.addEventListener('click', function (e) { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
  function confirmSheet(title, line, okLabel, run) {
    openSheet('<h2 id="sh-t">' + title + '</h2><p>' + line + '</p><div class="actions"><button type="button" class="btn link" data-close>رجوع</button><span class="grow"></span>' +
      '<button type="submit" class="btn danger">' + okLabel + '</button></div>', run);
  }
  function val(f, id) { return f.querySelector('#' + id).value; }

  function itemSheet(it, groupId) {
    var isNew = !it;
    openSheet('<h2 id="sh-t">' + (isNew ? 'صنف جديد' : 'عدّل الصنف') + '</h2>' +
      '<label for="f-ar">الاسم بالعربي</label><input id="f-ar" type="text" maxlength="80" value="' + esc(it ? it.ar : '') + '">' +
      '<label for="f-en">الاسم بالإنجليزي</label><input id="f-en" type="text" dir="ltr" maxlength="80" required value="' + esc(it ? it.name : '') + '">' +
      '<label for="f-pr">السعر (جنيه)</label><input id="f-pr" type="text" inputmode="numeric" dir="ltr" required value="' + esc(it ? it.price : '') + '">' +
      '<label for="f-g">القسم والمجموعة</label><select id="f-g">' + groupOptions(it ? find('i', it.id).g.id : groupId) + '</select>' +
      '<label class="check"><input id="f-h" type="checkbox"' + (it && it.hidden ? ' checked' : '') + '> مخفي (مش ظاهر للزباين)</label>' +
      '<div class="actions">' + (isNew ? '' : '<button type="button" class="btn link" style="color:var(--danger)" data-act="it-del" data-id="' + it.id + '">امسح الصنف</button>') +
      '<span class="grow"></span><button type="button" class="btn link" data-close>رجوع</button><button type="submit" class="btn primary">احفظ</button></div>',
      function (f) {
        var body = { nameAr: val(f, 'f-ar'), nameEn: val(f, 'f-en'), price: digits(val(f, 'f-pr')), groupId: +val(f, 'f-g'), hidden: f.querySelector('#f-h').checked };
        if (!isNew) body.id = it.id;
        return after(api('POST', '/staff/menu/item', body), isNew ? 'اتضاف في المسودة' : 'اتحفظ في المسودة');
      });
  }
  function sectionSheet(s) {
    var isNew = !s;
    openSheet('<h2 id="sh-t">' + (isNew ? 'قسم جديد' : 'عدّل القسم') + '</h2>' +
      '<label for="f-ar">اسم القسم بالعربي</label><input id="f-ar" type="text" maxlength="40" value="' + esc(s ? s.ar : '') + '">' +
      '<label for="f-en">اسم القسم بالإنجليزي</label><input id="f-en" type="text" dir="ltr" maxlength="40" required value="' + esc(s ? s.title : '') + '">' +
      '<label class="check"><input id="f-h" type="checkbox"' + (s && s.hidden ? ' checked' : '') + '> مخفي (القسم كله مش ظاهر للزباين)</label>' +
      '<div class="actions">' + (isNew ? '' : '<button type="button" class="btn link" style="color:var(--danger)" data-act="sec-del" data-id="' + s.id + '">امسح القسم</button>') +
      '<span class="grow"></span><button type="button" class="btn link" data-close>رجوع</button><button type="submit" class="btn primary">احفظ</button></div>',
      function (f) {
        var body = { titleAr: val(f, 'f-ar'), titleEn: val(f, 'f-en'), hidden: f.querySelector('#f-h').checked };
        if (!isNew) body.id = s.id;
        return after(api('POST', '/staff/menu/section', body), 'اتحفظ في المسودة').then(function (r) { if (isNew) { S.open[r.id] = true; drawMenu(); } });
      });
  }
  function groupSheet(g, sectionId) {
    var isNew = !g;
    openSheet('<h2 id="sh-t">' + (isNew ? 'مجموعة جديدة' : 'عدّل المجموعة') + '</h2><p class="sub">المجموعة عنوان صغير جوه القسم، زي "إضافات". سيبها فاضية لو مش محتاج عنوان.</p>' +
      '<label for="f-ar">العنوان بالعربي</label><input id="f-ar" type="text" maxlength="40" value="' + esc(g ? g.ar : '') + '">' +
      '<label for="f-en">العنوان بالإنجليزي</label><input id="f-en" type="text" dir="ltr" maxlength="40" value="' + esc(g ? g.label : '') + '">' +
      '<div class="actions">' + (isNew ? '' : '<button type="button" class="btn link" style="color:var(--danger)" data-act="grp-del" data-id="' + g.id + '">امسح المجموعة</button>') +
      '<span class="grow"></span><button type="button" class="btn link" data-close>رجوع</button><button type="submit" class="btn primary">احفظ</button></div>',
      function (f) {
        var body = { labelAr: val(f, 'f-ar'), labelEn: val(f, 'f-en') };
        if (isNew) body.sectionId = sectionId; else body.id = g.id;
        return after(api('POST', '/staff/menu/group', body), 'اتحفظ في المسودة');
      });
  }
  function bulkSheet() {
    openSheet('<h2 id="sh-t">غيّر الأسعار بنسبة</h2><p class="sub">التغيير بيروح المسودة، والزباين مش هيشوفوه غير لما تنشر.</p>' +
      '<label for="f-p">النسبة (%) — مثلًا 10 للزيادة أو ‎-10 للتخفيض</label><input id="f-p" type="text" inputmode="decimal" dir="ltr" required>' +
      '<label for="f-s">على</label><select id="f-s"><option value="">المنيو كله</option>' + S.data.sections.map(function (s) { return '<option value="' + s.id + '">' + esc(s.ar || s.title) + '</option>'; }).join('') + '</select>' +
      '<label for="f-r">التقريب</label><select id="f-r"><option value="5">لأقرب 5 جنيه</option><option value="1">لأقرب جنيه</option></select>' +
      '<div class="actions"><span class="grow"></span><button type="button" class="btn link" data-close>رجوع</button><button type="submit" class="btn primary">طبّق على المسودة</button></div>',
      function (f) {
        var sid = val(f, 'f-s');
        return after(api('POST', '/staff/menu/bulk-price', { percent: Number(digits(val(f, 'f-p'))), sectionId: sid ? +sid : null, roundTo: +val(f, 'f-r') }))
          .then(function (r) { toast('اتغيّر سعر ' + r.items + ' صنف في المسودة'); });
      });
  }
  function reorder(kind, parentId, list, i, dir) {
    var ids = list.map(function (x) { return x.id; }), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    after(api('POST', '/staff/menu/reorder', { kind: kind, parentId: parentId, ids: ids })).catch(function (e) { toast(errText(e)); });
  }

  // ---------- log tab ----------
  var ACTION = {
    menu_item_add: 'ضاف صنف', menu_item_edit: 'عدّل صنف', menu_item_delete: 'مسح صنف', menu_sold_out: 'علّم صنف خلص', menu_back_in_stock: 'رجّع صنف متاح',
    menu_section_add: 'ضاف قسم', menu_section_edit: 'عدّل قسم', menu_section_delete: 'مسح قسم', menu_group_add: 'ضاف مجموعة', menu_group_edit: 'عدّل مجموعة',
    menu_group_delete: 'مسح مجموعة', menu_reorder: 'غيّر الترتيب', menu_bulk_price: 'غيّر الأسعار بنسبة', menu_publish: 'نشر المنيو', menu_discard: 'لغى التعديلات'
  };
  function detail(r) {
    var d = r.detail || {}, a = d.after || {}, b = d.before || {};
    if (r.action === 'menu_item_edit') {
      var parts = [esc(b.name_en || a.name_en)];
      if (b.price !== a.price) parts.push('السعر <span class="ltr">' + esc(b.price) + ' ← ' + esc(a.price) + '</span>');
      if (b.name_en !== a.name_en) parts.push('الاسم <span class="ltr">' + esc(b.name_en) + ' ← ' + esc(a.name_en) + '</span>');
      if (!!b.hidden !== !!a.hidden) parts.push(a.hidden ? 'اتخفى' : 'بقى ظاهر');
      return parts.join(' · ');
    }
    if (d.name) return esc(d.name);
    if (a.name_en) return esc(a.name_en) + ' · <span class="ltr">' + esc(a.price) + '</span>';
    if (b.name_en) return esc(b.name_en);
    if (a.title_en || b.title_en) return esc(a.title_en || b.title_en);
    if (r.action === 'menu_bulk_price') return '<span class="ltr">' + (d.percent > 0 ? '+' : '') + esc(d.percent) + '%</span> · ' + esc(d.items) + ' صنف';
    if (r.action === 'menu_publish') return 'نسخة ' + esc(d.version) + ' · ' + esc(d.changes) + ' تعديل';
    return '';
  }
  function drawLog() {
    var v = document.getElementById('view');
    v.innerHTML = '<div class="card log"><h2>سجل التعديلات</h2><p class="sub">مين غيّر إيه وإمتى في المنيو.</p><ul id="lg"><li class="sub">بيحمّل…</li></ul></div>';
    api('GET', '/staff/menu/log').then(function (r) {
      document.getElementById('lg').innerHTML = r.items.length ? r.items.map(function (x) {
        return '<li><div><b>' + esc(x.staff || 'النظام') + '</b> ' + (ACTION[x.action] || esc(x.action)) + '</div><div>' + detail(x) + '</div><div class="when">' + esc(when(x.at)) + '</div></li>';
      }).join('') : '<li class="sub">لسه مفيش تعديلات.</li>';
    }, function (e) { document.getElementById('lg').innerHTML = '<li class="err">' + esc(errText(e)) + '</li>'; });
  }

  // ---------- staff tab (owner) ----------
  function drawUsers() {
    var v = document.getElementById('view');
    v.innerHTML = '<div class="card"><div class="row"><h2 class="grow">الموظفين</h2><button class="btn primary" data-act="u-add">ضيف موظف</button></div><div id="ul" class="sub">بيحمّل…</div></div>';
    api('GET', '/staff/users').then(function (list) {
      S.users = list;
      document.getElementById('ul').innerHTML = list.map(function (u) {
        return '<div class="item"><div class="grow"><div class="nm">' + esc(u.name) + (u.active ? '' : '<span class="tag">موقوف</span>') + (u.locked ? '<span class="tag out">مقفول مؤقتًا</span>' : '') + '</div>' +
          '<div class="en ltr">' + esc(u.username) + '</div></div><span class="chip" style="background:var(--beige);color:var(--ink)">' + ROLE[u.role] + '</span>' +
          '<button class="icon" data-act="u-edit" data-id="' + u.id + '" aria-label="عدّل ' + esc(u.name) + '">✎</button></div>';
      }).join('');
    }, function (e) { document.getElementById('ul').textContent = errText(e); });
  }
  function showPassword(title, name, pw) {
    openSheet('<h2 id="sh-t">' + title + '</h2><p>الباسورد بتاع <b>' + esc(name) + '</b>. ابعته له بنفسك. مش هيظهر تاني.</p><div class="pw" id="pw">' + esc(pw) + '</div>' +
      '<div class="actions"><button type="button" class="btn secondary" data-act="copy">انسخ الباسورد</button><span class="grow"></span><button type="submit" class="btn primary">تمام، خلصت</button></div>',
      function () { return false; });
  }
  function userAddSheet() {
    openSheet('<h2 id="sh-t">موظف جديد</h2>' +
      '<label for="f-n">الاسم</label><input id="f-n" type="text" maxlength="60" required>' +
      '<label for="f-u">اسم المستخدم (للدخول)</label><input id="f-u" type="text" dir="ltr" autocapitalize="none" maxlength="30" required>' +
      '<label for="f-r">الوظيفة</label><select id="f-r"><option value="captain">كابتن · يعلّم اللي خلص بس</option><option value="manager">مدير · المنيو كله والنشر</option><option value="owner">مالك · كل حاجة والموظفين</option></select>' +
      '<div class="actions"><span class="grow"></span><button type="button" class="btn link" data-close>رجوع</button><button type="submit" class="btn primary">ضيف الموظف</button></div>',
      function (f) {
        var name = val(f, 'f-n');
        return api('POST', '/staff/users', { name: name, username: val(f, 'f-u'), role: val(f, 'f-r') }).then(function (r) { drawUsers(); showPassword('اتضاف', name, r.password); return true; });
      });
  }
  function userEditSheet(u) {
    openSheet('<h2 id="sh-t">' + esc(u.name) + '</h2><p class="sub ltr" style="text-align:right">' + esc(u.username) + '</p>' +
      '<label for="f-r">الوظيفة</label><select id="f-r">' + ['captain', 'manager', 'owner'].map(function (r) { return '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + ROLE[r] + '</option>'; }).join('') + '</select>' +
      '<label class="check"><input id="f-a" type="checkbox"' + (u.active ? ' checked' : '') + '> الحساب شغال (لو شلتها، بيخرج من كل الأجهزة)</label>' +
      '<div class="actions"><button type="button" class="btn link" data-act="u-reset" data-id="' + u.id + '">باسورد جديد</button><span class="grow"></span>' +
      '<button type="button" class="btn link" data-close>رجوع</button><button type="submit" class="btn primary">احفظ</button></div>',
      function (f) {
        return api('POST', '/staff/users/update', { id: u.id, role: val(f, 'f-r'), active: f.querySelector('#f-a').checked }).then(function () { toast('اتحفظ'); drawUsers(); });
      });
  }

  // ---------- clicks ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act],[data-tab]'); if (!b || b.disabled) return;
    if (b.hasAttribute('data-tab')) { S.tab = b.getAttribute('data-tab'); draw(); return; }
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    switch (act) {
      case 'logout': api('POST', '/staff/logout', {}).catch(function () {}).then(function () { S.me = null; showLogin(); }); break;
      case 'toggle': S.open[id] = !S.open[id]; drawMenu(); break;
      case 'sold': {
        var it = find('i', id).it, next = !it.soldOut; busy(b, true);
        api('POST', '/staff/menu/soldout', { id: it.id, soldOut: next }).then(function () {
          it.soldOut = next; drawMenu(); toast(next ? 'اتعلّم خلص · ظاهر للزباين دلوقتي' : 'رجع متاح · ظاهر للزباين دلوقتي');
        }, function (er) { busy(b, false); toast(errText(er)); });
        break;
      }
      case 'it-edit': itemSheet(find('i', id).it); break;
      case 'it-add': itemSheet(null, +b.getAttribute('data-g')); break;
      case 'it-up': { var g = find('g', b.getAttribute('data-g')).g; reorder('item', g.id, g.items, +b.getAttribute('data-i'), -1); break; }
      case 'it-del': {
        var x = find('i', id).it;
        confirmSheet('تمسح الصنف؟', 'هيتمسح <b>' + esc(x.ar || x.name) + '</b> من المسودة. لو غيّرت رأيك قبل النشر، دوس "إلغاء التعديلات".', 'امسح الصنف',
          function () { return after(api('POST', '/staff/menu/item/delete', { id: x.id }), 'اتمسح من المسودة'); });
        break;
      }
      case 'sec-add': sectionSheet(null); break;
      case 'sec-edit': sectionSheet(find('s', id)); break;
      case 'sec-up': case 'sec-down': reorder('section', null, S.data.sections, +b.getAttribute('data-i'), act === 'sec-up' ? -1 : 1); break;
      case 'sec-del': {
        var s = find('s', id);
        confirmSheet('تمسح القسم؟', 'هيتمسح قسم <b>' + esc(s.ar || s.title) + '</b>. لازم يكون فاضي من الأصناف.', 'امسح القسم',
          function () { return after(api('POST', '/staff/menu/section/delete', { id: s.id }), 'اتمسح من المسودة'); });
        break;
      }
      case 'grp-add': groupSheet(null, +id); break;
      case 'grp-edit': groupSheet(find('g', id).g); break;
      case 'grp-del': {
        var gg = find('g', id).g;
        confirmSheet('تمسح المجموعة؟', 'لازم تكون فاضية من الأصناف.', 'امسح المجموعة',
          function () { return after(api('POST', '/staff/menu/group/delete', { id: gg.id }), 'اتمسحت من المسودة'); });
        break;
      }
      case 'bulk': bulkSheet(); break;
      case 'publish': busy(b, true);
        after(api('POST', '/staff/menu/publish', {}), 'اتنشر · الزباين شايفين المنيو الجديد').catch(function (er) { busy(b, false); toast(errText(er)); });
        break;
      case 'discard':
        confirmSheet('تلغي كل التعديلات؟', 'المسودة هترجع زي المنيو المنشور بالظبط. ' + S.data.changes.length + ' تعديل هيضيع. ده مش بيلمس الأصناف اللي متعلّمة خلص.', 'الغِ التعديلات',
          function () { return after(api('POST', '/staff/menu/discard', {}), 'اترجعت للمنيو المنشور'); });
        break;
      case 'u-add': userAddSheet(); break;
      case 'u-edit': userEditSheet(S.users.filter(function (u) { return u.id === +id; })[0]); break;
      case 'u-reset': {
        var u = S.users.filter(function (x) { return x.id === +id; })[0];
        confirmSheet('باسورد جديد؟', 'الباسورد القديم بتاع <b>' + esc(u.name) + '</b> هيبطل، وهيخرج من كل الأجهزة.', 'اعمل باسورد جديد',
          function () { return api('POST', '/staff/users/reset', { id: u.id }).then(function (r) { showPassword('باسورد جديد', u.name, r.password); return true; }); });
        break;
      }
      case 'copy': {
        var pw = document.getElementById('pw').textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(pw) : Promise.reject()).then(function () { toast('اتنسخ'); }, function () {
          var r = document.createRange(); r.selectNodeContents(document.getElementById('pw')); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('اختار الباسورد وانسخه');
        });
        break;
      }
    }
  });
  // keep the sold-out list fresh when several staff phones are open
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.me && S.tab === 'menu' && sheet.hidden) loadMenu().catch(function () {}); });

  fetch('/api/staff/me', { credentials: 'same-origin' }).then(function (r) { if (r.ok) boot(); else showLogin(); }, function () { showLogin('مفيش اتصال. جرّب تاني.'); });
})();
