import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacent, build, cleanName, preferred, successor, validEvent } from '../web/src/ring.js';

// build() ei tarkista allekirjoituksia (identity.test.mjs); muodoltaan oikeat riittävät.
const R = '0badc0de';
const KEY = 'K'.repeat(87);
const SIG = 'S'.repeat(86);
const ISI = 'aaaaaaaa', TORTTO = 'bbbbbbbb', LIISA = 'cccccccc', AITI = 'dddddddd', X = 'eeeeeeee';
const found = { kind: 'found', id: `${ISI}:f`, ring: R, member: ISI, key: KEY, salt: '01234567', name: 'isi', icon: '👨',
  sigs: { member: SIG } };
const admit = (left, right, member, name, icon = '🧑') => ({ kind: 'admit', id: `${member}:a`, ring: R, left, right, member,
  key: KEY, name, icon, proof: left === right ? '' : '0123456789ab', sigs: { member: SIG, left: SIG, right: SIG } });
const torttoIn = admit(ISI, ISI, TORTTO, 'Törttö', '🐈');
const liisaIn = admit(ISI, TORTTO, LIISA, 'Liisa', '👧');
const aitiIn = admit(ISI, LIISA, AITI, 'äiti', '👩');
const names = (r) => r.members.map((m) => r.info.get(m).name);

test('siemenen kylväjä: isi, Törttö, Liisa väliin, äiti väliin', () => {
  assert.deepEqual(names(build(R, [found])), ['isi']);
  assert.deepEqual(names(build(R, [found, torttoIn])), ['isi', 'Törttö']);
  assert.deepEqual(names(build(R, [found, torttoIn, liisaIn])), ['isi', 'Liisa', 'Törttö']);
  const r = build(R, [found, torttoIn, liisaIn, aitiIn]);
  assert.deepEqual(names(r), ['isi', 'äiti', 'Liisa', 'Törttö']);
  assert.equal(r.info.get(TORTTO).icon, '🐈');
  assert.equal(r.info.get(TORTTO).key, KEY);
  assert.deepEqual(r.rejected, []);
});

test('saapumisjärjestys ei vaikuta: sama rengas kaikilla', () => {
  const evs = [found, torttoIn, liisaIn, aitiIn, admit(LIISA, TORTTO, X, 'Eero')];
  const want = names(build(R, evs));
  assert.deepEqual(want, ['isi', 'äiti', 'Liisa', 'Eero', 'Törttö']);
  for (const perm of [[...evs].reverse(), [evs[3], evs[0], evs[4], evs[2], evs[1]]]) {
    assert.deepEqual(names(build(R, perm)), want);
  }
  // Puuttuva välivaihe: äiti odottaa, kunnes Liisa tunnetaan.
  const partial = build(R, [found, torttoIn, aitiIn]);
  assert.deepEqual(names(partial), ['isi', 'Törttö']);
  assert.deepEqual(partial.pending, [aitiIn.id]);
});

test('väliin vain vierekkäisten naapurien väliin', () => {
  // Liisan jälkeen isi ja Törttö eivät ole enää vierekkäin.
  const late = admit(ISI, TORTTO, X, 'myöhässä');
  const r = build(R, [found, torttoIn, liisaIn, late]);
  assert.deepEqual(names(r), ['isi', 'Liisa', 'Törttö']);
  assert.deepEqual(r.rejected.map((x) => x.why), ['naapurit eivät ole enää vierekkäin']);
  // Kaksi samanaikaista liittymistä samaan väliin: pienempi tunniste voittaa kaikilla.
  assert.deepEqual(names(build(R, [found, torttoIn, late, liisaIn])), ['isi', 'Liisa', 'Törttö']);
});

test('saman tunnisteen kaksi versiota: kaikilla sama valinta', () => {
  const other = { ...liisaIn, name: 'Lissu' };
  const a = names(build(R, [found, torttoIn, liisaIn, other]));
  const b = names(build(R, [found, torttoIn, other, liisaIn]));
  assert.deepEqual(a, b);
  assert.equal(preferred(liisaIn, other), preferred(other, liisaIn));
});

test('jäsen vain kerran, toinen rengas hylätään', () => {
  const again = admit(LIISA, TORTTO, ISI, 'isi');
  const r = build(R, [found, torttoIn, liisaIn, again]);
  assert.deepEqual(r.rejected.map((x) => x.why), ['jo jäsen']);
  const foreign = { ...liisaIn, ring: 'deadbeef' };
  assert.deepEqual(names(build(R, [found, torttoIn, foreign])), ['isi', 'Törttö']);
  assert.deepEqual(build(R, [torttoIn]).members, []);
});

test('apufunktiot ja syötteen tarkistus', () => {
  assert.equal(adjacent([ISI], ISI, ISI), true);
  assert.equal(adjacent([ISI, TORTTO], TORTTO, ISI), true);
  assert.equal(adjacent([ISI, LIISA, TORTTO], ISI, TORTTO), false);
  assert.equal(successor([ISI, LIISA, TORTTO], TORTTO), ISI);
  assert.equal(cleanName('  Liisa\n<b>  '), 'Liisa<b>');
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  assert.equal(validEvent(found), true);
  assert.equal(validEvent(liisaIn), true);
  assert.equal(validEvent(torttoIn), true); // perustajaliittymisessä ei oikeaa allekirjoitusta tarvita
  assert.equal(validEvent({ ...found, icon: '💣' }), false);
  assert.equal(validEvent({ ...found, name: '   ' }), false);
  assert.equal(validEvent({ ...found, id: `${ISI}:a` }), false);
  assert.equal(validEvent({ ...liisaIn, left: 'isi' }), false);
  assert.equal(validEvent({ ...liisaIn, sigs: { member: SIG, left: SIG } }), false);
  assert.equal(validEvent({ ...liisaIn, key: 'lyhyt' }), false);
  assert.equal(validEvent(null), false);
});

test('rengaspalvelin: operaattori jäsen, palvelin ei jäsen eikä vaikuta järjestykseen', () => {
  const SRV = 'ffff0000';
  const server = { kind: 'server', id: `${SRV}:s`, ring: R, member: SRV, key: KEY, operator: TORTTO, name: 'Nokia', sigs: { member: SIG, operator: SIG } };
  assert.equal(validEvent(server), true);
  assert.equal(validEvent({ ...server, sigs: { member: SIG } }), false);
  assert.equal(validEvent({ ...server, id: `${SRV}:a` }), false);
  const r = build(R, [found, torttoIn, liisaIn, server]);
  assert.deepEqual(names(r), ['isi', 'Liisa', 'Törttö']);
  assert.deepEqual(r.servers.get(SRV), { name: 'Nokia', key: KEY, operator: TORTTO, event: `${SRV}:s` });
  assert.equal(r.info.has(SRV), false);
  // Operaattori ei vielä jäsen: odottaa. Jäsen ei voi olla palvelin.
  assert.deepEqual(build(R, [found, server]).pending, [`${SRV}:s`]);
  const bad = { ...server, id: `${LIISA}:s`, member: LIISA };
  assert.deepEqual(build(R, [found, torttoIn, liisaIn, bad]).rejected.map((x) => x.why), ['jäsen ei voi olla palvelin']);
});
