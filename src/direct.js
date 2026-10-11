// Suora verkko ilman palvelinta. Ensimmäinen yhteys kahden puhelimen välille
// syntyy QR-koodeilla (pairing.js): A näyttää tarjouksen, B skannaa sen
// kameralla (tämä sivu, #1.o.…) ja näyttää vastauksen, jonka A skannaa (uusi
// välilehti #1.a.… välittää sen A:n välilehdelle BroadcastChannelilla).
//
// Verkko kasvaa samalla tavalla: kuka tahansa jäsen voi kutsua uuden puhelimen
// QR-koodilla. Sen jälkeen jäsenet kertovat naapurinsa (hello), ja uusi puhelin
// muodostaa suoran yhteyden kaikkiin muihin. Tarjoukset ja vastaukset kulkevat
// olemassa olevia DataChanneleita pitkin, tarvittaessa usean puhelimen kautta
// (sig). Tekstivirta (chars) leviää kaikille; kukin välittää sen naapureilleen,
// joten se kiertää myös puuttuvan suoran yhteyden ohi.
// Vain IPv6; ei signalointi- eikä STUN-palvelinta.

import { CLASSES, classifyPair, selectedPair } from './classify.js';
import { decodePairing, encodePairing } from './pairing.js';
import { filterSdp } from './stream.js';
import { MAX_CHARS, createStreamView } from './streamview.js';

const PROTOCOL = 'certiratio-direct/2';
const MAX_MESSAGE_BYTES = 64 * 1024;
const GATHER_MS = 5000;
const CONNECT_TIMEOUT_MS = 45000;
const STATS_INTERVAL_MS = 3000;
const TTL = 8; // välityskertoja enintään
const MAX_SEEN = 20000;
const ID = /^[0-9a-f]{8}$/;
const STUN = 'stun:stun.l.google.com:19302';

const $ = (id) => document.getElementById(id);
const base = location.origin + location.pathname;
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('certiratio-direct') : null;
const myId = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');
let useStun = new URLSearchParams(location.search).has('stun');

/** Yhteydet naapureihin. Avain on naapurin id, tai 'qr-N', kunnes hello kertoo sen. */
const links = new Map();
const failed = new Set(); // id:t, joihin välitetty yhteys ei syntynyt (ei uusita)
const seen = new Set(); // käsiteltyjen sanomien mid:t
let seq = 0;
let qrSeq = 0;
let invite = null; // QR-kutsu, joka odottaa vastausta
let offerToken = null; // liittyjä: saatu tarjous (uusintaa varten)
let inMesh = false;
let lastHello = '';
let lastUrl = null; // näytetyn koodin linkki (testejä varten)
let lastGather = []; // viimeksi kerätyt kandidaattirivit (testejä varten)

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
  log(`${link.id ?? 'uusi'}: ${why ?? 'suljettu'}`);
  if (link === invite) {
    invite = null;
    if (why) inviteFailed(why);
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
    send(link, { type: 'hello', id: myId, peers: neighbours() });
    if (!inMesh) enterMesh();
    if (link === invite) { invite = null; hidePair(); }
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

/** Naapurilista kaikille, kun se muuttuu: näin jäsenet oppivat toisensa. */
function sendHello() {
  const peers = neighbours();
  const key = peers.join(',');
  if (key === lastHello) return;
  lastHello = key;
  for (const l of links.values()) send(l, { type: 'hello', id: myId, peers });
}

// --- Sanomat --------------------------------------------------------------

function onMessage(link, msg) {
  if (msg.type === 'hello') {
    if (typeof msg.id !== 'string' || !ID.test(msg.id) || msg.id === myId) return;
    if (!link.id) {
      const other = links.get(msg.id);
      if (other && other.ch?.readyState === 'open') { drop(link, null); return; } // kaksoisyhteys
      if (other) drop(other, null);
      links.delete(link.key);
      link.id = link.key = msg.id;
      links.set(link.key, link);
      log(`${link.id}: mukana`);
    }
    if (Array.isArray(msg.peers)) for (const p of msg.peers.slice(0, 64)) consider(p);
    sendHello();
    render();
  } else if (msg.type === 'sig' || msg.type === 'chars') {
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
  if (typeof msg.mid !== 'string' || seen.has(msg.mid) || typeof msg.from !== 'string') return;
  remember(msg.mid);
  if (msg.type === 'chars' && typeof msg.text === 'string' && msg.from !== myId) {
    view.add(msg.from, msg.text.slice(0, MAX_CHARS), msg.tint);
  }
  if (msg.type === 'sig' && msg.to === myId) {
    onSig(msg.from, msg.data, TTL - (msg.ttl ?? TTL));
    return;
  }
  if (!(msg.ttl > 1)) return;
  const fwd = { ...msg, ttl: msg.ttl - 1 };
  const direct = msg.type === 'sig' && links.get(msg.to);
  if (direct?.ch?.readyState === 'open') send(direct, fwd);
  else for (const l of links.values()) if (l !== via) send(l, fwd);
}

// --- Verkon kautta välitetty yhteydenmuodostus ----------------------------

async function localSdp(link) {
  await gather(link.pc);
  return { type: link.pc.localDescription.type, sdp: filterSdp(link.pc.localDescription.sdp).sdp };
}

async function connectTo(p) {
  const link = newLink(p, p);
  attach(link, link.pc.createDataChannel('direct', { ordered: true }));
  log(`${p}: esittely verkon kautta, muodostetaan yhteys`);
  await link.pc.setLocalDescription(await link.pc.createOffer());
  originate({ type: 'sig', to: p, data: { sdp: await localSdp(link) } });
  render();
}

async function onSig(from, data, hops) {
  if (!ID.test(from) || typeof data?.sdp?.sdp !== 'string') return;
  const desc = { type: data.sdp.type, sdp: filterSdp(data.sdp.sdp).sdp };
  try {
    if (desc.type === 'offer') {
      const old = links.get(from);
      if (old?.ch?.readyState === 'open') return;
      if (old) drop(old, null);
      failed.delete(from);
      const link = newLink(from, from);
      log(`${from}: esittely verkon kautta, välittäjiä ${hops}; vastataan`);
      await link.pc.setRemoteDescription(desc);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      originate({ type: 'sig', to: from, data: { sdp: await localSdp(link) } });
      render();
    } else if (desc.type === 'answer') {
      const link = links.get(from);
      if (link?.pc.signalingState === 'have-local-offer') {
        log(`${from}: vastaus verkon kautta, välittäjiä ${hops}`);
        await link.pc.setRemoteDescription(desc);
      }
    }
  } catch (e) {
    log(`${from}: signalointivirhe ${e.message}`);
  }
}

// --- QR: kutsu (ensimmäinen puhelin tai kuka tahansa jäsen) -----------------

async function startInvite() {
  if (invite) drop(invite, null);
  showPair();
  step('Kerätään omat IPv6-osoitteet…');
  $('start').hidden = true;
  const link = newLink(`qr-${++qrSeq}`);
  clearTimeout(link.deadline); // QR-skannaus saa kestää
  invite = link;
  attach(link, link.pc.createDataChannel('direct', { ordered: true }));
  const gathering = gather(link.pc);
  await link.pc.setLocalDescription(await link.pc.createOffer());
  const token = await local(link, 'offer', gathering);
  if (!token) return;
  showCode(token, inMesh
    ? 'Uusi puhelin skannaa tämän koodin kameralla.'
    : '1/2 Näytä tämä koodi toiselle puhelimelle. Hän skannaa sen kameralla.',
  'Kun uusi puhelin näyttää oman koodinsa, skannaa se omalla kamerallasi. Palaa sitten tähän välilehteen.');
  $('answer-box').hidden = false;
}

async function useAnswer(token) {
  let ans;
  try {
    ans = decodePairing(token);
    if (ans.type !== 'answer') throw new Error('tämä on tarjous, ei vastaus');
  } catch (e) {
    step(`Koodi ei kelpaa: ${e.message}`);
    return;
  }
  const link = invite;
  if (link?.pc.signalingState !== 'have-local-offer') {
    step('Tämä välilehti ei odota vastausta.');
    return;
  }
  await link.pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
  step('Yhdistetään…');
  armDeadline(link);
}

function inviteFailed(why) {
  showPair();
  step(`Yhteys ei syntynyt (${why}). Molemmilla pitää olla IPv6 (mobiilidata), ja koodit skannataan puolin ja toisin.`);
  $('start').textContent = inMesh ? 'Kutsu uudelleen' : 'Uusi yritys';
  $('start').hidden = false;
  $('start').onclick = startInvite;
}

// --- QR: liittyjä ---------------------------------------------------------

async function startJoin(token) {
  offerToken = token;
  let offer;
  try {
    offer = decodePairing(token);
    if (offer.type !== 'offer') throw new Error('odotettiin tarjousta');
  } catch (e) {
    step(`Koodi ei kelpaa: ${e.message}`);
    return;
  }
  step('Tehdään vastaus…');
  $('start').hidden = true;
  const link = newLink(`qr-${++qrSeq}`);
  const gathering = gather(link.pc);
  await link.pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
  await link.pc.setLocalDescription(await link.pc.createAnswer());
  const ans = await local(link, 'answer', gathering);
  if (!ans) return;
  armDeadline(link);
  showCode(ans, '2/2 Näytä tämä koodi puhelimelle, jonka koodin skannasit. Hän skannaa sen kameralla.',
    'Yhteys syntyy heti, kun hän on skannannut koodin, ja hän esittelee sinut muille. Pidä tämä sivu auki.');
}

async function local(link, type, gathering) {
  const g = await gathering;
  try {
    return encodePairing(type, link.pc.localDescription.sdp, g.lines);
  } catch (e) {
    if (link === invite) invite = null;
    drop(link, null);
    noAddress(g.mdns > 0, e.message);
    return null;
  }
}

// --- Vastauksen välitys (kameran avaama välilehti) -------------------------

function relayAnswer(token) {
  if (!bc) { relayFailed(token); return; }
  let acked = false;
  bc.onmessage = (ev) => {
    if (ev.data?.ack) {
      acked = true;
      step('✅ Vastaus välitetty. Palaa edelliseen välilehteen – keskustelu on siellä.');
      setTimeout(() => window.close(), 1500);
    }
  };
  bc.postMessage({ answer: token });
  step('Välitetään vastausta…');
  setTimeout(() => { if (!acked) relayFailed(token); }, 2500);
}

function relayFailed(token) {
  step('Kutsua odottavaa välilehteä ei löytynyt tästä selaimesta. Jos kutsuit toisessa selaimessa, kopioi tämä linkki ja liitä se sinne.');
  showLinks(`${base}#${token}`);
}

// --- Näkymä ---------------------------------------------------------------

const view = createStreamView({
  me: () => myId,
  send: (text, tint) => originate({ type: 'chars', text, tint }),
});

function step(text) { $('step').textContent = text; }

function showPair() {
  $('pair').hidden = false;
  $('pair').classList.toggle('overlay', inMesh);
  $('cancel').hidden = !inMesh;
  $('qr').setAttribute('hidden', '');
  $('links').hidden = true;
  $('answer-box').hidden = true;
  $('check').hidden = true;
  $('pair-note').textContent = '';
}

function hidePair() {
  $('pair').hidden = true;
  view.focus();
}

function showLinks(url) {
  $('links').hidden = false;
  $('share').hidden = !navigator.share;
  $('share').onclick = () => navigator.share({ url }).catch(() => {});
  $('copy').textContent = 'Kopioi linkki';
  $('copy').onclick = () => navigator.clipboard.writeText(url).then(() => { $('copy').textContent = 'Kopioitu ✓'; }, () => {});
}

function showCode(token, title, note) {
  const url = `${base}#${token}`;
  lastUrl = url;
  step(title);
  drawQr($('qr'), url);
  $('qr').removeAttribute('hidden'); // SVG:llä ei ole hidden-ominaisuutta
  showLinks(url);
  $('pair-note').textContent = note;
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

function noAddress(mdns, why) {
  showPair();
  const box = $('check');
  box.hidden = false;
  const retry = () => { box.hidden = true; offerToken ? startJoin(offerToken) : startInvite(); };
  if (mdns && !useStun) {
    box.className = 'check meh';
    box.textContent = '🤔 IPv6 toimii ehkä, mutta selain piilottaa osoitteensa. Ilman palvelinta toinen puhelin ei löydä sinua.';
    $('start').textContent = 'Kokeile STUN-avulla';
    $('start').onclick = () => { useStun = true; retry(); };
  } else if (mdns) {
    box.className = 'check meh';
    box.textContent = '🤔 Selain piilottaa osoitteensa, eikä STUN-palvelinkaan kertonut sitä. Kokeile puhelimen Chromella tai yritä uudelleen.';
    $('start').textContent = 'Yritä uudelleen';
    $('start').onclick = retry;
  } else {
    box.className = 'check bad';
    box.textContent = '🪵 Puhelimesi on vanha puukalikka, se ei tue IPv6-osoitteita. Osta uusi puhelin tai ota yhteyttä Claudeen tai ChatGPT:hen. ' +
      '(P.S. Puukalikka voi olla myös Wi-Fi: sulje Wi-Fi ja kokeile mobiilidataa.)';
    $('start').textContent = 'Yritä uudelleen';
    $('start').onclick = retry;
  }
  $('start').hidden = false;
  step(`Ei pariteltavaa IPv6-osoitetta (${why}).`);
}

function enterMesh() {
  inMesh = true;
  $('bar').hidden = false;
  $('info').hidden = false;
  $('stream').hidden = false;
  $('say').hidden = false;
  hidePair();
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
  if (cls !== link.cls) log(`${link.id ?? 'uusi'}: ${CLASSES[cls]} (${detail})`);
  link.cls = cls;
  link.detail = detail;
  render();
}

function render() {
  const tbody = $('peers');
  tbody.replaceChildren();
  let open = 0;
  for (const l of links.values()) {
    if (l.ch?.readyState === 'open') open++;
    const tr = document.createElement('tr');
    [l.id ?? 'uusi', l.ch?.readyState === 'open' ? 'auki' : l.pc.connectionState, `${CLASSES[l.cls]}${l.detail ? ` (${l.detail})` : ''}`]
      .forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 2) td.className = `cls-${l.cls}`;
        tr.append(td);
      });
    tbody.append(tr);
  }
  $('status').className = open ? 'ok' : 'bad';
  $('status').textContent = open
    ? `✅ Verkossa ${neighbours().length + 1} puhelinta · suoria yhteyksiä ${open}`
    : 'Ei yhteyksiä. Kutsu uusi puhelin.';
  $('info-sum').textContent = `minä: ${myId}`;
}

function log(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  $('log').prepend(li);
}

// --- Käynnistys -----------------------------------------------------------

const hash = decodeURIComponent(location.hash.slice(1));
history.replaceState(null, '', base + location.search);
if (bc) {
  bc.onmessage = (ev) => {
    if (typeof ev.data?.answer === 'string' && invite?.pc.signalingState === 'have-local-offer') {
      bc.postMessage({ ack: true });
      useAnswer(ev.data.answer);
    }
  };
}
$('use').onclick = () => {
  const v = $('paste').value.trim();
  useAnswer(v.includes('#') ? decodeURIComponent(v.slice(v.indexOf('#') + 1)) : v);
};
$('invite').onclick = startInvite;
$('cancel').onclick = () => { if (invite) drop(invite, null); hidePair(); };

if (hash.startsWith('1.o.')) {
  startJoin(hash);
} else if (hash.startsWith('1.a.')) {
  relayAnswer(hash);
} else {
  step('Aloita, niin saat QR-koodin. Toinen puhelin skannaa sen kameralla.');
  $('start').hidden = false;
  $('start').onclick = startInvite;
}
// Testejä varten (drive-direct): sivun tila.
window.direct = {
  get id() { return myId; },
  get url() { return lastUrl; },
  get gathered() { return lastGather; },
  get open() { return neighbours(); },
  /** Katkaisee suoran yhteyden naapuriin (testaa kiertoreittiä). */
  cut(id) { const l = links.get(id); if (l) drop(l, null); },
};
