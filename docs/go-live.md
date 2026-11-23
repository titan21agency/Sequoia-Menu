# Go-live checklist: security, speed, wording, menu admin

Two merges, each followed by one script run on the server. About 30 minutes. Do it outside café hours.
Commands run on the droplet as root (`ssh root@<droplet-ip>`). Tick each box before going on.

Why the order matters: a merge into `main` goes live by itself within 5 minutes (the menu site and the API pull `main`), but the
web server settings (security headers, caching, hidden folders) and the menu import only change when `loyalty-setup.sh` runs.

## 0. Before you start

- [ ] DigitalOcean → Droplets → your droplet → **Snapshots → Take live snapshot**. Name it `before-menu-admin`. This is the full undo button.
- [ ] Make a fresh copy of the card database (today's `backup-<weekday>.db` gets a new time):
  ```bash
  sudo -u sequoia /usr/local/bin/sequoia-loyalty-backup; ls -la /var/lib/sequoia-loyalty/backup-*.db
  ```
- [ ] Note who has an `admin` login today: they become **owner** after step 2.
  ```bash
  sudo -u sequoia node -e "const{DatabaseSync}=require('node:sqlite');console.table(new DatabaseSync('/var/lib/sequoia-loyalty/loyalty.db',{readOnly:true}).prepare('SELECT username,role,active FROM staff').all())"
  ```

## 1. Security batch

- [ ] On GitHub, open and merge the PR for **`fix/security-batch-1`**:
  https://github.com/titan21agency/Sequoia-Menu/pull/new/fix/security-batch-1
- [ ] On the server:
  ```bash
  bash /opt/titan-apps/tools/loyalty-setup.sh
  sudo -u caddy git -C /srv/sites/sequoia pull --ff-only
  ```
  (The script pulls the API code itself; the second line updates the menu site now instead of waiting up to 5 minutes.)
- [ ] Checks. Each should print what is shown after `→`:
  ```bash
  curl -sI https://sequoia.menu.titan22agency.com/ | grep -o "font-src 'self'"          # → font-src 'self'
  systemctl is-active sequoia-loyalty                                                      # → active
  sudo -u sequoia /usr/local/bin/sequoia-loyalty-backup; cat /var/lib/sequoia-loyalty/backup-status   # → … ok
  bash /opt/titan-apps/tools/backup-check.sh | tail -1                                     # → PASS: ...
  ```
- [ ] Go straight on to step 2: the audit report in `docs/` is only hidden on the site after step 2.
- [ ] Open the menu on your phone from a table QR. Tap **Ready to order**: the captain screen rings.

## 2. Everything else (one merge)

`feature/menu-admin` already contains the security batch, the two dock buttons, the song request, both speed batches, the
wording/button system and the menu admin.

- [ ] Merge the PR for **`feature/menu-admin`**:
  https://github.com/titan21agency/Sequoia-Menu/pull/new/feature/menu-admin
- [ ] On the server:
  ```bash
  bash /opt/titan-apps/tools/loyalty-setup.sh
  sudo -u caddy git -C /srv/sites/sequoia pull --ff-only
  ```
  The script output must include `Imported 9 sections, … items, and published them.`
- [ ] Checks:
  ```bash
  ls /var/lib/sequoia-loyalty/loyalty.db.before-roles.db                                  # → the file exists (copy from before the role change)
  curl -s -o /dev/null -w "%{http_code}\n" https://sequoia.menu.titan22agency.com/docs/  # → 404
  curl -s -o /dev/null -w "%{http_code}\n" https://sequoia.menu.titan22agency.com/assets/fonts/barlow-400-latin.woff2  # → 200
  curl -s https://sequoia.menu.titan22agency.com/api/menu | head -c 120; echo            # → {"v":"1.0","at":…,"sections":[…
  journalctl -u sequoia-loyalty -n 20 --no-pager | grep -i error                          # → nothing
  sudo -u sequoia node -e "const{DatabaseSync}=require('node:sqlite');console.table(new DatabaseSync('/var/lib/sequoia-loyalty/loyalty.db',{readOnly:true}).prepare('SELECT username,role FROM staff').all())"
  ```
  The last command: old `admin` logins now show `owner`, captains stay `captain`.

## 3. Try it like staff and guests

Admin page: https://sequoia.menu.titan22agency.com/admin-q7n2xk4p.html

- [ ] Log in as the owner. Tabs: المنيو · سجل التعديلات · الموظفين.
- [ ] Mark one item **خلص**. On a guest phone with the menu open, it turns grey with "Sold out" within 30 seconds. Mark it **متاح** again.
- [ ] Change one price → bar shows "1 تعديل في المسودة". The guest phone still shows the old price. Tap **معاينة**: the preview shows the new price.
  Tap **إلغاء التعديلات** (or **انشر المنيو** if the price is right).
- [ ] **الموظفين → ضيف موظف**: add each captain and manager. Send each their password yourself; it is shown once.
- [ ] Log in once as a captain: only the خلص / متاح switches show.
- [ ] Guest phone, iPhone and Android, English and Arabic:
  - cover shows, "More from Sequoia" scrolls down, song card is the last section before the social links
  - menu sections switch without reloading
  - **Ready to order** calls at once; **Other requests** opens bill + quick requests
  - turn on airplane mode after the first visit and reopen the menu: it still opens

## If something goes wrong

| Problem | Fix |
|---|---|
| Menu site broken after a merge | GitHub → the merged PR → **Revert** → merge the revert PR. Live again in 5 minutes. |
| Fonts look plain (system fonts) | Step 1's script did not run: `bash /opt/titan-apps/tools/loyalty-setup.sh` |
| API won't start | `journalctl -u sequoia-loyalty -n 50 --no-pager`; send me the last lines. |
| Staff logins wrong after the role change | `systemctl stop sequoia-loyalty`, `cp /var/lib/sequoia-loyalty/loyalty.db.before-roles.db /var/lib/sequoia-loyalty/loyalty.db`, revert the PR, `systemctl start sequoia-loyalty` |
| Locked out of the admin page | wait 15 minutes, or make a new password: `set -a; . /etc/sequoia-loyalty.env; set +a; sudo -E -u sequoia node /opt/titan-apps/apps/loyalty/server.js set-staff <username> owner "<name>"` |
| Everything | DigitalOcean → Snapshots → `before-menu-admin` → Restore |

## After go-live

- [ ] Close the older PRs if you opened them (`feature/dock-split-song-request`, `perf/batch-1`, `perf/lcp`, `ui/wording`): all their work is in `feature/menu-admin`.
- [ ] **Table QR codes (most important open security item)**: print signed QRs, put them on the tables, then turn off the old unsigned ones:
  ```bash
  set -a; . /etc/sequoia-loyalty.env; set +a; sudo -E -u sequoia node /opt/titan-apps/apps/loyalty/server.js table-links https://sequoia.menu.titan22agency.com/ 1 30
  sed -i 's/^TABLE_QR_LEGACY=1/TABLE_QR_LEGACY=0/' /etc/sequoia-loyalty.env && systemctl restart sequoia-loyalty
  ```
  Run the `sed` line only after the new QRs are on every table: old stickers stop working.
- [ ] DigitalOcean → droplet → **Backups → Enable** (copies outside the droplet; paid).
