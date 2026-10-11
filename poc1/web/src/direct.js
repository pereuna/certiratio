// Suora verkko ilman palvelinta, rengasmuotoinen jäsenrekisteri (ring.js).
//
// Rengas alkaa yhdestä puhelimesta. Toinen jäsen liittyy perustajan kutsulla.
// Siitä eteenpäin uusi jäsen liittyy kahden vierekkäisen jäsenen väliin A → B:
//   1. A näyttää kutsukoodin (2.o…), uusi jäsen N skannaa sen.
//   2. N näyttää vastauskoodin (2.a…), A skannaa sen sivun omalla kameralla:
//      suora IPv6-yhteys A–N syntyy, ja verkko esittelee N:n muille.
//   3. B näyttää vahvistuskoodin (2.c…), N skannaa sen ja lähettää haasteen
//      B:lle verkon kautta. B ilmoittaa A:lle, A julkaisee liittymisen (admit).
// Vain vasen jäsen A voi kutsua väliin A → B, joten samaan väliin ei tule kahta
// liittyjää yhtä aikaa.
//
// Verkkokerros: jäsenet kertovat naapurinsa (hello), ja kaikki muodostavat
// suorat yhteydet kaikkiin. Tarjoukset ja vastaukset kulkevat olemassa olevia
// DataChanneleita pitkin (sig). Tekstivirta (chars) ja rekisteritapahtumat (ev)
// leviävät kaikille. Eri renkaiden puhelimet eivät yhdisty (hello.ring).
// Vain IPv6; ei signalointipalvelinta.

import { CLASSES, classifyPair, selectedPair } from './classify.js';
import { decodeAny, encodePairing, encodeVouch } from './pairing.js';
import { ICONS, adjacent, build, cleanName, successor, validEvent } from './ring.js';
import { createScanner } from './scanner.js';
import { filterSdp } from './stream.js';
import { MAX_CHARS, createStreamView } from './streamview.js';

const PROTOCOL = 'certiratio-direct/3';
const MAX_MESSAGE_BYTES = 64 * 1024;
const GATHER_MS = 5000;
const CONNECT_TIMEOUT_MS = 45000;
const STATS_INTERVAL_MS = 3000;
const TTL = 8; // välityskertoja enintään
const MAX_SEEN = 20000;
const MAX_EVENTS = 1000;
const FRESH_MS = 8000; // uusi jäsen korostetaan renkaassa näin kauan
const ID = /^[0-9a-f]{8}$/;
const STUN = 'stun:stun.l.google.com:19302';
const DIRECTED = new Set(['sig', 'sponsor', 'claim', 'vouched']);

const $ = (id) => document.getElementById(id);
const base = location.origin + location.pathname;
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('certiratio-direct') : null;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const myId = hex(4);
let useStun = new URLSearchParams(location.search).has('stun');

/** Yhteydet naapureihin. Avain on naapurin id, tai 'qr-N', kunnes hello kertoo sen. */
const links = new Map();
const failed = new Set(); // id:t, joihin välitetty yhteys ei syntynyt (ei uusita)
const seen = new Set(); // käsiteltyjen sanomien mid:t
const peerInfo = new Map(); // id -> { name, icon } (hello; myös ei-vielä-jäsenet)
let seq = 0;
let qrSeq = 0;
let lastHello = '';
let lastUrl = null; // näytetyn koodin linkki (testejä varten)
let lastGather = []; // viimeksi kerätyt kandidaattirivit (testejä varten)

// Rengas
let ringId = null;
const events = new Map(); // id -> tapahtuma
let evSeq = 0;
let ring = build('00000000', []);
const fresh = new Map(); // jäsen -> aika, jolloin liittyi
let profile = { name: '', icon: ICONS[0] };

// Käynnissä olevat liittymiset
let invite = null; // A: { link, left, right, member, sent }
let joining = null; // N: { token, offer, link, stage: 'profile'|'answer'|'vouch'|'wait' }
let sponsor = null; // B: { member, inviter, nonce, done }

// --- Yhteydet -------------------------------------------------------------

function newLink(key, id = null) {
  const pc = new RTCPeerConnection({ iceServers: useStun ? [{ urls: STUN }] : [] });
  const link = { key, id, pc, ch: null, cls: 'unknown', detail: '', timer: null, deadline: null };
  links.set(key, link);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') drop(link, 'ICE epäonnistui');
    render();
  };
  pc.ondatachannel = (ev) => attach(link, ev.channel);
  link.timer = setInterval(() => updateStats(link), STATS_INTERVAL_MS);
  armDeadline(link);
  return link;
}

function armDeadline(link) {
  clearTimeout(link.deadline);
  link.deadline = setTimeout(() => {
    if (link.ch?.readyState !== 'open') drop(link, `ei yhteyttä ${CONNECT_TIMEOUT_MS / 1000} s:ssa`);
  }, CONNECT_TIMEOUT_MS);
}

function drop(link, why) {
  if (links.get(link.key) !== link) return;
  links.delete(link.key);
  clearInterval(link.timer);
  clearTimeout(link.deadline);
  link.ch?.close();
  link.pc.close();
  if (link.id && why) failed.add(link.id);
  log(`${nameOf(link.id) ?? 'uusi'}: ${why ?? 'suljettu'}`);
  if (invite?.link === link && !invite.member) {
    invite = null;
    if (why) pairFailed(why);
  }
  if (joining?.link === link && joining.stage === 'answer') {
    if (why) pairFailed(why);
  }
  sendHello();
  render();
}

/** Odottaa kandidaattien keräämisen; palauttaa onicecandidate-rivit ja mDNS-tiedon. */
function gather(pc) {
  const lines = [];
  let mdns = 0;
  pc.onicecandidate = (ev) => {
    const c = ev.candidate?.candidate;
    if (!c) return;
    lines.push(c);
    if (/ \S+\.local /.test(c)) mdns++;
  };
  return new Promise((ok) => {
    const t = setTimeout(done, GATHER_MS);
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') done(); };
    function done() { clearTimeout(t); lastGather = lines; ok({ lines, mdns }); }
  });
}

function attach(link, ch) {
  link.ch = ch;
  ch.onopen = () => {
    clearTimeout(link.deadline);
    send(link, { type: 'events', list: [...events.values()] }); // ennen helloa: nimet tiedossa
    send(link, helloMsg());
    render();
  };
  ch.onclose = () => drop(link, null);
  ch.onmessage = (ev) => {
    if (typeof ev.data !== 'string' || ev.data.length > MAX_MESSAGE_BYTES) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg?.protocol === PROTOCOL) onMessage(link, msg);
  };
}

function send(link, msg) {
  if (link.ch?.readyState === 'open') link.ch.send(JSON.stringify({ ...msg, protocol: PROTOCOL }));
}

function neighbours() {
  return [...links.values()].filter((l) => l.id && l.ch?.readyState === 'open').map((l) => l.id).sort();
}

function helloMsg() {
  return { type: 'hello', id: myId, ring: ringId, name: profile.name, icon: profile.icon, peers: neighbours() };
}

/** Naapurilista kaikille, kun se muuttuu: näin jäsenet oppivat toisensa. */
function sendHello() {
  const key = neighbours().join(',');
  if (key === lastHello) return;
  lastHello = key;
  for (const l of links.values()) send(l, helloMsg());
}

// --- Sanomat --------------------------------------------------------------

function onMessage(link, msg) {
  if (msg.type === 'hello') {
    if (typeof msg.id !== 'string' || !ID.test(msg.id) || msg.id === myId) return;
    if (msg.ring && ringId && msg.ring !== ringId) {
      log(`${msg.id}: kuuluu toiseen renkaaseen, ei yhdistetä`);
      if (invite?.link === link || joining?.link === link) pairFailed('koodi kuuluu toiseen renkaaseen');
      drop(link, null);
      return;
    }
    const name = cleanName(msg.name);
    if (name && ICONS.includes(msg.icon)) peerInfo.set(msg.id, { name, icon: msg.icon });
    if (!link.id) {
      const other = links.get(msg.id);
      if (other && other.ch?.readyState === 'open') { drop(link, null); return; } // kaksoisyhteys
      if (other) drop(other, null);
      links.delete(link.key);
      link.id = link.key = msg.id;
      links.set(link.key, link);
      log(`${nameOf(msg.id)}: mukana`);
      if (invite?.link === link) inviteConnected();
      if (joining?.link === link) joinConnected();
    }
    if (Array.isArray(msg.peers)) for (const p of msg.peers.slice(0, 64)) consider(p);
    sendHello();
    render();
  } else if (msg.type === 'events') {
    if (Array.isArray(msg.list)) merge(msg.list.slice(0, MAX_EVENTS));
  } else if (msg.type === 'chars' || msg.type === 'ev' || DIRECTED.has(msg.type)) {
    route(msg, link);
  }
}

/** Uusi jäsen naapurin listalla: pienempi id aloittaa, joten tarjoukset eivät törmää. */
function consider(p) {
  if (typeof p !== 'string' || !ID.test(p) || p === myId) return;
  if (links.has(p) || failed.has(p)) return;
  if (myId < p) connectTo(p);
}

function originate(msg) {
  msg.mid = `${myId}:${++seq}`;
  msg.from = myId;
  msg.ttl = TTL;
  remember(msg.mid);
  const direct = msg.to && links.get(msg.to);
  if (direct?.ch?.readyState === 'open') send(direct, msg);
  else for (const l of links.values()) send(l, msg);
}

function remember(mid) {
  seen.add(mid);
  if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
}

/** Välitys: oma sanoma käsitellään, muu viedään suoraan perille tai naapureille. */
function route(msg, via) {
  if (typeof msg.mid !== 'string' || seen.has(msg.mid) || typeof msg.from !== 'string' || !ID.test(msg.from)) return;
  remember(msg.mid);
  if (msg.type === 'chars' && typeof msg.text === 'string' && msg.from !== myId) {
    view.add(msg.from, msg.text.slice(0, MAX_CHARS), msg.tint);
  }
  if (msg.type === 'ev') merge([msg.ev]);
  if (DIRECTED.has(msg.type) && msg.to === myId) {
    onDirected(msg, TTL - (msg.ttl ?? TTL));
    return;
  }
  if (!(msg.ttl > 1)) return;
  const fwd = { ...msg, ttl: msg.ttl - 1 };
  const direct = DIRECTED.has(msg.type) && links.get(msg.to);
  if (direct?.ch?.readyState === 'open') send(direct, fwd);
  else for (const l of links.values()) if (l !== via) send(l, fwd);
}

function onDirected(msg, hops) {
  if (msg.type === 'sig') onSig(msg.from, msg.data, hops);
  else if (msg.type === 'sponsor') onSponsor(msg);
  else if (msg.type === 'claim') onClaim(msg);
  else if (msg.type === 'vouched') onVouched(msg);
}

// --- Verkon kautta välitetty yhteydenmuodostus ----------------------------

async function localSdp(link) {
  await gather(link.pc);
  return { type: link.pc.localDescription.type, sdp: filterSdp(link.pc.localDescription.sdp).sdp };
}

async function connectTo(p) {
  const link = newLink(p, p);
  attach(link, link.pc.createDataChannel('direct', { ordered: true }));
  log(`${nameOf(p)}: esittely verkon kautta, muodostetaan yhteys`);
  await link.pc.setLocalDescription(await link.pc.createOffer());
  originate({ type: 'sig', to: p, data: { sdp: await localSdp(link) } });
  render();
}

async function onSig(from, data, hops) {
  if (typeof data?.sdp?.sdp !== 'string') return;
  const desc = { type: data.sdp.type, sdp: filterSdp(data.sdp.sdp).sdp };
  try {
    if (desc.type === 'offer') {
      const old = links.get(from);
      if (old?.ch?.readyState === 'open') return;
      if (old) drop(old, null);
      failed.delete(from);
      const link = newLink(from, from);
      log(`${nameOf(from)}: esittely verkon kautta, välittäjiä ${hops}; vastataan`);
      await link.pc.setRemoteDescription(desc);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      originate({ type: 'sig', to: from, data: { sdp: await localSdp(link) } });
      render();
    } else if (desc.type === 'answer') {
      const link = links.get(from);
      if (link?.pc.signalingState === 'have-local-offer') {
        log(`${nameOf(from)}: vastaus verkon kautta, välittäjiä ${hops}`);
        await link.pc.setRemoteDescription(desc);
      }
    }
  } catch (e) {
    log(`${nameOf(from)}: signalointivirhe ${e.message}`);
  }
}

// --- Rengas ---------------------------------------------------------------

function isMember(id = myId) { return ring.members.includes(id); }

function nameOf(id) {
  if (!id) return null;
  return ring.info.get(id)?.name ?? peerInfo.get(id)?.name ?? id;
}

function iconOf(id) {
  return ring.info.get(id)?.icon ?? peerInfo.get(id)?.icon ?? '🧑';
}

/** Oma uusi tapahtuma: talteen ja kaikille. */
function publish(ev) {
  ev.id = `${myId}:${++evSeq}`;
  ev.ring = ringId;
  merge([ev]);
  originate({ type: 'ev', ev });
}

function merge(list) {
  let added = false;
  for (const ev of list) {
    if (!validEvent(ev) || events.has(ev.id) || events.size >= MAX_EVENTS) continue;
    if (ringId && ev.ring !== ringId) continue;
    events.set(ev.id, ev);
    added = true;
  }
  if (!added) return;
  const before = new Set(ring.members);
  ring = build(ringId, [...events.values()]);
  for (const r of ring.rejected) log(`rekisteri: hylätty ${r.id} (${r.why})`);
  for (const m of ring.members) {
    if (before.has(m)) continue;
    fresh.set(m, Date.now());
    setTimeout(render, FRESH_MS + 50);
    const ev = events.get(ring.info.get(m).event);
    log(ev.kind === 'found' ? `${nameOf(m)} aloitti renkaan`
      : ev.left === ev.right ? `${nameOf(m)} liittyi toiseksi perustajaksi (kutsuja: ${nameOf(ev.left)})`
        : `${nameOf(m)} liittyi väliin ${nameOf(ev.left)} → ${nameOf(ev.right)}`);
    admitted(m, ev);
  }
  render();
}

function found(name, icon) {
  ringId = hex(4);
  publish({ kind: 'found', member: myId, name, icon });
  showMember();
}

// --- Kutsu (A, vasen naapuri) ---------------------------------------------

async function startInvite() {
  if (!isMember()) return;
  if (invite) drop(invite.link, null);
  const right = successor(ring.members, myId);
  const link = newLink(`qr-${++qrSeq}`);
  clearTimeout(link.deadline); // QR-skannaus saa kestää
  invite = { link, left: myId, right, member: null, sent: false };
  panel({ step: 'Kerätään omat IPv6-osoitteet…', trio: trioNew(myId, right, null), secondary: ['Peru', cancelInvite] });
  attach(link, link.pc.createDataChannel('direct', { ordered: true }));
  const gathering = gather(link.pc);
  await link.pc.setLocalDescription(await link.pc.createOffer());
  const token = await local(link, 'offer', gathering, { ring: ringId, left: myId, right });
  if (!token) return;
  showInviteCode(token);
}

function showInviteCode(token) {
  const founding = invite.right === myId;
  panel({
    step: 'Kutsu 1/2 · Näytä tämä koodi uudelle jäsenelle. Hän skannaa sen puhelimensa kameralla.',
    note: founding ? 'Hänestä tulee renkaan toinen perustaja.'
      : `Hän liittyy väliin: sinä – ${nameOf(invite.right)}. Lopuksi ${nameOf(invite.right)} näyttää hänelle oman koodinsa.`,
    trio: trioNew(myId, invite.right, null),
    qr: `${base}#${token}`,
    primary: ['Skannaa hänen vastauksensa', () => scanAnswer(token)],
    secondary: ['Peru', cancelInvite],
    paste: true,
  });
}

function scanAnswer(token) {
  panel({
    step: 'Kutsu 2/2 · Skannaa uuden jäsenen näytöltä vastauskoodi.',
    trio: trioNew(myId, invite.right, null),
    cam: true,
    primary: ['Näytä kutsukoodi uudelleen', () => showInviteCode(token)],
    secondary: ['Peru', cancelInvite],
    paste: true,
  });
}

function cancelInvite() {
  if (invite && !invite.member) drop(invite.link, null);
  invite = null;
  showMember();
}

async function useAnswer(ans) {
  const link = invite?.link;
  if (link?.pc.signalingState !== 'have-local-offer') return note('Tämä puhelin ei odota vastausta.');
  if (ans.ring !== ringId) return note('Vastaus kuuluu toiseen renkaaseen.');
  await link.pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
  armDeadline(link);
  panel({ step: 'Yhdistetään…', trio: trioNew(myId, invite.right, null), secondary: ['Peru', cancelInvite] });
}

/** Uusi jäsen on suoraan yhteydessä: perustaja hyväksytään heti, muut vahvistaa oikea naapuri. */
function inviteConnected() {
  const n = invite.link.id;
  invite.member = n;
  if (invite.right === myId) {
    publish({ kind: 'admit', left: myId, right: myId, member: n, name: nameOf(n), icon: iconOf(n), proof: '' });
    return;
  }
  originate({ type: 'sponsor', to: invite.right, member: n, name: nameOf(n), icon: iconOf(n), left: myId });
  invite.sent = true;
  panel({
    step: `${nameOf(n)} on yhteydessä. Nyt ${nameOf(invite.right)} näyttää hänelle oman koodinsa.`,
    trio: trioNew(myId, invite.right, n),
    secondary: ['Sulje', showMember],
  });
}

function onVouched(msg) {
  if (!invite || invite.member !== msg.member || msg.from !== invite.right) return;
  if (!adjacent(ring.members, invite.left, invite.right)) {
    log('kutsu vanheni: naapurit eivät ole enää vierekkäin');
    return;
  }
  const n = invite.member;
  publish({ kind: 'admit', left: invite.left, right: invite.right, member: n, name: nameOf(n), icon: iconOf(n),
    proof: String(msg.nonce ?? '') });
}

// --- Vahvistus (B, oikea naapuri) -----------------------------------------

function onSponsor(msg) {
  const ok = ID.test(msg.member ?? '') && msg.left === msg.from && isMember() && adjacent(ring.members, msg.from, myId);
  if (!ok || isMember(msg.member)) return;
  const name = cleanName(msg.name);
  if (name && ICONS.includes(msg.icon)) peerInfo.set(msg.member, { name, icon: msg.icon });
  sponsor = { member: msg.member, inviter: msg.from, nonce: hex(6), done: false };
  panel({
    step: `${nameOf(msg.member)} liittyy väliin: ${nameOf(msg.from)} – sinä. Näytä tämä koodi hänelle.`,
    note: 'Hän skannaa sen omalla puhelimellaan. Näin sinäkin tunnistat hänet.',
    trio: trioNew(msg.from, myId, msg.member),
    qr: `${base}#${encodeVouch(ringId, myId, sponsor.nonce)}`,
    secondary: ['En tunne häntä', () => { sponsor = null; showMember(); }],
  });
}

function onClaim(msg) {
  if (!sponsor || sponsor.done || msg.from !== sponsor.member || msg.nonce !== sponsor.nonce) return;
  sponsor.done = true;
  originate({ type: 'vouched', to: sponsor.inviter, member: sponsor.member, nonce: sponsor.nonce });
  panel({ step: `Vahvistettu. ${nameOf(sponsor.member)} liitetään renkaaseen…`, trio: trioNew(sponsor.inviter, myId, sponsor.member) });
}

// --- Liittyjä (N) ---------------------------------------------------------

function startJoin(token, offer) {
  ringId = offer.ring;
  joining = { token, offer, link: null, stage: 'profile' };
  panel({
    step: 'Liittyminen 1/3 · Sinut on kutsuttu renkaaseen. Kirjoita nimesi ja valitse kuva.',
    profile: true,
    primary: ['Jatka', () => { if (readProfile()) makeAnswer(); }],
  });
}

async function makeAnswer() {
  panel({ step: 'Tehdään vastaus…' });
  const link = newLink(`qr-${++qrSeq}`);
  joining.link = link;
  joining.stage = 'answer';
  const gathering = gather(link.pc);
  await link.pc.setRemoteDescription({ type: 'offer', sdp: joining.offer.sdp });
  await link.pc.setLocalDescription(await link.pc.createAnswer());
  const ans = await local(link, 'answer', gathering, { ring: ringId });
  if (!ans) return;
  armDeadline(link);
  const { left, right } = joining.offer;
  panel({
    step: 'Liittyminen 2/3 · Näytä tämä koodi kutsujalle. Hän skannaa sen.',
    note: left === right ? 'Sen jälkeen olet renkaassa.' : 'Sen jälkeen skannaat vielä toisen naapurisi koodin.',
    qr: `${base}#${ans}`,
  });
}

function joinConnected() {
  const { left, right } = joining.offer;
  if (left === right) {
    joining.stage = 'wait';
    panel({ step: 'Yhteys syntyi. Odotetaan liittymistä…', trio: trioNew(left, right, myId) });
    return;
  }
  joining.stage = 'vouch';
  panel({
    step: `Liittyminen 3/3 · Skannaa koodi, jonka ${nameOf(right)} näyttää puhelimessaan.`,
    note: `Liityt väliin: ${nameOf(left)} – ${nameOf(right)}.`,
    trio: trioNew(left, right, myId),
    cam: true,
    paste: true,
  });
}

function useVouch(v) {
  if (joining?.stage !== 'vouch') return note('Tämä puhelin ei odota vahvistuskoodia.');
  if (v.ring !== ringId || v.member !== joining.offer.right) {
    return note(`Väärä koodi. Skannaa koodi, jonka ${nameOf(joining.offer.right)} näyttää.`);
  }
  joining.stage = 'wait';
  originate({ type: 'claim', to: v.member, nonce: v.nonce });
  panel({ step: 'Vahvistetaan…', trio: trioNew(joining.offer.left, joining.offer.right, myId) });
}

/** Rekisteriin tuli uusi jäsen: kerrotaan osallisille. */
function admitted(m, ev) {
  const involved = m === myId || invite?.member === m || sponsor?.member === m;
  if (m === myId) joining = null;
  if (invite?.member === m) invite = null;
  if (sponsor?.member === m) sponsor = null;
  if (!involved || ev.kind === 'found') return;
  const done = m === myId ? 'Tervetuloa renkaaseen!' : `${nameOf(m)} liittyi renkaaseen.`;
  panel({ step: `✅ ${done}`, trio: trioNew(ev.left, ev.right, m), primary: ['Jatka', showMember] });
  setTimeout(() => { if ($('step').textContent.startsWith('✅')) showMember(); }, 4000);
}

// --- Koodit kamerasta, linkistä tai toisesta välilehdestä ------------------

function handleCode(text) {
  let c;
  try {
    c = decodeAny(text);
  } catch (e) {
    note(`Koodi ei kelpaa: ${e.message}`);
    return false;
  }
  if (c.type === 'answer' && invite?.link.pc.signalingState === 'have-local-offer') useAnswer(c);
  else if (c.type === 'vouch' && joining?.stage === 'vouch') useVouch(c);
  else if (c.type === 'offer' && !ringId) { const t = text.slice(text.indexOf('#') + 1); startJoin(decodeURIComponent(t), c); }
  else {
    note(c.type === 'offer' ? 'Tämä on kutsukoodi uudelle jäsenelle, ja tämä puhelin on jo renkaassa.'
      : 'Tämä puhelin ei odota tätä koodia nyt.');
    return false;
  }
  return true;
}

function expects(c) {
  return (c.type === 'answer' && invite?.link.pc.signalingState === 'have-local-offer') ||
    (c.type === 'vouch' && joining?.stage === 'vouch');
}

/** Järjestelmäkameran avaama välilehti: koodi sitä odottavalle välilehdelle. */
function relay(token) {
  panel({ step: 'Välitetään koodia…' });
  if (!bc) { relayFailed(token); return; }
  let acked = false;
  bc.onmessage = (ev) => {
    if (ev.data?.ack) {
      acked = true;
      panel({ step: '✅ Koodi välitetty. Palaa edelliseen välilehteen.' });
      setTimeout(() => window.close(), 1500);
    }
  };
  bc.postMessage({ code: token });
  setTimeout(() => { if (!acked) relayFailed(token); }, 2500);
}

function relayFailed(token) {
  panel({
    step: 'Koodia odottavaa välilehteä ei löytynyt tästä selaimesta. Skannaa koodi mieluummin sivun omalla kameralla.',
    links: `${base}#${token}`,
  });
}

// --- Näkymä ---------------------------------------------------------------

const view = createStreamView({
  me: () => myId,
  send: (text, tint) => originate({ type: 'chars', text, tint }),
});
const scanner = createScanner($('cam'), (text) => {
  if (handleCode(text)) scanner.stop();
});

/**
 * Yksi näkymä kerrallaan. o: { step, note, trio, profile, qr, cam, primary: [teksti, fn],
 * secondary, paste (liittämiskenttä), links (jakolinkki ilman QR:ää) }.
 */
function panel(o) {
  const p = $('pair');
  p.hidden = false;
  p.classList.toggle('overlay', isMember() || links.size > 0);
  $('step').textContent = o.step ?? '';
  $('pair-note').textContent = o.note ?? '';
  $('check').hidden = true;
  $('trio').hidden = !o.trio;
  if (o.trio) $('trio').replaceChildren(...o.trio);
  $('profile').hidden = !o.profile;
  if (o.qr) {
    lastUrl = o.qr;
    drawQr($('qr'), o.qr);
    $('qr').removeAttribute('hidden'); // SVG:llä ei ole hidden-ominaisuutta
  } else {
    $('qr').setAttribute('hidden', '');
  }
  const url = o.qr ?? o.links;
  $('nocam').hidden = !(url || o.paste);
  $('nocam').open = !!o.links;
  $('links').hidden = !url;
  if (url) showLinks(url);
  $('answer-box').hidden = !o.paste;
  for (const [id, b] of [['primary', o.primary], ['secondary', o.secondary]]) {
    $(id).hidden = !b;
    if (b) { $(id).textContent = b[0]; $(id).onclick = b[1]; }
  }
  $('cam-box').hidden = !o.cam;
  scanner.stop();
  if (o.cam) {
    scanner.start().catch((e) => {
      $('cam-box').hidden = true;
      warn('meh', `Kameraa ei saatu (${e.message}). Avaa "Ei kameraa?" ja liitä koodin linkki.`);
      $('nocam').open = true;
    });
  }
}

function note(text) { $('pair-note').textContent = text; }

function warn(cls, text) {
  $('check').className = `check ${cls}`;
  $('check').textContent = text;
  $('check').hidden = false;
}

/** Jäsenen perusnäkymä: rengas, tekstivirta ja kutsunappi. */
function showMember() {
  scanner.stop();
  $('pair').hidden = true;
  $('ringview').hidden = false;
  $('bar').hidden = false;
  $('info').hidden = false;
  $('stream').hidden = false;
  $('say').hidden = false;
  render();
  view.focus();
}

/** Kolme hahmoa käsi kädessä: vasen, tulokas (korostettu), oikea. */
function trioNew(left, right, member) {
  const fig = (id, cls) => {
    const f = document.createElement('figure');
    f.className = cls;
    const i = document.createElement('div');
    i.className = 'icon';
    i.textContent = id ? iconOf(id) : '❔';
    const c = document.createElement('figcaption');
    c.textContent = id ? (id === myId ? `${nameOf(id)} (sinä)` : nameOf(id)) : 'uusi';
    f.append(i, c);
    return f;
  };
  const hand = () => { const h = document.createElement('span'); h.className = 'hand'; h.textContent = '🤝'; return h; };
  const out = [fig(left, 'side'), hand(), fig(member, 'new')];
  if (right !== left) out.push(hand(), fig(right, 'side'));
  return out;
}

function readProfile() {
  const name = cleanName($('name').value);
  if (!name) { note('Kirjoita nimi.'); $('name').focus(); return false; }
  profile = { name, icon: profile.icon };
  try { localStorage.setItem('direct-profile', JSON.stringify(profile)); } catch {}
  return true;
}

function setupProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('direct-profile') ?? 'null');
    if (p && ICONS.includes(p.icon)) profile = { name: cleanName(p.name), icon: p.icon };
  } catch {}
  $('name').value = profile.name;
  $('icons').replaceChildren(...ICONS.map((icon) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.icon = icon;
    b.textContent = icon;
    b.setAttribute('aria-pressed', String(icon === profile.icon));
    b.onclick = () => {
      profile.icon = icon;
      for (const x of $('icons').children) x.setAttribute('aria-pressed', String(x.dataset.icon === icon));
    };
    return b;
  }));
}

function showLinks(url) {
  $('share').hidden = !navigator.share;
  $('share').onclick = () => navigator.share({ url }).catch(() => {});
  $('copy').textContent = 'Kopioi linkki';
  $('copy').onclick = () => navigator.clipboard.writeText(url).then(() => { $('copy').textContent = 'Kopioitu ✓'; }, () => {});
}

function drawQr(svg, text) {
  const qr = qrcode(0, 'M'); // eslint-disable-line no-undef -- vendor/qrcode.js
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const q = 4; // hiljainen alue
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  svg.setAttribute('viewBox', `0 0 ${n + 2 * q} ${n + 2 * q}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.innerHTML = '';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');
  svg.append(path);
}

async function local(link, type, gathering, meta) {
  const g = await gathering;
  try {
    return encodePairing(type, link.pc.localDescription.sdp, g.lines, meta);
  } catch (e) {
    drop(link, null);
    if (invite?.link === link) invite = null;
    noAddress(g.mdns > 0, e.message);
    return null;
  }
}

function noAddress(mdns, why) {
  const retry = () => (joining ? makeAnswer() : startInvite());
  if (mdns && !useStun) {
    // iPhone (kaikki iOS-selaimet) ja työpöytä-Chrome piilottavat oman
    // osoitteensa. STUN vain kertoo sen; liikenne kulkee silti suoraan.
    useStun = true;
    log('selain piilottaa osoitteensa, kysytään se STUN-palvelimelta');
    retry();
    return;
  }
  panel({ step: `Ei IPv6-osoitetta (${why}).`, primary: ['Yritä uudelleen', retry], secondary: isMember() ? ['Peru', showMember] : null });
  if (mdns) {
    warn('meh', '🤔 Selain piilottaa osoitteensa, eikä STUN-palvelinkaan kertonut sitä. Kokeile puhelimen Chromella tai yritä uudelleen.');
  } else {
    warn('bad', '🪵 Puhelimesi on vanha puukalikka, se ei tue IPv6-osoitteita. Osta uusi puhelin tai ota yhteyttä Claudeen tai ChatGPT:hen. ' +
      '(P.S. Puukalikka voi olla myös Wi-Fi: sulje Wi-Fi ja kokeile mobiilidataa.)');
  }
}

function pairFailed(why) {
  const member = isMember();
  if (!member) { joining = null; ringId = null; } // liittyjä aloittaa alusta uudella kutsukoodilla
  panel({
    step: `Yhteys ei syntynyt (${why}).`,
    note: 'Molemmilla pitää olla IPv6 (mobiilidata). Kutsuja tekee uuden koodin.',
    primary: member ? ['Kutsu uudelleen', startInvite] : ['Skannaa uusi kutsukoodi', scanOffer],
    secondary: member ? ['Sulje', showMember] : null,
  });
}

async function updateStats(link) {
  if (link.ch?.readyState !== 'open') return;
  const sel = selectedPair(await link.pc.getStats());
  if (!sel || sel.pair.state !== 'succeeded') return;
  let cls = classifyPair({ local: sel.local, remote: sel.remote, pairState: sel.pair.state });
  // Vain IPv6-osoitteita vaihdettiin, joten onnistunut suora pari on IPv6.
  if (cls === 'unknown' && sel.local?.candidateType !== 'relay') cls = 'ipv6-direct';
  const rtt = sel.pair.currentRoundTripTime != null ? `, ${Math.round(sel.pair.currentRoundTripTime * 1000)} ms` : '';
  const detail = `${sel.local?.candidateType} → ${sel.remote?.candidateType}${rtt}`;
  if (cls !== link.cls) log(`${nameOf(link.id) ?? 'uusi'}: ${CLASSES[cls]} (${detail})`);
  link.cls = cls;
  link.detail = detail;
  render();
}

function renderRing() {
  const box = $('ringview');
  const now = Date.now();
  const parts = [];
  ring.members.forEach((m, i) => {
    if (i) parts.push(Object.assign(document.createElement('span'), { className: 'arrow', textContent: '→' }));
    const s = document.createElement('span');
    s.className = 'member';
    if (m === myId) s.classList.add('me');
    if (now - (fresh.get(m) ?? 0) < FRESH_MS) s.classList.add('fresh');
    s.textContent = `${iconOf(m)} ${nameOf(m)}`;
    parts.push(s);
  });
  if (ring.members.length > 1) parts.push(Object.assign(document.createElement('span'), { className: 'arrow', textContent: '↺' }));
  box.replaceChildren(...parts);
}

function render() {
  const tbody = $('peers');
  tbody.replaceChildren();
  let open = 0;
  for (const l of links.values()) {
    if (l.ch?.readyState === 'open') open++;
    const tr = document.createElement('tr');
    const who = l.id ? `${iconOf(l.id)} ${nameOf(l.id)}${isMember(l.id) ? '' : ' (liittymässä)'}` : 'uusi';
    [who, l.ch?.readyState === 'open' ? 'auki' : l.pc.connectionState, `${CLASSES[l.cls]}${l.detail ? ` (${l.detail})` : ''}`]
      .forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 2) td.className = `cls-${l.cls}`;
        tr.append(td);
      });
    tbody.append(tr);
  }
  renderRing();
  const n = ring.members.length;
  const others = neighbours().length;
  $('status').className = open || n === 1 ? 'ok' : 'bad';
  $('status').textContent = n === 1 && !open ? 'Rengas aloitettu. Kutsu toinen perustaja.'
    : `Renkaassa ${n} · suoria yhteyksiä ${open}${others + 1 > n ? ` · liittymässä ${others + 1 - n}` : ''}`;
  const right = isMember() ? successor(ring.members, myId) : null;
  $('invite').hidden = !isMember();
  $('invite').textContent = right === myId ? 'Kutsu toinen perustaja' : `Kutsu väliin: minä ja ${nameOf(right)}`;
  $('info-sum').textContent = `yhteydet · minä ${profile.icon} ${profile.name || myId}`;
}

function log(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  $('log').prepend(li);
}

// --- Käynnistys -----------------------------------------------------------

const hash = decodeURIComponent(location.hash.slice(1));
history.replaceState(null, '', base + location.search);
setupProfile();
if (bc) {
  bc.onmessage = (ev) => {
    if (typeof ev.data?.code !== 'string') return;
    let c;
    try { c = decodeAny(ev.data.code); } catch { return; }
    if (expects(c)) {
      bc.postMessage({ ack: true });
      handleCode(ev.data.code);
    }
  };
}
$('use').onclick = () => { if (handleCode($('paste').value)) $('paste').value = ''; };
$('invite').onclick = startInvite;

function startScreen() {
  panel({
    step: 'Aloita uusi rengas, tai skannaa sinulle näytetty kutsukoodi.',
    profile: true,
    primary: ['Aloita uusi rengas', () => { if (readProfile()) found(profile.name, profile.icon); }],
    secondary: ['Skannaa kutsukoodi', scanOffer],
  });
}

function scanOffer() {
  panel({ step: 'Skannaa kutsujan näytöltä kutsukoodi.', cam: true, paste: true, secondary: ['Takaisin', startScreen] });
}

let first = null;
try { first = hash ? decodeAny(hash) : null; } catch (e) { first = { error: e.message }; }
if (first?.type === 'offer') startJoin(hash, first);
else if (first?.type === 'answer' || first?.type === 'vouch') relay(hash);
else {
  startScreen();
  if (first?.error) note(`Koodi ei kelpaa: ${first.error}`);
}

// Testejä varten (drive-direct): sivun tila.
window.direct = {
  get id() { return myId; },
  get url() { return lastUrl; },
  get gathered() { return lastGather; },
  get open() { return neighbours(); },
  get ring() { return ring.members.map((m) => nameOf(m)); },
  get ringId() { return ringId; },
  get step() { return $('step').textContent; },
  /** Kuin kamera olisi lukenut koodin. */
  scan: (text) => handleCode(text),
  /** Katkaisee suoran yhteyden naapuriin (testaa kiertoreittiä). */
  cut(id) { const l = links.get(id); if (l) drop(l, null); },
};
