/* Moved out of captain-ly9fglcp.html so the CSP can forbid inline scripts. */
function startApp() {
(function () {
  'use strict';

  var WARM = 2 * 60 * 1000, HOT = 5 * 60 * 1000;
  var DAY_START = 6;              // the business day starts at 6 AM
  var LOG_DELAY = 2 * 60 * 1000;  // a handled request is saved to the sheet after this (so "رجّعها" can cancel it)
  var PAY = { cash: 'كاش', card: 'كارت', instapay: 'InstaPay' };
  var QUICK = { water: 'مياه', napkins: 'مناديل', clean: 'تنضيف الترابيزة' };

  var pending = {};   // table -> [{rid, time, kind, detail}]
  var taken = [];     // recent handled groups, newest first: {table, at, items}
  var log = [];       // every handled request seen: {rid, table, kind, detail, req, done}
  var fresh = {}, busy = {};
  var main = document.getElementById('main');
  var statusEl = document.getElementById('status');
  var banner = document.getElementById('banner');
  var audio = null, armed = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clock(t) { var d = new Date(t), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' ص' : ' م'); }
  function hourLabel(h) { return (h % 12 || 12) + (h < 12 ? ' ص' : ' م'); }
  function since(t) {
    var m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'دلوقتي';
    if (m === 1) return 'من دقيقة';
    if (m === 2) return 'من دقيقتين';
    if (m <= 10) return 'من ' + m + ' دقايق';
    return 'من ' + m + ' دقيقة';
  }
  function dur(ms) {
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' ثانية';
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + String(r).padStart(2, '0') + ' دقيقة';
  }
  function first(items) { return items.reduce(function (a, c) { return Math.min(a, c.time); }, Infinity); }
  function what(it) {
    if (it.kind === 'call') return 'عايزين يطلبوا';
    if (it.kind === 'bill') return 'الحساب · ' + (PAY[it.detail] || it.detail || '');
    return QUICK[it.detail] || it.detail || 'طلب';
  }
  function dayStart(now) {
    var d = new Date(now); d.setHours(DAY_START, 0, 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  // ---- state from messages ----
  var KINDS = { call: 1, bill: 1, req: 1 };
  function apply(msg, meta) {
    var t = String(msg.table || '').replace(/\D/g, '');
    if (!t) return false;
    if (KINDS[msg.type]) {
      var list = pending[t] || (pending[t] = []), rid = msg.rid || meta.id;
      if (log.some(function (l) { return l.rid === rid; })) return false;
      if (!list.some(function (c) { return c.rid === rid; })) {
        list.push({ rid: rid, time: meta.time, kind: msg.type, detail: msg.type === 'bill' ? msg.pay : msg.type === 'req' ? msg.item : '' });
      }
      if (!meta.replay) fresh[t] = 1;
      return true;
    }
    if (msg.type === 'took' && pending[t]) {
      var rids = msg.rids || [];
      var gone = pending[t].filter(function (c) { return rids.indexOf(c.rid) > -1; });
      pending[t] = pending[t].filter(function (c) { return rids.indexOf(c.rid) < 0; });
      if (!pending[t].length) delete pending[t];
      delete busy[t];
      if (gone.length) {
        taken.unshift({ table: t, at: meta.time, items: gone }); taken = taken.slice(0, 8);
        gone.forEach(function (c) { log.push({ rid: c.rid, table: t, kind: c.kind, detail: c.detail, req: c.time, done: meta.time }); });
      }
      return false;
    }
    if (msg.type === 'undo') {
      var back = msg.calls || [];
      var ids = back.map(function (b) { return b.rid; });
      taken = taken.filter(function (d) { return !(d.table === t && d.items.some(function (c) { return ids.indexOf(c.rid) > -1; })); });
      log = log.filter(function (l) { return ids.indexOf(l.rid) < 0; });
      unqueue(ids);
      var l = pending[t] || (pending[t] = []);
      back.forEach(function (b) { if (!l.some(function (c) { return c.rid === b.rid; })) l.push({ rid: b.rid, time: b.time, kind: b.kind || 'call', detail: b.detail || '' }); });
      if (!l.length) delete pending[t];
      return false;
    }
    return false;
  }

  // ---- today's summary ----
  function summary() {
    var start = dayStart(Date.now());
    var today = log.filter(function (l) { return l.req >= start; });
    var waits = today.map(function (l) { return l.done - l.req; });
    var byHour = {};
    today.forEach(function (l) { var h = new Date(l.req).getHours(); byHour[h] = (byHour[h] || 0) + 1; });
    var peak = Object.keys(byHour).sort(function (a, b) { return byHour[b] - byHour[a]; })[0];
    return {
      calls: today.filter(function (l) { return l.kind === 'call'; }).length,
      bills: today.filter(function (l) { return l.kind === 'bill'; }).length,
      reqs: today.filter(function (l) { return l.kind === 'req'; }).length,
      avg: waits.length ? waits.reduce(function (a, b) { return a + b; }, 0) / waits.length : null,
      max: waits.length ? Math.max.apply(null, waits) : null,
      peak: peak == null ? null : +peak, peakN: peak == null ? 0 : byHour[peak],
      oldest: log.length ? Math.min.apply(null, log.map(function (l) { return l.req; })) : null,
      start: start
    };
  }

  // ---- view ----
  function takeLabel(items) {
    var kinds = {}; items.forEach(function (c) { kinds[c.kind] = 1; });
    var k = Object.keys(kinds);
    if (k.length > 1) return 'تمام، خلصت الكل';
    if (k[0] === 'call') return 'تمام، خدت الأوردر';
    if (k[0] === 'bill') return 'تمام، وصّلت الحساب';
    return 'تمام، اتنفّذ';
  }
  function ageClass(f) { var a = Date.now() - f; return a >= HOT ? ' hot' : a >= WARM ? ' warm' : ''; }

  function render() {
    var tables = Object.keys(pending).sort(function (a, b) { return first(pending[a]) - first(pending[b]); });
    var html = '';
    if (tables.length) {
      html += '<div class="count"><span class="num">' + tables.length + '</span><span>' + (tables.length === 1 ? 'ترابيزة مستنية' : 'ترابيزات مستنية') + '</span></div>';
      html += '<div class="grid">' + tables.map(function (t) {
        var items = pending[t].slice().sort(function (a, b) { return a.time - b.time; }), f = first(items);
        var hasBill = items.some(function (c) { return c.kind === 'bill'; });
        var cls = 'card' + ageClass(f) + (fresh[t] ? ' fresh' : '') + (hasBill ? ' bill' : '');
        var lines = items.map(function (c) {
          return '<li class="k-' + c.kind + '"><span>' + esc(what(c)) + '</span><small>' + since(c.time) + '</small></li>';
        }).join('');
        return '<div class="' + cls + '">' +
          (hasBill ? '<span class="badge">الحساب</span>' : '') +
          '<span class="lbl">ترابيزة</span>' +
          '<span class="tn num">' + esc(t) + '</span>' +
          '<span class="since">مستنية ' + since(f) + ' · ' + clock(f) + '</span>' +
          '<ul class="needs">' + lines + '</ul>' +
          '<button class="press take" type="button" data-take="' + esc(t) + '"' + (busy[t] ? ' disabled' : '') + '>✓ ' + takeLabel(items) + '</button>' +
        '</div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="empty"><img src="assets/mascot-cassette-v3.webp" alt=""><b>مفيش ترابيزات مستنية دلوقتي</b><span>أول ما ترابيزة تنادي أو تطلب الحساب هتظهر هنا</span></div>';
    }
    if (taken.length) {
      html += '<section class="done"><h3>اتعمل من شوية</h3><div class="dlist">' + taken.map(function (d, i) {
        return '<div class="ditem"><span>ترابيزة</span><span class="num">' + esc(d.table) + '</span><small>' + esc(d.items.map(what).join(' + ')) + ' · ' + clock(d.at) + '</small>' +
          '<button class="press undo" type="button" data-undo="' + i + '">رجّعها</button></div>';
      }).join('') + '</div></section>';
    }
    var s = summary();
    var partial = (Date.now() - s.start) > 12 * 3600 * 1000;
    html += '<section class="sum"><h3>ملخص النهارده <small>من ' + hourLabel(DAY_START) + '</small></h3><div class="stats">' +
      stat(s.calls, 'نداء للطلب') + stat(s.bills, 'طلب حساب') + stat(s.reqs, 'طلب سريع') +
      stat(s.avg == null ? '—' : dur(s.avg), 'متوسط الاستجابة', true) +
      stat(s.max == null ? '—' : dur(s.max), 'أطول انتظار', true) +
      stat(s.peak == null ? '—' : hourLabel(s.peak), 'أكتر ساعة زحمة' + (s.peakN ? ' (' + s.peakN + ')' : ''), true) +
      '</div><p class="sumnote">' + (partial ? 'الشاشة دي بتشوف آخر ١٢ ساعة بس، فالأرقام دي ناقصة أول اليوم. الأرقام الكاملة في شيت التقارير. ' : '') + saveNote() + '</p></section>';
    main.innerHTML = html;
    fresh = {};
    document.title = (tables.length ? '(' + tables.length + ') ' : '') + 'Sequoia — الكابتن';
  }
  function stat(v, l, small) { return '<div class="stat"><b class="' + (small ? 'sm' : 'num') + '">' + esc(v) + '</b><span>' + esc(l) + '</span></div>'; }

  // ---- saving handled requests to the report sheet (only from the iPad that tapped "تمام") ----
  var REPORT_URL = window.SequoiaOrders && SequoiaOrders.reportUrl;
  function outbox() { try { return JSON.parse(localStorage.getItem('sq-outbox')) || []; } catch (_) { return []; } }
  function setOutbox(o) { try { localStorage.setItem('sq-outbox', JSON.stringify(o)); } catch (_) {} }
  function lastSaved() { try { return +localStorage.getItem('sq-saved-at') || 0; } catch (_) { return 0; } }
  function queue(t, items, at) {
    var o = outbox();
    items.forEach(function (c) {
      o.push({ due: at + LOG_DELAY, row: { rid: c.rid, table: t, kind: c.kind, detail: c.detail || '', requested: new Date(c.time).toISOString(), handled: new Date(at).toISOString(), wait_seconds: Math.round((at - c.time) / 1000) } });
    });
    setOutbox(o);
  }
  function unqueue(ids) { setOutbox(outbox().filter(function (x) { return ids.indexOf(x.row.rid) < 0; })); }
  var flushing = false;
  function flush() {
    if (!REPORT_URL || flushing) return;
    var o = outbox(), now = Date.now(), ready = o.filter(function (x) { return x.due <= now; });
    if (!ready.length) return;
    flushing = true;
    fetch(REPORT_URL, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' }, body: JSON.stringify({ rows: ready.map(function (x) { return x.row; }) }) })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var ids = ready.map(function (x) { return x.row.rid; });
        setOutbox(outbox().filter(function (x) { return ids.indexOf(x.row.rid) < 0; }));
        try { localStorage.setItem('sq-saved-at', String(Date.now())); } catch (_) {}
      })
      .catch(function () {})
      .then(function () { flushing = false; });
  }
  function saveNote() {
    if (!REPORT_URL) return 'شيت التقارير لسه ما اتربطش.';
    var waiting = outbox().length, t = lastSaved();
    return (t ? 'آخر حفظ في الشيت ' + clock(t) + '.' : 'متربط بشيت التقارير.') + (waiting ? ' ' + waiting + ' طلب مستني يتحفظ.' : '');
  }

  // ---- sound + keep screen on ----
  function chime() {
    if (!audio) return;
    try {
      var now = audio.currentTime;
      [[880, 0], [1320, 0.18], [880, 0.5], [1320, 0.68]].forEach(function (n) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, now + n[1]);
        g.gain.exponentialRampToValueAtTime(0.5, now + n[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + 0.32);
        o.connect(g); g.connect(audio.destination);
        o.start(now + n[1]); o.stop(now + n[1] + 0.35);
      });
    } catch (_) {}
  }
  function keepAwake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').catch(function () {});
  }
  function arm() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !audio) audio = new AC();
      if (audio && audio.state === 'suspended') audio.resume();
    } catch (_) {}
    keepAwake();
    armed = true;
    banner.hidden = true;
  }
  banner.addEventListener('click', function () { arm(); chime(); });
  document.getElementById('sound').addEventListener('click', function () { arm(); chime(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { if (armed) keepAwake(); flush(); } });

  function toast(text) {
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'alert'); el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  // ---- actions ----
  main.addEventListener('click', function (e) {
    var b = e.target.closest('[data-take]');
    if (b) {
      var t = b.getAttribute('data-take'), items = (pending[t] || []).slice();
      if (!items.length) return;
      b.disabled = true; busy[t] = 1;
      var at = Date.now();
      SequoiaOrders.publish({ type: 'took', table: t, rids: items.map(function (c) { return c.rid; }) })
        .then(function () { queue(t, items, at); })
        .catch(function () { delete busy[t]; b.disabled = false; toast('النت فيه مشكلة، جرّب تاني'); });
      return;
    }
    var u = e.target.closest('[data-undo]');
    if (u) {
      var d = taken[+u.getAttribute('data-undo')];
      if (!d) return;
      u.disabled = true;
      SequoiaOrders.publish({ type: 'undo', table: d.table, calls: d.items })
        .catch(function () { u.disabled = false; toast('النت فيه مشكلة، جرّب تاني'); });
    }
  });

  // ---- live connection ----
  var queued = false;
  function soon() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; render(); }); } }
  SequoiaOrders.subscribe(function (msg, meta) {
    var isNew = apply(msg, meta);
    if (isNew && !meta.replay) chime();
    soon();
  }, function (s) {
    statusEl.className = 'status' + (s === 'live' ? ' live' : '');
    statusEl.querySelector('span').textContent = s === 'live' ? 'متصل' : 'بيحاول يتصل…';
  });

  var lastNag = 0;
  setInterval(function () {
    flush();
    render();
    var late = Object.keys(pending).some(function (t) { return Date.now() - first(pending[t]) >= HOT; });
    if (late && Date.now() - lastNag > 120000) { lastNag = Date.now(); chime(); }
  }, 15000);

  render();
  flush();
})();
}

// ---- Tabs: table calls (unchanged) | Sequoia Card (loaded on first open) ----
(function () {
  var tabs = { orders: document.getElementById('t-orders'), card: document.getElementById('t-card') };
  var panes = { orders: document.getElementById('p-orders'), card: document.getElementById('p-card') };
  var loaded = false;
  function show(k) {
    Object.keys(tabs).forEach(function (n) { tabs[n].setAttribute('aria-selected', String(n === k)); panes[n].hidden = n !== k; });
    if (k === 'card' && !loaded) {
      loaded = true;
      var sc = document.createElement('script'); sc.src = 'assets/captain-card.js';
      sc.onload = function () { SequoiaCaptainCard.mount(panes.card); };
      sc.onerror = function () { loaded = false; panes.card.textContent = 'مقدرناش نفتح كارت سيكويا. جرّب تاني.'; };
      document.head.appendChild(sc);
    }
  }
  tabs.orders.addEventListener('click', function () { show('orders'); });
  tabs.card.addEventListener('click', function () { show('card'); });
})();

// ---- Staff login gate: server-side session (sq_staff cookie, 12 h). The calls stream itself needs it. ----
(function () {
  var gate = document.getElementById('gate'), form = document.getElementById('gform'), user = document.getElementById('gu'), pin = document.getElementById('pin'), err = document.getElementById('gerr');
  var started = false;
  try { localStorage.removeItem('sq-captain'); } catch (_) {} // old client-side PIN flag, no longer used
  function begin() { gate.hidden = true; if (!started) { started = true; startApp(); } }
  function ask(msg) { err.textContent = msg || ''; gate.hidden = false; (user.value ? pin : user).focus(); }
  window.SequoiaOrders.onLoggedOut = function () { location.reload(); };
  fetch('/api/staff/me', { credentials: 'same-origin' }).then(function (r) { if (r.ok) begin(); else ask(); }, function () { ask('مفيش اتصال. جرّب تاني.'); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button'); btn.disabled = true; err.textContent = '';
    fetch('/api/staff/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' },
      body: JSON.stringify({ username: user.value.trim(), password: pin.value })
    }).then(function (r) {
      btn.disabled = false;
      if (r.ok) { pin.value = ''; return begin(); }
      pin.value = ''; pin.setAttribute('aria-invalid', 'true');
      ask(r.status === 429 ? 'محاولات كتير. استنى ربع ساعة.' : 'اسم المستخدم أو كلمة السر غلط.');
    }, function () { btn.disabled = false; ask('مفيش اتصال. جرّب تاني.'); });
  });
})();
