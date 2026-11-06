# Sequoia Card (loyalty) — prototype

Node 22+, no npm dependencies (same approach as `apps/payroll`). SQLite file in `$LOYALTY_DATA`.

| File | What |
|---|---|
| `config.js` | Business rules (stamps required, reward name, cooldown hours, expiry) |
| `rules.js` | Pure card logic + phone normalisation/masking |
| `otp.js` | `sendOtp(phone, code)` — dev stub (logs on server) or WhatsApp Cloud API |
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
| `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` | for real WhatsApp | Meta WhatsApp Cloud API + an approved authentication template with the code as `{{1}}` |

In production Caddy should proxy `/api/*` on the menu domain to `127.0.0.1:3200` (same origin, so cookies stay first-party).
