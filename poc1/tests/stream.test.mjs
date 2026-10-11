import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appended, rtcName, candidateAddr, keepCandidate, filterSdp, randomTint, clampTint, v6Scope } from '../web/src/stream.js';

test('appended: kirjoitus loppuun, keskelle, pyyhkiminen ja korjaus', () => {
  assert.equal(appended('', 'm'), 'm');
  assert.equal(appended('moi', 'moi k'), ' k');
  assert.equal(appended('moi', 'mooi'), 'o');
  assert.equal(appended('moi', 'mo'), '');
  assert.equal(appended('moi', ''), '');
  assert.equal(appended('hei teh', 'hei tehä'), 'ä');
  assert.equal(appended('kuka siel', 'kuka siellä'), 'lä');
  assert.equal(appended('menen kaupungiin', 'menen kaupunkiin'), 'k');
  assert.equal(appended('abc', 'abc'), '');
});

test('rtcName: rtcsignalin nimisääntö [a-z0-9-]', () => {
  assert.equal(rtcName('Ämpäri Öljy'), 'ampari-oljy');
  assert.equal(rtcName('  --  '), 'vertainen');
  assert.equal(rtcName('a_b.c'), 'a-b-c');
  assert.match(rtcName('x'.repeat(100)), /^[a-z0-9-]{1,24}$/);
  assert.match(rtcName('Pekka!!!'), /^[a-z0-9-]+$/);
});

const V6 = 'candidate:1 1 udp 2122262783 2001:999:41c:5de4::63 50123 typ host generation 0';
const V4 = 'candidate:2 1 udp 2122194687 10.204.108.119 50124 typ host generation 0';
const MDNS = 'candidate:3 1 udp 2122129151 0f1e2d3c-aaaa-bbbb-cccc-1234567890ab.local 50125 typ host';
const SRFLX6 = 'candidate:4 1 udp 1685987071 2001:999:2500:215e::5 50126 typ srflx raddr :: rport 0';

test('keepCandidate: vain IPv6', () => {
  assert.equal(candidateAddr(V6), '2001:999:41c:5de4::63');
  assert.equal(candidateAddr('a=' + V4), '10.204.108.119');
  assert.equal(keepCandidate(V6), true);
  assert.equal(keepCandidate(SRFLX6), true);
  assert.equal(keepCandidate(V4), false);
  assert.equal(keepCandidate(MDNS), false);
  assert.equal(keepCandidate(''), true);
  assert.equal(keepCandidate('roskaa'), false);
});

test('filterSdp: poistaa IPv4- ja mDNS-rivit, muu SDP säilyy', () => {
  const sdp = ['v=0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', `a=${V6}`, `a=${V4}`, `a=${MDNS}`, 'a=mid:0', ''].join('\r\n');
  const r = filterSdp(sdp);
  assert.equal(r.dropped, 2);
  assert.equal(r.sdp, ['v=0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', `a=${V6}`, 'a=mid:0', ''].join('\r\n'));
});

test('randomTint ja clampTint: sävy pysyy sallituilla väleillä', () => {
  for (const r of [0, 0.5, 0.999]) assert.deepEqual(clampTint(randomTint(() => r)), randomTint(() => r));
  assert.deepEqual(clampTint({ h: 400, s: 99, d: -50 }), { h: 359, s: 64, d: -6 });
  assert.equal(clampTint({ h: 'x', s: 40, d: 0 }), null);
  assert.equal(clampTint(null), null);
});

test('v6Scope: julkinen, ULA, link-local, IPv4', () => {
  assert.equal(v6Scope('2001:999:41c:5de4::63'), 'global');
  assert.equal(v6Scope('2a00:1450:4001::1'), 'global');
  assert.equal(v6Scope('fd12:3456::1'), 'ula');
  assert.equal(v6Scope('fe80::1%wlan0'), 'link-local');
  assert.equal(v6Scope('::1'), 'other');
  assert.equal(v6Scope('10.204.108.119'), null);
  assert.equal(v6Scope('abcd.local'), null);
});
