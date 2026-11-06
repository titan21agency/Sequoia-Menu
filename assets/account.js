/*
 * Sequoia Card — customer side (حسابي). Loaded only when the account icon is tapped,
 * so it never slows the menu or the Ready-to-order flow.
 * Read-only: the customer can see their card; only staff can stamp or redeem.
 */
(function () {
  'use strict';
  var API = '/api';
  var host, sheet, es = null, state = { view: 'loading', phone: '', card: null, err: '', resendAt: 0, wa: null }, table = '', tick = null;
  var loginOpts = null, poll = null; // loginOpts.whatsapp: server accepts "send SEQ-code from WhatsApp" login

  var AR = '٠١٢٣٤٥٦٧٨٩';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function date(t) { var d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1); }
  function call(method, path, body) {
    return fetch(API + path, {
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' } : { 'X-Requested-With': 'sequoia' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); });
  }
  var MSG = {
    phone: 'اكتب رقم موبايل مصري صح (01xxxxxxxxx).',
    code: 'الكود مش صح أو خلص وقته. جرّب تاني أو اطلب كود جديد.',
    rate: 'محاولات كتير. استنى شوية وجرّب تاني.',
    wait: 'استنى شوية قبل ما تطلب كود جديد.',
    send: 'مقدرناش نبعت الكود دلوقتي. جرّب كمان شوية.',
    net: 'مفيش اتصال. اتأكد من النت وجرّب تاني.'
  };
  var ICON_X = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var ICON_BACK = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_CUP = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5c0 1.2 1 1.3 1 2.5M12 3.5c0 1.2 1 1.3 1 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function progress(c) {
    return '<div class="lc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + c.required + '" aria-valuenow="' + c.count + '"><i style="width:' + (100 * c.count / c.required) + '%"></i></div>';
  }

  function body() {
    var s = state, c = s.card;
    if (s.view === 'loading') return '<p class="lc-muted" style="margin-top:28px">لحظة…</p>';
    if (s.view === 'wa') {
      return '<span class="pill">سيكويا كارد</span>' +
        '<h2 id="sheet-title">ادخل من واتساب</h2>' +
        '<p class="lc-muted">ابعت الرسالة دي لسيكويا على واتساب من رقمك، وهتدخل هنا لوحدك.</p>' +
        '<p class="lc-in" dir="ltr" style="text-align:center;font-weight:700;letter-spacing:.08em">' + esc(s.wa.code) + '</p>' +
        '<a class="press btn-primary" style="display:block;text-align:center;text-decoration:none" href="' + esc(s.wa.wa) + '" target="_blank" rel="noopener">افتح واتساب وابعت</a>' +
        '<div class="msg" role="alert">' + esc(s.err) + '</div>' +
        '<p class="lc-muted" aria-live="polite">مستنيين رسالتك…</p>' +
        '<button class="press linkbtn" data-edit>ادخل برقم الموبايل بدل كده</button>';
    }
    if (s.view === 'phone' || s.view === 'code') {
      var codeStep = s.view === 'code';
      var wait = Math.max(0, Math.ceil((s.resendAt - Date.now()) / 1000));
      return '<span class="pill">سيكويا كارد</span>' +
        '<h2 id="sheet-title">حسابي</h2>' +
        '<p class="lc-muted">' + (codeStep ? 'بعتنالك كود من ٦ أرقام على واتساب <span dir="ltr">' + esc(s.phone) + '</span>' : 'سجّل برقمك واجمع أختام مع كل زيارة.') + '</p>' +
        (!codeStep && loginOpts && loginOpts.whatsapp ? '<button class="press btn-primary" data-wa>ادخل برسالة واتساب</button><p class="lc-muted" style="text-align:center">أو</p>' : '') +
        '<form class="lc-form" data-form="' + s.view + '" novalidate>' +
          (codeStep
            ? '<label class="tlabel" for="lc-in">الكود</label><input id="lc-in" class="lc-in" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="••••••">'
            : '<label class="tlabel" for="lc-in">رقم الموبايل</label><input id="lc-in" class="lc-in" dir="ltr" type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="01xxxxxxxxx" value="' + esc(s.phone) + '">') +
          '<div class="msg" role="alert">' + esc(s.err) + '</div>' +
          '<button class="press btn-primary" type="submit">' + (codeStep ? 'دخول' : 'ابعتلي كود على واتساب') + '</button>' +
        '</form>' +
        (codeStep ? '<button class="press linkbtn" data-resend' + (wait ? ' disabled' : '') + '>' + (wait ? 'تقدر تطلب كود جديد بعد <span dir="ltr" id="lc-wait">' + wait + '</span> ث' : 'ابعت كود جديد') + '</button>' +
          '<button class="press linkbtn" data-edit>غيّر الرقم</button>' : '');
    }
    if (s.view === 'account') {
      return '<span class="pill">سيكويا كارد</span>' +
        '<h2 id="sheet-title">حسابي</h2>' +
        '<p class="lc-muted" dir="ltr" style="font-size:20px">' + esc(s.phone) + '</p>' +
        '<button class="press lc-entry" data-card>' +
          '<img src="assets/tree-navy.png" alt="" width="30" height="34">' +
          '<span class="lc-entry-t"><b>سيكويا كارد</b><span>' + (c.complete ? 'مكافأتك جاهزة!' : 'عندك ' + c.count + ' من ' + c.required + ' أختام') + '</span>' + progress(c) + '</span>' +
          '<span class="flip">' + ICON_BACK + '</span></button>' +
        '<div class="lc-stat"><span>مكافآت خدتها</span><b>' + c.rewards + '</b></div>' +
        '<button class="press linkbtn" data-logout>تسجيل خروج</button>';
    }
    if (s.view === 'card') {
      var slots = '';
      for (var i = 0; i < c.required; i++) {
        var at = c.slots[i];
        slots += '<div class="lc-slot' + (at ? ' on' : '') + '">' + (at ? ICON_CUP + '<small dir="ltr">' + date(at) + '</small>' : '<span>' + (i + 1) + '</span>') + '</div>';
      }
      return '<button class="press lc-back" data-account aria-label="رجوع لحسابي">' + ICON_BACK + '<span>حسابي</span></button>' +
        '<img src="assets/tree-navy.png" alt="Sequoia" width="38" height="44" style="margin-top:4px">' +
        '<h2 id="sheet-title">سيكويا كارد</h2>' +
        '<p class="lc-muted">اجمع ' + c.required + ' أختام و' + esc(c.rewardName) + '</p>' +
        '<div class="lc-grid">' + slots + '</div>' + progress(c) +
        (c.complete
          ? '<div class="lc-ready" role="status"><b>مكافأتك جاهزة 🎉</b><span>اعرض الشاشة دي على الكابتن</span></div>'
          : '<p class="lc-left">فاضلك <b>' + c.remaining + '</b> ' + (c.remaining === 1 ? 'زيارة' : 'زيارات') + '</p>') +
        '<p class="lc-muted" style="font-size:13px">الختم بيتعمل من الكابتن بعد الدفع.</p>';
    }
    return '';
  }

  function paint() {
    clearInterval(tick); tick = null;
    sheet.innerHTML = '<div class="scrim" data-close></div>' +
      '<div class="panel lc" dir="rtl" lang="ar" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
      '<div class="grab" aria-hidden="true"></div>' +
      '<button class="press x" data-close aria-label="إغلاق">' + ICON_X + '</button>' + body() + '</div>';
    var inp = sheet.querySelector('#lc-in'); if (inp) inp.focus();
    if (state.view === 'code' && state.resendAt > Date.now()) tick = setInterval(function () {
      var w = sheet.querySelector('#lc-wait'), left = Math.ceil((state.resendAt - Date.now()) / 1000);
      if (left <= 0) paint(); else if (w) w.textContent = left;
    }, 1000);
  }

  function live(on) {
    if (es) { es.close(); es = null; }
    if (on && window.EventSource) {
      es = new EventSource(API + '/me/stream');
      es.addEventListener('card', function (e) {
        try { state.card = JSON.parse(e.data); } catch (_) { return; }
        if (state.view === 'card' || state.view === 'account') paint();
      });
    }
  }

  function loadMe(view) {
    stopPoll();
    var sig = /[?&]s=([A-Za-z0-9_-]{12})(?:&|$)/.exec(location.search);
    return call('GET', '/me' + (table ? '?table=' + encodeURIComponent(table) + (sig ? '&s=' + sig[1] : '') : '')).then(function (j) {
      if (j.status === 200) { state.phone = j.phone; state.card = j.card; state.view = view || 'account'; live(true); return paint(); }
      state.view = 'phone'; live(false);
      if (loginOpts) return paint();
      return call('GET', '/login/options').then(function (o) { loginOpts = o.status === 200 ? o : { otp: true }; paint(); }, function () { loginOpts = null; paint(); });
    }, function () { state.view = 'phone'; state.err = MSG.net; paint(); });
  }

  // Option B: show "SEQ-123456", customer sends it to the café on WhatsApp, we poll until the server saw it.
  function stopPoll() { clearInterval(poll); poll = null; }
  function startWhatsApp() {
    state.err = '';
    call('POST', '/otp/inbound/start', {}).then(function (j) {
      if (j.status !== 200) { state.err = MSG[j.error] || MSG.send; return paint(); }
      state.wa = j; state.view = 'wa'; paint();
      stopPoll();
      poll = setInterval(function () {
        call('GET', '/otp/inbound/status').then(function (s) {
          if (state.view !== 'wa') return stopPoll();
          if (s.status === 200 && s.ok) return loadMe('card');
          if (s.status === 410) { stopPoll(); state.view = 'phone'; state.err = MSG.code; paint(); }
        }, function () {});
      }, 2000);
    }, function () { state.err = MSG.net; paint(); });
  }

  function onSubmit(e) {
    e.preventDefault();
    var form = e.target, v = (form.querySelector('#lc-in').value || '').replace(/[٠-٩]/g, function (d) { return AR.indexOf(d); }).trim(), btn = form.querySelector('button');
    btn.disabled = true; state.err = '';
    if (form.getAttribute('data-form') === 'phone') {
      if (!/^(\+?20|0020)?0?1[0125]\d{8}$/.test(v.replace(/[\s-]/g, ''))) { state.err = MSG.phone; return paint(); }
      state.phone = v.replace(/[\s-]/g, '');
      requestCode();
    } else {
      if (!/^\d{6}$/.test(v)) { state.err = MSG.code; return paint(); }
      call('POST', '/otp/verify', { phone: state.phone, code: v }).then(function (j) {
        if (j.status === 200) return loadMe('card');
        state.err = MSG[j.error] || MSG.code; paint();
      }, function () { state.err = MSG.net; paint(); });
    }
  }
  function requestCode() {
    call('POST', '/otp/request', { phone: state.phone }).then(function (j) {
      if (j.status === 200) { state.view = 'code'; state.resendAt = Date.now() + (j.resendIn || 60) * 1000; }
      else { if (j.retryIn) { state.view = 'code'; state.resendAt = Date.now() + j.retryIn * 1000; } state.err = MSG[j.error] || MSG.send; }
      paint();
    }, function () { state.err = MSG.net; paint(); });
  }

  function close() { sheet.hidden = true; clearInterval(tick); stopPoll(); live(false); }

  function open(container, opts) {
    host = container; table = (opts && opts.table) || '';
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'sheet';
      sheet.addEventListener('click', function (e) {
        var t = e.target;
        if (t.closest('[data-close]')) close();
        else if (t.closest('[data-card]')) { state.view = 'card'; paint(); }
        else if (t.closest('[data-account]')) { state.view = 'account'; paint(); }
        else if (t.closest('[data-edit]')) { stopPoll(); state.view = 'phone'; state.err = ''; paint(); }
        else if (t.closest('[data-wa]')) startWhatsApp();
        else if (t.closest('[data-resend]')) requestCode();
        else if (t.closest('[data-logout]')) call('POST', '/me/logout', {}).then(function () { live(false); state = { view: 'phone', phone: '', card: null, err: '', resendAt: 0 }; paint(); });
      });
      sheet.addEventListener('submit', onSubmit);
      sheet.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }
    if (!sheet.isConnected || sheet.parentNode !== host) host.appendChild(sheet);
    sheet.hidden = false; state.view = state.card ? state.view : 'loading'; state.err = '';
    paint(); loadMe(state.view === 'card' ? 'card' : null);
  }

  function reattach(container) { if (sheet && !sheet.hidden) { host = container; container.appendChild(sheet); } }
  window.SequoiaAccount = { open: open, close: close, reattach: reattach };
})();
