#!/bin/sh
# Julkaisee renkaan GitHub Pagesiin (haara gh-pages, IPv4+IPv6):
# https://pereuna.github.io/certiratio/direct.html
# Käyttö: poc1/tools/publish-pages.sh (repon juuresta tai mistä tahansa sen alta)
set -eu
top=$(git rev-parse --show-toplevel)
web="$top/poc1/web"
rev=$(git -C "$top" rev-parse --short HEAD)
tmp=$(mktemp -d)
trap 'git -C "$top" worktree remove --force "$tmp" 2>/dev/null || true; rm -rf "$tmp"' EXIT

if git -C "$top" ls-remote --exit-code --heads origin gh-pages >/dev/null; then
	git -C "$top" fetch -q origin gh-pages
	git -C "$top" worktree add -q --detach "$tmp" FETCH_HEAD
else
	git -C "$top" worktree add -q --detach "$tmp"
	git -C "$tmp" checkout -q --orphan gh-pages
fi
git -C "$tmp" rm -rqf --ignore-unmatch . >/dev/null
mkdir -p "$tmp/src/vendor" "$tmp/icons"
cp "$web/direct.html" "$web/palvelin.html" "$web/direct.webmanifest" "$tmp/"
cp "$web/icons/ring-192.png" "$web/icons/ring-512.png" "$tmp/icons/"
cp "$web/src/direct.js" "$web/src/stream.js" "$web/src/dm.js" \
	"$web/src/pairing.js" "$web/src/signaling.js" "$web/src/classify.js" "$web/src/ring.js" "$web/src/scanner.js" \
	"$web/src/identity.js" "$web/src/store.js" "$web/src/servercard.js" "$tmp/src/"
cp "$web/src/vendor/qrcode.js" "$web/src/vendor/jsQR.js" "$web/src/vendor/jsQR.LICENSE.txt" "$tmp/src/vendor/"
# Moduulien osoitteisiin versio: Pages pitää tiedostoja välimuistissa 10 min, eikä
# selain saa yhdistää vanhan ja uuden version moduuleja (uusi tuonti puuttuisi).
ver=$(git -C "$web" rev-parse --short HEAD)
sed -i "s#from '\./\([a-z]*\)\.js'#from './\1.js?v=$ver'#g" "$tmp"/src/*.js
sed -i "s#src=\"src/direct\.js\"#src=\"src/direct.js?v=$ver\"#" "$tmp/direct.html"
: > "$tmp/.nojekyll"
cat > "$tmp/index.html" <<'EOF'
<!doctype html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=direct.html">
<title>Certiratio rengas</title>
<a href="direct.html">Certiratio rengas</a>
EOF
git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then
	echo "gh-pages: ei muutoksia"
	exit 0
fi
git -C "$tmp" commit -qm "Rengas poc1/web:stä ($rev)"
git -C "$tmp" push -q origin HEAD:gh-pages
echo "gh-pages: julkaistu $rev"
