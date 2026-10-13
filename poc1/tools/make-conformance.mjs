// Rekisterimallin 2 yhteensopivuusvektorit (docs/PROTOKOLLA.md): jokainen
// tapaus on tapahtumajoukko ja odotettu rekisteri. Odotukset lasketaan
// selaimen koodilla (web/src/registry.js); muut toteutukset (ringserver/ringcore,
// myöhemmin C/Plan 9) tarkistavat saman tuloksen.
//   node tools/make-conformance.mjs > tests/vectors/conformance.json
import { cardPayload, createIdentity, payloadOf, ringIdOf, sign } from '../web/src/identity.js';
import { MODEL, eventId } from '../web/src/ring.js';
import { resolve, summary } from '../web/src/registry.js';

async function signed(ev, signers) {
  ev.id = eventId(ev.kind, ev.member);
  ev.sigs = {};
  for (const [role, who] of Object.entries(signers)) ev.sigs[role] = await sign(who.priv, payloadOf(ev));
  return ev;
}

const isi = await createIdentity();
const hanna = await createIdentity();
const tortto = await createIdentity();
const nokia = await createIdentity(); // vanha palvelin (malli 1), operaattori Törttö
const jedi = await createIdentity();
let liisa;
do liisa = await createIdentity(); while (`${liisa.id}:a` > `${jedi.id}:n`); // Liisa järjestyksessä ennen solmua: solmu ensin -sääntö
const salt = '0a1b2c3d';
const ring = await ringIdOf(isi.key, salt);

const found = await signed({ kind: 'found', ring, member: isi.id, key: isi.key, salt, name: 'isi', icon: '👨' }, { member: isi });
const hannaIn = await signed({ kind: 'admit', ring, left: isi.id, right: isi.id, member: hanna.id, key: hanna.key,
  name: 'Hanna Reunamo', icon: '👩', proof: '' }, { member: hanna, left: isi });
const torttoIn = await signed({ kind: 'admit', ring, left: hanna.id, right: isi.id, member: tortto.id, key: tortto.key,
  name: 'Törttö', icon: '🐈', proof: '0123456789ab' }, { member: tortto, left: hanna, right: isi });
const legacy = await signed({ kind: 'server', ring, member: nokia.id, key: nokia.key, operator: tortto.id, name: 'Nokia' },
  { member: nokia, operator: tortto });
const node = await signed({ kind: 'node', ring, left: isi.id, right: hanna.id, member: jedi.id, key: jedi.key, name: 'Jedi',
  legacy: [nokia.id] }, { member: jedi, left: isi, right: hanna });
const liisaIn = await signed({ kind: 'admit', ring, left: isi.id, right: hanna.id, member: liisa.id, key: liisa.key,
  name: 'Liisa "L" <&>', icon: '👧', proof: 'ba9876543210' }, { member: liisa, left: isi, right: hanna });
const base = [found, hannaIn, torttoIn, legacy, node, liisaIn];

// Väärennökset ja kielletyt
const oneSigner = await signed({ ...node, sigs: undefined }, { member: jedi, left: isi, right: isi }); // sama ihminen kahdesti
const second = await createIdentity();
const nodeByNode = await signed({ kind: 'node', ring, left: jedi.id, right: hanna.id, member: second.id, key: second.key, name: 'Toinen',
  legacy: [] }, { member: second, left: jedi, right: hanna });
const lone = await createIdentity();
const lateLegacy = await signed({ kind: 'server', ring, member: lone.id, key: lone.key, operator: isi.id, name: 'Yksin' },
  { member: lone, operator: isi });
const retireNokia = await signed({ kind: 'retire', ring, member: nokia.id }, { operator: tortto });
const retireJedi = await signed({ kind: 'retire', ring, member: jedi.id }, { left: isi, right: hanna });
const retireJediAlone = await signed({ kind: 'retire', ring, member: jedi.id }, { left: isi, right: isi });
const retireByOperator = await signed({ kind: 'retire', ring, member: jedi.id }, { operator: isi });
const tampered = { ...node, name: 'Huijari' };

const cases = [
  ['solmu kahden huoltajan hyväksymänä; vanha palvelin luettelossa; myöhempi jäsen ei muuta huoltajuutta', base],
  ['ilman solmua vanha palvelin kelpaa (malli 1)', [found, hannaIn, torttoIn, legacy]],
  ['solmu, jonka sama ihminen allekirjoitti kahdesti', [found, hannaIn, torttoIn, legacy, oneSigner]],
  ['muutettu solmutapahtuma', [found, hannaIn, torttoIn, tampered]],
  ['solmu ei voi perustaa solmua', [...base, nodeByNode]],
  ['solmun jälkeen yksi jäsen ei voi lisätä vanhaa palvelinta', [...base, lateLegacy]],
  ['Törtön palvelinrooli pois operaattorin allekirjoituksella', [...base, retireNokia]],
  ['solmun poisto molempien huoltajien allekirjoituksella', [...base, retireNokia, retireJedi]],
  ['solmun poisto yhden huoltajan allekirjoituksella ei kelpaa', [...base, retireJediAlone, retireByOperator]],
  ['poisto ennen kohdetta odottaa', [found, hannaIn, retireNokia]],
];

const out = { model: MODEL, cases: [] };
for (const [name, events] of cases) {
  out.cases.push({ name, ring, events, expect: summary(await resolve(ring, events)) });
}
const card = { server: jedi.id, seq: 1792000000000, port: 40123, fp: 'S1Ltlk5RHYLu9U5r9lDTY_eDA7XoV2AoDOrB7InPMKo', addrs: ['2001:db8::1'] };
card.sig = await sign(jedi.priv, cardPayload(ring, card));
out.card = { ring, card, payload: JSON.stringify(cardPayload(ring, card)) };
out.payloads = [node, retireNokia].map((e) => ({ event: e, payload: JSON.stringify(payloadOf(e)) }));
console.log(JSON.stringify(out, null, 1));
