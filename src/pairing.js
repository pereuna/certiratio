// Palvelimeton parinmuodostus (direct.html): WebRTC-tarjous ja -vastaus
// tiiviinä merkkijonona, joka mahtuu QR-koodiin ja linkkiin.
//
// Mukana vain se, mitä yhteys tarvitsee: ICE-tunnus ja -salasana, DTLS-
// sormenjälki (sha-256), mid ja IPv6-osoitteet portteineen. Vastaanottaja
// kokoaa niistä SDP:n. Ei STUN- eikä signalointipalvelinta.
//
//   2.o.RENGAS.VASEN.OIKEA.UFRAG.PWD.FP.MID.ADDR_PORT,…   kutsu väliin VASEN → OIKEA
//   2.a.RENGAS.UFRAG.PWD.FP.MID.ADDR_PORT,…               vastaus
//   2.c.RENGAS.JÄSEN.HAASTE                               toisen naapurin vahvistus
//
// RENGAS on renkaan tunniste (8 heksaa), VASEN/OIKEA/JÄSEN jäsenten tunnisteita.
// ICE-merkit ovat [A-Za-z0-9+/], joten erottimet . , _ ovat turvallisia.

import { candidateAddr, v6Scope } from './stream.js';

const ICE_CHARS = /^[A-Za-z0-9+/]+$/;
const HEX8 = /^[0-9a-f]{8}$/;
const NONCE = /^[0-9a-f]{12}$/;

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Kelpaako osoite parin muodostukseen: IPv6, ei link-local (fe80::). */
export function pairable(address) {
  const scope = v6Scope(address);
  return scope === 'global' || scope === 'ula';
}

/**
 * SDP → tiivis merkkijono. `type` 'offer' tai 'answer'. Kandidaatit luetaan
 * SDP:stä ja `extra`sta (onicecandidate-rivit). `meta`: { ring, left, right }
 * (left/right vain tarjoukseen). Heittää, jos IPv6-osoitteita ei ole.
 */
export function encodePairing(type, sdp, extra = [], meta = {}) {
  const { ring, left, right } = meta;
  if (!HEX8.test(ring ?? '')) throw new Error('renkaan tunniste puuttuu');
  if (type === 'offer' && !(HEX8.test(left ?? '') && HEX8.test(right ?? ''))) throw new Error('kutsun väli puuttuu');
  const lines = sdp.split(/\r?\n/);
  const get = (key) => lines.find((l) => l.startsWith(`a=${key}:`))?.slice(key.length + 3).trim();
  const ufrag = get('ice-ufrag');
  const pwd = get('ice-pwd');
  const mid = get('mid') ?? '0';
  const fp = get('fingerprint');
  if (!ufrag || !pwd || !ICE_CHARS.test(ufrag) || !ICE_CHARS.test(pwd)) throw new Error('ICE-tunnukset puuttuvat');
  if (!fp?.toLowerCase().startsWith('sha-256 ')) throw new Error('sha-256-sormenjälki puuttuu');
  const fpBytes = fp.slice(8).trim().split(':').map((h) => parseInt(h, 16));
  if (fpBytes.length !== 32 || fpBytes.some((b) => !(b >= 0 && b <= 255))) throw new Error('virheellinen sormenjälki');
  if (!/^[A-Za-z0-9]+$/.test(mid)) throw new Error('virheellinen mid');

  const cands = [];
  for (const l of [...lines.filter((x) => x.startsWith('a=candidate:')), ...extra]) {
    const f = l.replace(/^a=/, '').trim().split(/\s+/);
    if (f.length < 8 || f[2].toLowerCase() !== 'udp') continue;
    const addr = candidateAddr(l);
    const key = `${addr}_${f[5]}`;
    if (pairable(addr) && /^\d+$/.test(f[5]) && !cands.includes(key)) cands.push(key);
  }
  if (!cands.length) throw new Error('ei IPv6-osoitetta');
  const head = type === 'offer' ? ['2', 'o', ring, left, right] : ['2', 'a', ring];
  return [...head, ufrag, pwd, b64url(fpBytes), mid, cands.join(',')].join('.');
}

/** Tiivis merkkijono → { type, sdp, ring, left, right, … }. Heittää, jos merkkijono on rikki. */
export function decodePairing(token) {
  const f = String(token).trim().split('.');
  if (f[0] === '1') throw new Error('vanha koodi – päivitä sivu molemmissa puhelimissa');
  const t = f[1];
  if (f[0] !== '2' || !(t === 'o' && f.length === 10) && !(t === 'a' && f.length === 8)) throw new Error('tuntematon koodi');
  const ring = f[2];
  const [left, right] = t === 'o' ? [f[3], f[4]] : [null, null];
  if (!HEX8.test(ring) || (t === 'o' && !(HEX8.test(left) && HEX8.test(right)))) throw new Error('rikkinäinen koodi');
  const [ufrag, pwd, fp64, mid, list] = f.slice(t === 'o' ? 5 : 3);
  if (!ICE_CHARS.test(ufrag) || !ICE_CHARS.test(pwd) || !/^[A-Za-z0-9]+$/.test(mid)) throw new Error('rikkinäinen koodi');
  const fp = [...unb64url(fp64)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
  if (fp.length !== 32 * 3 - 1) throw new Error('rikkinäinen sormenjälki');
  const cands = list.split(',').map((c) => {
    const i = c.lastIndexOf('_');
    const addr = c.slice(0, i);
    const port = Number(c.slice(i + 1));
    if (!pairable(addr) || !(port > 0 && port < 65536)) throw new Error('rikkinäinen osoite');
    return { addr, port };
  });
  const type = t === 'o' ? 'offer' : 'answer';
  const sdp = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    `a=group:BUNDLE ${mid}`,
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...cands.map((c, i) => `a=candidate:${i + 1} 1 udp ${2122262783 - i} ${c.addr} ${c.port} typ host`),
    'a=end-of-candidates',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${type === 'offer' ? 'actpass' : 'active'}`,
    `a=mid:${mid}`,
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    '',
  ].join('\r\n');
  return { type, sdp, ufrag, candidates: cands, ring, left, right };
}

/** Toisen naapurin vahvistuskoodi: liittyjä skannaa sen ja lähettää haasteen takaisin verkon kautta. */
export function encodeVouch(ring, member, nonce) {
  if (!HEX8.test(ring) || !HEX8.test(member) || !NONCE.test(nonce)) throw new Error('virheellinen vahvistus');
  return ['2', 'c', ring, member, nonce].join('.');
}

export function decodeVouch(token) {
  const f = String(token).trim().split('.');
  if (f.length !== 5 || f[0] !== '2' || f[1] !== 'c' || !HEX8.test(f[2]) || !HEX8.test(f[3]) || !NONCE.test(f[4])) {
    throw new Error('tuntematon koodi');
  }
  return { type: 'vouch', ring: f[2], member: f[3], nonce: f[4] };
}

/** Mikä tahansa koodi (kamera, linkki) → { type: 'offer'|'answer'|'vouch', … }. */
export function decodeAny(token) {
  let s = String(token).trim();
  if (s.includes('#')) s = decodeURIComponent(s.slice(s.indexOf('#') + 1));
  return s.startsWith('2.c.') ? decodeVouch(s) : decodePairing(s);
}
