#!/bin/sh
# Rengassolmun tilan varmuuskopio (avain, varmenne, rekisteri); säilytetään 30 viimeisintä.
# Kopiot sisältävät solmun yksityisen avaimen: hakemisto vain rootille, ja kopio myös koneen ulkopuolelle.
#   certiratio-ring-backup [TILA] [KOHDE]
# Oletukset: OpenBSD /var/certiratio-ring, systemd (DynamicUser) /var/lib/private/certiratio-ring.
set -eu
SRC=${1:-}
if [ -z "$SRC" ]; then
  if [ -d /var/certiratio-ring ]; then SRC=/var/certiratio-ring; else SRC=/var/lib/private/certiratio-ring; fi
fi
DST=${2:-/var/backups/certiratio-ring}
umask 077
mkdir -p "$DST"
chmod 700 "$DST"
tar -czf "$DST/ring-$(date -u +%Y%m%dT%H%M%SZ).tgz" -C "$SRC" .
ls -1t "$DST"/ring-*.tgz | tail -n +31 | while read -r old; do rm -f -- "$old"; done
