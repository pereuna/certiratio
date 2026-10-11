// Suora verkko ilman palvelinta, rengasmuotoinen jäsenrekisteri (ring.js).
//
// Rengas alkaa yhdestä puhelimesta. Toinen jäsen liittyy perustajan kutsulla.
// Siitä eteenpäin uusi jäsen liittyy kahden vierekkäisen jäsenen väliin A → B:
//   1. A näyttää kutsukoodin (2.o…), uusi jäsen N skannaa sen.
//   2. N näyttää vastauskoodin (2.a…), A skannaa sen sivun omalla kameralla:
//      suora IPv6-yhteys A–N syntyy, ja verkko esittelee N:n muille.
//   3. B näyttää vahvistuskoodin (2.c…), N skannaa sen, allekirjoittaa
//      liittymisensä ja lähettää sen B:lle. B allekirjoittaa ja ilmoittaa A:lle,
//      A allekirjoittaa ja julkaisee liittymisen (admit).
// Vain vasen jäsen A voi kutsua väliin A → B, joten samaan väliin ei tule kahta
// liittyjää yhtä aikaa.
//
// Pysyvyys: avainpari (identity.js) ja rekisteri tallentuvat selaimeen
// (store.js), ja sivu aukeaa jäsenenä. Palaava jäsen yhdistetään verkkoon
// yhdistämiskoodilla (2.r…), jonka kuka tahansa paikalla oleva jäsen näyttää.
//
// Verkkokerros: jokainen yhteys todennetaan (hello: avain ja haaste, auth:
// allekirjoitus). Jäsenet kertovat naapurinsa, ja kaikki muodostavat suorat
// yhteydet kaikkiin. Tarjoukset ja vastaukset kulkevat olemassa olevia
// DataChanneleita pitkin (sig). Tekstivirta (chars) ja rekisteritapahtumat (ev)
// leviävät kaikille. Eri renkaiden puhelimet eivät yhdisty (hello.ring).
// Vain IPv6; ei signalointipalvelinta.

import { CLASSES, classifyPair, selectedPair } from './classify.js';
import { authPayload, createIdentity, idOf, payloadOf, ringIdOf, sign, verify, verifyEvent } from './identity.js';
import { decodeAny, encodePairing, encodeVouch } from './pairing.js';
import { ICONS, adjacent, build, cleanName, eventId, preferred, successor, validEvent } from './ring.js';
import { createScanner } from './scanner.js';
import { clear as clearStore, load, save } from './store.js';
import { filterSdp } from './stream.js';
import { MAX_CHARS, createStreamView } from './streamview.js';

const PROTOCOL = 'certiratio-direct/4';
const MAX_MESSAGE_BYTES = 64 * 1024;
const GATHER_MS = 5000;
const CONNECT_TIMEOUT_MS = 45000;
const STATS_INTERVAL_MS = 3000;
const TTL = 8; // välityskertoja enintään
const MAX_SEEN = 20000;
const MAX_EVENTS = 1000;
const MAX_QUEUE = 200;
const RETRY_MS = 120000; // epäonnistunutta yhteyttä yritetään uudelleen aikaisintaan näin pian
const FRESH_MS = 8000; // uusi jäsen korostetaan renkaassa näin kauan
const ID = /^[0-9a-f]{8}$/;
const STUN = 'stun:stun.l.google.com:19302';
const LOCK = 'certiratio-direct';
const DIRECTED = new Set(['sig', 'sponsor', 'claim', 'vouched']);

const $ = (id) => document.getElementById(id);
const base = location.origin + location.pathname;
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('certiratio-direct') : null;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const boot = hex(4); // tämä sivun lataus: vanhentuneen yhteyden tunnistamiseen
let useStun = new URLSearchParams(location.search).has('stun');

let me = null; // { priv, pub, key, id }
let myId = null;
let stored = true; // tallennus toimii

/** Yhteydet naapureihin. Avain on naapurin id, tai 'qr-N', kunnes hello kertoo sen. */
const links = new Map();
const failed = new Map(); // id -> aika: välitetty yhteys ei syntynyt (ei uusita hetkeen)
const seen = new Set(); // käsiteltyjen sanomien mid:t
const peerInfo = new Map(); // id -> { name, icon } (todennettu hello; myös ei-vielä-jäsenet)
let seq = 0;
let qrSeq = 0;
let lastHello = '';
let lastUrl = null; // näytetyn koodin linkki (testejä varten)
let lastGather = []; // viimeksi kerätyt kandidaattirivit (testejä varten)

// Rengas
let ringId = null;
const events = new Map(); // id -> tarkistettu tapahtuma
const unverified = new Map(); // allekirjoittajan avain vielä tuntematon
let ring = build('00000000', []);
const fresh = new Map(); // jäsen -> aika, jolloin liittyi
let profile = { name: '', icon: ICONS[0] };
let restoring = false; // tallennetun rekisterin lataus: ei ilmoituksia
let persisted = false;

// Käynnissä olevat liittymiset ja yhdistämiset
let invite = null; // näyttäjä: { kind: 'join'|'reconnect', link, left, right, member, memberKey, connected }
let joining = null; // N: { token, offer, link, stage: 'profile'|'answer'|'vouch'|'wait' }
let sponsor = null; // B: { member, key, name, icon, inviter, left, nonce, done }
let rejoin = null; // palaava jäsen: { code, link }
let retryLast = null; // "Yritä uudelleen"

// --- Yhteydet -------------------------------------------------------------

function newLink(key, id = null) {
  const pc = new RTCPeerConnection({ iceServers: useStun ? [{ urls: STUN }] : [] });
  const link = { key, id, pc, ch: null, cls: 'unknown', detail: '', timer: null, deadline: null, nonce: hex(8),
    peerKey: null, peerBoot: null, verified: false, queue: [], chain: Promise.resolve(), peers: [] };
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
    if (!link.verified) drop(link, `ei yhteyttä ${CONNECT_TIMEOUT_MS / 1000} s:ssa`);
  }, CONNECT_TIMEOUT_MS);
}

function drop(link, why) {
  if (links.get(link.key) !== link) return;
  links.delete(link.key);
  clearInterval(link.timer);
  clearTimeout(link.deadline);
  link.ch?.close();
  link.pc.close();
  if (link.id && why && !link.verified) failed.set(link.id, Date.now()); // katkennut toimiva yhteys saa palata
  log(`${nameOf(link.id) ?? 'uusi'}: ${why ?? 'suljettu'}`);
  if (invite?.link === link && !invite.connected) {
    invite = null;
    if (why) pairFailed(why);
  }
  if (joining?.link === link && joining.stage === 'answer' && why) pairFailed(why);
  if (rejoin?.link === link && !link.verified) {
    rejoin = null;
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
    send(link, { type: 'events', list: [...events.values()] }); // jonoon, kunnes todennettu
    send(link, helloMsg(link));
    render();
  };
  ch.onclose = () => drop(link, null);
  ch.onmessage = (ev) => {
    if (typeof ev.data !== 'string' || ev.data.length > MAX_MESSAGE_BYTES) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg?.protocol !== PROTOCOL) return;
    // Sanomat käsitellään järjestyksessä, vaikka tarkistukset ovat asynkronisia.
    link.chain = link.chain.then(() => onMessage(link, msg)).catch((e) => log(`${nameOf(link.id) ?? 'uusi'}: ${e.message}`));
  };
}

function send(link, msg) {
  if (link.ch?.readyState === 'open') link.ch.send(JSON.stringify({ ...msg, protocol: PROTOCOL }));
}

/** Todennetut, avoimet naapurit. */
function neighbours() {
  return [...links.values()].filter((l) => l.verified && l.ch?.readyState === 'open').map((l) => l.id).sort();
}

function helloMsg(link) {
  return { type: 'hello', id: myId, boot, ring: ringId, name: profile.name, icon: profile.icon, key: me.key,
    nonce: link.nonce, peers: neighbours() };
}

/** Naapurilista kaikille, kun se muuttuu: näin jäsenet oppivat toisensa. */
function sendHello() {
  const key = neighbours().join(',');
  if (key === lastHello) return;
  lastHello = key;
  for (const l of links.values()) send(l, helloMsg(l));
}

// --- Sanomat --------------------------------------------------------------

async function onMessage(link, msg) {
  if (links.get(link.key) !== link) return;
  if (msg.type === 'hello') return onHello(link, msg);
  if (msg.type === 'auth') return onAuth(link, msg);
  if (!link.verified) {
    if (link.queue.length < MAX_QUEUE) link.queue.push(msg);
    return;
  }
  return handle(link, msg);
}

async function handle(link, msg) {
  if (msg.type === 'events') {
    if (Array.isArray(msg.list)) await merge(msg.list.slice(0, MAX_EVENTS));
  } else if (msg.type === 'chars' || msg.type === 'ev' || DIRECTED.has(msg.type)) {
    route(msg, link);
  }
}

/** Naapurin tunniste ja avain. Avaimen on vastattava tunnistetta ja rekisteriä. */
async function onHello(link, msg) {
  if (typeof msg.id !== 'string' || !ID.test(msg.id) || msg.id === myId || typeof msg.nonce !== 'string') return;
  if (msg.ring && ringId && msg.ring !== ringId) {
    log(`${msg.id}: kuuluu toiseen renkaaseen, ei yhdistetä`);
    if (invite?.link === link || joining?.link === link || rejoin?.link === link) pairFailed('koodi kuuluu toiseen renkaaseen');
    drop(link, null);
    return;
  }
  if (typeof msg.key !== 'string' || (await idOf(msg.key)) !== msg.id) {
    log(`${msg.id}: avain ei vastaa tunnistetta, katkaistaan`);
    drop(link, null);
    return;
  }
  const registered = ring.info.get(msg.id)?.key;
  if ((registered && registered !== msg.key) || (link.peerKey && link.peerKey !== msg.key)) {
    log(`${nameOf(msg.id)}: väärä avain, katkaistaan`);
    drop(link, null);
    return;
  }
  if (!link.id) {
    const other = links.get(msg.id);
    if (other?.ch?.readyState === 'open' && other.peerBoot === msg.boot) { drop(link, null); return; } // kaksoisyhteys
    if (other) drop(other, null); // vanhentunut: naapuri on ladannut sivun uudelleen
    links.delete(link.key);
    link.id = link.key = msg.id;
    links.set(link.key, link);
  } else if (link.id !== msg.id) {
    drop(link, null);
    return;
  }
  link.peerBoot = msg.boot;
  link.peers = Array.isArray(msg.peers) ? msg.peers.slice(0, 64) : [];
  const name = cleanName(msg.name);
  if (name && ICONS.includes(msg.icon)) peerInfo.set(msg.id, { name, icon: msg.icon });
  if (!link.peerKey) {
    link.peerKey = msg.key;
    send(link, { type: 'auth', sig: await sign(me.priv, authPayload(msg.nonce, myId, msg.id)) });
  }
  if (link.verified) {
    for (const p of link.peers) consider(p);
    sendHello();
  }
  render();
}

/** Naapuri allekirjoitti haasteemme: yhteys on todennettu. */
async function onAuth(link, msg) {
  if (!link.peerKey || link.verified || typeof msg.sig !== 'string') return;
  if (!(await verify(link.peerKey, authPayload(link.nonce, link.id, myId), msg.sig))) {
    log(`${nameOf(link.id)}: todennus epäonnistui, katkaistaan`);
    drop(link, null);
    return;
  }
  link.verified = true;
  clearTimeout(link.deadline);
  log(`${nameOf(link.id)}: mukana (todennettu)`);
  // Kutsuja tietää tulokkaan ennen jonoa (siellä voi olla jo hänen hyväksyntänsä);
  // tulokas lukee jonosta ensin rekisterin, jotta nimet ovat tiedossa.
  if (invite?.link === link) inviteConnected();
  for (const m of link.queue.splice(0)) await handle(link, m);
  if (joining?.link === link) joinConnected();
  else if (rejoin?.link === link) rejoined();
  if (links.get(link.key) !== link) return; // esim. ei jäsen: katkaistu
  for (const p of link.peers) consider(p);
  sendHello();
  render();
}

/** Uusi jäsen naapurin listalla: pienempi id aloittaa, joten tarjoukset eivät törmää. */
function consider(p) {
  if (typeof p !== 'string' || !ID.test(p) || p === myId) return;
  if (links.has(p) || Date.now() - (failed.get(p) ?? 0) < RETRY_MS) return;
  if (myId < p) connectTo(p);
}

function originate(msg) {
  msg.mid = `${myId}:${boot}:${++seq}`;
  msg.from = myId;
  msg.ttl = TTL;
  remember(msg.mid);
  const direct = msg.to && links.get(msg.to);
  if (direct?.verified && direct.ch?.readyState === 'open') send(direct, msg);
  else for (const l of links.values()) if (l.verified) send(l, msg);
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
    onDirected(msg, TTL - (msg.ttl ?? TTL)).catch((e) => log(`${nameOf(msg.from)}: ${e.message}`));
    return;
  }
  if (!(msg.ttl > 1)) return;
  const fwd = { ...msg, ttl: msg.ttl - 1 };
  const direct = DIRECTED.has(msg.type) && links.get(msg.to);
  if (direct?.verified && direct.ch?.readyState === 'open') send(direct, fwd);
  else for (const l of links.values()) if (l !== via && l.verified) send(l, fwd);
}

async function onDirected(msg, hops) {
  if (msg.type === 'sig') await onSig(msg.from, msg.data, hops);
  else if (msg.type === 'sponsor') await onSponsor(msg);
  else if (msg.type === 'claim') await onClaim(msg);
  else if (msg.type === 'vouched') await onVouched(msg);
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
  originate({ type: 'sig', to: p, data: { sdp: await localSdp(link), boot } });
  render();
}

async function onSig(from, data, hops) {
  if (typeof data?.sdp?.sdp !== 'string') return;
  const desc = { type: data.sdp.type, sdp: filterSdp(data.sdp.sdp).sdp };
  try {
    if (desc.type === 'offer') {
      const old = links.get(from);
      // Avoin yhteys samaan sivun lataukseen riittää; uudelleen ladattu sivu korvaa vanhan.
      if (old?.ch?.readyState === 'open' && old.peerBoot === data.boot) return;
      if (old) drop(old, null);
      failed.delete(from);
      const link = newLink(from, from);
      log(`${nameOf(from)}: esittely verkon kautta, välittäjiä ${hops}; vastataan`);
      await link.pc.setRemoteDescription(desc);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      originate({ type: 'sig', to: from, data: { sdp: await localSdp(link), boot } });
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

function isMember(id = myId) { return !!id && ring.members.includes(id); }

function nameOf(id) {
  if (!id) return null;
  return ring.info.get(id)?.name ?? peerInfo.get(id)?.name ?? id;
}

function iconOf(id) {
  return ring.info.get(id)?.icon ?? peerInfo.get(id)?.icon ?? '🧑';
}

const keyOf = (id) => (events.get(`${id}:f`) ?? events.get(`${id}:a`))?.key ?? null;

/** Oma uusi tapahtuma: talteen ja kaikille. */
async function publish(ev) {
  ev.id = eventId(ev.kind, ev.member);
  await merge([ev]);
  originate({ type: 'ev', ev });
}

/** Liittymisen allekirjoitettava luonnos. */
function draftAdmit({ left, right, member, key, name, icon, proof }) {
  return { kind: 'admit', ring: ringId, left, right, member, key, name, icon, proof };
}

let mergeChain = Promise.resolve();
/** Tapahtumat rekisteriin allekirjoitusten tarkistuksen jälkeen (järjestyksessä). */
function merge(list) {
  mergeChain = mergeChain.then(() => mergeNow(list)).catch((e) => log(`rekisteri: ${e.message}`));
  return mergeChain;
}

async function mergeNow(list) {
  if (!ringId) return;
  for (const ev of list) {
    if (!validEvent(ev) || ev.ring !== ringId) continue;
    const have = events.get(ev.id);
    if (have && preferred(have, ev) === have) continue;
    if (unverified.size < MAX_EVENTS) unverified.set(ev.id, preferred(unverified.get(ev.id), ev));
  }
  let added = false;
  for (let progress = true; progress;) {
    progress = false;
    for (const [id, ev] of unverified) {
      const ok = await verifyEvent(ev, keyOf);
      if (ok === null) continue; // allekirjoittajan avain tulee myöhemmin
      unverified.delete(id);
      progress = true;
      if (ok) { events.set(id, ev); added = true; } else log(`rekisteri: allekirjoitus ei kelpaa (${id}), hylätty`);
    }
  }
  if (!added) return;
  const before = new Set(ring.members);
  ring = build(ringId, [...events.values()]);
  if (!restoring) for (const r of ring.rejected) log(`rekisteri: hylätty ${r.id} (${r.why})`);
  for (const m of ring.members) {
    if (before.has(m) || restoring) continue;
    fresh.set(m, Date.now());
    setTimeout(render, FRESH_MS + 50);
    const ev = events.get(ring.info.get(m).event);
    log(ev.kind === 'found' ? `${nameOf(m)} aloitti renkaan`
      : ev.left === ev.right ? `${nameOf(m)} liittyi toiseksi perustajaksi (kutsuja: ${nameOf(ev.left)})`
        : `${nameOf(m)} liittyi väliin ${nameOf(ev.left)} → ${nameOf(ev.right)}`);
    admitted(m, ev);
  }
  if (isMember()) {
    save('ring', { ringId, events: [...events.values()] }).catch(() => { stored = false; });
    if (!persisted) {
      persisted = true;
      navigator.storage?.persist?.().then((p) => log(`tallennus ${p ? 'pysyvä' : 'selaimen harkinnassa'}`), () => {});
    }
  }
  render();
}

async function found(name, icon) {
  const salt = hex(4);
  ringId = await ringIdOf(me.key, salt);
  const ev = { kind: 'found', ring: ringId, member: myId, key: me.key, salt, name, icon };
  ev.sigs = { member: await sign(me.priv, payloadOf(ev)) };
  await publish(ev);
  showMember();
}

// --- Kutsu ja yhdistämiskoodi (näyttäjä) ----------------------------------

async function startInvite(kind = 'join') {
  if (!isMember()) return;
  if (invite) drop(invite.link, null);
  retryLast = () => startInvite(kind);
  const right = kind === 'join' ? successor(ring.members, myId) : null;
  const link = newLink(`qr-${++qrSeq}`);
  clearTimeout(link.deadline); // QR-skannaus saa kestää
  invite = { kind, link, left: myId, right, member: null, memberKey: null, connected: false };
  panel({ step: 'Kerätään omat IPv6-osoitteet…', trio: kind === 'join' ? trioNew(myId, right, null) : null, secondary: ['Peru', cancelInvite] });
  attach(link, link.pc.createDataChannel('direct', { ordered: true }));
  const gathering = gather(link.pc);
  await link.pc.setLocalDescription(await link.pc.createOffer());
  const token = kind === 'join'
    ? await local(link, 'offer', gathering, { ring: ringId, left: myId, right })
    : await local(link, 'reconnect', gathering, { ring: ringId, from: myId });
  if (!token) return;
  showInviteCode(token);
}

function showInviteCode(token) {
  if (invite.kind === 'reconnect') {
    panel({
      step: 'Yhdistä 1/2 · Näytä tämä koodi palaavalle jäsenelle. Hän skannaa sen sivun omalla kameralla.',
      note: 'Hän painaa ensin "Yhdistä jäsen" → "Skannaa yhdistämiskoodi".',
      qr: `${base}#${token}`,
      primary: ['Skannaa hänen vastauksensa', () => scanAnswer(token)],
      secondary: ['Peru', cancelInvite],
      paste: true,
    });
    return;
  }
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
    step: `${invite.kind === 'join' ? 'Kutsu' : 'Yhdistä'} 2/2 · Skannaa hänen näytöltään vastauskoodi.`,
    trio: invite.kind === 'join' ? trioNew(myId, invite.right, null) : null,
    cam: true,
    primary: ['Näytä koodi uudelleen', () => showInviteCode(token)],
    secondary: ['Peru', cancelInvite],
    paste: true,
  });
}

function cancelInvite() {
  if (invite && !invite.connected) drop(invite.link, null);
  invite = null;
  showMember();
}

async function useAnswer(ans) {
  const link = invite?.link;
  if (link?.pc.signalingState !== 'have-local-offer') return note('Tämä puhelin ei odota vastausta.');
  if (ans.ring !== ringId) return note('Vastaus kuuluu toiseen renkaaseen.');
  await link.pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
  armDeadline(link);
  panel({ step: 'Yhdistetään…', trio: invite.kind === 'join' ? trioNew(myId, invite.right, null) : null, secondary: ['Peru', cancelInvite] });
}

/** Näytetyn koodin kautta tullut yhteys on todennettu. */
function inviteConnected() {
  const n = invite.link.id;
  invite.connected = true;
  if (invite.kind === 'reconnect') {
    const i = invite;
    invite = null;
    if (!isMember(n)) {
      drop(i.link, null);
      panel({ step: `${nameOf(n)} ei ole tämän renkaan jäsen.`, note: 'Uusi jäsen tarvitsee kutsukoodin (Kutsu väliin).', primary: ['Sulje', showMember] });
      return;
    }
    done(`✅ ${nameOf(n)} on taas mukana.`, null);
    return;
  }
  invite.member = n;
  invite.memberKey = invite.link.peerKey;
  if (invite.right === myId) {
    panel({ step: `${nameOf(n)} on yhteydessä. Odotetaan hänen hyväksyntäänsä…`, trio: trioNew(myId, myId, n) });
    return;
  }
  originate({ type: 'sponsor', to: invite.right, member: n, key: invite.memberKey, name: nameOf(n), icon: iconOf(n), left: myId });
  panel({
    step: `${nameOf(n)} on yhteydessä. Nyt ${nameOf(invite.right)} näyttää hänelle oman koodinsa.`,
    trio: trioNew(myId, invite.right, n),
    secondary: ['Sulje', showMember],
  });
}

/** Oikea naapuri vahvisti tulokkaan: kutsuja allekirjoittaa ja julkaisee. */
async function onVouched(msg) {
  if (!invite || invite.member !== msg.member || msg.from !== invite.right) return;
  if (!adjacent(ring.members, invite.left, invite.right)) {
    log('kutsu vanheni: naapurit eivät ole enää vierekkäin');
    return;
  }
  const n = invite.member;
  const ev = draftAdmit({ left: myId, right: invite.right, member: n, key: invite.memberKey, name: nameOf(n), icon: iconOf(n),
    proof: String(msg.nonce ?? '') });
  const p = payloadOf(ev);
  if (!(await verify(ev.key, p, msg.sigMember)) || !(await verify(keyOf(invite.right), p, msg.sigRight))) {
    log(`${nameOf(n)}: vahvistuksen allekirjoitus ei kelpaa`);
    return;
  }
  ev.sigs = { member: msg.sigMember, left: await sign(me.priv, p), right: msg.sigRight };
  await publish(ev);
}

// --- Vahvistus (B, oikea naapuri) -----------------------------------------

async function onSponsor(msg) {
  const ok = ID.test(msg.member ?? '') && msg.left === msg.from && isMember() && adjacent(ring.members, msg.from, myId) &&
    typeof msg.key === 'string' && (await idOf(msg.key)) === msg.member;
  if (!ok || isMember(msg.member)) return;
  const name = cleanName(msg.name);
  if (!name || !ICONS.includes(msg.icon)) return;
  peerInfo.set(msg.member, { name, icon: msg.icon });
  sponsor = { member: msg.member, key: msg.key, name, icon: msg.icon, inviter: msg.from, nonce: hex(6), done: false };
  panel({
    step: `${name} liittyy väliin: ${nameOf(msg.from)} – sinä. Näytä tämä koodi hänelle.`,
    note: 'Hän skannaa sen omalla puhelimellaan. Näin sinäkin tunnistat hänet.',
    trio: trioNew(msg.from, myId, msg.member),
    qr: `${base}#${encodeVouch(ringId, myId, sponsor.nonce)}`,
    secondary: ['En tunne häntä', () => { sponsor = null; showMember(); }],
  });
}

/** Tulokkaan allekirjoitus: perustajaliittymisessä kutsujalle, muuten oikealle naapurille. */
async function onClaim(msg) {
  if (typeof msg.sig !== 'string') return;
  if (invite?.right === myId && invite.left === myId && msg.from === invite.member && msg.proof === '') {
    const n = invite.member;
    const ev = draftAdmit({ left: myId, right: myId, member: n, key: invite.memberKey, name: nameOf(n), icon: iconOf(n), proof: '' });
    if (!(await verify(ev.key, payloadOf(ev), msg.sig))) return log(`${nameOf(n)}: allekirjoitus ei kelpaa`);
    ev.sigs = { member: msg.sig, left: await sign(me.priv, payloadOf(ev)) };
    await publish(ev);
    return;
  }
  if (!sponsor || sponsor.done || msg.from !== sponsor.member || msg.nonce !== sponsor.nonce) return;
  const ev = draftAdmit({ left: sponsor.inviter, right: myId, member: sponsor.member, key: sponsor.key, name: sponsor.name,
    icon: sponsor.icon, proof: sponsor.nonce });
  const p = payloadOf(ev);
  if (!(await verify(sponsor.key, p, msg.sig))) return log(`${sponsor.name}: allekirjoitus ei kelpaa`);
  sponsor.done = true;
  originate({ type: 'vouched', to: sponsor.inviter, member: sponsor.member, nonce: sponsor.nonce, sigMember: msg.sig,
    sigRight: await sign(me.priv, p) });
  panel({ step: `Vahvistettu. ${sponsor.name} liitetään renkaaseen…`, trio: trioNew(sponsor.inviter, myId, sponsor.member) });
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
  const ans = await local(link, 'answer', gathering, { ring: ringId }, makeAnswer);
  if (!ans) return;
  armDeadline(link);
  const { left, right } = joining.offer;
  panel({
    step: 'Liittyminen 2/3 · Näytä tämä koodi kutsujalle. Hän skannaa sen.',
    note: left === right ? 'Sen jälkeen olet renkaassa.' : 'Sen jälkeen skannaat vielä toisen naapurisi koodin.',
    qr: `${base}#${ans}`,
  });
}

/** Oma allekirjoitus liittymiseen. */
async function claim(to, proof) {
  const { left, right } = joining.offer;
  const ev = draftAdmit({ left, right, member: myId, key: me.key, name: profile.name, icon: profile.icon, proof });
  originate({ type: 'claim', to, proof, nonce: proof, sig: await sign(me.priv, payloadOf(ev)) });
}

async function joinConnected() {
  const { left, right } = joining.offer;
  if (left === right) {
    joining.stage = 'wait';
    panel({ step: 'Yhteys syntyi. Odotetaan liittymistä…', trio: trioNew(left, right, myId) });
    await claim(left, '');
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

async function useVouch(v) {
  if (joining?.stage !== 'vouch') return note('Tämä puhelin ei odota vahvistuskoodia.');
  if (v.ring !== ringId || v.member !== joining.offer.right) {
    return note(`Väärä koodi. Skannaa koodi, jonka ${nameOf(joining.offer.right)} näyttää.`);
  }
  joining.stage = 'wait';
  panel({ step: 'Vahvistetaan…', trio: trioNew(joining.offer.left, joining.offer.right, myId) });
  await claim(v.member, v.nonce);
}

/** Rekisteriin tuli uusi jäsen: kerrotaan osallisille. */
function admitted(m, ev) {
  const involved = m === myId || invite?.member === m || sponsor?.member === m;
  if (m === myId) joining = null;
  if (invite?.member === m) invite = null;
  if (sponsor?.member === m) sponsor = null;
  if (!involved || ev.kind === 'found') return;
  done(m === myId ? '✅ Tervetuloa renkaaseen!' : `✅ ${nameOf(m)} liittyi renkaaseen.`, trioNew(ev.left, ev.right, m));
}

function done(step, trio) {
  panel({ step, trio, primary: ['Jatka', showMember] });
  setTimeout(() => { if ($('step').textContent === step) showMember(); }, 4000);
}

// --- Palaava jäsen --------------------------------------------------------

async function startRejoin(code) {
  if (rejoin) drop(rejoin.link, null);
  retryLast = () => startRejoin(code);
  panel({ step: 'Tehdään vastaus…' });
  const link = newLink(`qr-${++qrSeq}`);
  rejoin = { code, link };
  const gathering = gather(link.pc);
  await link.pc.setRemoteDescription({ type: 'offer', sdp: code.sdp });
  await link.pc.setLocalDescription(await link.pc.createAnswer());
  const ans = await local(link, 'answer', gathering, { ring: ringId }, () => startRejoin(code));
  if (!ans) return;
  armDeadline(link);
  panel({
    step: `Yhdistä 2/2 · Näytä tämä koodi: ${nameOf(code.from)} skannaa sen.`,
    qr: `${base}#${ans}`,
    secondary: ['Peru', () => { drop(link, null); rejoin = null; showMember(); }],
  });
}

function rejoined() {
  const from = rejoin.code.from;
  rejoin = null;
  done(`✅ Yhdistetty: ${nameOf(from)}. Verkko esittelee sinut muille paikalla oleville.`, null);
}

function reconnectMenu() {
  panel({
    step: 'Yhdistä palaava jäsen: toinen näyttää yhdistämiskoodin, toinen skannaa sen.',
    note: 'Kuka tahansa paikalla oleva jäsen voi näyttää koodin. Liittymistä ei tarvitse tehdä uudelleen.',
    primary: ['Näytä yhdistämiskoodi', () => startInvite('reconnect')],
    secondary: ['Skannaa yhdistämiskoodi', () => panel({
      step: 'Skannaa yhdistämiskoodi toisen jäsenen näytöltä.', cam: true, paste: true, secondary: ['Peru', showMember],
    })],
    close: true,
  });
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
  else if (c.type === 'offer' && !ringId) {
    const t = text.slice(text.indexOf('#') + 1);
    startJoin(decodeURIComponent(t), c);
  } else if (c.type === 'reconnect' && isMember() && c.ring === ringId && !rejoin) startRejoin(c);
  else {
    note(c.type === 'offer' ? 'Tämä on kutsukoodi uudelle jäsenelle, ja tämä puhelin on jo renkaassa. Palaavana jäsenenä tarvitset yhdistämiskoodin.'
      : c.type === 'reconnect' && !isMember() ? 'Tämä on yhdistämiskoodi renkaan jäsenille. Uutena jäsenenä tarvitset kutsukoodin.'
        : c.type === 'reconnect' && c.ring !== ringId ? 'Tämä yhdistämiskoodi kuuluu toiseen renkaaseen.'
          : 'Tämä puhelin ei odota tätä koodia nyt.');
    return false;
  }
  return true;
}

function expects(c) {
  return (c.type === 'answer' && invite?.link.pc.signalingState === 'have-local-offer') ||
    (c.type === 'vouch' && joining?.stage === 'vouch') ||
    (c.type === 'reconnect' && isMember() && c.ring === ringId && !rejoin);
}

/** Toinen välilehti pitää renkaan: koodi sille. */
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
    step: 'Rengas on auki toisessa välilehdessä, mutta se ei vastannut. Palaa siihen ja skannaa koodi sivun omalla kameralla.',
    links: `${base}#${token}`,
    primary: ['Käytä tätä välilehteä', takeOver],
  });
}

// --- Välilehden lukko: yksi aktiivinen välilehti per selain ----------------

function acquireLock(steal = false) {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((res) => {
    navigator.locks.request(LOCK, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
      res(!!lock);
      return lock ? new Promise(() => {}) : undefined; // pidetään sivun elinajan
    }).catch(() => lockLost());
  });
}

function lockLost() {
  scanner.stop();
  for (const l of [...links.values()]) drop(l, null);
  panel({ step: 'Rengas avattiin toisessa välilehdessä, ja tämä välilehti pysäytettiin.', primary: ['Käytä tätä välilehteä', takeOver] });
}

async function takeOver() {
  await acquireLock(true);
  location.reload();
}

function otherTab() {
  panel({
    step: 'Rengas on auki toisessa välilehdessä.',
    note: 'Samassa selaimessa voi olla yksi aktiivinen välilehti kerrallaan.',
    primary: ['Käytä tätä välilehteä', takeOver],
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
 * secondary, close (Sulje-nappi), paste (liittämiskenttä), links (jakolinkki ilman QR:ää) }.
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
  for (const [id, b] of [['primary', o.primary], ['secondary', o.secondary], ['close', o.close && ['Sulje', showMember]]]) {
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

/** Jäsenen perusnäkymä: rengas, tekstivirta ja napit. */
function showMember() {
  scanner.stop();
  $('pair').hidden = true;
  $('ringview').hidden = false;
  $('bar').hidden = false;
  $('info').hidden = false;
  $('stream').hidden = false;
  $('say').hidden = false;
  render();
  renderInstall();
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

/** Oma nimi ja kuva rekisteristä (pysyvä jäsenyys). */
function profileFromRing() {
  const i = ring.info.get(myId);
  if (i) profile = { name: i.name, icon: i.icon };
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

async function local(link, type, gathering, meta, retry = retryLast) {
  const g = await gathering;
  try {
    return encodePairing(type, link.pc.localDescription.sdp, g.lines, meta);
  } catch (e) {
    drop(link, null);
    if (invite?.link === link) invite = null;
    noAddress(g.mdns > 0, e.message, retry);
    return null;
  }
}

function noAddress(mdns, why, retry) {
  if (mdns && !useStun) {
    // iPhone (kaikki iOS-selaimet) ja työpöytä-Chrome piilottavat oman
    // osoitteensa. STUN vain kertoo sen; liikenne kulkee silti suoraan.
    useStun = true;
    log('selain piilottaa osoitteensa, kysytään se STUN-palvelimelta');
    retry?.();
    return;
  }
  panel({ step: `Ei IPv6-osoitetta (${why}).`, primary: retry && ['Yritä uudelleen', retry], close: isMember() });
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
    note: 'Molemmilla pitää olla IPv6 (mobiilidata). Koodin näyttäjä tekee uuden koodin.',
    primary: member ? retryLast && ['Yritä uudelleen', retryLast] : ['Skannaa uusi kutsukoodi', scanOffer],
    close: member,
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
  const here = new Set([myId, ...neighbours()]);
  const parts = [];
  ring.members.forEach((m, i) => {
    if (i) parts.push(Object.assign(document.createElement('span'), { className: 'arrow', textContent: '→' }));
    const s = document.createElement('span');
    s.className = 'member';
    if (m === myId) s.classList.add('me');
    s.classList.add(here.has(m) ? 'here' : 'away');
    if (now - (fresh.get(m) ?? 0) < FRESH_MS) s.classList.add('fresh');
    s.title = here.has(m) ? 'paikalla' : 'ei yhteyttä';
    s.textContent = `${iconOf(m)} ${nameOf(m)}`;
    parts.push(s);
  });
  if (ring.members.length > 1) parts.push(Object.assign(document.createElement('span'), { className: 'arrow', textContent: '↺' }));
  box.replaceChildren(...parts);
}

function render() {
  if (!myId) return;
  const tbody = $('peers');
  tbody.replaceChildren();
  let open = 0;
  for (const l of links.values()) {
    if (l.verified && l.ch?.readyState === 'open') open++;
    const tr = document.createElement('tr');
    const who = l.id ? `${iconOf(l.id)} ${nameOf(l.id)}${isMember(l.id) ? '' : ' (liittymässä)'}` : 'uusi';
    const state = l.ch?.readyState === 'open' ? (l.verified ? 'auki ✓' : 'todennetaan') : l.pc.connectionState;
    [who, state, `${CLASSES[l.cls]}${l.detail ? ` (${l.detail})` : ''}`]
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
  const here = neighbours().filter((x) => isMember(x)).length + 1;
  const joiners = neighbours().length + 1 - here;
  $('status').className = open || n === 1 ? 'ok' : 'bad';
  $('status').textContent = n === 1 && !open ? 'Rengas aloitettu. Kutsu toinen perustaja.'
    : !open ? `Renkaassa ${n} · ei yhteyksiä. Pyydä paikalla olevaa jäsentä näyttämään yhdistämiskoodi (Yhdistä).`
      : `Renkaassa ${n} · paikalla ${here} · suoria yhteyksiä ${open}${joiners > 0 ? ` · liittymässä ${joiners}` : ''}`;
  const right = isMember() ? successor(ring.members, myId) : null;
  $('invite').hidden = !isMember();
  $('invite').textContent = right === myId ? 'Kutsu toinen perustaja' : `Kutsu väliin: minä ja ${nameOf(right)}`;
  $('reconnect').hidden = !isMember() || n < 2;
  $('info-sum').textContent = `yhteydet · minä ${profile.icon} ${profile.name || myId}`;
  $('me-info').textContent = `Tunniste ${myId} · avain ${me.key.slice(0, 12)}…` +
    (stored ? ' · tallennettu tähän selaimeen' : ' · ⚠️ selain ei salli tallennusta: jäsenyys katoaa, kun sivu suljetaan');
  $('forget').hidden = !isMember();
}

// --- Kotivalikkoon lisääminen ---------------------------------------------

let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; renderInstall(); });

function renderInstall() {
  const box = $('install');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let dismissed = false;
  try { dismissed = localStorage.getItem('direct-install-dismissed') === '1'; } catch {}
  box.hidden = standalone || dismissed;
  if (box.hidden) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  $('install-text').textContent = ios
    ? '📲 Lisää sivu Koti-valikkoon (Jaa → Lisää Koti-valikkoon) ja käytä rengasta sieltä, niin jäsenyys säilyy. ' +
      'Koti-valikon sovelluksella on oma muistinsa: liity tai yhdistä sen kautta.'
    : '📲 Lisää sivu aloitusnäyttöön, niin rengas on aina käden ulottuvilla.';
  $('install-go').hidden = !installEvt;
  $('install-go').onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; renderInstall(); };
  $('install-close').onclick = () => {
    try { localStorage.setItem('direct-install-dismissed', '1'); } catch {}
    box.hidden = true;
  };
}

function log(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  $('log').prepend(li);
}

// --- Käynnistys -----------------------------------------------------------

function startScreen() {
  panel({
    step: 'Aloita uusi rengas, tai skannaa sinulle näytetty kutsukoodi.',
    profile: true,
    primary: ['Aloita uusi rengas', () => { if (readProfile()) found(profile.name, profile.icon); }],
    secondary: ['Skannaa kutsukoodi', scanOffer],
  });
  renderInstall();
}

function scanOffer() {
  panel({ step: 'Skannaa kutsujan näytöltä kutsukoodi.', cam: true, paste: true, secondary: ['Takaisin', startScreen] });
}

async function loadIdentity() {
  try {
    me = await load('identity');
  } catch {
    stored = false;
  }
  if (!me?.priv || !me.key) {
    me = await createIdentity();
    try { await save('identity', me); } catch { stored = false; }
  }
  myId = me.id;
}

async function restoreRing() {
  let saved = null;
  try { saved = await load('ring'); } catch { stored = false; }
  if (!saved?.ringId) return;
  ringId = saved.ringId;
  restoring = true;
  await merge(Array.isArray(saved.events) ? saved.events : []);
  restoring = false;
  if (!isMember()) { // esim. vain osa tallentui: aloitetaan alusta
    ringId = null;
    events.clear();
    ring = build('00000000', []);
    return;
  }
  profileFromRing();
  log(`rengas ladattu: ${ring.members.length} jäsentä`);
}

async function main() {
  const hash = decodeURIComponent(location.hash.slice(1));
  history.replaceState(null, '', base + location.search);
  setupProfile();
  let first = null;
  try { first = hash ? decodeAny(hash) : null; } catch (e) { first = { error: e.message }; }

  if (!(await acquireLock())) {
    if (first && !first.error) relay(hash);
    else otherTab();
    return;
  }
  await loadIdentity();
  await restoreRing();
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
  $('invite').onclick = () => startInvite('join');
  $('reconnect').onclick = reconnectMenu;
  $('forget').onclick = async () => {
    if (!confirm('Poistetaanko jäsenyys ja avain tästä puhelimesta? Palataksesi renkaaseen tarvitset uuden kutsun.')) return;
    await clearStore().catch(() => {});
    location.reload();
  };

  const member = isMember();
  if (member) showMember();
  if (first?.type === 'offer' && !member) startJoin(hash, first);
  else if (first?.type === 'reconnect') { if (!member) startScreen(); handleCode(hash); }
  else if (first?.type === 'answer' || first?.type === 'vouch') {
    // Lukko oli vapaa: koodia odottanut välilehti on jo suljettu.
    if (!member) startScreen();
    panel({
      step: 'Koodia odottanut välilehti on suljettu, joten tämä koodi ei enää käy.',
      note: 'Tee uusi kutsu ja skannaa koodit sivun omalla kameralla, niin kaikki tapahtuu yhdessä välilehdessä.',
      primary: ['Jatka', member ? showMember : startScreen],
    });
  } else if (!member) {
    startScreen();
    if (first?.error) note(`Koodi ei kelpaa: ${first.error}`);
  } else if (first?.type === 'offer') {
    panel({ step: 'Tämä puhelin on jo renkaassa.', note: 'Kutsukoodi on uudelle jäsenelle. Palaavana jäsenenä tarvitset yhdistämiskoodin (Yhdistä).', close: true });
  }
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
  get note() { return $('pair-note').textContent; },
  get events() { return [...events.values()]; },
  /** Kuin kamera olisi lukenut koodin. */
  scan: (text) => handleCode(text),
  /** Kuin tapahtumat olisivat tulleet verkosta (väärennöstesti). */
  merge: (list) => merge(list),
  /** Katkaisee suoran yhteyden naapuriin (testaa kiertoreittiä). */
  cut(id) { const l = links.get(id); if (l) drop(l, null); },
};
main();
