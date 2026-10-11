// PoC 1 verkkotesti (T6): WebRTC DataChannel -mesh ja valitun reitin luokittelu.
// Ei kirjanpitoa eikä avaimia; mittaa vain, millainen P2P-reitti muodostuu.

import { Signaling } from './signaling.js';
import { CLASSES, classifyPair, ipFamily, selectedPair } from './classify.js';

const PROTOCOL = 'certiration-nettest/1';
const MAX_MESSAGE_BYTES = 64 * 1024;
const STATS_INTERVAL_MS = 2000;

const $ = (id) => document.getElementById(id);
const peers = new Map(); // sessionId -> PeerState
const results = [];
const gathered = new Map(); // "type/family" -> count
let signaling = null;
let iceConfig = null;

// --- Asetukset ------------------------------------------------------------

function initForm() {
  const room = location.hash.slice(1) || randomRoom();
  $('room').value = room;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  $('signal-url').value = `${scheme}//${location.host}/signal`;
  $('secure').textContent = window.isSecureContext ? 'kyllä' : 'ei (käytä HTTPS:ää tai localhostia)';
  $('ua').textContent = navigator.userAgent;
}

function randomRoom() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function readIceConfig() {
  const iceServers = [];
  const stun = $('stun').value.trim();
  if (stun) iceServers.push({ urls: stun });
  const turn = $('turn').value.trim();
  if (turn) {
    iceServers.push({ urls: turn, username: $('turn-user').value, credential: $('turn-pass').value });
  }
  return {
    iceServers,
    iceTransportPolicy: $('relay-only').checked ? 'relay' : 'all',
  };
}

// --- Liittyminen ----------------------------------------------------------

async function join() {
  const room = $('room').value.trim();
  location.hash = room;
  iceConfig = readIceConfig();
  signaling = new Signaling($('signal-url').value.trim(), room);
  setStatus('yhdistetään signalingiin…');
  try {
    const welcome = await signaling.connect();
    $('self-id').textContent = welcome.id;
    setStatus(`huoneessa ${room}`);
    $('join').disabled = true;
    $('leave').disabled = false;
    for (const id of welcome.peers) createPeer(id, true);
  } catch (e) {
    setStatus(`virhe: ${e.message}`);
    signaling = null;
    return;
  }
  signaling.addEventListener('peer-joined', (e) => log(`vertainen ${short(e.detail.id)} liittyi`));
  signaling.addEventListener('peer-left', (e) => log(`vertainen ${short(e.detail.id)} poistui signalingista`));
  signaling.addEventListener('signal', (e) => onSignal(e.detail.from, e.detail.data));
  signaling.addEventListener('close', () => {
    $('signal-state').textContent = 'suljettu (avoimet P2P-yhteydet jatkavat)';
  });
  $('signal-state').textContent = 'auki';
}

function stopSignaling() {
  signaling?.close();
}

function leave() {
  stopSignaling();
  for (const p of peers.values()) closePeer(p);
  peers.clear();
  render();
  signaling = null;
  $('join').disabled = false;
  $('leave').disabled = true;
  $('signal-state').textContent = '–';
  setStatus('ei yhteydessä');
}

// --- Vertaisyhteydet ------------------------------------------------------

function createPeer(id, initiator) {
  const pc = new RTCPeerConnection(iceConfig);
  const p = {
    id, pc, initiator, channel: null, pendingCandidates: [],
    cls: 'unknown', detail: '', rtt: null, pingSent: new Map(), seq: 0, timer: null,
  };
  peers.set(id, p);

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      countGathered(ev.candidate);
      signaling?.send(id, { candidate: ev.candidate.toJSON() });
    }
  };
  pc.onconnectionstatechange = () => {
    log(`${short(id)}: yhteys ${pc.connectionState}`);
    if (pc.connectionState === 'failed') record(p, 'failed', {});
    render();
  };
  pc.oniceconnectionstatechange = render;
  pc.ondatachannel = (ev) => attachChannel(p, ev.channel);

  if (initiator) {
    attachChannel(p, pc.createDataChannel('nettest', { ordered: true }));
    pc.onnegotiationneeded = async () => {
      await pc.setLocalDescription(await pc.createOffer());
      signaling?.send(id, { sdp: pc.localDescription.toJSON() });
    };
  }
  p.timer = setInterval(() => updateStats(p), STATS_INTERVAL_MS);
  render();
  return p;
}

async function onSignal(from, data) {
  const p = peers.get(from) ?? createPeer(from, false);
  const { pc } = p;
  try {
    if (data?.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        signaling?.send(from, { sdp: pc.localDescription.toJSON() });
      }
      for (const c of p.pendingCandidates.splice(0)) await pc.addIceCandidate(c);
    } else if (data?.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
      else p.pendingCandidates.push(data.candidate);
    }
  } catch (e) {
    log(`${short(from)}: signalointivirhe ${e.message}`);
  }
}

function attachChannel(p, ch) {
  p.channel = ch;
  ch.onopen = () => {
    log(`${short(p.id)}: DataChannel auki`);
    sendPing(p);
    render();
  };
  ch.onclose = () => {
    log(`${short(p.id)}: DataChannel suljettu`);
    render();
  };
  ch.onmessage = (ev) => onChannelMessage(p, ev.data);
}

function onChannelMessage(p, raw) {
  // Koko tarkistetaan ennen jäsennystä (§7.2); vertaisen tekstiä ei renderöidä HTML:nä.
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) return;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg?.protocol !== PROTOCOL) return;
  if (msg.type === 'ping') {
    if (typeof msg.text === 'string' && msg.text) log(`${short(p.id)}: vastaanotettu "${msg.text.slice(0, 200)}"`);
    sendJson(p, { type: 'pong', seq: msg.seq, text: msg.text });
  } else if (msg.type === 'pong') {
    const sent = p.pingSent.get(msg.seq);
    if (sent === undefined) return;
    p.pingSent.delete(msg.seq);
    p.rtt = performance.now() - sent;
    if (typeof msg.text === 'string' && msg.text) log(`${short(p.id)}: kaiku "${msg.text.slice(0, 200)}"`);
    render();
  }
}

function sendJson(p, obj) {
  if (p.channel?.readyState === 'open') p.channel.send(JSON.stringify({ protocol: PROTOCOL, ...obj }));
}

function sendPing(p, text = '') {
  const seq = ++p.seq;
  p.pingSent.set(seq, performance.now());
  sendJson(p, { type: 'ping', seq, text });
}

function closePeer(p) {
  clearInterval(p.timer);
  p.channel?.close();
  p.pc.close();
}

// --- Tilastot ja luokittelu -----------------------------------------------

async function updateStats(p) {
  if (p.pc.connectionState === 'closed') return;
  const report = await p.pc.getStats();
  const sel = selectedPair(report);
  if (!sel) return;
  const cls = classifyPair({ local: sel.local, remote: sel.remote, pairState: sel.pair.state });
  const info = {
    local: sel.local?.candidateType ?? '?',
    remote: sel.remote?.candidateType ?? '?',
    protocol: sel.local?.protocol ?? '?',
    relayProtocol: sel.local?.relayProtocol ?? null,
    statsRttMs: sel.pair.currentRoundTripTime != null ? Math.round(sel.pair.currentRoundTripTime * 1000) : null,
  };
  const detail = `${info.local} → ${info.remote}, ${info.protocol}`;
  if (cls !== p.cls || detail !== p.detail) record(p, cls, info);
  p.cls = cls;
  p.detail = detail;
  p.statsRtt = info.statsRttMs;
  render();
}

function record(p, cls, info) {
  // Raporttiin ei tallenneta IP-osoitteita (§3.3), vain tyypit ja perhe.
  results.push({ at: new Date().toISOString(), peer: short(p.id), class: cls, ...info });
  log(`${short(p.id)}: reitti ${CLASSES[cls]}${info.local ? ` (${info.local} → ${info.remote}, ${info.protocol})` : ''}`);
}

function countGathered(c) {
  const fam = ipFamily(c.address);
  const key = `${c.type ?? '?'} / ${fam ? `IPv${fam}` : c.address?.endsWith('.local') ? 'mDNS' : '?'} / ${c.protocol ?? '?'}`;
  gathered.set(key, (gathered.get(key) ?? 0) + 1);
  renderGathered();
}

// --- Näkymä ---------------------------------------------------------------

function short(id) {
  return id.slice(0, 6);
}

function setStatus(text) {
  $('status').textContent = text;
}

function log(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  $('log').prepend(li);
}

function render() {
  const tbody = $('peers');
  tbody.replaceChildren();
  for (const p of peers.values()) {
    const tr = document.createElement('tr');
    const cells = [
      short(p.id),
      p.pc.connectionState,
      p.channel?.readyState ?? '–',
      CLASSES[p.cls],
      p.detail || '–',
      p.rtt != null ? `${p.rtt.toFixed(1)} ms` : '–',
      p.statsRtt != null ? `${p.statsRtt} ms` : '–',
    ];
    cells.forEach((text, i) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (i === 3) td.className = `cls cls-${p.cls}`;
      tr.append(td);
    });
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'ping';
    btn.disabled = p.channel?.readyState !== 'open';
    btn.onclick = () => sendPing(p, $('message').value);
    td.append(btn);
    tr.append(td);
    tbody.append(tr);
  }
  $('peer-count').textContent = String([...peers.values()].filter((p) => p.channel?.readyState === 'open').length);
}

function renderGathered() {
  const ul = $('gathered');
  ul.replaceChildren();
  for (const [k, n] of [...gathered].sort()) {
    const li = document.createElement('li');
    li.textContent = `${k}: ${n}`;
    ul.append(li);
  }
}

function exportJson() {
  const data = {
    tool: PROTOCOL,
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    ice: {
      servers: (iceConfig?.iceServers ?? []).map((s) => s.urls),
      transportPolicy: iceConfig?.iceTransportPolicy ?? null,
    },
    gatheredCandidates: Object.fromEntries(gathered),
    results,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nettest-${data.exportedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

initForm();
$('join').onclick = join;
$('leave').onclick = leave;
$('stop-signal').onclick = stopSignaling;
$('ping-all').onclick = () => peers.forEach((p) => sendPing(p, $('message').value));
$('export').onclick = exportJson;
