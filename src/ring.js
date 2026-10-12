// Rengasrekisteri (direct.html): jäsenet yhdessä suljetussa ympyrässä. Uusi
// jäsen liittyy kahden vierekkäisen jäsenen väliin (docs/REKISTEROITYMINEN_JA_IDENTITEETTI.md).
// Tila lasketaan aina tapahtumajoukosta, joten saapumisjärjestyksellä ei ole
// väliä: kaikki, joilla on samat tapahtumat, näkevät saman renkaan.
//
//   found  { kind, id: member:f, ring, member, key, salt, name, icon, sigs }        aloitus
//   admit  { kind, id: member:a, ring, left, right, member, key, name, icon, proof, sigs }  väliin left → right
//   server { kind, id: member:s, ring, member, key, operator, name, sigs }  rengaspalvelin (member = palvelimen
//            tunniste); operaattori on jäsen, joka otti palvelimen renkaaseen. Palvelin ei ole jäsen.
//
// Jokainen jäsen liittyy kerran, joten tapahtuman tunniste johdetaan jäsenestä.
// Allekirjoitukset (identity.js) tarkistetaan ennen kuin tapahtuma tuodaan
// tänne; build() on puhdas ja olettaa ne tarkistetuiksi. `proof` on oikean
// naapurin vahvistuskoodin haaste.

export const ICONS = ['🧑', '👩', '👨', '👧', '👦', '👵', '👴', '🐈', '🐕'];
export const MAX_NAME = 24;
const HEX8 = /^[0-9a-f]{8}$/;
const KEY = /^[A-Za-z0-9_-]{87}$/; // P-256 raw (65 tavua)
const SIG = /^[A-Za-z0-9_-]{86}$/; // r‖s (64 tavua)
const PROOF = /^([0-9a-f]{12})?$/;

/** Tapahtuman tunniste: jäsen ja laji. */
export const eventId = (kind, member) => `${member}:${kind === 'found' ? 'f' : kind === 'server' ? 's' : 'a'}`;

export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
}

/** Onko tapahtuma muodoltaan kelvollinen (tuntemattomasta lähteestä). */
export function validEvent(ev) {
  if (!ev || typeof ev !== 'object' || !HEX8.test(ev.ring ?? '') || !HEX8.test(ev.member ?? '')) return false;
  if (ev.id !== eventId(ev.kind, ev.member) || !KEY.test(ev.key ?? '')) return false;
  if (typeof ev.name !== 'string' || ev.name !== cleanName(ev.name) || !ev.name) return false;
  const sig = (k) => SIG.test(ev.sigs?.[k] ?? '');
  if (ev.kind === 'server') return HEX8.test(ev.operator ?? '') && sig('member') && sig('operator');
  if (!ICONS.includes(ev.icon)) return false;
  if (ev.kind === 'found') return HEX8.test(ev.salt ?? '') && sig('member');
  return ev.kind === 'admit' && HEX8.test(ev.left ?? '') && HEX8.test(ev.right ?? '') &&
    typeof ev.proof === 'string' && PROOF.test(ev.proof) && sig('member') && sig('left') && (ev.left === ev.right || sig('right'));
}

/** Kahdesta saman tunnisteen tapahtumasta valitaan kaikilla sama. */
export function preferred(a, b) {
  if (!a || !b) return a ?? b;
  return JSON.stringify(a) <= JSON.stringify(b) ? a : b;
}

/** Onko right heti left:n jälkeen (yhden jäsenen renkaassa left = right). */
export function adjacent(members, left, right) {
  const i = members.indexOf(left);
  if (i < 0 || !members.includes(right)) return false;
  return members[(i + 1) % members.length] === right;
}

export function successor(members, id) {
  const i = members.indexOf(id);
  return i < 0 ? null : members[(i + 1) % members.length];
}

/** Järjestys, jossa tapahtumat sovelletaan: deterministinen kaikilla. */
const order = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Tapahtumat → rengas. Palauttaa { members, info, servers, applied, rejected, pending }.
 * servers: palvelimen tunniste → { name, key, operator, event }; palvelin hyväksytään,
 * kun operaattori on jäsen (palvelimet eivät vaikuta jäsenten järjestykseen).
 * admit hyväksytään, kun left ja right ovat vierekkäin; jos toinen puuttuu
 * vielä, se odottaa. Kerran erotetut naapurit eivät enää palaa vierekkäin
 * (jäseniä ei poisteta), joten silloin tapahtuma hylätään.
 */
export function build(ring, events) {
  const byId = new Map();
  for (const e of events) if (validEvent(e) && e.ring === ring) byId.set(e.id, preferred(byId.get(e.id), e));
  const evs = [...byId.values()].sort(order);
  const out = { members: [], info: new Map(), servers: new Map(), applied: [], rejected: [], pending: [] };
  const founds = evs.filter((e) => e.kind === 'found');
  if (!founds.length) {
    out.pending = evs.map((e) => e.id);
    return out;
  }
  const add = (e) => { out.info.set(e.member, { name: e.name, icon: e.icon, key: e.key, event: e.id }); out.applied.push(e.id); };
  out.members.push(founds[0].member);
  add(founds[0]);
  for (const f of founds.slice(1)) out.rejected.push({ id: f.id, why: 'toinen aloitus' });
  let todo = evs.filter((e) => e.kind === 'admit');
  const servers = evs.filter((e) => e.kind === 'server');
  for (let progress = true; progress;) {
    progress = false;
    for (const e of todo) {
      const { members } = out;
      let why = null;
      if (members.includes(e.member)) why = 'jo jäsen';
      else if (!members.includes(e.left) || !members.includes(e.right)) continue; // odottaa
      else if (!adjacent(members, e.left, e.right)) why = 'naapurit eivät ole enää vierekkäin';
      todo = todo.filter((x) => x !== e);
      if (why) out.rejected.push({ id: e.id, why });
      else {
        members.splice(members.indexOf(e.left) + 1, 0, e.member);
        add(e);
      }
      progress = true;
      break; // alusta uudelleen: järjestys pysyy samana kaikilla
    }
  }
  out.pending = todo.map((e) => e.id);
  for (const e of servers) {
    if (out.info.has(e.member)) out.rejected.push({ id: e.id, why: 'jäsen ei voi olla palvelin' });
    else if (!out.info.has(e.operator)) out.pending.push(e.id);
    else {
      out.servers.set(e.member, { name: e.name, key: e.key, operator: e.operator, event: e.id });
      out.applied.push(e.id);
    }
  }
  return out;
}
