// Rengaspalvelin renkaan solmuna (DevTools-protokolla, kolme Chromiumia):
// isi perustaa renkaan ja kutsuu Törtön QR-koodeilla (?signal=off), ja isi
// liittää palvelimen renkaaseen liittämislinkillä. Palvelintapahtuma ja kortti
// leviävät Törtölle, joka yhdistää palvelimeen itsestään. Törtön välilehti
// suljetaan ja avataan: hän yhdistää palvelimeen tallennetulla kortilla, ja
// palvelin esittelee hänet isille ilman yhtään koodia. Vieras (oma rengas) ei
// voi käyttää käytettyä liittämislinkkiä eikä pysy palvelimessa.
//   node --experimental-websocket drive-ringnode.mjs BASE_URL LIITTÄMISLINKKI PORT_ISI PORT_TORTTO PORT_VIERAS
// BASE_URL on direct.html (esim. http://localhost:8090/direct.html). Profiilit tyhjinä.
const [base, enrollLink, ...ports] = process.argv.slice(2);
const card = enrollLink.slice(enrollLink.indexOf('#') + 1).split('.').slice(0, 4).join('.');
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

// isi liittää palvelimen; tapahtuma ja kortti leviävät Törtölle, joka yhdistää itsestään.
await isi.ev(`direct.server(${J(enrollLink)})`);
await until(isi, `direct.step.includes('liitetty renkaaseen')`);
for (const t of [isi, tortto]) await until(t, 'direct.registeredServers.length === 1 && direct.cards.length === 1 && direct.servers.length === 1');
check('palvelin liitetty: rekisterissä ja kortti molemmilla, yhteys molemmilta', true, J(await tortto.ev('direct.cards[0].addrs')));
check('palvelin ei näy jäsenten naapurina', (await isi.ev('direct.open.length')) === 1, J(await isi.ev('direct.open')));
const status = await tortto.ev(`document.getElementById('status').textContent`);
check('tilarivillä palvelin', status.includes('palvelin ✓'), status);

// Törttö sulkee sivun ja palaa: ei koodeja, tallennettu kortti riittää.
const torttoId = await tortto.ev('direct.id');
await tortto.close();
await until(isi, `!direct.open.includes(${J(torttoId)})`, 60000);
const t0 = Date.now();
tortto = await open(ports[1], page, 'Törttö');
await until(tortto, `direct.ring.join() === 'isi,Törttö'`);
await until(tortto, `direct.open.length === 1 && direct.servers.length === 1`, 30000);
check('Törttö palaa itsestään: palvelin esitteli isin, suora yhteys ilman koodeja', true, `${((Date.now() - t0) / 1000).toFixed(1)} s sivun avauksesta`);
const isiId = await isi.ev('direct.id');
const sent = await tortto.ev(`direct.dm(${J(isiId)}, 'miau palvelimen esittelemänä')`);
await until(isi, `(direct.dms[${J(torttoId)}] ?? []).some((m) => m.text === 'miau palvelimen esittelemänä')`, 10000);
check('kahdenkeskinen viesti perillä suoraan (ei palvelimen kautta)', sent);

// Vieras: oma selain ja oma rengas. Käytetty liittämislinkki ei käy, pelkkä kortti ei pidä yhteyttä.
const vieras = await open(ports[2], page, 'vieras');
await profile(vieras, 'vieras', '🧑');
await until(vieras, 'direct.ring.length === 1');
await vieras.ev(`direct.server(${J(enrollLink)})`);
const vstep = await until(vieras, `(direct.step.includes('toiseen renkaaseen') || direct.step.includes('ei liitetty')) && direct.step`, 20000);
check('toisen renkaan palvelinta ei voi liittää (käytetty linkki)', true, vstep);
await vieras.ev(`document.getElementById('close')?.click()`);
await vieras.ev(`direct.server(${J(card)})`);
await sleep(8000);
check('vieras ei pysy palvelimessa', (await vieras.ev('direct.servers.length')) === 0);
check('isi ei saanut yhteyttä vieraaseen', (await isi.ev('direct.open.length')) === 1);

for (const t of [isi, tortto, vieras]) await t.close();
console.log(ok ? 'RENGASPALVELIN TOIMII' : 'VIRHE');
process.exit(ok ? 0 : 1);
