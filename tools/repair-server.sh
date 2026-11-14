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
