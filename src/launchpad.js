// IPv6 launchpad: saman huoneen selaimet suoralla IPv6-WebRTC-meshillä ja yksi
// yhteinen tekstivirta, johon jokainen merkki menee heti kaikille.
// Signalointi on Plan2001:n rtcsignal (jedi.ydns.eu:8443) tai poc1-palvelin.
// Vain IPv6: IPv4- ja mDNS-kandidaatit hylätään (mobiiliverkon IPv4 on CGNATin
// takana, eikä sen yli testata). PoC: ei tunnistusta, ei salausta sovellustasolla.

import { Signaling } from './signaling.js';
import { CLASSES, classifyPair, selectedPair } from './classify.js';
import { appended, candidateAddr, clampTint, filterSdp, keepCandidate, randomTint, rtcName, v6Scope } from './stream.js';

const PROTOCOL = 'certiratio-launchpad/1';
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_CHARS = 4096;
const CONNECT_TIMEOUT_MS = 20000;
const STATS_INTERVAL_MS = 2000;
const MAX_SPANS = 4000;
const INPUT_RESET = 64; // näkymätön syöte tyhjennetään, kun siinä on näin monta merkkiä

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const room = location.hash.slice(1) || 'launchpad';
// jedi on ulospäin vain IPv6. Muualta (esim. IPv4+IPv6-palvelimelta) ladattu
// sivu signaloi silti jediin, ja käynnistystesti näyttää, tavoittaako puhelin sen.
const JEDI = 'jedi.ydns.eu:8443';
const onJedi = location.host === JEDI;
const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const signalUrl = params.get('signal') ??
  (onJedi || local ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/` : `wss://${JEDI}/`);
// STUN vain kertoo selaimelle sen oman julkisen IPv6-osoitteen (työpöytä-Chrome
// piilottaa host-osoitteet mDNS-nimillä); liikenne kulkee silti suoraan. ?stun= ilman arvoa: ei STUNia.
const stun = params.get('stun') ?? 'stun:stun.l.google.com:19302';
const iceConfig = { iceServers: stun ? [{ urls: stun }] : [] };

const peers = new Map(); // nimi -> PeerState
const dropped = { local: 0, remote: 0 };
const gathered = { host: 0, srflx: 0, other: 0 };
let signaling = null;
let me = null;
let v6 = null; // käynnistystestin tulos
const myTint = randomTint();
const tints = new Map(); // nimi -> sävy (vertaisen lähettämä)

// --- Liittyminen ----------------------------------------------------------

async function join(ev) {
  ev.preventDefault();
  const nick = $('nick').value.trim();
  try { localStorage.setItem('launchpad-nick', nick); } catch {}
  $('join').disabled = true;
  const base = rtcName(nick);
  for (let i = 0; i < 4; i++) {
    const name = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const s = new Signaling(signalUrl, room, name);
    $('pad-status').textContent = 'yhdistetään…';
    try {
      const welcome = await s.connect();
      signaling = s;
      me = name;
      start(welcome.peers);
      return;
    } catch (e) {
      s.close();
      if (e.message !== 'name-taken') {
        $('pad-status').textContent = e.message === 'room-full' ? 'huone on täynnä (8 vertaista)' : `virhe: ${e.message}`;
        $('join').disabled = false;
        return;
      }
    }
  }
  $('pad-status').textContent = 'nimi on varattu';
  $('join').disabled = false;
}

function start(existing) {
  $('pad').hidden = true;
  $('info').hidden = false;
  $('stream').hidden = false;
  $('say').hidden = false;
  focusInput();
  log(`liityit huoneeseen ${room} nimellä ${me}${stun ? `, STUN ${stun}` : ', ei STUNia'}`);
  if (v6) log(`IPv6-testi: palvelin ${v6.server ? 'tavoitettu' : 'ei tavoitettu'}, oma osoite ${v6.scope ?? 'ei IPv6'}`);
  signaling.addEventListener('peer-joined', (e) => {
    const name = e.detail.name ?? e.detail.id;
    const old = peers.get(name);
    if (old) { closePeer(old); peers.delete(name); }
    log(`${name} liittyi`);
    render();
  });
  signaling.addEventListener('peer-left', (e) => log(`${e.detail.name ?? e.detail.id} poistui signaloinnista`));
  signaling.addEventListener('signal', (e) => onSignal(e.detail.from, e.detail.data));
  signaling.addEventListener('close', () => log('signalointi katkesi (avoimet P2P-yhteydet jatkavat)'));
  for (const name of existing) createPeer(name, true);
  render();
}

// --- Mesh (kuten nettest.js) -----------------------------------------------

function createPeer(name, initiator) {
  const pc = new RTCPeerConnection(iceConfig);
  const p = { name, pc, channel: null, pending: [], cls: 'unknown', detail: '', failed: false, timer: null, deadline: null };
  peers.set(name, p);

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    const line = ev.candidate.candidate;
    if (!line) return;
    const typ = / typ (\w+)/.exec(line)?.[1];
    if (!keepCandidate(line)) {
      dropped.local++;
      render();
      return;
    }
    gathered[typ === 'host' || typ === 'srflx' ? typ : 'other']++;
    signaling?.send(name, { candidate: ev.candidate.toJSON() });
    render();
  };
  pc.onconnectionstatechange = () => {
    log(`${name}: yhteys ${pc.connectionState}`);
    if (pc.connectionState === 'connected') clearTimeout(p.deadline);
    if (pc.connectionState === 'failed') markFailed(p, 'ICE epäonnistui');
    render();
  };
  pc.ondatachannel = (ev) => attachChannel(p, ev.channel);
  if (initiator) {
    attachChannel(p, pc.createDataChannel('launchpad', { ordered: true }));
    pc.onnegotiationneeded = async () => {
      await pc.setLocalDescription(await pc.createOffer());
      sendSdp(p);
    };
  }
  p.deadline = setTimeout(() => {
    if (pc.connectionState !== 'connected') markFailed(p, `ei IPv6-yhteyttä ${CONNECT_TIMEOUT_MS / 1000} s:ssa`);
  }, CONNECT_TIMEOUT_MS);
  p.timer = setInterval(() => updateStats(p), STATS_INTERVAL_MS);
  return p;
}

function sendSdp(p) {
  const d = p.pc.localDescription.toJSON();
  const f = filterSdp(d.sdp);
  dropped.local += f.dropped;
  signaling?.send(p.name, { sdp: { type: d.type, sdp: f.sdp } });
}

async function onSignal(from, data) {
  const p = peers.get(from) ?? createPeer(from, false);
  const { pc } = p;
  try {
    if (data?.sdp) {
      const f = filterSdp(String(data.sdp.sdp ?? ''));
      dropped.remote += f.dropped;
      await pc.setRemoteDescription({ type: data.sdp.type, sdp: f.sdp });
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        sendSdp(p);
      }
      for (const c of p.pending.splice(0)) await pc.addIceCandidate(c);
    } else if (data?.candidate) {
      if (!keepCandidate(data.candidate.candidate ?? '')) {
        dropped.remote++;
        render();
        return;
      }
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
      else p.pending.push(data.candidate);
    }
  } catch (e) {
    log(`${from}: signalointivirhe ${e.message}`);
  }
}

function attachChannel(p, ch) {
  p.channel = ch;
  ch.onopen = () => { log(`${p.name}: kanava auki`); render(); };
  ch.onclose = () => { log(`${p.name}: kanava suljettu`); render(); };
  ch.onmessage = (ev) => onChannelMessage(p, ev.data);
}

function onChannelMessage(p, raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) return;
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg?.protocol !== PROTOCOL || msg.type !== 'chars' || typeof msg.text !== 'string') return;
  const tint = clampTint(msg.tint);
  if (tint) tints.set(p.name, tint);
  addToStream(p.name, msg.text.slice(0, MAX_CHARS));
}

function markFailed(p, why) {
  if (p.failed) return;
  p.failed = true;
  p.cls = 'failed';
  log(`${p.name}: failed (${why})`);
  render();
}

function closePeer(p) {
  clearInterval(p.timer);
  clearTimeout(p.deadline);
  p.channel?.close();
  p.pc.close();
}

async function updateStats(p) {
  if (p.pc.connectionState === 'closed') return;
  const sel = selectedPair(await p.pc.getStats());
  if (!sel) return;
  let cls = classifyPair({ local: sel.local, remote: sel.remote, pairState: sel.pair.state });
  let detail = `${sel.local?.candidateType ?? '?'} → ${sel.remote?.candidateType ?? '?'}`;
  // Chrome piilottaa osoitteet (mDNS, prflx), mutta kumpikaan pää ei tiedä
  // toisen IPv4-osoitetta: onnistunut suora pari on IPv6.
  if (cls === 'unknown' && sel.pair.state === 'succeeded' &&
      sel.local?.candidateType !== 'relay' && sel.remote?.candidateType !== 'relay') {
    cls = 'ipv6-direct';
    detail += ' (päätelty)';
  }
  if (cls !== p.cls || detail !== p.detail) log(`${p.name}: reitti ${CLASSES[cls]} (${detail})`);
  p.cls = cls;
  p.detail = detail;
  if (cls !== 'failed') p.failed = false;
  render();
}

// --- Tekstivirta: yksi yhteinen kursori -----------------------------------
// Kaikkien merkit lisätään virran loppuun saapumisjärjestyksessä, joten
// samaan aikaan kirjoitettu sekoittuu ("huuda toisen päälle"). Nimiä ei
// näytetä: kirjoittajan erottaa vain hänen sävystään.

function broadcast(text) {
  const raw = JSON.stringify({ protocol: PROTOCOL, type: 'chars', text, tint: myTint });
  for (const p of peers.values()) if (p.channel?.readyState === 'open') p.channel.send(raw);
  addToStream(me, text);
}

function addToStream(author, text) {
  if (!text) return;
  const box = $('stream');
  const caret = $('caret');
  $('hint')?.remove();
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const last = caret.previousElementSibling;
  if (last?.dataset.author === author) {
    last.textContent += text;
  } else {
    const t = author === me ? myTint : tints.get(author) ?? { h: 0, s: 0, d: 0 };
    const span = document.createElement('span');
    span.dataset.author = author;
    span.style.setProperty('--h', t.h);
    span.style.setProperty('--s', `${t.s}%`);
    span.style.setProperty('--d', `${t.d}%`);
    span.textContent = text;
    caret.before(span);
    while (box.childElementCount > MAX_SPANS) box.firstElementChild.remove();
  }
  if (atBottom) box.scrollTop = box.scrollHeight;
}

// Näkymätön syöte avaa puhelimen näppäimistön; sen arvon muutos lähetetään.
let prev = '';
let composing = false;
function onInput() {
  const input = $('text');
  const text = appended(prev, input.value);
  prev = input.value;
  if (text) broadcast(text);
  if (!composing && input.value.length >= INPUT_RESET) {
    input.value = '';
    prev = '';
  }
}

function onEnter(ev) {
  ev.preventDefault();
  onInput();
  broadcast('\n');
  $('text').value = '';
  prev = '';
}

function focusInput() {
  $('text').focus({ preventScroll: true });
}

// --- Näkymä ---------------------------------------------------------------

function log(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  $('log').prepend(li);
  // rtcsignal kirjaa nämä jedin lokiin (pages.log): testin tulos näkyy palvelimelta.
  if (signaling?.ws?.readyState === WebSocket.OPEN) {
    signaling.ws.send(JSON.stringify({ type: 'log', name: me, line: `launchpad ${room}: ${text}` }));
  }
}

function render() {
  const tbody = $('peers');
  tbody.replaceChildren();
  let open = 0;
  for (const p of peers.values()) {
    if (p.channel?.readyState === 'open') open++;
    const tr = document.createElement('tr');
    [p.name, p.channel?.readyState === 'open' ? 'auki' : p.pc.connectionState, CLASSES[p.cls], p.detail || '–']
      .forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 2) td.className = `cls-${p.cls}`;
        tr.append(td);
      });
    tbody.append(tr);
  }
  $('info-sum').textContent = `${me}: ${open}/${peers.size} vertaista auki`;
  $('cands').textContent = `omat IPv6-kandidaatit: host ${gathered.host}, srflx ${gathered.srflx}` +
    ` · hylätty IPv4/mDNS: omat ${dropped.local}, vertaisten ${dropped.remote}`;
}

// --- Käynnistystesti: IPv6 ja sen julkisuus ------------------------------

async function serverReachable() {
  if (onJedi || local) return true; // sivu tuli jo IPv6-only-palvelimelta
  try {
    await fetch(`https://${JEDI}/src/stream.js`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(6000) });
    return true;
  } catch {
    return false;
  }
}

/** Selaimen omat IPv6-osoitteet ICE-kandidaateista (host ja STUNin srflx). */
async function ownV6() {
  const pc = new RTCPeerConnection(iceConfig);
  const found = [];
  pc.onicecandidate = (ev) => {
    const a = ev.candidate?.candidate && candidateAddr(ev.candidate.candidate);
    const scope = a && v6Scope(a);
    if (scope) found.push({ a, scope });
  };
  pc.createDataChannel('ipv6-testi');
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((ok) => {
    const t = setTimeout(ok, 5000);
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); ok(); } };
  });
  pc.close();
  for (const scope of ['global', 'ula', 'link-local', 'other']) {
    const hit = found.find((f) => f.scope === scope);
    if (hit) return hit;
  }
  return null;
}

function shortV6(a) {
  return a.split(':').slice(0, 3).join(':') + ':…';
}

async function bootCheck() {
  const box = $('check');
  box.className = 'check';
  box.textContent = 'Tutkitaan, eläkö puhelimesi jo 2010-lukua (IPv6)…';
  $('join').disabled = true;
  const [server, own] = await Promise.all([serverReachable(), ownV6().catch(() => null)]);
  v6 = { server, scope: own?.scope ?? null };
  const say = (cls, title, ...more) => {
    box.className = `check ${cls}`;
    box.replaceChildren(Object.assign(document.createElement('strong'), { textContent: title }),
      ...more.map((t) => Object.assign(document.createElement('p'), { textContent: t })));
  };
  if (!server) {
    say('bad', '🪵 Puhelimesi on vanha puukalikka, se ei tue IPv6-osoitteita. Osta uusi puhelin tai ota yhteyttä Claudeen tai ChatGPT:hen.',
      'Palvelin toimii kyllä. Se vain puhuu IPv6:ta, jota puukalikka ei ymmärrä.',
      'P.S. Puukalikka voi olla myös Wi-Fi: moni Wi-Fi tarjoaa vain IPv4:ää. Sulje Wi-Fi ja kokeile mobiilidataa – suomalaiset operaattorit antavat julkisen IPv6:n oletuksena.');
    return;
  }
  $('join').disabled = false;
  if (own?.scope === 'global') {
    say('ok', `✅ IPv6 OK! (${shortV6(own.a)}) Puhelimesi elää tulevaisuudessa – tervetuloa joukkoon.`);
  } else {
    say('meh', '🤔 IPv6 toimii, mutta osoitetta ei näy.', 'Yhteys muihin voi silti onnistua – kokeile.');
  }
}

// --- Käynnistys -----------------------------------------------------------

try { $('nick').value = localStorage.getItem('launchpad-nick') ?? ''; } catch {}
$('pad-status').textContent = `huone ${room}` + (window.isSecureContext ? '' : ' – ei suojattu konteksti, WebRTC ei toimi');
$('pad').onsubmit = join;
bootCheck();
$('text').oninput = onInput;
$('text').addEventListener('compositionstart', () => { composing = true; });
$('text').addEventListener('compositionend', () => { composing = false; onInput(); });
$('text').addEventListener('focus', () => $('stream').classList.add('typing'));
$('text').addEventListener('blur', () => $('stream').classList.remove('typing'));
$('say').onsubmit = onEnter; // Enter (↵) on rivinvaihto virtaan
$('stream').addEventListener('click', focusInput);
// Testejä varten (drive-cdp): sivun tila ilman moduulin sisäisiä muuttujia.
window.launchpad = { peers, dropped, gathered, get me() { return me; }, get v6() { return v6; } };
