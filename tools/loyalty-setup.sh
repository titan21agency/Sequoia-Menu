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
# This script lives in the checkout it updates. After pulling, start again from the new copy,
# so a run never mixes old and new lines of this file.
if [ -z "${SEQUOIA_SETUP_FRESH:-}" ]; then
  git -C "$APP" pull --ff-only --quiet
  SEQUOIA_SETUP_FRESH=1 exec bash "$APP/tools/loyalty-setup.sh" "$@"
fi

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
sleep 3   # let the restarted API finish its one-time database upgrade before the import opens the database
echo "==> Menu in the database (first run only: copies the built-in menu and publishes it; later runs change nothing)"
( set -a; . "$ENVF"; set +a; sudo -E -u sequoia node "$APP/apps/loyalty/server.js" menu-import )

echo "==> Restart on new code (the payroll job pulls /opt/titan-apps every 5 minutes)"
cat > /usr/local/bin/sequoia-loyalty-update <<'UPD'
#!/bin/sh
REV=$(git -C /opt/titan-apps rev-parse HEAD) || exit 0
[ "$REV" = "$(cat /var/lib/sequoia-loyalty/.rev 2>/dev/null)" ] && exit 0
systemctl restart sequoia-loyalty && echo "$REV" > /var/lib/sequoia-loyalty/.rev
UPD
chmod 755 /usr/local/bin/sequoia-loyalty-update
echo "*/5 * * * * root /usr/local/bin/sequoia-loyalty-update >/dev/null 2>&1" > /etc/cron.d/sequoia-loyalty
cat > /usr/local/bin/sequoia-loyalty-backup <<'BAK'
#!/bin/sh
# daily copy of the card database, one file per weekday (keeps 7)
cd /var/lib/sequoia-loyalty && /usr/bin/node -e "const{DatabaseSync}=require('node:sqlite');const f='backup-'+new Date().toLocaleDateString('en',{weekday:'short'})+'.db';require('fs').rmSync(f,{force:true});new DatabaseSync('loyalty.db').exec(\"VACUUM INTO '\"+f+\"'\");const v=Object.values(new DatabaseSync(f,{readOnly:true}).prepare('PRAGMA integrity_check').get())[0];require('fs').writeFileSync('backup-status',new Date().toISOString()+' '+f+' '+v+'\n');if(v!=='ok')process.exit(1)" \
  || logger -t sequoia-backup "backup FAILED, see /var/lib/sequoia-loyalty/backup-status"
BAK
chmod 755 /usr/local/bin/sequoia-loyalty-backup   # readable by the sequoia user (cron runs it as sequoia); +x alone kept it root-only under umask 077
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
		@hidden path /.git* /tools/* /apps/* /docs/* /*.zip /.claude/*
		respond @hidden 404
		file_server
		encode zstd gzip
		@img path *.webp *.png *.jpg *.woff2
		header @img Cache-Control "public, max-age=604800, stale-while-revalidate=86400"
		@other not path *.webp *.png *.jpg *.woff2
		header @other Cache-Control "no-cache"
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "same-origin"
		X-Frame-Options "DENY"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
		Cross-Origin-Opener-Policy "same-origin"
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
		-Server
	}
}
CADDY
caddy validate --config /etc/caddy/Caddyfile >/dev/null
systemctl reload caddy

echo "==> Done. Create logins with (role: owner, manager or captain; old 'admin' logins are now owners):"
echo "    set -a; . ${ENVF}; set +a; sudo -E -u sequoia node ${APP}/apps/loyalty/server.js set-staff <username> <role> \"<name>\""
echo "    The owner can then add and manage staff from the admin page."
