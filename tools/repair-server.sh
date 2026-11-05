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

echo "==> Moving Sequoia / payroll out of the main Caddyfile (other sites untouched)"
awk '
  depth==0 && /\{/ && $0 ~ /^[[:space:]]*(https?:\/\/)?(sequoia\.menu\.|payroll\.)/ { skip=1 }
  depth==0 && /^[[:space:]]*import[[:space:]]+\/etc\/caddy\/sites/ { next }
  { o=gsub(/\{/,"{"); c=gsub(/\}/,"}"); if(!skip) print; depth+=o-c; if(depth<=0){depth=0; skip=0} }
' "$BK" > "$CF.tmp"
printf '\n# Each site lives in its own file here\nimport %s/*.caddy\n' "$SITES" >> "$CF.tmp"
mv "$CF.tmp" "$CF"

echo "==> Sequoia menu files"
if [ ! -d /srv/sites/sequoia/.git ]; then
  rm -rf /srv/sites/sequoia; git clone --depth 1 --quiet "$REPO" /srv/sites/sequoia
else
  git -C /srv/sites/sequoia fetch --quiet origin main && git -C /srv/sites/sequoia reset --hard --quiet origin/main
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
if ! caddy validate --config "$CF" --adapter caddyfile; then
  echo "!! Config invalid — restoring the backup, nothing changed."
  cp "$BK" "$CF"; exit 1
fi
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
