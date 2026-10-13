#!/bin/sh
# Siirtymätesti (docs/JEDI_SIIRTO.md) omassa verkkonimiavaruudessa ja muistirajan sisällä:
# vanha versio (sivu ja palvelin) → uusi, Nokia (vanha palvelin) → Jedi (rengassolmu).
#
#   systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=0 \
#     unshare -rn sh tools/ns-migration.sh TYÖHAKEMISTO VANHA_WEB VANHA_PALVELIN UUSI_PALVELIN
#
# VANHA_WEB on vanhan version poc1/web (esim. git worktree commitista 056e67d),
# palvelimet käännettyinä (go build). Työhakemisto tyhjennetään.
set -u
W=$1; OLDWEB=$2; OLDSRV=$3; NEWSRV=$4
POC=$(cd "$(dirname "$0")/.." && pwd)
# Siivous aina: selaimet (kaikki aliprosessit profiilihakemiston perusteella), palvelimet ja HTTP.
cleanup() {
  pkill -f -- "--user-data-dir=$W/prof" 2>/dev/null
  for f in http nokia jedi; do [ -f "$W/$f.pid" ] && kill -CONT $(cat "$W/$f.pid") 2>/dev/null && kill $(cat "$W/$f.pid") 2>/dev/null; done
  kill $(jobs -p) 2>/dev/null
}
trap cleanup EXIT INT TERM
ip link set lo up; ip link add d0 type dummy; ip link set d0 up
ip -6 addr add fd00:c0de::1/64 dev d0 nodad
ip -6 route add default dev d0
rm -rf "$W"; mkdir -p "$W/prof"

# Ei välimuistia: muuten selain voi yhdistää vanhan ja uuden version moduuleja.
serve() {
  python3 -c '
import functools, http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
http.server.ThreadingHTTPServer(("127.0.0.1", 8090), functools.partial(H, directory=sys.argv[1])).serve_forever()
' "$1" > "$W/http.log" 2>&1 &
  echo $! > "$W/http.pid"
}
for p in 9301 9302 9303; do
  chromium --headless=new --no-sandbox --remote-debugging-port=$p --user-data-dir="$W/prof/$p" \
    --disable-features=WebRtcHideLocalIpsWithMdns --disable-gpu --renderer-process-limit=2 about:blank > "$W/chr$p.log" 2>&1 &
done

# Vaihe 1: vanha sivu ja vanha palvelin.
serve "$OLDWEB"
"$OLDSRV" -port 40123 -name Nokia -page http://localhost:8090/direct.html -dir "$W/nokia" > "$W/nokia1.log" 2>&1 & echo $! > "$W/nokia.pid"
sleep 4
LINK=$(grep -A1 "^Liitä palvelin" "$W/nokia1.log" | tail -1)
cd "$POC/tools"
timeout 200 node --experimental-websocket drive-migration.mjs --phase=old http://localhost:8090/direct.html "$LINK" 9301 9302 9303 ||
  { echo "vanha vaihe epäonnistui"; exit 1; }

# Päivitys: uusi sivu samaan osoitteeseen, Nokia uudella ohjelmalla samalla tilalla, Jedi uutena.
kill $(cat "$W/http.pid") $(cat "$W/nokia.pid"); sleep 1
serve "$POC/web"
"$NEWSRV" -port 40123 -name Nokia -dir "$W/nokia" > "$W/nokia2.log" 2>&1 & echo $! > "$W/nokia.pid"
cat > "$W/jedi.sh" <<EOS
#!/bin/sh
[ -f $W/jedi.pid ] && kill \$(cat $W/jedi.pid) 2>/dev/null && sleep 1
$NEWSRV -port 40124 -name Jedi -page http://localhost:8090/direct.html -dir $W/jedi >> $W/jedi.log 2>&1 &
echo \$! > $W/jedi.pid
EOS
sh "$W/jedi.sh"; sleep 4
JLINK=$(grep -A1 "^Liitä palvelin" "$W/jedi.log" | tail -1)
NOKIA_STOP="kill -STOP $(cat "$W/nokia.pid")" NOKIA_CONT="kill -CONT $(cat "$W/nokia.pid")" JEDI_RESTART="sh $W/jedi.sh" \
JEDI_READDR="ip -6 addr add fd00:c0de::7/64 dev d0 nodad" JEDI_LOG="$W/jedi.log" \
  timeout 600 node --experimental-websocket drive-migration.mjs --phase=new http://localhost:8090/direct.html "$JLINK" 9301 9302 9303
echo "exit $?"
