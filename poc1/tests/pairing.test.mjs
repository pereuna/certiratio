import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { decodeAny, decodePairing, decodeVouch, encodePairing, encodeVouch, pairable } from '../web/src/pairing.js';

// Selaimessa tavallinen <script> (globaali qrcode); poc1 on ESM-paketti, joten ladataan vm:llä.
const qrcode = runInNewContext(`${readFileSync(new URL('../web/src/vendor/qrcode.js', import.meta.url), 'utf8')};qrcode`, {});

const FP = 'sha-256 3A:9F:0C:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:01:02:03:04:05:06:07:08:09:0A:0B:0C:0D';
const OFFER = [
  'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
  'a=extmap-allow-mixed', 'a=msid-semantic: WMS', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2122262783 2001:999:2500:215e:e009:97ff:fe7d:80c5 50123 typ host generation 0',
  'a=candidate:2 1 udp 2122194687 10.204.108.119 50124 typ host generation 0',
  'a=candidate:3 1 udp 2122129151 fe80::62:73ff:fe25:4d75 50125 typ host generation 0',
  'a=candidate:4 1 udp 2122129151 0f1e2d3c-aaaa-bbbb-cccc-1234567890ab.local 50126 typ host',
  'a=candidate:5 1 tcp 1518283007 2001:999:2500:215e:e009:97ff:fe7d:80c5 9 typ host tcptype active',
  'a=ice-ufrag:Ab+c', 'a=ice-pwd:0123456789abcdef/GHIJKL+m', 'a=ice-options:trickle', `a=fingerprint:${FP}`,
  'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', '',
].join('\r\n');
const RING = '0badc0de';
const META = { ring: RING, left: '11111111', right: '22222222' };

test('encodePairing: vain IPv6 (ei IPv4, link-local, mDNS, TCP)', () => {
  const extra = ['candidate:9 1 udp 2122262783 2a00:1450:4001::9 40000 typ host generation 0'];
  const t = encodePairing('offer', OFFER, extra, META);
  assert.equal(t, '2.o.0badc0de.11111111.22222222.Ab+c.0123456789abcdef/GHIJKL+m.Op8MESIzRFVmd4iZqrvM3e7_AAECAwQFBgcICQoLDA0.0.' +
    '2001:999:2500:215e:e009:97ff:fe7d:80c5_50123,2a00:1450:4001::9_40000');
  assert.throws(() => encodePairing('offer', OFFER.replace(/a=candidate:1 .*\r\n/, ''), [], META), /ei IPv6/);
  assert.throws(() => encodePairing('offer', OFFER, [], { ring: RING }), /väli/);
  assert.throws(() => encodePairing('answer', OFFER), /renkaan/);
});

test('decodePairing: SDP takaisin, sormenjälki ja setup oikein', () => {
  const o = decodePairing(encodePairing('offer', OFFER, [], META));
  assert.equal(o.type, 'offer');
  assert.deepEqual([o.ring, o.left, o.right], [RING, '11111111', '22222222']);
  assert.match(o.sdp, /a=fingerprint:sha-256 3A:9F:0C:11:.*:0C:0D\r\n/);
  assert.match(o.sdp, /a=setup:actpass\r\n/);
  assert.match(o.sdp, /a=candidate:1 1 udp \d+ 2001:999:2500:215e:e009:97ff:fe7d:80c5 50123 typ host\r\n/);
  assert.match(o.sdp, /a=ice-ufrag:Ab\+c\r\na=ice-pwd:0123456789abcdef\/GHIJKL\+m\r\n/);
  const a = decodePairing(encodePairing('answer', OFFER.replace('a=setup:actpass', 'a=setup:active'), [], { ring: RING }));
  assert.equal(a.type, 'answer');
  assert.equal(a.ring, RING);
  assert.match(a.sdp, /a=setup:active\r\n/);
});

test('decodePairing: rikkinäiset koodit hylätään', () => {
  for (const bad of ['', 'x', '2.o.a.b.c.0.d', '2.a.0badc0de.a b.c.AAAA.0.2001::1_1', '2.o.0badc0de.Ab.cd.AAAA.0.2001:999::1_5']) {
    assert.throws(() => decodePairing(bad));
  }
  assert.throws(() => decodePairing('1.o.Ab.cd.AAAA.0.2001:999::1_5'), /vanha koodi/);
  const good = encodePairing('offer', OFFER, [], META);
  assert.throws(() => decodePairing(good.replace('0badc0de', 'XYZ')));
  assert.throws(() => decodePairing(good.replace('_50123', '_99999')));
  assert.throws(() => decodePairing(good.replace('2001:999:2500', '10.1.2')));
});

test('pairable: julkinen ja ULA kelpaavat, link-local ja IPv4 eivät', () => {
  assert.equal(pairable('2001:999::1'), true);
  assert.equal(pairable('fd00::1'), true);
  assert.equal(pairable('fe80::1'), false);
  assert.equal(pairable('10.0.0.1'), false);
});

test('QR: linkki kahdella osoitteella mahtuu pieneen koodiin', () => {
  const url = `https://pereuna.github.io/certiratio/direct.html#${encodePairing('offer', OFFER,
    ['candidate:9 1 udp 2122262783 2a00:1450:4001:829::200e 40000 typ host'], META)}`;
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  assert.ok(qr.getModuleCount() <= 61, `koko ${qr.getModuleCount()}`); // versio ≤ 11
});

test('vahvistuskoodi: 2.c.RENGAS.JÄSEN.HAASTE, myös linkkinä', () => {
  const t = encodeVouch(RING, '22222222', '0123456789ab');
  assert.equal(t, '2.c.0badc0de.22222222.0123456789ab');
  assert.deepEqual(decodeVouch(t), { type: 'vouch', ring: RING, member: '22222222', nonce: '0123456789ab' });
  assert.equal(decodeAny(`https://x.example/direct.html#${t}`).nonce, '0123456789ab');
  assert.equal(decodeAny(encodePairing('answer', OFFER, [], { ring: RING })).type, 'answer');
  assert.throws(() => decodeVouch('2.c.0badc0de.22222222.short'));
  assert.throws(() => encodeVouch(RING, 'isi', '0123456789ab'));
});
