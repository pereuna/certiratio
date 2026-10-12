// Yhteiset testivektorit selaimen (web/src) ja rengaspalvelimen (ringserver)
// välille: tapahtumat, allekirjoitukset ja odotettu rengas tehdään selaimen
// omalla koodilla (Noden WebCrypto), ja Go-testit tarkistavat saman.
//   node tools/make-vectors.mjs > tests/vectors/ring.json
import { authPayload, createIdentity, payloadOf, ringIdOf, sign } from '../web/src/identity.js';
import { build, eventId } from '../web/src/ring.js';

async function signed(ev, signers) {
  ev.id = eventId(ev.kind, ev.member);
  ev.sigs = {};
  for (const [role, who] of Object.entries(signers)) ev.sigs[role] = await sign(who.priv, payloadOf(ev));
  return ev;
}

const isi = await createIdentity();
const tortto = await createIdentity();
const liisa = await createIdentity();
const aiti = await createIdentity();
const salt = '0a1b2c3d';
const ring = await ringIdOf(isi.key, salt);
// Nimissä merkkejä, jotka Go:n encoding/json koodaisi eri tavalla kuin JSON.stringify.
const found = await signed({ kind: 'found', ring, member: isi.id, key: isi.key, salt, name: 'isi <&> "x" \\', icon: '👨' }, { member: isi });
const t = await signed({ kind: 'admit', ring, left: isi.id, right: isi.id, member: tortto.id, key: tortto.key,
  name: 'Törttö 🐈', icon: '🐈', proof: '' }, { member: tortto, left: isi });
const l = await signed({ kind: 'admit', ring, left: isi.id, right: tortto.id, member: liisa.id, key: liisa.key,
  name: 'Liisa L.', icon: '👧', proof: '0123456789ab' }, { member: liisa, left: isi, right: tortto });
const a = await signed({ kind: 'admit', ring, left: isi.id, right: liisa.id, member: aiti.id, key: aiti.key,
  name: 'äiti', icon: '👩', proof: 'ba9876543210' }, { member: aiti, left: isi, right: liisa });
const forged = { ...l, name: 'huijari' };
const events = [found, t, l, a];
const r = build(ring, events);
const nonce = 'f00dfeedc0ffee12';
const vectors = {
  ring,
  events,
  forged: [forged, { ...a, sigs: { ...a.sigs, right: a.sigs.left } }],
  members: r.members,
  // Allekirjoitettava sisältö merkkijonona (Go:n canon-funktion tulos).
  payloads: events.map((e) => JSON.stringify(payloadOf(e))),
  auth: { key: tortto.key, nonce, signer: tortto.id, verifier: isi.id, sig: await sign(tortto.priv, authPayload(nonce, tortto.id, isi.id)),
    payload: JSON.stringify(authPayload(nonce, tortto.id, isi.id)) },
};
console.log(JSON.stringify(vectors, null, 1));
