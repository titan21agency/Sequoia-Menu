# Titan Agency — Sequoia System: Full Handoff

> **للـ agent اللي هيستلم:** الملف ده فيه كل حاجة عن السيستم: الفكرة، كل صفحة، كل API، قاعدة البيانات، السيرفر، الإعدادات، الأسرار (أسماؤها بس، مش قيمها)، المشاكل المعروفة، وفي الآخر **كود المشروع كامل** حرف بحرف. السورس الأساسي: `https://github.com/titan21agency/Sequoia-Menu` (branch `main`).
>
> **To the receiving agent:** this file is the complete specification of the system, followed by the **full source code** of every text file (Appendix A). The binary images are in the accompanying ZIP and on GitHub. Nothing has been summarised away: where this spec and the code disagree, the code is the truth.

Snapshot: `main` @ `fbe3215` (2026-11-11), plus branch `ccr-a6173082-fso01r` (server repair, not yet merged; see §9).

---

## 1. Business context

| | |
|---|---|
| Agency | **Titan Agency** (titan22agency.com). GitHub org: `titan21agency` (note: 21, the domain is 22) |
| First client | **Sequoia Café**, Mansoura, Egypt. Riverside café, "Est. 2026". Brand: navy/cream/beige, a "mixtape / cassette / Walkman" theme |
| Other client on the same server | **Enzo** (separate site/app, not in this repo). Its API uses port 3200 on the server |
| Owner/admin name used in payroll | Faris (`faris`, admin) |
| Language | Egyptian Arabic for staff UIs; menu is English by default with an Arabic toggle |
| Currency | EGP |

**Goal of the next phase:** publish this as a proper application on the server, and grow it into a reusable agency product for other sectors (restaurants/cafés first, then other verticals).

## 2. The system at a glance

| # | Product | URL (production) | Code | Runtime |
|---|---|---|---|---|
| 1 | **Digital menu** (customer, opened from a QR on each table) | `https://sequoia.menu.titan22agency.com/?t=<table>&s=<sig>` | `index.html`, `assets/menu.js`, `assets/landing*.js`, `assets/orders.js`, `assets/config.js` | Static files served by Caddy |
| 2 | **Table service** (call captain, ask for bill + payment method, quick requests) | inside the menu | `assets/menu.js`, `assets/orders.js` | → Sequoia API `/api/calls` |
| 3 | **Captain dashboard** (iPad, live table requests, timers, sound, daily report) | `https://sequoia.menu.titan22agency.com/captain-ly9fglcp.html` (secret path) | `captain-ly9fglcp.html`, `assets/captain.js` | Staff login → SSE stream |
| 4 | **Sequoia Card** (loyalty: stamps → free drink; customer "حسابي") | inside menu + captain tab "كارت سيكويا" | `apps/loyalty/*`, `assets/account.js`, `assets/captain-card.js` | Node 22 + SQLite, systemd `sequoia-loyalty`, port **3300** |
| 5 | **WhatsApp login** (OTP via Message Pro, or "send SEQ-code from WhatsApp") | inside menu | `apps/loyalty/otp.js`, `server.js`, `setup-messagepro.html`, `assets/setup.js` | Message Pro (Chatwoot-based) |
| 6 | **Google review invite** (after bill request; captain can send review link by WhatsApp or QR) | inside menu + captain | `assets/menu.js`, `assets/captain.js`, `assets/vendor/qrcode.js` | `GOOGLE_REVIEW_URL` |
| 7 | **Cover page sections**: Sequoia Journal (printed-style magazine), Clubs, social links | menu cover | `assets/landing.js`, `assets/landing-data.js` | Content in `landing-data.js` |
| 8 | **Report sheet** (every handled request → Google Sheet, daily summary) | Google Sheet `1pgqQNBRRLBSHdvkM8scMMk0Q4mMi79cFb3LR7CexjGY` | `tools/report-sheet.gs` | Google Apps Script web app |
| 9 | **Titan Payroll** (employees, KPIs, deductions, points, bonus, attendance, users/roles, audit log) | `https://payroll.titan22agency.com` | `apps/payroll/server.js`, `apps/payroll/public/index.html` | Node 22 + SQLite, systemd `titan-payroll`, port **3100** |
| 10 | **Agency site** placeholder | `https://titan22agency.com` | inline in `tools/server-setup.sh` | Static `/srv/sites/agency` |

No npm dependencies anywhere: plain HTML/CSS/JS on the front end, Node 22 built-ins (`node:http`, `node:sqlite`, `node:crypto`) on the back end.

## 3. Repository layout

```
index.html                 menu shell (all CSS inline, scripts external; CSP script-src 'self')
captain-ly9fglcp.html      captain screen shell (secret URL)
setup-messagepro.html      one-time page to paste the Message Pro token + webhook secret (uses assets/setup.js)
assets/
  config.js                front-end settings: Google review URL, Instagram/Facebook/TikTok/WhatsApp links
  landing-data.js          Journal + Clubs content ([Arabic, English] pairs)
  landing.js               renders cover sections, journal viewer
  menu.js                  MENU DATA (all items/prices), screens, language, table service, review invite
  orders.js                transport for calls: POST /api/calls, staff stream /api/staff/calls/stream
  captain.js               captain dashboard logic
  captain-card.js          captain "كارت سيكويا" tab (lazy-loaded)
  account.js               customer "حسابي" + loyalty card (lazy-loaded)
  setup.js                 logic for setup-messagepro.html
  vendor/qrcode.js         QR generator (vendored)
  *.webp / *.png / *.jpg   brand images (see §6.4)
apps/loyalty/              Sequoia API (card, OTP, calls, webhook, staff) + tests
apps/payroll/              Titan Payroll (server + single-page UI)
tools/
  server-setup.sh          fresh Ubuntu 24.04 server: updates, ufw, fail2ban, Caddy, agency + menu sites
  loyalty-setup.sh         installs Sequoia API (systemd :3300, env file, backups, Caddy /api proxy)
  payroll-setup.sh         installs Titan Payroll (systemd :3100, backups, Caddy host)
  repair-server.sh         (branch ccr-a6173082-fso01r) per-site Caddy files + safe repair
  report-sheet.gs          Google Apps Script for the report sheet
  check-secrets.sh         scan repo for leaked secrets before pushing
  trace-tree.py            traced the logo tree PNG into the inline SVG path
Sequoia-Menu.zip           old upload archive (not used; flagged by check-secrets)
```

## 4. Customer menu (detailed behaviour)

**Screens (hash routes):** `#` cover → `#tracks` (track list = sections) → `#s-1 … #s-9` (section pages with chips, prev/next "Rewind / Next track") → thanks screen ("THANK YOU / نورتنا", "PLAY IT AGAIN").

**Theme copy (EN / AR):** "Est. 2026 · Mansoura / من 2026 · المنصورة"; tagline "Riverside coffee, warm moments. / قهوة على النيل ومود حلو"; button "PRESS PLAY · OPEN MENU / شغّل المنيو"; list title "The Sequoia Mixtape · Vol. 01 / شريط سيكويا · الجزء 01"; "Pick a track, we'll press play."; "All prices in EGP"; Side A / Side B.

**Language:** English default; toggle button `ع` / `EN`; saved in `localStorage['sq-lang']`; Arabic switches `dir=rtl` and fonts.

**Fonts (Google Fonts):** Abril Fatface, Barlow, Barlow Semi Condensed, IBM Plex Sans Arabic, Libre Bodoni.

**Colour tokens:** navy `#1F2A44`, navy-deep `#141B2D`, beige `#DACBB4`, cream `#F4EEE2`, ink-2 `#3A4560`, ink-3 `#4A5470`, tan `#6B5330`, accent `#B8432F`, focus `#E0A458`, gold `#C8A464`, sage `#8FA68A`, grey `#A9AEB8`, paper `#EFE6D3`, band `#2B3247`, ok-green `#7BC48A`. Easing `cubic-bezier(0.23,1,0.32,1)`. Max width 480 px (phone card on desktop, 28 px radius).

**Table detection:** the table number comes only from the QR: `?t=7&s=<12-char HMAC>` (signed) or legacy `?table=7` (accepted only while `TABLE_QR_LEGACY=1`). Without a table, service buttons are hidden.

**Table service sheet ("Ready to order / جاهزين نطلب"):**
- Call captain → kind `call`.
- Ask for the bill → kind `bill`, payment: `cash` كاش / `card` كارت / `instapay` InstaPay.
- Quick requests → kind `req`: `water` مياه / `napkins` مناديل / `clean` تنضيف الترابيزة.
- Each request gets a client `rid`; sent state is stored in `localStorage['sq-sent']`, last one in `sq-last`, shown on the dock with a pulsing dot.
- After a bill request: a one-time **Google review invite** card (gold button) → `GOOGLE_REVIEW_URL`.

**Account ("حسابي"):** user icon → loads `assets/account.js` lazily → phone login (OTP) or WhatsApp-message login → card with stamp slots (3-column grid), progress bar, "next stamp at", reward ready banner. Live updates via `/api/me/stream`. Accepts Arabic-Indic digits.

## 5. Full menu data (9 sections, 76 items) — source: `assets/menu.js` `SECTIONS`

### 1. Hot Drinks — مشروبات ساخنة

| # | English | العربي | EGP |
|---|---|---|---|
| 1 | Turkish Coffee — Single | قهوة تركي سنجل | 45 |
| 2 | Turkish Coffee — Double | قهوة تركي دبل | 55 |
| 3 | Tea | شاي | 35 |
| 4 | Flavored Tea | شاي بنكهات | 40 |
| 5 | Cappuccino | كابتشينو | 85 |
| 6 | Espresso — Single | إسبريسو سنجل | 55 |
| 7 | Espresso — Double | إسبريسو دبل | 70 |
| 8 | Americano | أمريكانو | 70 |
| 9 | Macchiato — Single | ماكياتو سنجل | 60 |
| 10 | Macchiato — Double | ماكياتو دبل | 75 |
| 11 | Cortado | كورتادو | 85 |
| 12 | Flat White | فلات وايت | 125 |
| 13 | Hot Spanish Latte | سبانش لاتيه سخن | 135 |
| 14 | French Coffee | قهوة فرنساوي | 60 |
| 15 | Nescafé | نسكافيه | 75 |

### 2. Iced Coffee — قهوة مثلجة

| # | English | العربي | EGP |
|---|---|---|---|
| 1 | Iced Latte | آيس لاتيه | 95 |
| 2 | Iced Cappuccino | آيس كابتشينو | 115 |
| 3 | Iced Spanish Latte | آيس سبانش لاتيه | 140 |
| 4 | Iced Americano | آيس أمريكانو | 100 |
| 5 | Iced Mocha | آيس موكا | 125 |
| 6 | Iced White Mocha | آيس وايت موكا | 135 |
| 7 | Iced Caramel Latte | آيس كراميل لاتيه | 110 |

### 3. Frappé — فرابيه

| # | English | العربي | EGP |
|---|---|---|---|
| 1 | Vanilla Frappé | فرابيه فانيليا | 130 |
| 2 | Chocolate Frappé | فرابيه شوكولاتة | 130 |
| 3 | Caramel Frappé | فرابيه كراميل | 135 |
| 4 | Strawberry Frappé | فرابيه فراولة | 125 |
| 5 | Mocha Frappé | فرابيه موكا | 135 |
| 6 | White Mocha Frappé | فرابيه وايت موكا | 140 |
| 7 | Espresso Frappé | فرابيه إسبريسو | 130 |
| 8 | Matcha Frappé | فرابيه ماتشا | 140 |

### 4. Milkshake — ميلك شيك

| # | English | العربي | EGP |
|---|---|---|---|
| 1 | Vanilla Milkshake | ميلك شيك فانيليا | 120 |
| 2 | Chocolate Milkshake | ميلك شيك شوكولاتة | 130 |
| 3 | Mango Milkshake | ميلك شيك مانجو | 130 |
| 4 | Strawberry Milkshake | ميلك شيك فراولة | 130 |
| 5 | Caramel Milkshake | ميلك شيك كراميل | 130 |
| 6 | Lotus Milkshake | ميلك شيك لوتس | 130 |
| 7 | Blueberry Milkshake | ميلك شيك بلوبيري | 130 |

### 5. Fresh Juices — عصائر فريش

| # | English | العربي | EGP |
|---|---|---|---|
| 1 | Mango Juice | عصير مانجو | 90 |
| 2 | Strawberry Juice | عصير فراولة | 90 |
| 3 | Guava Juice | عصير جوافة | 90 |
| 4 | Lemon Juice | عصير ليمون | 70 |
| 5 | Lemon Mint Juice | ليمون نعناع | 80 |
| 6 | Banana Milk | موز باللبن | 90 |
| 7 | Orange Juice | عصير برتقال | 90 |

### 6. Mojito — موهيتو

| # | English | العربي | EGP |
|---|---|---|---|
| 1 | Classic Mojito | موهيتو كلاسيك | 90 |
| 2 | Blueberry Mojito | موهيتو بلوبيري | 110 |
| 3 | Mango Mojito | موهيتو مانجو | 110 |
| 4 | Strawberry Mojito | موهيتو فراولة | 110 |
| 5 | Piña Colada Mojito | موهيتو بينا كولادا | 130 |
| 6 | Peach Mojito | موهيتو خوخ | 110 |
| 7 | Mixed Berry Mojito | موهيتو ميكس بيري | 120 |
| 8 | Tropical Mojito | موهيتو تروبيكال | 135 |
| 9 | Jelly Cola Mojito | موهيتو جيلي كولا | 110 |
| 10 | Watermelon Mojito | موهيتو بطيخ | 110 |

### 7. Smoothie — سموذي

| # | English | العربي | EGP |
|---|---|---|---|
| 1 | Blueberry Smoothie | سموذي بلوبيري | 110 |
| 2 | Mango Smoothie | سموذي مانجو | 120 |
| 3 | Strawberry Smoothie | سموذي فراولة | 120 |
| 4 | Mixed Berry Smoothie | سموذي ميكس بيري | 115 |
| 5 | Kiwi Smoothie | سموذي كيوي | 110 |
| 6 | Passion Fruit Smoothie | سموذي باشن فروت | 120 |
| 7 | Cola Smoothie | سموذي كولا | 115 |
| 8 | Watermelon Smoothie | سموذي بطيخ | 120 |
| 9 | Peach Smoothie | سموذي خوخ | 115 |
| 10 | Mixed Piña Colada | ميكس بينا كولادا | 135 |
| 11 | Lemon Smoothie | سموذي ليمون | 90 |
| 12 | Lemon Mint Smoothie | سموذي ليمون نعناع | 100 |

### 8. Desserts — حلويات

| # | English | العربي | EGP |
|---|---|---|---|
| 1 | Molten Cake | مولتن كيك | 130 |
| 2 | Red Velvet Cake | ريد فيلفت كيك | 105 |
| 3 | Cheesecake | تشيز كيك | 135 |
| 4 | Chocolate Fudge | شوكولاتة فدج | 135 |

### 9. Extras — إضافات

| # | English | العربي | EGP |
|---|---|---|---|
| | **Additional Drinks — مشروبات إضافية** | | |
| 1 | Small Mineral Water | مياه معدنية صغيرة | 15 |
| 2 | Red Bull | ريد بول | 100 |
| 3 | Red Bull Mojito | موهيتو ريد بول | 170 |
| | **Additions — إضافات** | | |
| 4 | Latte Art | لاتيه آرت | 35 |
| 5 | Sauce | صوص | 25 |
| 6 | Milk | لبن | 15 |

To change items or prices: edit the `SECTIONS` array in `assets/menu.js` (`[English, price, Arabic]`). Section 9 ("Extras") has two labelled groups.

## 6. Captain dashboard, loyalty, WhatsApp, review, journal

### 6.1 Captain dashboard (`captain-ly9fglcp.html` + `assets/captain.js`)
- Secret URL, then **staff username + password** (server session 12 h, cookie `sq_staff`, SameSite Strict). Old client-side PIN removed.
- Live list of tables with pending requests from `GET /api/staff/calls/stream` (SSE; last 12 h replayed on connect).
- Request labels: `call` → "عايزين يطلبوا"; `bill` → "الحساب · كاش/كارت/InstaPay"; `req` → مياه / مناديل / تنضيف الترابيزة.
- Age colours: **warm** after 2 min, **hot** after 5 min. Times in Arabic 12-h ("ص/م"), "من X دقايق".
- "Took it" (`took`) and "رجّعها" undo (`undo`) via `POST /api/staff/calls`.
- Handled requests are logged to the report sheet after a **2-minute delay** (so undo can cancel) via `POST /api/staff/report` (server forwards to Apps Script with a token).
- Business day starts at **6 AM**; daily summary on screen.
- Sound chime (Web Audio, armed by a tap on the sound button) and keep-screen-on.
- Bill requests: send the Google review link to the guest by **WhatsApp** (uses `GET /api/staff/review-contacts?table=N`: customers seated at that table in the last 3 h, masked phone + `wa` number) or show a **QR** (vendored `qrcode.js`).
- Tab **كارت سيكويا** (`assets/captain-card.js`): search customer by phone, see card, add stamp / redeem reward, see who is seated at which table.

### 6.2 Sequoia Card (loyalty) — `apps/loyalty/`
Rules (`apps/loyalty/config.js`; owner still has to confirm the placeholders):

| Setting | Value |
|---|---|
| `STAMPS_REQUIRED` | 6 (placeholder) |
| `REWARD_NAME` | "مشروبك المميز علينا" (placeholder) |
| `MIN_HOURS_BETWEEN_STAMPS` | 3 (blocks double-stamping a visit) |
| `STAMP_EXPIRY_DAYS` | null (never expire) |
| OTP | TTL 5 min, 5 attempts, resend 60 s, max 5/phone/hour, 15/IP/hour |
| Sessions | customer 180 days (HttpOnly cookie `sq_card`; `sq_pending` for WhatsApp-message login), staff 12 h |

Logic (`rules.js`): card state = stamps in the current cycle (not expired), capped at required; stamp blocked if `card_full` or `too_soon`; redeem only when full, then a new cycle starts. Egyptian phone normalisation accepts `+20`, `0020`, `20 1…`, `1…`, Arabic-Indic digits → `01[0125]XXXXXXXX`. Masking: `010•••••123`.

**SQLite schema (`loyalty.db`):** `customers(id, phone UNIQUE, created_at, last_visit_at, cycle)`, `staff(id, username UNIQUE, name, role captain|admin, pass, active)`, `stamps(id, customer_id, staff_id, table_number, created_at, cycle_id, request_id UNIQUE)`, `rewards(id, customer_id, staff_id, redeemed_at, cycle_id, request_id UNIQUE, UNIQUE(customer_id,cycle_id))`, `audit_log(id, at, actor_type, actor_id, action, customer_id, detail, ip, device)`, `otps(phone PK, code_hash, expires, attempts, sent_at)`, `sessions(token_hash PK, kind customer|staff, subject_id, expires)`, `presence(customer_id PK, table_number, at)`, `inbound_logins(nonce_hash PK, code, expires, phone, created_at)`, `calls(id, at, table_number, body)` + indexes. WAL, `synchronous=NORMAL`, busy_timeout, prepared-statement cache.

**API (all under `/api`, same origin; CSRF header `X-Requested-With: sequoia` on writes):**

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/hooks/messagepro` | Message Pro | inbound WhatsApp login webhook (HMAC signed) |
| POST | `/setup/messagepro` | one-time link | save token + webhook secret (from `setup-messagepro.html`) |
| POST | `/otp/request` | customer | send OTP to phone |
| POST | `/otp/verify` | customer | verify code → customer session |
| GET | `/login/options` | customer | `{otp, whatsapp}` |
| POST | `/otp/inbound/start` | customer | start "send SEQ-123456 from WhatsApp" login |
| GET | `/otp/inbound/status` | customer | poll inbound login |
| POST | `/calls` | menu (signed table) | call / bill / req |
| GET | `/me`, `/me/stream`; POST `/me/logout` | customer | card, live updates (also records presence at table) |
| POST | `/staff/login`, `/staff/logout`; GET `/staff/me`, `/staff/stream` | staff | session, rules, live |
| GET | `/staff/calls/stream`; POST `/staff/calls` | staff | table requests; took/undo |
| POST | `/staff/report` | staff | forward handled rows to Google Sheet |
| GET | `/staff/tables` | staff | seated customers (last 3 h) |
| GET | `/staff/review-contacts?table=N` | staff | phones at a table for review link |
| GET | `/staff/customer` | staff | lookup by phone |
| POST | `/staff/stamp`, `/staff/redeem` | staff | add stamp / redeem (idempotent `request_id`) |

**CLI:** `node apps/loyalty/server.js set-staff <username> captain|admin "<name>"`, `setup-link`, `table-links <base-url> <from> <to>` (prints signed QR URLs; signature = HMAC with `LOYALTY_SECRET`, so changing the secret means reprinting QRs).

**Tests:** `node --test apps/loyalty/test/*.test.js` (rules, OTP, API, inbound, calls, setup) + `test/e2e.js` (Playwright screenshots) + `test/bench.js`. Benchmarks are in `apps/loyalty/README.md`.

### 6.3 WhatsApp (Message Pro)
- Provider: **Message Pro** (`https://omni.message-pro.com`, Chatwoot-based), account **129**, inbox **147** ("Browser WhatsApp", a WhatsApp Web session, so no templates). Header `api_access_token`. Contacts are found via `/contacts/filter`.
- Alternative provider: Meta WhatsApp Cloud API (`graph.facebook.com/v21.0/<phoneId>/messages`, approved auth template).
- Option B (inbound): customer sends `SEQ-123456` to `SEQUOIA_WA_NUMBER`; webhook verifies `X-Chatwoot-Signature = sha256=HMAC(secret, "<X-Chatwoot-Timestamp>.<body>")` (max 5 min old) and binds the sender's phone.
- Production currently has `WHATSAPP_PROVIDER=off` until the token is set.
- The `open` workflow in Message Pro assigns conversations to "Sequoia Assistant" (AI); OTP chats will appear there.

### 6.4 Brand assets (binary, in the ZIP / GitHub)
`tree-navy.png/.webp` (favicon), `tree-cream.png/.webp`, `logo-lockup-cream.png` (also an inline SVG in `menu.js`), `mascot-walkman.webp` (cover), `mascot-cassette.png`, `mascot-cassette-v3.webp`, `navy-texture.jpg`, `navy-texture-v2.webp` (background, q90), `forest-navy.jpg/.webp`.

### 6.5 Links and IDs (`assets/config.js` and elsewhere)
- Google review: `https://g.page/r/CdlSTIN6djjmEBE/review`
- Instagram `https://www.instagram.com/sequoiacafe.eg` · Facebook `https://www.facebook.com/share/1F9akPHx5p/` · TikTok `https://www.tiktok.com/@sequoia.cafe` · WhatsApp `https://wa.me/201044401212`
- Report Google Sheet ID `1pgqQNBRRLBSHdvkM8scMMk0Q4mMi79cFb3LR7CexjGY`; Apps Script `/exec` URL is in `tools/loyalty-setup.sh` (`REPORT_SHEET_URL`). Sheet tabs: `Log` (business_day, table, kind, detail, requested, handled, wait_seconds, rid; de-duplicated by rid; max 200 rows/post) and `Daily` (QUERY formulas: requests, avg/max wait per day, pivot by kind).

### 6.6 Journal and Clubs (`assets/landing-data.js`)
Journal "Vol. 01 / العدد 01", "Nov 2026", "Stories from the table / حكايات من على الترابيزة"; pages are empty, so the card shows "coming soon". Clubs list is empty (teaser only). Page images go in `assets/journal/<issue>/page-NN.webp` (~1400 px).

## 7. Titan Payroll (`apps/payroll`)
Arabic RTL single-page app; tabs: **الفريق** (team), **البروفايل** (profile: salary + data), **الحضور** (attendance), **سجل التعديلات** (audit), **الإعدادات** (settings). Month picker; CSV export.

**Roles:** `admin` > `editor` > `viewer`. Only admin changes base salary / fixed %, users, settings. Can't remove own admin. Cookie `tp_session`.

**Salary formula (`calc()` in `public/index.html`):**
- `fixed = base × fixed_pct%` (default 70 %), `varPool = base − fixed`, `day = fixed / work_days` (default 26).
- Deduction days = absence×1 + late×0.25 + minor×0.5 + major×1 (weights in settings); `deduction = min(fixed, days × day)`.
- KPI score = 0.4 × quality (capacity & delivery quality) + 0.2 × meetings/content + 0.4 × delivery/deadline (each 0–100); `variable = varPool × score / 100`.
- Bonus: month `bonus_budget` split by each employee's share of the month's points.
- **net = fixed − deduction + variable + bonus.** Labels: ≥85 ممتاز, ≥65 متوسط, else محتاج متابعة.
- Months can be **locked**.

**Attendance:** per employee per day: present / absent / late / leave / half (حاضر / غايب / متأخر / إجازة / نص يوم), check-in/out, override hours, note; shift default 09:00 for 8 h, 15-min grace for late; overnight shifts handled; "team arrival box" for quick daily check-in; autosave.

**Schema:** `users`, `sessions`, `employees(name, role, phone, start, base, fixed_pct, notes, archived)`, `records(month, emp_id, absence, late, minor, major, quality, meetings, delivery, notes)`, `points(month, emp_id, points, reason, at, by_user)`, `months(month, bonus_budget, locked)`, `settings(work_days, absence, late, minor, major, shift_start, shift_hours)`, `attendance(...)`, `audit(at, user, action, entity, label, before, after)`.

**CLI:** `node apps/payroll/server.js set-user <username> <admin|editor|viewer> "<name>" [password]`; `backup <dir>` (keeps 30 files). Cron backup daily 03:00 → `/var/backups/titan-payroll`.

## 8. Server and deployment (production today)

| Item | Value |
|---|---|
| Host | DigitalOcean droplet, Ubuntu 24.04, root SSH; ufw (SSH, 80, 443), fail2ban, unattended-upgrades |
| Web server | **Caddy** (automatic HTTPS). Config `/etc/caddy/Caddyfile` + per-site files `/etc/caddy/sites/*.caddy` |
| Menu files | `/srv/sites/sequoia` (git clone of main, pulled every 5 min by cron `/etc/cron.d/sequoia-pull` as user caddy). Hidden paths: `/.git* /tools/* /apps/* /*.zip /.claude/*` → 404 |
| Apps checkout | `/opt/titan-apps` (clone of main, pulled every 5 min by `titan-payroll-update`; services restart on new commit) |
| Sequoia API | systemd `sequoia-loyalty`, user `sequoia`, **port 3300**, env `/etc/sequoia-loyalty.env` (600), data `/var/lib/sequoia-loyalty/loyalty.db`, daily backup 03:30 (7 weekday files) |
| Payroll | systemd `titan-payroll`, user `payroll`, **port 3100**, data `/var/lib/titan-payroll`, backups `/var/backups/titan-payroll` |
| Enzo | separate, **port 3200** (not in this repo) |
| Caddy menu site | `handle /api/*` → `127.0.0.1:3300` (`flush_interval -1` for SSE); static with zstd/gzip; images cached 1 week, everything else `no-cache`; headers: HSTS, nosniff, Referrer-Policy same-origin, X-Frame-Options DENY, Permissions-Policy, COOP, strict **CSP** (`script-src 'self'`; fonts from Google only) |
| DNS | `titan22agency.com`, `www`, `sequoia.menu`, `payroll` → droplet IP. If behind Cloudflare, two-level names (`sequoia.menu`) must be **DNS only (grey cloud)**; otherwise the browser shows ERR_SSL_VERSION_OR_CIPHER_MISMATCH |

**Environment variables (`/etc/sequoia-loyalty.env`)**: names only, never commit values:
`NODE_ENV=production`, `NODE_NO_WARNINGS=1`, `PORT=3300`, `LOYALTY_DATA`, `LOYALTY_SECRET` (random 32 bytes; signs QR + OTP), `TABLE_QR_LEGACY` (1 until signed QRs are printed), `WHATSAPP_PROVIDER` (off|messagepro|meta), `MESSAGEPRO_TOKEN`, `MESSAGEPRO_ACCOUNT_ID=129`, `MESSAGEPRO_INBOX_ID=147`, `MESSAGEPRO_BASE` (optional), `MESSAGEPRO_WEBHOOK_SECRET`, `SEQUOIA_WA_NUMBER`, `REPORT_SHEET_URL`, `REPORT_SHEET_TOKEN`; Meta alternative: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`. Payroll: `PAYROLL_DATA`, `PORT=3100`.

**Install order on a fresh server:** `tools/server-setup.sh` → `tools/payroll-setup.sh` → `tools/loyalty-setup.sh` → create staff with `set-staff` → print signed table QRs with `table-links` → set Message Pro token via `setup-messagepro.html` (one-time link from `setup-link`) → set the Apps Script `TOKEN` property and redeploy.

**Local dev:** `STATIC_ROOT=. node apps/loyalty/server.js` → `http://127.0.0.1:3200/?table=7` and `/captain-ly9fglcp.html` (OTP printed in console). Payroll: `PAYROLL_DATA=./.data node apps/payroll/server.js` → `:3100`.

## 9. Known problems and open items (must read)
1. **Outage after the Enzo work:** the menu and captain went down. Most likely cause: a setup script replaced `/etc/caddy/Caddyfile` (Enzo's, or `tools/server-setup.sh` on main, which still writes the whole file), and/or Cloudflare proxy on `sequoia.menu` (SSL error). Fix: branch `ccr-a6173082-fso01r` adds `tools/repair-server.sh` (backs up the config, moves each site into `/etc/caddy/sites/<site>.caddy`, validates, rolls back on error) and changes setup scripts to never overwrite the main Caddyfile. **Not merged into main yet**, and it conflicts with main's newer `server-setup.sh`/`loyalty-setup.sh`; reconcile so the `sequoia.caddy` written by `loyalty-setup.sh` (with `/api` → 3300 and the security headers) is the one kept.
2. **Port docs mismatch:** `apps/loyalty/README.md` says Caddy should proxy to 3200, but production uses **3300** (3200 is Enzo). Use 3300.
3. Loyalty rules (`STAMPS_REQUIRED`, `REWARD_NAME`) are placeholders awaiting owner confirmation.
4. `WHATSAPP_PROVIDER=off` in production until the Message Pro token is set; Option B needs `MESSAGEPRO_WEBHOOK_SECRET` and `SEQUOIA_WA_NUMBER`.
5. `TABLE_QR_LEGACY=1` until new signed QR codes are on the tables; then set 0.
6. Report sheet: Apps Script must have the `TOKEN` property and be redeployed, or the old public URL keeps accepting rows.
7. `Sequoia-Menu.zip` in the repo root is an old archive; delete it (check-secrets flags it).
8. `/staff/tables` runs ~4 queries per seated customer; batch it if it gets slow.
9. Single-tenant: everything is hard-coded for Sequoia (brand, menu, IDs). See §10.

## 10. Turning this into an agency product (guidance for the next agent)
- **Multi-tenant:** move `SECTIONS`, `TXT`, colours, fonts, logo, `config.js` and `landing-data.js` into a per-client record (DB or JSON per tenant); key by host name (`<client>.menu.titan22agency.com`) or path.
- **Admin panel** for owners: edit menu/prices/photos, tables + QR printing, staff accounts, loyalty rules, journal/clubs, links.
- **Reusable modules** already here: QR table service + captain screen (any restaurant/café/hotel/clinic waiting room), loyalty card with WhatsApp OTP (any retail), payroll/KPI/attendance (any SME), Google review funnel (any local business), report sheet.
- Keep the conventions: no build step, Node 22 built-ins, SQLite per app, systemd unit + per-site Caddy file per app, strict CSP, secrets only in `/etc/*.env`, `bash tools/check-secrets.sh` before every push, Egyptian Arabic copy for staff.

## 11. Commit history (main)

```
fbe3215 2026-11-11 Merge pull request #3 from titan21agency/feature/landing-sections
67b9331 2026-11-11 Cover page: Sequoia Journal, Clubs teaser and social links below the cover
f39ba71 2026-11-11 Merge pull request #2 from titan21agency/feature/google-review
e48e42d 2026-11-11 Captain: send Google review link (WhatsApp or QR) from bill requests
24824e2 2026-11-11 Menu: Google review invite after a bill request
65e661f 2026-11-08 Payroll: team arrival box and attendance autosave
7191d2d 2026-11-08 Payroll: add per-employee attendance and daily hours
b15724d 2026-11-06 Message Pro: find contacts with /contacts/filter (account tokens may not use search)
191b983 2026-11-06 One-time setup page for the Message Pro token and webhook secret
ca2d7f1 2026-11-06 Move inline scripts to assets/menu.js and assets/captain.js; CSP script-src 'self'
19c5a6f 2026-11-06 Mood board: Walkman mascot on the cover, sharper cassette, exact sand color
16f76d4 2026-11-06 Cover: vector logo lockup; restore background texture detail
a5ad9de 2026-11-06 Add Sequoia API server setup (systemd on :3300, Caddy /api proxy); WHATSAPP_PROVIDER=off
1bd4c69 2026-11-06 Phase 3: faster API and lighter menu images
9bcda2b 2026-11-06 Sequoia Card: WhatsApp login via Message Pro; Phase 2 security
3fb4a21 2026-11-06 Add Sequoia Card loyalty prototype
4cc5443 2026-11-03 Add Titan Payroll app with logins, roles and audit log
61d8104 2026-11-03 Lock table number to the QR code; hide service without a table
e8d9aa6 2026-11-03 Add one-command setup script for the Titan server
3f110d8 2026-11-01 Move captain screen to a private link behind a PIN
f26edb0 2026-11-01 Rename Art to Latte Art
60a87a0 2026-11-01 Remove Bersion; set cover location to Mansoura
5704095 2026-11-01 Add Arabic/English toggle to the menu (English by default)
688de54 2026-11-01 Connect captain screen to the report sheet
3ba5412 2026-11-01 Point report script at the Sequoia report sheet
35665a2 2026-11-01 Add bill request, quick requests, daily summary and report-sheet logging
803f1a8 2026-11-01 Add Ready to order table calls and captain iPad screen
28be5c3 2026-10-25 Remove Arabic text from menu
1cd3058 2026-10-25 Add files via upload
15939d5 2026-10-25 Add files via upload
755e7bb 2026-10-25 Add files via upload
```

# Appendix A — Full source code (main @ fbe3215)

Every text file in the repository, verbatim. Binary images are listed only (they are in the ZIP).

- binary: `.nojekyll` (0 bytes)
- binary: `Sequoia-Menu.zip` (441556 bytes)
- binary: `assets/forest-navy.jpg` (29243 bytes)
- binary: `assets/forest-navy.webp` (5880 bytes)
- binary: `assets/logo-lockup-cream.png` (70999 bytes)
- binary: `assets/mascot-cassette-v3.webp` (67694 bytes)
- binary: `assets/mascot-cassette.png` (232066 bytes)
- binary: `assets/mascot-walkman.webp` (91710 bytes)
- binary: `assets/navy-texture-v2.webp` (100180 bytes)
- binary: `assets/navy-texture.jpg` (104178 bytes)
- binary: `assets/tree-cream.png` (11448 bytes)
- binary: `assets/tree-cream.webp` (6072 bytes)
- binary: `assets/tree-navy.png` (11627 bytes)
- binary: `assets/tree-navy.webp` (6754 bytes)

## `apps/loyalty/.gitignore`

~~~~text
.data/
~~~~

## `apps/loyalty/README.md`

~~~~markdown
# Sequoia Card (loyalty) — prototype

Node 22+, no npm dependencies (same approach as `apps/payroll`). SQLite file in `$LOYALTY_DATA`.

| File | What |
|---|---|
| `config.js` | Business rules (stamps required, reward name, cooldown hours, expiry) |
| `rules.js` | Pure card logic + phone normalisation/masking |
| `otp.js` | `sendOtp(phone, code)` — dev stub (logs on server), Message Pro (our omnichannel WhatsApp) or Meta WhatsApp Cloud API |
| `server.js` | API under `/api/*`, SSE live updates, staff CLI |
| `../../assets/account.js` | Customer **حسابي** + card (lazy-loaded from the menu) |
| `../../assets/captain-card.js` | Captain **كارت سيكويا** tab (lazy-loaded) |

## Run locally
```bash
NODE_NO_WARNINGS=1 node apps/loyalty/server.js set-staff kareem captain "كريم"
```
```bash
STATIC_ROOT=. NODE_NO_WARNINGS=1 node apps/loyalty/server.js
```
Open http://127.0.0.1:3200/?table=7 (menu) and http://127.0.0.1:3200/captain-ly9fglcp.html (captain). The OTP code prints in the server console.

## Tests
```bash
node --test apps/loyalty/test/*.test.js
```
```bash
node apps/loyalty/test/e2e.js ./shots
```

## Environment
| Var | Needed | Notes |
|---|---|---|
| `LOYALTY_SECRET` | production | 32+ random bytes; HMAC key for OTP hashes |
| `NODE_ENV=production` | production | turns on `Secure` cookies, requires the secret |
| `LOYALTY_DATA` | optional | DB folder (default `apps/loyalty/.data`) |
| `PORT` | optional | default 3200 |
| `WHATSAPP_PROVIDER=messagepro`, `MESSAGEPRO_TOKEN`, `MESSAGEPRO_ACCOUNT_ID=129`, `MESSAGEPRO_INBOX_ID=147` | for real WhatsApp (default choice) | Sends the code as a text message through our Message Pro WhatsApp channel (Browser WhatsApp, ID 147). Token: Message Pro → Account settings → Integrations → Developer API. Put it only in the server's env file, never in git or chat. `MESSAGEPRO_BASE` overrides the host. |
| `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` | alternative | Meta WhatsApp Cloud API + an approved authentication template with the code as `{{1}}` |

| `MESSAGEPRO_WEBHOOK_SECRET`, `SEQUOIA_WA_NUMBER` (e.g. `2010xxxxxxxx`) | optional | Turns on **login by WhatsApp message** (below). `MESSAGEPRO_INBOX_ID` also limits the webhook to that inbox. |

### Login by WhatsApp message (Option B)
حسابي shows **ادخل برسالة واتساب**. The server makes a one-time `SEQ-123456` (5 min) bound to that browser by an HttpOnly `sq_pending` cookie, and opens `wa.me/<SEQUOIA_WA_NUMBER>?text=SEQ-123456`. The customer sends it from their own WhatsApp; Message Pro posts `message_created` to `POST /api/hooks/messagepro`; the server checks the signature, takes the **sender's** phone from the payload and binds it to that code; the page polls `GET /api/otp/inbound/status` and gets the card session. No code is sent by us, so nothing unsolicited leaves the WhatsApp number.

Setup in Message Pro → Account settings → Integrations → Webhooks → *Add new webhook*: URL `https://<menu domain>/api/hooks/messagepro`, event **Message created** only. Copy its secret into `MESSAGEPRO_WEBHOOK_SECRET` on the server. Signature check: `X-Chatwoot-Signature = sha256=HMAC_SHA256(secret, "<X-Chatwoot-Timestamp>.<raw body>")`, max 5 min old; anything else gets 401 and binds nothing. If the first real delivery is rejected, the server logs `webhook: rejected`; check the header names the platform actually sends.

With `NODE_ENV=production` the server refuses to start without `WHATSAPP_PROVIDER` (the dev stub only prints codes to the console).

**Message Pro notes.** The Sequoia WhatsApp channel is a WhatsApp Web session, not Meta Cloud, so there are no templates; each code is a normal outgoing message in the customer's conversation (reused if one is open). The `open` workflow assigns new conversations to *Sequoia Assistant*: OTP conversations will show in the inbox and the AI may reply if the customer answers. Many unsolicited messages from a WhatsApp Web number can get it restricted by WhatsApp, which is why per-phone and per-IP limits stay strict.

## Security (Phase 2)
- **Table calls** (call waiter / bill / request) go to this server (`POST /api/calls`), not ntfy.sh. The captain screen reads them from `GET /api/staff/calls/stream` (staff session, last 12 h replayed). Took/undo: `POST /api/staff/calls`.
- **Captain screen** asks for a staff username + password (server session, 12 h) instead of the old client-side PIN. Create staff with `set-staff` above.
- **Signed table QR links**: `/?t=7&s=<12-char HMAC>`. Print new QRs from:
  ```bash
  node apps/loyalty/server.js table-links https://sequoia.menu.titan22agency.com/ 1 30
  ```
  The signature uses `LOYALTY_SECRET`, so changing the secret means reprinting. Old `?table=7` QRs keep working only while `TABLE_QR_LEGACY=1`; remove it once the new QRs are on the tables.
- **Report sheet**: the captain posts handled requests to `/api/staff/report`; the server forwards them with a token. Set `REPORT_SHEET_URL` + `REPORT_SHEET_TOKEN` here and the same `TOKEN` script property in Apps Script (see `tools/report-sheet.gs`), then redeploy the script, so the old public URL stops accepting rows.
- **Headers**: Caddy (`tools/server-setup.sh`) sends HSTS, CSP, nosniff, frame-deny, Referrer- and Permissions-Policy; the dev static server sends the same CSP.
- **Secrets check** before each push: `bash tools/check-secrets.sh`.

## Performance (Phase 3)
Measured on the same Windows dev machine, before → after. API: `node apps/loyalty/test/bench.js 5 32` (in-process server, SQLite WAL file, 2,000 customers, 60 seated, 500 calls; 32 concurrent clients, 5 s each). Menu: first load at 375 px, local server.

| API endpoint | req/s | p50 ms | p95 ms |
|---|---|---|---|
| `GET /api/me` | 1,069 → 1,234 | 26 → 20 | 48 → 55 |
| `GET /api/staff/tables` | 128 → 314 | 243 → 101 | 336 → 115 |
| `GET /api/staff/customer` | 845 → 1,325 | 32 → 23 | 78 → 34 |
| `POST /api/staff/stamp` | 256 → 685 | 122 → 34 | 149 → 82 |
| `POST /api/calls` | 378 → 1,120 | 83 → 24 | 101 → 63 |

| Menu first load | before | after |
|---|---|---|
| Images | 427 KB (PNG/JPG) | ~150 KB (WebP; background texture kept at q90 so its grain survives, logo is inline SVG) |
| Our bytes (HTML + images, uncompressed HTML) | ~472 KB | ~117 KB |

What changed: prepared-statement cache (SQL was compiled on every request), `synchronous=NORMAL` + `busy_timeout` (safe with WAL; was an fsync per write), `stamps(customer_id, created_at)` index, WebP images sized to how they are shown (originals kept; the favicon stays PNG), Caddy `zstd gzip` and one-week caching for images. `/api/me` p95 moved within run-to-run noise. `/staff/tables` still runs ~4 queries per seated customer; fine at café scale, batch it if tables get slow.

In production Caddy should proxy `/api/*` on the menu domain to `127.0.0.1:3200` (same origin, so cookies stay first-party).
~~~~

## `apps/loyalty/config.js`

~~~~js
// Sequoia Card — business rules. Change these here only (owner to confirm the placeholders).
'use strict';
module.exports = Object.freeze({
  STAMPS_REQUIRED: 6,                    // placeholder — owner will confirm
  REWARD_NAME: 'مشروبك المميز علينا',     // placeholder
  MIN_HOURS_BETWEEN_STAMPS: 3,           // blocks double-stamping the same visit
  STAMP_EXPIRY_DAYS: null,               // null = stamps never expire; a number = stamps older than this don't count

  // OTP / sessions
  OTP_TTL_MIN: 5,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_SEC: 60,
  OTP_MAX_PER_PHONE_HOUR: 5,
  OTP_MAX_PER_IP_HOUR: 15,
  CUSTOMER_SESSION_DAYS: 180,
  STAFF_SESSION_HOURS: 12,
});
~~~~

## `apps/loyalty/otp.js`

~~~~js
// OTP delivery behind one interface: sendOtp(phone, code) -> Promise.
// Set WHATSAPP_PROVIDER=messagepro + MESSAGEPRO_TOKEN + MESSAGEPRO_ACCOUNT_ID + MESSAGEPRO_INBOX_ID to send through
// our omnichannel platform, or WHATSAPP_PROVIDER=meta + WHATSAPP_TOKEN + WHATSAPP_PHONE_ID + WHATSAPP_TEMPLATE for Meta.
// Otherwise the dev stub logs the code on the SERVER console only. The code is never sent to the browser.
'use strict';

function metaCloud({ token, phoneId, template, lang = 'ar' }) {
  return async (phone, code) => {
    const to = '20' + phone.slice(1); // 01XXXXXXXXX -> 201XXXXXXXXX
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: { name: template, language: { code: lang }, components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }] },
      }),
    });
    if (!r.ok) throw new Error('whatsapp ' + r.status);
  };
}

// Message Pro (our omnichannel platform, Chatwoot-based). The Sequoia WhatsApp channel there is a
// WhatsApp Web ("Browser WhatsApp") session, not Meta Cloud, so there are no templates: we find or create
// the contact, reuse its open conversation in the WhatsApp inbox (or create one), then post a text message.
// Docs: https://omni.message-pro.com/docs . Auth header: api_access_token (account-level token).
function messagePro({ token, accountId, inboxId, base = 'https://omni.message-pro.com', fetchImpl = fetch, text = defaultText }) {
  if (!token || !accountId || !inboxId) throw new Error('messagepro: MESSAGEPRO_TOKEN, MESSAGEPRO_ACCOUNT_ID and MESSAGEPRO_INBOX_ID are required');
  const root = `${base}/api/v1/accounts/${encodeURIComponent(accountId)}`;
  const inbox = Number(inboxId);
  async function call(method, path, body) {
    const r = await fetchImpl(root + path, {
      method,
      headers: { api_access_token: token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  }
  const list = j => (Array.isArray(j?.payload) ? j.payload : Array.isArray(j) ? j : []);

  // Account tokens may not use /contacts/search or list endpoints (403); /contacts/filter is allowed.
  async function findContact(e164) {
    const r = await call('POST', '/contacts/filter', { payload: [{ attribute_key: 'phone_number', filter_operator: 'equal_to', values: [e164], query_operator: null }] });
    if (!r.ok) throw new Error('messagepro filter ' + r.status);
    return list(r.j).find(c => String(c.phone_number || '').replace(/\D/g, '') === e164.slice(1)) || null;
  }
  async function contactId(e164) {
    const found = await findContact(e164);
    if (found) return found.id;
    const r = await call('POST', '/contacts', { name: e164, phone_number: e164, inbox_id: inbox });
    if (r.ok) return (r.j.payload?.contact || r.j.payload || r.j).id;
    if (r.status === 422) { const again = await findContact(e164); if (again) return again.id; } // created in parallel
    throw new Error('messagepro contact ' + r.status);
  }
  async function conversationId(cid, e164) {
    const r = await call('GET', `/contacts/${cid}/conversations`);
    if (r.ok) {
      const open = list(r.j).filter(c => c.inbox_id === inbox && c.status !== 'resolved').sort((a, b) => b.id - a.id)[0];
      if (open) return open.id;
    }
    const n = await call('POST', '/conversations', { inbox_id: inbox, contact_id: cid, source_id: e164.slice(1) });
    if (!n.ok) throw new Error('messagepro conversation ' + n.status);
    return n.j.id ?? n.j.payload?.id;
  }

  return async (phone, code) => {
    const e164 = '+20' + phone.slice(1); // 01XXXXXXXXX -> +201XXXXXXXXX
    const cid = await contactId(e164);
    const conv = await conversationId(cid, e164);
    const m = await call('POST', `/conversations/${conv}/messages`, { content: text(code), message_type: 'outgoing', private: false, content_type: 'text' });
    if (!m.ok) throw new Error('messagepro message ' + m.status);
  };
}
const defaultText = code => `كود الدخول لكارت سيكويا: ${code}\nصالح لمدة 5 دقايق. متديش الكود لحد، حتى لو قال إنه من سيكويا.`;

function devStub(log = console.log) {
  return async (phone, code) => log(`[otp:dev] ${phone} -> ${code}`);
}

function fromEnv(env = process.env) {
  if (env.WHATSAPP_PROVIDER === 'meta')
    return metaCloud({ token: env.WHATSAPP_TOKEN, phoneId: env.WHATSAPP_PHONE_ID, template: env.WHATSAPP_TEMPLATE || 'sequoia_otp' });
  if (env.WHATSAPP_PROVIDER === 'messagepro')
    return messagePro({ token: env.MESSAGEPRO_TOKEN, accountId: env.MESSAGEPRO_ACCOUNT_ID, inboxId: env.MESSAGEPRO_INBOX_ID, base: env.MESSAGEPRO_BASE || undefined });
  // 'off': phone-code login is unavailable (e.g. until the Message Pro token is set); everything else runs.
  if (env.WHATSAPP_PROVIDER === 'off') return async () => { throw new Error('otp provider off'); };
  if (env.NODE_ENV === 'production') throw new Error('otp: set WHATSAPP_PROVIDER in production (dev stub would only log codes)');
  return devStub();
}
module.exports = { fromEnv, devStub, metaCloud, messagePro };
~~~~

## `apps/loyalty/rules.js`

~~~~js
// Pure loyalty rules (no DB) — unit tested in test/rules.test.js
'use strict';
const HOUR = 3600e3, DAY = 24 * HOUR;

// Stamps that count toward the current card: same cycle and not expired.
function activeStamps(stamps, cycle, now, cfg) {
  return stamps.filter(s => s.cycle_id === cycle &&
    (cfg.STAMP_EXPIRY_DAYS == null || now - s.created_at < cfg.STAMP_EXPIRY_DAYS * DAY));
}

function cardState(stamps, cycle, now, cfg) {
  const active = activeStamps(stamps, cycle, now, cfg).sort((a, b) => a.created_at - b.created_at);
  const count = Math.min(active.length, cfg.STAMPS_REQUIRED);
  const lastAt = stamps.reduce((m, s) => Math.max(m, s.created_at), 0);
  const nextStampAt = lastAt ? lastAt + cfg.MIN_HOURS_BETWEEN_STAMPS * HOUR : 0;
  return {
    count, required: cfg.STAMPS_REQUIRED, remaining: cfg.STAMPS_REQUIRED - count,
    complete: count >= cfg.STAMPS_REQUIRED, cycle,
    slots: active.slice(0, cfg.STAMPS_REQUIRED).map(s => s.created_at),
    nextStampAt: nextStampAt > now ? nextStampAt : 0,
  };
}

// -> null if allowed, else a reason code
function stampBlock(state) {
  if (state.complete) return 'card_full';
  if (state.nextStampAt) return 'too_soon';
  return null;
}
function redeemBlock(state) { return state.complete ? null : 'not_full'; }

// Egyptian mobile -> 01XXXXXXXXX or null. Accepts +20 / 0020 / Arabic-Indic digits / spaces.
function normalizePhone(input) {
  let s = String(input ?? '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0)).replace(/[\s\-().]/g, '');
  if (s.startsWith('+20')) s = '0' + s.slice(3);
  else if (s.startsWith('0020')) s = '0' + s.slice(4);
  else if (/^20 ?1\d{9}$/.test(s)) s = '0' + s.slice(2);
  else if (/^1[0125]\d{8}$/.test(s)) s = '0' + s;
  return /^01[0125]\d{8}$/.test(s) ? s : null;
}
const maskPhone = p => p.slice(0, 3) + '•••••' + p.slice(-3);

module.exports = { cardState, stampBlock, redeemBlock, normalizePhone, maskPhone, activeStamps };
~~~~

## `apps/loyalty/server.js`

~~~~js
// Sequoia Card — loyalty API (customers, OTP login, stamps, rewards, staff, audit log).
// No npm dependencies: Node 22+ built-ins only (http, crypto, node:sqlite), same as apps/payroll.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const CFG = require('./config');
const R = require('./rules');
const OTP = require('./otp');

const SCHEMA = `
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA temp_store=MEMORY; -- NORMAL is crash-safe with WAL (may lose the last commit on power loss, never corrupts)
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, last_visit_at INTEGER, cycle INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS staff(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('captain','admin')), pass TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS stamps(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), staff_id INTEGER NOT NULL REFERENCES staff(id), table_number INTEGER, created_at INTEGER NOT NULL, cycle_id INTEGER NOT NULL, request_id TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS rewards(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), staff_id INTEGER NOT NULL REFERENCES staff(id), redeemed_at INTEGER NOT NULL, cycle_id INTEGER NOT NULL, request_id TEXT UNIQUE, UNIQUE(customer_id, cycle_id));
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor_type TEXT NOT NULL, actor_id INTEGER, action TEXT NOT NULL, customer_id INTEGER, detail TEXT, ip TEXT, device TEXT);
CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('customer','staff')), subject_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS presence(customer_id INTEGER PRIMARY KEY REFERENCES customers(id), table_number INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS inbound_logins(nonce_hash TEXT PRIMARY KEY, code TEXT NOT NULL, expires INTEGER NOT NULL, phone TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS inbound_code ON inbound_logins(code);
CREATE TABLE IF NOT EXISTS calls(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, table_number INTEGER NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS calls_at ON calls(at);
CREATE INDEX IF NOT EXISTS stamps_customer_at ON stamps(customer_id, created_at);
DROP INDEX IF EXISTS stamps_customer;
CREATE INDEX IF NOT EXISTS stamps_created ON stamps(created_at);
CREATE INDEX IF NOT EXISTS rewards_customer ON rewards(customer_id);
CREATE INDEX IF NOT EXISTS audit_customer ON audit_log(customer_id, id);
`;

function hashPass(p) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(p, salt, 64).toString('hex'); }
function checkPass(p, stored) { const [s, h] = String(stored).split(':'); const c = crypto.scryptSync(String(p), Buffer.from(s, 'hex'), 64); return crypto.timingSafeEqual(c, Buffer.from(h, 'hex')); }
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// Secrets saved from the one-time setup page (never in git, chat or the env file): <LOYALTY_DATA>/settings.json, mode 600.
function readSettings(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function writeSettings(file, data) { fs.writeFileSync(file + '.tmp', JSON.stringify(data), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }

function inboundFromEnv(env = process.env) {
  const secret = env.MESSAGEPRO_WEBHOOK_SECRET, waNumber = String(env.SEQUOIA_WA_NUMBER || '').replace(/\D/g, '');
  if (!secret || !waNumber) return null;
  return { secret, waNumber, inboxId: +env.MESSAGEPRO_INBOX_ID || null };
}

// ---------- tiny fixed-window rate limiter ----------
function limiter() {
  const m = new Map();
  return (key, max, windowMs, now) => {
    let e = m.get(key);
    if (!e || now >= e.reset) { e = { n: 0, reset: now + windowMs }; m.set(key, e); }
    if (m.size > 50000) for (const [k, v] of m) if (now >= v.reset) m.delete(k);
    return ++e.n > max;
  };
}

function createApp(opts = {}) {
  const now = opts.now || (() => Date.now());
  const db = new DatabaseSync(opts.dbFile || ':memory:');
  db.exec(SCHEMA);
  // prepared-statement cache: compiling SQL on every request was the main CPU cost
  const stmts = new Map();
  const Q = sql => { let st = stmts.get(sql); if (!st) { st = db.prepare(sql); stmts.set(sql, st); } return st; };
  let sendOtp = opts.sendOtp || OTP.fromEnv();
  const SECRET = opts.secret || process.env.LOYALTY_SECRET || crypto.randomBytes(32).toString('hex');
  const STATIC_ROOT = opts.staticRoot || null; // dev/test only; in production Caddy serves the menu
  const secure = opts.secureCookies !== false;
  const limited = limiter();
  const H = 3600e3;

  const otpHash = (phone, code) => crypto.createHmac('sha256', SECRET).update(phone + ':' + code).digest('hex');
  // Option B (WhatsApp inbound login): enabled when the webhook secret and the café's WhatsApp number are set.
  let INBOUND = opts.inbound !== undefined ? opts.inbound : inboundFromEnv();

  // ---------- live updates (SSE): channel 'c:<customerId>' for the customer card, 'staff' for the captain tab ----------
  const subs = new Map();
  function publish(ch, ev, data) {
    for (const res of subs.get(ch) || []) res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function stream(req, res, ch) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.write('retry: 5000\n\n');
    if (!subs.has(ch)) subs.set(ch, new Set());
    subs.get(ch).add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); subs.get(ch)?.delete(res); });
  }

  // ---------- helpers ----------
  const SEC_HEADERS = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cross-Origin-Resource-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
  // dev/test static pages get the same CSP that Caddy sends in production (tools/server-setup.sh)
  const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
  function send(res, code, body, headers = {}) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...headers });
    res.end(JSON.stringify(body));
  }
  function readRaw(req, max) {
    return new Promise((ok, bad) => {
      const parts = []; let n = 0;
      req.on('data', c => { n += c.length; if (n > max) { bad(new Error('too large')); req.destroy(); } else parts.push(c); });
      req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
      req.on('error', bad);
    });
  }
  async function readBody(req) {
    const d = await readRaw(req, 1e4);
    try { const j = d ? JSON.parse(d) : {}; return j && typeof j === 'object' ? j : {}; } catch { throw new Error('bad json'); }
  }
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]));
  function cookie(name, value, maxAgeSec, sameSite) {
    return `${name}=${value}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=${sameSite}; Path=/api; Max-Age=${maxAgeSec}`;
  }
  function newSession(kind, id, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    Q('DELETE FROM sessions WHERE expires<?').run(now());
    Q('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(token), kind, id, now() + ttlMs);
    return token;
  }
  function sessionOf(req, kind) {
    const t = cookies(req)[kind === 'staff' ? 'sq_staff' : 'sq_card'];
    if (!t || t.length > 100) return null;
    return Q('SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires>?').get(sha(t), kind, now()) || null;
  }
  function audit(actorType, actorId, action, customerId, detail, ctx) {
    Q('INSERT INTO audit_log(at,actor_type,actor_id,action,customer_id,detail,ip,device) VALUES(?,?,?,?,?,?,?,?)')
      .run(now(), actorType, actorId ?? null, action, customerId ?? null, detail ? JSON.stringify(detail) : null, ctx.ip, ctx.device);
  }
  function card(customer) {
    const stamps = Q('SELECT created_at, cycle_id FROM stamps WHERE customer_id=? AND cycle_id=?').all(customer.id, customer.cycle);
    const last = Q('SELECT MAX(created_at) AS t FROM stamps WHERE customer_id=?').get(customer.id).t;
    if (last && !stamps.some(s => s.created_at === last)) stamps.push({ created_at: last, cycle_id: -1 }); // cooldown spans cycles
    const st = R.cardState(stamps, customer.cycle, now(), CFG);
    st.rewards = Q('SELECT COUNT(*) AS n FROM rewards WHERE customer_id=?').get(customer.id).n;
    st.rewardName = CFG.REWARD_NAME;
    return st;
  }
  function ops(customerId, before, limit = 10) {
    const rows = Q(`SELECT a.id, a.at, a.action, a.detail, s.name AS staff FROM audit_log a LEFT JOIN staff s ON s.id=a.actor_id AND a.actor_type='staff'
      WHERE a.customer_id=? AND a.action IN('stamp','redeem') AND a.id<? ORDER BY a.id DESC LIMIT ?`).all(customerId, before || 2 ** 53, limit + 1);
    return { items: rows.slice(0, limit).map(r => ({ id: r.id, at: r.at, action: r.action, staff: r.staff, table: (JSON.parse(r.detail || '{}')).table ?? null })), more: rows.length > limit };
  }
  function loginCustomer(phone, t, ctx, via) {
    Q('INSERT INTO customers(phone,created_at,last_visit_at) VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET last_visit_at=excluded.last_visit_at').run(phone, t, t);
    const c = Q('SELECT * FROM customers WHERE phone=?').get(phone);
    const ttl = CFG.CUSTOMER_SESSION_DAYS * 24 * H;
    const token = newSession('customer', c.id, ttl);
    audit('customer', c.id, 'login', c.id, { via }, ctx);
    return cookie('sq_card', token, ttl / 1000, 'Lax');
  }

  // Message Pro (Chatwoot-based) signs webhooks: X-Chatwoot-Signature = "sha256=" + HMAC-SHA256(secret, `${timestamp}.${rawBody}`),
  // X-Chatwoot-Timestamp = unix seconds. Old or unsigned deliveries are rejected.
  function verifyWebhook(req, raw) {
    const ts = String(req.headers['x-chatwoot-timestamp'] || '');
    const sig = String(req.headers['x-chatwoot-signature'] || '');
    if (!/^\d{9,11}$/.test(ts) || Math.abs(now() / 1000 - +ts) > 300) return false;
    const want = Buffer.from('sha256=' + crypto.createHmac('sha256', INBOUND.secret).update(ts + '.' + raw).digest('hex'));
    const got = Buffer.from(sig);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  async function inboundHook(req, res, ctx) {
    const raw = await readRaw(req, 1e6);
    if (!verifyWebhook(req, raw)) { console.warn('webhook: rejected (signature/timestamp)'); return send(res, 401, { error: 'signature' }); }
    let ev; try { ev = JSON.parse(raw); } catch { return send(res, 400, { error: 'bad json' }); }
    const t = now();
    const incoming = ev.event === 'message_created' && (ev.message_type === 'incoming' || ev.message_type === 0) && !ev.private;
    const inboxOk = !INBOUND.inboxId || +(ev.inbox?.id ?? ev.conversation?.inbox_id) === INBOUND.inboxId;
    const text = String(ev.content || '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660));
    const m = text.match(/\bSEQ[\s-]?(\d{6})\b/i);
    if (!incoming || !inboxOk || !m) return send(res, 200, { ok: true, ignored: true });
    const phone = R.normalizePhone(ev.sender?.phone_number || ev.conversation?.meta?.sender?.phone_number || '');
    if (!phone || limited('hook:' + phone, 10, H, t)) return send(res, 200, { ok: true, ignored: true });
    const r = Q('UPDATE inbound_logins SET phone=? WHERE code=? AND expires>? AND phone IS NULL').run(phone, m[1], t);
    if (r.changes) audit('customer', null, 'whatsapp_verified', null, { phone: R.maskPhone(phone) }, ctx);
    return send(res, 200, { ok: true });
  }

  // ---------- signed table QR links: /?t=7&s=<sig>. Unsigned ?table=7 only while TABLE_QR_LEGACY=1 (old printed QRs). ----------
  const LEGACY_TABLES = opts.legacyTables ?? process.env.TABLE_QR_LEGACY === '1';
  const tableSig = n => crypto.createHmac('sha256', SECRET).update('table:' + n).digest('base64url').slice(0, 12);
  function tableOk(n, s) {
    if (typeof s === 'string' && s.length === 12) {
      const a = Buffer.from(s), b = Buffer.from(tableSig(n));
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
    return LEGACY_TABLES;
  }

  const REPORT = opts.report || { url: process.env.REPORT_SHEET_URL || '', token: process.env.REPORT_SHEET_TOKEN || '' };
  const CALL_HISTORY_MS = 12 * H;
  function addCall(msg, t) {
    if (Math.random() < 0.02) Q('DELETE FROM calls WHERE at<?').run(t - 2 * CALL_HISTORY_MS);
    const id = Number(Q('INSERT INTO calls(at,table_number,body) VALUES(?,?,?)').run(t, +msg.table, JSON.stringify(msg)).lastInsertRowid);
    publish('calls', 'msg', { id, time: t, body: msg });
    return id;
  }

  const reqId = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null);
  const tableNo = v => { const n = +v; return Number.isInteger(n) && n >= 1 && n <= 999 ? n : null; };

  // ---------- API ----------
  async function api(req, res, url) {
    const p = url.pathname.slice(4); const M = req.method;
    const ctx = { ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress, device: String(req.headers['user-agent'] || '').slice(0, 160) };
    const t = now();

    // Server-to-server webhook from Message Pro: authenticated by its HMAC signature, not by the CSRF rules below.
    if (p === '/hooks/messagepro' && M === 'POST') return INBOUND ? inboundHook(req, res, ctx) : send(res, 404, { error: 'not found' });

    // CSRF: state changes must come from our own pages (custom header + same-origin check).
    if (M !== 'GET') {
      if (req.headers['x-requested-with'] !== 'sequoia') return send(res, 403, { error: 'forbidden' });
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'forbidden' });
    }

    // ----- one-time setup page: owner pastes the Message Pro token + webhook secret (browser -> server only) -----
    if (p === '/setup/messagepro' && M === 'POST') {
      if (!opts.settingsFile) return send(res, 404, { error: 'not found' });
      if (limited('setup:' + ctx.ip, 10, H, t)) return send(res, 429, { error: 'rate' });
      const b = await readBody(req); const st = readSettings(opts.settingsFile);
      const code = String(b.code || '');
      const good = st.setup && st.setup.exp > t && code.length >= 20 && code.length <= 100 &&
        crypto.timingSafeEqual(Buffer.from(sha(code), 'hex'), Buffer.from(st.setup.hash, 'hex'));
      if (!good) { audit('system', null, 'setup_denied', null, null, ctx); return send(res, 403, { error: 'link' }); }
      const token = String(b.token || '').trim(), secret = String(b.webhookSecret || '').trim();
      if (!/^[!-~]{10,400}$/.test(token)) return send(res, 400, { error: 'token' });
      if (secret && !/^[!-~]{8,400}$/.test(secret)) return send(res, 400, { error: 'secret' });
      const base = process.env.MESSAGEPRO_BASE || 'https://omni.message-pro.com', acct = process.env.MESSAGEPRO_ACCOUNT_ID || '129';
      let chk;
      try { chk = await (opts.fetchImpl || fetch)(`${base}/api/v1/accounts/${encodeURIComponent(acct)}/integrations/developer_api/channels`, { headers: { api_access_token: token, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }); }
      catch { return send(res, 502, { error: 'platform' }); }
      if (!chk.ok) return send(res, 400, { error: 'token-rejected', status: chk.status });
      const add = { WHATSAPP_PROVIDER: 'messagepro', MESSAGEPRO_TOKEN: token, ...(secret ? { MESSAGEPRO_WEBHOOK_SECRET: secret } : {}),
        MESSAGEPRO_ACCOUNT_ID: acct, MESSAGEPRO_INBOX_ID: process.env.MESSAGEPRO_INBOX_ID || '147' };
      const nextEnv = { ...process.env, ...add };
      const nextOtp = OTP.fromEnv(nextEnv); // build before saving, so a bad config never gets stored
      st.env = { ...(st.env || {}), ...add };
      delete st.setup; writeSettings(opts.settingsFile, st);
      Object.assign(process.env, add);
      if (!opts.sendOtp) sendOtp = nextOtp;
      if (opts.inbound === undefined) INBOUND = inboundFromEnv(process.env);
      audit('system', null, 'setup_messagepro', null, { webhook: !!secret }, ctx);
      return send(res, 200, { ok: true, code: true, whatsappMessage: !!INBOUND });
    }

    // ----- customer: OTP login -----
    if (p === '/otp/request' && M === 'POST') {
      const b = await readBody(req); const phone = R.normalizePhone(b.phone);
      if (!phone) return send(res, 400, { error: 'phone' });
      const prev = Q('SELECT sent_at FROM otps WHERE phone=?').get(phone);
      if (prev && t - prev.sent_at < CFG.OTP_RESEND_SEC * 1000) return send(res, 429, { error: 'wait', retryIn: Math.ceil((CFG.OTP_RESEND_SEC * 1000 - (t - prev.sent_at)) / 1000) });
      if (limited('ip:' + ctx.ip, CFG.OTP_MAX_PER_IP_HOUR, H, t) || limited('ph:' + phone, CFG.OTP_MAX_PER_PHONE_HOUR, H, t))
        return send(res, 429, { error: 'rate' });
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      Q('INSERT INTO otps(phone,code_hash,expires,attempts,sent_at) VALUES(?,?,?,0,?) ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash, expires=excluded.expires, attempts=0, sent_at=excluded.sent_at')
        .run(phone, otpHash(phone, code), t + CFG.OTP_TTL_MIN * 60e3, t);
      try { await sendOtp(phone, code); } catch (e) { console.error('otp send failed', e.message); return send(res, 502, { error: 'send' }); }
      audit('customer', null, 'otp_request', null, { phone: R.maskPhone(phone) }, ctx);
      return send(res, 200, { ok: true, resendIn: CFG.OTP_RESEND_SEC }); // same answer for new and existing numbers
    }
    if (p === '/otp/verify' && M === 'POST') {
      const b = await readBody(req); const phone = R.normalizePhone(b.phone); const code = String(b.code ?? '');
      if (limited('vip:' + ctx.ip, 40, H, t)) return send(res, 429, { error: 'rate' });
      const row = phone && Q('SELECT * FROM otps WHERE phone=?').get(phone);
      const bad = () => send(res, 400, { error: 'code' }); // one generic error for every failure
      if (!row || row.expires < t || row.attempts >= CFG.OTP_MAX_ATTEMPTS || !/^\d{6}$/.test(code)) { if (row) Q('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone); return bad(); }
      const ok = crypto.timingSafeEqual(Buffer.from(otpHash(phone, code), 'hex'), Buffer.from(row.code_hash, 'hex'));
      if (!ok) { Q('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone); return bad(); }
      Q('DELETE FROM otps WHERE phone=?').run(phone);
      return send(res, 200, { ok: true }, { 'Set-Cookie': loginCustomer(phone, t, ctx, 'otp') });
    }

    // ----- customer: Option B — send "SEQ-123456" to the café on WhatsApp -----
    if (p === '/login/options' && M === 'GET') return send(res, 200, { otp: true, whatsapp: !!INBOUND });
    if (p === '/otp/inbound/start' && M === 'POST') {
      if (!INBOUND) return send(res, 404, { error: 'not found' });
      if (limited('ib:' + ctx.ip, CFG.OTP_MAX_PER_IP_HOUR, H, t)) return send(res, 429, { error: 'rate' });
      Q('DELETE FROM inbound_logins WHERE expires<?').run(t);
      let code;
      do code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      while (Q('SELECT 1 FROM inbound_logins WHERE code=?').get(code));
      const nonce = crypto.randomBytes(32).toString('base64url');
      const ttl = CFG.OTP_TTL_MIN * 60e3;
      Q('INSERT INTO inbound_logins(nonce_hash,code,expires,phone,created_at) VALUES(?,?,?,NULL,?)').run(sha(nonce), code, t + ttl, t);
      const text = 'SEQ-' + code;
      return send(res, 200, { code: text, wa: `https://wa.me/${INBOUND.waNumber}?text=${encodeURIComponent(text)}`, expiresIn: ttl / 1000 },
        { 'Set-Cookie': cookie('sq_pending', nonce, ttl / 1000, 'Strict') });
    }
    if (p === '/otp/inbound/status' && M === 'GET') {
      if (!INBOUND) return send(res, 404, { error: 'not found' });
      const n = cookies(req).sq_pending;
      const row = n && n.length < 100 && Q('SELECT * FROM inbound_logins WHERE nonce_hash=?').get(sha(n));
      if (!row || row.expires < t) return send(res, 410, { error: 'expired' });
      if (!row.phone) return send(res, 200, { pending: true });
      Q('DELETE FROM inbound_logins WHERE nonce_hash=?').run(row.nonce_hash);
      return send(res, 200, { ok: true }, { 'Set-Cookie': [loginCustomer(row.phone, t, ctx, 'whatsapp'), cookie('sq_pending', '', 0, 'Strict')] });
    }

    // ----- table calls from the menu (replaces ntfy.sh): call waiter / bill / request -----
    if (p === '/calls' && M === 'POST') {
      const b = await readBody(req); const tn = tableNo(b.table);
      if (!tn || !tableOk(tn, b.s)) return send(res, 403, { error: 'table' });
      if (!['call', 'bill', 'req'].includes(b.type)) return send(res, 400, { error: 'type' });
      if (limited('call:' + ctx.ip, 40, H, t) || limited('calltbl:' + tn, 20, 10 * 60e3, t)) return send(res, 429, { error: 'rate' });
      const msg = { type: b.type, table: String(tn), rid: /^[a-z0-9]{4,24}$/.test(b.rid) ? b.rid : t.toString(36) };
      if (b.type === 'bill') msg.pay = String(b.pay ?? '').slice(0, 40);
      if (b.type === 'req') msg.item = String(b.item ?? '').slice(0, 80);
      return send(res, 200, { ok: true, id: addCall(msg, t) });
    }

    // ----- customer: read-only card -----
    if (p.startsWith('/me')) {
      const s = sessionOf(req, 'customer');
      if (!s) return send(res, 401, { error: 'login' });
      const c = Q('SELECT * FROM customers WHERE id=?').get(s.subject_id);
      if (!c) return send(res, 401, { error: 'login' });
      if (p === '/me' && M === 'GET') {
        const tn = tableNo(url.searchParams.get('table'));
        if (tn && tableOk(tn, url.searchParams.get('s'))) { Q('INSERT INTO presence VALUES(?,?,?) ON CONFLICT(customer_id) DO UPDATE SET table_number=excluded.table_number, at=excluded.at').run(c.id, tn, t); publish('staff', 'presence', {}); }
        return send(res, 200, { phone: c.phone, card: card(c) });
      }
      if (p === '/me/stream' && M === 'GET') return stream(req, res, 'c:' + c.id);
      if (p === '/me/logout' && M === 'POST') {
        Q('DELETE FROM sessions WHERE token_hash=?').run(sha(cookies(req).sq_card));
        Q('DELETE FROM presence WHERE customer_id=?').run(c.id);
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('sq_card', '', 0, 'Lax') });
      }
      return send(res, 404, { error: 'not found' });
    }

    // ----- staff -----
    if (p === '/staff/login' && M === 'POST') {
      if (limited('slip:' + ctx.ip, 10, 15 * 60e3, t)) return send(res, 429, { error: 'rate' });
      const b = await readBody(req);
      const u = Q('SELECT * FROM staff WHERE username=? AND active=1').get(String(b.username ?? '').trim().toLowerCase().slice(0, 60));
      if (!u || !checkPass(String(b.password ?? '').slice(0, 200), u.pass)) { audit('staff', u?.id, 'login_failed', null, null, ctx); return send(res, 401, { error: 'creds' }); }
      const ttl = CFG.STAFF_SESSION_HOURS * H;
      audit('staff', u.id, 'login', null, null, ctx);
      return send(res, 200, { ok: true, name: u.name, role: u.role }, { 'Set-Cookie': cookie('sq_staff', newSession('staff', u.id, ttl), ttl / 1000, 'Strict') });
    }
    if (!p.startsWith('/staff/')) return send(res, 404, { error: 'not found' });
    const ss = sessionOf(req, 'staff');
    const staff = ss && Q('SELECT * FROM staff WHERE id=? AND active=1').get(ss.subject_id);
    if (!staff) return send(res, 401, { error: 'login' });

    if (p === '/staff/me' && M === 'GET') return send(res, 200, { name: staff.name, role: staff.role, rules: { required: CFG.STAMPS_REQUIRED, reward: CFG.REWARD_NAME, hours: CFG.MIN_HOURS_BETWEEN_STAMPS } });
    if (p === '/staff/logout' && M === 'POST') { Q('DELETE FROM sessions WHERE token_hash=?').run(sha(cookies(req).sq_staff)); return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('sq_staff', '', 0, 'Strict') }); }
    if (p === '/staff/stream' && M === 'GET') return stream(req, res, 'staff');

    // captain screen: live table calls (replays the last 12 h on connect) and took/undo updates
    if (p === '/staff/calls/stream' && M === 'GET') {
      stream(req, res, 'calls');
      for (const r of Q('SELECT id, at, body FROM calls WHERE at>? ORDER BY id').all(t - CALL_HISTORY_MS))
        res.write(`event: msg\ndata: ${JSON.stringify({ id: r.id, time: r.at, body: JSON.parse(r.body) })}\n\n`);
      return;
    }
    // captain "تمام" rows -> Google report sheet; URL + token stay on the server
    if (p === '/staff/report' && M === 'POST') {
      if (!REPORT.url) return send(res, 503, { error: 'report off' });
      const b = await readRaw(req, 2e5); let rows;
      try { rows = JSON.parse(b).rows; } catch { return send(res, 400, { error: 'bad json' }); }
      if (!Array.isArray(rows) || rows.length > 200) return send(res, 400, { error: 'bad' });
      try {
        const r = await (opts.fetchImpl || fetch)(REPORT.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ token: REPORT.token, by: staff.username, rows }), signal: AbortSignal.timeout(15000) });
        if (!r.ok) return send(res, 502, { error: 'sheet' });
      } catch { return send(res, 502, { error: 'sheet' }); }
      return send(res, 200, { ok: true });
    }
    if (p === '/staff/calls' && M === 'POST') {
      const b = await readBody(req); const tn = tableNo(b.table);
      if (!tn || !['took', 'undo'].includes(b.type)) return send(res, 400, { error: 'bad' });
      const msg = { type: b.type, table: String(tn), by: staff.name };
      if (b.type === 'took') msg.rids = (Array.isArray(b.rids) ? b.rids : []).filter(x => typeof x === 'string' && x.length <= 24).slice(0, 50);
      if (b.type === 'undo') msg.calls = (Array.isArray(b.calls) ? b.calls : []).slice(0, 50);
      if (JSON.stringify(msg).length > 8000) return send(res, 400, { error: 'bad' });
      return send(res, 200, { ok: true, id: addCall(msg, t) });
    }

    // customers signed in at a table in the last 3 hours (masked phones)
    if (p === '/staff/tables' && M === 'GET') {
      const rows = Q('SELECT p.table_number, p.at, c.id, c.phone, c.cycle FROM presence p JOIN customers c ON c.id=p.customer_id WHERE p.at>? ORDER BY p.table_number').all(t - 3 * H);
      return send(res, 200, rows.map(r => ({ id: r.id, table: r.table_number, phone: R.maskPhone(r.phone), card: card(r) })));
    }
    // captain screen: Sequoia Card guests seated at one table (last 3 h), so the captain can send
    // the Google review link on WhatsApp. `wa` is the wa.me number (20 + number without the leading 0).
    if (p === '/staff/review-contacts' && M === 'GET') {
      const tn = tableNo(url.searchParams.get('table'));
      if (!tn) return send(res, 400, { error: 'table' });
      const rows = Q('SELECT c.id, c.phone FROM presence p JOIN customers c ON c.id=p.customer_id WHERE p.table_number=? AND p.at>? ORDER BY p.at DESC').all(tn, t - 3 * H);
      audit('staff', staff.id, 'review_contacts', null, { table: tn, count: rows.length }, ctx);
      return send(res, 200, rows.map(r => ({ id: r.id, phone: R.maskPhone(r.phone), wa: '20' + r.phone.replace(/^0/, '') })));
    }
    if (p === '/staff/customer' && M === 'GET') {
      const id = +url.searchParams.get('id'); const phone = R.normalizePhone(url.searchParams.get('phone'));
      const c = phone ? Q('SELECT * FROM customers WHERE phone=?').get(phone) : Number.isInteger(id) && id > 0 ? Q('SELECT * FROM customers WHERE id=?').get(id) : null;
      if (!c) return send(res, 404, { error: 'none' });
      return send(res, 200, { id: c.id, phone: phone ? c.phone : R.maskPhone(c.phone), card: card(c), ops: ops(c.id, +url.searchParams.get('before') || 0) });
    }
    if ((p === '/staff/stamp' || p === '/staff/redeem') && M === 'POST') {
      const b = await readBody(req); const rid = reqId(b.requestId); const cid = +b.customerId;
      if (!rid || !Number.isInteger(cid)) return send(res, 400, { error: 'bad input' });
      if (limited('act:' + staff.id, 60, 60e3, t)) return send(res, 429, { error: 'rate' });
      const isStamp = p === '/staff/stamp';
      // idempotent: the same requestId returns the original result
      const dup = Q(`SELECT customer_id FROM ${isStamp ? 'stamps' : 'rewards'} WHERE request_id=?`).get(rid);
      if (dup) { const c0 = Q('SELECT * FROM customers WHERE id=?').get(dup.customer_id); return send(res, 200, { ok: true, repeated: true, card: card(c0) }); }
      let result;
      db.exec('BEGIN IMMEDIATE');
      try {
        const c = Q('SELECT * FROM customers WHERE id=?').get(cid);
        if (!c) { db.exec('ROLLBACK'); return send(res, 404, { error: 'none' }); }
        const st = card(c);
        const block = isStamp ? R.stampBlock(st) : R.redeemBlock(st);
        if (block) { db.exec('ROLLBACK'); return send(res, 409, { error: block, card: st }); }
        const table = tableNo(b.table) ?? Q('SELECT table_number FROM presence WHERE customer_id=? AND at>?').get(cid, t - 3 * H)?.table_number ?? null;
        if (isStamp) {
          Q('INSERT INTO stamps(customer_id,staff_id,table_number,created_at,cycle_id,request_id) VALUES(?,?,?,?,?,?)').run(cid, staff.id, table, t, c.cycle, rid);
          Q('UPDATE customers SET last_visit_at=? WHERE id=?').run(t, cid);
        } else {
          Q('INSERT INTO rewards(customer_id,staff_id,redeemed_at,cycle_id,request_id) VALUES(?,?,?,?,?)').run(cid, staff.id, t, c.cycle, rid);
          Q('UPDATE customers SET cycle=cycle+1 WHERE id=?').run(cid);
        }
        audit('staff', staff.id, isStamp ? 'stamp' : 'redeem', cid, { table, cycle: c.cycle }, ctx);
        db.exec('COMMIT');
        result = card(Q('SELECT * FROM customers WHERE id=?').get(cid));
      } catch (e) { try { db.exec('ROLLBACK'); } catch {} if (/UNIQUE/.test(e.message)) return send(res, 409, { error: 'duplicate' }); throw e; }
      publish('c:' + cid, 'card', result); publish('staff', 'card', { id: cid });
      return send(res, 200, { ok: true, card: result });
    }
    return send(res, 404, { error: 'not found' });
  }

  // ---------- static files (dev/test only) ----------
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
  function serveStatic(req, res, url) {
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(STATIC_ROOT, rel));
    if (!file.startsWith(STATIC_ROOT) || /\/(\.git|tools|apps)(\/|$)/.test(rel) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEC_HEADERS, ...(file.endsWith('.html') ? { 'Content-Security-Policy': PAGE_CSP } : {}) });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    let url; try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (STATIC_ROOT && req.method === 'GET') return serveStatic(req, res, url);
      send(res, 404, { error: 'not found' });
    } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server' }); }
  });

  function setStaff(username, role, name, password) {
    if (!['captain', 'admin'].includes(role)) throw new Error('role must be captain or admin');
    const pw = password || crypto.randomBytes(6).toString('base64url');
    Q(`INSERT INTO staff(username,name,pass,role) VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET pass=excluded.pass, role=excluded.role, name=excluded.name, active=1`)
      .run(username.toLowerCase(), name || username, hashPass(pw), role);
    return pw;
  }
  return { server, db, setStaff, tableSig };
}

module.exports = { createApp };

// ---------- CLI ----------
if (require.main === module) {
  const DATA_DIR = process.env.LOYALTY_DATA || path.join(__dirname, '.data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dev = process.env.NODE_ENV !== 'production';
  if (!dev && !process.env.LOYALTY_SECRET) { console.error('LOYALTY_SECRET is required in production'); process.exit(1); }
  const SETTINGS = path.join(DATA_DIR, 'settings.json');
  Object.assign(process.env, readSettings(SETTINGS).env || {}); // secrets saved from the setup page win over the env file
  const app = createApp({
    settingsFile: SETTINGS,
    dbFile: path.join(DATA_DIR, 'loyalty.db'),
    staticRoot: process.env.STATIC_ROOT ? path.resolve(process.env.STATIC_ROOT) : null,
    secureCookies: !dev,
  });
  if (process.argv[2] === 'set-staff') {
    const [, , , username, role = 'captain', name, pw] = process.argv;
    if (!username) { console.log('usage: node server.js set-staff <username> <captain|admin> "<name>" [password]'); process.exit(1); }
    console.log(`User: ${username}\nPassword: ${app.setStaff(username, role, name, pw)}\nRole: ${role}`);
    process.exit(0);
  }
  if (process.argv[2] === 'setup-link') {
    const base = process.argv[3];
    if (!base) { console.log('usage: node server.js setup-link https://<menu domain>/   (one use, 24 h)'); process.exit(1); }
    const code = crypto.randomBytes(24).toString('base64url'); const st = readSettings(SETTINGS);
    st.setup = { hash: sha(code), exp: Date.now() + 24 * 3600e3 }; writeSettings(SETTINGS, st);
    console.log(new URL('setup-messagepro.html#' + code, base).toString()); process.exit(0);
  }
  if (process.argv[2] === 'table-links') {
    const [, , , base, from = '1', to = from] = process.argv;
    if (!base) { console.log('usage: node server.js table-links https://<menu domain>/ <from> [to]'); process.exit(1); }
    for (let n = +from; n <= +to; n++) { const u = new URL(base); u.searchParams.set('t', n); u.searchParams.set('s', app.tableSig(n)); console.log(n + '\t' + u); }
    process.exit(0);
  }
  const PORT = +process.env.PORT || 3200;
  app.server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`Sequoia Card API on :${PORT}${dev ? ' (dev)' : ''}`));
}
~~~~

## `apps/loyalty/test/api.test.js`

~~~~js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const H = 3600e3;

async function setup() {
  let clock = 1_800_000_000_000; const codes = {};
  const app = createApp({ now: () => clock, sendOtp: async (p, c) => { codes[p] = c; }, secret: 'test', secureCookies: false });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const jar = () => {
    let ck = {};
    return async (method, path, body, { csrf = true, ip } = {}) => {
      const h = { cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ') };
      if (csrf) h['x-requested-with'] = 'sequoia';
      if (body) h['content-type'] = 'application/json';
      if (ip) h['x-forwarded-for'] = ip;
      const r = await fetch(base + '/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
    };
  };
  app.setStaff('captain1', 'captain', 'Kareem', 'pass-1234');
  return { app, codes, jar, tick: ms => { clock += ms; }, close: () => { app.server.closeAllConnections(); app.server.close(); } };
}
async function customerLogin(t, phone = '01012345678', ip = '1.1.1.1') {
  const c = t.jar();
  assert.equal((await c('POST', '/otp/request', { phone }, { ip })).status, 200);
  assert.equal((await c('POST', '/otp/verify', { phone, code: t.codes[phone] }, { ip })).status, 200);
  return c;
}
async function staffLogin(t) {
  const s = t.jar();
  assert.equal((await s('POST', '/staff/login', { username: 'captain1', password: 'pass-1234' })).status, 200);
  return s;
}

test('OTP never reaches the client; wrong code is generic; 5 attempts max', async () => {
  const t = await setup();
  const c = t.jar();
  const r = await c('POST', '/otp/request', { phone: '+20 101 234 5678' });
  assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.body).includes(t.codes['01012345678']));
  for (let i = 0; i < 5; i++) assert.deepEqual((await c('POST', '/otp/verify', { phone: '01012345678', code: '000000' === t.codes['01012345678'] ? '111111' : '000000' })).body, { error: 'code' });
  assert.equal((await c('POST', '/otp/verify', { phone: '01012345678', code: t.codes['01012345678'] })).status, 400, 'locked after 5 attempts');
  t.close();
});
test('OTP expires after 5 minutes, resend cooldown 60s, per-phone and per-IP limits', async () => {
  const t = await setup(); const c = t.jar();
  await c('POST', '/otp/request', { phone: '01012345678' });
  assert.equal((await c('POST', '/otp/request', { phone: '01012345678' })).status, 429);
  t.tick(5 * 60e3 + 1);
  assert.equal((await c('POST', '/otp/verify', { phone: '01012345678', code: t.codes['01012345678'] })).status, 400);
  for (let i = 0; i < 4; i++) { t.tick(61e3); assert.equal((await c('POST', '/otp/request', { phone: '01012345678' }, { ip: '9.9.9.' + i })).status, 200); }
  t.tick(61e3); assert.equal((await c('POST', '/otp/request', { phone: '01012345678' }, { ip: '9.9.9.99' })).status, 429, 'per phone');
  let last; for (let i = 0; i < 16; i++) last = await c('POST', '/otp/request', { phone: '0111' + String(1000000 + i) }, { ip: '7.7.7.7' });
  assert.equal(last.status, 429, 'per IP');
  t.close();
});
test('same response for new and existing numbers (no enumeration)', async () => {
  const t = await setup(); await customerLogin(t, '01012345678');
  const c = t.jar(); t.tick(61e3);
  const a = await c('POST', '/otp/request', { phone: '01012345678' }, { ip: '2.2.2.2' });
  const b = await c('POST', '/otp/request', { phone: '01099999999' }, { ip: '2.2.2.2' });
  assert.deepEqual(a.body, b.body); t.close();
});
test('customer cannot stamp; unauthenticated cannot reach staff endpoints; CSRF header required', async () => {
  const t = await setup(); const c = await customerLogin(t);
  assert.equal((await c('POST', '/staff/stamp', { customerId: 1, requestId: 'abcdefgh1234' })).status, 401);
  const anon = t.jar();
  for (const p of ['/staff/me', '/staff/tables', '/staff/customer?phone=01012345678', '/staff/stream']) assert.equal((await anon('GET', p)).status, 401, p);
  assert.equal((await anon('GET', '/me')).status, 401);
  const s = await staffLogin(t);
  assert.equal((await s('POST', '/staff/stamp', { customerId: 1, requestId: 'abcdefgh1234' }, { csrf: false })).status, 403);
  t.close();
});
test('session cookie is HttpOnly + SameSite and long-lived', async () => {
  const t = await setup(); const c = t.jar();
  await c('POST', '/otp/request', { phone: '01012345678' });
  const r = await fetch('http://127.0.0.1:' + t.app.server.address().port + '/api/otp/verify', { method: 'POST', headers: { 'x-requested-with': 'sequoia', 'content-type': 'application/json' }, body: JSON.stringify({ phone: '01012345678', code: t.codes['01012345678'] }) });
  const ck = r.headers.getSetCookie()[0];
  assert.match(ck, /HttpOnly/); assert.match(ck, /SameSite=Lax/); assert.match(ck, /Max-Age=15552000/);
  t.close();
});
test('full cycle: 6 stamps with cooldown, idempotency, redeem once, card resets', async () => {
  const t = await setup(); const c = await customerLogin(t); let s = await staffLogin(t);
  const id = (await s('GET', '/staff/customer?phone=01012345678')).body.id;
  let r = await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-00000001' });
  assert.equal(r.body.card.count, 1);
  r = await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-00000001' });
  assert.equal(r.body.repeated, true); assert.equal(r.body.card.count, 1, 'idempotent');
  r = await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-00000002' });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'too_soon');
  assert.equal((await s('POST', '/staff/redeem', { customerId: id, requestId: 'red-00000001' })).body.error, 'not_full');
  for (let i = 2; i <= 6; i++) { t.tick(3 * H); if (i === 5) s = await staffLogin(t); r = await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-0000000' + i + 'x' }); assert.equal(r.status, 200); }
  assert.equal(r.body.card.complete, true);
  t.tick(3 * H);
  assert.equal((await s('POST', '/staff/stamp', { customerId: id, requestId: 'req-full-0001' })).body.error, 'card_full');
  const me = await c('GET', '/me'); assert.equal(me.body.card.complete, true); assert.equal(me.body.card.slots.length, 6);
  const [a, b] = await Promise.all([s('POST', '/staff/redeem', { customerId: id, requestId: 'red-aaaaaaaa' }), s('POST', '/staff/redeem', { customerId: id, requestId: 'red-bbbbbbbb' })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], 'double redemption blocked');
  const after = (await c('GET', '/me')).body.card;
  assert.equal(after.count, 0); assert.equal(after.rewards, 1); assert.equal(after.cycle, 2);
  const ops = (await s('GET', '/staff/customer?id=' + id)).body;
  assert.equal(ops.phone, '010•••••678', 'masked unless exact phone search');
  assert.equal(ops.ops.items[0].action, 'redeem'); assert.equal(ops.ops.items.length, 7);
  const n = t.app.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action IN('stamp','redeem','login')").get().n;
  assert.equal(n, 10, '1 customer + 2 staff logins, 6 stamps, 1 redeem'); t.close();
});
test('table presence shows masked customers to staff', async () => {
  const t = await setup(); const c = await customerLogin(t); const s = await staffLogin(t);
  await c('GET', '/me?table=8'); // unsigned QR link: ignored
  assert.equal((await s('GET', '/staff/tables')).body.length, 0);
  await c('GET', '/me?table=7&s=' + t.app.tableSig(7));
  const rows = (await s('GET', '/staff/tables')).body;
  assert.equal(rows.length, 1); assert.equal(rows[0].table, 7); assert.equal(rows[0].phone, '010•••••678');
  t.close();
});

test('review contacts: staff only, per table, last 3 h, wa.me number', async () => {
  const t = await setup(); const c = await customerLogin(t); const s = await staffLogin(t);
  assert.equal((await t.jar()('GET', '/staff/review-contacts?table=7')).status, 401);
  assert.equal((await c('GET', '/staff/review-contacts?table=7')).status, 401);
  assert.equal((await s('GET', '/staff/review-contacts?table=abc')).status, 400);
  assert.deepEqual((await s('GET', '/staff/review-contacts?table=7')).body, []);
  await c('GET', '/me?table=7&s=' + t.app.tableSig(7));
  const rows = (await s('GET', '/staff/review-contacts?table=7')).body;
  assert.equal(rows.length, 1); assert.equal(rows[0].wa, '201012345678'); assert.equal(rows[0].phone, '010•••••678');
  assert.deepEqual((await s('GET', '/staff/review-contacts?table=8')).body, []);
  t.tick(3 * H + 1);
  assert.deepEqual((await s('GET', '/staff/review-contacts?table=7')).body, []);
  t.close();
});
test('customer logout ends the session', async () => {
  const t = await setup(); const c = await customerLogin(t);
  assert.equal((await c('POST', '/me/logout', {})).status, 200);
  assert.equal((await c('GET', '/me')).status, 401); t.close();
});
~~~~

## `apps/loyalty/test/bench.js`

~~~~js
// API benchmark (Phase 3). In-process server, real SQLite file (WAL), seeded data.
// Run: node apps/loyalty/test/bench.js [seconds-per-endpoint=5] [concurrency=32]
// Prints req/s, p50, p95, p99 per endpoint. Compare before/after on the same machine.
'use strict';
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { createApp } = require('../server');

const SECS = +process.argv[2] || 5, CONC = +process.argv[3] || 32;
const CUSTOMERS = 2000;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-bench-'));
  let clock = Date.now();
  const app = createApp({ dbFile: path.join(dir, 'b.db'), now: () => clock, sendOtp: async () => {}, secret: 'bench', secureCookies: false, inbound: null });
  app.setStaff('cap', 'captain', 'Cap', 'pass-1234');
  // seed: customers with some stamps + audit rows; 30 tables with presence; 500 calls in the last 12 h
  const db = app.db; const t0 = clock;
  db.exec('BEGIN');
  for (let i = 1; i <= CUSTOMERS; i++) {
    db.prepare('INSERT INTO customers(phone,created_at,last_visit_at) VALUES(?,?,?)').run('010' + String(i).padStart(8, '0'), t0, t0);
    for (let k = 0; k < i % 5; k++) {
      db.prepare('INSERT INTO stamps(customer_id,staff_id,table_number,created_at,cycle_id) VALUES(?,?,?,?,1)').run(i, 1, 1 + (i % 30), t0 - (k + 1) * 86400e3);
      db.prepare('INSERT INTO audit_log(at,actor_type,actor_id,action,customer_id,detail) VALUES(?,?,?,?,?,?)').run(t0 - (k + 1) * 86400e3, 'staff', 1, 'stamp', i, '{"table":3}');
    }
    if (i <= 60) db.prepare('INSERT INTO presence VALUES(?,?,?)').run(i, 1 + (i % 30), t0);
  }
  for (let i = 0; i < 500; i++) db.prepare('INSERT INTO calls(at,table_number,body) VALUES(?,?,?)').run(t0 - i * 60e3, 1 + (i % 30), JSON.stringify({ type: 'call', table: String(1 + (i % 30)), rid: 'r' + i }));
  db.exec('COMMIT');

  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  const H = { 'x-requested-with': 'sequoia', 'content-type': 'application/json' };
  const login = await fetch(base + '/staff/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'cap', password: 'pass-1234' }) });
  const staffCk = login.headers.getSetCookie()[0].split(';')[0];
  // a customer session, made directly (bench is not about OTP)
  const custCk = await (async () => {
    const r = await fetch(base + '/otp/request', { method: 'POST', headers: { ...H, 'x-forwarded-for': '9.9.9.9' }, body: JSON.stringify({ phone: '01000000007' }) });
    void r; const crypto = require('node:crypto');
    const code = '123456';
    db.prepare('UPDATE otps SET code_hash=? WHERE phone=?').run(crypto.createHmac('sha256', 'bench').update('01000000007:' + code).digest('hex'), '01000000007');
    const v = await fetch(base + '/otp/verify', { method: 'POST', headers: H, body: JSON.stringify({ phone: '01000000007', code }) });
    return v.headers.getSetCookie()[0].split(';')[0];
  })();

  let seq = 0;
  const cases = {
    'GET /api/me (customer card)': () => fetch(base + '/me', { headers: { cookie: custCk } }),
    'GET /api/staff/tables': () => fetch(base + '/staff/tables', { headers: { cookie: staffCk } }),
    'GET /api/staff/customer?phone=': () => fetch(base + '/staff/customer?phone=010' + String(1 + (seq++ % CUSTOMERS)).padStart(8, '0'), { headers: { cookie: staffCk } }),
    'POST /api/staff/stamp': () => { const id = 1 + (seq++ % CUSTOMERS); clock += 6000; return fetch(base + '/staff/stamp', { method: 'POST', headers: { ...H, cookie: staffCk }, body: JSON.stringify({ customerId: id, requestId: 'bench' + seq.toString(36).padStart(8, '0') }) }); },
    'POST /api/calls': () => { const n = 1 + (seq++ % 999); clock += 30e3; return fetch(base + '/calls', { method: 'POST', headers: { ...H, 'x-forwarded-for': '10.0.' + (n >> 8) + '.' + (n & 255) }, body: JSON.stringify({ type: 'call', table: n, s: app.tableSig(n) }) }); },
  };

  const out = {};
  for (const [name, fn] of Object.entries(cases)) {
    const lat = []; let errs = 0, codes = {};
    const end = performance.now() + SECS * 1000;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (performance.now() < end) {
        const s = performance.now();
        try { const r = await fn(); await r.arrayBuffer(); codes[r.status] = (codes[r.status] || 0) + 1; } catch { errs++; }
        lat.push(performance.now() - s);
      }
    }));
    lat.sort((a, b) => a - b);
    const q = p => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(2);
    out[name] = { 'req/s': Math.round(lat.length / SECS), p50: q(0.5), p95: q(0.95), p99: q(0.99), codes: JSON.stringify(codes), errs };
  }
  console.table(out);
  app.server.closeAllConnections(); app.server.close(); db.close();
  fs.rmSync(dir, { recursive: true, force: true });
})();
~~~~

## `apps/loyalty/test/calls.test.js`

~~~~js
'use strict';
// Table calls (replaces ntfy.sh): menu posts with a signed table link, only staff can read the live stream.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

async function setup(opts = {}) {
  let clock = 1_800_000_000_000;
  const app = createApp({ now: () => clock, sendOtp: async () => {}, secret: 'test', secureCookies: false, inbound: null, ...opts });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  app.setStaff('cap', 'captain', 'Kareem', 'pass-1234');
  const jar = () => {
    const ck = {};
    const f = async (method, path, body, { csrf = true } = {}) => {
      const h = { cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ') };
      if (csrf) h['x-requested-with'] = 'sequoia';
      if (body) h['content-type'] = 'application/json';
      const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    f.cookie = () => Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ');
    return f;
  };
  // read SSE "msg" events until n arrived
  async function readStream(cookie, n, trigger) {
    const ac = new AbortController();
    const r = await fetch(base + '/staff/calls/stream', { headers: { cookie }, signal: ac.signal });
    if (r.status !== 200) { ac.abort(); return { status: r.status, msgs: [] }; }
    const dec = new TextDecoder(); let buf = ''; const msgs = [];
    const reader = r.body.getReader();
    if (trigger) setTimeout(trigger, 50);
    while (msgs.length < n) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: msg$/m.test(block)) msgs.push(JSON.parse(block.match(/^data: (.*)$/m)[1]));
      }
    }
    ac.abort();
    return { status: 200, msgs };
  }
  return { app, jar, readStream, tick: ms => { clock += ms; }, close: () => { app.server.closeAllConnections(); app.server.close(); } };
}

test('calls: signed table link required; unsigned/forged rejected', async () => {
  const t = await setup();
  try {
    const m = t.jar();
    assert.equal((await m('POST', '/calls', { type: 'call', table: '7' })).status, 403);
    assert.equal((await m('POST', '/calls', { type: 'call', table: '7', s: t.app.tableSig(8) })).status, 403);
    assert.equal((await m('POST', '/calls', { type: 'call', table: '7', s: t.app.tableSig(7) }, { csrf: false })).status, 403);
    assert.equal((await m('POST', '/calls', { type: 'took', table: '7', s: t.app.tableSig(7) })).status, 400);
    assert.equal((await m('POST', '/calls', { type: 'call', table: '7', s: t.app.tableSig(7), rid: 'abc123' })).status, 200);
  } finally { t.close(); }
});

test('calls: legacy unsigned links only with TABLE_QR_LEGACY', async () => {
  const t = await setup({ legacyTables: true });
  try { assert.equal((await t.jar()('POST', '/calls', { type: 'bill', table: '3', pay: 'cash' })).status, 200); } finally { t.close(); }
});

test('calls: stream needs staff login, replays history, then goes live; took/undo are staff-only', async () => {
  const t = await setup();
  try {
    const m = t.jar(); const s7 = t.app.tableSig(7);
    await m('POST', '/calls', { type: 'req', table: '7', s: s7, item: 'مياه', rid: 'r1abcd' });
    assert.equal((await t.readStream('', 1)).status, 401);
    assert.equal((await m('POST', '/staff/calls', { type: 'took', table: '7', rids: ['r1abcd'] })).status, 401);

    const s = t.jar();
    assert.equal((await s('POST', '/staff/login', { username: 'cap', password: 'pass-1234' })).status, 200);
    const got = await t.readStream(s.cookie(), 3, async () => {
      await m('POST', '/calls', { type: 'call', table: '7', s: s7, rid: 'r2abcd' });
      await s('POST', '/staff/calls', { type: 'took', table: '7', rids: ['r1abcd', 'r2abcd'] });
    });
    assert.deepEqual(got.msgs.map(x => x.body.type), ['req', 'call', 'took']);
    assert.equal(got.msgs[0].body.item, 'مياه');
    assert.equal(got.msgs[2].body.by, 'Kareem');
    assert.equal(got.msgs[0].time, 1_800_000_000_000);
  } finally { t.close(); }
});

test('calls: history older than 12 h is not replayed; per-table rate limit', async () => {
  const t = await setup();
  try {
    const m = t.jar(); const s5 = t.app.tableSig(5);
    await m('POST', '/calls', { type: 'call', table: '5', s: s5 });
    t.tick(13 * 3600e3);
    await m('POST', '/calls', { type: 'bill', table: '5', s: s5, pay: 'card' });
    const s = t.jar(); await s('POST', '/staff/login', { username: 'cap', password: 'pass-1234' });
    const got = await t.readStream(s.cookie(), 1);
    assert.deepEqual(got.msgs.map(x => x.body.type), ['bill']);
    let last; for (let i = 0; i < 25; i++) last = await m('POST', '/calls', { type: 'call', table: '5', s: s5 });
    assert.equal(last.status, 429);
  } finally { t.close(); }
});

test('report: staff-only proxy to the sheet; token added server-side', async () => {
  const sent = [];
  const t = await setup({ report: { url: 'https://sheet.example/exec', token: 'tok-123' },
    fetchImpl: async (u, init) => { sent.push({ u, body: JSON.parse(init.body) }); return { ok: true }; } });
  try {
    const anon = t.jar();
    assert.equal((await anon('POST', '/staff/report', { rows: [{ rid: 'a' }] })).status, 401);
    const s = t.jar(); await s('POST', '/staff/login', { username: 'cap', password: 'pass-1234' });
    assert.equal((await s('POST', '/staff/report', { rows: [{ rid: 'a', table: '7' }] })).status, 200);
    assert.deepEqual(sent, [{ u: 'https://sheet.example/exec', body: { token: 'tok-123', by: 'cap', rows: [{ rid: 'a', table: '7' }] } }]);
  } finally { t.close(); }
});
~~~~

## `apps/loyalty/test/e2e.js`

~~~~js
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

  // ---------- customer phone (390px) ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await phone.newPage();
  const loaded = [];
  p.on('request', r => loaded.push(r.url()));
  await p.goto(base + '/?t=7&s=' + app.tableSig(7) + '#tracks'); // signed table QR link
  await p.waitForSelector('[data-acct]');
  assert.ok(!loaded.some(u => u.includes('account.js')), 'loyalty code must not load with the menu');

  // existing Ready to order flow still works
  await p.click('[data-call]'); await p.click('[data-send="call"]');
  await p.waitForSelector('text=On the way!');
  assert.match(app.db.prepare('SELECT body FROM calls ORDER BY id DESC').get().body, /"type":"call","table":"7"/); // stored by our API, no ntfy.sh
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
  await ipad.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const c = await ipad.newPage();
  await c.goto(base + '/captain-ly9fglcp.html');
  await c.waitForSelector('#gu'); // staff login gate (server session) replaces the old PIN
  await c.fill('#gu', 'kareem'); await c.fill('#pin', 'demo-pass-1'); await c.click('#gform button');
  await c.waitForSelector('#gate', { state: 'hidden' });
  await c.click('#t-card');
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
~~~~

## `apps/loyalty/test/inbound.test.js`

~~~~js
'use strict';
// Option B: customer sends "SEQ-123456" to the café on WhatsApp; Message Pro posts it to our signed webhook.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createApp } = require('../server');

const SECRET = 'hook-secret';
async function setup() {
  let clock = 1_800_000_000_000;
  const app = createApp({ now: () => clock, sendOtp: async () => {}, secret: 'test', secureCookies: false,
    inbound: { secret: SECRET, waNumber: '201000000000', inboxId: 147 } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  const browser = () => {
    const ck = {};
    return async (method, path, body) => {
      const h = { 'x-requested-with': 'sequoia', cookie: Object.entries(ck).map(([k, v]) => k + '=' + v).join('; ') };
      if (body) h['content-type'] = 'application/json';
      const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) ck[k] = v; else delete ck[k]; }
      return { status: r.status, body: await r.json().catch(() => null) };
    };
  };
  const hook = async (payload, { secret = SECRET, ts = Math.floor(clock / 1000), tamper = false } = {}) => {
    const raw = JSON.stringify(payload);
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest('hex');
    const r = await fetch(base + '/hooks/messagepro', { method: 'POST', body: tamper ? raw.replace('SEQ', 'SEX') : raw,
      headers: { 'content-type': 'application/json', 'x-chatwoot-signature': sig, 'x-chatwoot-timestamp': String(ts) } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const msg = (content, phone = '+201012345678', extra = {}) => ({ event: 'message_created', message_type: 'incoming', private: false,
    content, inbox: { id: 147 }, sender: { phone_number: phone }, ...extra });
  return { app, browser, hook, msg, tick: ms => { clock += ms; }, close: () => { app.server.closeAllConnections(); app.server.close(); } };
}

test('inbound: start -> customer sends code from WhatsApp -> browser gets a card session', async () => {
  const t = await setup();
  try {
    const b = t.browser();
    assert.deepEqual((await b('GET', '/login/options')).body, { otp: true, whatsapp: true });
    const s = await b('POST', '/otp/inbound/start', {});
    assert.equal(s.status, 200);
    assert.match(s.body.code, /^SEQ-\d{6}$/);
    assert.equal(s.body.wa, 'https://wa.me/201000000000?text=' + s.body.code);
    assert.deepEqual((await b('GET', '/otp/inbound/status')).body, { pending: true });
    assert.equal((await b('GET', '/me')).status, 401);

    assert.equal((await t.hook(t.msg('عايز أدخل ' + s.body.code))).status, 200);
    const done = await b('GET', '/otp/inbound/status');
    assert.equal(done.status, 200); assert.equal(done.body.ok, true);
    assert.equal((await b('GET', '/me')).status, 200);
    assert.equal((await b('GET', '/otp/inbound/status')).status, 410); // one-time
    const row = t.app.db.prepare("SELECT phone FROM customers").get();
    assert.equal(row.phone, '01012345678');
  } finally { t.close(); }
});

test('inbound: bad/old/missing signature is rejected and binds nothing', async () => {
  const t = await setup();
  try {
    const b = t.browser(); const s = await b('POST', '/otp/inbound/start', {});
    assert.equal((await t.hook(t.msg(s.body.code), { secret: 'wrong' })).status, 401);
    assert.equal((await t.hook(t.msg(s.body.code), { ts: Math.floor(1_800_000_000_000 / 1000) - 600 })).status, 401);
    assert.equal((await t.hook(t.msg(s.body.code), { tamper: true })).status, 401);
    const r = await fetch(t.app.server.address && ('http://127.0.0.1:' + t.app.server.address().port + '/api/hooks/messagepro'), { method: 'POST', body: '{}' });
    assert.equal(r.status, 401);
    assert.deepEqual((await b('GET', '/otp/inbound/status')).body, { pending: true });
  } finally { t.close(); }
});

test('inbound: ignores outgoing, other inboxes, wrong codes; code expires', async () => {
  const t = await setup();
  try {
    const b = t.browser(); const s = await b('POST', '/otp/inbound/start', {});
    await t.hook(t.msg(s.body.code, undefined, { message_type: 'outgoing' }));
    await t.hook(t.msg(s.body.code, undefined, { inbox: { id: 152 } }));
    await t.hook(t.msg('SEQ-000000' === s.body.code ? 'SEQ-000001' : 'SEQ-000000'));
    assert.deepEqual((await b('GET', '/otp/inbound/status')).body, { pending: true });
    t.tick(6 * 60e3);
    await t.hook(t.msg(s.body.code));
    assert.equal((await b('GET', '/otp/inbound/status')).status, 410);
  } finally { t.close(); }
});

test('inbound: another browser cannot claim the session (needs the pending cookie)', async () => {
  const t = await setup();
  try {
    const victim = t.browser(); const s = await victim('POST', '/otp/inbound/start', {});
    await t.hook(t.msg(s.body.code));
    const other = t.browser();
    assert.equal((await other('GET', '/otp/inbound/status')).status, 410);
    assert.equal((await victim('GET', '/otp/inbound/status')).status, 200);
  } finally { t.close(); }
});

test('inbound: disabled when not configured', async () => {
  const app = createApp({ sendOtp: async () => {}, secret: 'x', secureCookies: false, inbound: null });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  try {
    assert.deepEqual(await (await fetch(base + '/login/options')).json(), { otp: true, whatsapp: false });
    assert.equal((await fetch(base + '/hooks/messagepro', { method: 'POST', body: '{}' })).status, 404);
  } finally { app.server.closeAllConnections(); app.server.close(); }
});
~~~~

## `apps/loyalty/test/otp.test.js`

~~~~js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const OTP = require('../otp');

// Fake Message Pro API: records calls, answers like the Chatwoot-based platform.
function fakePlatform({ contacts = [], conversations = [], fail = {} } = {}) {
  const calls = [];
  let nextId = 500;
  const fetchImpl = async (url, init) => {
    const u = new URL(url); const path = u.pathname.replace('/api/v1/accounts/129', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, query: u.search, body, headers: init.headers });
    const json = (status, j) => ({ ok: status < 300, status, json: async () => j });
    if (fail[path]) return json(fail[path], {});
    if (init.method === 'POST' && path === '/contacts/filter') {
      const v = body.payload[0].values[0];
      return json(200, { meta: { count: 1 }, payload: contacts.filter(c => c.phone_number === v) });
    }
    if (path === '/contacts/search') return json(403, { error: 'Access to this endpoint is not authorized for account access tokens' });
    if (init.method === 'POST' && path === '/contacts') { const c = { id: nextId++, phone_number: body.phone_number }; contacts.push(c); return json(200, { payload: { contact: c } }); }
    let m = path.match(/^\/contacts\/(\d+)\/conversations$/);
    if (m) return json(200, { payload: conversations.filter(c => c.contact_id === +m[1]) });
    if (init.method === 'POST' && path === '/conversations') { const c = { id: nextId++, inbox_id: body.inbox_id, contact_id: body.contact_id, status: 'open' }; conversations.push(c); return json(200, c); }
    m = path.match(/^\/conversations\/(\d+)\/messages$/);
    if (m) return json(200, { id: nextId++ });
    return json(404, {});
  };
  return { calls, fetchImpl, contacts, conversations };
}
const make = f => OTP.messagePro({ token: 'tok', accountId: 129, inboxId: 147, fetchImpl: f.fetchImpl });

test('messagepro: new number -> creates contact + conversation, sends code as text', async () => {
  const f = fakePlatform();
  await make(f)('01012345678', '123456');
  const seq = f.calls.map(c => c.method + ' ' + c.path);
  assert.deepEqual(seq, ['POST /contacts/filter', 'POST /contacts', 'GET /contacts/500/conversations', 'POST /conversations', 'POST /conversations/501/messages']);
  assert.equal(f.calls[1].body.phone_number, '+201012345678'); assert.equal(f.calls[1].body.inbox_id, 147);
  assert.deepEqual(f.calls[3].body, { inbox_id: 147, contact_id: 500, source_id: '201012345678' });
  const msg = f.calls[4].body;
  assert.equal(msg.message_type, 'outgoing'); assert.equal(msg.private, false);
  assert.match(msg.content, /123456/);
  assert.equal(f.calls[0].headers.api_access_token, 'tok');
});

test('messagepro: existing contact with open WhatsApp conversation is reused', async () => {
  const f = fakePlatform({
    contacts: [{ id: 7, phone_number: '+201012345678' }],
    conversations: [{ id: 30, inbox_id: 147, contact_id: 7, status: 'open' }, { id: 31, inbox_id: 152, contact_id: 7, status: 'open' }, { id: 29, inbox_id: 147, contact_id: 7, status: 'resolved' }],
  });
  await make(f)('01012345678', '654321');
  assert.deepEqual(f.calls.map(c => c.method + ' ' + c.path), ['POST /contacts/filter', 'GET /contacts/7/conversations', 'POST /conversations/30/messages']);
});

test('messagepro: platform error rejects (server answers 502, no code leaks)', async () => {
  const f = fakePlatform({ fail: { '/contacts/filter': 401 } });
  await assert.rejects(make(f)('01012345678', '111111'), /messagepro filter 401/);
});

test('fromEnv: messagepro needs its settings; production refuses the dev stub', () => {
  assert.throws(() => OTP.fromEnv({ WHATSAPP_PROVIDER: 'messagepro' }), /required/);
  assert.equal(typeof OTP.fromEnv({ WHATSAPP_PROVIDER: 'messagepro', MESSAGEPRO_TOKEN: 'x', MESSAGEPRO_ACCOUNT_ID: '129', MESSAGEPRO_INBOX_ID: '147' }), 'function');
  assert.throws(() => OTP.fromEnv({ NODE_ENV: 'production' }), /WHATSAPP_PROVIDER/);
  assert.equal(typeof OTP.fromEnv({}), 'function');
});
~~~~

## `apps/loyalty/test/rules.test.js`

~~~~js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules');
const base = { STAMPS_REQUIRED: 6, MIN_HOURS_BETWEEN_STAMPS: 3, STAMP_EXPIRY_DAYS: null };
const H = 3600e3, DAY = 24 * H, T0 = 1_800_000_000_000;
const st = (n, cycle = 1, gap = 4 * H) => Array.from({ length: n }, (_, i) => ({ created_at: T0 + i * gap, cycle_id: cycle }));

test('counts stamps of the current cycle only', () => {
  const s = [...st(2, 1), ...st(3, 2, 5 * H).map(x => ({ ...x, created_at: x.created_at + 30 * DAY }))];
  const c = R.cardState(s, 2, T0 + 60 * DAY, base);
  assert.equal(c.count, 3); assert.equal(c.remaining, 3); assert.equal(c.complete, false);
});
test('cooldown blocks a second stamp within MIN_HOURS', () => {
  const c = R.cardState(st(1), 1, T0 + 2 * H, base);
  assert.equal(R.stampBlock(c), 'too_soon');
  assert.equal(R.stampBlock(R.cardState(st(1), 1, T0 + 3 * H, base)), null);
});
test('completion at STAMPS_REQUIRED, full card blocks stamping, allows redeem', () => {
  const c = R.cardState(st(6), 1, T0 + 100 * H, base);
  assert.equal(c.complete, true); assert.equal(c.slots.length, 6);
  assert.equal(R.stampBlock(c), 'card_full'); assert.equal(R.redeemBlock(c), null);
  assert.equal(R.redeemBlock(R.cardState(st(5), 1, T0 + 100 * H, base)), 'not_full');
});
test('new cycle starts empty', () => {
  const c = R.cardState(st(6, 1), 2, T0 + 100 * H, base);
  assert.equal(c.count, 0); assert.equal(c.complete, false);
});
test('expiry ignored when null, applied when set', () => {
  const s = st(3, 1, DAY);
  assert.equal(R.cardState(s, 1, T0 + 40 * DAY, base).count, 3);
  assert.equal(R.cardState(s, 1, T0 + 31.5 * DAY, { ...base, STAMP_EXPIRY_DAYS: 30 }).count, 1);
});
test('phone normalization and masking', () => {
  for (const v of ['01012345678', '+201012345678', '00201012345678', '1012345678', '010 1234 5678', '٠١٠١٢٣٤٥٦٧٨']) assert.equal(R.normalizePhone(v), '01012345678', v);
  for (const v of ['0101234567', '01312345678', 'abc', '', null, '0201012345678']) assert.equal(R.normalizePhone(v), null, String(v));
  assert.equal(R.maskPhone('01012345678'), '010•••••678');
});
~~~~

## `apps/loyalty/test/setup.test.js`

~~~~js
'use strict';
// One-time Message Pro setup page: link code checked, token verified with the platform, saved, provider switched live.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const crypto = require('node:crypto');
const { createApp } = require('../server');

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
async function setup({ platformOk = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-setup-'));
  const settingsFile = path.join(dir, 'settings.json');
  const code = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(settingsFile, JSON.stringify({ setup: { hash: sha(code), exp: Date.now() + 3600e3 } }));
  const calls = [];
  const app = createApp({ settingsFile, secret: 'x', secureCookies: false, inbound: undefined,
    fetchImpl: async (u, init) => { calls.push({ u, token: init.headers.api_access_token }); return { ok: platformOk, status: platformOk ? 200 : 401 }; } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port + '/api';
  const post = body => fetch(base + '/setup/messagepro', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sequoia' }, body: JSON.stringify(body) })
    .then(async r => ({ status: r.status, body: await r.json() }));
  return { app, code, settingsFile, calls, post, base, close: () => { app.server.closeAllConnections(); app.server.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const keep = {};
test.before(() => { for (const k of ['WHATSAPP_PROVIDER', 'MESSAGEPRO_TOKEN', 'MESSAGEPRO_WEBHOOK_SECRET', 'SEQUOIA_WA_NUMBER', 'MESSAGEPRO_ACCOUNT_ID', 'MESSAGEPRO_INBOX_ID']) keep[k] = process.env[k]; process.env.SEQUOIA_WA_NUMBER = '201000000000'; });
test.after(() => { for (const [k, v] of Object.entries(keep)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

test('setup: wrong or missing code is refused and saves nothing', async () => {
  const t = await setup();
  try {
    assert.equal((await t.post({ code: 'x'.repeat(32), token: 'mpa_abcdefghijkl' })).status, 403);
    assert.equal((await t.post({ token: 'mpa_abcdefghijkl' })).status, 403);
    assert.equal(t.calls.length, 0);
    assert.equal(JSON.parse(fs.readFileSync(t.settingsFile)).env, undefined);
  } finally { t.close(); }
});

test('setup: token rejected by Message Pro is not saved; link still usable', async () => {
  const t = await setup({ platformOk: false });
  try {
    const r = await t.post({ code: t.code, token: 'mpa_wrongtoken123' });
    assert.equal(r.status, 400); assert.equal(r.body.error, 'token-rejected');
    const st = JSON.parse(fs.readFileSync(t.settingsFile));
    assert.equal(st.env, undefined); assert.ok(st.setup);
  } finally { t.close(); }
});

test('setup: good token + secret saved, provider switched live, link single-use, nothing echoed', async () => {
  const t = await setup();
  try {
    const r = await t.post({ code: t.code, token: 'mpa_goodtoken12345', webhookSecret: 'whsec_abcdefgh' });
    assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.whatsappMessage, true);
    assert.ok(!JSON.stringify(r.body).includes('goodtoken'));
    assert.equal(t.calls[0].token, 'mpa_goodtoken12345');
    const st = JSON.parse(fs.readFileSync(t.settingsFile));
    assert.deepEqual(st.env, { WHATSAPP_PROVIDER: 'messagepro', MESSAGEPRO_TOKEN: 'mpa_goodtoken12345', MESSAGEPRO_WEBHOOK_SECRET: 'whsec_abcdefgh', MESSAGEPRO_ACCOUNT_ID: '129', MESSAGEPRO_INBOX_ID: '147' });
    assert.equal(st.setup, undefined);
    if (process.platform !== 'win32') assert.equal(fs.statSync(t.settingsFile).mode & 0o777, 0o600);
    assert.deepEqual(await (await fetch(t.base + '/login/options')).json(), { otp: true, whatsapp: true });
    assert.equal((await t.post({ code: t.code, token: 'mpa_goodtoken12345' })).status, 403); // single use
  } finally { t.close(); }
});
~~~~

## `apps/payroll/public/index.html`

~~~~html
<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Titan Payroll</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap">
<style>
/* Layout: ledger app — month bar on top, team roster, then a profile "pay slip" with editable KPI inputs */
:root{
  --bg:#f3f4f7;--surface:#ffffff;--ink:#141824;--muted:#5d6475;--line:#dfe2ea;
  --accent:#1f4fd6;--accent-soft:#e6edff;--gold:#b7862a;
  --good:#1d8a55;--warn:#b7791f;--bad:#c23a3a;
  --display:"Reem Kufi","IBM Plex Sans Arabic",system-ui,sans-serif;
  --body:"IBM Plex Sans Arabic",system-ui,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e111a;--surface:#171b27;--ink:#e9ecf3;--muted:#98a0b3;--line:#2a3042;--accent:#7d9cff;--accent-soft:#1f2a4d;--gold:#e0b45a;--good:#4cc48a;--warn:#e6a94a;--bad:#ef6b6b;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0e111a;--surface:#171b27;--ink:#e9ecf3;--muted:#98a0b3;--line:#2a3042;--accent:#7d9cff;--accent-soft:#1f2a4d;--gold:#e0b45a;--good:#4cc48a;--warn:#e6a94a;--bad:#ef6b6b;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.55}
.wrap{max-width:1100px;margin:0 auto;padding-block:20px 60px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:20px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
h1{font-family:var(--display);font-size:1.7rem;margin:0}
h1 small{display:block;font-family:var(--body);font-size:.85rem;color:var(--muted);font-weight:400}
h2{font-family:var(--display);font-size:1.2rem;margin:0}
h3{font-size:.8rem;letter-spacing:.04em;color:var(--muted);margin:0;font-weight:600}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
input,select,textarea{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 10px;min-width:0}
input:focus-visible,select:focus-visible,button:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button{font:inherit;cursor:pointer;border-radius:8px;padding:7px 14px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}
button.pri{background:var(--accent);border-color:var(--accent);color:var(--surface);font-weight:600}
button.ghost{border-color:transparent;background:transparent;color:var(--muted)}
button.danger{color:var(--bad)}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}
.tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--muted);padding:10px 14px}
.tabs button[aria-selected="true"]{color:var(--ink);border-color:var(--accent);font-weight:600}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.stat b{display:block;font-size:1.35rem;font-variant-numeric:tabular-nums}
.stat span{color:var(--muted);font-size:.85rem}
.tblw{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:10px 12px;text-align:start;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-size:.8rem;color:var(--muted);font-weight:600}
tr:last-child td{border-bottom:0}
tbody tr{cursor:pointer}tbody tr:hover{background:var(--accent-soft)}
.pill{display:inline-block;padding:1px 9px;border-radius:99px;font-size:.78rem;font-weight:600}
.p-good{background:color-mix(in srgb,var(--good) 15%,transparent);color:var(--good)}
.p-warn{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn)}
.p-bad{background:color-mix(in srgb,var(--bad) 15%,transparent);color:var(--bad)}
.grid2{display:grid;grid-template-columns:1.1fr .9fr;gap:16px}
@media (max-width:820px){.grid2{grid-template-columns:1fr}}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;display:grid;gap:14px;min-width:0}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.fields label{display:grid;gap:4px;font-size:.82rem;color:var(--muted)}
.slip{display:grid;gap:6px;font-variant-numeric:tabular-nums}
.slip div{display:flex;justify-content:space-between;gap:10px}
.slip .neg{color:var(--bad)}.slip .pos{color:var(--good)}
.slip .total{border-top:2px solid var(--ink);padding-top:8px;font-weight:700;font-size:1.15rem}
.kpi{display:grid;gap:4px}
.kpi .row{display:flex;justify-content:space-between;font-size:.85rem}
.meter{height:6px;border-radius:9px;background:var(--line);overflow:hidden}
.meter i{display:block;height:100%;background:var(--accent)}
.plist{display:grid;gap:6px;max-height:260px;overflow:auto}
.plist div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed var(--line);padding-bottom:6px;font-size:.9rem}
.plist em{color:var(--gold);font-style:normal;font-weight:700}
.empty{padding:28px;text-align:center;color:var(--muted)}
.note{font-size:.82rem;color:var(--muted)}
.toast{position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px));inset-inline-start:max(16px,env(safe-area-inset-left,0px));background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:8px}
.confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
</style>
<style>body{margin:0}[hidden]{display:none!important}</style></head><body>
<style>
.login{max-width:360px;margin:12vh auto 0;display:grid;gap:12px}
.login input{width:100%}
.err{color:var(--bad);font-size:.9rem}
.who{display:flex;gap:8px;align-items:center;font-size:.85rem;color:var(--muted)}
.audit td{white-space:normal;vertical-align:top}
.audit .chg{font-size:.82rem;color:var(--muted)}
.audit .chg b{color:var(--ink);font-weight:500}
.lock{font-size:.8rem}
.tabs{overflow-x:auto}
#v-attendance{display:grid;gap:14px}
.arr{cursor:default;white-space:nowrap}.arr-w{display:flex;gap:6px;align-items:center;min-height:34px}
.arr-c{width:20px;height:20px;accent-color:var(--accent);cursor:pointer}.arr-t{padding:3px 6px;width:auto}
.att-crumbs{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:2px}
#v-profile>.att-crumbs{margin-bottom:14px}
.att-crumbs nav{display:flex;gap:8px;align-items:center;color:var(--muted)}
button.link{border:0;background:none;padding:0;color:var(--accent)}
.att-seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.att-seg button{border:0;border-radius:0;background:var(--surface);color:var(--muted)}
.att-seg button[aria-pressed="true"]{background:var(--accent-soft);color:var(--accent);font-weight:600}
.att-head,.att-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.att-sum{grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:8px}
.att-sum .stat{padding:8px 12px}.att-sum .stat b{font-size:1.15rem}
.att-over,.att-diff.over{color:var(--good)}.att-short,.att-diff.short{color:var(--bad)}
.att-bulk{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px}
.att-dow,.att-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.att-dow{color:var(--muted);font-size:.8rem;text-align:center;margin-bottom:6px}
.att-day{min-height:92px;padding:6px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:start;font-size:.8rem;font-variant-numeric:tabular-nums}
.att-day:not(:disabled):hover{border-color:var(--accent)}.att-day:disabled{cursor:default;color:var(--ink)}
.att-day .n{font-weight:600}.att-day.off{background:transparent}
.att-day.today{border-color:var(--accent);border-width:2px;padding:5px}
.att-day.sel{background:var(--accent-soft);outline:2px solid var(--accent);outline-offset:-1px}
.att-st{display:inline-block;font-size:.76rem;font-weight:600;border-radius:5px;padding:0 6px;white-space:nowrap}
.att-good{color:var(--good);background:color-mix(in srgb,var(--good) 14%,transparent)}.att-warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}.att-gold{color:var(--gold);background:color-mix(in srgb,var(--gold) 14%,transparent)}.att-accent{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}.att-bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
.att-man{font-style:normal;color:var(--gold)}.att-man-tag{font-size:.76rem;color:var(--gold);white-space:nowrap}
.att-note{white-space:normal;max-width:220px;color:var(--muted);font-size:.85rem}
dialog{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:18px;width:min(420px,calc(100vw - 32px))}
dialog::backdrop{background:rgb(0 0 0/.45)}
dialog form{display:grid;gap:12px}dialog label{display:grid;gap:4px}dialog input,dialog select,dialog textarea{width:100%}
.att-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.att-check{display:flex!important;grid-template-columns:none;gap:8px;align-items:center}.att-check input{width:auto}
.att-acts{display:flex;gap:8px;justify-content:flex-end}.att-acts .danger{margin-inline-end:auto}
@media (max-width:600px){.att-dow,.att-grid{gap:3px}.att-day{min-height:68px;padding:3px;font-size:.7rem}.att-day.today{padding:2px}.att-st{font-size:.64rem;padding:0 3px}.att-diff{display:none}}
</style>
<div id="login" class="wrap" dir="rtl" hidden>
  <form class="panel login" id="loginForm">
    <h1>Titan Payroll<small>دخول الإدارة — Titan Agency</small></h1>
    <label class="note" style="display:grid;gap:4px">اسم المستخدم<input id="lu" autocomplete="username" required></label>
    <label class="note" style="display:grid;gap:4px">الباسورد<input id="lp" type="password" autocomplete="current-password" required></label>
    <div id="lerr" class="err"></div>
    <button class="pri" type="submit">دخول</button>
  </form>
</div>
<div id="app" class="wrap" dir="rtl" hidden>
  <header>
    <h1>Titan Payroll<small>تراكينج الموظفين والمرتبات — Titan Agency</small></h1>
    <div class="bar">
      <label for="month" class="note">الشهر</label><input type="month" id="month">
      <span id="lockBadge"></span>
      <span class="who"><span id="whoName"></span><button class="ghost" id="logout">خروج</button></span>
    </div>
  </header>
  <nav class="tabs" role="tablist">
    <button role="tab" id="t-team" aria-selected="true">الفريق</button>
    <button role="tab" id="t-profile" aria-selected="false">البروفايل</button>
    <button role="tab" id="t-attendance" aria-selected="false">الحضور</button>
    <button role="tab" id="t-audit" aria-selected="false">سجل التعديلات</button>
    <button role="tab" id="t-settings" aria-selected="false">الإعدادات</button>
  </nav>
  <section id="v-team"></section>
  <section id="v-profile" hidden></section>
  <section id="v-attendance" hidden></section>
  <section id="v-audit" hidden></section>
  <section id="v-settings" hidden></section>
</div>
<dialog id="attDlg" dir="rtl"><form id="attForm"><h2 id="adTitle"></h2>
  <label class="note">الحالة<select id="adStatus"><option value="present">حاضر</option><option value="late">متأخر</option><option value="half">نص يوم</option><option value="leave">إجازة</option><option value="absent">غايب</option></select></label>
  <div id="adTimes" style="display:grid;gap:12px"><div class="att-pair"><label class="note">حضور<input type="time" id="adIn"></label><label class="note">انصراف<input type="time" id="adOut"></label></div>
  <div class="note" id="adAuto"></div>
  <label class="note att-check"><input type="checkbox" id="adOv">تعديل عدد الساعات يدوي</label><input type="number" id="adHours" min="0" max="24" step="0.25" aria-label="عدد الساعات" hidden></div>
  <label class="note">ملاحظة<input id="adNote" maxlength="500"></label>
  <div class="att-acts"><button type="button" class="danger" id="adClear">مسح اليوم</button><button type="button" id="adCancel">إغلاق</button><button class="pri" type="submit">حفظ</button></div></form></dialog>
<dialog id="shiftDlg" dir="rtl"><form id="shiftForm"><h2>الوردية</h2><div class="att-pair"><label class="note">بداية الوردية<input type="time" id="sdStart" required></label><label class="note">عدد الساعات<input type="number" id="sdHours" min="1" max="24" step="0.5" required></label></div>
  <div class="att-acts"><button type="button" id="sdCancel">إلغاء</button><button class="pri" type="submit">حفظ</button></div></form></dialog>
<div id="toast" class="toast" hidden></div>

<script>
const $=s=>document.querySelector(s);
const fmt=n=>Math.round(n).toLocaleString('ar-EG')+' ج';
const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const S={me:null,emps:{},recs:{},pts:[],months:{},cfg:{},cur:null,view:'team'};
const D=new Date();$('#month').value=D.getFullYear()+'-'+String(D.getMonth()+1).padStart(2,'0');
const M=()=>$('#month').value;
const can=r=>({viewer:1,editor:2,admin:3})[S.me?.role]>=({viewer:1,editor:2,admin:3})[r];
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(e._t);e._t=setTimeout(()=>e.hidden=true,2600)}

async function call(method,url,body){
  const r=await fetch('/api'+url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'payroll'},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
  const j=await r.json().catch(()=>({}));
  if(r.status===401&&url!=='/login'){showLogin();throw new Error('login')}
  if(!r.ok){toast(j.error||'حصل خطأ');throw new Error(j.error)}
  return j;
}
async function load(){
  const d=await call('GET','/data');
  S.emps=Object.fromEntries(d.employees.map(e=>[e.id,e]));
  S.recs=Object.fromEntries(d.records.map(r=>[r.month+'_'+r.emp_id,r]));
  S.pts=d.points;S.months=Object.fromEntries(d.months.map(m=>[m.month,m]));S.cfg=d.settings;render();
}
const locked=()=>!!S.months[M()]?.locked;

function calc(e,m){
  const r=S.recs[m+'_'+e.id]||{};const c=S.cfg;const base=+e.base||0;const fp=(+e.fixed_pct||0)/100;
  const fixed=base*fp,varPool=base-fixed,day=fixed/(+c.work_days||26);
  const dedDays=(+r.absence||0)*c.absence+(+r.late||0)*c.late+(+r.minor||0)*c.minor+(+r.major||0)*c.major;
  const ded=Math.min(fixed,dedDays*day);
  const q=+r.quality||0,mt=+r.meetings||0,dl=+r.delivery||0;const score=0.4*q+0.2*mt+0.4*dl;const variable=varPool*score/100;
  const myPts=S.pts.filter(p=>p.month===m&&p.emp_id===e.id).reduce((a,p)=>a+p.points,0);
  const allPts=S.pts.filter(p=>p.month===m).reduce((a,p)=>a+p.points,0);
  const budget=+(S.months[m]?.bonus_budget||0);const bonus=allPts>0?budget*myPts/allPts:0;
  return {base,fixed,varPool,ded,dedDays,q,mt,dl,score,variable,myPts,bonus,net:fixed-ded+variable+bonus,hasRec:!!S.recs[m+'_'+e.id]};
}
const pill=s=>s>=85?'<span class="pill p-good">ممتاز</span>':s>=65?'<span class="pill p-warn">متوسط</span>':'<span class="pill p-bad">محتاج متابعة</span>';
const active=()=>Object.values(S.emps).filter(e=>!e.archived).sort((a,b)=>a.name.localeCompare(b.name));

function exportCSV(){
  const m=M();const rows=[['الموظف','الوظيفة','الأساسي','الثابت','أيام خصم','الخصم','سكور KPIs','المتغير','النقاط','البونص','الصافي']];
  active().forEach(e=>{const c=calc(e,m);rows.push([e.name,e.role,c.base,c.fixed,c.dedDays,c.ded,c.score,c.variable,c.myPts,c.bonus,c.net].map(v=>typeof v==='number'?Math.round(v*100)/100:v))});
  const csv='﻿'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='titan-payroll-'+m+'.csv';a.click();
}

function renderTeam(){
  const m=M();const rows=active().map(e=>({e,c:calc(e,m)}));
  const tot=rows.reduce((a,r)=>a+r.c.net,0),totB=rows.reduce((a,r)=>a+r.c.bonus,0);
  const avg=rows.length?rows.reduce((a,r)=>a+r.c.score,0)/rows.length:0;const budget=+(S.months[m]?.bonus_budget||0);
  const adm=can('admin')&&!locked();
  $('#v-team').innerHTML=`<div style="display:grid;gap:16px">
  <div class="summary">
    <div class="stat"><span>إجمالي المرتبات الشهر ده</span><b>${fmt(tot)}</b></div>
    <div class="stat"><span>متوسط سكور الأداء</span><b>${avg.toFixed(0)}%</b></div>
    <div class="stat"><span>ميزانية البونص الشهرية</span>${adm?`<div class="bar"><input id="budget" type="number" min="0" style="width:120px" value="${budget||''}" placeholder="0"><button id="saveBudget">حفظ</button></div>`:`<b>${fmt(budget)}</b>`}</div>
    <div class="stat"><span>البونص الموزّع</span><b>${fmt(totB)}</b></div>
  </div>
  <div class="bar" style="justify-content:space-between"><h2>الفريق (${rows.length})</h2><div class="bar">
    <button id="exp">تنزيل Excel (CSV)</button>
    ${can('admin')?`<button id="lockBtn">${locked()?'فتح الشهر':'اعتماد وقفل الشهر'}</button>`:''}
    ${can('admin')?'<button class="pri" id="addEmp">+ موظف جديد</button>':''}</div></div>
  ${rows.length?`<div class="tblw"><table><thead><tr><th>الموظف</th><th>وصل النهاردة</th><th>الأساسي</th><th>خصومات</th><th>سكور KPIs</th><th>نقاط</th><th>بونص</th><th>الصافي</th></tr></thead><tbody>
  ${rows.map(({e,c})=>`<tr data-id="${e.id}"><td><b>${esc(e.name)}</b><div class="note">${esc(e.role)}</div></td><td class="arr" data-emp="${e.id}"></td><td>${fmt(c.base)}</td><td>${c.ded?'<span style="color:var(--bad)">-'+fmt(c.ded)+'</span>':'—'}</td><td>${c.hasRec?c.score.toFixed(0)+'% '+pill(c.score):'<span class="note">لم يُقيَّم</span>'}</td><td>${c.myPts}</td><td>${fmt(c.bonus)}</td><td><b>${fmt(c.net)}</b></td></tr>`).join('')}
  </tbody></table></div>`:`<div class="panel empty">لسه مفيش موظفين.${can('admin')?' اضغط "موظف جديد" وابدأ بأول بروفايل.':''}</div>`}</div>`;
  $('#exp').onclick=exportCSV;
  const ae=$('#addEmp');if(ae)ae.onclick=()=>{S.cur='new';show('profile')};
  const sb=$('#saveBudget');if(sb)sb.onclick=async()=>{await call('POST','/months',{month:m,bonus_budget:+$('#budget').value||0});toast('اتحفظت الميزانية');load()};
  const lb=$('#lockBtn');if(lb)lb.onclick=()=>{lb.outerHTML=`<span class="confirm">${locked()?'تفتح الشهر للتعديل؟':'تقفل الشهر؟ مش هينفع حد يعدّل فيه.'} <button class="pri" id="lyes">تأكيد</button><button id="lno">إلغاء</button></span>`;
    $('#lyes').onclick=async()=>{await call('POST','/months',{month:m,locked:!locked()});toast(locked()?'اتفتح الشهر':'اتقفل الشهر');load()};$('#lno').onclick=render};
  document.querySelectorAll('#v-team tbody tr').forEach(tr=>tr.onclick=()=>{S.cur=+tr.dataset.id;show('profile')});
  paintArrivals();
}

function renderProfile(){
  const v=$('#v-profile');const m=M();const ed=can('editor')&&!locked();const adm=can('admin');
  const opts=active().map(e=>`<option value="${e.id}" ${e.id===S.cur?'selected':''}>${esc(e.name)}</option>`).join('');
  const e=S.cur==='new'?{id:'new',name:'',role:'',phone:'',start:'',base:'',fixed_pct:70,notes:''}:S.emps[S.cur];
  if(!e||(e.id==='new'&&!adm)){v.innerHTML=`<div class="panel empty">اختار موظف من الفريق.</div><div class="bar" style="margin-top:12px"><select id="pick"><option>اختار…</option>${opts}</select></div>`;const pk=$('#pick');pk.onchange=ev=>{S.cur=+ev.target.value;renderProfile()};return}
  const r=S.recs[m+'_'+e.id]||{};const c=e.id==='new'?null:calc(e,m);
  const pts=S.pts.filter(p=>p.emp_id===e.id&&p.month===m).sort((a,b)=>b.at-a.at);
  const hist=e.id==='new'?[]:[...new Set(Object.values(S.recs).filter(x=>x.emp_id===e.id).map(x=>x.month))].sort().reverse().slice(0,6);
  const meter=(l,w,val)=>`<div class="kpi"><div class="row"><span>${l} <span class="note">(${w}%)</span></span><b>${val}%</b></div><div class="meter"><i style="width:${val}%"></i></div></div>`;
  const dis=x=>x?'':'disabled';
  v.innerHTML=`<div style="display:grid;gap:16px">
  <div class="bar" style="justify-content:space-between"><div class="bar"><label for="pick" class="note">الموظف</label><select id="pick">${adm?`<option value="new" ${S.cur==='new'?'selected':''}>+ موظف جديد</option>`:''}${opts}</select></div>${e.id!=='new'&&adm?'<button class="ghost danger" id="arch">أرشفة الموظف</button>':''}</div>
  <div class="grid2"><div style="display:grid;gap:16px;min-width:0">
    <div class="panel"><h2>بيانات الموظف</h2><div class="fields">
      <label>الاسم<input id="f-name" value="${esc(e.name)}" ${dis(can('editor'))}></label>
      <label>الوظيفة<input id="f-role" value="${esc(e.role)}" ${dis(can('editor'))}></label>
      <label>الموبايل<input id="f-phone" value="${esc(e.phone)}" ${dis(can('editor'))}></label>
      <label>تاريخ التعيين<input id="f-start" type="date" value="${esc(e.start)}" ${dis(can('editor'))}></label>
      <label>المرتب الأساسي (ج)<input id="f-base" type="number" min="0" value="${esc(e.base)}" ${dis(adm)}></label>
      <label>نسبة الثابت %<input id="f-fixed" type="number" min="0" max="100" value="${esc(e.fixed_pct)}" ${dis(adm)}></label>
     </div>
     <label class="note" style="display:grid;gap:4px">ملاحظات<textarea id="f-notes" rows="2" ${dis(can('editor'))}>${esc(e.notes)}</textarea></label>
     ${can('editor')?`<div><button class="pri" id="saveEmp">${e.id==='new'?'إضافة الموظف':'حفظ البيانات'}</button></div>`:''}
    </div>
    ${e.id==='new'?'':`<div class="panel"><h2>تقييم شهر ${m}${locked()?' <span class="pill p-warn lock">مقفول</span>':''}</h2>
     <h3>الجزء الثابت — حضور وانضباط</h3><div class="fields">
      <label>أيام غياب<input id="r-absence" type="number" min="0" value="${r.absence??0}" ${dis(ed)}></label>
      <label>مرات تأخير<input id="r-late" type="number" min="0" value="${r.late??0}" ${dis(ed)}></label>
      <label>مخالفة إدارية بسيطة<input id="r-minor" type="number" min="0" value="${r.minor??0}" ${dis(ed)}></label>
      <label>مخالفة إدارية كبيرة<input id="r-major" type="number" min="0" value="${r.major??0}" ${dis(ed)}></label></div>
     <h3>الجزء المتغير — KPIs من 100</h3><div class="fields">
      <label>الكاباسيتي وجودة التسليم (40%)<input id="r-quality" type="number" min="0" max="100" value="${r.quality??''}" ${dis(ed)}></label>
      <label>حضور الميتنجز والكونتنت (20%)<input id="r-meetings" type="number" min="0" max="100" value="${r.meetings??''}" ${dis(ed)}></label>
      <label>الديليفري والديدلاين (40%)<input id="r-delivery" type="number" min="0" max="100" value="${r.delivery??''}" ${dis(ed)}></label></div>
     <label class="note" style="display:grid;gap:4px">ملاحظات الشهر<textarea id="r-notes" rows="2" ${dis(ed)}>${esc(r.notes)}</textarea></label>
     ${ed?'<div><button class="pri" id="saveRec">حفظ التقييم</button></div>':''}</div>`}
   </div>
   ${e.id==='new'?'<div class="panel empty">بعد ما تضيف الموظف هتظهر هنا قسيمة المرتب والنقاط.</div>':`
   <div style="display:grid;gap:16px;align-content:start;min-width:0">
    <div class="panel"><h2>قسيمة المرتب — ${m}</h2><div class="slip">
      <div><span>الجزء الثابت (${e.fixed_pct}%)</span><span>${fmt(c.fixed)}</span></div>
      <div class="neg"><span>خصومات (${c.dedDays.toFixed(2)} يوم)</span><span>-${fmt(c.ded)}</span></div>
      <div><span>الجزء المتغير (${c.score.toFixed(0)}% من ${fmt(c.varPool)})</span><span>${fmt(c.variable)}</span></div>
      <div class="pos"><span>بونص النقاط (${c.myPts} نقطة)</span><span>+${fmt(c.bonus)}</span></div>
      <div class="total"><span>الصافي</span><span>${fmt(c.net)}</span></div></div>
     ${meter('الكاباسيتي والجودة',40,c.q)}${meter('الميتنجز والكونتنت',20,c.mt)}${meter('الديليفري والديدلاين',40,c.dl)}</div>
    <div class="panel"><h2>نقاط فوق التارجت</h2>
     ${ed?`<div class="fields"><label>نقاط<input id="p-n" type="number" min="1" value="5"></label><label style="grid-column:span 2">السبب (اقتراح، شغل زيادة…)<input id="p-why"></label></div><div><button class="pri" id="addPt">إضافة نقاط</button></div>`:''}
     <div class="plist">${pts.length?pts.map(p=>`<div><span>${esc(p.reason)}<br><span class="note">${esc(p.by_name||'')} · ${new Date(p.at).toLocaleDateString('ar-EG')}</span></span><span><em>+${p.points}</em>${ed?` <button class="ghost" data-del="${p.id}" aria-label="حذف">×</button>`:''}</span></div>`).join(''):'<span class="note">مفيش نقاط الشهر ده.</span>'}</div>
     <p class="note">البونص = ميزانية الشهر × (نقاطه ÷ إجمالي نقاط الفريق).</p></div>
    <div class="panel"><h2>السجل</h2>${hist.length?`<div class="slip">${hist.map(h=>{const x=calc(e,h);return `<div><span>${h}</span><span>${x.score.toFixed(0)}% · ${fmt(x.net)}</span></div>`}).join('')}</div>`:'<span class="note">لسه مفيش شهور متقيّمة.</span>'}</div>
   </div>`}</div></div>`;
  $('#pick').onchange=ev=>{S.cur=ev.target.value==='new'?'new':+ev.target.value;renderProfile()};
  const se=$('#saveEmp');if(se)se.onclick=async()=>{
    const d={name:$('#f-name').value.trim(),role:$('#f-role').value.trim(),phone:$('#f-phone').value.trim(),start:$('#f-start').value,base:+$('#f-base').value||0,fixed_pct:+$('#f-fixed').value||0,notes:$('#f-notes').value};
    if(e.id!=='new')d.id=e.id;const j=await call('POST','/employees',d);S.cur=j.id;toast(e.id==='new'?'اتضاف الموظف':'اتحفظت البيانات');load()};
  const ar=$('#arch');if(ar)ar.onclick=()=>{ar.outerHTML='<span class="confirm">متأكد؟ <button class="danger" id="yes">أرشفة</button><button id="no">إلغاء</button></span>';$('#yes').onclick=async()=>{await call('POST','/employees/'+e.id+'/archive');S.cur=null;toast('اتأرشف');show('team');load()};$('#no').onclick=renderProfile};
  const sr=$('#saveRec');if(sr)sr.onclick=async()=>{const n=id=>+$('#r-'+id).value||0;
    await call('POST','/records',{month:m,emp_id:e.id,absence:n('absence'),late:n('late'),minor:n('minor'),major:n('major'),quality:n('quality'),meetings:n('meetings'),delivery:n('delivery'),notes:$('#r-notes').value});toast('اتحفظ التقييم');load()};
  const ap=$('#addPt');if(ap)ap.onclick=async()=>{await call('POST','/points',{month:m,emp_id:e.id,points:+$('#p-n').value||0,reason:$('#p-why').value.trim()});toast('اتضافت النقاط');load()};
  v.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{await call('DELETE','/points/'+b.dataset.del);toast('اتحذفت');load()});
}

const LBL={name:'الاسم',role:'الوظيفة',phone:'الموبايل',start:'التعيين',base:'الأساسي',fixed_pct:'نسبة الثابت',notes:'ملاحظات',absence:'غياب',late:'تأخير',minor:'مخالفة بسيطة',major:'مخالفة كبيرة',quality:'الجودة',meetings:'الميتنجز',delivery:'الديليفري',points:'نقاط',reason:'السبب',bonus_budget:'ميزانية البونص',locked:'مقفول',work_days:'أيام العمل',active:'مفعّل',password:'الباسورد',username:'اسم المستخدم'};
const ACT={create:'إضافة',update:'تعديل',delete:'حذف',archive:'أرشفة',login:'دخول'};
const ENT={attendance:'حضور',employee:'موظف',record:'تقييم',points:'نقاط',month:'شهر',settings:'الإعدادات',user:'مستخدم',session:'',password:'باسورد'};
async function renderAudit(){
  const v=$('#v-audit');v.innerHTML='<div class="note">جاري التحميل…</div>';
  const rows=await call('GET','/audit?limit=300');const f=v.dataset.f||'edits';
  const list=rows.filter(r=>f==='all'||r.action!=='login');
  const ch=r=>{const b=r.before?JSON.parse(r.before):{},a=r.after?JSON.parse(r.after):{};const ks=[...new Set([...Object.keys(b),...Object.keys(a)])];
    return ks.map(k=>`${LBL[k]||k}: ${k in b?esc(b[k])+' ← ':''}<b>${k in a?esc(a[k]):'—'}</b>`).join(' · ')};
  v.innerHTML=`<div style="display:grid;gap:12px"><div class="bar" style="justify-content:space-between"><h2>سجل التعديلات</h2>
   <select id="af"><option value="edits" ${f==='edits'?'selected':''}>التعديلات بس</option><option value="all" ${f==='all'?'selected':''}>التعديلات ومرات الدخول</option></select></div>
   ${list.length?`<div class="tblw"><table class="audit"><thead><tr><th>الوقت</th><th>مين</th><th>العملية</th><th>على</th><th>التغيير</th></tr></thead><tbody>
   ${list.map(r=>`<tr style="cursor:default"><td>${new Date(r.at).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'})}</td><td><b>${esc(r.user_name)}</b></td><td>${ACT[r.action]||r.action} ${ENT[r.entity]||''}</td><td>${esc(r.label)}</td><td class="chg">${ch(r)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="panel empty">لسه مفيش تعديلات.</div>'}
   <p class="note">السجل بيتكتب من السيرفر لوحده، ومحدش يقدر يمسحه أو يعدّله من الصفحة.</p></div>`;
  $('#af').onchange=ev=>{v.dataset.f=ev.target.value;renderAudit()};
}

async function renderSettings(){
  const c=S.cfg;const adm=can('admin');const d=x=>adm?'':'disabled';
  let users='';if(adm){const us=await call('GET','/users');users=`<div class="panel"><h2>المستخدمين</h2>
   <p class="note">أدمن: كل حاجة. محرر: يعدّل التقييمات والنقاط وبيانات الموظف (من غير المرتب). مشاهد: يشوف بس.</p>
   <div class="tblw"><table><thead><tr><th>الاسم</th><th>اليوزر</th><th>الصلاحية</th><th></th></tr></thead><tbody>
   ${us.map(u=>`<tr style="cursor:default"><td>${esc(u.name)}</td><td dir="ltr">${esc(u.username)}</td><td><select data-role="${u.id}" ${u.id===S.me.id?'disabled':''}>${['admin','editor','viewer'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${{admin:'أدمن',editor:'محرر',viewer:'مشاهد'}[r]}</option>`).join('')}</select></td>
   <td>${u.id===S.me.id?'':`<button class="ghost" data-reset="${u.id}">باسورد جديد</button><button class="ghost ${u.active?'danger':''}" data-act="${u.id}" data-on="${u.active}">${u.active?'إيقاف':'تفعيل'}</button>`}</td></tr>`).join('')}</tbody></table></div>
   <h3>إضافة مستخدم</h3><div class="fields"><label>الاسم<input id="nu-name"></label><label>اسم المستخدم (إنجليزي)<input id="nu-user" dir="ltr"></label>
   <label>الصلاحية<select id="nu-role"><option value="viewer">مشاهد</option><option value="editor">محرر</option><option value="admin">أدمن</option></select></label></div>
   <div><button class="pri" id="nu-add">إضافة</button></div><div id="pwbox"></div></div>`}
  $('#v-settings').innerHTML=`<div style="display:grid;gap:16px;max-width:760px">${users}
   <div class="panel"><h2>قواعد الخصم</h2><p class="note">الخصم بيتحسب بالأيام من الجزء الثابت: قيمة اليوم = الثابت ÷ أيام العمل.</p>
   <div class="fields"><label>أيام العمل في الشهر<input id="c-work_days" type="number" value="${c.work_days}" ${d()}></label>
    <label>يوم الغياب يخصم (يوم)<input id="c-absence" type="number" step="0.25" value="${c.absence}" ${d()}></label>
    <label>التأخير يخصم (يوم)<input id="c-late" type="number" step="0.25" value="${c.late}" ${d()}></label>
    <label>مخالفة بسيطة (يوم)<input id="c-minor" type="number" step="0.25" value="${c.minor}" ${d()}></label>
    <label>مخالفة كبيرة (يوم)<input id="c-major" type="number" step="0.25" value="${c.major}" ${d()}></label></div>
   ${adm?'<div><button class="pri" id="saveCfg">حفظ القواعد</button></div>':''}</div>
   <div class="panel"><h2>تغيير الباسورد بتاعك</h2><div class="fields"><label>الحالي<input id="pw-cur" type="password" autocomplete="current-password"></label><label>الجديد (٨ حروف+)<input id="pw-new" type="password" autocomplete="new-password"></label></div><div><button id="pw-save">تغيير</button></div></div></div>`;
  const sc=$('#saveCfg');if(sc)sc.onclick=async()=>{const x={};['work_days','absence','late','minor','major'].forEach(k=>x[k]=+$('#c-'+k).value||0);await call('POST','/settings',x);toast('اتحفظت القواعد');load()};
  $('#pw-save').onclick=async()=>{await call('POST','/password',{current:$('#pw-cur').value,next:$('#pw-new').value});toast('اتغيّر الباسورد');$('#pw-cur').value=$('#pw-new').value=''};
  const showPw=(u,p)=>{$('#pwbox').innerHTML=`<div class="panel" style="background:var(--accent-soft)"><b>ابعت البيانات دي للشخص، ومش هتظهر تاني:</b><div dir="ltr">User: ${esc(u)}<br>Password: <b>${esc(p)}</b></div><div class="note">يقدر يغيّر الباسورد بعد ما يدخل من الإعدادات.</div></div>`};
  if(adm){
    $('#nu-add').onclick=async()=>{const u=$('#nu-user').value.trim().toLowerCase();const j=await call('POST','/users',{name:$('#nu-name').value.trim(),username:u,role:$('#nu-role').value});await renderSettings();showPw(u,j.password)};
    document.querySelectorAll('[data-role]').forEach(s=>s.onchange=async()=>{await call('POST','/users',{id:+s.dataset.role,role:s.value});toast('اتغيّرت الصلاحية')});
    document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{const j=await call('POST','/users',{id:+b.dataset.reset,role:document.querySelector(`[data-role="${b.dataset.reset}"]`).value,reset:true});const name=b.closest('tr').children[1].textContent;await renderSettings();showPw(name,j.password)});
    document.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{await call('POST','/users',{id:+b.dataset.act,role:document.querySelector(`[data-role="${b.dataset.act}"]`).value,active:b.dataset.on!=='1'});renderSettings()});
  }
}

function show(view){S.view=view;if(view!=='attendance'&&location.hash)history.replaceState(null,'',location.pathname);['team','profile','attendance','audit','settings'].forEach(k=>{$('#v-'+k).hidden=k!==view;$('#t-'+k).setAttribute('aria-selected',k===view)});render()}
function render(){
  $('#lockBadge').innerHTML=locked()?'<span class="pill p-warn">الشهر مقفول</span>':'';
  if(S.view==='team')renderTeam();else if(S.view==='profile')renderProfile();else if(S.view==='attendance')renderAttendance();else if(S.view==='audit')renderAudit();else renderSettings();
}
['team','profile','attendance','audit','settings'].forEach(k=>$('#t-'+k).onclick=()=>show(k));
$('#month').onchange=render;

// ---------- attendance ----------
const ATT_ST={present:['حاضر','good'],late:['متأخر','warn'],half:['نص يوم','gold'],leave:['إجازة','accent'],absent:['غايب','bad']};
const ATT_GRACE=15; // minutes after shift start before a check-in counts as late
const A={rows:{},shift:{start:'09:00',hours:8},view:'cal',sel:new Set(),selecting:false,seq:0,key:'',date:null};
const p2=n=>String(n).padStart(2,'0');
const toDs=d=>d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
const hrs=n=>(+n).toLocaleString('ar-EG',{maximumFractionDigits:2});
const signed=n=>(n>0?'+':'')+hrs(n)+' س';
const mins=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const addH=(t,h)=>{const x=(mins(t)+Math.round(h*60))%1440;return p2(Math.floor(x/60))+':'+p2(x%60)};
const span=(i,o)=>{if(!i||!o)return null;let m=mins(o)-mins(i);if(m<0)m+=1440;return Math.round(m/60*100)/100};
const attEd=()=>can('editor')&&!locked();
function attMonthDays(){const [y,m]=M().split('-').map(Number);const n=new Date(y,m,0).getDate();return Array.from({length:n},(_,i)=>{const d=new Date(y,m-1,i+1);return{ds:toDs(d),day:i+1,dow:d.getDay()}})}
const attLabel=ds=>new Date(ds+'T12:00:00').toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'});
function attTimes(status){if(status==='absent'||status==='leave')return{check_in:null,check_out:null};const h=status==='half'?A.shift.hours/2:A.shift.hours;return{check_in:A.shift.start,check_out:addH(A.shift.start,h)}}
function attDiff(r){if(r.diff===null||r.diff===undefined||r.diff===0)return'';return`<span class="att-diff ${r.diff>0?'over':'short'}">${signed(r.diff)}</span>`}
function attBadge(r){const[l,c]=ATT_ST[r.status];return`<span class="att-st att-${c}">${l}</span>`}

async function renderAttendance(){
  const v=$('#v-attendance');const emp=S.emps[S.cur];
  if(!emp||emp.archived){A.seq++;v.innerHTML=`<div class="panel empty">اختار موظف عشان تسجل حضوره.</div><div class="bar" style="margin-top:12px"><select id="attPick" aria-label="الموظف"><option value="">اختار…</option>${attEmpOpts()}</select></div>`;$('#attPick').onchange=ev=>{if(ev.target.value){S.cur=+ev.target.value;renderAttendance()}};return}
  const key=S.cur+'_'+M();if(key!==A.key){A.key=key;A.sel.clear();A.selecting=false}
  const q=++A.seq;const d=await call('GET',`/attendance?emp=${S.cur}&month=${M()}`).catch(()=>null);
  if(!d||q!==A.seq||S.view!=='attendance')return;
  A.shift=d.shift;A.rows=Object.fromEntries(d.rows.map(r=>[r.date,r]));
  history.replaceState(null,'',`#/employees/${S.cur}/attendance`);paintAtt(emp);
}
function attEmpOpts(){return Object.values(S.emps).filter(e=>!e.archived).sort((a,b)=>a.name.localeCompare(b.name,'ar')).map(e=>`<option value="${e.id}" ${e.id===S.cur?'selected':''}>${esc(e.name)}</option>`).join('')}
function empSubnav(cur){return`<div class="att-crumbs"><nav aria-label="مسار الصفحة"><button class="link" data-go="team">الفريق</button><span>‹</span><b>${esc(S.emps[S.cur]?.name||'')}</b></nav><div class="att-seg" role="group" aria-label="أقسام الموظف"><button data-go="profile" ${cur==='profile'?'aria-pressed="true"':''}>المرتب والبيانات</button><button data-go="attendance" ${cur==='attendance'?'aria-pressed="true"':''}>الحضور</button></div></div>`}
function bindSubnav(root){root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go))}

function paintAtt(emp){
  const v=$('#v-attendance');const ed=attEd();const rows=Object.values(A.rows);const today=toDs(new Date());const tr=A.rows[today];
  const count=s=>rows.filter(r=>r.status===s).length;
  const total=rows.reduce((a,r)=>a+(r.hours||0),0),over=rows.reduce((a,r)=>a+(r.diff>0?r.diff:0),0),short=rows.reduce((a,r)=>a+(r.diff<0?-r.diff:0),0);
  const days=attMonthDays();const lead=(days[0].dow+1)%7;
  const cell=d=>{const r=A.rows[d.ds];const sel=A.sel.has(d.ds);const label=attLabel(d.ds)+(r?' — '+ATT_ST[r.status][0]:' — لم يسجل');
    return`<button class="att-day ${d.dow===5?'off':''} ${d.ds===today?'today':''} ${sel?'sel':''}" data-day="${d.ds}" aria-label="${label}" ${A.selecting?`aria-pressed="${sel}"`:''} ${ed?'':'disabled'}><span class="n">${hrs(d.day)}</span>${r?`${attBadge(r)}${r.hours!==null?`<span class="h">${hrs(r.hours)} س${r.override_hours!==null?' <i class="att-man" title="معدل يدوي">✎</i>':''}</span>`:''}${attDiff(r)}`:''}</button>`};
  const row=d=>{const r=A.rows[d.ds];return`<tr data-day="${d.ds}" ${ed?'':'style="cursor:default"'}><td>${attLabel(d.ds)}</td><td>${r?attBadge(r):'<span class="note">—</span>'}</td><td>${r?.check_in||'—'}</td><td>${r?.check_out||'—'}</td><td>${r&&r.hours!==null?hrs(r.hours)+(r.override_hours!==null?' <span class="att-man-tag">✎ يدوي</span>':''):'—'}</td><td>${r?attDiff(r)||'—':'—'}</td><td class="att-note">${esc(r?.note||'')}</td></tr>`};
  const quick=!ed?'':tr?`<span class="note">النهاردة:</span>${attBadge(tr)}<button id="attToday">تعديل النهاردة</button>`:`<span class="note">النهاردة:</span>${Object.entries(ATT_ST).filter(([k])=>k!=='half').map(([k,[l]])=>`<button class="${k==='present'?'pri':''}" data-quick="${k}">${l}</button>`).join('')}`;
  v.innerHTML=`${empSubnav('attendance')}
  <div class="att-head"><div class="bar"><select id="attEmp" aria-label="الموظف">${attEmpOpts()}</select><span class="note">الوردية ${A.shift.start} · ${hrs(A.shift.hours)} ساعات</span>${can('admin')?'<button class="ghost" id="attShift">تعديل</button>':''}</div><div class="bar">${quick}</div></div>
  ${locked()?'<div class="note">الشهر مقفول. افتحه من الأدمن عشان تعدل.</div>':''}
  <div class="summary att-sum"><div class="stat"><b>${hrs(count('present')+count('late'))}</b><span>حضور</span></div><div class="stat"><b>${hrs(count('late'))}</b><span>تأخير</span></div><div class="stat"><b>${hrs(count('absent'))}</b><span>غياب</span></div><div class="stat"><b>${hrs(count('leave'))}</b><span>إجازة</span></div><div class="stat"><b>${hrs(count('half'))}</b><span>نص يوم</span></div><div class="stat"><b>${hrs(total)}</b><span>إجمالي الساعات</span></div><div class="stat"><b class="att-over">${hrs(over)}</b><span>أوفر تايم</span></div><div class="stat"><b class="att-short">${hrs(short)}</b><span>نقص ساعات</span></div></div>
  <div class="att-tools"><div class="att-seg" role="group" aria-label="طريقة العرض"><button id="attCal" ${A.view==='cal'?'aria-pressed="true"':''}>تقويم</button><button id="attList" ${A.view==='list'?'aria-pressed="true"':''}>جدول</button></div>${ed&&A.view==='cal'?`<button id="attBulk" ${A.selecting?'aria-pressed="true"':''}>${A.selecting?'إلغاء التحديد':'تحديد أيام'}</button>`:''}</div>
  ${A.selecting&&ed?`<div class="att-bulk panel"><b>${hrs(A.sel.size)} يوم</b><button id="attEmpty">كل أيام الشغل الفاضية</button><select id="attBulkSt" aria-label="الحالة">${Object.entries(ATT_ST).map(([k,[l]])=>`<option value="${k}">${l}</option>`).join('')}</select><button class="pri" id="attApply" ${A.sel.size?'':'disabled'}>تطبيق</button><span class="note">الأيام المسجلة هتتستبدل لو حددتها.</span></div>`:''}
  ${A.view==='cal'?`<div class="att-cal"><div class="att-dow">${['سبت','أحد','إتنين','تلات','أربع','خميس','جمعة'].map(x=>`<span>${x}</span>`).join('')}</div><div class="att-grid">${'<span></span>'.repeat(lead)}${days.map(cell).join('')}</div></div>`:`<div class="tblw"><table><thead><tr><th>اليوم</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>ساعات</th><th>فرق</th><th>ملاحظة</th></tr></thead><tbody>${days.map(row).join('')}</tbody></table></div>`}`;
  bindSubnav(v);
  $('#attEmp').onchange=ev=>{S.cur=+ev.target.value;renderAttendance()};
  $('#attCal').onclick=()=>{A.view='cal';paintAtt(emp)};
  $('#attList').onclick=()=>{A.view='list';A.selecting=false;A.sel.clear();paintAtt(emp)};
  const sh=$('#attShift');if(sh)sh.onclick=openShift;
  const tb=$('#attToday');if(tb)tb.onclick=()=>openAtt(today);
  v.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>attQuick(b.dataset.quick,today));
  if(ed)v.querySelectorAll('[data-day]').forEach(el=>el.onclick=()=>{const d=el.dataset.day;if(A.selecting){A.sel.has(d)?A.sel.delete(d):A.sel.add(d);paintAtt(emp)}else openAtt(d)});
  const bk=$('#attBulk');if(bk)bk.onclick=()=>{A.selecting=!A.selecting;A.sel.clear();paintAtt(emp)};
  const em=$('#attEmpty');if(em)em.onclick=()=>{days.filter(d=>d.dow!==5&&d.ds<=today&&!A.rows[d.ds]).forEach(d=>A.sel.add(d.ds));paintAtt(emp)};
  const ap=$('#attApply');if(ap)ap.onclick=async()=>{const status=$('#attBulkSt').value;const r=await call('POST','/attendance',{emp_id:S.cur,dates:[...A.sel],status,...attTimes(status)}).catch(()=>null);if(r){A.sel.clear();A.selecting=false;toast(`اتسجل ${hrs(r.saved)} يوم`);renderAttendance()}};
}
async function attQuick(status,date){
  const t=attTimes(status);if(status==='late'){const n=new Date();t.check_in=p2(n.getHours())+':'+p2(n.getMinutes());t.check_out=null}
  await call('POST','/attendance',{emp_id:S.cur,dates:[date],status,...t}).then(()=>{toast('اتسجل');renderAttendance()}).catch(()=>{});
}

function openAtt(date){
  A.date=date;const r=A.rows[date];const st=r?.status||'present';const t=r?r:attTimes(st);
  $('#adTitle').textContent=attLabel(date);$('#adStatus').value=st;$('#adIn').value=t.check_in||'';$('#adOut').value=t.check_out||'';
  $('#adOv').checked=r?.override_hours!==null&&r?.override_hours!==undefined;$('#adHours').value=$('#adOv').checked?r.override_hours:'';$('#adNote').value=r?.note||'';$('#adClear').hidden=!r;
  attDlgSync();$('#attDlg').showModal();
}
function attDlgSync(){
  const off=['absent','leave'].includes($('#adStatus').value);$('#adTimes').hidden=off;
  const ov=$('#adOv').checked;$('#adHours').hidden=!ov;
  const auto=span($('#adIn').value,$('#adOut').value);$('#adAuto').textContent=auto===null?'سجل الحضور والانصراف عشان تتحسب الساعات.':`محسوبة تلقائي: ${hrs(auto)} ساعة`;
}
$('#adStatus').onchange=()=>{const s=$('#adStatus').value;const t=attTimes(s);if(s!=='absent'&&s!=='leave'&&!$('#adIn').value){$('#adIn').value=t.check_in;$('#adOut').value=t.check_out}attDlgSync()};
$('#adIn').oninput=()=>{const i=$('#adIn').value,s=$('#adStatus');if(i&&['present','late'].includes(s.value))s.value=mins(i)>mins(A.shift.start)+ATT_GRACE?'late':'present';attDlgSync()};
$('#adOut').oninput=attDlgSync;
$('#adOv').onchange=()=>{attDlgSync();if($('#adOv').checked)$('#adHours').focus()};
$('#adCancel').onclick=()=>$('#attDlg').close(); 
$('#adClear').onclick=async()=>{clearTimeout(attTimer);await call('DELETE',`/attendance/${S.cur}/${A.date}`).then(()=>{$('#attDlg').close();toast('اتمسح');renderAttendance()}).catch(()=>{})};
$('#attForm').onsubmit=async ev=>{ev.preventDefault();clearTimeout(attTimer);
  if($('#adOv').checked&&$('#adHours').value===''){toast('اكتب عدد الساعات');return}
  await call('POST','/attendance',{emp_id:S.cur,dates:[A.date],status:$('#adStatus').value,check_in:$('#adIn').value,check_out:$('#adOut').value,override_hours:$('#adOv').checked?$('#adHours').value:null,note:$('#adNote').value}).then(()=>{$('#attDlg').close();toast('اتحفظ');renderAttendance()}).catch(()=>{});
};
function openShift(){$('#sdStart').value=A.shift.start;$('#sdHours').value=A.shift.hours;$('#shiftDlg').showModal()}
$('#sdCancel').onclick=()=>$('#shiftDlg').close();
$('#shiftForm').onsubmit=async ev=>{ev.preventDefault();await call('POST','/attendance/shift',{start:$('#sdStart').value,hours:$('#sdHours').value}).then(()=>{$('#shiftDlg').close();toast('اتحفظ');renderAttendance()}).catch(()=>{})};
function attRoute(){const m=location.hash.match(/^#\/employees\/(\d+)\/attendance$/);if(m&&S.me){S.cur=+m[1];if(S.view!=='attendance')show('attendance')}}
window.addEventListener('hashchange',attRoute);
const renderProfileCore=renderProfile;
renderProfile=function(){renderProfileCore();const v=$('#v-profile');if(S.emps[S.cur]&&!v.querySelector('.att-crumbs')){v.insertAdjacentHTML('afterbegin',empSubnav('profile'));bindSubnav(v)}};

// ---------- team arrival box (saves on every change) ----------
const ARR={rows:{},seq:0,day:''};
const arrStatus=t=>mins(t)>mins(A.shift.start)+ATT_GRACE?'late':'present';
async function paintArrivals(){
  const cells=[...document.querySelectorAll('#v-team .arr')];if(!cells.length)return;
  const day=toDs(new Date());const q=++ARR.seq;
  const [rows,sh]=await Promise.all([call('GET','/attendance/day?date='+day),call('GET',`/attendance?emp=${cells[0].dataset.emp}&month=${day.slice(0,7)}`)]).catch(()=>[null,null]);
  if(!rows||q!==ARR.seq)return;
  A.shift=sh.shift;ARR.day=day;ARR.rows=Object.fromEntries(rows.map(r=>[r.emp_id,r]));
  const ed=can('editor')&&!S.months[day.slice(0,7)]?.locked;
  document.querySelectorAll('#v-team .arr').forEach(td=>{
    td.onclick=ev=>ev.stopPropagation();
    const emp=+td.dataset.emp,r=ARR.rows[emp],on=r&&['present','late','half'].includes(r.status);
    td.innerHTML=`<div class="arr-w"><input type="checkbox" class="arr-c" aria-label="وصل النهاردة" ${on?'checked':''} ${ed?'':'disabled'}><input type="time" class="arr-t" aria-label="وقت الوصول" value="${r?.check_in||''}" ${ed&&on?'':'hidden'}>${r?attBadge(r):''}${!ed&&on&&r.check_in?`<span class="note">${r.check_in}</span>`:''}</div>`;
    if(!ed)return;
    td.querySelector('.arr-c').onchange=ev=>arrToggle(emp,ev.target.checked);
    td.querySelector('.arr-t').onchange=ev=>{if(ev.target.value)arrSave(emp,ev.target.value)};
  });
}
function arrSave(emp,time){
  const r=ARR.rows[emp];const keep=r&&['present','late','half'].includes(r.status);
  return call('POST','/attendance',{emp_id:emp,dates:[ARR.day],status:keep&&r.status==='half'?'half':arrStatus(time),check_in:time,check_out:keep?r.check_out:null,override_hours:keep?r.override_hours:null,note:r?.note||''}).then(()=>toast('اتسجل '+time)).catch(()=>{}).finally(paintArrivals);
}
function arrToggle(emp,on){
  if(on){const n=new Date();return arrSave(emp,p2(n.getHours())+':'+p2(n.getMinutes()))}
  const r=ARR.rows[emp];
  if(r&&(r.check_out||r.override_hours!==null||r.note)&&!confirm('اليوم ده فيه انصراف أو ملاحظة. تمسحه؟')){paintArrivals();return}
  return call('DELETE',`/attendance/${emp}/${ARR.day}`).then(()=>toast('اتشال')).catch(()=>{}).finally(paintArrivals);
}
// day popup: save each change without closing
let attTimer=0;
const attPayload=()=>({emp_id:S.cur,dates:[A.date],status:$('#adStatus').value,check_in:$('#adIn').value,check_out:$('#adOut').value,override_hours:$('#adOv').checked?$('#adHours').value:null,note:$('#adNote').value});
$('#attForm').addEventListener('change',()=>{clearTimeout(attTimer);if($('#adOv').checked&&$('#adHours').value==='')return;
  attTimer=setTimeout(()=>call('POST','/attendance',attPayload()).then(()=>{$('#adClear').hidden=false;toast('اتحفظ تلقائي');renderAttendance()}).catch(()=>{}),300)});

function showLogin(){$('#app').hidden=true;$('#login').hidden=false;$('#lu').focus()}
$('#loginForm').onsubmit=async ev=>{ev.preventDefault();$('#lerr').textContent='';
  const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('#lu').value.trim(),password:$('#lp').value})});
  if(!r.ok){$('#lerr').textContent=(await r.json().catch(()=>({}))).error||'حصل خطأ';return}
  $('#lp').value='';start()};
$('#logout').onclick=async()=>{await call('POST','/logout');showLogin()};
async function start(){
  try{S.me=await call('GET','/me')}catch{return}
  $('#login').hidden=true;$('#app').hidden=false;
  $('#whoName').textContent=S.me.name+' · '+{admin:'أدمن',editor:'محرر',viewer:'مشاهد'}[S.me.role];
  await load();
  attRoute();
}
start();
setInterval(()=>{if(!$('#app').hidden&&!document.activeElement?.closest('input,textarea,select'))load().catch(()=>{})},60000);
</script>
</body></html>
~~~~

## `apps/payroll/server.js`

~~~~js
// Titan Payroll — employee KPI & salary tracker with logins, roles and an audit log.
// No npm dependencies: Node 22+ built-ins only (http, crypto, node:sqlite).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.PAYROLL_DATA || '/var/lib/titan-payroll';
const PORT = +process.env.PORT || 3100;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'payroll.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pass TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('admin','editor','viewer')), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT, phone TEXT, start TEXT, base REAL DEFAULT 0, fixed_pct REAL DEFAULT 70, notes TEXT, archived INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS records(month TEXT NOT NULL, emp_id INTEGER NOT NULL, absence REAL DEFAULT 0, late REAL DEFAULT 0, minor REAL DEFAULT 0, major REAL DEFAULT 0, quality REAL DEFAULT 0, meetings REAL DEFAULT 0, delivery REAL DEFAULT 0, notes TEXT, PRIMARY KEY(month, emp_id));
CREATE TABLE IF NOT EXISTS points(id INTEGER PRIMARY KEY, month TEXT NOT NULL, emp_id INTEGER NOT NULL, points REAL NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL, by_user INTEGER);
CREATE TABLE IF NOT EXISTS months(month TEXT PRIMARY KEY, bonus_budget REAL DEFAULT 0, locked INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), work_days REAL DEFAULT 26, absence REAL DEFAULT 1, late REAL DEFAULT 0.25, minor REAL DEFAULT 0.5, major REAL DEFAULT 1);
INSERT OR IGNORE INTO settings(id) VALUES(1);
CREATE TABLE IF NOT EXISTS attendance(emp_id INTEGER NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('present','absent','late','leave','half')), check_in TEXT, check_out TEXT, override_hours REAL, note TEXT, by_user INTEGER, at INTEGER NOT NULL, PRIMARY KEY(emp_id,date));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, user_id INTEGER, user_name TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, label TEXT, before TEXT, after TEXT);
`);

const settingCols = db.prepare('PRAGMA table_info(settings)').all().map(c => c.name);
if (!settingCols.includes('shift_start')) db.exec("ALTER TABLE settings ADD COLUMN shift_start TEXT DEFAULT '09:00'");
if (!settingCols.includes('shift_hours')) db.exec('ALTER TABLE settings ADD COLUMN shift_hours REAL DEFAULT 8');

// ---------- passwords & sessions ----------
function hashPass(p) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(p, salt, 64); return salt.toString('hex') + ':' + h.toString('hex'); }
function checkPass(p, stored) { const [s, h] = stored.split(':'); const c = crypto.scryptSync(p, Buffer.from(s, 'hex'), 64); return crypto.timingSafeEqual(c, Buffer.from(h, 'hex')); }
const SESSION_MS = 12 * 3600e3;

// ---------- CLI: node server.js set-user <username> <role> "<name>" [password] ----------
if (process.argv[2] === 'set-user') {
  const [, , , username, role = 'admin', name = username, pw] = process.argv;
  const password = pw || crypto.randomBytes(6).toString('base64url');
  db.prepare(`INSERT INTO users(username,name,pass,role) VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET pass=excluded.pass, role=excluded.role, name=excluded.name, active=1`).run(username, name, hashPass(password), role);
  console.log(`User: ${username}\nPassword: ${password}\nRole: ${role}`);
  process.exit(0);
}
if (process.argv[2] === 'backup') {
  const dir = process.argv[3] || '/var/backups/titan-payroll'; fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, new Date().toISOString().slice(0, 10) + '.db'); if (fs.existsSync(f)) fs.unlinkSync(f);
  db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(dir).filter(x => x.endsWith('.db')).sort(); while (files.length > 30) fs.unlinkSync(path.join(dir, files.shift()));
  console.log('Backup:', f); process.exit(0);
}

// ---------- helpers ----------
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };
const MONTH_RE = /^\d{4}-\d{2}$/;
const num = (v, min = 0, max = 1e9) => { const n = +v; return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0; };
const str = (v, n = 500) => String(v ?? '').slice(0, n);
function send(res, code, body, headers = {}) {
  const isStr = typeof body === 'string';
  res.writeHead(code, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(isStr ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, bad) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) { bad(new Error('too large')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { bad(new Error('bad json')); } }); });
}
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0])); }
function currentUser(req) {
  const t = cookies(req).tp_session; if (!t) return null;
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(t, Date.now());
  return row || null;
}
function audit(user, action, entity, label, before, after) {
  db.prepare('INSERT INTO audit(at,user_id,user_name,action,entity,label,before,after) VALUES(?,?,?,?,?,?,?,?)')
    .run(Date.now(), user.id, user.name, action, entity, label || '', before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}
function diff(before, after) { // keep only changed fields
  if (!before) return [null, after]; const b = {}, a = {};
  for (const k of Object.keys(after)) if (String(before[k] ?? '') !== String(after[k] ?? '')) { b[k] = before[k]; a[k] = after[k]; }
  return Object.keys(a).length ? [b, a] : [null, null];
}
const isLocked = m => !!db.prepare('SELECT locked FROM months WHERE month=?').get(m)?.locked;
const ATT_STATUS = ['present', 'absent', 'late', 'leave', 'half'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const getShift = () => { const r = db.prepare('SELECT shift_start,shift_hours FROM settings WHERE id=1').get(); return { start: r.shift_start, hours: r.shift_hours }; };
const round2 = n => Math.round(n * 100) / 100;
function attRow(r, shift) { // adds worked hours (override wins) and the difference from the expected shift
  let auto = null;
  if (r.check_in && r.check_out) {
    const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
    let m = toMin(r.check_out) - toMin(r.check_in); if (m < 0) m += 1440; // overnight shift
    auto = round2(m / 60);
  }
  const hours = r.override_hours ?? auto;
  const expected = r.status === 'half' ? shift.hours / 2 : (r.status === 'present' || r.status === 'late') ? shift.hours : 0;
  const diff = hours === null || !expected ? null : round2(hours - expected);
  return { ...r, auto_hours: auto, hours, expected, diff };
}
const empName = id => db.prepare('SELECT name FROM employees WHERE id=?').get(id)?.name || '#' + id;

// ---------- login rate limit ----------
const fails = new Map();
function tooMany(ip) { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.t < 15 * 60e3; }
function noteFail(ip) { const f = fails.get(ip) || { n: 0, t: Date.now() }; if (Date.now() - f.t > 15 * 60e3) { f.n = 0; f.t = Date.now(); } f.n++; fails.set(ip, f); }

// ---------- API ----------
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, ''); const M = req.method;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  if (p === '/login' && M === 'POST') {
    if (tooMany(ip)) return send(res, 429, { error: 'محاولات كتير غلط. استنى ربع ساعة وجرّب تاني.' });
    const b = await readBody(req); const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(str(b.username, 60).trim().toLowerCase());
    if (!u || !checkPass(str(b.password, 200), u.pass)) { noteFail(ip); return send(res, 401, { error: 'اسم المستخدم أو الباسورد غلط.' }); }
    fails.delete(ip); const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, u.id, Date.now() + SESSION_MS);
    audit(u, 'login', 'session', '');
    return send(res, 200, { ok: true }, { 'Set-Cookie': `tp_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
  }
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (M !== 'GET' && req.headers['x-requested-with'] !== 'payroll') return send(res, 403, { error: 'forbidden' }); // CSRF guard
  const need = r => { if (ROLE_RANK[user.role] < ROLE_RANK[r]) { send(res, 403, { error: 'مش عندك صلاحية للتعديل ده.' }); return false; } return true; };

  if (p === '/logout' && M === 'POST') { db.prepare('DELETE FROM sessions WHERE token=?').run(cookies(req).tp_session); return send(res, 200, { ok: true }, { 'Set-Cookie': 'tp_session=; Path=/; Max-Age=0' }); }
  if (p === '/me') return send(res, 200, { id: user.id, name: user.name, username: user.username, role: user.role });
  if (p === '/password' && M === 'POST') {
    const b = await readBody(req); if (!checkPass(str(b.current, 200), user.pass)) return send(res, 400, { error: 'الباسورد الحالي غلط.' });
    if (str(b.next, 200).length < 8) return send(res, 400, { error: 'الباسورد الجديد لازم يكون ٨ حروف على الأقل.' });
    db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(b.next), user.id); audit(user, 'update', 'password', user.name); return send(res, 200, { ok: true });
  }

  if (p === '/data' && M === 'GET') {
    return send(res, 200, {
      employees: db.prepare('SELECT * FROM employees').all(),
      records: db.prepare('SELECT * FROM records').all(),
      points: db.prepare('SELECT p.*, u.name AS by_name FROM points p LEFT JOIN users u ON u.id=p.by_user').all(),
      months: db.prepare('SELECT * FROM months').all(),
      settings: db.prepare('SELECT * FROM settings WHERE id=1').get(),
    });
  }

  if (p === '/employees' && M === 'POST') {
    if (!need('editor')) return; const b = await readBody(req);
    const d = { name: str(b.name, 100).trim(), role: str(b.role, 100), phone: str(b.phone, 40), start: str(b.start, 10), base: num(b.base), fixed_pct: num(b.fixed_pct, 0, 100), notes: str(b.notes, 2000) };
    if (!d.name) return send(res, 400, { error: 'اكتب اسم الموظف.' });
    if (b.id) {
      const before = db.prepare('SELECT * FROM employees WHERE id=?').get(+b.id); if (!before) return send(res, 404, { error: 'not found' });
      if ((d.base !== before.base || d.fixed_pct !== before.fixed_pct) && !need('admin')) return;
      db.prepare('UPDATE employees SET name=?,role=?,phone=?,start=?,base=?,fixed_pct=?,notes=? WHERE id=?').run(d.name, d.role, d.phone, d.start, d.base, d.fixed_pct, d.notes, +b.id);
      const [bf, af] = diff(before, d); if (af) audit(user, 'update', 'employee', d.name, bf, af); return send(res, 200, { id: +b.id });
    }
    if (!need('admin')) return;
    const r = db.prepare('INSERT INTO employees(name,role,phone,start,base,fixed_pct,notes) VALUES(?,?,?,?,?,?,?)').run(d.name, d.role, d.phone, d.start, d.base, d.fixed_pct, d.notes);
    audit(user, 'create', 'employee', d.name, null, d); return send(res, 200, { id: Number(r.lastInsertRowid) });
  }
  const arch = p.match(/^\/employees\/(\d+)\/archive$/);
  if (arch && M === 'POST') { if (!need('admin')) return; db.prepare('UPDATE employees SET archived=1 WHERE id=?').run(+arch[1]); audit(user, 'archive', 'employee', empName(+arch[1])); return send(res, 200, { ok: true }); }

  if (p === '/records' && M === 'POST') {
    if (!need('editor')) return; const b = await readBody(req); const m = str(b.month, 7); const emp = +b.emp_id;
    if (!MONTH_RE.test(m) || !emp) return send(res, 400, { error: 'bad input' });
    if (isLocked(m)) return send(res, 409, { error: 'الشهر ده مقفول. افتحه الأول من الأدمن.' });
    const d = { absence: num(b.absence), late: num(b.late), minor: num(b.minor), major: num(b.major), quality: num(b.quality, 0, 100), meetings: num(b.meetings, 0, 100), delivery: num(b.delivery, 0, 100), notes: str(b.notes, 2000) };
    const before = db.prepare('SELECT * FROM records WHERE month=? AND emp_id=?').get(m, emp);
    db.prepare(`INSERT INTO records(month,emp_id,absence,late,minor,major,quality,meetings,delivery,notes) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(month,emp_id) DO UPDATE SET absence=excluded.absence,late=excluded.late,minor=excluded.minor,major=excluded.major,quality=excluded.quality,meetings=excluded.meetings,delivery=excluded.delivery,notes=excluded.notes`)
      .run(m, emp, d.absence, d.late, d.minor, d.major, d.quality, d.meetings, d.delivery, d.notes);
    const [bf, af] = diff(before, d); if (af) audit(user, before ? 'update' : 'create', 'record', `${empName(emp)} · ${m}`, bf, af);
    return send(res, 200, { ok: true });
  }

  if (p === '/points' && M === 'POST') {
    if (!need('editor')) return; const b = await readBody(req); const m = str(b.month, 7);
    if (!MONTH_RE.test(m)) return send(res, 400, { error: 'bad month' });
    if (isLocked(m)) return send(res, 409, { error: 'الشهر ده مقفول.' });
    const d = { emp_id: +b.emp_id, points: num(b.points, 0.5, 1000), reason: str(b.reason, 300).trim() };
    if (!d.reason || !d.emp_id) return send(res, 400, { error: 'اكتب السبب وعدد النقاط.' });
    db.prepare('INSERT INTO points(month,emp_id,points,reason,at,by_user) VALUES(?,?,?,?,?,?)').run(m, d.emp_id, d.points, d.reason, Date.now(), user.id);
    audit(user, 'create', 'points', `${empName(d.emp_id)} · ${m}`, null, { points: d.points, reason: d.reason }); return send(res, 200, { ok: true });
  }
  const delPt = p.match(/^\/points\/(\d+)$/);
  if (delPt && M === 'DELETE') {
    if (!need('editor')) return; const before = db.prepare('SELECT * FROM points WHERE id=?').get(+delPt[1]); if (!before) return send(res, 404, { error: 'not found' });
    if (isLocked(before.month)) return send(res, 409, { error: 'الشهر ده مقفول.' });
    db.prepare('DELETE FROM points WHERE id=?').run(+delPt[1]); audit(user, 'delete', 'points', `${empName(before.emp_id)} · ${before.month}`, { points: before.points, reason: before.reason }, null); return send(res, 200, { ok: true });
  }

  if (p === '/months' && M === 'POST') {
    if (!need('admin')) return; const b = await readBody(req); const m = str(b.month, 7); if (!MONTH_RE.test(m)) return send(res, 400, { error: 'bad month' });
    const before = db.prepare('SELECT * FROM months WHERE month=?').get(m) || { bonus_budget: 0, locked: 0 };
    const d = { bonus_budget: b.bonus_budget !== undefined ? num(b.bonus_budget) : before.bonus_budget, locked: b.locked !== undefined ? (b.locked ? 1 : 0) : before.locked };
    if (before.locked && d.locked && d.bonus_budget !== before.bonus_budget) return send(res, 409, { error: 'الشهر ده مقفول.' });
    db.prepare('INSERT INTO months(month,bonus_budget,locked) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET bonus_budget=excluded.bonus_budget, locked=excluded.locked').run(m, d.bonus_budget, d.locked);
    const [bf, af] = diff(before, d); if (af) audit(user, 'update', 'month', m, bf, af); return send(res, 200, { ok: true });
  }

  if (p === '/settings' && M === 'POST') {
    if (!need('admin')) return; const b = await readBody(req); const before = db.prepare('SELECT * FROM settings WHERE id=1').get();
    const d = { work_days: num(b.work_days, 1, 31), absence: num(b.absence, 0, 10), late: num(b.late, 0, 10), minor: num(b.minor, 0, 10), major: num(b.major, 0, 10) };
    db.prepare('UPDATE settings SET work_days=?,absence=?,late=?,minor=?,major=? WHERE id=1').run(d.work_days, d.absence, d.late, d.minor, d.major);
    const [bf, af] = diff(before, d); if (af) audit(user, 'update', 'settings', 'قواعد الخصم', bf, af); return send(res, 200, { ok: true });
  }

  // ---------- attendance ----------
  if (p === '/attendance' && M === 'GET') {
    const emp = +url.searchParams.get('emp'), m = url.searchParams.get('month') || '';
    if (!emp || !MONTH_RE.test(m)) return send(res, 400, { error: 'بيانات غلط.' });
    const shift = getShift();
    return send(res, 200, { shift, rows: db.prepare('SELECT * FROM attendance WHERE emp_id=? AND substr(date,1,7)=? ORDER BY date').all(emp, m).map(r => attRow(r, shift)) });
  }
  if (p === '/attendance' && M === 'POST') {
    if (!need('editor')) return; const b = await readBody(req);
    const emp = +b.emp_id; const dates = Array.isArray(b.dates) ? [...new Set(b.dates)] : [];
    if (!db.prepare('SELECT 1 FROM employees WHERE id=? AND archived=0').get(emp)) return send(res, 404, { error: 'الموظف مش موجود.' });
    if (!ATT_STATUS.includes(b.status)) return send(res, 400, { error: 'الحالة غلط.' });
    if (!dates.length || dates.length > 62 || !dates.every(validDate)) return send(res, 400, { error: 'التاريخ غلط.' });
    for (const m of new Set(dates.map(d => d.slice(0, 7)))) if (isLocked(m)) return send(res, 409, { error: `شهر ${m} مقفول.` });
    const off = b.status === 'absent' || b.status === 'leave';
    const check_in = off || !b.check_in ? null : str(b.check_in, 5), check_out = off || !b.check_out ? null : str(b.check_out, 5);
    if ((check_in && !TIME_RE.test(check_in)) || (check_out && !TIME_RE.test(check_out))) return send(res, 400, { error: 'الوقت غلط.' });
    const hasOverride = !off && b.override_hours !== null && b.override_hours !== undefined && b.override_hours !== '';
    const d = { status: b.status, check_in, check_out, override_hours: hasOverride ? num(b.override_hours, 0, 24) : null, note: str(b.note, 500) };
    const name = empName(emp); let saved = 0;
    db.exec('BEGIN');
    try {
      for (const date of dates) {
        const before = db.prepare('SELECT status,check_in,check_out,override_hours,note FROM attendance WHERE emp_id=? AND date=?').get(emp, date);
        if (before && b.only_empty) continue;
        db.prepare('INSERT INTO attendance(emp_id,date,status,check_in,check_out,override_hours,note,by_user,at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(emp_id,date) DO UPDATE SET status=excluded.status,check_in=excluded.check_in,check_out=excluded.check_out,override_hours=excluded.override_hours,note=excluded.note,by_user=excluded.by_user,at=excluded.at')
          .run(emp, date, d.status, d.check_in, d.check_out, d.override_hours, d.note, user.id, Date.now());
        const [bf, af] = diff(before, d); if (af) audit(user, before ? 'update' : 'create', 'attendance', `${name} · ${date}`, bf, af);
        saved++;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return send(res, 200, { ok: true, saved });
  }
  if (p === '/attendance/day' && M === 'GET') {
    const date = url.searchParams.get('date'); if (!validDate(date)) return send(res, 400, { error: 'التاريخ غلط.' });
    return send(res, 200, db.prepare('SELECT * FROM attendance WHERE date=?').all(date));
  }
  if (p === '/attendance/shift' && M === 'POST') {
    if (!need('admin')) return; const b = await readBody(req); const before = getShift();
    if (!TIME_RE.test(str(b.start, 5))) return send(res, 400, { error: 'الوقت غلط.' });
    const d = { start: str(b.start, 5), hours: num(b.hours, 1, 24) };
    db.prepare('UPDATE settings SET shift_start=?,shift_hours=? WHERE id=1').run(d.start, d.hours);
    const [bf, af] = diff(before, d); if (af) audit(user, 'update', 'settings', 'الوردية', bf, af); return send(res, 200, { ok: true });
  }
  const delAtt = p.match(/^\/attendance\/(\d+)\/(\d{4}-\d{2}-\d{2})$/);
  if (delAtt && M === 'DELETE') {
    if (!need('editor')) return; const emp = +delAtt[1], date = delAtt[2];
    if (isLocked(date.slice(0, 7))) return send(res, 409, { error: 'الشهر ده مقفول.' });
    const before = db.prepare('SELECT status,check_in,check_out,override_hours,note FROM attendance WHERE emp_id=? AND date=?').get(emp, date);
    if (!before) return send(res, 404, { error: 'not found' });
    db.prepare('DELETE FROM attendance WHERE emp_id=? AND date=?').run(emp, date);
    audit(user, 'delete', 'attendance', `${empName(emp)} · ${date}`, before, null); return send(res, 200, { ok: true });
  }

  if (p === '/audit' && M === 'GET') {
    const lim = Math.min(500, +url.searchParams.get('limit') || 200);
    return send(res, 200, db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(lim));
  }

  if (p === '/users' && M === 'GET') { if (!need('admin')) return; return send(res, 200, db.prepare('SELECT id,username,name,role,active FROM users ORDER BY id').all()); }
  if (p === '/users' && M === 'POST') {
    if (!need('admin')) return; const b = await readBody(req);
    const d = { username: str(b.username, 60).trim().toLowerCase(), name: str(b.name, 100).trim(), role: ['admin', 'editor', 'viewer'].includes(b.role) ? b.role : 'viewer', active: b.active === false ? 0 : 1 };
    if (b.id) {
      const before = db.prepare('SELECT id,username,name,role,active FROM users WHERE id=?').get(+b.id); if (!before) return send(res, 404, { error: 'not found' });
      if (before.id === user.id && (d.role !== 'admin' || !d.active)) return send(res, 400, { error: 'مينفعش تشيل صلاحية الأدمن من نفسك.' });
      db.prepare('UPDATE users SET name=?,role=?,active=? WHERE id=?').run(d.name || before.name, d.role, d.active, before.id);
      if (!d.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(before.id);
      let pw = null; if (b.reset) { pw = crypto.randomBytes(6).toString('base64url'); db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(pw), before.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(before.id); }
      const [bf, af] = diff(before, { name: d.name || before.name, role: d.role, active: d.active }); audit(user, 'update', 'user', before.username, bf, b.reset ? { ...(af || {}), password: 'reset' } : af);
      return send(res, 200, { ok: true, password: pw });
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(d.username) || !d.name) return send(res, 400, { error: 'اسم المستخدم: حروف إنجليزي وأرقام بس (٣ حروف على الأقل)، واكتب الاسم.' });
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(d.username)) return send(res, 400, { error: 'اسم المستخدم ده موجود.' });
    const pw = crypto.randomBytes(6).toString('base64url');
    db.prepare('INSERT INTO users(username,name,pass,role) VALUES(?,?,?,?)').run(d.username, d.name, hashPass(pw), d.role);
    audit(user, 'create', 'user', d.username, null, { name: d.name, role: d.role }); return send(res, 200, { ok: true, password: pw });
  }

  send(res, 404, { error: 'not found' });
}

const INDEX = path.join(__dirname, 'public', 'index.html');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
      return fs.createReadStream(INDEX).pipe(res);
    }
    send(res, 404, 'Not found');
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'حصل خطأ في السيرفر.' }); }
}).listen(PORT, '127.0.0.1', () => console.log('Titan Payroll on 127.0.0.1:' + PORT));
~~~~

## `assets/account.js`

~~~~js
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
          '<img src="assets/tree-navy.webp" alt="" width="30" height="34">' +
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
        '<img src="assets/tree-navy.webp" alt="Sequoia" width="38" height="44" style="margin-top:4px">' +
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
~~~~

## `assets/captain-card.js`

~~~~js
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
~~~~

## `assets/captain.js`

~~~~js
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
          (hasBill && REVIEW_URL ? '<button class="press rvbtn" type="button" data-review="' + esc(t) + '">⭐ ابعت لينك التقييم</button>' : '') +
        '</div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="empty"><img src="assets/mascot-cassette-v3.webp" alt=""><b>مفيش ترابيزات مستنية دلوقتي</b><span>أول ما ترابيزة تنادي أو تطلب الحساب هتظهر هنا</span></div>';
    }
    if (taken.length) {
      html += '<section class="done"><h3>اتعمل من شوية</h3><div class="dlist">' + taken.map(function (d, i) {
        return '<div class="ditem"><span>ترابيزة</span><span class="num">' + esc(d.table) + '</span><small>' + esc(d.items.map(what).join(' + ')) + ' · ' + clock(d.at) + '</small>' +
          (REVIEW_URL && d.items.some(function (c) { return c.kind === 'bill'; }) ? '<button class="press rvbtn" type="button" data-review="' + esc(d.table) + '">⭐ لينك التقييم</button>' : '') +
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

  // ---- Google review link: WhatsApp (wa.me) when the guest has a Sequoia Card number, else a QR ----
  // Sent to every guest the same way: no rating first, no reward for reviewing (Google policy).
  var REVIEW_URL = (window.SEQUOIA_CONFIG || {}).GOOGLE_REVIEW_URL || '';
  var REVIEW_MSG = 'شكرًا إنك نورت سيكويا 🌿 لو قعدتك عجبتك، تقييمك على جوجل بيفرق معانا جدًا: ' + REVIEW_URL;
  var rvx = null;
  function reviewQr() {
    if (typeof qrcode !== 'function') return '';
    var q = qrcode(0, 'M');
    q.addData(REVIEW_URL);
    q.make();
    return q.createSvgTag({ cellSize: 6, margin: 24, scalable: true, alt: 'QR تقييم سيكويا على جوجل' });
  }
  function closeReviewSend() { if (rvx) { rvx.remove(); rvx = null; } }
  function paintReviewSend(t, contacts, qrFirst) {
    closeReviewSend();
    var html = '<b id="rvx-title">لينك التقييم · ترابيزة ' + esc(t) + '</b>';
    if (contacts.length && !qrFirst) {
      html += '<p>ابعت اللينك للعميل على واتساب:</p>' + contacts.map(function (c) {
        return '<a class="press rvx-wa" target="_blank" rel="noopener" data-rvx-sent href="https://wa.me/' + esc(c.wa) + '?text=' + encodeURIComponent(REVIEW_MSG) + '">' +
          'واتساب <span dir="ltr">' + esc(c.phone) + '</span></a>';
      }).join('') + '<button class="press rvx-alt" type="button" data-rvx-qr>اعرض QR بدل كده</button>';
    } else {
      html += '<p>' + (contacts.length ? 'خلّي العميل يصوّر الكود ده بكاميرا موبايله:' : 'مفيش رقم محفوظ للترابيزة دي. خلّي العميل يصوّر الكود ده بكاميرا موبايله:') + '</p>' +
        '<div class="rvx-qr">' + reviewQr() + '</div>';
    }
    html += '<button class="press rvx-close" type="button" data-rvx-close>قفل</button>';
    rvx = document.createElement('div');
    rvx.className = 'rvx';
    rvx.innerHTML = '<div class="rvx-box" role="dialog" aria-modal="true" aria-labelledby="rvx-title">' + html + '</div>';
    rvx.addEventListener('click', function (e) {
      if (e.target === rvx || e.target.closest('[data-rvx-close]')) closeReviewSend();
      else if (e.target.closest('[data-rvx-qr]')) paintReviewSend(t, contacts, true);
      else if (e.target.closest('[data-rvx-sent]')) setTimeout(closeReviewSend, 0);
    });
    rvx.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeReviewSend(); });
    document.body.appendChild(rvx);
    var f = rvx.querySelector('.rvx-wa, .rvx-close');
    if (f) f.focus();
  }
  function openReviewSend(t, btn) {
    if (!REVIEW_URL) return;
    btn.disabled = true;
    fetch('/api/staff/review-contacts?table=' + encodeURIComponent(t), { credentials: 'same-origin', headers: { 'X-Requested-With': 'sequoia' } })
      .then(function (r) {
        if (r.status === 401 && SequoiaOrders.onLoggedOut) { SequoiaOrders.onLoggedOut(); throw new Error('login'); }
        return r.ok ? r.json() : [];
      })
      .catch(function (err) { if (err && err.message === 'login') throw err; return []; }) // no connection: the QR still works
      .then(function (list) { paintReviewSend(t, Array.isArray(list) ? list : [], false); })
      .catch(function () {})
      .then(function () { btn.disabled = false; });
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
    var rb = e.target.closest('[data-review]');
    if (rb) { openReviewSend(rb.getAttribute('data-review'), rb); return; }
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
~~~~

## `assets/config.js`

~~~~js
/*
 * Sequoia — shared front-end settings, loaded first by the menu (index.html) and the
 * captain screen. Change values here only; every page reads them from window.SEQUOIA_CONFIG.
 */
(function () {
  'use strict';
  window.SEQUOIA_CONFIG = Object.freeze({
    // Google review link: used by the in-app review invite, the WhatsApp message and the QR code.
    GOOGLE_REVIEW_URL: 'https://g.page/r/CdlSTIN6djjmEBE/review',

    // Social links at the bottom of the cover page. An empty link hides its icon.
    INSTAGRAM_URL: 'https://www.instagram.com/sequoiacafe.eg',
    FACEBOOK_URL: 'https://www.facebook.com/share/1F9akPHx5p/',
    TIKTOK_URL: 'https://www.tiktok.com/@sequoia.cafe',
    WHATSAPP_URL: 'https://wa.me/201044401212'   // wa.me format: 20 + the number without its leading 0
  });
})();
~~~~

## `assets/landing-data.js`

~~~~js
/*
 * Sequoia cover page content: the journal and the clubs. Edit this file only; the layout reads it.
 * Text is [Arabic, English]. Leave a list empty to show the "coming soon" state.
 */
(function () {
  'use strict';
  window.SEQUOIA_LANDING = {
    // Sequoia Journal. Page images live in assets/journal/<issue folder>/ (WebP, about 1400 px wide, in reading order).
    // While `pages` is empty the card shows "the first issue is coming soon" and no read button.
    JOURNAL: {
      issue: ['العدد 01', 'Vol. 01'],
      date: ['نوفمبر 2026', 'Nov 2026'],
      title: ['حكايات من على الترابيزة', 'Stories from the table'],
      blurb: ['جرنال مطبوع زي زمان: ناس المكان، حكايات القهوة، وأخبار الشهر.', 'Printed the old way: our people, coffee stories and this month\'s news.'],
      cover: '',            // e.g. 'assets/journal/issue-01/cover.webp' (defaults to the first page)
      pages: []             // e.g. ['assets/journal/issue-01/page-01.webp', 'assets/journal/issue-01/page-02.webp']
    },

    // Sequoia Clubs. Empty = teaser only. Add one object per club, for example:
    // { name: ['نادي الكتاب', 'Book Club'], about: ['كتاب كل شهر ونتكلم فيه على قهوة.', 'One book a month, talked over coffee.'],
    //   when: ['الخميس · 8 م', 'Thu · 8 PM'], image: 'assets/clubs/book-club.webp' }
    CLUBS: []
  };
})();
~~~~

## `assets/landing.js`

~~~~js
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
          jH: 'جريدة سيكويا', jNew: 'العدد الجديد', jSoon: 'قريبًا', jSoonTitle: 'العدد الأول في الطريق', jRead: 'اقرا الجريدة',
          pages: function (n) { return n + ' صفحة'; },
          cH: 'نوادي سيكويا', cSoon: 'قريبًا', cSub: 'قريبًا… مساحة لناس بتحب نفس الحاجات تتقابل عندنا.',
          cIntro: 'نوادي بتتقابل عندنا. اختار اللي يشبهك.',
          sH: 'متنسوش تتابعونا', foot: 'سيكويا كافيه · المنصورة · من 2026',
          page: function (a, b) { return 'صفحة ' + a + ' من ' + b; }, hint: 'اسحب يمين وشمال · وسّع بصباعين للتكبير',
          close: 'قفل', prev: 'الصفحة اللي قبلها', next: 'الصفحة اللي بعدها' },
    en: { more: 'More from Sequoia',
          jH: 'Sequoia Journal', jNew: 'New issue', jSoon: 'Coming soon', jSoonTitle: 'The first issue is on its way', jRead: 'Read the journal',
          pages: function (n) { return n + ' pages'; },
          cH: 'Sequoia Clubs', cSoon: 'Soon', cSub: 'Coming soon… a place for people who love the same things to meet at Sequoia.',
          cIntro: 'Clubs that meet at Sequoia. Pick the one that fits you.',
          sH: 'Follow along', foot: 'Sequoia Café · Mansoura · Est. 2026',
          page: function (a, b) { return 'Page ' + a + ' of ' + b; }, hint: 'Swipe to turn pages · pinch to zoom',
          close: 'Close', prev: 'Previous page', next: 'Next page' }
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pick(pair, lang) { return Array.isArray(pair) ? (lang === 'ar' ? pair[0] : pair[1] || pair[0]) : (pair || ''); }
  function safeUrl(u) { return /^https:\/\//.test(u || '') ? u : ''; }

  var BOOK = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h6a2 2 0 0 1 2 2V19a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2V19a2 2 0 0 1 2-2h6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
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

  function clubs(lang, t) {
    var cards = CLUBS.filter(function (c) { return c && c.name; });
    return '<section class="lsec" aria-labelledby="l-clubs">' + head('l-clubs', t.cH, 'Clubs') +
      '<div class="clubs reveal">' +
        (cards.length ? '' : '<span class="cbadge">' + t.cSoon + '</span>') +
        '<div class="cicons" aria-hidden="true">' + CLUB_ICONS.map(function (s) { return '<span>' + s + '</span>'; }).join('') + '</div>' +
        '<p>' + (cards.length ? t.cIntro : t.cSub) + '</p>' +
        (cards.length ? '<div class="ccards noscroll">' + cards.map(function (c) {
          return '<article class="ccard"><div class="cimg">' + (c.image ? '<img src="' + esc(c.image) + '" alt="" loading="lazy" decoding="async">' : '') + '</div>' +
            '<div class="cbd"><b>' + esc(pick(c.name, lang)) + '</b>' + (c.about ? '<p>' + esc(pick(c.about, lang)) + '</p>' : '') +
            (c.when ? '<span class="cwhen">' + esc(pick(c.when, lang)) + '</span>' : '') + '</div></article>';
        }).join('') + '</div>' : '') +
      '</div></section>';
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

  // ---- journal viewer: full screen, pages right-to-left (the paper is Arabic), images load one page ahead ----
  var V = null, cur = 0, vLang = 'ar', backTo = null;
  function viewer() {
    if (V) return V;
    V = document.createElement('div');
    V.className = 'jview';
    V.hidden = true;
    V.setAttribute('role', 'dialog');
    V.setAttribute('aria-modal', 'true');
    V.setAttribute('aria-labelledby', 'jv-title');
    V.innerHTML = '<div class="jvbar"><div><b id="jv-title"></b><span id="jv-count"></span></div>' +
        '<button class="press jvx" type="button" data-jv-close><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>' +
      '<div class="jvpages noscroll" dir="rtl">' + PAGES.map(function (src, i) {
        return '<div class="jvp"><img data-src="' + esc(src) + '" alt="' + (i + 1) + '" decoding="async"></div>';
      }).join('') + '</div>' +
      '<div class="jvhint"></div>' +
      '<div class="jvnav" dir="rtl">' +
        '<button class="press" type="button" data-jv-prev><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="jvdots">' + PAGES.map(function () { return '<i></i>'; }).join('') + '</div>' +
        '<button class="press" type="button" data-jv-next><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>';
    document.body.appendChild(V);
    var pages = V.querySelector('.jvpages');
    pages.addEventListener('scroll', function () {
      var k = Math.round(Math.abs(pages.scrollLeft) / (pages.clientWidth || 1));
      if (k !== cur) show(k);
    }, { passive: true });
    V.addEventListener('click', function (e) {
      if (e.target.closest('[data-jv-close]')) closeJournal();
      else if (e.target.closest('[data-jv-prev]')) go(cur - 1);
      else if (e.target.closest('[data-jv-next]')) go(cur + 1);
    });
    V.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeJournal();
      else if (e.key === 'ArrowLeft') go(cur + 1);   // right-to-left paper: left is forward
      else if (e.key === 'ArrowRight') go(cur - 1);
    });
    return V;
  }
  function load(k) {
    var img = V && V.querySelectorAll('.jvp img')[k];
    if (img && !img.src && img.getAttribute('data-src')) img.src = img.getAttribute('data-src');
  }
  function show(k) {
    var n = PAGES.length, t = TXT[vLang];
    cur = Math.max(0, Math.min(n - 1, k));
    V.querySelector('#jv-count').textContent = t.page(cur + 1, n);
    [].forEach.call(V.querySelectorAll('.jvdots i'), function (d, j) { d.className = j === cur ? 'on' : ''; });
    V.querySelector('[data-jv-prev]').disabled = cur === 0;
    V.querySelector('[data-jv-next]').disabled = cur === n - 1;
    load(cur); load(cur + 1); load(cur - 1);
  }
  function go(k) {
    var pages = V.querySelector('.jvpages'), n = PAGES.length;
    k = Math.max(0, Math.min(n - 1, k));
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    pages.scrollTo({ left: -k * pages.clientWidth, behavior: reduce ? 'auto' : 'smooth' });   // RTL: page 2 sits to the left
  }
  function openJournal(lang, from) {
    if (!PAGES.length) return;
    vLang = lang === 'ar' ? 'ar' : 'en';
    var t = TXT[vLang];
    viewer();
    V.setAttribute('dir', vLang === 'ar' ? 'rtl' : 'ltr');
    V.classList.toggle('is-ar', vLang === 'ar');
    V.querySelector('#jv-title').textContent = t.jH;
    V.querySelector('.jvhint').textContent = t.hint;
    V.querySelector('[data-jv-close]').setAttribute('aria-label', t.close);
    V.querySelector('[data-jv-prev]').setAttribute('aria-label', t.prev);
    V.querySelector('[data-jv-next]').setAttribute('aria-label', t.next);
    backTo = from || null;
    V.hidden = false;
    V.querySelector('.jvpages').scrollLeft = 0;
    show(0);
    V.querySelector('[data-jv-close]').focus();
  }
  function closeJournal() {
    if (!V || V.hidden) return;
    V.hidden = true;
    if (backTo && document.contains(backTo)) backTo.focus();
  }

  window.SequoiaLanding = {
    // the "more below" link that sits under the cover's play button
    more: function (lang) {
      return '<button class="lmore caps" type="button" data-lmore><span>' + TXT[lang === 'ar' ? 'ar' : 'en'].more + '</span>' + DOWN + '</button>';
    },
    html: function (lang) {
      var t = TXT[lang === 'ar' ? 'ar' : 'en'];
      return '<div class="below" id="below">' + journal(lang, t) + clubs(lang, t) + social(lang, t) + '</div>';
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
      });
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
~~~~

## `assets/menu.js`

~~~~js
/* Moved out of index.html so the CSP can forbid inline scripts. */
(function () {
  'use strict';

  // ---- Menu data: edit prices / items here — [English name, price, Arabic name] ----
  var SECTIONS = [
    { title: 'Hot Drinks', ar: 'مشروبات ساخنة', groups: [{ items: [
      ['Turkish Coffee — Single', 45, 'قهوة تركي سنجل'], ['Turkish Coffee — Double', 55, 'قهوة تركي دبل'], ['Tea', 35, 'شاي'], ['Flavored Tea', 40, 'شاي بنكهات'],
      ['Cappuccino', 85, 'كابتشينو'], ['Espresso — Single', 55, 'إسبريسو سنجل'], ['Espresso — Double', 70, 'إسبريسو دبل'], ['Americano', 70, 'أمريكانو'],
      ['Macchiato — Single', 60, 'ماكياتو سنجل'], ['Macchiato — Double', 75, 'ماكياتو دبل'], ['Cortado', 85, 'كورتادو'], ['Flat White', 125, 'فلات وايت'],
      ['Hot Spanish Latte', 135, 'سبانش لاتيه سخن'], ['French Coffee', 60, 'قهوة فرنساوي'], ['Nescafé', 75, 'نسكافيه']] }] },
    { title: 'Iced Coffee', ar: 'قهوة مثلجة', groups: [{ items: [
      ['Iced Latte', 95, 'آيس لاتيه'], ['Iced Cappuccino', 115, 'آيس كابتشينو'], ['Iced Spanish Latte', 140, 'آيس سبانش لاتيه'], ['Iced Americano', 100, 'آيس أمريكانو'],
      ['Iced Mocha', 125, 'آيس موكا'], ['Iced White Mocha', 135, 'آيس وايت موكا'], ['Iced Caramel Latte', 110, 'آيس كراميل لاتيه']] }] },
    { title: 'Frappé', ar: 'فرابيه', groups: [{ items: [
      ['Vanilla Frappé', 130, 'فرابيه فانيليا'], ['Chocolate Frappé', 130, 'فرابيه شوكولاتة'], ['Caramel Frappé', 135, 'فرابيه كراميل'], ['Strawberry Frappé', 125, 'فرابيه فراولة'],
      ['Mocha Frappé', 135, 'فرابيه موكا'], ['White Mocha Frappé', 140, 'فرابيه وايت موكا'], ['Espresso Frappé', 130, 'فرابيه إسبريسو'], ['Matcha Frappé', 140, 'فرابيه ماتشا']] }] },
    { title: 'Milkshake', ar: 'ميلك شيك', groups: [{ items: [
      ['Vanilla Milkshake', 120, 'ميلك شيك فانيليا'], ['Chocolate Milkshake', 130, 'ميلك شيك شوكولاتة'], ['Mango Milkshake', 130, 'ميلك شيك مانجو'], ['Strawberry Milkshake', 130, 'ميلك شيك فراولة'],
      ['Caramel Milkshake', 130, 'ميلك شيك كراميل'], ['Lotus Milkshake', 130, 'ميلك شيك لوتس'], ['Blueberry Milkshake', 130, 'ميلك شيك بلوبيري']] }] },
    { title: 'Fresh Juices', ar: 'عصائر فريش', groups: [{ items: [
      ['Mango Juice', 90, 'عصير مانجو'], ['Strawberry Juice', 90, 'عصير فراولة'], ['Guava Juice', 90, 'عصير جوافة'], ['Lemon Juice', 70, 'عصير ليمون'],
      ['Lemon Mint Juice', 80, 'ليمون نعناع'], ['Banana Milk', 90, 'موز باللبن'], ['Orange Juice', 90, 'عصير برتقال']] }] },
    { title: 'Mojito', ar: 'موهيتو', groups: [{ items: [
      ['Classic Mojito', 90, 'موهيتو كلاسيك'], ['Blueberry Mojito', 110, 'موهيتو بلوبيري'], ['Mango Mojito', 110, 'موهيتو مانجو'], ['Strawberry Mojito', 110, 'موهيتو فراولة'],
      ['Piña Colada Mojito', 130, 'موهيتو بينا كولادا'], ['Peach Mojito', 110, 'موهيتو خوخ'], ['Mixed Berry Mojito', 120, 'موهيتو ميكس بيري'], ['Tropical Mojito', 135, 'موهيتو تروبيكال'],
      ['Jelly Cola Mojito', 110, 'موهيتو جيلي كولا'], ['Watermelon Mojito', 110, 'موهيتو بطيخ']] }] },
    { title: 'Smoothie', ar: 'سموذي', groups: [{ items: [
      ['Blueberry Smoothie', 110, 'سموذي بلوبيري'], ['Mango Smoothie', 120, 'سموذي مانجو'], ['Strawberry Smoothie', 120, 'سموذي فراولة'], ['Mixed Berry Smoothie', 115, 'سموذي ميكس بيري'],
      ['Kiwi Smoothie', 110, 'سموذي كيوي'], ['Passion Fruit Smoothie', 120, 'سموذي باشن فروت'], ['Cola Smoothie', 115, 'سموذي كولا'], ['Watermelon Smoothie', 120, 'سموذي بطيخ'],
      ['Peach Smoothie', 115, 'سموذي خوخ'], ['Mixed Piña Colada', 135, 'ميكس بينا كولادا'], ['Lemon Smoothie', 90, 'سموذي ليمون'], ['Lemon Mint Smoothie', 100, 'سموذي ليمون نعناع']] }] },
    { title: 'Desserts', ar: 'حلويات', groups: [{ items: [
      ['Molten Cake', 130, 'مولتن كيك'], ['Red Velvet Cake', 105, 'ريد فيلفت كيك'], ['Cheesecake', 135, 'تشيز كيك'], ['Chocolate Fudge', 135, 'شوكولاتة فدج']] }] },
    { title: 'Extras', ar: 'إضافات', groups: [
      { label: 'Additional Drinks', ar: 'مشروبات إضافية', items: [['Small Mineral Water', 15, 'مياه معدنية صغيرة'], ['Red Bull', 100, 'ريد بول'], ['Red Bull Mojito', 170, 'موهيتو ريد بول']] },
      { label: 'Additions', ar: 'إضافات', items: [['Latte Art', 35, 'لاتيه آرت'], ['Sauce', 25, 'صوص'], ['Milk', 15, 'لبن']] }] }
  ];

  // ---- Language: English by default, Arabic on request ----
  var TXT = {
    en: {
      est: 'Est. 2026 · Mansoura', tagline: 'Riverside coffee,<br>warm moments.', open: 'PRESS PLAY · OPEN MENU',
      menu: 'Menu', mixtape: 'The Sequoia Mixtape', vol: 'Vol. 01', items: function (n) { return n + ' items'; },
      pick1: 'Pick a track,', pick2: 'we\'ll press play.', prices: 'All prices in EGP', egp: 'EGP',
      sideA: 'SIDE A', sideB: 'SIDE B', track: 'TRACK', rewind: '‹ Rewind', next: 'Next track ›', trackList: 'Track list', finish: 'Finish',
      endB: 'End of side B', thanks: 'THANK YOU', again: 'PLAY IT AGAIN', toggle: 'ع', toggleLabel: 'عربي',
      backCover: 'Back to cover', sections: 'Menu sections', close: 'Close'
    },
    ar: {
      est: 'من 2026 · المنصورة', tagline: 'قهوة على النيل<br>ومود حلو', open: 'شغّل المنيو',
      menu: 'المنيو', mixtape: 'شريط سيكويا', vol: 'الجزء 01', items: function (n) { return n + ' صنف'; },
      pick1: 'اختار تراك،', pick2: 'وإحنا نشغّل.', prices: 'كل الأسعار بالجنيه', egp: 'جنيه',
      sideA: 'الوش الأول', sideB: 'الوش التاني', track: 'تراك', rewind: '› رجوع', next: 'التراك اللي بعده ‹', trackList: 'قايمة التراكات', finish: 'النهاية',
      endB: 'خلص الوش التاني', thanks: 'نورتنا', again: 'شغّله تاني', toggle: 'EN', toggleLabel: 'English',
      backCover: 'رجوع للبداية', sections: 'أقسام المنيو', close: 'إغلاق'
    }
  };
  var lang = 'en';
  try { lang = localStorage.getItem('sq-lang') === 'ar' ? 'ar' : 'en'; } catch (_) {}
  function T(k) { return TXT[lang][k]; }
  function nm(it) { return lang === 'ar' ? it[2] || it[0] : it[0]; }
  function st(s) { return lang === 'ar' ? s.ar || s.title : s.title; }
  function gl(g) { return lang === 'ar' ? g.ar || g.label : g.label.toUpperCase(); }
  function applyLang() {
    app.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    app.classList.toggle('is-ar', lang === 'ar');
    document.documentElement.lang = lang;
  }
  function langBtn(extra) {
    return '<button class="press lang" data-lang aria-label="' + T('toggleLabel') + '"' + (extra ? ' style="' + extra + '"' : '') + '>' + T('toggle') + '</button>';
  }

  var USER = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function acctBtn() { return '<button class="press acct" data-acct aria-label="' + (lang === 'ar' ? 'حسابي' : 'My account') + '">' + USER + '</button>'; }
  var app = document.getElementById('app');
  var CHEV_R = '<svg class="flip" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV_L = '<svg class="flip" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(i) { return String(i + 1).padStart(2, '0'); }
  function count(s) { return s.groups.reduce(function (a, g) { return a + g.items.length; }, 0); }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  // vector logo lockup (tree traced from assets/tree-cream.png by tools/trace-tree.py): sharp on every screen
  var LOGO = '<svg viewBox="0 0 420 748" role="img" aria-label="Sequoia Café" style="position:relative;display:block;width:128px;height:auto;margin-top:28px;color:var(--cream)"><rect x="8" y="8" width="404" height="564" rx="202" fill="none" stroke="currentColor" stroke-width="16"/><path transform="translate(39.6 66) scale(0.96)" fill="currentColor" d="M174.62 1.75Q175.75 1.14 177.62 1.18Q179.5 1.21 181.38 2.48Q183.25 3.75 193.12 16Q203 28.25 207.25 32.25Q211.5 36.25 214.5 38.57Q217.5 40.89 221.75 43.55Q226 46.21 229.88 48.11Q233.75 50 239 51.91Q244.25 53.82 248.75 54.93Q253.25 56.04 253.84 56.52Q254.43 57 254.77 58Q255.11 59 254.86 63.38Q254.61 67.75 252.54 73.75Q250.46 79.75 248.23 83.5Q246 87.25 244.88 88Q243.75 88.75 242.5 89Q241.25 89.25 238.38 88.86Q235.5 88.46 231 86.45Q226.5 84.43 222.25 81.82Q218 79.21 208.38 72.25Q198.75 65.29 196.5 63.88Q194.25 62.46 193.62 62.43Q193 62.39 190.98 65.32Q188.96 68.25 188.36 70.5Q187.75 72.75 187.75 74.88Q187.75 77 188.89 80.62Q190.04 84.25 192 87.25Q193.96 90.25 197.73 93.62Q201.5 97 206.62 99.86Q211.75 102.71 219.25 106.25Q226.75 109.79 237.38 113.34Q248 116.89 262.88 119.55Q277.75 122.21 279.59 123.25Q281.43 124.29 282.09 125.89Q282.75 127.5 282.16 130.5Q281.57 133.5 280.02 137.38Q278.46 141.25 271.34 155.43L264.21 169.61L255.23 166.12Q246.25 162.64 239.5 158.88Q232.75 155.11 226.75 150.98Q220.75 146.86 208.12 136.38Q195.5 125.89 194.96 126.2Q194.43 126.5 193.25 128.5Q192.07 130.5 191.04 134.12Q190 137.75 189.98 141.25Q189.96 144.75 191.11 147.82Q192.25 150.89 197.62 156.57Q203 162.25 209 167.29Q215 172.32 220.5 176.05Q226 179.79 232.38 183.23Q238.75 186.68 244.88 189.25Q251 191.82 259.25 194.34Q267.5 196.86 274.38 198.34Q281.25 199.82 295.62 202.18Q310 204.54 312.62 205.61Q315.25 206.68 316.12 207.59Q317 208.5 317.25 209.25Q317.5 210 317.38 211.5Q317.25 213 315.61 216.75Q313.96 220.5 310.25 231.12Q306.54 241.75 304 247.62Q301.46 253.5 299.71 256.62Q297.96 259.75 295.98 262.25Q294 264.75 291.5 266.29Q289 267.82 288 267.84Q287 267.86 285.12 267.2Q283.25 266.54 276.38 263.5Q269.5 260.46 262.25 256.5Q255 252.54 250 249.38Q245 246.21 238 241.14Q231 236.07 225.5 231.57Q220 227.07 208.88 216.73Q197.75 206.39 197.12 206.7Q196.5 207 195.34 209.25Q194.18 211.5 193.09 215.62Q192 219.75 192 222Q192 224.25 192.43 226.62Q192.86 229 194.29 232.5Q195.71 236 197.55 238.88Q199.39 241.75 201.95 244.75Q204.5 247.75 213.5 255.91Q222.5 264.07 231.5 270.45Q240.5 276.82 250.5 282.34Q260.5 287.86 267.38 290.82Q274.25 293.79 283.25 296.84Q292.25 299.89 305 302.88Q317.75 305.86 332.5 308Q347.25 310.14 350 310.95Q352.75 311.75 353.75 313.25Q354.75 314.75 353.61 319.88Q352.46 325 349.98 331.75Q347.5 338.5 335.66 365.25Q323.82 392 323.41 392.32Q323 392.64 315.88 389.55Q308.75 386.46 300.88 382.45Q293 378.43 286.5 374.68Q280 370.93 272.5 366.04Q265 361.14 256.38 354.61Q247.75 348.07 239.88 341.16Q232 334.25 223.88 326Q215.75 317.75 208.71 309.52Q201.68 301.29 201.21 301.04Q200.75 300.79 200.25 300.95Q199.75 301.11 198.41 302.55Q197.07 304 195.89 306.12Q194.71 308.25 194.07 310.62Q193.43 313 193.25 314.88Q193.07 316.75 193.48 320.12Q193.89 323.5 195.96 329.12Q198.04 334.75 202.23 341.88Q206.43 349 213.46 357.75Q220.5 366.5 229 375Q237.5 383.5 245.75 390.41Q254 397.32 260.12 401.55Q266.25 405.79 269.46 407.52Q272.68 409.25 272.88 409.62Q273.07 410 268.73 421.12Q264.39 432.25 260.43 440.62Q256.46 449 255.84 449.64L255.21 450.29L249.36 446.91Q243.5 443.54 239.75 440.82Q236 438.11 229 432.05Q222 426 211.95 416.27Q201.89 406.54 201.29 406.64Q200.68 406.75 198.8 412.5Q196.93 418.25 195.96 424.5Q195 430.75 195 437.38Q195 444 195.95 450Q196.89 456 198.93 462.25Q200.96 468.5 203.62 473.75Q206.29 479 209.3 483.38Q212.32 487.75 214.91 490.75Q217.5 493.75 220.43 496.52L223.36 499.29L223.05 499.52Q222.75 499.75 220.25 499.77Q217.75 499.79 216.75 500.27Q215.75 500.75 211.88 500.75Q208 500.75 207 501.25Q206 501.75 182.88 501.75Q159.75 501.75 158.88 501.27Q158 500.79 154 500.77Q150 500.75 149 500.27Q148 499.79 145.5 499.77Q143 499.75 140.66 499.09L138.32 498.43L141.88 493.96Q145.43 489.5 147.68 485.62Q149.93 481.75 152.34 475.62Q154.75 469.5 156.27 463.12Q157.79 456.75 158.64 448.75Q159.5 440.75 159.5 435.62Q159.5 430.5 158.64 422.62Q157.79 414.75 157.25 412.25Q156.71 409.75 156.11 408.68Q155.5 407.61 154.12 407.82Q152.75 408.04 150.38 409.71Q148 411.39 132.5 426.07Q117 440.75 113 443.86Q109 446.96 105.88 448.64Q102.75 450.32 102.14 450.21Q101.54 450.11 100.71 449.18Q99.89 448.25 96.61 443Q93.32 437.75 91.77 434.38Q90.21 431 88.68 426.38Q87.14 421.75 86.07 416.12Q85 410.5 85.16 409.02Q85.32 407.54 89.16 405.46Q93 403.39 97.45 400.45Q101.89 397.5 105.95 394.39Q110 391.29 115.88 386.14Q121.75 381 126.62 376.12Q131.5 371.25 135.89 366.25Q140.29 361.25 146.54 352.5Q152.79 343.75 155.88 337.5Q158.96 331.25 159.91 328.38Q160.86 325.5 161.43 322.38Q162 319.25 162 316.38Q162 313.5 161.39 310.88Q160.79 308.25 159.88 306.38Q158.96 304.5 157.73 302.88Q156.5 301.25 156 300.95Q155.5 300.64 154.93 300.95Q154.36 301.25 146.8 310Q139.25 318.75 131.12 326.88Q123 335 115.5 341.52Q108 348.04 103 351.95Q98 355.86 92.88 359.54Q87.75 363.21 79.5 368.48Q71.25 373.75 61.5 379.12Q51.75 384.5 44.88 387.68Q38 390.86 36.88 390.66Q35.75 390.46 33.75 389.27Q31.75 388.07 29.71 386.04Q27.68 384 26.5 382.25Q25.32 380.5 12.66 348.75Q0 317 0.16 316.18Q0.32 315.36 1.04 314.45Q1.75 313.54 4.12 312.41Q6.5 311.29 24.25 308.07Q42 304.86 50.62 302.86Q59.25 300.86 68.88 297.82Q78.5 294.79 87.88 290.82Q97.25 286.86 107.38 281.12Q117.5 275.39 125.12 269.88Q132.75 264.36 137.5 260.3Q142.25 256.25 146.88 251.75Q151.5 247.25 156.77 241Q162.04 234.75 163.36 231.12Q164.68 227.5 164.68 222.88Q164.68 218.25 164.23 216.62Q163.79 215 162.59 212.75Q161.39 210.5 159.82 208.79Q158.25 207.07 157.38 206.82Q156.5 206.57 146.12 216.79Q135.75 227 129.25 232.43Q122.75 237.86 116.38 242.41Q110 246.96 104.38 250.38Q98.75 253.79 93.12 256.71Q87.5 259.64 81.62 262.12Q75.75 264.61 69.12 266.7Q62.5 268.79 61.93 268.27Q61.36 267.75 53.29 249.75Q45.21 231.75 42.73 225Q40.25 218.25 39.75 214.75Q39.25 211.25 39.91 209.38Q40.57 207.5 42.29 206.36Q44 205.21 45.88 204.68Q47.75 204.14 60 202.5Q72.25 200.86 76.75 199.86Q81.25 198.86 89.5 196.32Q97.75 193.79 105 190.73Q112.25 187.68 120.12 183.52Q128 179.36 136 174.29Q144 169.21 149.88 164.86Q155.75 160.5 158.88 156.88Q162 153.25 163.86 149.25Q165.71 145.25 166.11 142.38Q166.5 139.5 166.2 137.38Q165.89 135.25 165.3 133.75Q164.71 132.25 163.48 130.38Q162.25 128.5 160.62 127.2L159 125.89L149.88 134Q140.75 142.11 133 147.82Q125.25 153.54 116.12 158.5Q107 163.46 101.88 165.52Q96.75 167.57 94 168.29L91.25 169L89.59 166.38Q87.93 163.75 84.12 155.88Q80.32 148 78.23 142.88Q76.14 137.75 74.48 132.5Q72.82 127.25 73.29 126.59Q73.75 125.93 75.88 124.62Q78 123.32 81.62 121.79Q85.25 120.25 90.62 119.52Q96 118.79 102.62 117.32Q109.25 115.86 114.75 114.3Q120.25 112.75 126.88 110.36Q133.5 107.96 138.25 105.84Q143 103.71 147.25 101.27Q151.5 98.82 155.12 96.04Q158.75 93.25 160.54 91.38Q162.32 89.5 163.36 88.12Q164.39 86.75 165.61 84.25Q166.82 81.75 167.16 79Q167.5 76.25 166.59 72.75Q165.68 69.25 164.27 66.88Q162.86 64.5 162.05 64.05Q161.25 63.61 144.25 74.18Q127.25 84.75 122.25 87.59Q117.25 90.43 116.12 90.48Q115 90.54 112.16 87.89Q109.32 85.25 106.77 80.88Q104.21 76.5 103.18 73.25Q102.14 70 101.7 66.75Q101.25 63.5 101.27 60.62Q101.29 57.75 102.02 56.96Q102.75 56.18 107.12 55Q111.5 53.82 118.62 50.79Q125.75 47.75 130 45.29Q134.25 42.82 138.12 40.07Q142 37.32 148.12 31.79Q154.25 26.25 158.29 21.62Q162.32 17 166.86 10.75Q171.39 4.5 172.45 3.43Q173.5 2.36 174.62 1.75Z"/><text x="211" y="679" text-anchor="middle" fill="currentColor" font-family="Libre Bodoni, serif" font-weight="700" font-size="70.5">SEQUOIA</text><rect x="43" y="729" width="101" height="3" fill="currentColor"/><rect x="278" y="729" width="101" height="3" fill="currentColor"/><text x="211" y="744" text-anchor="middle" fill="currentColor" font-family="Libre Bodoni, serif" font-size="35" letter-spacing="6">CAFE</text></svg>';

  function cover() {
    // the first screen is the cover as before; the cover page now scrolls to the journal, clubs and social links
    var L = window.SequoiaLanding;
    return '<section class="screen cvscroll' + (L ? '' : ' cvsolo') + '"><div class="cover">' +
      '<div class="forest" aria-hidden="true" style="height:360px;opacity:.55"></div>' +
      '<span style="position:absolute;top:max(14px,env(safe-area-inset-top));inset-inline-end:14px;display:flex;gap:8px;z-index:2">' + acctBtn() + langBtn() + '</span>' +
      '<div class="est caps"><i></i><span>' + T('est') + '</span><i></i></div>' +
      LOGO +
      '<img class="bob" src="assets/mascot-walkman.webp" alt="Sequoia\'s Walkman mascot waving" width="700" height="901" style="position:relative;width:184px;max-width:48vw;height:auto;margin-top:16px">' +
      '<p class="serif-i" style="position:relative;margin:22px 0 0;font-size:21px;line-height:1.3;text-align:center">' + T('tagline') + '</p>' +
      '<div style="flex:1 1 auto;min-height:24px"></div>' +
      '<button class="press btn-primary" data-go="#tracks"><svg class="flip" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg><span>' + T('open') + '</span></button>' +
      (L ? L.more(lang) : '') +
      '</div>' + (L ? L.html(lang) : '') + '</section>';
  }

  function tracks() {
    var rows = SECTIONS.map(function (s, i) {
      return '<button class="press track in" style="animation-delay:' + (i * 40) + 'ms" data-go="#s-' + (i + 1) + '">' +
        '<span class="n">' + pad(i) + '</span>' +
        '<span class="t"><b>' + esc(st(s)) + '</b></span>' +
        '<span class="c">' + T('items')(count(s)) + '</span>' +
        '<span style="color:var(--navy)">' + CHEV_R + '</span></button>';
    }).join('');
    return '<section class="screen" style="padding-top:max(12px,env(safe-area-inset-top))">' +
      '<div class="bar" style="padding:8px 16px 0;height:52px">' +
        '<button class="press ghost" data-go="#" aria-label="' + T('backCover') + '" style="padding-inline-start:4px"><img src="assets/tree-cream.webp" alt="" style="width:20px;height:auto"><span class="display wm" style="font-size:22px;letter-spacing:.08em">SEQUOIA</span></button>' +
        '<span style="display:flex;align-items:center;gap:12px"><span class="caps" style="font-size:13px;letter-spacing:.24em;color:var(--beige)">' + T('menu') + '</span>' + acctBtn() + langBtn() + '</span>' +
      '</div>' +
      '<div class="jcard">' +
        '<div class="jhead"><div class="stripe" style="background:var(--accent)"></div>' +
          '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px"><span class="display" style="font-size:28px;line-height:1.1;color:var(--cream)">' + T('mixtape') + '</span><span class="caps" style="font-size:12px;letter-spacing:.18em;color:var(--beige)">' + T('vol') + '</span></div>' +
          '<div class="stripe" style="background:var(--beige)"></div></div>' +
        '<div class="tracks noscroll">' + rows + '</div>' +
      '</div>' +
      '<div class="foot">' +
        '<div style="position:absolute;inset-inline-start:20px;bottom:24px;display:flex;flex-direction:column;gap:4px">' +
          '<span class="serif-i" style="font-size:18px">' + T('pick1') + '</span><span class="serif-i" style="font-size:18px">' + T('pick2') + '</span>' +
          '<span class="caps" style="font-size:11px;letter-spacing:.2em;color:var(--beige);margin-top:4px">' + T('prices') + '</span></div>' +
        '<img class="bob" src="assets/mascot-cassette-v3.webp" width="750" height="557" alt="" style="position:absolute;inset-inline-end:10px;bottom:6px;width:150px;height:auto">' +
      '</div>' + dock() + '</section>';
  }

  function section(i) {
    var s = SECTIONS[i], n = 0, last = SECTIONS.length - 1;
    var chips = SECTIONS.map(function (c, j) {
      return '<button class="press chip" aria-current="' + (j === i) + '" data-go="#s-' + (j + 1) + '">' + esc(st(c)) + '</button>';
    }).join('');
    var body = s.groups.map(function (g) {
      return (g.label ? '<div class="group">' + esc(gl(g)) + '</div>' : '') +
        g.items.map(function (it) {
          var d = Math.min(n++ * 35, 420);
          return '<div class="item in" style="animation-delay:' + d + 'ms"><span class="nm">' + esc(nm(it)) + '</span><span class="dots" aria-hidden="true"></span><span class="pr">' + it[1] + '</span></div>';
        }).join('');
    }).join('');
    var prevLabel = i === 0 ? T('trackList') : st(SECTIONS[i - 1]);
    var nextLabel = i === last ? T('finish') : st(SECTIONS[i + 1]);
    var prevGo = i === 0 ? '#tracks' : '#s-' + i;
    var nextGo = i === last ? '#thanks' : '#s-' + (i + 2);
    return '<section class="screen">' +
      '<div class="bar">' +
        '<button class="press ghost caps" data-go="#tracks" style="font-size:14px;letter-spacing:.18em">' + CHEV_L + '<span>' + T('menu') + '</span></button>' +
        '<span class="wordmark"><img src="assets/tree-cream.webp" alt="" style="width:16px;height:auto"><span class="wm" style="font-size:19px">SEQUOIA</span></span>' +
        '<span style="display:flex;align-items:center;gap:8px;padding-inline-end:6px"><span class="caps" style="font-size:14px;letter-spacing:.08em;color:var(--beige);font-variant-numeric:tabular-nums" dir="ltr">' + pad(i) + ' / ' + pad(last) + '</span>' + acctBtn() + langBtn() + '</span>' +
      '</div>' +
      '<nav class="chips noscroll" id="chips" aria-label="' + T('sections') + '">' + chips + '</nav>' +
      '<div class="scroll noscroll">' +
        '<div class="arch">' +
          '<img src="assets/tree-navy.webp" alt="" style="width:34px;height:auto">' +
          '<span class="pill">' + (i < 5 ? T('sideA') : T('sideB')) + ' · ' + T('track') + ' ' + pad(i) + '</span>' +
          '<h1>' + esc(st(s)) + '</h1>' +
          '<div class="rule caps"><i></i><span>' + T('items')(count(s)) + ' · ' + T('egp') + '</span><i></i></div>' +
        '</div>' +
        '<div class="items">' + body + '<p class="egp caps">' + T('prices') + '</p></div>' +
        '<div class="nav">' +
          '<button class="press ghost prev" data-go="' + prevGo + '"><small class="caps" style="color:var(--beige)">' + T('rewind') + '</small><b style="color:var(--cream)">' + esc(prevLabel) + '</b></button>' +
          '<button class="press next" data-go="' + nextGo + '"><small class="caps" style="color:var(--tan);font-weight:700">' + T('next') + '</small><b style="color:var(--navy);font-weight:700">' + esc(nextLabel) + '</b></button>' +
        '</div>' +
      '</div>' + dock() + '</section>';
  }

  function thanks() {
    return '<section class="screen thanks">' +
      '<div class="forest" aria-hidden="true" style="height:320px;opacity:.5"></div>' +
      '<img class="bob" src="assets/mascot-cassette-v3.webp" width="750" height="557" alt="Sequoia\'s cassette mascot" style="position:relative;width:250px;max-width:66vw;height:auto">' +
      '<span class="caps" style="position:relative;margin-top:26px;font-size:12px;letter-spacing:.3em;color:var(--beige)">' + T('endB') + '</span>' +
      '<h1 class="display" style="position:relative;margin:10px 0 0;font-size:48px;line-height:1.1;letter-spacing:.06em">' + T('thanks') + '</h1>' +
      '<button class="press btn-primary" data-go="#tracks" style="margin-top:36px"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + T('again') + '</span></button>' +
      '</section>';
  }

  // ---- Table service: call the captain, ask for the bill, quick requests ----
  var COOLDOWN = 60 * 1000;   // the same request can be sent again after this
  var FEEDBACK_URL = 'https://forms.gle/VTLfxqve1PRwdxXH9';
  var PAY = [['cash', 'Cash', 'كاش'], ['card', 'Card', 'كارت'], ['instapay', 'InstaPay', 'InstaPay']];
  var QUICK = [['water', 'Water', 'مياه'], ['napkins', 'Napkins', 'مناديل'], ['clean', 'Clean table', 'تنضيف الترابيزة']]; // edit quick requests here: [code, English, Arabic]
  var SV = {
    en: { ready: 'Ready to order', service: 'AT YOUR SERVICE', help: 'How can we help?', table: 'Table', bill: 'Ask for the bill', quick: 'Quick requests',
          captainComing: 'Captain is coming', billComing: 'Bill is coming', isComing: ' is coming', tableW: 'Table',
          onWay: 'On the way!', heading: function (t) { return 'The captain is heading to table ' + t + '.'; },
          billTitle: 'Your bill is coming', paying: function (p, t) { return 'Paying by ' + p + ' · table ' + t + '.'; },
          upTitle: 'Coming right up', forTable: function (x, t) { return x + ' for table ' + t + '.'; },
          fbTitle: 'How was your visit?', fbLine: 'Tell us in 2 minutes — it goes straight to the owner.',
          more: 'Anything else?', back: 'Back to menu', needTable: 'Please enter your table number.',
          fail: 'Couldn\'t reach the captain. Check your connection and try again.' },
    ar: { ready: 'جاهزين نطلب', service: 'في خدمتك', help: 'نقدر نساعدك إزاي؟', table: 'الترابيزة', bill: 'اطلب الحساب', quick: 'طلبات سريعة',
          captainComing: 'الكابتن جاي', billComing: 'الحساب جاي', isComing: ' جاية', tableW: 'ترابيزة',
          onWay: 'الكابتن جاي!', heading: function (t) { return 'الكابتن في الطريق لترابيزة ' + t + '.'; },
          billTitle: 'الحساب جاي', paying: function (p, t) { return 'الدفع ' + p + ' · ترابيزة ' + t + '.'; },
          upTitle: 'جاي حالًا', forTable: function (x, t) { return x + ' لترابيزة ' + t + '.'; },
          fbTitle: 'إيه رأيك في زيارتك؟', fbLine: 'قولنا في دقيقتين، ورأيك هيوصل للأونر على طول.',
          more: 'محتاج حاجة تانية؟', back: 'رجوع للمنيو', needTable: 'اكتب رقم ترابيزتك.',
          fail: 'مقدرناش نوصل للكابتن. اتأكد من النت وجرّب تاني.' }
  };
  function V(k) { return SV[lang][k]; }
  function li() { return lang === 'ar' ? 2 : 1; }
  var BELL = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var X = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } }

  var sent = load('sq-sent') || {};       // key -> {table, at, kind, detail}  (key = kind or kind:item)
  var last = load('sq-last');             // the most recent sent request, for the dock
  // the table comes only from the QR on the table (menu/?table=7); without it, service buttons are hidden
  var qp = /[?&](?:table|t)=(\d{1,3})\b/.exec(location.search);
  var table = qp && +qp[1] > 0 ? String(+qp[1]) : '';

  function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function fresh(k) { var s = sent[k]; return s && Date.now() - s.at < COOLDOWN ? s : null; }
  function label(kind, detail) {
    if (kind === 'call') return 'Captain';
    if (kind === 'bill') return (PAY.filter(function (p) { return p[0] === detail; })[0] || [0, detail, detail])[li()];
    return (QUICK.filter(function (q) { return q[0] === detail; })[0] || [0, detail, detail])[li()];
  }
  function dockText(s) {
    var tt = ' · ' + V('tableW') + ' ' + esc(s.table);
    if (s.kind === 'call') return V('captainComing') + tt;
    if (s.kind === 'bill') return V('billComing') + tt;
    return esc(label(s.kind, s.detail)) + V('isComing') + tt;
  }

  function dock() {
    if (!table) return '';
    var s = last && Date.now() - last.at < COOLDOWN ? last : null;
    return '<div class="dock">' + (s
      ? '<button class="press call sent caps" data-call><span class="dot" aria-hidden="true"></span><span>' + dockText(s) + '</span></button>'
      : '<button class="press call caps" data-call>' + BELL + '<span>' + V('ready') + '</span></button>') +
      '</div>';
  }

  var sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.hidden = true;
  var tick = null, view = null; // view: null = options, else the request just sent

  function openSheet() {
    view = null;
    sheet.hidden = false;
    paintSheet();
  }
  function closeSheet() {
    sheet.hidden = true;
    clearInterval(tick); tick = null;
    var d = app.querySelector('.dock');
    if (d) d.outerHTML = dock();
  }

  function optBtn(attr, text, k) {
    var f = fresh(k);
    return '<button class="press opt' + (f ? ' done' : '') + '" ' + attr + (f ? ' disabled' : '') + '>' +
      (f ? '<span class="dot" aria-hidden="true"></span>' : '') + '<span>' + esc(text) + '</span></button>';
  }

  function paintSheet(error) {
    clearInterval(tick); tick = null;
    var html;
    if (view) {
      var v = view, title, line;
      if (v.kind === 'call') { title = V('onWay'); line = V('heading')(esc(v.table)); }
      else if (v.kind === 'bill') { title = V('billTitle'); line = V('paying')(esc(label('bill', v.detail)), esc(v.table)); }
      else { title = V('upTitle'); line = V('forTable')(esc(label(v.kind, v.detail)), esc(v.table)); }
      html = '<img class="bob" src="assets/mascot-walkman.webp" alt="" width="700" height="901" style="width:84px;height:auto;margin-top:6px">' +
        '<h2 id="sheet-title">' + title + '</h2>' +
        '<p class="serif-i" style="font-size:20px">' + line + '</p>' +
        (v.kind === 'bill'
          ? '<a class="press fb" href="' + FEEDBACK_URL + '" target="_blank" rel="noopener"><b>' + V('fbTitle') + '</b><span>' + V('fbLine') + '</span></a>'
          : '') +
        '<button class="press btn-primary caps" data-back style="margin-top:18px"><span>' + V('more') + '</span></button>' +
        '<button class="press linkbtn caps" data-close>' + V('back') + '</button>';
    } else {
      var c = fresh('call');
      html = '<span class="pill">' + V('service') + '</span>' +
        '<h2 id="sheet-title">' + V('help') + '</h2>' +
        '<div class="trow"><span class="tlabel caps">' + V('table') + '</span><span class="tfixed">' + esc(table) + '</span></div>' +
        '<div class="msg" id="tmsg" role="alert">' + (error ? esc(error) : '') + '</div>' +
        '<button class="press btn-primary caps" data-send="call"' + (c ? ' disabled' : '') + '>' + BELL + '<span>' + (c ? V('captainComing') + ' · <span id="cd" dir="ltr">' + mmss(Math.ceil((COOLDOWN - (Date.now() - c.at)) / 1000)) + '</span>' : V('ready')) + '</span></button>' +
        '<span class="olabel caps">' + V('bill') + '</span>' +
        '<div class="opts">' + PAY.map(function (p) { return optBtn('data-send="bill" data-detail="' + p[0] + '"', p[li()], 'bill'); }).join('') + '</div>' +
        '<span class="olabel caps">' + V('quick') + '</span>' +
        '<div class="opts">' + QUICK.map(function (q) { return optBtn('data-send="req" data-detail="' + q[0] + '"', q[li()], 'req:' + q[0]); }).join('') + '</div>';
      // tick the countdown; repaint only when a cooldown ends (keeps typing undisturbed)
      var cooling = Object.keys(sent).filter(function (k) { return fresh(k); });
      if (cooling.length) {
        tick = setInterval(function () {
          var c2 = fresh('call'), cd = sheet.querySelector('#cd');
          if (cd && c2) cd.textContent = mmss(Math.ceil((COOLDOWN - (Date.now() - c2.at)) / 1000));
          if (cooling.some(function (k) { return !fresh(k); })) {
            var y = sheet.querySelector('.panel').scrollTop;
            paintSheet(); sheet.querySelector('.panel').scrollTop = y;
          }
        }, 1000);
      }
    }
    sheet.innerHTML = '<div class="scrim" data-close></div>' +
      '<div class="panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
        '<div class="grab" aria-hidden="true"></div>' +
        '<button class="press x" data-close aria-label="' + T('close') + '">' + X + '</button>' + html +
      '</div>';
  }

  function send(kind, detail) {
    var key = kind === 'req' ? 'req:' + detail : kind;
    if (fresh(key)) return;
    var v = table;
    if (!v) return;
    sheet.querySelectorAll('[data-send]').forEach(function (b) { b.disabled = true; });
    var at = Date.now(), msg = { type: kind, table: v, rid: at.toString(36) + Math.random().toString(36).slice(2, 6) };
    if (kind === 'bill') msg.pay = detail;
    if (kind === 'req') msg.item = detail;
    var pub = window.SequoiaOrders ? window.SequoiaOrders.publish(msg) : Promise.reject(new Error('offline'));
    pub.then(function () {
      var rec = { table: v, at: at, kind: kind, detail: detail || '' };
      sent[key] = rec; last = rec;
      Object.keys(sent).forEach(function (k) { if (!fresh(k)) delete sent[k]; });
      store('sq-sent', sent); store('sq-last', last);
      view = rec; paintSheet();
      if (kind === 'bill') openReview();
    }).catch(function () {
      paintSheet(V('fail'));
    });
  }

  sheet.addEventListener('click', function (e) {
    var b;
    if (e.target.closest('[data-close]')) closeSheet();
    else if (e.target.closest('[data-back]')) { view = null; paintSheet(); }
    else if ((b = e.target.closest('[data-send]'))) send(b.getAttribute('data-send'), b.getAttribute('data-detail'));
  });
  sheet.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSheet();
  });

  // ---- Google review invite, shown right after a bill request is sent ----
  // Every guest gets the same invite: no rating first, no reward for reviewing (Google policy).
  var REVIEW_URL = (window.SEQUOIA_CONFIG || {}).GOOGLE_REVIEW_URL || '';
  var REVIEW_EVERY = 12 * 3600e3;      // show at most once per 12 hours on this phone
  var REVIEW_AFTER_TAP = 30 * 864e5;   // after tapping "review", don't ask again for 30 days
  var RV = {
    ar: { title: 'شكرًا إنك قعدت معانا 🌿', body: 'لو قعدتك عجبتك، تقييمك على جوجل بيفرق معانا جدًا وبيساعد ناس تانية تلاقينا.',
          go: 'قيّمنا على جوجل ⭐', later: 'مش دلوقتي' },
    en: { title: 'Thanks for spending time with us 🌿', body: 'If you enjoyed your visit, a Google review means a lot to us and helps others find us.',
          go: 'Review us on Google ⭐', later: 'Not now' }
  };
  var LEAF = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var rv = document.createElement('div');
  rv.className = 'rv';
  rv.hidden = true;

  function reviewDue() {
    if (!REVIEW_URL) return false;
    var r = load('sq-review') || {}, now = Date.now();
    if (r.clickedAt && now - r.clickedAt < REVIEW_AFTER_TAP) return false;
    if (r.shownAt && now - r.shownAt < REVIEW_EVERY) return false;
    return true;
  }
  function openReview() {
    if (!reviewDue()) return;
    var r = load('sq-review') || {}, t = RV[lang];
    r.shownAt = Date.now(); store('sq-review', r);
    rv.innerHTML = '<div class="scrim" data-rv-close></div>' +
      '<div class="rv-card" role="dialog" aria-modal="true" aria-labelledby="rv-title">' +
        '<div class="rv-leaf">' + LEAF + '</div>' +
        '<h2 id="rv-title">' + t.title + '</h2>' +
        '<p>' + t.body + '</p>' +
        '<a class="press rv-go" data-rv-go href="' + esc(REVIEW_URL) + '" target="_blank" rel="noopener">' + t.go + '</a>' +
        '<button class="rv-later" type="button" data-rv-close>' + t.later + '</button>' +
      '</div>';
    rv.hidden = false;
    var go = rv.querySelector('[data-rv-go]');
    if (go) go.focus();
  }
  function closeReview() {
    if (rv.hidden) return;
    rv.hidden = true;
    var back = sheet.querySelector('[data-back]');
    if (back && !sheet.hidden) back.focus();
  }
  rv.addEventListener('click', function (e) {
    if (e.target.closest('[data-rv-go]')) {
      var r = load('sq-review') || {};
      r.clickedAt = Date.now(); store('sq-review', r);
      closeReview(); // only hidden, so the link still opens in a new tab
    } else if (e.target.closest('[data-rv-close]')) closeReview();
  });
  rv.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeReview(); }
  });

  function render() {
    var h = location.hash, m = /^#s-(\d+)$/.exec(h), html;
    if (h === '#tracks') html = tracks();
    else if (h === '#thanks') html = thanks();
    else if (m && +m[1] >= 1 && +m[1] <= SECTIONS.length) html = section(+m[1] - 1);
    else html = cover();
    applyLang();
    app.innerHTML = html;
    app.appendChild(sheet);
    app.appendChild(rv);
    if (window.SequoiaLanding) {
      SequoiaLanding.closeJournal();
      var cv = app.querySelector('.cvscroll');
      if (cv) SequoiaLanding.mount(cv, lang);
    }
    if (window.SequoiaAccount) SequoiaAccount.reattach(app);
    var chips = document.getElementById('chips');
    if (chips) {
      var on = chips.querySelector('[aria-current="true"]');
      if (on) chips.scrollLeft = Math.max(0, on.offsetLeft - chips.clientWidth / 2 + on.offsetWidth / 2);
    }
    document.title = m ? st(SECTIONS[+m[1] - 1]) + ' — Sequoia Café' : 'Sequoia Café — ' + T('menu');
  }

  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-call]')) { openSheet(); return; }
    if (e.target.closest('[data-acct]')) { openAccount(); return; }
    if (e.target.closest('[data-lang]')) { lang = lang === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('sq-lang', lang); } catch (_) {} render(); return; }
    var b = e.target.closest('[data-go]');
    if (!b) return;
    var to = b.getAttribute('data-go');
    if (to === '#') { history.pushState('', document.title, location.pathname); render(); }
    else go(to);
  });
  // Sequoia Card: the code is fetched only the first time the account icon is tapped
  var acctLoading = null;
  function openAccount() {
    if (window.SequoiaAccount) return SequoiaAccount.open(app, { table: table });
    if (!acctLoading) acctLoading = new Promise(function (ok, bad) {
      var sc = document.createElement('script'); sc.src = 'assets/account.js'; sc.onload = ok; sc.onerror = function () { acctLoading = null; bad(); };
      document.head.appendChild(sc);
    });
    acctLoading.then(function () { SequoiaAccount.open(app, { table: table }); }, function () {});
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);
  render();
})();
~~~~

## `assets/orders.js`

~~~~js
/*
 * Sequoia table calls — shared transport for the menu (index.html) and the
 * captain screen (captain.html).
 *
 * Uses our own API (apps/loyalty/server.js, same origin under /api):
 *  - the menu posts call / bill / req to /api/calls with the table's QR signature (?t=7&s=...);
 *  - the captain screen (staff login) posts took / undo to /api/staff/calls and listens on
 *    /api/staff/calls/stream, which replays the last 12 h on connect.
 * Nothing goes to a third-party service, and only signed-in staff can read the calls.
 * Same publish() / subscribe() shape as before, so the pages did not change.
 */
(function () {
  'use strict';

  var API = '/api';
  var STAFF_TYPES = { took: 1, undo: 1 };
  var qs = /[?&]s=([A-Za-z0-9_-]{12})(?:&|$)/.exec(location.search);
  var TABLE_SIG = qs ? qs[1] : '';

  function publish(obj) {
    var staff = STAFF_TYPES[obj.type];
    var body = staff ? obj : Object.assign({ s: TABLE_SIG }, obj);
    return fetch(API + (staff ? '/staff/calls' : '/calls'), {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().catch(function () { return {}; });
    });
  }

  // onMessage(payloadObject, {id, time(ms), replay:boolean})
  // onStatus('live' | 'connecting')
  function subscribe(onMessage, onStatus) {
    var es, seen = {}, startedAt = Date.now(), retry = 0, closed = false;

    function connect() {
      if (closed) return;
      onStatus && onStatus('connecting');
      es = new EventSource(API + '/staff/calls/stream');
      es.onopen = function () { retry = 0; onStatus && onStatus('live'); };
      es.addEventListener('msg', function (e) {
        var m;
        try { m = JSON.parse(e.data); } catch (_) { return; }
        if (!m || seen[m.id] || !m.body || typeof m.body !== 'object') return;
        seen[m.id] = 1;
        var time = m.time || 0;
        onMessage(m.body, { id: m.id, time: time, replay: time < startedAt - 5000 });
      });
      es.onerror = function () {
        onStatus && onStatus('connecting');
        if (es.readyState === 2) { // CLOSED: browser gave up (or our staff session ended)
          es.close();
          fetch(API + '/staff/me', { credentials: 'same-origin' }).then(function (r) {
            if (r.status === 401 && window.SequoiaOrders.onLoggedOut) { closed = true; return window.SequoiaOrders.onLoggedOut(); }
            setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retry++)));
          }, function () { setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retry++))); });
        }
      };
    }
    connect();
    return function unsubscribe() { closed = true; if (es) es.close(); };
  }

  // Handled requests go to the Google report sheet through our server (staff session + a token the
  // browser never sees). The sheet URL and token live only in the server env (REPORT_SHEET_URL / _TOKEN).
  var REPORT_URL = API + '/staff/report';

  window.SequoiaOrders = { publish: publish, subscribe: subscribe, reportUrl: REPORT_URL };
})();
~~~~

## `assets/setup.js`

~~~~js
/* One-time Message Pro setup page. The link carries a one-use code in the #fragment (never sent in URLs
 * or logs); the token and webhook secret go straight from this form to /api/setup/messagepro. */
(function () {
  'use strict';
  var code = location.hash.slice(1);
  try { history.replaceState(null, '', location.pathname); } catch (_) {} // drop the code from the address bar
  var f = document.getElementById('f'), msg = document.getElementById('msg'), go = document.getElementById('go');
  var ERR = {
    link: 'الرابط ده اتستخدم قبل كده أو خلص وقته. اطلب رابط جديد.',
    token: 'التوكن شكله مش صح. انسخه تاني من Developer API.',
    secret: 'سر الـ Webhook شكله مش صح. انسخه تاني.',
    'token-rejected': 'Message Pro رفض التوكن. اعمل توكن جديد وجرّب تاني.',
    platform: 'مقدرناش نوصل لـ Message Pro دلوقتي. جرّب كمان شوية.',
    rate: 'محاولات كتير. استنى ساعة وجرّب تاني.'
  };
  function say(t, ok) { msg.textContent = t; msg.className = 'msg ' + (ok ? 'ok' : 'err'); }
  if (!code) { say(ERR.link); go.disabled = true; return; }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var token = document.getElementById('token').value.trim(), secret = document.getElementById('secret').value.trim();
    if (!token) { say('اكتب التوكن الأول.'); return; }
    go.disabled = true; say('بنتأكد من التوكن…', true);
    fetch('/api/setup/messagepro', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' },
      body: JSON.stringify({ code: code, token: token, webhookSecret: secret })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); })
      .then(function (j) {
        if (j.status === 200 && j.ok) {
          f.hidden = true; document.getElementById('done').hidden = false;
          document.getElementById('doneText').textContent = j.whatsappMessage
            ? 'كود الدخول بقى بيتبعت على واتساب، والدخول برسالة واتساب اشتغل كمان.'
            : 'كود الدخول بقى بيتبعت على واتساب.';
          code = '';
          return;
        }
        go.disabled = j.error === 'link';
        say(ERR[j.error] || 'حصل خطأ. جرّب تاني.');
      }, function () { go.disabled = false; say('مفيش اتصال. جرّب تاني.'); });
  });
})();
~~~~

## `assets/vendor/qrcode.js`

~~~~js
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));
~~~~

## `captain-ly9fglcp.html`

~~~~html
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#141B2D">
<meta name="robots" content="noindex, nofollow">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Sequoia Captain">
<title>Sequoia — الكابتن</title>
<link rel="icon" type="image/png" href="assets/tree-navy.png">
<link rel="apple-touch-icon" href="assets/tree-navy.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --navy:#1F2A44; --navy-deep:#141B2D; --beige:#DACBB4; --cream:#F4EEE2;
  --ink-2:#3A4560; --ink-3:#4A5470; --tan:#6B5330; --accent:#B8432F; --focus:#E0A458; --ok:#7BC48A;
  --ease-out:cubic-bezier(0.23,1,0.32,1);
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--navy-deep)}
body{font-family:'IBM Plex Sans Arabic',sans-serif;color:var(--cream);-webkit-font-smoothing:antialiased;
  background:var(--navy) url(assets/navy-texture-v2.webp) center/cover fixed no-repeat;min-height:100vh;min-height:100dvh;
  -webkit-user-select:none;user-select:none}
button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.num{font-family:'Abril Fatface',serif;font-weight:400;font-variant-numeric:tabular-nums}
.press{transition:transform 160ms var(--ease-out),background-color 180ms ease,opacity 180ms ease}
.press:active{transform:scale(0.97)}

.wrap{max-width:1200px;margin:0 auto;padding:max(16px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}

header{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px}
.brand img{width:26px;height:auto}
.brand b{font-family:'Abril Fatface',serif;font-weight:400;font-size:26px;letter-spacing:.08em}
.brand span{font-size:18px;color:var(--beige)}
.spacer{flex:1 1 auto}
.status{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;background:rgba(244,238,226,.08);font-size:15px;color:var(--beige)}
.status i{width:9px;height:9px;border-radius:50%;background:var(--focus)}
.status.live i{background:var(--ok)}
.sound{height:36px;padding:0 14px;border-radius:999px;border:1.5px solid rgba(244,238,226,.3);background:transparent;font-size:15px}

.banner{margin-top:16px;width:100%;display:flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:10px 18px;border:0;border-radius:16px;background:var(--focus);color:var(--navy-deep);font-size:18px;font-weight:600}

.count{margin:26px 0 14px;display:flex;align-items:baseline;gap:12px}
.count .num{font-size:56px;line-height:1}
.count span{font-size:22px;color:var(--beige)}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.card{position:relative;background:var(--cream);color:var(--navy);border-radius:24px;padding:18px 18px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;
  border-top:8px solid var(--navy)}
.card.warm{border-top-color:var(--focus)}
.card.hot{border-top-color:var(--accent)}
.card.fresh{animation:cardIn 360ms var(--ease-out) both,flash 1.2s ease 3}
@keyframes cardIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes flash{0%,100%{box-shadow:0 0 0 0 rgba(224,164,88,0)}50%{box-shadow:0 0 0 8px rgba(224,164,88,.55)}}
.card .lbl{font-size:16px;font-weight:600;color:var(--tan)}
.card .tn{font-size:88px;line-height:1;margin-top:4px}
.card .since{margin-top:8px;font-size:17px;font-weight:500;color:var(--ink-2)}
.card.hot .since{color:var(--accent);font-weight:700}
.badge{position:absolute;top:12px;left:12px;height:28px;padding:0 10px;border-radius:999px;background:var(--accent);color:var(--cream);font-size:14px;font-weight:600;display:flex;align-items:center}
.take{margin-top:16px;width:100%;height:60px;border:0;border-radius:16px;background:var(--navy);color:var(--cream);font-size:19px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px}
.take[disabled]{opacity:.5}

.empty{margin-top:40px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px}
.empty img{width:200px;height:auto;margin-bottom:14px;animation:bob 2.6s cubic-bezier(0.45,0,0.55,1) infinite;transform-origin:50% 100%}
@keyframes bob{0%,100%{transform:rotate(-2deg) translateY(0)}50%{transform:rotate(2deg) translateY(-6px)}}
.empty b{font-size:26px}
.empty span{font-size:18px;color:var(--beige)}

.done{margin-top:34px;border-top:1px solid rgba(244,238,226,.15);padding-top:16px}
.done h3{margin:0 0 12px;font-size:16px;font-weight:600;color:var(--beige)}
.dlist{display:flex;flex-wrap:wrap;gap:10px}
.ditem{display:flex;align-items:center;gap:12px;height:52px;padding:0 6px 0 16px;border-radius:14px;background:rgba(244,238,226,.08);font-size:16px}
.ditem .num{font-size:24px}
.ditem small{color:var(--beige);font-size:14px}
.undo{height:40px;padding:0 14px;border:1.5px solid rgba(244,238,226,.3);border-radius:10px;background:transparent;font-size:15px}

.toast{position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:12px 20px;border-radius:14px;background:var(--accent);color:var(--cream);font-size:16px;font-weight:600;animation:cardIn 260ms var(--ease-out) both}
@media (prefers-reduced-motion:reduce){.card,.card.fresh,.toast{animation:none}.empty img{animation:none}}
.card.bill{border-top-color:var(--accent)}
.needs{list-style:none;margin:14px 0 0;padding:12px 0 0;width:100%;border-top:1px dashed rgba(31,42,68,.25);display:flex;flex-direction:column;gap:8px;text-align:right}
.needs li{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:18px;font-weight:600}
.needs li small{font-size:14px;font-weight:500;color:var(--ink-3);white-space:nowrap}
.needs li.k-bill span{color:var(--accent)}
.sum{margin-top:34px;border-top:1px solid rgba(244,238,226,.15);padding-top:16px}
.sum h3{margin:0 0 12px;font-size:18px;font-weight:600}
.sum h3 small{font-size:14px;font-weight:400;color:var(--beige)}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.stat{background:rgba(244,238,226,.08);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.stat b.num{font-size:38px;line-height:1}
.stat b.sm{font-size:22px;font-weight:700;line-height:1.2}
.stat span{font-size:15px;color:var(--beige)}
.sumnote{margin:12px 0 0;font-size:14px;color:var(--beige)}
.gate{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--navy) url(assets/navy-texture-v2.webp) center/cover no-repeat}
.gate[hidden]{display:none}
.gbox{width:100%;max-width:360px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.gbox img{width:44px;height:auto}
.gbox b{font-size:24px}
.gbox span{font-size:16px;color:var(--beige)}
.pin{width:200px;height:72px;border:2px solid rgba(244,238,226,.35);border-radius:18px;background:rgba(20,27,45,.5);color:var(--cream);text-align:center;font-family:'Abril Fatface',serif;font-size:40px;letter-spacing:.3em;outline:none;-webkit-user-select:text;user-select:text}
.pin:focus{border-color:var(--cream)}
.pin[aria-invalid="true"]{border-color:var(--accent)}
.gin{width:100%;max-width:300px;height:56px;font-family:inherit;font-size:18px;letter-spacing:0}
.gerr{min-height:22px;color:#F2A08E!important}
.gbtn{width:200px;height:56px;border:0;border-radius:16px;background:var(--cream);color:var(--navy);font-size:18px;font-weight:700}
.tabs{margin-top:16px;display:flex;gap:6px;padding:5px;border-radius:18px;background:rgba(20,27,45,.45);width:max-content;max-width:100%}
.tab{height:48px;padding:0 22px;border:0;border-radius:14px;background:transparent;color:var(--beige);font-size:17px;font-weight:600}
.tab[aria-selected="true"]{background:var(--cream);color:var(--navy)}
[hidden]{display:none!important}
/* Google review link: button on bill cards + send/QR dialog */
.rvbtn{margin-top:10px;width:100%;height:48px;border:1.5px solid rgba(31,42,68,.3);border-radius:14px;background:transparent;color:var(--navy);font-size:16px;font-weight:600}
.rvbtn[disabled]{opacity:.5}
.ditem .rvbtn{margin:0;width:auto;height:40px;padding:0 12px;border-color:rgba(244,238,226,.3);color:var(--cream);font-size:15px;border-radius:10px}
.rvx{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(10,14,24,.6)}
.rvx-box{width:100%;max-width:400px;max-height:100%;overflow-y:auto;background:var(--cream);color:var(--navy);border-radius:24px;padding:24px 22px 14px;text-align:center;display:flex;flex-direction:column;align-items:stretch;gap:12px;animation:cardIn 320ms var(--ease-out) both}
.rvx-box b{font-size:22px}
.rvx-box p{margin:0;font-size:16px;line-height:1.5;color:var(--ink-2)}
.rvx-wa{display:flex;align-items:center;justify-content:center;gap:10px;height:56px;border-radius:16px;background:var(--navy);color:var(--cream);font-size:18px;font-weight:700;text-decoration:none}
.rvx-wa span{font-weight:500;opacity:.85}
.rvx-qr{align-self:center;border-radius:16px;background:#fff;line-height:0;overflow:hidden}
.rvx-qr svg{width:264px;height:264px}
.rvx-alt,.rvx-close{height:46px;border:0;background:transparent;color:var(--navy);font-size:16px;text-decoration:underline;text-underline-offset:4px}
.rvx-close{color:var(--ink-3)}
@media (prefers-reduced-motion:reduce){.rvx-box{animation:none}}
</style>
</head>
<body>
<div class="gate" id="gate" hidden>
  <form class="gbox" id="gform">
    <img src="assets/tree-cream.webp" alt="">
    <b>شاشة الكابتن</b>
    <span>دخول الموظفين</span>
    <input class="pin gin" id="gu" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="60" placeholder="اسم المستخدم" aria-label="اسم المستخدم" aria-describedby="gerr" dir="ltr">
    <input class="pin gin" id="pin" type="password" autocomplete="current-password" maxlength="200" placeholder="كلمة السر" aria-label="كلمة السر" aria-describedby="gerr" dir="ltr">
    <span class="gerr" id="gerr" role="alert"></span>
    <button class="press gbtn" type="submit">دخول</button>
  </form>
</div>
<div class="wrap">
  <header>
    <div class="brand"><img src="assets/tree-cream.webp" alt=""><b>SEQUOIA</b><span>· شاشة الكابتن</span></div>
    <div class="spacer"></div>
    <button class="press sound" id="sound" type="button">🔔 جرّب الصوت</button>
    <div class="status" id="status" role="status"><i></i><span>بيحاول يتصل…</span></div>
  </header>
  <nav class="tabs" role="tablist" aria-label="أقسام الشاشة">
    <button class="press tab" role="tab" id="t-orders" aria-selected="true" aria-controls="p-orders" type="button">طلبات الترابيزات</button>
    <button class="press tab" role="tab" id="t-card" aria-selected="false" aria-controls="p-card" type="button">كارت سيكويا</button>
  </nav>
  <div id="p-orders" role="tabpanel" aria-labelledby="t-orders">
  <button class="press banner" id="banner" type="button">دوس هنا عشان تشغّل صوت التنبيه وتفضل الشاشة منوّرة</button>
  <main id="main" aria-live="polite"></main>
  </div>
  <div id="p-card" role="tabpanel" aria-labelledby="t-card" hidden></div>
</div>

<script src="assets/config.js"></script>
<script src="assets/vendor/qrcode.js"></script>
<script src="assets/orders.js"></script>
<script src="assets/captain.js"></script>
</body>
</html>
~~~~

## `index.html`

~~~~html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1F2A44">
<title>Sequoia Café — Menu</title>
<meta name="description" content="Sequoia Café menu — riverside coffee, warm moments.">
<link rel="icon" type="image/png" href="assets/tree-navy.png">
<link rel="apple-touch-icon" href="assets/tree-navy.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Libre+Bodoni:ital,wght@0,400;0,700;1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{
  --navy:#1F2A44; --navy-deep:#141B2D; --beige:#DACBB4; --cream:#F4EEE2;
  --ink-2:#3A4560; --ink-3:#4A5470; --tan:#6B5330; --accent:#B8432F; --focus:#E0A458;
  --ease-out:cubic-bezier(0.23,1,0.32,1);
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--navy-deep)}
body{font-family:'Barlow',sans-serif;color:var(--cream);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
img{display:block}

.app{position:relative;margin:0 auto;width:100%;max-width:480px;height:100vh;height:100dvh;overflow:hidden;
  background:var(--navy) url(assets/navy-texture-v2.webp) center/cover no-repeat}
@media (min-width:520px){.app{height:min(100dvh,900px);top:max(0px,calc((100dvh - 900px)/2));border-radius:28px;box-shadow:0 30px 80px rgba(0,0,0,.5)}}

.screen{position:absolute;inset:0;display:flex;flex-direction:column;animation:screenIn 280ms var(--ease-out) both}
@keyframes screenIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.in{opacity:0;animation:itemIn 320ms var(--ease-out) forwards}
@keyframes itemIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bob{transform-origin:50% 100%;animation:bob 2.6s cubic-bezier(0.45,0,0.55,1) infinite}
@keyframes bob{0%,100%{transform:rotate(-2deg) translateY(0)}50%{transform:rotate(2deg) translateY(-6px)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.screen,.in{animation:fade 200ms ease forwards}.bob{animation:none}}

.press{transition:transform 160ms var(--ease-out),background-color 180ms ease,border-color 180ms ease,color 180ms ease;cursor:pointer}
.press:active{transform:scale(0.97)}
@media (hover:hover) and (pointer:fine){
  .track:hover{background-color:rgba(31,42,68,.06)}
  .chip:hover{border-color:var(--cream)}
  .ghost:hover{background-color:rgba(244,238,226,.08)}
}
.noscroll{scrollbar-width:none}.noscroll::-webkit-scrollbar{display:none}

.forest{position:absolute;left:0;right:0;bottom:0;pointer-events:none;
  background:url(assets/forest-navy.webp) center bottom/100% auto no-repeat;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 55%);mask-image:linear-gradient(to bottom,transparent 0%,#000 55%)}

.caps{font-family:'Barlow Semi Condensed',sans-serif;font-weight:600;text-transform:uppercase}
.serif-i{font-family:'Libre Bodoni',serif;font-style:italic}
.display{font-family:'Abril Fatface',serif;font-weight:400}
.ar{font-family:'IBM Plex Sans Arabic',sans-serif}

/* Cover */
.cover{align-items:center;padding:max(40px,env(safe-area-inset-top)) 24px max(28px,env(safe-area-inset-bottom))}
.est{position:relative;display:flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.28em;color:var(--beige)}
.est i{width:28px;height:1px;background:var(--beige)}
.btn-primary{position:relative;width:100%;height:56px;border:0;border-radius:999px;background:var(--cream);color:var(--navy);
  display:flex;align-items:center;justify-content:center;gap:12px;font-weight:700;font-size:16px;letter-spacing:.14em}

/* Top bars */
.bar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;height:60px;padding:max(8px,env(safe-area-inset-top)) 10px 0}
.ghost{height:44px;display:flex;align-items:center;gap:6px;padding:0 14px 0 8px;border:0;border-radius:12px;background:transparent}
.wordmark{display:flex;align-items:center;gap:8px}
.wordmark span{font-family:'Abril Fatface',serif;letter-spacing:.08em;color:var(--cream)}

/* Track list */
.jcard{margin:14px 16px 0;background:var(--cream);color:var(--navy);border-radius:22px;overflow:hidden;display:flex;flex-direction:column;min-height:0}
.jhead{padding:18px 20px 14px;background:var(--navy);border:6px solid var(--cream);border-bottom:0;border-radius:22px 22px 0 0;display:flex;flex-direction:column;gap:10px}
.stripe{height:5px;border-radius:3px}
.tracks{overflow-y:auto;padding:6px 8px 10px;-webkit-overflow-scrolling:touch}
.track{width:100%;min-height:56px;display:flex;align-items:center;gap:14px;padding:8px 12px;border:0;border-bottom:1px dashed rgba(31,42,68,.22);border-radius:12px;background:transparent;text-align:left}
.track:last-child{border-bottom:0}
.track .n{width:26px;font-family:'Barlow Semi Condensed',sans-serif;font-weight:700;font-size:15px;color:var(--tan);font-variant-numeric:tabular-nums}
.track .t{flex:1 1 auto;display:flex;flex-direction:column;gap:1px;min-width:0}
.track .t b{font-weight:600;font-size:18px;line-height:1.2;color:var(--navy)}
.track .t small{font-family:'IBM Plex Sans Arabic',sans-serif;font-size:13px;line-height:1.3;color:var(--ink-3)}
.track .c{font-family:'Barlow Semi Condensed',sans-serif;font-weight:600;font-size:13px;color:var(--ink-3);white-space:nowrap}
.foot{flex:1 1 auto;min-height:130px;position:relative}

/* Section */
.chips{flex:0 0 auto;display:flex;gap:8px;overflow-x:auto;padding:8px 16px 12px}
.chip{flex:0 0 auto;height:44px;padding:0 18px;border-radius:999px;border:1.5px solid rgba(244,238,226,.35);background:transparent;color:var(--cream);font-size:14px;font-weight:600;letter-spacing:.02em;white-space:nowrap}
.chip[aria-current="true"]{background:var(--cream);color:var(--navy);border-color:var(--cream)}
.scroll{flex:1 1 auto;overflow-y:auto;padding:4px 16px 18px;-webkit-overflow-scrolling:touch}
.arch{position:relative;background:var(--beige);color:var(--navy);border-radius:170px 170px 22px 22px;padding:30px 24px 22px;display:flex;flex-direction:column;align-items:center;text-align:center}
.pill{margin-top:12px;display:inline-flex;align-items:center;height:26px;padding:0 12px;border-radius:999px;background:var(--accent);color:var(--cream);font-family:'Barlow Semi Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.2em}
.arch h1{margin:12px 0 0;font-family:'Abril Fatface',serif;font-weight:400;font-size:42px;line-height:1;letter-spacing:.01em}
.rule{margin-top:14px;width:100%;display:flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.2em;color:var(--ink-2)}
.rule i{flex:1 1 auto;height:1px;background:rgba(31,42,68,.35)}
.items{margin-top:14px;background:var(--cream);color:var(--navy);border-radius:22px;padding:6px 20px 10px}
.group{padding:18px 0 6px;font-family:'Barlow Semi Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.22em;color:var(--tan)}
.item{display:flex;align-items:baseline;gap:10px;min-height:48px;padding-top:13px;border-bottom:1px solid rgba(31,42,68,.1)}
.item .nm{font-weight:500;font-size:17px;line-height:1.25}
.item .dots{flex:1 1 auto;min-width:16px;border-bottom:2px dotted rgba(31,42,68,.3);transform:translateY(-4px)}
.item .pr{font-family:'Barlow Semi Condensed',sans-serif;font-weight:700;font-size:19px;font-variant-numeric:tabular-nums}
.egp{margin:14px 0 4px;text-align:center;font-size:11px;letter-spacing:.24em;color:var(--ink-3)}
.nav{margin-top:14px;display:flex;gap:10px}
.nav button{min-width:0;height:56px;border-radius:18px;display:flex;flex-direction:column;justify-content:center;padding:0 16px}
.nav .prev{flex:1 1 0;border:1.5px solid rgba(244,238,226,.4);background:transparent;align-items:flex-start;text-align:left}
.nav .next{flex:1.3 1 0;border:0;background:var(--cream);align-items:flex-end;text-align:right}
.nav small{font-family:'Barlow Semi Condensed',sans-serif;font-size:11px;letter-spacing:.2em}
.nav b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}

/* Thanks */
.thanks{align-items:center;justify-content:center;padding:40px 24px;text-align:center}

/* Ready to order — dock + sheet */
.dock{flex:0 0 auto;position:relative;padding:10px 16px max(12px,env(safe-area-inset-bottom))}
.call{width:100%;height:54px;border:0;border-radius:999px;background:var(--accent);color:var(--cream);display:flex;align-items:center;justify-content:center;gap:10px;font-size:15px;letter-spacing:.16em;box-shadow:0 10px 24px rgba(0,0,0,.28)}
.call.sent{background:rgba(244,238,226,.12);box-shadow:none;border:1.5px solid rgba(244,238,226,.35);letter-spacing:.1em}
.call .dot{width:8px;height:8px;border-radius:50%;background:#7BC48A;animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.sheet{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;justify-content:flex-end}
.sheet[hidden]{display:none}
.scrim{position:absolute;inset:0;background:rgba(10,14,24,.6);animation:fade 220ms ease both}
.panel{position:relative;background:var(--cream);color:var(--navy);border-radius:26px 26px 0 0;padding:10px 22px max(22px,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;text-align:center;animation:panelIn 320ms var(--ease-out) both}
@keyframes panelIn{from{transform:translateY(100%)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.panel{animation:fade 200ms ease both}}
.grab{width:40px;height:5px;border-radius:3px;background:rgba(31,42,68,.2);margin-bottom:6px}
.x{position:absolute;top:10px;right:10px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:var(--ink-3);display:flex;align-items:center;justify-content:center}
.panel h2{margin:12px 0 0;font-family:'Abril Fatface',serif;font-weight:400;font-size:34px;line-height:1.05}
.panel p{margin:8px 0 0;font-size:18px;line-height:1.35;color:var(--ink-2)}
.tlabel{margin-top:22px;font-size:12px;letter-spacing:.24em;color:var(--tan)}
.tinput{margin-top:8px;width:150px;height:84px;border:2px solid rgba(31,42,68,.25);border-radius:20px;background:#fff;color:var(--navy);text-align:center;font-family:'Abril Fatface',serif;font-size:46px;outline:none;transition:border-color 160ms ease}
.tinput:focus{border-color:var(--navy)}
.tinput[aria-invalid="true"]{border-color:var(--accent)}
.msg{min-height:22px;margin-top:10px;font-size:14px;line-height:1.4;color:var(--accent)}
.panel .btn-primary{margin-top:8px;background:var(--navy);color:var(--cream)}
.panel .btn-primary[disabled]{opacity:.55;cursor:default}
.panel .btn-primary[disabled]:active{transform:none}
.sub{margin-top:12px;font-size:13px;letter-spacing:.14em;color:var(--ink-3)}
.linkbtn{margin-top:6px;height:44px;padding:0 16px;border:0;background:transparent;color:var(--navy);font-size:14px;letter-spacing:.14em;text-decoration:underline;text-underline-offset:4px}
/* Service sheet */
.panel{max-height:92%;overflow-y:auto;overscroll-behavior:contain}
.trow{margin-top:16px;display:flex;align-items:center;justify-content:center;gap:14px}
.trow .tlabel{margin:0}
.trow .tinput{margin:0;width:110px;height:64px;font-size:36px}
.tfixed{min-width:72px;height:56px;padding:0 16px;border-radius:16px;background:var(--navy);color:var(--cream);display:inline-flex;align-items:center;justify-content:center;font-family:'Abril Fatface',serif;font-size:32px}
.panel .msg{margin-top:6px}
.olabel{align-self:stretch;margin-top:20px;text-align:left;font-size:12px;letter-spacing:.24em;color:var(--tan)}
.opts{align-self:stretch;margin-top:8px;display:flex;flex-wrap:wrap;gap:8px}
.opt{flex:1 1 0;min-width:96px;height:50px;padding:0 12px;border:1.5px solid rgba(31,42,68,.3);border-radius:14px;background:#fff;color:var(--navy);font-weight:600;font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap}
.opt.done{background:transparent;border-style:dashed;color:var(--ink-3)}
.opt[disabled]:active,.panel .btn-primary[disabled]:active{transform:none}
.fb{margin-top:18px;align-self:stretch;display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:16px;background:var(--beige);color:var(--navy);text-decoration:none;text-align:left}
.fb b{font-size:17px}
.fb span{font-size:14px;line-height:1.35;color:var(--ink-2)}
/* Language */
.lang{position:relative;height:36px;min-width:44px;padding:0 12px;border-radius:999px;border:1.5px solid rgba(244,238,226,.4);background:rgba(20,27,45,.35);color:var(--cream);font-weight:700;font-size:15px;z-index:2}
.lang::before{content:"";position:absolute;inset:-4px}
.is-ar,.is-ar button,.is-ar input{font-family:'IBM Plex Sans Arabic',sans-serif}
.is-ar *{letter-spacing:0!important}
.is-ar .display,.is-ar .serif-i,.is-ar .arch h1,.is-ar .panel h2{font-family:'IBM Plex Sans Arabic',sans-serif;font-style:normal;font-weight:700}
.is-ar .serif-i{font-weight:500}
.is-ar .wm{font-family:'Abril Fatface',serif;font-weight:400}
.is-ar .track,.is-ar .olabel,.is-ar .fb{text-align:start}
.is-ar .pr,.is-ar .n,.is-ar .tinput{font-family:'Barlow Semi Condensed',sans-serif}
.is-ar .tinput{font-family:'Abril Fatface',serif}
.is-ar .x{right:auto;left:10px}
[dir=rtl] .flip{transform:scaleX(-1)}
/* Sequoia Card (account) — uses the same tokens/components as the service sheet */
.acct{position:relative;width:36px;height:36px;padding:0;border-radius:50%;border:1.5px solid rgba(244,238,226,.4);background:rgba(20,27,45,.35);color:var(--cream);display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px;z-index:2}
.acct::before{content:"";position:absolute;inset:-4px}
.lc{font-family:'IBM Plex Sans Arabic',sans-serif}
.lc *{letter-spacing:0!important}
.lc h2{font-family:'IBM Plex Sans Arabic',sans-serif!important;font-weight:700!important;font-size:30px!important}
.lc .x{right:auto;left:10px}
.lc-muted{margin:8px 0 0!important;font-size:16px!important;line-height:1.5;color:var(--ink-3)!important}
.lc-form{align-self:stretch;display:flex;flex-direction:column;align-items:center}
.lc-in{margin-top:8px;width:100%;max-width:300px;height:60px;border:2px solid rgba(31,42,68,.25);border-radius:18px;background:#fff;color:var(--navy);text-align:center;font-family:'Barlow Semi Condensed',sans-serif;font-weight:600;font-size:26px;letter-spacing:.08em!important;outline:none;transition:border-color 160ms ease}
.lc-in:focus{border-color:var(--navy)}
.lc .btn-primary{width:100%;max-width:300px;font-family:'IBM Plex Sans Arabic',sans-serif;letter-spacing:0}
.lc .linkbtn[disabled]{opacity:.55;text-decoration:none}
.lc-entry{margin-top:20px;align-self:stretch;display:flex;align-items:center;gap:14px;padding:14px 16px;border:0;border-radius:18px;background:var(--beige);color:var(--navy);text-align:start}
.lc-entry img{width:30px;height:auto}
.lc-entry-t{flex:1 1 auto;display:flex;flex-direction:column;gap:4px;min-width:0}
.lc-entry-t b{font-size:18px}
.lc-entry-t span{font-size:15px;color:var(--ink-2)}
.lc-bar{align-self:stretch;height:8px;border-radius:4px;background:rgba(31,42,68,.14);overflow:hidden;margin-top:4px}
.lc-bar i{display:block;height:100%;border-radius:4px;background:var(--accent);transition:width 400ms var(--ease-out)}
.lc-stat{margin-top:12px;align-self:stretch;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-radius:16px;border:1.5px dashed rgba(31,42,68,.25);font-size:16px}
.lc-stat b{font-family:'Abril Fatface',serif;font-weight:400;font-size:26px}
.lc-back{position:absolute;top:10px;right:10px;height:44px;display:flex;align-items:center;gap:4px;padding:0 10px;border:0;border-radius:12px;background:transparent;color:var(--navy);font-size:15px;font-weight:600}
.lc-grid{margin-top:18px;align-self:stretch;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.lc-slot{aspect-ratio:1;border-radius:18px;border:2px dashed rgba(31,42,68,.3);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:rgba(31,42,68,.4);font-family:'Abril Fatface',serif;font-size:26px}
.lc-slot.on{border:0;background:var(--navy);color:var(--cream);animation:itemIn 320ms var(--ease-out) both}
.lc-slot small{font-family:'Barlow Semi Condensed',sans-serif;font-weight:600;font-size:13px;color:var(--beige)}
.lc-left{margin:14px 0 0!important;font-size:18px!important;color:var(--navy)!important}
.lc-left b{font-family:'Abril Fatface',serif;font-weight:400;font-size:26px}
.lc-ready{margin-top:16px;align-self:stretch;display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:18px;background:var(--accent);color:var(--cream)}
.lc-ready b{font-size:20px}
.lc-ready span{font-size:16px}
/* Google review invite: shown once after a bill request (same for every guest) */
:root{--gold:#C8A464;--sage:#8FA68A;--grey:#A9AEB8}
.rv{position:absolute;inset:0;z-index:30;display:flex;align-items:flex-end;justify-content:center}
.rv[hidden]{display:none}
.rv-card{position:relative;width:calc(100% - 32px);max-width:440px;margin:0 16px max(16px,env(safe-area-inset-bottom));padding:28px 22px 14px;border-radius:24px;background:var(--navy);color:var(--cream);border:1px solid rgba(200,164,100,.35);box-shadow:0 18px 48px rgba(10,14,24,.35);text-align:center;animation:rvIn 380ms var(--ease-out) both}
@keyframes rvIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rv-card{animation:fade 200ms ease both}}
.rv-leaf{width:46px;height:46px;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:rgba(143,166,138,.16);color:var(--sage)}
.rv h2{margin:14px 0 0;font-size:25px;line-height:1.3;font-weight:700}
.rv p{margin:10px 0 0;font-size:17px;line-height:1.65;color:rgba(244,238,226,.82)}
.rv-go{margin-top:22px;display:flex;align-items:center;justify-content:center;height:56px;border-radius:999px;background:var(--gold);color:var(--navy-deep);font-size:18px;font-weight:700;text-decoration:none}
.rv-go:focus-visible,.rv-later:focus-visible{outline:2px solid var(--cream);outline-offset:3px}
/* Cover page sections (assets/landing.js): the cover stays the first screen; the page scrolls to journal, clubs, social */
:root{--paper:#EFE6D3;--band:#2B3247}
.cvscroll{display:block;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.cvscroll::-webkit-scrollbar{display:none}
.cvscroll > .cover{position:relative;display:flex;flex-direction:column;min-height:100%;padding-bottom:max(14px,env(safe-area-inset-bottom))}
.cvscroll.cvsolo > .cover{padding-bottom:max(28px,env(safe-area-inset-bottom))}
.cvscroll > .cover > *{z-index:2}
.cvscroll > .cover > .forest{z-index:0}
.cvscroll:not(.cvsolo) > .cover::after{content:"";position:absolute;left:0;right:0;bottom:0;height:64px;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(43,50,71,0),var(--band))}
.lmore{position:relative;margin-top:10px;display:flex;flex-direction:column;align-items:center;gap:2px;height:auto;padding:4px 16px;border:0;background:none;color:var(--beige);font-size:12px;letter-spacing:.2em}
.lmore svg{animation:lnudge 2.4s ease-in-out infinite}
@keyframes lnudge{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
.below{position:relative;padding:4px 16px 0;background:linear-gradient(180deg,var(--band) 0,rgba(43,50,71,0) 260px)}
.lsec{padding-top:30px}
.lsh{display:flex;align-items:center;gap:10px;margin:0 4px 14px}
.lsh h2{margin:0;font-size:26px;line-height:1.15;white-space:nowrap}
.is-ar .lsh h2{font-size:23px}
.lsh .rule{flex:1 1 auto;height:1px;background:linear-gradient(90deg,rgba(200,164,100,.65),rgba(200,164,100,0))}
[dir=rtl] .lsh .rule{background:linear-gradient(270deg,rgba(200,164,100,.65),rgba(200,164,100,0))}
.lsh .lbl{font-size:11px;letter-spacing:.24em;color:var(--gold)}
.journal{position:relative;padding:18px;border-radius:22px;color:var(--navy);background:radial-gradient(rgba(107,83,48,.10) 1px,transparent 1.2px) 0 0/7px 7px,var(--paper);box-shadow:inset 0 0 0 1px rgba(107,83,48,.25),0 14px 30px rgba(0,0,0,.25)}
.journal .kicker{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;letter-spacing:.22em;color:var(--tan);padding-bottom:10px;border-bottom:2px solid var(--navy)}
.journal .kicker b{font-family:'Libre Bodoni',serif;font-style:italic;font-weight:500;font-size:14px;letter-spacing:0;text-transform:none;color:var(--navy)}
.jbody{display:flex;gap:16px;margin-top:16px;align-items:flex-start}
.jinfo{flex:1 1 auto;min-width:0;text-align:start}
.jbadge{display:inline-flex;height:24px;align-items:center;padding:0 10px;border-radius:999px;background:var(--navy);color:var(--gold);font-size:12px;font-weight:600;letter-spacing:.06em}
.jinfo h3{margin:10px 0 0;font-family:'Libre Bodoni',serif;font-weight:700;font-size:23px;line-height:1.2;text-wrap:balance}
.is-ar .jinfo h3{font-family:'IBM Plex Sans Arabic',sans-serif}
.jinfo p{margin:8px 0 0;font-size:15px;line-height:1.55;color:var(--ink-2)}
.jmeta{margin-top:8px;font-size:12px;color:var(--tan)}
.jpaper{flex:0 0 124px;position:relative;transform:rotate(-2.5deg);margin-top:6px}
[dir=rtl] .jpaper{transform:rotate(2.5deg)}
.jpaper .pg,.jpaper.img img{border-radius:3px;box-shadow:0 1px 0 rgba(0,0,0,.08),0 10px 22px rgba(31,42,68,.28)}
.jpaper.img img{width:100%;height:auto;background:#FBF6EA}
.jpaper .pg{aspect-ratio:3/4.1;padding:9px 8px;background:#FBF6EA;color:#1A1A1A;overflow:hidden;direction:rtl;font-family:'IBM Plex Sans Arabic',sans-serif;text-align:right}
.jpaper .mh{font-size:15px;font-weight:700;text-align:center;line-height:1.1;border-bottom:1.5px solid #1A1A1A;padding-bottom:4px}
.jpaper .dl{display:flex;justify-content:space-between;font-size:6px;margin-top:3px;color:#555}
.jpaper .hl{margin-top:6px;font-size:9px;font-weight:700;line-height:1.3}
.jpaper .ph{margin-top:5px;height:46px;border-radius:2px;background:url(assets/tree-cream.webp) center/auto 62% no-repeat,radial-gradient(rgba(244,238,226,.16) 1px,transparent 1.3px) 0 0/4px 4px,#3A4054;filter:grayscale(1) sepia(.3)}
.jpaper .ln{margin-top:6px;height:52px;background:repeating-linear-gradient(180deg,#9A968C 0 1.5px,transparent 1.5px 5px);-webkit-mask:linear-gradient(90deg,#000 0 47%,transparent 47% 53%,#000 53%);mask:linear-gradient(90deg,#000 0 47%,transparent 47% 53%,#000 53%)}
.jpaper .tape{position:absolute;top:-8px;left:50%;z-index:1;width:46px;height:16px;margin-left:-23px;background:rgba(218,203,180,.75);transform:rotate(4deg)}
.jread{margin-top:16px;width:100%;height:50px;border:0;border-radius:999px;background:var(--navy);color:var(--cream);display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:700;letter-spacing:.08em}
.clubs{position:relative;padding:22px 20px 20px;border-radius:22px;background:linear-gradient(160deg,rgba(143,166,138,.22),rgba(143,166,138,.08));box-shadow:inset 0 0 0 1px rgba(143,166,138,.38);overflow:hidden;text-align:start}
.cbadge{position:absolute;top:16px;inset-inline-end:16px;height:26px;display:flex;align-items:center;padding:0 12px;border-radius:999px;background:var(--gold);color:var(--navy-deep);font-size:13px;font-weight:700}
.cicons{display:flex;gap:8px;color:var(--sage)}
.cicons span{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(143,166,138,.16)}
.clubs p{margin:14px 0 0;font-size:17px;line-height:1.6;color:rgba(244,238,226,.86)}
.ccards{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;margin:16px -20px 0;padding:0 20px 4px}
.ccard{flex:0 0 220px;scroll-snap-align:start;border-radius:16px;overflow:hidden;background:var(--cream);color:var(--navy)}
.cimg{height:104px;background:url(assets/tree-cream.webp) center/auto 56% no-repeat,radial-gradient(rgba(244,238,226,.14) 1px,transparent 1.3px) 0 0/5px 5px,var(--navy)}
.cimg img{width:100%;height:100%;object-fit:cover}
.cbd{padding:12px 14px 14px}
.cbd b{font-size:17px}
.cbd p{margin:4px 0 0;font-size:14px;line-height:1.5;color:var(--ink-2)}
.cwhen{display:inline-flex;margin-top:10px;height:26px;align-items:center;padding:0 10px;border-radius:999px;background:rgba(143,166,138,.24);color:#3E5A3A;font-size:12px;font-weight:600}
.lsocial{padding-top:40px;text-align:center}
.lsocial .bye{width:84px;height:auto;margin:0 auto 10px}
.lsocial h2{margin:0;font-size:22px;font-weight:700}
.srow{display:flex;justify-content:center;gap:14px;margin-top:16px}
.srow a{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;color:var(--cream);border:1.5px solid rgba(200,164,100,.55);background:rgba(20,27,45,.35);transition:background-color 180ms ease,color 180ms ease,transform 160ms var(--ease-out)}
.srow a:hover{background:var(--gold);color:var(--navy-deep)}
.srow a:focus-visible,.lmore:focus-visible{outline:2px solid var(--focus);outline-offset:3px}
.lfoot{margin:28px -16px 0;padding:18px 16px max(26px,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:6px;border-top:1px solid rgba(244,238,226,.10)}
.lfoot img{width:18px;height:auto;opacity:.8}
.lfoot span{font-size:12px;color:var(--grey)}
.reveal{transition:opacity 520ms ease,transform 620ms var(--ease-out)}
.reveal.pre{opacity:0;transform:translateY(14px)}
@media (prefers-reduced-motion:reduce){.reveal.pre{opacity:1;transform:none}.reveal{transition:none}.lmore svg{animation:none}}
.jview{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;background:var(--navy-deep);color:var(--cream);font-family:'Barlow',sans-serif}
.jview[hidden]{display:none}
.jview.is-ar,.jview.is-ar button{font-family:'IBM Plex Sans Arabic',sans-serif}
.jvbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:max(12px,env(safe-area-inset-top)) 14px 10px}
.jvbar b{display:block;font-size:16px}
.jvbar span{font-size:13px;color:var(--grey)}
.jvx,.jvnav button{width:46px;height:46px;border-radius:50%;border:1.5px solid rgba(244,238,226,.3);background:transparent;color:var(--cream);display:grid;place-items:center}
.jvnav button[disabled]{opacity:.3}
.jvpages{flex:1 1 auto;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.jvpages::-webkit-scrollbar{display:none}
.jvp{flex:0 0 100%;scroll-snap-align:center;display:grid;place-items:center;padding:6px 12px;min-height:0}
.jvp img{max-width:100%;max-height:100%;object-fit:contain;border-radius:3px;background:#FBF6EA;box-shadow:0 20px 50px rgba(0,0,0,.5)}
.jvhint{text-align:center;font-size:12px;color:var(--grey);padding:6px 16px 0}
.jvnav{display:flex;align-items:center;justify-content:center;gap:18px;padding:10px 0 max(16px,env(safe-area-inset-bottom))}
.jvdots{display:flex;gap:6px}
.jvdots i{width:6px;height:6px;border-radius:50%;background:rgba(244,238,226,.3)}
.jvdots i.on{background:var(--gold);width:16px;border-radius:3px}
.rv-later{margin-top:6px;width:100%;height:46px;border:0;background:transparent;color:var(--grey);font:inherit;font-size:15px;text-decoration:underline;text-underline-offset:4px;cursor:pointer}
</style>
</head>
<body>
<main class="app" id="app" aria-live="polite"></main>

<noscript><p style="color:#F4EEE2;text-align:center;padding:24px">Please enable JavaScript to view the menu.</p></noscript>

<script src="assets/config.js"></script>
<script src="assets/landing-data.js"></script>
<script src="assets/landing.js"></script>
<script src="assets/orders.js"></script>
<script src="assets/menu.js"></script>
</body>
</html>
~~~~

## `setup-messagepro.html`

~~~~html
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>Sequoia — ربط واتساب</title>
<link rel="icon" type="image/png" href="assets/tree-navy.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap">
<style>
:root{--navy:#1F2A44;--navy-deep:#141B2D;--beige:#DACBB4;--cream:#F4EEE2;--accent:#B8432F;--ok:#7BC48A;--ease-out:cubic-bezier(0.23,1,0.32,1)}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--navy-deep)}
body{font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;color:var(--cream);background:var(--navy) url(assets/navy-texture-v2.webp) center/cover fixed;
  display:flex;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 16px 32px;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:440px;display:flex;flex-direction:column;gap:14px}
.brand{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:6px}
.brand img{width:26px;height:auto}
.brand b{font-size:15px;letter-spacing:.24em;color:var(--beige)}
h1{margin:0;font-size:26px;line-height:1.25;text-align:center}
p{margin:0;color:var(--beige);line-height:1.6;font-size:15px}
.card{background:rgba(20,27,45,.72);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(244,238,226,.14);border-radius:22px;padding:20px;display:flex;flex-direction:column;gap:14px}
label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:15px}
label small{font-weight:400;color:var(--beige);font-size:13px;line-height:1.5}
input{height:52px;border-radius:14px;border:1.5px solid rgba(244,238,226,.3);background:rgba(244,238,226,.06);color:var(--cream);padding:0 14px;font:16px ui-monospace,SFMono-Regular,Menlo,monospace;direction:ltr;outline:none;transition:border-color 160ms ease}
input:focus{border-color:var(--cream)}
button{height:56px;border:0;border-radius:999px;background:var(--cream);color:var(--navy);font:700 17px 'IBM Plex Sans Arabic',system-ui,sans-serif;cursor:pointer;transition:transform 100ms var(--ease-out),opacity 160ms ease}
button:active{transform:scale(.97)}
button:disabled{opacity:.55;cursor:default}
.msg{min-height:22px;font-size:15px;line-height:1.5}
.msg.err{color:#F2A08E}.msg.ok{color:var(--ok)}
ol{margin:0;padding-inline-start:20px;color:var(--beige);line-height:1.7;font-size:14px}
[hidden]{display:none!important}
@media (prefers-reduced-transparency:reduce){.card{background:var(--navy-deep);backdrop-filter:none;-webkit-backdrop-filter:none}}
@media (prefers-reduced-motion:reduce){button,input{transition:none}}
</style>
</head>
<body>
<main>
  <div class="brand"><img src="assets/tree-cream.webp" alt=""><b>SEQUOIA</b></div>
  <h1>ربط واتساب بـ Message Pro</h1>
  <p>الصفحة دي بتتفتح مرة واحدة بس. اللي هتكتبه بيروح للسيرفر على طول ومحدش بيشوفه.</p>

  <form class="card" id="f" novalidate>
    <label>توكن الـ API
      <small>Message Pro ← Account settings ← Integrations ← Developer API ← Add Access Token</small>
      <input id="token" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" required>
    </label>
    <label>سر الـ Webhook (اختياري)
      <small>Integrations ← Webhooks ← Sequoia Card login. ده اللي بيشغّل الدخول برسالة واتساب.</small>
      <input id="secret" type="password" autocomplete="off" spellcheck="false" autocapitalize="none">
    </label>
    <div class="msg" id="msg" role="alert"></div>
    <button type="submit" id="go">احفظ وشغّل</button>
  </form>

  <section class="card" id="done" hidden>
    <h1>تمام ✓</h1>
    <p id="doneText"></p>
    <ol>
      <li>افتح المنيو واضغط على أيقونة حسابي.</li>
      <li>اكتب رقمك واطلب الكود، هيوصلك على واتساب.</li>
    </ol>
  </section>
</main>
<script src="assets/setup.js"></script>
</body>
</html>
~~~~

## `tools/check-secrets.sh`

~~~~bash
#!/usr/bin/env bash
# Scan tracked files (and archives in the repo) for things that look like secrets.
# Run before every push:  bash tools/check-secrets.sh   (exit 1 = something to look at)
set -u
cd "$(git rev-parse --show-toplevel)"

PATTERN='(mpa_[A-Za-z0-9]{8,}|EAA[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ntfy\.sh/[a-z0-9-]{8,}|(api[_-]?key|access[_-]?token|secret|password|passwd|token)["'"'"' ]*[:=] *["'"'"'][A-Za-z0-9_+/=.-]{8,}["'"'"'])'
ALLOW='(YOUR_ACCESS_TOKEN|example|placeholder|pass-1234|test-secret|dev-hook-secret|hook-secret|process\.env|env\.)'

found=0
hits=$(git ls-files -z | grep -zv -E '\.(png|jpe?g|webp|zip)$' | xargs -0 grep -nIE "$PATTERN" 2>/dev/null | grep -vE "$ALLOW" || true)
if [ -n "$hits" ]; then echo "Possible secrets in tracked files:"; echo "$hits" | cut -c1-200; found=1; fi

for f in $(git ls-files | grep -E '\.env($|\.)|\.pem$|\.key$|\.db$|\.sqlite'); do echo "Sensitive file is tracked: $f"; found=1; done
for z in $(git ls-files '*.zip'); do echo "Archive in repo (not scanned inside, may hold old code or keys): $z"; found=1; done

[ $found = 0 ] && echo "No secrets found." || exit 1
~~~~

## `tools/loyalty-setup.sh`

~~~~bash
#!/usr/bin/env bash
# Installs the Sequoia API (apps/loyalty: card, OTP, table calls, Message Pro webhook) on the Titan server
# and routes https://sequoia.menu.titan22agency.com/api/* to it. Safe to run again: never touches existing data
# or an existing env file.
set -euo pipefail
APP=/opt/titan-apps                 # same checkout as Titan Payroll (auto-updated from main)
DATA=/var/lib/sequoia-loyalty
ENVF=/etc/sequoia-loyalty.env
PORT=3300                           # 3100 = payroll, 3200 = enzo
SITE=/etc/caddy/sites/sequoia.caddy

echo "==> User, data, code"
id sequoia >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin sequoia
mkdir -p "$DATA"; chown sequoia:sequoia "$DATA"; chmod 700 "$DATA"
git -C "$APP" pull --ff-only --quiet

echo "==> Env file (created once; secrets are generated here and never printed)"
if [ ! -f "$ENVF" ]; then
  umask 077
  cat > "$ENVF" <<ENV
NODE_ENV=production
NODE_NO_WARNINGS=1
PORT=${PORT}
LOYALTY_DATA=${DATA}
LOYALTY_SECRET=$(openssl rand -hex 32)
# Old printed QR codes (?table=7) keep working while this is 1. Set 0 after the new signed QRs are on the tables.
TABLE_QR_LEGACY=1
# WhatsApp login code. Set to messagepro and fill the token (Message Pro -> Integrations -> Developer API), then restart.
WHATSAPP_PROVIDER=off
MESSAGEPRO_TOKEN=
MESSAGEPRO_ACCOUNT_ID=129
MESSAGEPRO_INBOX_ID=147
# Login by WhatsApp message (Option B): fill both to enable.
MESSAGEPRO_WEBHOOK_SECRET=
SEQUOIA_WA_NUMBER=
# Captain report sheet (the existing Apps Script). Put the same token in Apps Script (Script property TOKEN) and redeploy the script.
REPORT_SHEET_URL=https://script.google.com/macros/s/AKfycbwbIYBj5PVRZuEDtGFrJ2aZtDKm1ZAXPf_aClYpWcwOt644ufZDRg7mSMiMOKPntrvS7g/exec
REPORT_SHEET_TOKEN=$(openssl rand -hex 24)
ENV
  chmod 600 "$ENVF"
fi

echo "==> Service"
cat > /etc/systemd/system/sequoia-loyalty.service <<UNIT
[Unit]
Description=Sequoia API (card, calls)
After=network.target
[Service]
User=sequoia
EnvironmentFile=${ENVF}
ExecStart=/usr/bin/node ${APP}/apps/loyalty/server.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA}
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now sequoia-loyalty
systemctl restart sequoia-loyalty

echo "==> Restart on new code (the payroll job pulls /opt/titan-apps every 5 minutes)"
cat > /usr/local/bin/sequoia-loyalty-update <<'UPD'
#!/bin/sh
REV=$(git -C /opt/titan-apps rev-parse HEAD) || exit 0
[ "$REV" = "$(cat /var/lib/sequoia-loyalty/.rev 2>/dev/null)" ] && exit 0
systemctl restart sequoia-loyalty && echo "$REV" > /var/lib/sequoia-loyalty/.rev
UPD
chmod +x /usr/local/bin/sequoia-loyalty-update
echo "*/5 * * * * root /usr/local/bin/sequoia-loyalty-update >/dev/null 2>&1" > /etc/cron.d/sequoia-loyalty
cat > /usr/local/bin/sequoia-loyalty-backup <<'BAK'
#!/bin/sh
# daily copy of the card database, one file per weekday (keeps 7)
cd /var/lib/sequoia-loyalty && /usr/bin/node -e "const{DatabaseSync}=require('node:sqlite');const f='backup-'+new Date().toLocaleDateString('en',{weekday:'short'})+'.db';require('fs').rmSync(f,{force:true});new DatabaseSync('loyalty.db').exec(\"VACUUM INTO '\"+f+\"'\")"
BAK
chmod +x /usr/local/bin/sequoia-loyalty-backup
echo "30 3 * * * sequoia /usr/local/bin/sequoia-loyalty-backup >/dev/null 2>&1" > /etc/cron.d/sequoia-loyalty-backup

echo "==> Web: /api/* -> :${PORT}, security headers, caching"
cp "$SITE" "$SITE.bak.$(date +%s)"
cat > "$SITE" <<CADDY
sequoia.menu.titan22agency.com {
	handle /api/* {
		reverse_proxy 127.0.0.1:${PORT} {
			flush_interval -1
		}
	}
	handle {
		root * /srv/sites/sequoia
		@hidden path /.git* /tools/* /apps/* /*.zip /.claude/*
		respond @hidden 404
		file_server
		encode zstd gzip
		@img path *.webp *.png *.jpg
		header @img Cache-Control "public, max-age=604800, stale-while-revalidate=86400"
		@other not path *.webp *.png *.jpg
		header @other Cache-Control "no-cache"
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "same-origin"
		X-Frame-Options "DENY"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
		Cross-Origin-Opener-Policy "same-origin"
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
		-Server
	}
}
CADDY
caddy validate --config /etc/caddy/Caddyfile >/dev/null
systemctl reload caddy

echo "==> Done. Create captain logins with:"
echo "    set -a; . ${ENVF}; set +a; sudo -E -u sequoia node ${APP}/apps/loyalty/server.js set-staff <username> captain \"<name>\""
~~~~

## `tools/payroll-setup.sh`

~~~~bash
#!/usr/bin/env bash
# Installs Titan Payroll on the Titan server at https://payroll.titan22agency.com
# Safe to run again: it updates the app and never touches existing data.
set -euo pipefail
DOMAIN="titan22agency.com"
HOST="payroll.${DOMAIN}"
REPO="https://github.com/titan21agency/Sequoia-Menu.git"
APP=/opt/titan-apps
DATA=/var/lib/titan-payroll
BACKUPS=/var/backups/titan-payroll

echo "==> Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> App code"
id payroll >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin payroll
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only --quiet; else git clone --depth 1 --quiet "$REPO" "$APP"; fi
mkdir -p "$DATA" "$BACKUPS"; chown payroll:payroll "$DATA" "$BACKUPS"; chmod 700 "$DATA" "$BACKUPS"

echo "==> Service"
cat > /etc/systemd/system/titan-payroll.service <<UNIT
[Unit]
Description=Titan Payroll
After=network.target
[Service]
User=payroll
Environment=PAYROLL_DATA=${DATA} PORT=3100 NODE_NO_WARNINGS=1
ExecStart=/usr/bin/node ${APP}/apps/payroll/server.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA}
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now titan-payroll
systemctl restart titan-payroll

echo "==> Auto-update every 5 minutes + daily backup at 3am (keeps 30 days)"
cat > /usr/local/bin/titan-payroll-update <<'UPD'
#!/bin/sh
cd /opt/titan-apps || exit 0
OLD=$(git rev-parse HEAD); git pull --ff-only --quiet || exit 0
[ "$OLD" != "$(git rev-parse HEAD)" ] && systemctl restart titan-payroll
exit 0
UPD
chmod +x /usr/local/bin/titan-payroll-update
cat > /etc/cron.d/titan-payroll <<CRON
*/5 * * * * root /usr/local/bin/titan-payroll-update >/dev/null 2>&1
0 3 * * * payroll PAYROLL_DATA=${DATA} NODE_NO_WARNINGS=1 /usr/bin/node ${APP}/apps/payroll/server.js backup ${BACKUPS} >/dev/null 2>&1
CRON

echo "==> Web address"
CF=/etc/caddy/Caddyfile
sed -i 's#@hidden path /.git\* /tools/\* /\*.zip#@hidden path /.git* /tools/* /apps/* /*.zip#' "$CF"
if ! grep -q "^${HOST}" "$CF"; then
  cat >> "$CF" <<CADDY

${HOST} {
	reverse_proxy 127.0.0.1:3100
	encode gzip
	header Strict-Transport-Security "max-age=31536000"
}
CADDY
fi
caddy validate --config "$CF" >/dev/null
systemctl reload caddy

echo "==> Admin account"
sleep 2
if [ ! -f "$DATA/.admin-created" ]; then
  sudo -u payroll PAYROLL_DATA="$DATA" NODE_NO_WARNINGS=1 node "$APP/apps/payroll/server.js" set-user faris admin "Faris"
  touch "$DATA/.admin-created"; chown payroll:payroll "$DATA/.admin-created"
  echo "    ^ Save this password now. Change it after you log in (الإعدادات)."
else
  echo "    Admin already exists."
fi

echo
echo "==> Done."
echo "    https://${HOST}"
~~~~

## `tools/report-sheet.gs`

~~~~javascript
/**
 * Sequoia — report sheet for the captain screen.
 * Every request the captain marks as done is added as a row in "Log".
 * "Daily" summarises each business day (starting 6 AM).
 *
 * Setup: a standalone Apps Script project → paste this → run setup() once →
 * Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → copy the /exec URL.
 * Then set Script property TOKEN to a long random value, and on the server set REPORT_SHEET_URL (the /exec URL)
 * and REPORT_SHEET_TOKEN (same value). The browser never sees either; captain rows go through /api/staff/report.
 */
var SHEET_ID = '1pgqQNBRRLBSHdvkM8scMMk0Q4mMi79cFb3LR7CexjGY';
var HEADERS = ['business_day', 'table', 'kind', 'detail', 'requested', 'handled', 'wait_seconds', 'rid'];

function setup() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var log = ss.getSheetByName('Log') || ss.insertSheet('Log');
  if (log.getLastRow() === 0) log.appendRow(HEADERS);
  log.setFrozenRows(1);
  var daily = ss.getSheetByName('Daily') || ss.insertSheet('Daily');
  daily.clear();
  daily.getRange('A1').setFormula(
    '=QUERY(Log!A:G,"select A, count(B), avg(G), max(G) where A is not null group by A order by A desc ' +
    'label A \'day\', count(B) \'requests\', avg(G) \'avg wait (s)\', max(G) \'max wait (s)\'",1)');
  daily.getRange('F1').setFormula('=QUERY(Log!A:C,"select A, count(B) where A is not null group by A order by A desc pivot C",1)');
}

function businessDay_(d) {
  var x = new Date(d.getTime() - 6 * 3600 * 1000); // before 6 AM counts as the previous day
  return Utilities.formatDate(x, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    // Only our server knows the token (Project settings → Script properties → TOKEN = same value as REPORT_SHEET_TOKEN).
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || data.token !== token) return ContentService.createTextOutput('forbidden');
    var rows = (data.rows || []).slice(0, 200);
    var log = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Log');
    var seen = {};
    var last = log.getLastRow();
    if (last > 1) log.getRange(2, 8, last - 1, 1).getValues().forEach(function (r) { seen[r[0]] = 1; });
    var out = [];
    rows.forEach(function (r) {
      if (!r || !r.rid || seen[r.rid]) return;
      var req = new Date(r.requested), done = new Date(r.handled);
      if (isNaN(req) || isNaN(done)) return;
      out.push([businessDay_(req), String(r.table).slice(0, 4), String(r.kind).slice(0, 10), String(r.detail || '').slice(0, 20),
                req, done, Math.max(0, Math.round(+r.wait_seconds || 0)), String(r.rid).slice(0, 40)]);
      seen[r.rid] = 1;
    });
    if (out.length) log.getRange(log.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}
~~~~

## `tools/server-setup.sh`

~~~~bash
#!/usr/bin/env bash
# Titan server setup — run once as root on a fresh Ubuntu 24.04 droplet:
#   curl -fsSL https://raw.githubusercontent.com/titan21agency/Sequoia-Menu/main/tools/server-setup.sh | bash
#
# What it does:
#  - security updates on, firewall (SSH + web only), fail2ban against password guessing
#  - Caddy web server with automatic HTTPS certificates
#  - titan22agency.com / www      -> agency site placeholder (/srv/sites/agency)
#  - sequoia.menu.titan22agency.com -> Sequoia menu, pulled from GitHub every 5 minutes
set -euo pipefail

DOMAIN="titan22agency.com"
REPO="https://github.com/titan21agency/Sequoia-Menu.git"

echo "==> System updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw fail2ban unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https gnupg
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

echo "==> Caddy web server"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> Sites"
mkdir -p /srv/sites/agency
if [ ! -f /srv/sites/agency/index.html ]; then
  cat > /srv/sites/agency/index.html <<'HTML'
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Titan Agency</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#eee;font:20px system-ui,sans-serif}</style></head>
<body><main><h1>Titan Agency</h1><p>Coming soon.</p></main></body></html>
HTML
fi

if [ ! -d /srv/sites/sequoia/.git ]; then
  git clone --depth 1 "$REPO" /srv/sites/sequoia
else
  git -C /srv/sites/sequoia pull --ff-only
fi
chown -R caddy:caddy /srv/sites

cat > /etc/cron.d/sequoia-pull <<'CRON'
*/5 * * * * caddy git -C /srv/sites/sequoia pull --ff-only --quiet >/dev/null 2>&1
CRON

cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN}, www.${DOMAIN} {
	root * /srv/sites/agency
	file_server
	encode gzip
}

sequoia.menu.${DOMAIN} {
	# Sequoia API (apps/loyalty/server.js on :3200): card, OTP, table calls, Message Pro webhook.
	# flush_interval -1 keeps the live (SSE) streams unbuffered.
	handle /api/* {
		reverse_proxy 127.0.0.1:3200 {
			flush_interval -1
		}
	}
	handle {
		root * /srv/sites/sequoia
		@hidden path /.git* /tools/* /apps/* /*.zip /.claude/*
		respond @hidden 404
		file_server
		encode zstd gzip
		# images are cached for a week (rename the file when it changes); pages/scripts always revalidate
		@img path *.webp *.png *.jpg
		header @img Cache-Control "public, max-age=604800, stale-while-revalidate=86400"
		@other not path *.webp *.png *.jpg
		header @other Cache-Control "no-cache"
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "same-origin"
		X-Frame-Options "DENY"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
		Cross-Origin-Opener-Policy "same-origin"

		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
		-Server
	}
}
CADDY

caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo
echo "==> Done."
echo "    https://${DOMAIN}"
echo "    https://sequoia.menu.${DOMAIN}"
~~~~

## `tools/trace-tree.py`

~~~~python
"""Trace assets/tree-cream.png into a smooth SVG path (pure Python + Pillow, no other deps).
Usage: python tools/trace-tree.py  -> prints the path "d" (viewBox 0 0 355 502)
"""
import math
from PIL import Image

SRC = 'assets/tree-cream.png'
UP = 4  # trace at 4x for smoother edges

im = Image.open(SRC).convert('RGBA')
W0, H0 = im.size
a = im.getchannel('A').resize((W0 * UP, H0 * UP), Image.LANCZOS)
W, H = a.size
px = a.load()
inside = lambda x, y: 0 <= x < W and 0 <= y < H and px[x, y] >= 128

# Moore-neighbour boundary trace of the single outer shape
start = next((x, y) for y in range(H) for x in range(W) if inside(x, y) and inside(x, y + 1) and inside(x + 1, y + 1))
dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]  # clockwise (y down)
pts, cur, s0 = [start], start, 6  # nothing above the start pixel: begin searching from north
while True:
    for i in range(8):
        d = (s0 + i) % 8
        nx, ny = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
        if inside(nx, ny):
            cur, s0 = (nx, ny), (d + 6) % 8  # next search starts two steps counter-clockwise
            break
    else:
        break
    if cur == start or len(pts) > 200000:
        break
    pts.append(cur)

# light smoothing of pixel stairs, then Ramer-Douglas-Peucker
n = len(pts)
sm = [(sum(pts[(i + k) % n][0] for k in range(-3, 4)) / 7, sum(pts[(i + k) % n][1] for k in range(-3, 4)) / 7) for i in range(n)]

def rdp(p, eps):
    if len(p) < 3:
        return p
    (x1, y1), (x2, y2) = p[0], p[-1]
    L = math.hypot(x2 - x1, y2 - y1) or 1e-9
    i, dmax = 0, 0
    for k in range(1, len(p) - 1):
        d = abs((x2 - x1) * (y1 - p[k][1]) - (x1 - p[k][0]) * (y2 - y1)) / L
        if d > dmax:
            i, dmax = k, d
    if dmax > eps:
        return rdp(p[:i + 1], eps)[:-1] + rdp(p[i:], eps)
    return [p[0], p[-1]]

far = max(range(n), key=lambda i: (sm[i][0] - sm[0][0]) ** 2 + (sm[i][1] - sm[0][1]) ** 2)  # closed loop: split in two
poly = rdp(sm[:far + 1], 1.6)[:-1] + rdp(sm[far:] + [sm[0]], 1.6)[:-1]

def angle(a, b, c):
    v1 = (a[0] - b[0], a[1] - b[1]); v2 = (c[0] - b[0], c[1] - b[1])
    l = (math.hypot(*v1) * math.hypot(*v2)) or 1e-9
    return math.degrees(math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / l))))

# quadratic curves through edge midpoints; sharp vertices (< 110 deg) stay as corners
m = len(poly)
f = lambda v: f'{v / UP:.2f}'.rstrip('0').rstrip('.')
mid = lambda p, q: ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
out = []
first = mid(poly[-1], poly[0])
out.append(f'M{f(first[0])} {f(first[1])}')
for i in range(m):
    prev, p, nxt = poly[i - 1], poly[i], poly[(i + 1) % m]
    e = mid(p, nxt)
    if angle(prev, p, nxt) < 110:
        out.append(f'L{f(p[0])} {f(p[1])}L{f(e[0])} {f(e[1])}')
    else:
        out.append(f'Q{f(p[0])} {f(p[1])} {f(e[0])} {f(e[1])}')
out.append('Z')
print(f'<!-- {W0}x{H0}, {m} vertices -->')
print(''.join(out))
~~~~

## `tools/repair-server.sh` (branch ccr-a6173082-fso01r, not on main)

~~~~bash
#!/usr/bin/env bash
# Repairs the Titan server after another site's setup broke Sequoia / payroll.
# Gives every site its own config file in /etc/caddy/sites/, so updating one
# site can never erase or break another. Safe to run again.
#   curl -fsSL https://raw.githubusercontent.com/titan21agency/Sequoia-Menu/main/tools/repair-server.sh | sudo bash
set -euo pipefail
DOMAIN="titan22agency.com"
REPO="https://github.com/titan21agency/Sequoia-Menu.git"
CF=/etc/caddy/Caddyfile
SITES=/etc/caddy/sites
BK="$CF.bak-$(date +%Y%m%d-%H%M%S)"

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }
command -v caddy >/dev/null || { echo "Caddy is not installed — run tools/server-setup.sh instead."; exit 1; }

echo "==> Backup: $BK"
mkdir -p "$SITES"
touch "$CF"; cp "$CF" "$BK"
SBK="$SITES.bak-$(date +%Y%m%d-%H%M%S)"; cp -a "$SITES" "$SBK"
NEW="$CF.new"
# Until the new config is validated, any failure puts the site files back.
# The live Caddyfile is only replaced after validation succeeds.
restore() { echo "!! Failed — restoring site files; $CF was not changed."; rm -rf "$SITES"; cp -a "$SBK" "$SITES"; rm -f "$NEW"; }
trap restore ERR

# git refuses to work as root in a folder owned by caddy ("dubious ownership"),
# so run every git command as the caddy user.
g() { runuser -u caddy -- git "$@"; }

echo "==> Moving Sequoia / payroll out of the main Caddyfile (other sites untouched)"
awk '
  depth==0 && /\{/ && $0 ~ /^[[:space:]]*(https?:\/\/)?(sequoia\.menu\.|payroll\.)/ { skip=1 }
  depth==0 && /^[[:space:]]*import[[:space:]]+\/etc\/caddy\/sites/ { next }
  { o=gsub(/\{/,"{"); c=gsub(/\}/,"}"); if(!skip) print; depth+=o-c; if(depth<=0){depth=0; skip=0} }
' "$BK" > "$NEW"
printf '\n# Each site lives in its own file here\nimport %s/*.caddy\n' "$SITES" >> "$NEW"

echo "==> Sequoia menu files"
if [ ! -d /srv/sites/sequoia/.git ]; then
  if [ -d /srv/sites/sequoia ] && [ -n "$(ls -A /srv/sites/sequoia)" ]; then
    mv /srv/sites/sequoia "/srv/sites/sequoia.old-$(date +%Y%m%d-%H%M%S)"
  fi
  install -d -o caddy -g caddy /srv/sites/sequoia
  g clone --depth 1 --quiet "$REPO" /srv/sites/sequoia
else
  chown -R caddy:caddy /srv/sites/sequoia
  if [ -n "$(g -C /srv/sites/sequoia status --porcelain)" ]; then
    echo "!! /srv/sites/sequoia has local changes — leaving the menu files as they are."
  else
    g -C /srv/sites/sequoia fetch --quiet origin main && g -C /srv/sites/sequoia reset --hard --quiet origin/main
  fi
fi
chown -R caddy:caddy /srv/sites/sequoia
echo '*/5 * * * * caddy git -C /srv/sites/sequoia pull --ff-only --quiet >/dev/null 2>&1' > /etc/cron.d/sequoia-pull

cat > "$SITES/sequoia.caddy" <<CADDY
sequoia.menu.${DOMAIN} {
	root * /srv/sites/sequoia
	@hidden path /.git* /tools/* /apps/* /*.zip
	respond @hidden 404
	file_server
	encode gzip
	header Cache-Control "no-cache"
}
CADDY

if systemctl list-unit-files titan-payroll.service >/dev/null 2>&1 && [ -f /etc/systemd/system/titan-payroll.service ]; then
  echo "==> Payroll"
  cat > "$SITES/payroll.caddy" <<CADDY
payroll.${DOMAIN} {
	reverse_proxy 127.0.0.1:3100
	encode gzip
	header Strict-Transport-Security "max-age=31536000"
}
CADDY
  systemctl restart titan-payroll || true
fi

echo "==> Checking config"
if ! caddy validate --config "$NEW" --adapter caddyfile; then
  restore; exit 1
fi
trap - ERR
mv "$NEW" "$CF"
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy
sleep 3

echo "==> Status"
for h in "sequoia.menu.${DOMAIN}" "payroll.${DOMAIN}"; do
  [ "$h" = "payroll.${DOMAIN}" ] && [ ! -f "$SITES/payroll.caddy" ] && continue
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$h/" || true)
  echo "    https://$h -> $code"
done
echo "    Caddy: $(systemctl is-active caddy)"
echo
echo "Done. Site files: ls $SITES   |   Backup of old config: $BK"
echo "Tip: give Enzo (and any new site) its own file in $SITES too."
~~~~
