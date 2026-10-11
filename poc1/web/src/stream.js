// Launchpadin puhtaat apufunktiot: syötetyn tekstin erotus, rtcsignal-nimi,
// IPv6-kandidaattisuodatin ja kirjoittajan väri.

import { ipFamily } from './classify.js';

/**
 * Teksti, jonka syöttökentän muutos prev → next lisäsi. Pyyhkimistä ei
 * palauteta (sanottua ei saa takaisin); keskelle lisätty tai automaattisen
 * korjauksen vaihtama sana palautetaan sellaisenaan.
 */
export function appended(prev, next) {
  let pre = 0;
  while (pre < prev.length && pre < next.length && prev[pre] === next[pre]) pre++;
  let suf = 0;
  while (suf < prev.length - pre && suf < next.length - pre &&
         prev[prev.length - 1 - suf] === next[next.length - 1 - suf]) suf++;
  return next.slice(pre, next.length - suf);
}

/** Nimimerkki rtcsignalin nimeksi: [a-z0-9-], 1–32 merkkiä (pääte mahtuu perään). */
export function rtcName(nick) {
  const s = nick.toLowerCase()
    .replace(/[äåá]/g, 'a').replace(/[öó]/g, 'o').replace(/[é]/g, 'e')
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 24).replace(/-$/, '');
  return s || 'vertainen';
}

/** ICE-kandidaattirivin osoite ("candidate:… udp PRIO ADDR PORT typ …"). */
export function candidateAddr(line) {
  const f = line.replace(/^a=/, '').trim().split(/\s+/);
  return f.length >= 8 && f[0].startsWith('candidate:') ? f[4] : null;
}

/**
 * Vain IPv6: IPv4- ja mDNS-kandidaatit (*.local) hylätään. Tyhjä rivi on
 * kandidaattien loppumerkki ja kelpaa.
 */
export function keepCandidate(line) {
  if (!line) return true;
  return ipFamily(candidateAddr(line)) === 6;
}

/** SDP:stä poistetaan muut kuin IPv6-kandidaattirivit. Palauttaa { sdp, dropped }. */
export function filterSdp(sdp) {
  let dropped = 0;
  const lines = sdp.split('\r\n').filter((l) => {
    if (!l.startsWith('a=candidate:') || keepCandidate(l)) return true;
    dropped++;
    return false;
  });
  return { sdp: lines.join('\r\n'), dropped };
}

/** Kirjoittajan väri nimen tiivisteestä (sama nimi, sama väri kaikilla). */
export function hueFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h % 360;
}
