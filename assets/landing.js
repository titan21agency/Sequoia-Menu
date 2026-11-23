/*
 * Sequoia cover page, below the first screen: Sequoia Journal, Sequoia Clubs and the social links.
 * Reads window.SEQUOIA_CONFIG (links) and window.SEQUOIA_LANDING (journal + clubs, assets/landing-data.js).
 * menu.js puts more() + html() under the cover and calls mount() after each render.
 */
(function () {
  'use strict';
  var CFG = window.SEQUOIA_CONFIG || {};
  var DATA = window.SEQUOIA_LANDING || {};
  var J = DATA.JOURNAL || {}, CLUBS = DATA.CLUBS || [];
  var PAGES = (J.pages || []).filter(Boolean);

  var TXT = {
    ar: { more: 'كمان من سيكويا',
          jH: 'جريدة سيكويا', jNew: 'العدد الجديد', jSoon: 'قريبًا', jSoonTitle: 'العدد الأول في الطريق', jRead: 'اقرا الجريدة', jMem: 'سجّل ذكرى', mH: 'كنت هنا', mTitle: 'ذكرى من على النيل', jMemSub: 'احكي زيارتك في كارت، ضيف صورتك، وخدها ستوري على إنستجرام.',
          pages: function (n) { return n + ' صفحة'; },
          cH: 'فعاليات سيكويا', cSoon: '', cSub: '',
          cIntro: 'مواعيد الموسم على شط النيل.. السما بتعمل العرض.',
          gH: 'اطلب أغنيتك', gSub: 'عايز تسمع إيه؟ اكتب اسم الأغنية والمطرب، وهنشغّلها لك.',
          gPh: 'اسم الأغنية · المطرب', gBtn: 'اطلب الأغنية', gSent: 'وصلت! الأغنية في الطابور.', gWa: 'كمّل الطلب في واتساب.',
          gEmpty: 'اكتب اسم الأغنية الأول.', gFail: 'مقدرناش نبعت الطلب. جرّب تاني.',
          sH: 'متنسوش تتابعونا', foot: 'سيكويا كافيه · المنصورة · من 2026',
          page: function (a, b) { return 'صفحة ' + a + ' من ' + b; }, hint: 'اسحب الصفحة أو دوس على طرفها علشان تقلبها',
          close: 'قفل', prev: 'الصفحة اللي قبلها', next: 'الصفحة اللي بعدها' },
    en: { more: 'More from Sequoia',
          jH: 'Sequoia Journal', jNew: 'New issue', jSoon: 'Coming soon', jSoonTitle: 'The first issue is on its way', jRead: 'Read the journal', jMem: 'Save a memory', mH: 'I was here', mTitle: 'A memory by the Nile', jMemSub: 'Write your visit on a card, add your photo, and get it as an Instagram story.',
          pages: function (n) { return n + ' pages'; },
          cH: 'Sequoia Events', cSoon: '', cSub: '',
          cIntro: 'This season by the Nile. The sky puts on the show.',
          gH: 'Request a song', gSub: 'What do you want to hear? Type the song and artist, and we’ll play it.',
          gPh: 'Song · artist', gBtn: 'Request song', gSent: 'Got it! Your song is in the queue.', gWa: 'Finish the request on WhatsApp.',
          gEmpty: 'Type a song name first.', gFail: 'Couldn’t send the request. Try again.',
          sH: 'Follow along', foot: 'Sequoia Café · Mansoura · Est. 2026',
          page: function (a, b) { return 'Page ' + a + ' of ' + b; }, hint: 'Swipe the page or tap its edge to turn it',
          close: 'Close', prev: 'Previous page', next: 'Next page' }
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pick(pair, lang) { return Array.isArray(pair) ? (lang === 'ar' ? pair[0] : pair[1] || pair[0]) : (pair || ''); }
  function safeUrl(u) { return /^https:\/\//.test(u || '') ? u : ''; }

  var BOOK = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h6a2 2 0 0 1 2 2V19a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2V19a2 2 0 0 1 2-2h6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var PEN = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CLUB_ICONS = [
    '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 5.5h6a2 2 0 0 1 2 2V19a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2V19a2 2 0 0 1 2-2h6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    '<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',
    '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 19V8l9-2v11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="6" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="15" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>'
  ];
  var SOCIAL = [
    ['INSTAGRAM_URL', 'Instagram', '<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/>'],
    ['FACEBOOK_URL', 'Facebook', '<path d="M14.5 21v-7.5h2.6l.4-3h-3V8.8c0-.9.3-1.5 1.6-1.5h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.2H9.2v3h2.5V21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'],
    ['TIKTOK_URL', 'TikTok', '<path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M14 3.5c.4 2.8 2.3 4.6 5.2 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'],
    ['WHATSAPP_URL', 'WhatsApp', '<path d="M4 20.5l1.3-3.9A8.3 8.3 0 1 1 8.4 19.4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.2 8.6c.2-.5.6-.6.9-.6h.5l1 2.2-.8 1c.6 1.2 1.5 2.1 2.7 2.7l1-.8 2.2 1v.5c0 .3-.1.7-.6.9-.6.3-1.8.4-3.6-.7-1.6-1-2.8-2.4-3.4-3.9-.4-1.1-.2-1.9-.1-2.3z" fill="currentColor"/>']
  ];

  function head(id, title, label) {
    return '<div class="lsh reveal"><h2 id="' + id + '" class="display">' + title + '</h2><span class="rule" aria-hidden="true"></span><span class="lbl caps">' + label + '</span></div>';
  }

  // a small printed front page, used until a real cover image exists
  function miniPaper() {
    return '<div class="jpaper" aria-hidden="true"><span class="tape"></span><div class="pg">' +
      '<div class="mh">جريدة سيكويا</div><div class="dl"><span>' + esc(pick(J.issue, 'ar')) + '</span><span>' + esc(pick(J.date, 'ar')) + '</span></div>' +
      '<div class="hl">' + esc(pick(J.title, 'ar')) + '</div><div class="ph"></div><div class="ln"></div></div></div>';
  }

  function journal(lang, t) {
    var has = PAGES.length > 0, cover = J.cover || PAGES[0];
    return '<section class="lsec" aria-labelledby="l-journal">' + head('l-journal', t.jH, 'Journal') +
      '<div class="journal reveal">' +
        '<div class="kicker caps"><b>The Sequoia Journal</b><span>' + esc(pick(J.issue, 'en')) + ' · ' + esc(pick(J.date, 'en')) + '</span></div>' +
        '<div class="jbody"><div class="jinfo">' +
          '<span class="jbadge">' + (has ? t.jNew : t.jSoon) + '</span>' +
          '<h3>' + esc(has ? pick(J.title, lang) : t.jSoonTitle) + '</h3>' +
          '<p>' + esc(pick(J.blurb, lang)) + '</p>' +
          (has ? '<div class="jmeta">' + t.pages(PAGES.length) + ' · ' + esc(pick(J.date, lang)) + '</div>' : '') +
        '</div>' +
        (has && cover ? '<div class="jpaper img" aria-hidden="true"><span class="tape"></span><img src="' + esc(cover) + '" alt="" loading="lazy" decoding="async"></div>' : miniPaper()) +
        '</div>' +
        (has ? '<button class="press jread" type="button" data-journal>' + BOOK + '<span>' + t.jRead + '</span></button>' : '') +
      '</div></section>';
  }

  // "كنت هنا": its own section under the journal
  function memory(lang, t) {
    return '<section class="lsec" aria-labelledby="l-memory">' + head('l-memory', t.mH, 'Memories') +
      '<div class="journal reveal">' +
        '<div class="jbody"><div class="jinfo"><h3>' + t.mTitle + '</h3><p>' + t.jMemSub + '</p></div></div>' +
        '<button class="press jread" type="button" data-memory>' + PEN + '<span>' + t.jMem + '</span></button>' +
      '</div></section>';
  }

  function clubs(lang, t) {
    var cards = CLUBS.filter(function (c) { return c && c.name; });
    return '<section class="lsec" aria-labelledby="l-clubs">' + head('l-clubs', t.cH, 'Events') +
      '<div class="clubs reveal">' +
        
        '<div class="cicons" aria-hidden="true">' + CLUB_ICONS.map(function (s) { return '<span>' + s + '</span>'; }).join('') + '</div>' +
        '<p>' + (cards.length ? t.cIntro : t.cSub) + '</p>' +
        (cards.length ? '<div class="ccards noscroll">' + cards.map(function (c) {
          return '<article class="ccard"><div class="cimg">' + (c.image ? '<img src="' + esc(c.image) + '" alt="" loading="lazy" decoding="async">' : '') + '</div>' +
            '<div class="cbd"><b>' + esc(pick(c.name, lang)) + '</b>' + (c.about ? '<p>' + esc(pick(c.about, lang)) + '</p>' : '') +
            (c.when ? '<span class="cwhen">' + esc(pick(c.when, lang)) + '</span>' : '') + '</div></article>';
        }).join('') + '</div>' : '') +
      '</div></section>';
  }

  var NOTE = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  function song(lang, t) {
    return '<section class="lsec" aria-labelledby="l-song">' + head('l-song', t.gH, 'Jukebox') +
      '<form class="song reveal" data-song novalidate>' +
        '<p>' + t.gSub + '</p>' +
        '<input class="sginput" name="song" type="text" maxlength="70" autocomplete="off" enterkeyhint="send" placeholder="' + t.gPh + '" aria-label="' + t.gPh + '">' +
        '<button class="press jread" type="submit">' + NOTE + '<span>' + t.gBtn + '</span></button>' +
        '<div class="sgmsg" role="status" aria-live="polite"></div>' +
      '</form></section>';
  }
  function social(lang, t) {
    var links = SOCIAL.map(function (s) { return [safeUrl(CFG[s[0]]), s[1], s[2]]; }).filter(function (s) { return s[0]; });
    return '<section class="lsocial" aria-labelledby="l-social">' +
      '<img class="bye bob" src="assets/mascot-walkman.webp" alt="" width="700" height="901" loading="lazy" decoding="async">' +
      (links.length ? '<h2 id="l-social">' + t.sH + '</h2><div class="srow">' + links.map(function (s) {
        return '<a class="press" href="' + esc(s[0]) + '" target="_blank" rel="noopener" aria-label="' + s[1] + '"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' + s[2] + '</svg></a>';
      }).join('') + '</div>' : '') +
      '<div class="lfoot"><img src="assets/tree-cream.webp" alt="" width="18" height="32" loading="lazy"><span>' + t.foot + '</span></div>' +
    '</section>';
  }

  // ---- journal viewer: full screen, one printed page at a time; pages turn right-to-left like the Arabic paper
  //      (the page lifts off the spine on the right and turns over). Images load one page ahead. ----
  var V = null, cur = 0, vLang = 'ar', backTo = null, busy = false, RATIO = 1400 / 1979;
  var PEN_S = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function viewer() {
    if (V) return V;
    V = document.createElement('div');
    V.className = 'jview';
    V.hidden = true;
    V.setAttribute('role', 'dialog');
    V.setAttribute('aria-modal', 'true');
    V.setAttribute('aria-labelledby', 'jv-title');
    V.innerHTML = '<div class="jvbar"><div><b id="jv-title"></b><span id="jv-count"></span></div>' +
        '<span class="jvtools"><button class="press jvmem" type="button" data-jv-mem>' + PEN_S + '<span id="jv-mem"></span></button>' +
        '<button class="press jvx" type="button" data-jv-close><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></span></div>' +
      '<div class="jvbook"><div class="jvstack" dir="ltr">' + PAGES.map(function (src, i) {
        return '<div class="jvp" aria-hidden="true"><div class="jvfront"><img data-src="' + esc(src) + '" alt="' + (i + 1) + '" decoding="async"><i class="jvshade"></i></div><i class="jvback"></i></div>';
      }).join('') + '</div></div>' +
      '<div class="jvhint"></div>' +
      '<div class="jvnav" dir="rtl">' +
        '<button class="press" type="button" data-jv-prev><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="jvdots">' + PAGES.map(function () { return '<i></i>'; }).join('') + '</div>' +
        '<button class="press" type="button" data-jv-next><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>';
    document.body.appendChild(V);
    var stack = V.querySelector('.jvstack');
    V.addEventListener('click', function (e) {
      if (e.target.closest('[data-jv-close]')) closeJournal();
      else if (e.target.closest('[data-jv-mem]')) { closeJournal(); openMemory(); }
      else if (e.target.closest('[data-jv-prev]')) go(cur - 1);
      else if (e.target.closest('[data-jv-next]')) go(cur + 1);
      else if (e.target.closest('.jvstack')) {
        // tap the left part of the page to go forward, the right part to go back (right-to-left paper)
        var r = stack.getBoundingClientRect();
        if (e.clientX < r.left + r.width * 0.4) go(cur + 1); else if (e.clientX > r.right - r.width * 0.4) go(cur - 1);
      }
    });
    V.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeJournal();
      else if (e.key === 'ArrowLeft') go(cur + 1);   // right-to-left paper: left is forward
      else if (e.key === 'ArrowRight') go(cur - 1);
    });
    // swipe: drag the page to the right to turn forward, to the left to go back; two fingers are left to pinch-zoom
    var sx = null, sy = 0;
    stack.addEventListener('touchstart', function (e) { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } else sx = null; }, { passive: true });
    stack.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy; sx = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { e.preventDefault(); go(dx > 0 ? cur + 1 : cur - 1); }
    });
    window.addEventListener('resize', fit);
    return V;
  }
  // size the page stack to the printed page's shape inside the free space
  function fit() {
    if (!V || V.hidden) return;
    var book = V.querySelector('.jvbook'), stack = V.querySelector('.jvstack');
    var w = book.clientWidth - 24, h = book.clientHeight - 12;
    if (w <= 0 || h <= 0) return;
    if (w / h > RATIO) w = h * RATIO; else h = w / RATIO;
    stack.style.width = Math.floor(w) + 'px'; stack.style.height = Math.floor(h) + 'px';
  }
  function load(k) {
    var img = V && V.querySelectorAll('.jvp img')[k];
    if (img && !img.src && img.getAttribute('data-src')) img.src = img.getAttribute('data-src');
  }
  function layer(k, top) {
    [].forEach.call(V.querySelectorAll('.jvp'), function (p, j) {
      p.classList.toggle('on', j === k || j === top);
      p.style.zIndex = j === top ? 3 : (j === k ? 2 : 0);
      if (j !== top) p.style.transform = '';
    });
  }
  function show(k) {
    var n = PAGES.length, t = TXT[vLang];
    cur = Math.max(0, Math.min(n - 1, k));
    V.querySelector('#jv-count').textContent = t.page(cur + 1, n);
    [].forEach.call(V.querySelectorAll('.jvdots i'), function (d, j) { d.className = j === cur ? 'on' : ''; });
    V.querySelector('[data-jv-prev]').disabled = cur === 0;
    V.querySelector('[data-jv-next]').disabled = cur === n - 1;
    layer(cur, -1);
    load(cur); load(cur + 1); load(cur - 1);
  }
  function go(k) {
    var n = PAGES.length;
    k = Math.max(0, Math.min(n - 1, k));
    if (k === cur || busy) return;
    var ps = V.querySelectorAll('.jvp'), fwd = k > cur;
    // forward: the current page turns away and reveals k under it; back: page k turns back onto the stack
    var turning = fwd ? ps[cur] : ps[k];
    load(k);
    if (reduced() || !turning.animate) return show(k);
    busy = true;
    layer(fwd ? k : cur, fwd ? cur : k);
    var from = fwd ? 'rotateY(0deg)' : 'rotateY(180deg)', to = fwd ? 'rotateY(180deg)' : 'rotateY(0deg)';
    var shade = turning.querySelector('.jvshade');
    var a = turning.animate([{ transform: from }, { transform: to }], { duration: 720, easing: 'cubic-bezier(.35,.1,.25,1)' });
    shade.animate(fwd ? [{ opacity: 0 }, { opacity: 0.55 }] : [{ opacity: 0.55 }, { opacity: 0 }], { duration: 360, fill: 'forwards' });
    a.onfinish = function () { busy = false; shade.getAnimations && shade.getAnimations().forEach(function (x) { x.cancel(); }); show(k); };
  }
  function openJournal(lang, from) {
    if (!PAGES.length) return;
    vLang = lang === 'ar' ? 'ar' : 'en';
    var t = TXT[vLang];
    viewer();
    V.setAttribute('dir', vLang === 'ar' ? 'rtl' : 'ltr');
    V.classList.toggle('is-ar', vLang === 'ar');
    V.querySelector('#jv-title').textContent = t.jH;
    V.querySelector('#jv-mem').textContent = t.mH;
    V.querySelector('.jvhint').textContent = t.hint;
    V.querySelector('[data-jv-close]').setAttribute('aria-label', t.close);
    V.querySelector('[data-jv-prev]').setAttribute('aria-label', t.prev);
    V.querySelector('[data-jv-next]').setAttribute('aria-label', t.next);
    backTo = from || null;
    busy = false;
    V.hidden = false;
    fit();
    show(0);
    V.querySelector('[data-jv-close]').focus();
  }
  function closeJournal() {
    if (!V || V.hidden) return;
    V.hidden = true;
    if (backTo && document.contains(backTo)) backTo.focus();
  }

  // "كنت هنا" (assets/memory.js) is fetched only the first time it is opened
  var memLoading = null;
  function openMemory() {
    var app = document.body; // outside #app: the menu re-renders #app on every route change
    if (window.SequoiaMemory) return SequoiaMemory.open(app);
    if (!memLoading) memLoading = new Promise(function (ok, bad) {
      var sc = document.createElement('script'); sc.src = 'assets/memory.js'; sc.onload = ok; sc.onerror = function () { memLoading = null; bad(); };
      document.head.appendChild(sc);
    });
    memLoading.then(function () { SequoiaMemory.open(app); }, function () {});
  }

  window.SequoiaLanding = {
    // the "more below" link that sits under the cover's play button
    more: function (lang) {
      return '<button class="lmore caps" type="button" data-lmore><span>' + TXT[lang === 'ar' ? 'ar' : 'en'].more + '</span>' + DOWN + '</button>';
    },
    html: function (lang) {
      var t = TXT[lang === 'ar' ? 'ar' : 'en'];
      return '<div class="below" id="below">' + journal(lang, t) + memory(lang, t) + clubs(lang, t) + song(lang, t) + social(lang, t) + '</div>';
    },
    // scroller: the cover's scrolling element (re-created on every render)
    mount: function (scroller, lang) {
      if (!scroller) return;
      scroller.addEventListener('click', function (e) {
        var b;
        if (e.target.closest('[data-lmore]')) {
          var below = scroller.querySelector('#below'), reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (below) scroller.scrollTo({ top: scroller.scrollTop + below.getBoundingClientRect().top - scroller.getBoundingClientRect().top, behavior: reduce ? 'auto' : 'smooth' });
        } else if ((b = e.target.closest('[data-journal]'))) openJournal(lang, b);
        else if (e.target.closest('[data-memory]')) openMemory();
      });
      var form = scroller.querySelector('[data-song]');
      if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = TXT[lang === 'ar' ? 'ar' : 'en'], inp = form.querySelector('input'), msg = form.querySelector('.sgmsg'), btn = form.querySelector('button');
        var v = inp.value.replace(/\s+/g, ' ').trim();
        msg.className = 'sgmsg';
        if (!v) { msg.textContent = t.gEmpty; msg.classList.add('err'); inp.focus(); return; }
        if (!window.SequoiaLanding.onSong) return;
        btn.disabled = true; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
        window.SequoiaLanding.onSong(v).then(function (how) {
          msg.textContent = how === 'wa' ? t.gWa : t.gSent;
          if (how !== 'wa') inp.value = '';
        }, function () {
          msg.textContent = t.gFail; msg.classList.add('err');
        }).then(function () { btn.disabled = false; btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); });
      });
      // QR on the tables can point at <menu>/#kont-hena to open "كنت هنا" directly
      if (location.hash === '#kont-hena') openMemory();
      // scroll-in: everything is visible at rest; only blocks below the first screen fade in when reached
      if (!('IntersectionObserver' in window)) return;
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.remove('pre'); io.unobserve(en.target); } });
      }, { root: scroller, rootMargin: '0px 0px -8% 0px' });
      var box = scroller.getBoundingClientRect();
      [].forEach.call(scroller.querySelectorAll('.reveal'), function (el) {
        if (el.getBoundingClientRect().top - box.top > box.height) { el.classList.add('pre'); io.observe(el); }
      });
    },
    closeJournal: closeJournal
  };
})();
