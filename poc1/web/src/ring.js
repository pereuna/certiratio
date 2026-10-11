// Rengasrekisteri (direct.html): jäsenet yhdessä suljetussa ympyrässä. Uusi
// jäsen liittyy kahden vierekkäisen jäsenen väliin (docs/REKISTEROITYMINEN_JA_IDENTITEETTI.md).
// Tila lasketaan aina tapahtumajoukosta, joten saapumisjärjestyksellä ei ole
// väliä: kaikki, joilla on samat tapahtumat, näkevät saman renkaan.
//
//   found  { kind, id, ring, member, name, icon }                 renkaan aloitus
//   admit  { kind, id, ring, left, right, member, name, icon, proof }  väliin left → right
//
// PoC: ei allekirjoituksia; tunnisteet ovat satunnaisia. `proof` on oikean
// naapurin vahvistuskoodin haaste.

export const ICONS = ['🧑', '👩', '👨', '👧', '👦', '👵', '👴', '🐈', '🐕'];
export const MAX_NAME = 24;
const HEX8 = /^[0-9a-f]{8}$/;
const EVENT_ID = /^[0-9a-f]{8}:\d{1,9}$/;

export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
}

/** Onko tapahtuma muodoltaan kelvollinen (tuntemattomasta lähteestä). */
export function validEvent(ev) {
  if (!ev || typeof ev !== 'object' || !EVENT_ID.test(ev.id ?? '') || !HEX8.test(ev.ring ?? '')) return false;
  if (!HEX8.test(ev.member ?? '') || !ICONS.includes(ev.icon) || !cleanName(ev.name)) return false;
  if (ev.kind === 'found') return true;
  return ev.kind === 'admit' && HEX8.test(ev.left ?? '') && HEX8.test(ev.right ?? '');
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
 * Tapahtumat → rengas. Palauttaa { members, info, applied, rejected, pending }.
 * admit hyväksytään, kun left ja right ovat vierekkäin; jos toinen puuttuu
 * vielä, se odottaa. Kerran erotetut naapurit eivät enää palaa vierekkäin
 * (jäseniä ei poisteta), joten silloin tapahtuma hylätään.
 */
export function build(ring, events) {
  const evs = [...new Map(events.filter((e) => validEvent(e) && e.ring === ring).map((e) => [e.id, e])).values()].sort(order);
  const out = { members: [], info: new Map(), applied: [], rejected: [], pending: [] };
  const founds = evs.filter((e) => e.kind === 'found');
  if (!founds.length) {
    out.pending = evs.map((e) => e.id);
    return out;
  }
  const add = (e) => { out.info.set(e.member, { name: cleanName(e.name), icon: e.icon, event: e.id }); out.applied.push(e.id); };
  out.members.push(founds[0].member);
  add(founds[0]);
  for (const f of founds.slice(1)) out.rejected.push({ id: f.id, why: 'toinen aloitus' });
  let todo = evs.filter((e) => e.kind === 'admit');
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
  return out;
}
