// Launchpadin puhtaat apufunktiot: syötetyn tekstin erotus, rtcsignal-nimi,
// IPv6-kandidaattisuodatin ja kirjoittajan sävy.

import { ipFamily } from './classify.js?v=c882abf';

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

/**
 * IPv6-osoitteen laajuus: 'global' (2000::/3, julkinen), 'ula' (fc00::/7),
 * 'link-local' (fe80::/10), 'other'; ei-IPv6 → null.
 */
export function v6Scope(address) {
  if (ipFamily(address) !== 6) return null;
  const a = address.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const first = a.startsWith('::') ? 0 : parseInt(a.split(':')[0], 16);
  if (first >= 0x2000 && first <= 0x3fff) return 'global';
  if ((first & 0xfe00) === 0xfc00) return 'ula';
  if ((first & 0xffc0) === 0xfe80) return 'link-local';
  return 'other';
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

/**
 * Kirjoittajan sävy: arvotaan joka liittymisellä ja kulkee merkkien mukana,
 * joten kaikki näkevät saman sävyn mutta nimeä ei näy (arvaa kuka kirjoittaa).
 * h värikulma, s kylläisyys %, d vaaleuden poikkeama tekstin perusvaaleudesta %.
 */
export function randomTint(rand = Math.random) {
  return { h: Math.floor(rand() * 360), s: 30 + Math.floor(rand() * 35), d: Math.floor(rand() * 13) - 6 };
}

/** Vertaisen lähettämä sävy sallituille väleille; kelvoton → null. */
export function clampTint(t) {
  if (!t || typeof t !== 'object') return null;
  const n = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
  const h = n(t.h, 0, 359), s = n(t.s, 30, 64), d = n(t.d, -6, 6);
  return h === null || s === null || d === null ? null : { h, s, d };
}
