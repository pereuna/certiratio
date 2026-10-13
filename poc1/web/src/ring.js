// Rengasrekisteri (direct.html), rekisterimalli 2 (docs/PROTOKOLLA.md): jäsenet
// yhdessä suljetussa ympyrässä. Uusi jäsen liittyy kahden vierekkäisen jäsenen
// väliin (docs/REKISTEROITYMINEN_JA_IDENTITEETTI.md). Tila lasketaan aina
// tapahtumajoukosta, joten saapumisjärjestyksellä ei ole väliä: kaikki, joilla
// on samat tapahtumat, näkevät saman renkaan.
//
//   found  { kind, id: member:f, ring, member, key, salt, name, icon, sigs }        aloitus
//   admit  { kind, id: member:a, ring, left, right, member, key, name, icon, proof, sigs }  henkilö väliin left → right
//   node   { kind, id: member:n, ring, left, right, member, key, name, legacy, sigs }  rengassolmu väliin left → right:
//            solmu ja molemmat naapurit allekirjoittavat; naapureista tulee solmun huoltajat
//   retire { kind, id: member:r, ring, member, sigs }  palvelinrooli pois (solmulta molemmat huoltajat,
//            vanhalta palvelimelta sen operaattori)
//   server { kind, id: member:s, ring, member, key, operator, name, sigs }  vanha malli 1: yhden operaattorin
//            rengaspalvelin, ei rengasjärjestyksessä. Kelpaa siirtymäkauden ajan (ks. build).
//
// Henkilöt ja solmut: `members` on henkilöjäsenet, `order` koko rengasjärjestys
// solmuineen. Henkilön liittymisessä naapuruus lasketaan henkilöiden kesken,
// joten solmu ei erota huoltajiaan eikä sitä tarvita uuden jäsenen
// hyväksymiseen. Solmu ei voi olla naapurina allekirjoittamassa (avain
// tunnetaan vain henkilöiltä), joten solmu ei voi perustaa solmua eikä
// hyväksyä jäsentä. Huoltajat kirjataan solmun tapahtumaan, joten
// myöhemmät liittymiset eivät muuta huoltajuutta.
//
// Jokainen jäsen liittyy kerran, joten tapahtuman tunniste johdetaan jäsenestä.
// Allekirjoitukset (identity.js) tarkistetaan ennen kuin tapahtuma tuodaan
// tänne; build() on puhdas ja olettaa ne tarkistetuiksi. `proof` on oikean
// naapurin vahvistuskoodin haaste.

export const MODEL = 2; // rekisterimallin versio (hello.model)
export const ICONS = ['🧑', '👩', '👨', '👧', '👦', '👵', '👴', '🐈', '🐕'];
export const NODE_ICON = '🖥️';
export const MAX_NAME = 24;
export const MAX_LEGACY = 8;
const HEX8 = /^[0-9a-f]{8}$/;
const KEY = /^[A-Za-z0-9_-]{87}$/; // P-256 raw (65 tavua)
const SIG = /^[A-Za-z0-9_-]{86}$/; // r‖s (64 tavua)
const PROOF = /^([0-9a-f]{12})?$/;
const SUFFIX = { found: 'f', admit: 'a', server: 's', node: 'n', retire: 'r' };

/** Tapahtuman tunniste: jäsen ja laji. */
export const eventId = (kind, member) => `${member}:${SUFFIX[kind] ?? '?'}`;

export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
}

/** Vanhojen palvelimien luettelo solmun tapahtumassa: kasvava, ei toistoja. */
export const validLegacy = (l) => Array.isArray(l) && l.length <= MAX_LEGACY &&
  l.every((x, i) => typeof x === 'string' && HEX8.test(x) && (i === 0 || l[i - 1] < x));

/** Onko tapahtuma muodoltaan kelvollinen (tuntemattomasta lähteestä). */
export function validEvent(ev) {
  if (!ev || typeof ev !== 'object' || !HEX8.test(ev.ring ?? '') || !HEX8.test(ev.member ?? '')) return false;
  if (ev.id !== eventId(ev.kind, ev.member)) return false;
  const sig = (k) => SIG.test(ev.sigs?.[k] ?? '');
  if (ev.kind === 'retire') return (sig('left') && sig('right')) || sig('operator');
  if (!KEY.test(ev.key ?? '')) return false;
  if (typeof ev.name !== 'string' || ev.name !== cleanName(ev.name) || !ev.name) return false;
  if (ev.kind === 'server') return HEX8.test(ev.operator ?? '') && sig('member') && sig('operator');
  if (ev.kind === 'node') {
    return HEX8.test(ev.left ?? '') && HEX8.test(ev.right ?? '') && ev.left !== ev.right && validLegacy(ev.legacy) &&
      sig('member') && sig('left') && sig('right');
  }
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
 * Tapahtumat → rengas. Palauttaa { members, order, info, servers, retired, applied, rejected, pending }.
 *   members  henkilöjäsenet rengasjärjestyksessä
 *   order    koko rengas: henkilöt ja solmut (uusi aina heti left:n jälkeen)
 *   servers  palvelin → { name, key, node: true, guardians: [left, right], event }
 *            tai vanha { name, key, operator, event }; poistetut eivät ole tässä
 *   retired  poistettujen palvelinten tunnisteet
 *
 * admit ja node hyväksytään, kun left ja right ovat henkilöjäseninä vierekkäin;
 * jos toinen puuttuu vielä, tapahtuma odottaa. Kerran erotetut naapurit eivät
 * enää palaa vierekkäin (jäseniä ei poisteta), joten silloin tapahtuma
 * hylätään. Joka kierroksella sovelletaan ensin solmu ja vasta sitten henkilö:
 * solmun huoltajat olivat vierekkäin allekirjoittaessaan, ja heidän väliinsä
 * myöhemmin liittynyt henkilö voi tulla vasta, kun molemmat ovat jäseniä,
 * joten solmu ehtii aina ennen sitä.
 *
 * Vanha server-tapahtuma (malli 1) hyväksytään, kun operaattori on jäsen. Kun
 * renkaassa on solmu, vanha palvelin kelpaa enää, jos jokin solmun tapahtuma
 * luettelee sen (legacy): yksi jäsen ei voi enää lisätä palvelinta yksin.
 */
export function build(ring, events) {
  const byId = new Map();
  for (const e of events) if (validEvent(e) && e.ring === ring) byId.set(e.id, preferred(byId.get(e.id), e));
  const evs = [...byId.values()].sort(order);
  const out = { members: [], order: [], info: new Map(), servers: new Map(), retired: new Set(), applied: [], rejected: [], pending: [] };
  const founds = evs.filter((e) => e.kind === 'found');
  if (!founds.length) {
    out.pending = evs.map((e) => e.id);
    return out;
  }
  const add = (e) => { out.info.set(e.member, { name: e.name, icon: e.icon, key: e.key, event: e.id }); out.applied.push(e.id); };
  const place = (e) => out.order.splice(out.order.indexOf(e.left) + 1, 0, e.member);
  out.members.push(founds[0].member);
  out.order.push(founds[0].member);
  add(founds[0]);
  for (const f of founds.slice(1)) out.rejected.push({ id: f.id, why: 'toinen aloitus' });
  const nodes = new Set();
  const legacyOk = new Set();
  let todo = [...evs.filter((e) => e.kind === 'node'), ...evs.filter((e) => e.kind === 'admit')];
  const servers = evs.filter((e) => e.kind === 'server');
  for (let progress = true; progress;) {
    progress = false;
    for (const e of todo) {
      const { members } = out;
      let why = null;
      if (members.includes(e.member) || nodes.has(e.member)) why = 'jo jäsen';
      else if (nodes.has(e.left) || nodes.has(e.right)) why = 'solmu ei voi olla naapurina allekirjoittamassa';
      else if (!members.includes(e.left) || !members.includes(e.right)) continue; // odottaa
      else if (!adjacent(members, e.left, e.right)) why = 'naapurit eivät ole enää vierekkäin';
      todo = todo.filter((x) => x !== e);
      if (why) out.rejected.push({ id: e.id, why });
      else if (e.kind === 'node') {
        place(e);
        nodes.add(e.member);
        for (const s of e.legacy) legacyOk.add(s);
        out.servers.set(e.member, { name: e.name, key: e.key, node: true, guardians: [e.left, e.right], event: e.id });
        out.applied.push(e.id);
      } else {
        members.splice(members.indexOf(e.left) + 1, 0, e.member);
        place(e);
        add(e);
      }
      progress = true;
      break; // alusta uudelleen: järjestys pysyy samana kaikilla
    }
  }
  out.pending = todo.map((e) => e.id);
  for (const e of servers) {
    if (out.info.has(e.member) || nodes.has(e.member)) out.rejected.push({ id: e.id, why: 'jäsen ei voi olla palvelin' });
    else if (nodes.size && !legacyOk.has(e.member)) out.rejected.push({ id: e.id, why: 'vanha palvelinmerkintä ei kelpaa solmujen rinnalla' });
    else if (!out.info.has(e.operator)) out.pending.push(e.id);
    else {
      out.servers.set(e.member, { name: e.name, key: e.key, operator: e.operator, event: e.id });
      out.applied.push(e.id);
    }
  }
  for (const e of evs.filter((x) => x.kind === 'retire')) {
    const s = out.servers.get(e.member);
    if (!s) { out.pending.push(e.id); continue; }
    if (s.node ? !(e.sigs.left && e.sigs.right) : !e.sigs.operator) { out.rejected.push({ id: e.id, why: 'väärät allekirjoittajat' }); continue; }
    out.servers.delete(e.member);
    if (s.node) out.order.splice(out.order.indexOf(e.member), 1);
    out.retired.add(e.member);
    out.applied.push(e.id);
  }
  return out;
}
