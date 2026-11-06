// End-to-end happy path in a real browser (Playwright + Chromium).
// Run: node apps/loyalty/test/e2e.js [screenshotDir]
// scan table QR -> menu -> حسابي -> OTP login -> captain stamps 6x -> customer sees reward -> captain redeems -> card resets
// + re-checks the existing Ready-to-order flow and checks RTL at phone (390px) and iPad widths.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createApp } = require('../server');

(async () => {
  const shots = process.argv[2] || null; if (shots) fs.mkdirSync(shots, { recursive: true });
  let clock = Date.now(); const codes = {};
  const app = createApp({ now: () => clock, sendOtp: async (p, c) => { codes[p] = c; }, staticRoot: path.resolve(__dirname, '../../..'), secureCookies: false, secret: 'e2e' });
  app.setStaff('kareem', 'captain', 'كريم', 'demo-pass-1');
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const browser = await chromium.launch();
  const snap = async (page, name) => shots && page.screenshot({ path: path.join(shots, name + '.png') });
  const ntfy = [];

  // ---------- customer phone (390px) ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.route('https://ntfy.sh/**', r => { ntfy.push(r.request().postData()); r.fulfill({ status: 200, body: '{}', contentType: 'application/json' }); });
  await phone.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await phone.newPage();
  const loaded = [];
  p.on('request', r => loaded.push(r.url()));
  await p.goto(base + '/?table=7#tracks');
  await p.waitForSelector('[data-acct]');
  assert.ok(!loaded.some(u => u.includes('account.js')), 'loyalty code must not load with the menu');

  // existing Ready to order flow still works
  await p.click('[data-call]'); await p.click('[data-send="call"]');
  await p.waitForSelector('text=On the way!');
  assert.match(ntfy[0], /"type":"call","table":"7"/);
  await p.click('.sheet [data-close] >> nth=1');

  // حسابي -> OTP login
  await p.click('[data-acct]');
  await p.waitForSelector('#lc-in');
  assert.equal(await p.getAttribute('.panel.lc', 'dir'), 'rtl');
  await snap(p, '1-phone-login');
  await p.fill('#lc-in', '010 1234 5678'); await p.click('.lc-form button');
  await p.waitForSelector('[autocomplete="one-time-code"]');
  assert.ok(codes['01012345678'], 'OTP sent server-side');
  assert.ok(!(await p.content()).includes(codes['01012345678']), 'OTP never shown to the client');
  await snap(p, '2-phone-otp');
  await p.fill('#lc-in', codes['01012345678']); await p.click('.lc-form button');
  await p.waitForSelector('.lc-grid');
  assert.equal(await p.locator('.lc-slot.on').count(), 0);
  await snap(p, '3-card-empty');

  // ---------- captain iPad ----------
  const ipad = await browser.newContext({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1 });
  await ipad.addInitScript(() => localStorage.setItem('sq-captain', 'cc117e96c501749011eab74d92280ecb8f4ab82be6a7c830b6da36200251bc10'));
  await ipad.route('https://ntfy.sh/**', r => r.fulfill({ status: 200, body: '', contentType: 'text/event-stream' }));
  await ipad.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const c = await ipad.newPage();
  await c.goto(base + '/captain-ly9fglcp.html');
  await c.click('#t-card');
  await c.waitForSelector('#cc-login');
  await c.fill('[name=u]', 'kareem'); await c.fill('[name=p]', 'demo-pass-1'); await c.click('#cc-login button');
  await c.waitForSelector('[data-id]'); // customer appears under table 7
  assert.match(await c.textContent('[data-id]'), /7.*010•••••678/s);
  await c.fill('[name=q]', '01012345678'); await c.click('#cc-find button');
  await c.waitForSelector('[data-stamp]');
  for (let i = 1; i <= 6; i++) {
    await c.click('[data-stamp]');
    await c.waitForSelector('text=✓ اتختمت الزيارة');
    await p.waitForFunction(n => document.querySelectorAll('.lc-slot.on').length === n, i); // live update on the phone
    clock += 3 * 3600e3 + 1000;
    if (i < 6) {
      await c.click('#cc-find button');
      await c.waitForSelector('[data-stamp]:not([disabled]), #cc-login');
      if (await c.isVisible('#cc-login')) { // staff sessions last 12h; the test clock just jumped past that
        await c.fill('[name=u]', 'kareem'); await c.fill('[name=p]', 'demo-pass-1'); await c.click('#cc-login button');
        await c.waitForSelector('#cc-find'); await c.click('#cc-find button');
      }
      await c.waitForSelector('[data-stamp]:not([disabled])');
    }
  }
  await c.click('#cc-find button'); await c.waitForSelector('[data-redeem]:not([disabled])');
  assert.ok(await c.isDisabled('[data-stamp]'), 'no stamping on a full card');
  await snap(c, '5-captain-full');
  await p.waitForSelector('.lc-ready');
  await snap(p, '4-card-reward-ready');
  await c.click('[data-redeem]');
  await c.waitForSelector('text=✓ اتسلمت المكافأة');
  await p.waitForFunction(() => document.querySelectorAll('.lc-slot.on').length === 0 && !document.querySelector('.lc-ready'));
  await p.click('[data-account]'); await p.waitForSelector('.lc-stat');
  assert.match(await p.textContent('.lc-stat'), /1/);
  await snap(p, '6-account-after-redeem');
  await snap(c, '7-captain-after-redeem');

  // captain's original tab still works
  await c.click('#t-orders'); assert.ok(await c.isVisible('#main')); assert.ok(await c.isHidden('#p-card'));

  // no horizontal overflow at 390px
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390));
  await browser.close(); app.server.closeAllConnections(); app.server.close();
  console.log('E2E OK');
})().catch(e => { console.error(e); process.exit(1); });
