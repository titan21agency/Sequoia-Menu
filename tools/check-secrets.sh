#!/usr/bin/env bash
# Scan tracked files (and archives in the repo) for things that look like secrets.
# Run before every push:  bash tools/check-secrets.sh   (exit 1 = something to look at)
set -u
cd "$(git rev-parse --show-toplevel)"

PATTERN='(mpa_[A-Za-z0-9]{8,}|EAA[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ntfy\.sh/[a-z0-9-]{8,}|(api[_-]?key|access[_-]?token|secret|password|passwd|token)["'"'"' ]*[:=] *["'"'"'][A-Za-z0-9_+/=.-]{8,}["'"'"'])'
ALLOW='(YOUR_ACCESS_TOKEN|example|placeholder|pass-1234|test-secret|dev-hook-secret|hook-secret|process\.env|env\.)'

found=0
hits=$(git ls-files -z | grep -zv -E '\.(png|jpe?g|webp|zip)$' | xargs -0 grep -nIE "$PATTERN" 2>/dev/null | grep -vE "$ALLOW" || true)
if [ -n "$hits" ]; then echo "Possible secrets in tracked files:"; echo "$hits" | cut -c1-200; found=1; fi

for f in $(git ls-files | grep -E '\.env($|\.)|\.pem$|\.key$|\.db$|\.sqlite'); do echo "Sensitive file is tracked: $f"; found=1; done
for z in $(git ls-files '*.zip'); do echo "Archive in repo (not scanned inside, may hold old code or keys): $z"; found=1; done

[ $found = 0 ] && echo "No secrets found." || exit 1
