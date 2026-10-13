// Suora verkko ilman palvelinta, rengasmuotoinen jäsenrekisteri (ring.js).
//
// Rengas alkaa yhdestä puhelimesta. Toinen jäsen liittyy perustajan kutsulla.
// Siitä eteenpäin uusi jäsen liittyy kahden vierekkäisen jäsenen väliin A → B:
//   1. A näyttää kutsukoodin (2.j…), uusi jäsen N skannaa sen. Tarjous ja
//      vastaus kulkevat kertakäyttöisen kutsuhuoneen kautta (kohtaamispaikka):
//      suora IPv6-yhteys A–N syntyy, ja verkko esittelee N:n muille. Ilman
//      kohtaamispaikkaa A näyttää SDP-koodin (2.o…) ja skannaa N:n vastauksen (2.a…).
//   2. B näyttää vahvistuskoodin (2.c…), N skannaa sen, allekirjoittaa
//      liittymisensä ja lähettää sen B:lle. B allekirjoittaa ja ilmoittaa A:lle,
//      A allekirjoittaa ja julkaisee liittymisen (admit).
// Vain vasen jäsen A voi kutsua väliin A → B, joten samaan väliin ei tule kahta
// liittyjää yhtä aikaa.
//
// Pysyvyys: avainpari (identity.js) ja rekisteri tallentuvat selaimeen
// (store.js), ja sivu aukeaa jäsenenä. Jos kohtaamispaikka on annettu
// (?signal=wss://…, rtcsignal-yhteensopiva WebSocket-palvelin), jäsenet
// tapaavat toisensa renkaan huoneessa (nimi johdetaan jäsenten yhteisestä
// salaisuudesta), ja palaava jäsen yhdistyy itsestään. Palvelin välittää vain
// tarjoukset ja vastaukset; jokainen yhteys todennetaan rekisterin avaimilla.
// Oletuksena kohtaamispaikkaa ei ole: paluu käy yhdistämiskoodilla (2.r…).
//
// Verkkokerros: jokainen yhteys todennetaan (hello: avain ja haaste, auth:
// allekirjoitus). Jäsenet kertovat naapurinsa, ja kaikki muodostavat suorat
// yhteydet kaikkiin. Tarjoukset ja vastaukset kulkevat olemassa olevia
// DataChanneleita pitkin (sig). Rekisteritapahtumat (ev) leviävät kaikille.
// Viestit ovat kahdenkeskisiä (dm.js): ne kulkevat vain lähettäjän ja
// vastaanottajan välisellä todennetulla suoralla yhteydellä. Eri renkaiden puhelimet eivät yhdisty (hello.ring).
// Vain IPv6.

import { CLASSES, classifyPair, selectedPair } from './classify.js';
import { authPayload, cardPayload, createIdentity, idOf, payloadOf, ringIdOf, sign, verify, verifyEvent } from './identity.js';
import { DM_ID, acceptDm, cleanDm, restoreDms } from './dm.js';
import { decodeAny, encodeJoin, encodePairing, encodeVouch, pairable } from './pairing.js';
import { ICONS, adjacent, build, cleanName, eventId, preferred, successor, validEvent } from './ring.js';
import { createScanner } from './scanner.js';
import { cardAnswer, decodeCard, fpHex, isCard } from './servercard.js';
import { Signaling } from './signaling.js';
import { clear as clearStore, load, save } from './store.js';
import { candidateAddr, filterSdp } from './stream.js';

const PROTOCOL = 'certiratio-direct/5';
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
const INVITE_MS = 10 * 60000; // kutsuhuone suljetaan, jos kukaan ei tule
const SIGNAL_MS = 8000;
const SECRET = /^[0-9a-f]{32}$/;

const $ = (id) => document.getElementById(id);
const base = location.origin + location.pathname;
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('certiratio-direct') : null;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const boot = hex(4); // tämä sivun lataus: vanhentuneen yhteyden tunnistamiseen
const params = new URLSearchParams(location.search);
let useStun = params.has('stun');
// Kohtaamispaikka: ?signal=URL, paikallisesta palvelimesta ladattuna sama palvelin; ?signal=off ei mitään.
const signalUrl = params.get('signal') === 'off' ? null : params.get('signal') ||
  (['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/` : null);

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
let inviteSeq = 0; // peruttu kutsu ei avaudu myöhässä

// Rengaspalvelimet (poc1/ringserver)
const cards = new Map(); // palvelin -> tuorein kortti { server, seq, port, fp, addrs, sig }
const serverTry = new Map(); // palvelin -> viimeisin yhteysyritys (ms)
const SERVER_RETRY_MS = 15000;
const CARD_FP = /^[A-Za-z0-9_-]{43}$/;

/** Kortti tai muu koodi (pairing.js). */
function decodeCode(text) {
  return isCard(text) ? { type: 'card', ...decodeCard(text) } : decodeAny(text);
}

// Kohtaamispaikka (renkaan huone)
let meet = null; // jäsenten yhteinen salaisuus (32 heksaa); ei tapahtumissa
let meetSig = null; // Signaling renkaan huoneeseen
let meetBusy = false;
let meetState = signalUrl ? 'connecting' : 'off'; // 'off' | 'connecting' | 'ok' | 'down'
let meetDelay = 2000;
let meetTimer = null;
const present = new Set(); // renkaan huoneessa nyt olevat tunnisteet
let stopped = false; // toinen välilehti otti renkaan

// --- Yhteydet -------------------------------------------------------------

function newLink(key, id = null) {
  const pc = new RTCPeerConnection({ iceServers: useStun ? [{ urls: STUN }] : [] });
  const link = { key, id, pc, ch: null, cls: 'unknown', detail: '', timer: null, deadline: null, nonce: hex(8),
    peerKey: null, peerBoot: null, verified: false, queue: [], chain: Promise.resolve(), peers: [], via: 'qr', meetSent: null };
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
  if (link.id) requeueDm(link.id);
  if (invite?.link === link && !invite.connected) {
    const i = invite;
    invite = null;
    clearTimeout(i.expire);
    i.sig?.close();
    if (why) pairFailed(why);
  }
  if (joining?.link === link && joining.stage === 'answer' && why) pairFailed(why);
  if (rejoin?.link === link && !link.verified) {
    rejoin = null;
    if (why) pairFailed(why);
  }
  // Renkaan huoneessa oleva jäsen: uusi yritys (esim. hän latasi sivun uudelleen).
  if (link.id && present.has(link.id)) setTimeout(() => consider(link.id), 1000);
  if (link.server || link.expect) setTimeout(autoServers, 3000); // palvelin katkesi: uusi yritys kortilla
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

/** Todennetut, avoimet naapurit (ei rengaspalvelimia: ne eivät ole jäseniä). */
function neighbours() {
  return [...links.values()].filter((l) => l.verified && !l.server && l.ch?.readyState === 'open').map((l) => l.id).sort();
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
  } else if (msg.type === 'meet') {
    // Rekisterin jälkeen: tuore jäsen tietää jo olevansa jäsen.
    mergeChain = mergeChain.then(() => onMeet(link, msg.secret));
  } else if (msg.type === 'card') {
    mergeChain = mergeChain.then(() => onCard(link, msg.card)); // rekisterin jälkeen: palvelimen avain tiedossa
  } else if (msg.type === 'enrolled') {
    await onEnrolled(link, msg);
  } else if (msg.type === 'dm') {
    onDm(link, msg);
  } else if (msg.type === 'dm-ack') {
    onDmAck(link, msg);
  } else if (msg.type === 'ev' || DIRECTED.has(msg.type)) {
    route(msg, link);
  }
}

/** Naapurin tunniste ja avain. Avaimen on vastattava tunnistetta ja rekisteriä. */
async function onHello(link, msg) {
  if (typeof msg.id !== 'string' || !ID.test(msg.id) || msg.id === myId || typeof msg.nonce !== 'string') return;
  if (msg.ring && ringId && msg.ring !== ringId) {
    log(`${msg.id}: kuuluu toiseen renkaaseen, ei yhdistetä`);
    if (invite?.link === link || joining?.link === link || rejoin?.link === link) pairFailed('koodi kuuluu toiseen renkaaseen');
    else if (link.enroll) pairFailed('palvelin kuuluu jo toiseen renkaaseen');
    drop(link, null);
    return;
  }
  if (typeof msg.key !== 'string' || (await idOf(msg.key)) !== msg.id) {
    log(`${msg.id}: avain ei vastaa tunnistetta, katkaistaan`);
    drop(link, null);
    return;
  }
  if (link.expect && msg.id !== link.expect) {
    log(`${msg.id}: kortti kuului toiselle palvelimelle, katkaistaan`);
    drop(link, null);
    return;
  }
  const registered = ring.info.get(msg.id)?.key ?? ring.servers.get(msg.id)?.key;
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
  link.server = msg.server === true; // rengaspalvelin (poc1/ringserver): esittelee, ei jäsen
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
  if (link.via === 'meet') {
    // Renkaan huoneeseen pääsee vain salaisuudella; jäsenyys silti tarkistetaan
    // (rekisteri voi olla vielä tulossa, jos hän liittyi poissaolon aikana).
    setTimeout(() => {
      if (links.get(link.key) === link && !isMember(link.id)) { log(`${nameOf(link.id)}: ei renkaan jäsen, katkaistaan`); drop(link, null); }
    }, 5000);
  }
  shareMeet();
  shareCards(link);
  flushDm(link.id);
  if (link.server && link.enroll) sendEnroll(link);
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

// --- Kahdenkeskiset viestit (dm.js) ---------------------------------------

// Lähtevä viesti: state 'pending' (odottaa yhteyttä) → 'sent' (lähetetty, ei kuitattu)
// → 'delivered' (vastaanottaja kuittasi). Katkos palauttaa kuittaamattoman lähtevään.
const dms = new Map(); // jäsen -> [{ id, out, text, at, seen, state? }]; tallennetaan selaimeen
const MAX_KEPT = 500; // viestiä keskustelua kohden
const MAX_OUTBOX = 100; // kuittaamatonta viestiä jäsentä kohden
let chatWith = null; // valittu jäsen
let dmsSaving = false;

/** Todennettu, avoin suora yhteys jäseneen (ei palvelin). */
function directTo(id) {
  const l = links.get(id);
  return l?.verified && !l.server && l.ch?.readyState === 'open' ? l : null;
}

/**
 * Viesti jäsenelle: lähtee heti suoraa yhteyttä pitkin, muuten jää lähtevään.
 * Palauttaa 'sent', 'queued' tai false (kelvoton tai lähtevä täynnä).
 */
function sendDM(to, text) {
  const t = cleanDm(text);
  if (!t || to === myId || !isMember(to)) return false;
  if ((dms.get(to) ?? []).filter((m) => m.out && m.state !== 'delivered').length >= MAX_OUTBOX) return false;
  const m = { id: hex(8), out: true, text: t, state: 'pending' };
  addDm(to, m);
  flushDm(to);
  persistDms();
  render();
  return m.state === 'sent' ? 'sent' : 'queued';
}

/** Lähtevät jäsenelle, jos suora yhteys on auki. */
function flushDm(to) {
  const link = directTo(to);
  if (!link || !isMember(to)) return;
  let any = false;
  for (const m of dms.get(to) ?? []) {
    if (!m.out || m.state !== 'pending') continue;
    send(link, { type: 'dm', from: myId, to, id: m.id, text: m.text });
    m.state = 'sent';
    any = true;
  }
  if (any) persistDms();
}

function onDm(link, msg) {
  if (link.server || !acceptDm(msg, { me: myId, peer: link.id, member: isMember(link.id) })) return;
  send(link, { type: 'dm-ack', id: msg.id });
  if ((dms.get(link.id) ?? []).some((m) => !m.out && m.id === msg.id)) return; // uudelleenlähetys
  addDm(link.id, { id: msg.id, out: false, text: msg.text });
  persistDms();
  render();
}

function onDmAck(link, msg) {
  if (link.server || !DM_ID.test(msg.id ?? '')) return;
  const m = (dms.get(link.id) ?? []).find((x) => x.out && x.id === msg.id);
  if (!m || m.state === 'delivered') return;
  m.state = 'delivered';
  persistDms();
  render();
}

/** Katkos: lähetetyt mutta kuittaamattomat takaisin lähtevään. */
function requeueDm(id) {
  for (const m of dms.get(id) ?? []) if (m.out && m.state === 'sent') m.state = 'pending';
}

function addDm(id, m) {
  const list = dms.get(id) ?? [];
  m.at = Date.now();
  m.seen = m.out;
  list.push(m);
  const old = list.length > MAX_KEPT ? list.findIndex((x) => !x.out || x.state === 'delivered') : -1;
  if (old >= 0) list.splice(old, 1); // lähtevässä odottavaa ei pudoteta
  dms.set(id, list);
}

/** Tallennus heti saman tehtävän lopussa: piilossa olevan sivun ajastimia hidastetaan jopa minuuttiin. */
function persistDms() {
  if (dmsSaving) return;
  dmsSaving = true;
  queueMicrotask(() => {
    dmsSaving = false;
    if (ringId) save('dms', { ringId, list: [...dms] }).catch(() => { stored = false; });
  });
}

async function restoreDmsFromStore() {
  let saved = null;
  try { saved = await load('dms'); } catch { return; }
  if (saved?.ringId !== ringId || !Array.isArray(saved.list)) return;
  for (const [id, list] of saved.list) {
    if (typeof id !== 'string' || !ID.test(id) || id === myId || !isMember(id)) continue;
    const ok = restoreDms(list, MAX_KEPT);
    if (ok.length) dms.set(id, ok);
  }
}

function selectPeer(id) {
  if (!isMember(id) || id === myId) return;
  chatWith = id;
  $('dm-note').textContent = '';
  render();
  $('dm-text').focus({ preventScroll: true });
}

// --- Verkon kautta välitetty yhteydenmuodostus ----------------------------

async function localSdp(link) {
  await gather(link.pc);
  return { type: link.pc.localDescription.type, sdp: filterSdp(link.pc.localDescription.sdp).sdp };
}

/** Tarjous jäsenelle: kohtaamispaikan kautta, jos hän on renkaan huoneessa, muuten verkon kautta. */
async function connectTo(p) {
  const viaMeet = !!meetSig && present.has(p);
  const link = newLink(p, p);
  link.via = viaMeet ? 'meet' : 'mesh';
  attach(link, link.pc.createDataChannel('direct', { ordered: true }));
  log(`${nameOf(p)}: ${viaMeet ? 'kohtaamispaikan' : 'esittely verkon'} kautta, muodostetaan yhteys`);
  await link.pc.setLocalDescription(await link.pc.createOffer());
  const data = { sdp: await localSdp(link), boot };
  if (viaMeet) meetSig?.send(p, data);
  else originate({ type: 'sig', to: p, data });
  render();
}

/** Tarjous tai vastaus; `reply` vie vastauksen samaa reittiä takaisin. */
async function onSig(from, data, hops, reply = (d) => originate({ type: 'sig', to: from, data: d })) {
  if (typeof data?.sdp?.sdp !== 'string' || !ID.test(from) || from === myId) return;
  const via = hops === 'meet' ? 'kohtaamispaikan kautta' : `esittely verkon kautta, välittäjiä ${hops}`;
  const desc = { type: data.sdp.type, sdp: filterSdp(data.sdp.sdp).sdp };
  try {
    if (desc.type === 'offer') {
      const old = links.get(from);
      // Avoin yhteys samaan sivun lataukseen riittää; uudelleen ladattu sivu korvaa vanhan.
      if (old?.ch?.readyState === 'open' && old.peerBoot === data.boot) return;
      if (old) drop(old, null);
      failed.delete(from);
      const link = newLink(from, from);
      link.via = hops === 'meet' ? 'meet' : 'mesh';
      log(`${nameOf(from)}: ${via}; vastataan`);
      await link.pc.setRemoteDescription(desc);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      reply({ sdp: await localSdp(link), boot });
      render();
    } else if (desc.type === 'answer') {
      const link = links.get(from);
      if (link?.pc.signalingState === 'have-local-offer') {
        log(`${nameOf(from)}: vastaus ${hops === 'meet' ? 'kohtaamispaikan kautta' : `verkon kautta, välittäjiä ${hops}`}`);
        await link.pc.setRemoteDescription(desc);
      }
    }
  } catch (e) {
    log(`${nameOf(from)}: signalointivirhe ${e.message}`);
  }
}

// --- Kohtaamispaikka -------------------------------------------------------

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, bad) => setTimeout(() => bad(new Error('ei vastausta')), ms))]);
}

/** Huone, jonka nimi on `room`; nimi on oma tunniste. Palauttaa { s, peers }. */
async function openSignal(room, ms = SIGNAL_MS) {
  const s = new Signaling(signalUrl, room, myId);
  try {
    const w = await withTimeout(s.connect(), ms);
    return { s, peers: Array.isArray(w.peers) ? w.peers : [] };
  } catch (e) {
    s.close();
    throw e;
  }
}

let probe = null;
/** Näkyykö oma IPv6-osoite ilman STUNia? iPhone ja työpöytä-Chrome piilottavat sen (mDNS). */
function checkAddress() {
  probe ??= (async () => {
    if (useStun) return;
    const pc = new RTCPeerConnection();
    pc.createDataChannel('probe');
    const g = gather(pc);
    await pc.setLocalDescription(await pc.createOffer());
    const { lines, mdns } = await g;
    pc.close();
    if (mdns && !lines.some((l) => pairable(candidateAddr(l) ?? ''))) {
      useStun = true;
      log('selain piilottaa osoitteensa, kysytään se STUN-palvelimelta');
    }
  })().catch(() => {});
  return probe;
}

async function meetRoom() {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`meet.${meet}`)));
  return `m-${[...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Renkaan huoneeseen: paikalla olevat jäsenet yhdistyvät suoraan. */
async function connectMeet() {
  if (!signalUrl || !meet || !isMember() || meetSig || meetBusy || stopped) return;
  meetBusy = true;
  clearTimeout(meetTimer);
  try {
    await checkAddress();
    const room = await meetRoom();
    const s = new Signaling(signalUrl, room, myId);
    meetSig = s;
    s.addEventListener('peer-joined', (e) => {
      if (meetSig !== s) return;
      present.add(e.detail.name);
      consider(e.detail.name);
      render();
    });
    s.addEventListener('peer-left', (e) => { if (meetSig === s) { present.delete(e.detail.name); render(); } });
    s.addEventListener('signal', (e) => {
      if (meetSig === s) onSig(e.detail.from, e.detail.data, 'meet', (d) => s.send(e.detail.from, d));
    });
    s.addEventListener('close', () => meetDown(s));
    let w;
    try {
      w = await withTimeout(s.connect(), SIGNAL_MS);
    } catch (e) {
      if (meetState !== 'down') log(`kohtaamispaikka: ${e.message}`);
      s.close();
      meetDown(s);
      return;
    }
    if (meetSig !== s) { s.close(); return; }
    meetState = 'ok';
    meetDelay = 2000;
    const peers = Array.isArray(w.peers) ? w.peers : [];
    log(`kohtaamispaikka: renkaan huoneessa ${peers.length} muuta`);
    present.clear();
    for (const p of peers) present.add(p);
    for (const p of peers) consider(p);
    render();
  } finally {
    meetBusy = false;
  }
}

function meetDown(s) {
  if (meetSig !== s) return;
  meetSig = null;
  present.clear();
  meetState = 'down';
  if (!stopped) {
    meetTimer = setTimeout(connectMeet, meetDelay);
    meetDelay = Math.min(meetDelay * 2, 30000);
  }
  render();
}

function closeMeet() {
  const s = meetSig;
  meetSig = null;
  present.clear();
  clearTimeout(meetTimer);
  s?.close();
}

/** Takaisin näkyviin tai verkkoon: yritetään heti. */
function kickMeet() {
  autoServers();
  if (meetSig || meetBusy || !isMember()) return;
  meetDelay = 2000;
  connectMeet();
}

/** Salaisuus todennetuille jäsenille, joilla sitä ei vielä ole tältä. */
function shareMeet() {
  if (!meet || !isMember()) return;
  for (const l of links.values()) {
    if (l.verified && isMember(l.id) && l.meetSent !== meet) {
      l.meetSent = meet;
      send(l, { type: 'meet', secret: meet });
    }
  }
}

/** Naapurin salaisuus: eri arvoista pienempi voittaa, joten kaikki päätyvät samaan huoneeseen. */
function onMeet(link, secret) {
  if (typeof secret !== 'string' || !SECRET.test(secret) || !isMember() || !isMember(link.id)) return;
  if (meet && secret >= meet) return;
  meet = secret;
  persistRing();
  log('kohtaamispaikka: renkaan huone saatu');
  closeMeet();
  meetDelay = 2000;
  connectMeet();
  shareMeet();
}

// --- Rengaspalvelin (poc1/ringserver) ---------------------------------------

/**
 * Yhteys rengaspalvelimeen kortilla: ei signalointia, palvelin esittelee paikalla
 * olevat. card: { fp (AA:BB:…), port, addrs }; expect: palvelimen tunniste
 * rekisteristä; enroll: liittämistunnus (palvelin renkaaseen).
 */
async function connectServer(card, { expect = null, enroll = null } = {}) {
  await checkAddress();
  const link = newLink(`srv-${++qrSeq}`);
  link.via = 'server';
  link.expect = expect;
  link.enroll = enroll;
  attach(link, link.pc.createDataChannel('direct', { ordered: true }));
  await link.pc.setLocalDescription(await link.pc.createOffer());
  const sdp = link.pc.localDescription.sdp;
  const ufrag = /^a=ice-ufrag:(\S+)/m.exec(sdp)?.[1];
  const mid = /^a=mid:(\S+)/m.exec(sdp)?.[1] ?? '0';
  await link.pc.setRemoteDescription({ type: 'answer', sdp: cardAnswer(card, ufrag, mid) });
  log(`${expect ? nameOf(expect) : 'rengaspalvelin'}: yhdistetään ${card.addrs.join(', ')} portti ${card.port}`);
  render();
  return link;
}

const serverLink = (id) => [...links.values()].find((l) => l.server && l.id === id && l.ch?.readyState === 'open');

/** Yhteys renkaan palvelimiin, joihin ei ole yhteyttä (sivu auki, näkyviin, verkko palasi, kortti vaihtui). */
/** Yhteys rengaspalvelimiin nyt ja 30 sekunnin välein (myös juuri liittyneellä). */
let serverTimer = null;
function startServers() {
  if (!serverTimer) serverTimer = setInterval(autoServers, 30000);
  autoServers();
}

function autoServers() {
  if (!isMember() || stopped) return;
  for (const [id, c] of cards) {
    if (!ring.servers.has(id) || serverLink(id)) continue;
    if ([...links.values()].some((l) => l.expect === id)) continue; // yritys käynnissä
    if (Date.now() - (serverTry.get(id) ?? 0) < SERVER_RETRY_MS) continue;
    serverTry.set(id, Date.now());
    connectServer({ fp: fpHex(c.fp), port: c.port, addrs: c.addrs }, { expect: id }).catch((e) => log(`${nameOf(id)}: ${e.message}`));
  }
}

/** Palvelimen kortti: tarkistetaan sen avaimella, tuoreempi talteen ja eteenpäin. */
async function onCard(via, c) {
  if (!c || typeof c !== 'object' || !ID.test(c.server ?? '') || !(Number.isSafeInteger(c.seq) && c.seq > 0)) return;
  if (!(Number.isInteger(c.port) && c.port > 0 && c.port < 65536) || !CARD_FP.test(c.fp ?? '')) return;
  if (!Array.isArray(c.addrs) || !c.addrs.length || c.addrs.length > 8 || !c.addrs.every((a) => typeof a === 'string' && pairable(a))) return;
  const srv = ring.servers.get(c.server);
  if (!srv || (cards.get(c.server)?.seq ?? 0) >= c.seq) return;
  const card = { server: c.server, seq: c.seq, port: c.port, fp: c.fp, addrs: c.addrs, sig: String(c.sig ?? '') };
  if (!(await verify(srv.key, cardPayload(ringId, card), card.sig))) return log(`${nameOf(c.server)}: kortin allekirjoitus ei kelpaa`);
  const moved = cards.has(c.server);
  cards.set(c.server, card);
  log(`${nameOf(c.server)}: kortti ${moved ? 'päivittyi' : 'saatu'} (${card.addrs.join(', ')})`);
  if (isMember()) persistRing();
  for (const l of links.values()) if (l !== via && l.verified && (isMember(l.id) || l.server)) send(l, { type: 'card', card });
  serverTry.delete(c.server);
  autoServers();
  render();
}

function shareCards(link) {
  if (!link.verified || !(isMember(link.id) || link.server)) return;
  link.cardsSent = true;
  for (const card of cards.values()) send(link, { type: 'card', card });
}

// --- Palvelimen liittäminen renkaaseen ---------------------------------------

/** Liittämislinkki (kortti ja tunnus): yhteys palvelimeen, joka allekirjoittaa server-tapahtumansa. */
async function enrollServer(card) {
  if (!isMember()) return note('Palvelimen voi liittää vain renkaan jäsen.');
  panel({ step: 'Liitetään rengaspalvelinta…', note: card.addrs.join(', '), secondary: ['Peru', showMember] });
  const link = await connectServer(card, { enroll: card.token });
  setTimeout(() => {
    if (link.enroll && links.get(link.key) === link) { drop(link, null); pairFailed('palvelin ei vastannut'); }
  }, CONNECT_TIMEOUT_MS);
}

function sendEnroll(link) {
  send(link, { type: 'enroll', token: link.enroll, ring: ringId, operator: myId, events: [...events.values()] });
}

async function onEnrolled(link, msg) {
  if (!link.enroll || !link.server) return;
  link.enroll = null;
  if (msg.ok !== true) {
    panel({ step: `Palvelinta ei liitetty: ${String(msg.why ?? 'tuntematon syy').slice(0, 100)}.`, close: true });
    return;
  }
  const name = cleanName(msg.name);
  if (msg.server !== link.id || msg.key !== link.peerKey || !name) return pairFailed('palvelimen vastaus ei täsmää');
  const ev = { kind: 'server', ring: ringId, member: link.id, key: link.peerKey, operator: myId, name };
  const p = payloadOf(ev);
  if (!(await verify(ev.key, p, msg.sig))) return pairFailed('palvelimen allekirjoitus ei kelpaa');
  ev.sigs = { member: msg.sig, operator: await sign(me.priv, p) };
  await publish(ev);
  done(`✅ Rengaspalvelin ${name} liitetty renkaaseen. Jäsenet yhdistävät siihen itsestään.`, null);
}

// --- Rengas ---------------------------------------------------------------

function isMember(id = myId) { return !!id && ring.members.includes(id); }

function nameOf(id) {
  if (!id) return null;
  return ring.info.get(id)?.name ?? ring.servers.get(id)?.name ?? peerInfo.get(id)?.name ?? id;
}

function iconOf(id) {
  return ring.info.get(id)?.icon ?? peerInfo.get(id)?.icon ?? '🧑';
}

const keyOf = (id) => (events.get(`${id}:f`) ?? events.get(`${id}:a`))?.key ?? null;

/** Oma uusi tapahtuma: talteen ja kaikille. */
async function publish(ev) {
  ev.id = eventId(ev.kind, ev.member);
  originate({ type: 'ev', ev }); // ennen omaa mergeä: tulokas saa liittymisensä ennen salaisuutta
  await merge([ev]);
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
    persistRing();
    if (!persisted) {
      persisted = true;
      navigator.storage?.persist?.().then((p) => log(`tallennus ${p ? 'pysyvä' : 'selaimen harkinnassa'}`), () => {});
    }
    shareMeet();
    // Liittyjä ei ollut jäsen, kun yhteys todennettiin: kortit hänelle vasta nyt.
    for (const l of links.values()) if (!l.cardsSent) shareCards(l);
    for (const id of dms.keys()) flushDm(id);
    connectMeet();
    startServers();
  }
  render();
}

function persistRing() {
  save('ring', { ringId, events: [...events.values()], meet, cards: [...cards.values()] }).catch(() => { stored = false; });
}

async function found(name, icon) {
  const salt = hex(4);
  ringId = await ringIdOf(me.key, salt);
  meet = hex(16);
  const ev = { kind: 'found', ring: ringId, member: myId, key: me.key, salt, name, icon };
  ev.sigs = { member: await sign(me.priv, payloadOf(ev)) };
  await publish(ev);
  showMember();
}

// --- Kutsu ja yhdistämiskoodi (näyttäjä) ----------------------------------

async function startInvite(kind = 'join') {
  if (!isMember()) return;
  endInvite();
  const ticket = ++inviteSeq;
  retryLast = () => startInvite(kind);
  if (kind === 'join' && signalUrl && (await startMeetInvite(ticket))) return;
  if (ticket !== inviteSeq) return;
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

/** Kutsu kertakäyttöisen kutsuhuoneen kautta: tulokas skannaa yhden koodin. */
async function startMeetInvite(ticket) {
  const right = successor(ring.members, myId);
  panel({ step: 'Avataan kutsu…', trio: trioNew(myId, right, null), secondary: ['Peru', cancelInvite] });
  await checkAddress();
  const token = hex(8);
  let s;
  try {
    ({ s } = await openSignal(`i-${token}`, 5000));
  } catch (e) {
    log(`kohtaamispaikka ei vastaa (${e.message}): kutsu QR-koodeilla`);
    return false;
  }
  if (ticket !== inviteSeq) { s.close(); return true; }
  const i = { kind: 'join', link: null, left: myId, right, member: null, memberKey: null, connected: false, sig: s, token };
  invite = i;
  i.expire = setTimeout(() => {
    if (invite !== i || i.link) return;
    endInvite();
    panel({ step: 'Kutsu vanheni. Tee uusi kutsu.', close: true });
  }, INVITE_MS);
  s.addEventListener('signal', (e) => {
    if (invite === i) answerJoiner(i, e.detail.from, e.detail.data).catch((err) => log(`kutsu: ${err.message}`));
  });
  showJoinCode(i);
  return true;
}

function showJoinCode(i) {
  const founding = i.right === myId;
  panel({
    step: 'Kutsu · Näytä tämä koodi uudelle jäsenelle. Hän skannaa sen puhelimensa kameralla.',
    note: founding ? 'Hänestä tulee renkaan toinen perustaja. Muuta ei tarvita.'
      : `Hän liittyy väliin: sinä – ${nameOf(i.right)}. Sen jälkeen ${nameOf(i.right)} näyttää hänelle oman koodinsa.`,
    trio: trioNew(myId, i.right, null),
    qr: `${base}#${encodeJoin(ringId, myId, i.right, i.token)}`,
    secondary: ['Peru', cancelInvite],
  });
}

/** Ensimmäinen kutsuhuoneeseen tullut tarjous saa vastauksen; koodi on kertakäyttöinen. */
async function answerJoiner(i, from, data) {
  if (i.link || !ID.test(from) || data?.sdp?.type !== 'offer' || typeof data.sdp.sdp !== 'string') return;
  const link = newLink(`qr-${++qrSeq}`);
  link.via = 'invite';
  i.link = link;
  log(`kutsu: tarjous kohtaamispaikan kautta (${from})`);
  panel({ step: 'Yhdistetään…', trio: trioNew(myId, i.right, null), secondary: ['Peru', cancelInvite] });
  await link.pc.setRemoteDescription({ type: 'offer', sdp: filterSdp(data.sdp.sdp).sdp });
  await link.pc.setLocalDescription(await link.pc.createAnswer());
  i.sig.send(from, { sdp: await localSdp(link), boot });
}

/** Kutsu pois: kutsuhuone kiinni, keskeneräinen yhteys katki. */
function endInvite() {
  const i = invite;
  if (!i) return;
  invite = null;
  clearTimeout(i.expire);
  i.sig?.close();
  if (i.link && !i.connected) drop(i.link, null);
}

function showInviteCode(token) {
  if (invite.kind === 'reconnect') {
    panel({
      step: 'Yhdistä 1/2 · Näytä tämä koodi palaavalle jäsenelle. Hän skannaa sen sivun omalla kameralla.',
      note: 'Hän painaa ensin "Yhdistä jäsen" → "Skannaa yhdistämiskoodi".',
      qr: `${base}#${token}`,
      primary: ['Skannaa hänen vastauksensa', () => scanAnswer(token)],
      secondary: ['Peru', cancelInvite],
     
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
   
  });
}

function scanAnswer(token) {
  panel({
    step: `${invite.kind === 'join' ? 'Kutsu' : 'Yhdistä'} 2/2 · Skannaa hänen näytöltään vastauskoodi.`,
    trio: invite.kind === 'join' ? trioNew(myId, invite.right, null) : null,
    cam: true,
    primary: ['Näytä koodi uudelleen', () => showInviteCode(token)],
    secondary: ['Peru', cancelInvite],
   
  });
}

function cancelInvite() {
  inviteSeq++;
  endInvite();
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
  invite.sig?.close(); // kertakäyttöinen kutsuhuone
  invite.sig = null;
  clearTimeout(invite.expire);
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
  joining = { token, offer, link: null, stage: 'profile', sig: null };
  const viaMeet = offer.type === 'join';
  const steps = offer.left === offer.right ? 1 : viaMeet ? 2 : 3;
  panel({
    step: `Liittyminen 1/${steps} · Sinut on kutsuttu renkaaseen. Kirjoita nimesi ja valitse kuva.`,
    profile: true,
    primary: ['Jatka', () => { if (readProfile()) (viaMeet ? joinViaMeet() : makeAnswer()); }],
  });
}

/** 2.j: tarjous kutsujalle kutsuhuoneen kautta, vastaus samaa reittiä. */
async function joinViaMeet() {
  const j = joining;
  const { left, right, token } = j.offer;
  panel({ step: 'Yhdistetään kutsujaan…', trio: trioNew(left, right, myId) });
  if (!signalUrl) return pairFailed('kohtaamispaikka ei ole käytössä');
  await checkAddress();
  let s, peers;
  try {
    ({ s, peers } = await openSignal(`i-${token}`));
  } catch (e) {
    return pairFailed(`kohtaamispaikka ei vastaa: ${e.message}`);
  }
  if (joining !== j) { s.close(); return; }
  if (!peers.includes(left)) {
    s.close();
    return pairFailed('kutsu on jo käytetty tai vanhentunut');
  }
  j.sig = s;
  const link = newLink(`qr-${++qrSeq}`);
  link.via = 'invite';
  j.link = link;
  j.stage = 'answer';
  s.addEventListener('signal', async (e) => {
    const d = e.detail.data;
    if (e.detail.from !== left || d?.sdp?.type !== 'answer' || link.pc.signalingState !== 'have-local-offer') return;
    try {
      await link.pc.setRemoteDescription({ type: 'answer', sdp: filterSdp(String(d.sdp.sdp)).sdp });
    } catch (err) {
      log(`kutsu: ${err.message}`);
    }
  });
  attach(link, link.pc.createDataChannel('direct', { ordered: true }));
  const gathering = gather(link.pc);
  await link.pc.setLocalDescription(await link.pc.createOffer());
  const g = await gathering;
  const sdp = filterSdp(link.pc.localDescription.sdp).sdp;
  if (!/^a=candidate:/m.test(sdp)) {
    s.close();
    j.sig = null;
    drop(link, null);
    j.stage = 'profile';
    return noAddress(g.mdns > 0, 'ei IPv6-osoitetta', joinViaMeet);
  }
  s.send(left, { sdp: { type: 'offer', sdp }, boot });
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
  joining.sig?.close();
  joining.sig = null;
  const { left, right } = joining.offer;
  if (left === right) {
    joining.stage = 'wait';
    panel({ step: 'Yhteys syntyi. Odotetaan liittymistä…', trio: trioNew(left, right, myId) });
    await claim(left, '');
    return;
  }
  joining.stage = 'vouch';
  panel({
    step: `Liittyminen ${joining.offer.type === 'join' ? '2/2' : '3/3'} · Skannaa koodi, jonka ${nameOf(right)} näyttää puhelimessaan.`,
    note: `Liityt väliin: ${nameOf(left)} – ${nameOf(right)}.`,
    trio: trioNew(left, right, myId),
    cam: true,
   
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
    step: 'Yhteys ei synny itsestään. Näytä yhdistämiskoodi paikalla olevalle jäsenelle: hän skannaa sen puhelimen kameralla.',
    note: 'Toimii myös toisin päin: hän näyttää koodin, ja sinä skannaat sen. Liittymistä ei tarvitse tehdä uudelleen.',
    primary: ['Näytä yhdistämiskoodi', () => startInvite('reconnect')],
    secondary: ['Skannaa yhdistämiskoodi', () => panel({
      step: 'Skannaa yhdistämiskoodi toisen jäsenen näytöltä.', cam: true, secondary: ['Peru', showMember],
    })],
    close: true,
  });
}

// --- Koodit kamerasta, linkistä tai toisesta välilehdestä ------------------

function handleCode(text) {
  let c;
  try {
    c = decodeCode(text);
  } catch (e) {
    note(`Koodi ei kelpaa: ${e.message}`);
    return false;
  }
  if (c.type === 'card' && isMember()) {
    if (c.token) enrollServer(c);
    else connectServer(c).catch((e) => log(`rengaspalvelin: ${e.message}`));
  } else if (c.type === 'answer' && invite?.link.pc.signalingState === 'have-local-offer') useAnswer(c);
  else if (c.type === 'vouch' && joining?.stage === 'vouch') useVouch(c);
  else if ((c.type === 'offer' || c.type === 'join') && !ringId) {
    const t = text.slice(text.indexOf('#') + 1);
    startJoin(decodeURIComponent(t), c);
  } else if (c.type === 'reconnect' && isMember() && c.ring === ringId && !rejoin) startRejoin(c);
  else {
    note(c.type === 'offer' || c.type === 'join' ? 'Tämä on kutsukoodi uudelle jäsenelle, ja tämä puhelin on jo renkaassa. Palaavana jäsenenä tarvitset yhdistämiskoodin.'
      : c.type === 'reconnect' && !isMember() ? 'Tämä on yhdistämiskoodi renkaan jäsenille. Uutena jäsenenä tarvitset kutsukoodin.'
        : c.type === 'reconnect' && c.ring !== ringId ? 'Tämä yhdistämiskoodi kuuluu toiseen renkaaseen.'
          : c.type === 'card' ? 'Tämä on rengaspalvelimen koodi. Sen voi käyttää vain renkaan jäsen.'
            : 'Tämä puhelin ei odota tätä koodia nyt.');
    return false;
  }
  return true;
}

function expects(c) {
  return (c.type === 'answer' && invite?.link.pc.signalingState === 'have-local-offer') ||
    (c.type === 'vouch' && joining?.stage === 'vouch') ||
    (c.type === 'reconnect' && isMember() && c.ring === ringId && !rejoin) ||
    (c.type === 'card' && isMember());
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
  stopped = true;
  closeMeet();
  endInvite();
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

$('dm').onsubmit = (ev) => {
  ev.preventDefault();
  const text = $('dm-text').value;
  if (!cleanDm(text)) return;
  const r = sendDM(chatWith, text);
  if (r) $('dm-text').value = '';
  $('dm-note').textContent = r === 'queued' ? `${nameOf(chatWith)} ei ole nyt paikalla: viesti lähtee, kun suora yhteys syntyy (tämä sivu auki).`
    : r ? '' : `Lähtevässä on jo ${MAX_OUTBOX} viestiä jäsenelle ${nameOf(chatWith)}. Kirjoitus jäi kenttään.`;
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
const scanner = createScanner($('cam'), (text) => {
  if (handleCode(text)) scanner.stop();
});

/**
 * Yksi näkymä kerrallaan. o: { step, note, trio, profile, qr, cam, primary: [teksti, fn],
 * secondary, close (Sulje-nappi) }.
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
  for (const [id, b] of [['primary', o.primary], ['secondary', o.secondary], ['close', o.close && ['Sulje', showMember]]]) {
    $(id).hidden = !b;
    if (b) { $(id).textContent = b[0]; $(id).onclick = b[1]; }
  }
  $('cam-box').hidden = !o.cam;
  scanner.stop();
  if (o.cam) {
    scanner.start().catch((e) => {
      $('cam-box').hidden = true;
      warn('meh', `Kameraa ei saatu (${e.message}). Salli kameran käyttö selaimen asetuksista ja yritä uudelleen, tai skannaa koodi puhelimen omalla kameralla.`);
    });
  }
}

function note(text) { $('pair-note').textContent = text; }

function warn(cls, text) {
  $('check').className = `check ${cls}`;
  $('check').textContent = text;
  $('check').hidden = false;
}

/** Jäsenen perusnäkymä: rengas, keskustelu valitun jäsenen kanssa ja napit. */
function showMember() {
  scanner.stop();
  $('pair').hidden = true;
  $('ringview').hidden = false;
  $('bar').hidden = false;
  $('info').hidden = false;
  $('chat').hidden = false;
  render();
  renderInstall();
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
  if (!member) { joining?.sig?.close(); joining = null; ringId = null; } // liittyjä aloittaa alusta uudella kutsukoodilla
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
    const s = document.createElement(m === myId ? 'span' : 'button');
    s.className = 'member';
    if (m === myId) s.classList.add('me');
    else {
      s.type = 'button';
      s.onclick = () => selectPeer(m);
      if (m === chatWith) s.classList.add('chosen');
    }
    s.classList.add(here.has(m) ? 'here' : 'away');
    if (now - (fresh.get(m) ?? 0) < FRESH_MS) s.classList.add('fresh');
    s.title = here.has(m) ? 'paikalla' : 'ei yhteyttä';
    const unread = m === myId ? 0 : (dms.get(m) ?? []).filter((x) => !x.out && !x.seen).length;
    const outbox = m === myId ? 0 : (dms.get(m) ?? []).filter((x) => x.out && x.state === 'pending').length;
    s.textContent = `${iconOf(m)} ${nameOf(m)}${unread ? ` (${unread})` : ''}${outbox ? ' ⏳' : ''}`;
    parts.push(s);
  });
  if (ring.members.length > 1) parts.push(Object.assign(document.createElement('span'), { className: 'arrow', textContent: '↺' }));
  box.replaceChildren(...parts);
}

const DM_STATE = { pending: ' ⏳ lähtevässä', sent: ' ✓', delivered: ' ✓✓' };

function renderChat() {
  if (chatWith && !isMember(chatWith)) chatWith = null;
  $('chat-empty').hidden = !!chatWith;
  $('chat-head').hidden = $('dm').hidden = !chatWith;
  if (!chatWith) return;
  const link = directTo(chatWith);
  $('chat-who').textContent = `${iconOf(chatWith)} ${nameOf(chatWith)}`;
  $('chat-path').textContent = `Jäsentunniste ${chatWith} · ${!link ? 'ei nyt paikalla: viestit jäävät lähtevään ja lähtevät, kun hän tulee paikalle'
    : link.cls === 'ipv6-direct' ? 'suora IPv6-yhteys' : 'suora yhteys'}`;
  $('chat-path').className = link ? 'ok' : 'bad';
  const list = dms.get(chatWith) ?? [];
  if (!document.hidden) for (const m of list) m.seen = true;
  const box = $('msgs');
  const key = `${chatWith}:${list.length}:${list.at(-1)?.id}:${list.map((m) => m.state ?? '').join()}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.replaceChildren(...list.map((m) => {
    const d = document.createElement('div');
    d.className = m.out ? 'msg out' : 'msg in';
    d.title = new Date(m.at).toLocaleString();
    d.textContent = m.text;
    if (m.out) {
      const st = document.createElement('span');
      st.className = `state ${m.state}`;
      st.textContent = DM_STATE[m.state];
      d.append(st);
    }
    return d;
  }));
  box.scrollTop = box.scrollHeight;
}

function render() {
  if (!myId) return;
  const tbody = $('peers');
  tbody.replaceChildren();
  let open = 0;
  for (const l of links.values()) {
    if (l.verified && !l.server && l.ch?.readyState === 'open') open++;
    const tr = document.createElement('tr');
    const who = l.id ? `${iconOf(l.id)} ${nameOf(l.id)}${l.server ? ' (palvelin)' : isMember(l.id) ? '' : ' (liittymässä)'}` : 'uusi';
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
  renderChat(); // ensin: luetut pois renkaan lukumääristä
  renderRing();
  const n = ring.members.length;
  const here = neighbours().filter((x) => isMember(x)).length + 1;
  const joiners = neighbours().length + 1 - here;
  const upServers = [...ring.servers.keys()].filter((id) => serverLink(id));
  const met = meetState === 'ok' || upServers.length > 0;
  const meetText = { off: '', connecting: ' · kohtaamispaikka…', ok: ' · kohtaamispaikka ✓', down: ' · kohtaamispaikka ei vastaa' }[meetState] +
    (!ring.servers.size ? '' : upServers.length ? ` · palvelin ✓${ring.servers.size > 1 ? ` ${upServers.length}/${ring.servers.size}` : ''}` : ' · palvelin ei vastaa');
  $('status').className = open || n === 1 || met ? 'ok' : 'bad';
  $('status').textContent = (n === 1 && !open ? 'Rengas aloitettu. Kutsu toinen perustaja.'
    : !open && met ? `Renkaassa ${n} · muita ei ole nyt paikalla. Yhteys syntyy itsestään, kun joku avaa sivun.`
      : !open ? `Renkaassa ${n} · ei yhteyksiä. Paina Yhdistä ja näytä koodi paikalla olevalle jäsenelle.`
        : `Renkaassa ${n} · paikalla ${here} · suoria yhteyksiä ${open}${joiners > 0 ? ` · liittymässä ${joiners}` : ''}`) + meetText;
  const right = isMember() ? successor(ring.members, myId) : null;
  $('invite').hidden = !isMember();
  $('invite').textContent = right === myId ? 'Kutsu toinen perustaja' : `Kutsu väliin: minä ja ${nameOf(right)}`;
  // Vain kun tarvitaan: joku puuttuu, eikä kohtaamispaikka tai rengaspalvelin vastaa (yhteys ei synny itsestään).
  // Puuttuva jäsen näyttää koodin, ja paikalla oleva skannaa sen puhelimen kameralla.
  $('reconnect').hidden = !isMember() || n < 2 || here >= n || met;
  $('info-sum').textContent = `yhteydet · minä ${profile.icon} ${profile.name || myId}`;
  $('me-info').textContent = `Tunniste ${myId} · avain ${me.key.slice(0, 12)}…` +
    (stored ? ' · tallennettu tähän selaimeen' : ' · ⚠️ selain ei salli tallennusta: jäsenyys katoaa, kun sivu suljetaan') +
    (signalUrl ? ` · kohtaamispaikka ${new URL(signalUrl).host} (näkee tunnisteet ja IPv6-osoitteet, ei tekstiä eikä rekisteriä)` : '') +
    (ring.servers.size ? ` · rengaspalvelimet: ${[...ring.servers].map(([id, sv]) => `${sv.name} ${serverLink(id) ? '✓' : cards.has(id) ? '(ei yhteyttä)' : '(ei korttia)'}`).join(', ')}`
      : signalUrl ? '' : ' · ei palvelinta: paluu yhdistämiskoodilla');
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
  panel({ step: 'Skannaa kutsujan näytöltä kutsukoodi.', cam: true, secondary: ['Takaisin', startScreen] });
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
  meet = SECRET.test(saved.meet ?? '') ? saved.meet : hex(16); // vanha tallenne: uusi, pienempi voittaa
  restoring = true;
  await merge(Array.isArray(saved.events) ? saved.events : []);
  restoring = false;
  if (!isMember()) { // esim. vain osa tallentui: aloitetaan alusta
    ringId = null;
    meet = null;
    events.clear();
    ring = build('00000000', []);
    return;
  }
  profileFromRing();
  for (const c of Array.isArray(saved.cards) ? saved.cards : []) await onCard(null, c);
  await restoreDmsFromStore();
  persistRing();
  log(`rengas ladattu: ${ring.members.length} jäsentä${ring.servers.size ? `, ${ring.servers.size} palvelinta` : ''}`);
}

async function main() {
  const hash = decodeURIComponent(location.hash.slice(1));
  history.replaceState(null, '', base + location.search);
  setupProfile();
  let first = null;
  try { first = hash ? decodeCode(hash) : null; } catch (e) { first = { error: e.message }; }

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
      try { c = decodeCode(ev.data.code); } catch { return; }
      if (expects(c)) {
        bc.postMessage({ ack: true });
        handleCode(ev.data.code);
      }
    };
  }
  $('invite').onclick = () => startInvite('join');
  $('reconnect').onclick = reconnectMenu;
  $('forget').onclick = async () => {
    if (!confirm('Poistetaanko jäsenyys ja avain tästä puhelimesta? Palataksesi renkaaseen tarvitset uuden kutsun.')) return;
    await clearStore().catch(() => {});
    location.reload();
  };

  addEventListener('online', kickMeet);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kickMeet(); });
  const member = isMember();
  if (member) { showMember(); connectMeet(); startServers(); }
  if (first?.type === 'card') {
    if (!member) startScreen();
    handleCode(hash);
  }
  if ((first?.type === 'offer' || first?.type === 'join') && !member) startJoin(hash, first);
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
  } else if (first?.type === 'offer' || first?.type === 'join') {
    panel({ step: 'Tämä puhelin on jo renkaassa.', note: 'Kutsukoodi on uudelle jäsenelle. Paluu tapahtuu itsestään (tai yhdistämiskoodilla).', close: true });
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
  get meet() { return meetState; },
  get present() { return [...present]; },
  /** Kuin kamera olisi lukenut koodin. */
  scan: (text) => handleCode(text),
  /** Kuin tapahtumat olisivat tulleet verkosta (väärennöstesti). */
  merge: (list) => merge(list),
  /** Kuin kamera olisi lukenut palvelimen kortin tai liittämislinkin. */
  server: (text) => handleCode(text),
  get servers() { return [...links.values()].filter((l) => l.server && l.verified).map((l) => l.id); },
  get registeredServers() { return [...ring.servers.keys()]; },
  get cards() { return [...cards.values()]; },
  /** Kahdenkeskinen viesti: 'sent' (suoralla yhteydellä), 'queued' (lähtevään) tai false. */
  dm: (to, text) => sendDM(to, text),
  /** Keskustelut: { jäsen: [{ id, out, text, at, state }] }. */
  get dms() { return Object.fromEntries([...dms].map(([id, list]) => [id, list.map(({ id: mid, out, text, at, state }) => ({ id: mid, out, text, at, state }))])); },
  select: (id) => selectPeer(id),
  /** Katkaisee suoran yhteyden naapuriin (testaa kiertoreittiä). */
  cut(id) { const l = links.get(id); if (l) drop(l, null); },
};
main();
