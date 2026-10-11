import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authPayload, createIdentity, idOf, payloadOf, ringIdOf, sign, verify, verifyEvent } from '../web/src/identity.js';
import { build, eventId, validEvent } from '../web/src/ring.js';

/** Allekirjoitettu tapahtuma: signers = { member, left, right } identiteetteinä. */
async function signed(ev, signers) {
  ev.id = eventId(ev.kind, ev.member);
  ev.sigs = {};
  for (const [role, who] of Object.entries(signers)) ev.sigs[role] = await sign(who.priv, payloadOf(ev));
  return ev;
}

const isi = await createIdentity();
const tortto = await createIdentity();
const liisa = await createIdentity();
const salt = '0a1b2c3d';
const ring = await ringIdOf(isi.key, salt);
const foundEv = await signed({ kind: 'found', ring, member: isi.id, key: isi.key, salt, name: 'isi', icon: '👨' }, { member: isi });
const torttoEv = await signed({ kind: 'admit', ring, left: isi.id, right: isi.id, member: tortto.id, key: tortto.key,
  name: 'Törttö', icon: '🐈', proof: '' }, { member: tortto, left: isi });
const liisaEv = await signed({ kind: 'admit', ring, left: isi.id, right: tortto.id, member: liisa.id, key: liisa.key,
  name: 'Liisa', icon: '👧', proof: '0123456789ab' }, { member: liisa, left: isi, right: tortto });
const keys = (...evs) => (id) => evs.find((e) => e.member === id)?.key ?? null;

test('tunniste julkisesta avaimesta, renkaan tunniste perustajan avaimesta ja suolasta', async () => {
  assert.match(isi.id, /^[0-9a-f]{8}$/);
  assert.equal(await idOf(isi.key), isi.id);
  assert.equal(isi.key.length, 87);
  assert.notEqual(await ringIdOf(isi.key, 'ffffffff'), ring);
  for (const e of [foundEv, torttoEv, liisaEv]) assert.equal(validEvent(e), true, e.id);
});

test('allekirjoitus ja tarkistus; muutettu sisältö tai väärä avain kaatuu', async () => {
  const p = authPayload('n0nce', isi.id, tortto.id);
  const s = await sign(isi.priv, p);
  assert.equal(await verify(isi.key, p, s), true);
  assert.equal(await verify(tortto.key, p, s), false);
  assert.equal(await verify(isi.key, authPayload('toinen', isi.id, tortto.id), s), false);
  assert.equal(await verify('roskaa', p, s), false);
});

test('rekisteritapahtumat: aidot hyväksytään, väärennökset hylätään', async () => {
  const k = keys(foundEv, torttoEv, liisaEv);
  assert.equal(await verifyEvent(foundEv, k), true);
  assert.equal(await verifyEvent(torttoEv, k), true);
  assert.equal(await verifyEvent(liisaEv, k), true);
  assert.equal(await verifyEvent({ ...liisaEv, name: 'huijari' }, k), false);
  assert.equal(await verifyEvent({ ...foundEv, ring: 'deadbeef' }, k), false); // vieras renkaan tunniste
  const noRight = { ...liisaEv, sigs: { ...liisaEv.sigs, right: liisaEv.sigs.left } };
  assert.equal(await verifyEvent(noRight, k), false); // oikean naapurin allekirjoitus puuttuu
  const fake = await createIdentity(); // toinen avain samalla tunnisteella
  assert.equal(await verifyEvent({ ...liisaEv, key: fake.key }, k), false);
});

test('allekirjoittajan avainta ei vielä tunneta: odottaa (null)', async () => {
  assert.equal(await verifyEvent(liisaEv, keys(foundEv)), null); // Törtön avain puuttuu
  const r = build(ring, [foundEv, torttoEv, liisaEv]);
  assert.deepEqual(r.members, [isi.id, liisa.id, tortto.id]);
});
