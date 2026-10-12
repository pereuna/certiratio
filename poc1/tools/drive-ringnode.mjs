// Rengaspalvelin renkaan solmuna (DevTools-protokolla, kolme Chromiumia):
// isi perustaa renkaan ja kutsuu Törtön QR-koodeilla (?signal=off), molemmat
// yhdistävät rengaspalvelimeen kortilla. Törtön välilehti suljetaan ja avataan,
// ja hän yhdistää vain palvelimeen: palvelin esittelee hänet isille, ja suora
// yhteys ja teksti palaavat. Vieras (oma selain, ei jäsen) katkaistaan.
//   node --experimental-websocket drive-ringnode.mjs BASE_URL KORTTI PORT_ISI PORT_TORTTO PORT_VIERAS
// BASE_URL on direct.html (esim. http://localhost:8090/direct.html). Profiilit tyhjinä.
const [base, card, ...ports] = process.argv.slice(2);
const page = `${base}?signal=off`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

async function open(port, url, label) {
  const t = await (await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let n = 0; const wait = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); wait.get(m.id)?.(m); };
  const ev = (expression) => new Promise((ok) => {
    const id = ++n; wait.set(id, (m) => ok(m.result?.result?.value));
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  for (let i = 0; i < 40 && !(await ev('!!window.direct?.id')); i++) await sleep(250);
  return { label, ev, close: () => fetch(`http://localhost:${port}/json/close/${t.id}`) };
}
const until = async (t, expr, ms = 30000) => {
  for (let i = 0; i < ms / 250; i++) { const v = await t.ev(expr); if (v) return v; await sleep(250); }
  throw new Error(`${t.label}: aikakatkaisu ${expr} / ${await t.ev(`direct.step + ' | ' + document.getElementById('log').textContent`)}`);
};
const profile = (t, name, icon) => t.ev(`(() => { document.getElementById('name').value = ${J(name)};
  document.querySelector('[data-icon="${icon}"]').click(); document.getElementById('primary').click(); })()`);
const type = (t, text) => t.ev(`(() => { const e = document.getElementById('text'); e.value = ${J(text)}; e.dispatchEvent(new Event('input')); })()`);
const textFrom = (t, id) => t.ev(`[...document.querySelectorAll('#stream span[data-author]')].filter((x) => x.dataset.author === ${J(id)}).map((x) => x.textContent).join('')`);
let ok = true;
const check = (what, fine, detail = '') => { console.log(`${what}: ${fine ? 'OK' : 'VIRHE'}${detail ? ` (${detail})` : ''}`); ok &&= fine; };

// Rengas QR-koodeilla.
const isi = await open(ports[0], page, 'isi');
await profile(isi, 'isi', '👨');
await until(isi, 'direct.ring.length === 1');
await isi.ev(`document.getElementById('invite').click()`);
const offer = await until(isi, `direct.url?.includes('#2.o.') && direct.url`);
let tortto = await open(ports[1], offer.replace('#', '?signal=off#'), 'Törttö');
await until(tortto, `!document.getElementById('profile').hidden`);
await profile(tortto, 'Törttö', '🐈');
const answer = await until(tortto, `direct.url?.includes('#2.a.') && direct.url`);
await isi.ev(`document.getElementById('primary').click()`);
await isi.ev(`direct.scan(${J(answer)})`);
await until(tortto, `direct.ring.join() === 'isi,Törttö'`);
await until(isi, `direct.ring.join() === 'isi,Törttö'`);
console.log('rengas isi → Törttö QR-koodeilla');

// Molemmat palvelimeen.
for (const t of [isi, tortto]) await t.ev(`direct.server(${J(card)})`);
for (const t of [isi, tortto]) await until(t, 'direct.servers.length === 1');
check('isi ja Törttö todennettu rengaspalvelimeen', true);
check('palvelin ei näy jäsenten naapurina', (await isi.ev('direct.open.length')) === 1, J(await isi.ev('direct.open')));

// Törttö sulkee sivun ja palaa: vain palvelimen kortti, ei QR-koodeja.
const torttoId = await tortto.ev('direct.id');
await tortto.close();
await until(isi, `!direct.open.includes(${J(torttoId)})`, 60000);
tortto = await open(ports[1], page, 'Törttö');
await until(tortto, `direct.ring.join() === 'isi,Törttö' && direct.open.length === 0`);
const t0 = Date.now();
await tortto.ev(`direct.server(${J(card)})`);
await until(tortto, `direct.open.length === 1`, 30000);
check('Törttö palaa: palvelin esitteli isin, suora yhteys ilman koodeja', true, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
const peers = await tortto.ev(`[...document.querySelectorAll('#peers tr')].map((tr) => tr.textContent).join(' / ')`);
check('suora yhteys isiin, ei palvelimen kautta', /isi.*IPv6 direct/.test(peers) || /isi.*auki/.test(peers), peers);
await type(tortto, 'miau palvelimen esittelemänä');
await sleep(1200);
const got = await textFrom(isi, torttoId);
check('teksti perillä', got.endsWith('miau palvelimen esittelemänä'), got);

// Vieras: oma selain ja oma rengas; palvelin katkaisee.
const vieras = await open(ports[2], page, 'vieras');
await profile(vieras, 'vieras', '🧑');
await until(vieras, 'direct.ring.length === 1');
await vieras.ev(`direct.server(${J(card)})`);
await sleep(8000);
const vlog = await vieras.ev(`document.getElementById('log').textContent`);
check('vieras ei pysy palvelimessa', (await vieras.ev('direct.servers.length')) === 0, vlog.slice(0, 160));
check('isi ei saanut yhteyttä vieraaseen', (await isi.ev('direct.open.length')) === 1);

for (const t of [isi, tortto, vieras]) await t.close();
console.log(ok ? 'RENGASPALVELIN TOIMII' : 'VIRHE');
process.exit(ok ? 0 : 1);
