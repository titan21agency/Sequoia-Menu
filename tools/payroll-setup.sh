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
mkdir -p /etc/caddy/sites
grep -q '^import /etc/caddy/sites/' "$CF" || printf '\nimport /etc/caddy/sites/*.caddy\n' >> "$CF"
if ! grep -q "^${HOST}" "$CF"; then
  cat > /etc/caddy/sites/payroll.caddy <<CADDY
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
