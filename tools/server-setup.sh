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
	root * /srv/sites/sequoia
	@hidden path /.git* /tools/* /*.zip
	respond @hidden 404
	file_server
	encode gzip
	header Cache-Control "no-cache"
}
CADDY

caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo
echo "==> Done."
echo "    https://${DOMAIN}"
echo "    https://sequoia.menu.${DOMAIN}"
