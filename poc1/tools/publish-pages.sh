#!/bin/sh
# Julkaisee launchpadin GitHub Pagesiin (haara gh-pages, IPv4+IPv6):
# https://pereuna.github.io/certiratio/launchpad.html
# Sivu signaloi jediin (wss://jedi.ydns.eu:8443/), joten IPv4-käyttäjä näkee
# puukalikkavaroituksen eikä selaimen virhesivua.
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
git -C "$tmp" rm -rq --ignore-unmatch . >/dev/null
mkdir -p "$tmp/src"
cp "$web/launchpad.html" "$tmp/"
cp "$web/src/launchpad.js" "$web/src/stream.js" "$web/src/signaling.js" "$web/src/classify.js" "$tmp/src/"
: > "$tmp/.nojekyll"
cat > "$tmp/index.html" <<'EOF'
<!doctype html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=launchpad.html">
<title>IPv6 launchpad</title>
<a href="launchpad.html">IPv6 launchpad</a>
EOF
git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then
	echo "gh-pages: ei muutoksia"
	exit 0
fi
git -C "$tmp" commit -qm "Launchpad poc1/web:stä ($rev)"
git -C "$tmp" push -q origin HEAD:gh-pages
echo "gh-pages: julkaistu $rev"
