#!/usr/bin/env node
// Builds docs/styleguide.html: the wording guide + every button in every state, in English and Arabic.
// Reads the live CSS from index.html and the live texts from assets/menu.js + assets/landing.js,
// so the guide always matches the site. Run after changing buttons or texts:
//   node tools/build-styleguide.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').split('\r\n').join('\n');   // Windows checkouts use CRLF

// ---- live CSS (menu) -> scoped for a shadow root: :root becomes :host, page-level rules dropped ----
const css = read('index.html').match(/<style>([\s\S]*?)<\/style>/)[1]
  .replace(/:root\s*\{/g, ':host{')
  .replace(/(^|\})\s*html,body\{[^}]*\}/g, '$1')
  .replace(/(^|\})\s*body\{[^}]*\}/g, '$1');

// ---- live texts: evaluate the text tables (object literals) from the scripts ----
function table(file, name) {
  const s = read(file); const i = s.indexOf('var ' + name + ' = {');
  if (i < 0) throw new Error(name + ' not found in ' + file);
  let j = s.indexOf('{', i), d = 0;
  for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && !--d) break; }
  return vm.runInNewContext('(' + s.slice(s.indexOf('{', i), j + 1) + ')');
}
const T = table('assets/menu.js', 'TXT'), SV = table('assets/menu.js', 'SV'), RV = table('assets/menu.js', 'RV'), LT = table('assets/landing.js', 'TXT');

// ---- glossary tables from docs/glossary.md ----
const md = read('docs/glossary.md');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
function mdTable(heading) {
  const sec = md.split('\n## ').find(x => x.startsWith(heading));
  const rows = sec.split('\n').filter(l => l.startsWith('|') && !/^\|[-| ]+\|$/.test(l)).map(l => l.slice(1, -1).split('|').map(c => c.trim()));
  const [head, ...body] = rows;
  return '<div class="tw"><table><thead><tr>' + head.map(h => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>' +
    body.map(r => '<tr>' + r.map((c, k) => '<td' + (head[k] === 'Arabic' ? ' dir="rtl" lang="ar"' : '') + '>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
const rules = md.split('\n## Writing rules\n')[1].split('\n## ')[0].trim().split('\n').filter(l => l.startsWith('- ')).map(l => '<li>' + inline(l.slice(2)) + '</li>').join('');

// ---- button demos: [name, role, background, html(lang)] ----
const BELL = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLAY = '<svg class="flip" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';
const STATES = ['Default', 'Pressed', 'Focus', 'Disabled', 'Loading'];
function st(state) {
  return state === 'Pressed' ? ' style="transform:scale(0.97)"' : state === 'Focus' ? ' style="outline:2px solid var(--focus);outline-offset:2px"'
    : state === 'Disabled' ? ' disabled' : state === 'Loading' ? ' disabled aria-busy="true"' : '';
}
const cls = state => state === 'Loading' ? ' is-loading' : '';
const DEMOS = [
  ['Primary · cover', 'The one main action on the cover.', 'navy', (l, s) => '<div style="display:flex;justify-content:center"><button class="press btn-primary' + cls(s) + '"' + st(s) + '>' + PLAY + '<span>' + T[l].open + '</span></button></div>'],
  ['Primary · Ready to order', 'Bottom bar on every menu screen. Calls the captain at once.', 'navy', (l, s) => '<div class="dock" style="padding:0"><div class="drow"><button class="press call caps' + cls(s) + '"' + st(s) + '>' + BELL + '<span>' + SV[l].ready + '</span></button></div></div>'],
  ['Secondary · Other requests', 'Next to Ready to order. Outline, so Ready stays the one primary.', 'navy', (l, s) => '<div class="dock" style="padding:0"><div class="drow"><button class="press call other caps' + cls(s) + '"' + st(s) + '><span>' + SV[l].other + '</span></button></div></div>'],
  ['Status · request sent', 'Shown for a minute after a request. A sentence, not capitals.', 'navy', (l) => '<div class="dock" style="padding:0"><div class="drow"><button class="press call sent caps"><span class="dot" aria-hidden="true"></span><span>' + SV[l].captainComing + ' · ' + SV[l].tableW + ' 7</span></button></div></div>', true],
  ['Option · sheet', 'Pick one of several (payment, quick requests). Dashed once sent.', 'cream', (l, s) => '<div class="panel" style="animation:none;border-radius:16px;padding:14px"><div class="opts"><button class="press opt' + cls(s) + '"' + st(s) + '><span>' + (l === 'ar' ? 'كاش' : 'Cash') + '</span></button><button class="press opt done" disabled><span class="dot" aria-hidden="true"></span><span>' + (l === 'ar' ? 'مياه' : 'Water') + '</span></button></div></div>'],
  ['Primary · sheet', 'Main action inside a light sheet.', 'cream', (l, s) => '<div class="panel" style="animation:none;border-radius:16px;padding:14px"><button class="press btn-primary caps' + cls(s) + '"' + st(s) + '><span>' + SV[l].more + '</span></button></div>'],
  ['Link', 'Leave or skip. Underlined text.', 'cream', (l, s) => '<div class="panel" style="animation:none;border-radius:16px;padding:14px"><button class="press linkbtn caps"' + st(s) + '>' + SV[l].back + '</button></div>'],
  ['Primary · song card', 'Request a song, at the bottom of the cover page.', 'navy', (l, s) => '<div class="song"><button class="press jread' + cls(s) + '"' + st(s) + '><span>' + LT[l].gBtn + '</span></button></div>'],
  ['Navigation · next / previous section', 'Bottom of each menu section.', 'navy', (l, s) => '<div class="nav" style="margin:0"><button class="press ghost prev"' + st(s) + '><small class="caps" style="color:var(--beige)">' + T[l].rewind + '</small><b style="color:var(--cream)">' + (l === 'ar' ? 'مشروبات ساخنة' : 'Hot Drinks') + '</b></button><button class="press next"' + st(s) + '><small class="caps" style="color:var(--tan);font-weight:700">' + T[l].next + '</small><b style="color:var(--navy);font-weight:700">' + (l === 'ar' ? 'فرابيه' : 'Frappé') + '</b></button></div>'],
  ['Section chips', 'Jump between menu sections. Current one is filled.', 'navy', (l, s) => '<div class="chips noscroll" style="padding:0;flex-wrap:wrap"><button class="press chip" aria-current="true">' + (l === 'ar' ? 'قهوة مثلجة' : 'Iced Coffee') + '</button><button class="press chip" aria-current="false"' + st(s) + '>' + (l === 'ar' ? 'فرابيه' : 'Frappé') + '</button></div>'],
  ['Google review', 'After a bill request. Primary + Not now.', 'navy', (l) => '<div style="display:grid;gap:4px;max-width:320px;margin:auto"><a class="rv-go" href="#">' + RV[l].go + '</a><button class="rv-later">' + RV[l].later + '</button></div>', true],
];
function demoGrid(l) {
  return DEMOS.map(([name, role, bg, html, single]) => {
    const states = single ? ['Default'] : STATES;
    return '<section class="kind"><h3>' + esc(name) + '</h3><p class="role">' + esc(role) + '</p><div class="states">' +
      states.map(s => '<figure><figcaption>' + s + '</figcaption><div class="demo bg-' + bg + '" data-lang="' + l + '"><template>' + html(l, s) + '</template></div></figure>').join('') +
      '</div></section>';
  }).join('');
}

const page = `<title>Sequoia Wording Guide</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Libre+Bodoni:ital,wght@0,400;0,700;1,400;1,500&display=swap">
<style>
/* Layout: one reading column; demos sit on the menu's own navy or cream so they look as they do on a phone. Generated by tools/build-styleguide.js */
:root{--paper:#F4EEE2;--ink:#1F2A44;--ink-soft:#4A5470;--line:rgba(31,42,68,.16);--chip:#E6DCCB;--mark:#B8432F;
  --f-display:'Abril Fatface',Georgia,serif;--f-body:'Barlow',system-ui,sans-serif;--f-label:'Barlow Semi Condensed',system-ui,sans-serif;--f-ar:'IBM Plex Sans Arabic',Tahoma,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#141B2D;--ink:#F4EEE2;--ink-soft:#C9BFAE;--line:rgba(244,238,226,.16);--chip:#26304A;--mark:#E0A458;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#141B2D;--ink:#F4EEE2;--ink-soft:#C9BFAE;--line:rgba(244,238,226,.16);--chip:#26304A;--mark:#E0A458;color-scheme:dark}
body{background:var(--paper);color:var(--ink);font:16px/1.55 var(--f-body)}
.wrap{max-width:980px;margin:0 auto;padding-block:40px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font:400 clamp(34px,6vw,52px)/1.05 var(--f-display);margin:0;text-wrap:balance}
h2{font:600 13px/1 var(--f-label);letter-spacing:.22em;text-transform:uppercase;color:var(--mark);margin:56px 0 14px}
h3{font:700 17px/1.3 var(--f-body);margin:0}
.lede{max-width:62ch;color:var(--ink-soft);margin:14px 0 0}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:640px;font-size:15px}
th,td{text-align:start;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}
th{font:600 12px/1.2 var(--f-label);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);background:var(--chip)}
td[dir=rtl]{font-family:var(--f-ar)}
tr:last-child td{border-bottom:0}
code{font-size:.9em}
ul.rules{max-width:70ch;padding-inline-start:20px;display:grid;gap:8px}
.tabs{display:flex;gap:8px;margin:0 0 18px}
.tabs button{height:44px;padding:0 18px;border-radius:999px;border:1.5px solid var(--line);background:transparent;color:var(--ink);font:600 15px var(--f-body);cursor:pointer}
.tabs button[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.tabs button:focus-visible{outline:2px solid var(--mark);outline-offset:2px}
.kind{padding:22px 0;border-top:1px solid var(--line)}
.role{margin:4px 0 12px;color:var(--ink-soft);font-size:15px}
.states{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px}
figure{margin:0;min-width:0}
figcaption{font:600 12px/1 var(--f-label);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-soft);margin:0 0 6px}
.demo{border-radius:14px;padding:16px;min-height:88px;display:flex;flex-direction:column;justify-content:center;overflow:hidden}
.bg-navy{background:#1F2A44}.bg-cream{background:#DACBB4}
.note{font-size:15px;color:var(--ink-soft);max-width:70ch}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<div class="wrap">
  <h1>Sequoia Wording Guide</h1>
  <p class="lede">One word per idea and one button system for the Sequoia menu, in English and Egyptian Arabic. Built from the live site's styles and texts, so what you see here is what guests see.</p>

  <h2>Terms</h2>
  ${mdTable('Terms')}

  <h2>Writing rules</h2>
  <ul class="rules">${rules}</ul>

  <h2>Button kinds</h2>
  ${mdTable('Buttons')}

  <h2>Every button, every state</h2>
  <p class="note">Hover (on a computer) makes filled buttons slightly brighter. Touch targets are at least 44 × 44 px with 8 px between buttons. There is no TV layout: Sequoia has no in-store screens.</p>
  <div class="tabs" role="group" aria-label="Language">
    <button type="button" id="tab-en" aria-pressed="true" data-l="en">English</button>
    <button type="button" id="tab-ar" aria-pressed="false" data-l="ar">العربي</button>
  </div>
  <div data-pane="en">${demoGrid('en')}</div>
  <div data-pane="ar" hidden>${demoGrid('ar')}</div>
</div>
<script>
(function () {
  var CSS = ${JSON.stringify(css)};
  // each demo renders inside its own shadow root with the menu's real CSS, isolated from this page
  document.querySelectorAll('.demo').forEach(function (d) {
    var ar = d.getAttribute('data-lang') === 'ar', sh = d.attachShadow({ mode: 'open' });
    sh.innerHTML = '<style>' + CSS + ':host{display:block;color:var(--cream);font-family:Barlow,system-ui,sans-serif}</style>' +
      '<div class="' + (ar ? 'is-ar' : '') + '" dir="' + (ar ? 'rtl' : 'ltr') + '" lang="' + (ar ? 'ar' : 'en') + '">' + d.querySelector('template').innerHTML + '</div>';
  });
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var l = b.getAttribute('data-l');
      document.querySelectorAll('.tabs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== l; });
    });
  });
})();
</script>
`;
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'styleguide.html'), page);
console.log('docs/styleguide.html written (' + Math.round(page.length / 1024) + ' KB)');
