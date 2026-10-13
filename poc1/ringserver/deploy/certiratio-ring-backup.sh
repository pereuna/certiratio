#!/bin/sh
# Rengassolmun tilan varmuuskopio (avain, varmenne, rekisteri); säilytetään 30 viimeisintä.
# Kopiot sisältävät solmun yksityisen avaimen: hakemisto vain rootille, ja kopio myös koneen ulkopuolelle.
set -eu
SRC=/var/lib/private/certiratio-ring
DST=/var/backups/certiratio-ring
install -d -m 700 "$DST"
tar -czf "$DST/ring-$(date -u +%Y%m%dT%H%M%SZ).tgz" -C "$SRC" .
ls -1t "$DST"/ring-*.tgz | tail -n +31 | xargs -r rm --
