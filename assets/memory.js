/*
 * كنت هنا — a customer saves a memory of their visit and gets it back as a story design (1080×1920).
 * Two parts: the memory card (what happened + picks for the next journal issue) and their photo.
 * Loaded only when "كنت هنا" is tapped (assets/landing.js) or the page opens on #kont-hena.
 * Needs the Sequoia Card login (same OTP endpoints as assets/account.js). The story is drawn on the phone.
 * The customer's original photo is never uploaded; only the finished story design is, and only if they agree.
 */
(function () {
  'use strict';
  var API = '/api';
  var CFG = window.SEQUOIA_CONFIG || {};
  var AR = '٠١٢٣٤٥٦٧٨٩';
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var SKY = [
    ['honey', '#EBCB8B', 'عسل العصر'], ['gold', '#DDA15E', 'دهب الساعة الدهبية'], ['sunset', '#C8694A', 'برتقاني الغروب'],
    ['rose', '#B5607A', 'وردي طلخا'], ['blue', '#5C5C8E', 'بنفسجي الساعة الزرقا'], ['night', '#1F2A44', 'كحلي الليل'], ['cloud', '#A9AEB8', 'رمادي غيم']
  ];
  var MSG = {
    phone: 'اكتب رقم موبايل مصري صح (01xxxxxxxxx).', code: 'الكود مش صح أو خلص وقته. جرّب تاني.',
    rate: 'محاولات كتير. استنى شوية وجرّب تاني.', wait: 'استنى شوية قبل ما تطلب كود جديد.',
    send: 'مقدرناش نبعت الكود دلوقتي. جرّب كمان شوية.', net: 'مفيش اتصال. اتأكد من النت وجرّب تاني.',
    empty: 'اكتب حاجة واحدة على الأقل في الكارت.', consent: 'علشان نحتفظ بصورتك لازم توافق تحت.',
    photo: 'الصورة دي مش مناسبة. جرّب صورة تانية.', size: 'الصورة كبيرة قوي. جرّب صورة تانية.', save: 'مقدرناش نحفظ الذكرى. جرّب تاني.'
  };

  var root = null, state = null;
  function fresh() {
    var d = new Date();
    return { view: 'loading', phone: '', err: '', resendAt: 0, busy: false,
      f: { visit_date: ar(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + ar(d.getFullYear()), with_whom: '', drink: '', song: '', sky: '', quote: '',
           rec_book: '', rec_film: '', rec_song: '', story: '', consent: false },
      photo: null, story: null, storyBlob: null, list: [], saved: null };
  }

  function ar(n) { return String(n).replace(/\d/g, function (d) { return AR[d]; }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function call(method, path, body) {
    return fetch(API + path, {
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' } : { 'X-Requested-With': 'sequoia' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); });
  }
  function handle() { var m = /instagram\.com\/([A-Za-z0-9_.]+)/.exec(CFG.INSTAGRAM_URL || ''); return m ? '@' + m[1] : '@sequoiacafe.eg'; }
  function skyOf(k) { for (var i = 0; i < SKY.length; i++) if (SKY[i][0] === k) return SKY[i]; return null; }

  // ---------------- styles (scoped to .mem) ----------------
  var CSS = '' +
    '.mem{position:fixed;inset:0;z-index:60;background:#F4EEE2;color:#1F2A44;overflow:auto;-webkit-overflow-scrolling:touch;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif}' +
    '.mem *{box-sizing:border-box}' +
    '.mem-in{max-width:560px;margin:0 auto;padding:max(14px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) calc(28px + env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left))}' +
    '.mem-top{display:flex;align-items:center;justify-content:space-between;gap:10px}' +
    '.mem-top .brand{display:flex;align-items:center;gap:8px;font-family:"Libre Bodoni",serif;font-style:italic;font-size:15px}' +
    '.mem-x{width:40px;height:40px;border-radius:50%;border:0;background:#1F2A44;color:#F4EEE2;display:grid;place-items:center;cursor:pointer}' +
    '.mem h2{font-size:34px;line-height:1.15;margin:18px 0 4px;font-weight:700}' +
    '.mem .sub{color:#4A5470;margin:0 0 16px;font-size:15px;line-height:1.6}' +
    '.mem-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 18px}' +
    '.mem-steps button{border:0;border-radius:999px;padding:8px 4px;font:inherit;font-size:13px;font-weight:700;background:#E6DCC8;color:#4A5470;cursor:pointer}' +
    '.mem-steps button[aria-current="step"]{background:#1F2A44;color:#F4EEE2}' +
    '.mem-steps button:disabled{opacity:.45;cursor:default}' +
    '.mem-card{background:#EFE6D3;border:1.5px dashed #1F2A44;border-radius:6px;padding:16px;position:relative}' +
    '.mem-card .sc{position:absolute;top:-11px;left:18px;background:#F4EEE2;padding:0 6px;font-size:14px}' +
    '.mem .l{display:block;font-size:12.5px;color:#4A5470;font-weight:600;margin-top:12px}' +
    '.mem input[type=text],.mem textarea,.mem input[type=tel]{width:100%;font:inherit;font-size:17px;color:#1F2A44;background:transparent;border:0;border-bottom:1.5px solid #1F2A44;padding:5px 2px;border-radius:0;resize:vertical}' +
    '.mem textarea{min-height:64px}' +
    '.mem input:focus-visible,.mem textarea:focus-visible,.mem button:focus-visible{outline:3px solid #E0A458;outline-offset:2px}' +
    '.mem-sky{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
    '.mem-sky button{width:40px;height:40px;border-radius:50%;border:3px solid transparent;cursor:pointer;padding:0}' +
    '.mem-sky button[aria-pressed="true"]{border-color:#1F2A44;box-shadow:inset 0 0 0 3px #EFE6D3}' +
    '.mem-skyname{font-size:13px;font-weight:700;color:#B8432F;min-height:18px;margin-top:4px}' +
    '.mem details{margin-top:16px;border-top:1px solid #DACBB4;padding-top:10px}' +
    '.mem summary{cursor:pointer;font-weight:700;font-size:16px;list-style:none}' +
    '.mem summary::after{content:" +";color:#B8432F}.mem details[open] summary::after{content:" −"}' +
    '.mem .note{font-size:12.5px;color:#4A5470;line-height:1.55}' +
    '.mem-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:52px;margin-top:16px;border:0;border-radius:999px;background:#1F2A44;color:#F4EEE2;font:inherit;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none}' +
    '.mem-btn.alt{background:transparent;color:#1F2A44;border:1.5px solid #1F2A44}' +
    '.mem-btn:disabled{opacity:.5}' +
    '.mem-link{background:none;border:0;color:#1F2A44;text-decoration:underline;font:inherit;font-size:14px;margin-top:12px;cursor:pointer;display:block;margin-inline:auto}' +
    '.mem-msg{color:#B8432F;font-weight:700;font-size:14px;min-height:20px;margin-top:10px}' +
    '.mem-drop{display:grid;place-items:center;gap:8px;text-align:center;border:1.5px dashed #1F2A44;border-radius:6px;min-height:240px;padding:18px;cursor:pointer;background:#EFE6D3}' +
    '.mem-drop img{max-height:340px;width:auto;max-width:100%;border:10px solid #fff;box-shadow:0 8px 24px rgba(31,42,68,.25);transform:rotate(-2deg)}' +
    '.mem-check{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;margin-top:14px;font-size:14px;line-height:1.55;cursor:pointer}' +
    '.mem-check input{width:20px;height:20px;margin:2px 0 0;accent-color:#1F2A44}' +
    '.mem-story{display:block;width:100%;max-width:340px;margin:0 auto;border-radius:12px;box-shadow:0 14px 40px rgba(31,42,68,.35);aspect-ratio:9/16;background:#1F2A44}' +
    '.mem-list{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:8px}' +
    '.mem-list button{width:100%;text-align:right;font:inherit;background:#EFE6D3;border:0;border-radius:6px;padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;color:#1F2A44}' +
    '.mem-list small{color:#4A5470}' +
    '@media (prefers-reduced-motion:reduce){.mem *{transition:none!important}}';

  // ---------------- screens ----------------
  function steps(cur) {
    var hasCard = state.view === 'photo' || state.view === 'story';
    return '<div class="mem-steps" role="list">' +
      '<button type="button" data-go="card"' + (cur === 'card' ? ' aria-current="step"' : '') + '>١ · الكارت</button>' +
      '<button type="button" data-go="photo"' + (cur === 'photo' ? ' aria-current="step"' : '') + (hasCard ? '' : ' disabled') + '>٢ · صورتك</button>' +
      '<button type="button" disabled' + (cur === 'story' ? ' aria-current="step"' : '') + '>٣ · الستوري</button></div>';
  }
  function field(id, label, ph, area) {
    var v = esc(state.f[id]);
    return '<label class="l" for="mf-' + id + '">' + label + '</label>' +
      (area ? '<textarea id="mf-' + id + '" data-f="' + id + '" rows="3" maxlength="1200" placeholder="' + ph + '">' + v + '</textarea>'
            : '<input type="text" id="mf-' + id + '" data-f="' + id + '" maxlength="240" placeholder="' + ph + '" value="' + v + '">');
  }

  function body() {
    var s = state;
    if (s.view === 'loading') return '<p class="sub" style="margin-top:40px">لحظة…</p>';

    if (s.view === 'phone' || s.view === 'code') {
      var codeStep = s.view === 'code', wait = Math.max(0, Math.ceil((s.resendAt - Date.now()) / 1000));
      return '<h2 id="mem-title">كنت هنا</h2>' +
        '<p class="sub">سجّل برقمك الأول، علشان ذكرياتك تفضل محفوظة باسمك وترجعلها في أي وقت.</p>' +
        '<form data-form="' + s.view + '" novalidate>' +
          (codeStep
            ? '<p class="sub">بعتنالك كود من ٦ أرقام على واتساب <span dir="ltr">' + esc(s.phone) + '</span></p><label class="l" for="mem-in">الكود</label><input id="mem-in" type="text" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6">'
            : '<label class="l" for="mem-in">رقم الموبايل</label><input id="mem-in" type="tel" dir="ltr" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="01xxxxxxxxx" value="' + esc(s.phone) + '">') +
          '<div class="mem-msg" role="alert">' + esc(s.err) + '</div>' +
          '<button class="mem-btn" type="submit">' + (codeStep ? 'دخول' : 'ابعتلي كود على واتساب') + '</button>' +
        '</form>' +
        (codeStep ? '<button class="mem-link" type="button" data-resend' + (wait ? ' disabled' : '') + '>' + (wait ? 'كود جديد بعد ' + ar(wait) + ' ث' : 'ابعت كود جديد') + '</button><button class="mem-link" type="button" data-edit>غيّر الرقم</button>' : '');
    }

    if (s.view === 'card') {
      var sk = skyOf(s.f.sky);
      return '<h2 id="mem-title">كنت هنا</h2>' +
        '<p class="sub">سجّل ذكرى زيارتك، وأضف صورة من قعدتك، واحصل عليها في تصميم ستوري جاهز للمشاركة.</p>' + steps('card') +
        '<div class="mem-card"><span class="sc" aria-hidden="true">✂</span>' +
          field('visit_date', 'التاريخ', '') +
          field('with_whom', 'كنت مع', 'مين كان معاك؟') +
          field('drink', 'طلبت', 'المشروب والحلو') +
          field('song', 'الأغنية اللي كانت شغالة', 'ولا كان الهوا بس؟') +
          '<span class="l" id="mem-sky-l">لون السما</span><div class="mem-sky" role="group" aria-labelledby="mem-sky-l">' +
            SKY.map(function (x) { return '<button type="button" data-sky="' + x[0] + '" style="background:' + x[1] + '" aria-label="' + x[2] + '" aria-pressed="' + (s.f.sky === x[0]) + '"></button>'; }).join('') +
          '</div><div class="mem-skyname">' + (sk ? sk[2] : '') + '</div>' +
          field('quote', 'جملة اتقالت على الترابيزة ومش عاوز تنساها', 'اكتبها زي ما اتقالت', true) +
          '<details' + (s.f.rec_book || s.f.rec_film || s.f.rec_song || s.f.story ? ' open' : '') + '><summary>ترشيحاتك للعدد الجاي من الجرنال</summary>' +
            '<p class="note">العدد التاني بيتعمل من ترشيحاتكم. أحلى حكاية بتتنشر وصاحبها بيكسب هدية.</p>' +
            field('rec_book', 'كتاب ترشحه لنادي الكتاب', 'اسم الكتاب') +
            field('rec_film', 'فيلم نفسك تشوفه في سينما الشط', 'اسم الفيلم') +
            field('rec_song', 'أغنية تتحط في «شريط الغروب»', 'الأغنية والمطرب') +
            field('story', 'حكايتك مع النيل أو مع المنصورة', 'أول خروجة، صورة قديمة، موقف مش ناسيه…', true) +
          '</details>' +
        '</div>' +
        '<div class="mem-msg" role="alert">' + esc(s.err) + '</div>' +
        '<button class="mem-btn" type="button" data-next>الخطوة الجاية: صورتك</button>' +
        (s.list.length ? '<details style="margin-top:22px"><summary>ذكرياتي (' + ar(s.list.length) + ')</summary><ul class="mem-list">' +
          s.list.map(function (m, i) { return '<li><button type="button" data-old="' + i + '"><span>' + esc(m.visit_date || '') + (m.with_whom ? ' · مع ' + esc(m.with_whom) : '') + '</span><small>اعرض الستوري</small></button></li>'; }).join('') +
        '</ul></details>' : '');
    }

    if (s.view === 'photo') {
      return '<h2 id="mem-title">صورتك من المكان</h2>' +
        '<p class="sub">صورة لك أو لأصحابك أو للنيل من ترابيزتك، وهتظهر في التصميم على شكل صورة بولارويد.</p>' + steps('photo') +
        '<label class="mem-drop" for="mem-file">' +
          (s.photo ? '<img src="' + s.photo + '" alt="الصورة اللي اخترتها">' + '<span class="note">دوس هنا لو عاوز تغيّرها</span>'
                   : '<svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><b>ضيف صورة</b><span class="note">من الكاميرا أو من الصور</span>') +
        '</label><input id="mem-file" type="file" accept="image/*" hidden>' +
        '<label class="mem-check"><input type="checkbox" id="mem-consent"' + (s.f.consent ? ' checked' : '') + '><span>أوافق على احتفاظ سيكويا بتصميم الذكرى وإمكانية نشره في جرنال سيكويا. <span class="note">في حالة عدم الموافقة، يظل التصميم على هاتفك فقط. صورتك الأصلية لا يتم حفظها في أي حالة.</span></span></label>' +
        '<div class="mem-msg" role="alert">' + esc(s.err) + '</div>' +
        '<button class="mem-btn" type="button" data-make' + (s.busy ? ' disabled' : '') + '>' + (s.busy ? 'بنحفظ ذكراك…' : 'احفظ الذكرى واعمل الستوري') + '</button>' +
        (s.photo ? '' : '<button class="mem-link" type="button" data-make>كمّل من غير صورة</button>');
    }

    if (s.view === 'story') {
      var share = !!(navigator.canShare && s.storyBlob && navigator.canShare({ files: [new File([s.storyBlob], 'sequoia.jpg', { type: 'image/jpeg' })] }));
      return '<h2 id="mem-title">ذكراك جاهزة</h2>' +
        '<p class="sub">ذكراك اتسجلت في حسابك. شاركها ستوري ومنشن <span dir="ltr">' + esc(handle()) + '</span>.</p>' + steps('story') +
        (s.story ? '<img class="mem-story" src="' + s.story + '" alt="ستوري كنت هنا من سيكويا">' : '<p class="sub">بنرسم الستوري…</p>') +
        '<div class="mem-msg" role="alert">' + esc(s.err) + '</div>' +
        (share ? '<button class="mem-btn" type="button" data-share>شارك على الستوري</button>' : '') +
        '<button class="mem-btn' + (share ? ' alt' : '') + '" type="button" data-download>احفظ الصورة على موبايلك</button>' +
        '<p class="note" style="text-align:center;margin-top:10px">لو الحفظ مشتغلش: دوس على الصورة دوسة طويلة واختار «حفظ الصورة».</p>' +
        '<button class="mem-link" type="button" data-again>اكتب ذكرى جديدة</button>';
    }
    return '';
  }

  function paint() {
    root.innerHTML = '<div class="mem-in" dir="rtl" lang="ar">' +
      '<div class="mem-top"><span class="brand"><img src="assets/tree-navy.webp" alt="" width="20" height="23">Sequoia Café</span>' +
      '<button class="mem-x" type="button" data-close aria-label="قفل"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>' +
      body() + '</div>';
    var inp = root.querySelector('#mem-in'); if (inp) inp.focus();
  }

  // ---------------- login (same API as حسابي) ----------------
  function loadMe() {
    return call('GET', '/me').then(function (j) {
      if (j.status === 200) {
        state.phone = j.phone; state.view = 'card'; paint();
        call('GET', '/me/memories').then(function (r) { if (r.status === 200) { state.list = r.items || []; if (state.view === 'card') paint(); } }, function () {});
        return;
      }
      state.view = 'phone'; paint();
    }, function () { state.view = 'phone'; state.err = MSG.net; paint(); });
  }
  function requestCode() {
    call('POST', '/otp/request', { phone: state.phone }).then(function (j) {
      if (j.status === 200) { state.view = 'code'; state.resendAt = Date.now() + (j.resendIn || 60) * 1000; state.err = ''; }
      else { if (j.retryIn) { state.view = 'code'; state.resendAt = Date.now() + j.retryIn * 1000; } state.err = MSG[j.error] || MSG.send; }
      paint();
    }, function () { state.err = MSG.net; paint(); });
  }
  function onSubmit(e) {
    e.preventDefault();
    var form = e.target, v = (form.querySelector('#mem-in').value || '').replace(/[٠-٩]/g, function (d) { return AR.indexOf(d); }).replace(/[\s-]/g, '');
    state.err = '';
    if (form.getAttribute('data-form') === 'phone') {
      if (!/^(\+?20|0020)?0?1[0125]\d{8}$/.test(v)) { state.err = MSG.phone; return paint(); }
      state.phone = v; return requestCode();
    }
    if (!/^\d{6}$/.test(v)) { state.err = MSG.code; return paint(); }
    call('POST', '/otp/verify', { phone: state.phone, code: v }).then(function (j) {
      if (j.status === 200) return loadMe();
      state.err = MSG[j.error] || MSG.code; paint();
    }, function () { state.err = MSG.net; paint(); });
  }

  // ---------------- photo: resize on the phone to 1080 px JPEG ----------------
  function readPhoto(file) {
    if (!file || !/^image\//.test(file.type)) { state.err = MSG.photo; return paint(); }
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1080, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        state.photo = c.toDataURL('image/jpeg', 0.85); state.err = ''; paint();
      };
      img.onerror = function () { state.err = MSG.photo; paint(); };
      img.src = fr.result;
    };
    fr.onerror = function () { state.err = MSG.photo; paint(); };
    fr.readAsDataURL(file);
  }

  // ---------------- save + draw the story ----------------
  function filled() { var f = state.f; return f.with_whom || f.drink || f.song || f.quote || f.sky || f.rec_book || f.rec_film || f.rec_song || f.story; }
  function make() {
    if (state.busy) return;
    if (!filled()) { state.view = 'card'; state.err = MSG.empty; return paint(); }
    state.busy = true; state.err = ''; paint();
    var body = {}; for (var k in state.f) body[k] = state.f[k];
    draw(body, state.photo).then(function (c) {
      // the finished design is uploaded only with consent; the customer's own photo never leaves the phone
      if (state.f.consent) body.photo = jpegUnder(c, 1.4e6);
      return call('POST', '/me/memories', body).then(function (j) {
        state.busy = false;
        if (j.status === 401) { state.view = 'phone'; return paint(); }
        if (j.status !== 200) { state.err = MSG[j.error] || MSG.save; return paint(); }
        state.saved = j.item; state.list.unshift(j.item);
        ready(c);
      });
    }).catch(function () { state.busy = false; state.err = MSG.net; paint(); });
  }
  // keep the uploaded design under the server's size limit
  function jpegUnder(c, max) {
    var q = 0.88, d = c.toDataURL('image/jpeg', q);
    while (d.length * 0.75 > max && q > 0.5) { q -= 0.08; d = c.toDataURL('image/jpeg', q); }
    return d;
  }
  function ready(c) {
    state.view = 'story'; state.story = c.toDataURL('image/jpeg', 0.9); state.storyBlob = null; paint();
    c.toBlob(function (b) { state.storyBlob = b; paint(); }, 'image/jpeg', 0.9);
  }
  // an older memory: show the saved design if there is one, otherwise redraw it from the card (no photo)
  function showSaved(m) {
    if (!m.photo) return showStory(m, null);
    var url = API + '/me/memories/' + m.id + '/photo';
    state.view = 'story'; state.story = url; state.storyBlob = null; paint();
    fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) { if (b) { state.storyBlob = b; paint(); } }, function () {});
  }
  function showStory(item, photo) {
    state.view = 'story'; state.story = null; state.storyBlob = null; paint();
    draw(item, photo).then(function (c) {
      state.story = c.toDataURL('image/jpeg', 0.9);
      c.toBlob(function (b) { state.storyBlob = b; paint(); }, 'image/jpeg', 0.9);
    }, function () { state.err = 'مقدرناش نرسم الستوري. جرّب تاني.'; paint(); });
  }

  function loadImg(src) {
    return new Promise(function (ok) { if (!src) return ok(null); var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; });
  }
  function wrap(ctx, text, maxW) {
    var words = String(text || '').split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
  }
  function cover(ctx, img, x, y, w, h) {
    var k = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / k, sh = h / k;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  var AF = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif', LF = '"Libre Bodoni", Georgia, serif';

  // Story design from Sequoia-Story-Frame.psd (1080×1920):
  //   1. the guest photo fills the background, heavily blurred (PSD: Gaussian ~50 px)
  //   2. assets/story/frame.webp = every fixed PSD layer flattened (navy tint 51%, card, logo, café entrance, footer line)
  //   3. the guest photo again in the REPLACE_PHOTO slot (60,421 960×864, 14 px corners)
  //   4. EDIT_HEADLINE → "Sequoia's memory" in Nib Pro; EDIT_GUEST_NAME → who they were with
  var FRAME = { photo: [60, 421, 960, 864, 14], head: [989, 1394, 478], name: [988, 1464, 478] };
  var nibReady = null;
  function nib() {
    if (!nibReady) nibReady = (window.FontFace && document.fonts
      ? new FontFace('Nib Pro', 'url(assets/fonts/nib-pro-semibold.ttf)', { weight: '600' }).load().then(function (f) { document.fonts.add(f); })
      : Promise.resolve()).catch(function () {});
    return nibReady;
  }
  function rrect(x, l, tp, w, h, r) {
    x.beginPath(); x.moveTo(l + r, tp); x.lineTo(l + w - r, tp); x.quadraticCurveTo(l + w, tp, l + w, tp + r);
    x.lineTo(l + w, tp + h - r); x.quadraticCurveTo(l + w, tp + h, l + w - r, tp + h); x.lineTo(l + r, tp + h);
    x.quadraticCurveTo(l, tp + h, l, tp + h - r); x.lineTo(l, tp + r); x.quadraticCurveTo(l, tp, l + r, tp); x.closePath();
  }
  // a strong, smooth blur that works on every phone: shrink the photo a lot, then scale it back up in two steps
  function blurCover(x, img, W, H) {
    var a = document.createElement('canvas'); a.width = 36; a.height = 64;
    var ax = a.getContext('2d'); ax.imageSmoothingQuality = 'high'; cover(ax, img, 0, 0, 36, 64);
    var b = document.createElement('canvas'); b.width = 270; b.height = 480;
    var bx = b.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(a, 0, 0, 270, 480);
    x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, W, H);
  }
  function noPhoto(x, l, tp, w, h, sky) {
    var g = x.createLinearGradient(0, tp, 0, tp + h);
    g.addColorStop(0, sky ? sky[1] : '#DDA15E'); g.addColorStop(.6, '#B5607A'); g.addColorStop(.61, '#2B3247'); g.addColorStop(1, '#1F2A44');
    x.fillStyle = g; x.fillRect(l, tp, w, h);
    x.fillStyle = '#F7D9A0'; x.beginPath(); x.arc(l + w * .33, tp + h * .56, h * .1, 0, Math.PI * 2); x.fill();
  }

  function draw(m, photo) {
    var fonts = document.fonts ? Promise.all(['400 37px "IBM Plex Sans Arabic"'].map(function (f) { return document.fonts.load(f).catch(function () {}); })) : Promise.resolve();
    return Promise.all([fonts, nib(), loadImg(photo), loadImg('assets/story/frame.webp')]).then(function (r) {
      var pic = r[2], frame = r[3], sky = skyOf(m.sky);
      var W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
      var x = c.getContext('2d');
      // 1. background
      if (pic) blurCover(x, pic, W, H);
      else { var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky ? sky[1] : '#C8694A'); g.addColorStop(1, '#1F2A44'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
      // 2. fixed design (has the navy tint); fallback tint if it did not load
      if (frame) x.drawImage(frame, 0, 0, W, H);
      else { x.fillStyle = 'rgba(30,42,68,.51)'; x.fillRect(0, 0, W, H); }
      // 3. photo slot
      var P = FRAME.photo;
      x.save(); rrect(x, P[0], P[1], P[2], P[3], P[4]); x.clip();
      if (pic) cover(x, pic, P[0], P[1], P[2], P[3]); else noPhoto(x, P[0], P[1], P[2], P[3], sky);
      x.restore();
      // 4. headline, shrunk to fit the space beside the café entrance
      var hd = FRAME.head, size = 81;
      x.direction = 'ltr'; x.textAlign = 'right'; x.textBaseline = 'alphabetic'; x.fillStyle = '#1E2A44';
      do { x.font = '600 ' + size + 'px "Nib Pro", Georgia, serif'; size -= 2; } while (x.measureText("Sequoia's memory").width > hd[2] && size > 30);
      x.fillText("Sequoia's memory", hd[0], hd[1]);
      // 5. who they were with
      if (m.with_whom) {
        var nm = FRAME.name, txt = String(m.with_whom);
        x.direction = 'rtl'; x.textAlign = 'right'; x.fillStyle = '#5F705C'; x.font = '400 37px ' + AF;
        while (x.measureText(txt).width > nm[2] && txt.length > 1) txt = txt.slice(0, -2) + '…';
        x.fillText(txt, nm[0], nm[1]);
      }
      return c;
    });
  }

  function download() {
    if (!state.storyBlob) return;
    var a = document.createElement('a'), u = URL.createObjectURL(state.storyBlob);
    a.href = u; a.download = 'sequoia-kont-hena.jpg'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000);
  }
  function share() {
    var f = new File([state.storyBlob], 'sequoia-kont-hena.jpg', { type: 'image/jpeg' });
    navigator.share({ files: [f], title: 'كنت هنا · سيكويا' }).catch(function () {});
  }

  // ---------------- events ----------------
  function onClick(e) {
    var t = e.target, b;
    if (t.closest('[data-close]')) return close();
    if ((b = t.closest('[data-sky]'))) { state.f.sky = state.f.sky === b.getAttribute('data-sky') ? '' : b.getAttribute('data-sky'); return paint(); }
    if (t.closest('[data-next]')) { if (!filled()) { state.err = MSG.empty; return paint(); } state.err = ''; state.view = 'photo'; paint(); return root.scrollTo(0, 0); }
    if ((b = t.closest('[data-go]')) && !b.disabled) { state.err = ''; state.view = b.getAttribute('data-go'); return paint(); }
    if (t.closest('[data-make]')) return make();
    if (t.closest('[data-download]')) return download();
    if (t.closest('[data-share]')) return share();
    if (t.closest('[data-again]')) { var keep = state.list, ph = state.phone; state = fresh(); state.list = keep; state.phone = ph; state.view = 'card'; return paint(); }
    if (t.closest('[data-resend]')) return requestCode();
    if (t.closest('[data-edit]')) { state.view = 'phone'; state.err = ''; return paint(); }
    if ((b = t.closest('[data-old]'))) {
      var m = state.list[+b.getAttribute('data-old')];
      if (m) showSaved(m);
    }
  }
  function onInput(e) {
    var k = e.target.getAttribute('data-f');
    if (k) state.f[k] = e.target.value;
    if (e.target.id === 'mem-consent') state.f.consent = e.target.checked;
  }
  function onChange(e) {
    if (e.target.id === 'mem-file') readPhoto(e.target.files && e.target.files[0]);
    if (e.target.id === 'mem-consent') state.f.consent = e.target.checked;
  }

  var back = null;
  function open(host) {
    if (!root) {
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      root = document.createElement('div'); root.className = 'mem'; root.hidden = true;
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'mem-title');
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('submit', onSubmit);
      root.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }
    if (!state) state = fresh();
    back = document.activeElement;
    (host || document.body).appendChild(root);
    root.hidden = false; root.scrollTo(0, 0);
    if (state.view === 'loading' || state.view === 'phone' || state.view === 'code') { state.view = 'loading'; paint(); loadMe(); } else paint();
  }
  function close() {
    if (!root) return;
    root.hidden = true;
    if (location.hash === '#kont-hena') history.replaceState('', document.title, location.pathname + location.search);
    if (back && document.contains(back)) back.focus();
  }
  window.SequoiaMemory = { open: open, close: close };
})();
