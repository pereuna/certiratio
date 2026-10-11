import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacent, build, cleanName, successor, validEvent } from '../web/src/ring.js';

const R = '0badc0de';
const ISI = 'aaaaaaaa', TORTTO = 'bbbbbbbb', LIISA = 'cccccccc', AITI = 'dddddddd', X = 'eeeeeeee';
const found = { kind: 'found', id: `${ISI}:1`, ring: R, member: ISI, name: 'isi', icon: '👨' };
const admit = (by, n, left, right, member, name, icon = '🧑') =>
  ({ kind: 'admit', id: `${by}:${n}`, ring: R, left, right, member, name, icon, proof: '0123456789ab' });
const torttoIn = admit(ISI, 2, ISI, ISI, TORTTO, 'Törttö', '🐈');
const liisaIn = admit(ISI, 3, ISI, TORTTO, LIISA, 'Liisa', '👧');
const aitiIn = admit(ISI, 4, ISI, LIISA, AITI, 'äiti', '👩');
const names = (r) => r.members.map((m) => r.info.get(m).name);

test('siemenen kylväjä: isi, Törttö, Liisa väliin, äiti väliin', () => {
  assert.deepEqual(names(build(R, [found])), ['isi']);
  assert.deepEqual(names(build(R, [found, torttoIn])), ['isi', 'Törttö']);
  assert.deepEqual(names(build(R, [found, torttoIn, liisaIn])), ['isi', 'Liisa', 'Törttö']);
  const r = build(R, [found, torttoIn, liisaIn, aitiIn]);
  assert.deepEqual(names(r), ['isi', 'äiti', 'Liisa', 'Törttö']);
  assert.equal(r.info.get(TORTTO).icon, '🐈');
  assert.deepEqual(r.rejected, []);
});

test('saapumisjärjestys ei vaikuta: sama rengas kaikilla', () => {
  const evs = [found, torttoIn, liisaIn, aitiIn, admit(LIISA, 1, LIISA, TORTTO, X, 'Eero')];
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
  const late = admit(TORTTO, 1, ISI, TORTTO, X, 'myöhässä');
  const r = build(R, [found, torttoIn, liisaIn, late]);
  assert.deepEqual(names(r), ['isi', 'Liisa', 'Törttö']);
  assert.deepEqual(r.rejected.map((x) => x.why), ['naapurit eivät ole enää vierekkäin']);
  // Kaksi samanaikaista liittymistä samaan väliin: pienempi id voittaa kaikilla.
  const a = admit(ISI, 3, ISI, TORTTO, LIISA, 'Liisa');
  const b = admit(TORTTO, 9, ISI, TORTTO, X, 'Eero');
  assert.deepEqual(names(build(R, [found, torttoIn, b, a])), ['isi', 'Liisa', 'Törttö']);
});

test('jäsen vain kerran, toinen aloitus ja toisen renkaan tapahtumat hylätään', () => {
  const again = admit(ISI, 5, ISI, TORTTO, LIISA, 'Liisa');
  const r = build(R, [found, torttoIn, liisaIn, again]);
  assert.deepEqual(r.rejected.map((x) => x.why), ['jo jäsen']);
  const other = { ...found, id: `${X}:1`, member: X, name: 'vieras' };
  assert.deepEqual(names(build(R, [found, other])), ['isi']);
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
  assert.equal(validEvent({ ...found, icon: '💣' }), false);
  assert.equal(validEvent({ ...found, name: '   ' }), false);
  assert.equal(validEvent({ ...liisaIn, left: 'isi' }), false);
  assert.equal(validEvent(null), false);
});
