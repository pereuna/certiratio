// Rengaspalvelimen kortti (docs/KOHTAAMISPUHELIN.md): yhteys palvelimeen ilman
// signalointia. Palvelin (poc1/ringserver) on ICE-lite kiinteässä UDP-portissa,
// ja selain kokoaa sen vastauksen kortista:
//
//   s1.SORMENJÄLKI.PORTTI.OSOITE,OSOITE…     (sormenjälki sha-256, base64url)
//
// ICE-tunnus on selaimen oma tunnus U ja salasana pwdOf(U), samoin kuin
// palvelimella. Selain on DTLS-asiakas ja tarkistaa palvelimen sormenjäljen
// kortista, joten väärä palvelin ei kelpaa.

import { pairable } from './pairing.js';

const B64URL = /^[A-Za-z0-9_-]{43}$/;

/** Palvelimen ICE-salasana selaimen tunnuksesta (sama kuin ringserver/main.go). */
export function pwdOf(ufrag) {
  return `certiratio-${ufrag}`.padEnd(24, '-');
}

export function decodeCard(token) {
  let s = String(token).trim();
  if (s.includes('#')) s = decodeURIComponent(s.slice(s.indexOf('#') + 1));
  const f = s.split('.');
  if (f.length !== 4 || f[0] !== 's1' || !B64URL.test(f[1])) throw new Error('tuntematon kortti');
  const port = Number(f[2]);
  if (!(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('virheellinen portti');
  const addrs = f[3].split(',').filter(Boolean);
  if (!addrs.length || !addrs.every(pairable)) throw new Error('kortissa ei ole kelvollista IPv6-osoitetta');
  const bin = atob(f[1].replace(/-/g, '+').replace(/_/g, '/'));
  const fp = [...bin].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(':');
  return { fp, port, addrs };
}

/** Palvelimen vastaus kortista: `ufrag` ja `mid` selaimen omasta tarjouksesta. */
export function cardAnswer(card, ufrag, mid = '0') {
  return [
    'v=0',
    'o=- 1 1 IN IP6 ::1',
    's=-',
    't=0 0',
    'a=ice-lite',
    `a=group:BUNDLE ${mid}`,
    'a=msid-semantic: WMS',
    `m=application ${card.port} UDP/DTLS/SCTP webrtc-datachannel`,
    `c=IN IP6 ${card.addrs[0]}`,
    ...card.addrs.map((a, i) => `a=candidate:${i + 1} 1 udp ${2122262783 - i} ${a} ${card.port} typ host`),
    'a=end-of-candidates',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwdOf(ufrag)}`,
    `a=fingerprint:sha-256 ${card.fp}`,
    'a=setup:passive',
    `a=mid:${mid}`,
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    '',
  ].join('\r\n');
}

/** Yhteys palvelimeen kortilla. Palauttaa { pc, ch }; kanava aukeaa, kun DTLS ja SCTP ovat valmiit. */
export async function connectCard(card, label = 'direct') {
  const pc = new RTCPeerConnection();
  const ch = pc.createDataChannel(label, { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  const sdp = pc.localDescription.sdp;
  const ufrag = /^a=ice-ufrag:(\S+)/m.exec(sdp)?.[1];
  const mid = /^a=mid:(\S+)/m.exec(sdp)?.[1] ?? '0';
  if (!ufrag) throw new Error('oma ICE-tunnus puuttuu');
  await pc.setRemoteDescription({ type: 'answer', sdp: cardAnswer(card, ufrag, mid) });
  return { pc, ch };
}
