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

test('rengassolmu: kaksi huoltajaa, rengasjärjestyksessä, ei hyväksy jäseniä', () => {
  const NODE = 'f0f0f0f0';
  const node = { kind: 'node', id: `${NODE}:n`, ring: R, member: NODE, key: KEY, name: 'Jedi', left: ISI, right: LIISA, legacy: [],
    sigs: { member: SIG, left: SIG, right: SIG } };
  assert.equal(validEvent(node), true);
  assert.equal(validEvent({ ...node, right: ISI }), false, 'sama huoltaja kahdesti');
  assert.equal(validEvent({ ...node, sigs: { member: SIG, left: SIG } }), false, 'yksi huoltaja');
  assert.equal(validEvent({ ...node, legacy: ['bbbbbbbb', 'aaaaaaaa'] }), false, 'luettelo ei kasvava');
  assert.equal(validEvent({ ...node, legacy: undefined }), false);
  const r = build(R, [found, torttoIn, liisaIn, node]);
  assert.deepEqual(names(r), ['isi', 'Liisa', 'Törttö']);
  assert.deepEqual(r.order, [ISI, NODE, LIISA, TORTTO]);
  assert.deepEqual(r.servers.get(NODE), { name: 'Jedi', key: KEY, node: true, guardians: [ISI, LIISA], event: `${NODE}:n` });
  // Henkilö voi liittyä huoltajien väliin: solmu ei erota heitä, huoltajuus ei muutu.
  const r2 = build(R, [found, torttoIn, liisaIn, node, aitiIn]);
  assert.deepEqual(r2.order, [ISI, AITI, NODE, LIISA, TORTTO]);
  assert.deepEqual(r2.servers.get(NODE).guardians, [ISI, LIISA]);
  // Solmu naapurina: hylätään (solmu ei perusta solmua eikä hyväksy jäsentä).
  const n2 = { ...node, id: 'f1f1f1f1:n', member: 'f1f1f1f1', left: NODE, right: LIISA };
  const viaNode = admit(NODE, LIISA, X, 'Eero');
  const r3 = build(R, [found, torttoIn, liisaIn, node, n2, viaNode]);
  assert.deepEqual(r3.rejected.map((x) => x.why), ['solmu ei voi olla naapurina allekirjoittamassa', 'solmu ei voi olla naapurina allekirjoittamassa']);
  // Solmu ensin: huoltajien väliin liittynyt henkilö ei kumoa solmua, vaikka sen tunniste olisi pienempi.
  const early = { ...aitiIn, id: '00000000:a', member: '00000000' };
  const r5 = build(R, [found, torttoIn, liisaIn, early, node]);
  assert.deepEqual(r5.order, [ISI, '00000000', NODE, LIISA, TORTTO]);
  assert.deepEqual(r5.rejected, []);
  // Poisto: huoltajat; vanhalta palvelimelta operaattori.
  const retire = { kind: 'retire', id: `${NODE}:r`, ring: R, member: NODE, sigs: { left: SIG, right: SIG } };
  assert.equal(validEvent(retire), true);
  const r4 = build(R, [found, torttoIn, liisaIn, node, retire]);
  assert.equal(r4.servers.has(NODE), false);
  assert.deepEqual([...r4.retired], [NODE]);
  assert.deepEqual(r4.order, [ISI, LIISA, TORTTO]);
  assert.deepEqual(build(R, [found, torttoIn, liisaIn, node, { ...retire, sigs: { operator: SIG } }]).rejected.map((x) => x.why), ['väärät allekirjoittajat']);
});

test('vanha palvelin solmun rinnalla vain solmun luettelossa', () => {
  const SRV = 'ffff0000', OTHER = 'ffff0001', NODE = 'f0f0f0f0';
  const server = (id) => ({ kind: 'server', id: `${id}:s`, ring: R, member: id, key: KEY, operator: TORTTO, name: 'Nokia', sigs: { member: SIG, operator: SIG } });
  const node = { kind: 'node', id: `${NODE}:n`, ring: R, member: NODE, key: KEY, name: 'Jedi', left: ISI, right: LIISA, legacy: [SRV],
    sigs: { member: SIG, left: SIG, right: SIG } };
  const r = build(R, [found, torttoIn, liisaIn, server(SRV), server(OTHER), node]);
  assert.deepEqual([...r.servers.keys()].sort(), [NODE, SRV]);
  assert.deepEqual(r.rejected.map((x) => x.id), [`${OTHER}:s`]);
});
