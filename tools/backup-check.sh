#!/usr/bin/env bash
# Restore test for the Sequoia card database. Run on the droplet as root:
#   bash /opt/titan-apps/tools/backup-check.sh
# Copies the newest backup to a temp folder, opens it the way the API would, runs SQLite's
# integrity check and compares row counts with the live database. Changes nothing.
set -euo pipefail
DATA=${LOYALTY_DATA:-/var/lib/sequoia-loyalty}
NEWEST=$(ls -t "$DATA"/backup-*.db 2>/dev/null | head -1 || true)
[ -n "$NEWEST" ] || { echo "FAIL: no backup-*.db in $DATA"; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cp "$NEWEST" "$TMP/restore.db"
echo "Backup: $NEWEST ($(du -h "$NEWEST" | cut -f1), $(date -r "$NEWEST" '+%F %H:%M'))"
NODE_NO_WARNINGS=1 node - "$TMP/restore.db" "$DATA/loyalty.db" <<'JS'
const { DatabaseSync } = require('node:sqlite');
const [, , restored, live] = process.argv;
let r, verdict;
try {
  r = new DatabaseSync(restored, { readOnly: true });
  verdict = Object.values(r.prepare('PRAGMA integrity_check').get())[0];
} catch (e) { console.log('FAIL: backup cannot be opened (' + e.message + ')'); process.exit(1); }
const count = (db, t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const l = new DatabaseSync(live, { readOnly: true });
let bad = verdict !== 'ok';
console.log('Integrity:', verdict);
for (const t of ['customers', 'staff', 'stamps', 'rewards', 'audit_log']) {
  const a = count(r, t), b = count(l, t);
  // the backup is up to a day old: it may have fewer rows than live, never more
  if (a > b) bad = true;
  console.log(`${t.padEnd(10)} backup ${String(a).padStart(6)}   live ${String(b).padStart(6)}`);
}
console.log(bad ? 'FAIL: backup is damaged or does not match' : 'PASS: backup restores and reads correctly');
process.exit(bad ? 1 : 0);
JS
