import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPair, ipFamily, selectedPair } from '../web/src/classify.js';

test('ipFamily tunnistaa perheen eikä arvaa mDNS-nimestä', () => {
  assert.equal(ipFamily('83.245.249.86'), 4);
  assert.equal(ipFamily('2001:999:41c:5de4::1'), 6);
  assert.equal(ipFamily('[2001:db8::1]'), 6);
  assert.equal(ipFamily('fe80::1%wlan0'), 6);
  assert.equal(ipFamily('::ffff:10.0.0.1'), 4);
  assert.equal(ipFamily('3f1c2a9e-0b7d-4c0e-9a61-1d2b3c4d5e6f.local'), null);
  assert.equal(ipFamily('999.1.1.1'), null);
  assert.equal(ipFamily(''), null);
  assert.equal(ipFamily(undefined), null);
});

const host6 = { candidateType: 'host', address: '2001:db8::1' };
const prflx6 = { candidateType: 'prflx', address: '2001:db8::2' };
const srflx4 = { candidateType: 'srflx', address: '198.51.100.7' };
const mdns = { candidateType: 'host', address: 'abcd.local' };
const relay = { candidateType: 'relay', address: '2001:db8::3' };

test('suora IPv6 ja IPv4', () => {
  assert.equal(classifyPair({ local: host6, remote: prflx6 }), 'ipv6-direct');
  assert.equal(classifyPair({ local: srflx4, remote: { candidateType: 'srflx', ip: '203.0.113.9' } }), 'ipv4-direct');
});

test('mDNS-päästä perhe luetaan toisesta päästä', () => {
  assert.equal(classifyPair({ local: mdns, remote: prflx6 }), 'ipv6-direct');
  assert.equal(classifyPair({ local: mdns, remote: mdns }), 'unknown');
});

test('relay ei koskaan ole suora IPv6, vaikka osoite olisi IPv6', () => {
  assert.equal(classifyPair({ local: relay, remote: prflx6 }), 'relay');
  assert.equal(classifyPair({ local: host6, remote: relay }), 'relay');
});

test('ristiriitaiset perheet, puuttuva pari ja failed', () => {
  assert.equal(classifyPair({ local: host6, remote: srflx4 }), 'unknown');
  assert.equal(classifyPair({}), 'unknown');
  assert.equal(classifyPair({ local: host6, remote: prflx6, pairState: 'failed' }), 'failed');
});

test('selectedPair: Chromen transport.selectedCandidatePairId', () => {
  const report = new Map([
    ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'P2' }],
    ['P1', { id: 'P1', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', nominated: true, state: 'succeeded' }],
    ['P2', { id: 'P2', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R2', state: 'succeeded' }],
    ['L', { id: 'L', type: 'local-candidate', ...host6 }],
    ['R', { id: 'R', type: 'remote-candidate', ...srflx4 }],
    ['R2', { id: 'R2', type: 'remote-candidate', ...prflx6 }],
  ]);
  const sel = selectedPair(report);
  assert.equal(sel.pair.id, 'P2');
  assert.equal(classifyPair({ local: sel.local, remote: sel.remote }), 'ipv6-direct');
});

test('selectedPair: Firefoxin candidate-pair.selected', () => {
  const report = new Map([
    ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', selected: true, state: 'succeeded' }],
    ['L', { id: 'L', type: 'local-candidate', ...relay }],
    ['R', { id: 'R', type: 'remote-candidate', ...prflx6 }],
  ]);
  const sel = selectedPair(report);
  assert.equal(classifyPair({ local: sel.local, remote: sel.remote }), 'relay');
  assert.equal(selectedPair(new Map()), null);
});
