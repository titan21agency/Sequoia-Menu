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
		# 'unsafe-inline' for scripts stays until the inline <script> blocks in index.html / captain page move to files.
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
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
