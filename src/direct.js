// Suora pari ilman palvelinta: puhelin A näyttää WebRTC-tarjouksen QR-koodina,
// B skannaa sen kameralla (avautuu tämä sivu, #1.o.…) ja näyttää vastauksen
// QR-koodina, jonka A skannaa (uusi välilehti #1.a.… välittää sen A:n
// alkuperäiselle välilehdelle BroadcastChannelilla). Ei signalointi- eikä
// STUN-palvelinta: vain IPv6-osoitteet (pairing.js), teksti DataChannelissa.

import { CLASSES, classifyPair, selectedPair } from './classify.js';
import { decodePairing, encodePairing } from './pairing.js';
import { MAX_CHARS, createStreamView } from './streamview.js';

const PROTOCOL = 'certiratio-direct/1';
const MAX_MESSAGE_BYTES = 64 * 1024;
const GATHER_MS = 5000;
const CONNECT_TIMEOUT_MS = 45000;
const STUN = 'stun:stun.l.google.com:19302';

const $ = (id) => document.getElementById(id);
const base = location.origin + location.pathname;
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('certiratio-direct') : null;
let pc = null;
let channel = null;
let useStun = new URLSearchParams(location.search).has('stun');
let offerToken = null; // B: saatu tarjous (uusintaa varten)
let deadline = null;
let lastUrl = null; // näytetyn koodin linkki
let lastGather = []; // viimeksi kerätyt kandidaattirivit (testejä varten)

// --- Yhteys ---------------------------------------------------------------

function createPc() {
  pc?.close();
  pc = new RTCPeerConnection({ iceServers: useStun ? [{ urls: STUN }] : [] });
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') clearTimeout(deadline);
    if (pc.connectionState === 'failed') fail('Yhteys ei syntynyt (ICE epäonnistui).');
  };
  pc.ondatachannel = (ev) => attach(ev.channel);
  return pc;
}

/** Odottaa kandidaattien keräämisen; palauttaa onicecandidate-rivit ja mDNS-tiedon. */
function gather(conn) {
  const lines = [];
  let mdns = 0;
  conn.onicecandidate = (ev) => {
    const c = ev.candidate?.candidate;
    if (!c) return;
    lines.push(c);
    if (/ \S+\.local /.test(c)) mdns++;
  };
  return new Promise((ok) => {
    const t = setTimeout(done, GATHER_MS);
    conn.onicegatheringstatechange = () => { if (conn.iceGatheringState === 'complete') done(); };
    function done() { clearTimeout(t); ok({ lines, mdns }); }
  });
}

async function local(type, gathering) {
  const g = await gathering;
  lastGather = g.lines;
  try {
    return encodePairing(type, pc.localDescription.sdp, g.lines);
  } catch (e) {
    noAddress(g.mdns > 0, e.message);
    return null;
  }
}

function attach(ch) {
  channel = ch;
  ch.onopen = connected;
  ch.onclose = () => status('bad', 'Yhteys katkesi. Aloita uusi pari.');
  ch.onmessage = (ev) => {
    if (typeof ev.data !== 'string' || ev.data.length > MAX_MESSAGE_BYTES) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg?.protocol === PROTOCOL && msg.type === 'chars' && typeof msg.text === 'string') {
      view.add('toinen', msg.text.slice(0, MAX_CHARS), msg.tint);
    }
  };
}

const view = createStreamView({
  me: () => 'minä',
  send: (text, tint) => {
    if (channel?.readyState === 'open') channel.send(JSON.stringify({ protocol: PROTOCOL, type: 'chars', text, tint }));
  },
});

// --- A: tarjous -----------------------------------------------------------

async function startA() {
  step('Kerätään omat IPv6-osoitteet…');
  $('start').hidden = true;
  createPc();
  attach(pc.createDataChannel('direct', { ordered: true }));
  const gathering = gather(pc);
  await pc.setLocalDescription(await pc.createOffer());
  const token = await local('offer', gathering);
  if (!token) return;
  showCode(token, '1/2 Näytä tämä koodi toiselle puhelimelle. Hän skannaa sen kameralla.',
    'Kun toinen puhelin näyttää oman koodinsa, skannaa se omalla kamerallasi. Palaa sitten tähän välilehteen.');
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
  if (!pc || pc.signalingState !== 'have-local-offer') {
    step('Tämä välilehti ei odota vastausta. Aloita uusi pari.');
    return;
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
  waitConnect();
}

// --- B: vastaus -----------------------------------------------------------

async function startB(token) {
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
  createPc();
  const gathering = gather(pc);
  await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  const ans = await local('answer', gathering);
  if (!ans) return;
  showCode(ans, '2/2 Näytä tämä koodi ensimmäiselle puhelimelle. Hän skannaa sen kameralla.',
    'Yhteys syntyy heti, kun hän on skannannut koodin. Pidä tämä sivu auki.');
  waitConnect();
}

// --- Vastauksen välitys (A:n kamera avaa uuden välilehden) -----------------

function relayAnswer(token) {
  $('start').hidden = true;
  if (!bc) {
    relayFailed(token);
    return;
  }
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
  step('Avoinna olevaa paria ei löytynyt tästä selaimesta. Jos aloitit parin toisessa selaimessa, kopioi tämä linkki ja liitä se sinne.');
  showLinks(`${base}#${token}`);
}

// --- Näkymä ---------------------------------------------------------------

function step(text) {
  $('step').textContent = text;
}

function showLinks(url) {
  $('links').hidden = false;
  $('share').hidden = !navigator.share;
  $('share').onclick = () => navigator.share({ url }).catch(() => {});
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
  const box = $('check');
  box.hidden = false;
  if (mdns && !useStun) {
    box.className = 'check meh';
    box.textContent = '🤔 IPv6 toimii ehkä, mutta selain piilottaa osoitteensa. Ilman palvelinta toinen puhelin ei löydä sinua.';
    $('start').textContent = 'Kokeile STUN-avulla';
    $('start').hidden = false;
    $('start').onclick = () => { useStun = true; box.hidden = true; offerToken ? startB(offerToken) : startA(); };
  } else if (mdns) {
    box.className = 'check meh';
    box.textContent = '🤔 Selain piilottaa osoitteensa, eikä STUN-palvelinkaan kertonut sitä. Kokeile puhelimen Chromella tai yritä uudelleen.';
    $('start').textContent = 'Yritä uudelleen';
    $('start').hidden = false;
    $('start').onclick = () => { box.hidden = true; offerToken ? startB(offerToken) : startA(); };
  } else {
    box.className = 'check bad';
    box.textContent = '🪵 Puhelimesi on vanha puukalikka, se ei tue IPv6-osoitteita. Osta uusi puhelin tai ota yhteyttä Claudeen tai ChatGPT:hen. ' +
      '(P.S. Puukalikka voi olla myös Wi-Fi: sulje Wi-Fi ja kokeile mobiilidataa.)';
  }
  step(`Ei pariteltavaa IPv6-osoitetta (${why}).`);
}

function waitConnect() {
  clearTimeout(deadline);
  deadline = setTimeout(() => {
    if (channel?.readyState !== 'open') fail('Yhteys ei syntynyt 45 sekunnissa.');
  }, CONNECT_TIMEOUT_MS);
}

function fail(text) {
  if (channel?.readyState === 'open') return;
  status('bad', `${text} Molemmilla pitää olla IPv6 (mobiilidata), ja koodit skannataan puolin ja toisin. Aloita uusi pari.`);
  $('start').textContent = 'Uusi pari';
  $('start').hidden = false;
  $('start').onclick = () => { location.href = base; };
}

function status(cls, text) {
  $('status').hidden = false;
  $('status').className = cls;
  $('status').textContent = text;
}

async function connected() {
  $('pair').hidden = true;
  $('stream').hidden = false;
  $('say').hidden = false;
  view.focus();
  status('ok', '✅ Yhteys ilman palvelinta.');
  for (let i = 0; i < 5; i++) {
    const sel = selectedPair(await pc.getStats());
    if (sel?.pair.state === 'succeeded') {
      let cls = classifyPair({ local: sel.local, remote: sel.remote, pairState: sel.pair.state });
      // Vain IPv6-osoitteita vaihdettiin, joten onnistunut suora pari on IPv6.
      if (cls === 'unknown' && sel.local?.candidateType !== 'relay') cls = 'ipv6-direct';
      const rtt = sel.pair.currentRoundTripTime != null ? `, viive ${Math.round(sel.pair.currentRoundTripTime * 1000)} ms` : '';
      status('ok', `✅ Yhteys ilman palvelinta: ${CLASSES[cls]} (${sel.local?.candidateType} → ${sel.remote?.candidateType}${rtt}).`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// --- Käynnistys -----------------------------------------------------------

const hash = decodeURIComponent(location.hash.slice(1));
history.replaceState(null, '', base + location.search);
if (bc) {
  bc.onmessage = (ev) => {
    if (typeof ev.data?.answer === 'string' && pc?.signalingState === 'have-local-offer') {
      bc.postMessage({ ack: true });
      useAnswer(ev.data.answer);
    }
  };
}
$('use').onclick = () => {
  const v = $('paste').value.trim();
  useAnswer(v.includes('#') ? decodeURIComponent(v.slice(v.indexOf('#') + 1)) : v);
};

if (hash.startsWith('1.o.')) {
  startB(hash);
} else if (hash.startsWith('1.a.')) {
  relayAnswer(hash);
} else {
  step('Aloita, niin saat QR-koodin. Toinen puhelin skannaa sen kameralla.');
  $('start').hidden = false;
  $('start').onclick = startA;
}
// Testejä varten (drive-cdp): sivun tila.
window.direct = { get pc() { return pc; }, get channel() { return channel; }, get url() { return lastUrl; }, get gathered() { return lastGather; } };
