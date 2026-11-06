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
| Images | 427 KB (PNG/JPG) | 70 KB (WebP at display size) |
| Our bytes (HTML + images, uncompressed HTML) | ~472 KB | ~117 KB |

What changed: prepared-statement cache (SQL was compiled on every request), `synchronous=NORMAL` + `busy_timeout` (safe with WAL; was an fsync per write), `stamps(customer_id, created_at)` index, WebP images sized to how they are shown (originals kept; the favicon stays PNG), Caddy `zstd gzip` and one-week caching for images. `/api/me` p95 moved within run-to-run noise. `/staff/tables` still runs ~4 queries per seated customer; fine at café scale, batch it if tables get slow.

In production Caddy should proxy `/api/*` on the menu domain to `127.0.0.1:3200` (same origin, so cookies stay first-party).
