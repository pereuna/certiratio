// Rengaspalvelimen prototyypin testi DevTools-protokollalla: kolme välilehteä
// yhdistää palvelimeen samalla kortilla yhtä aikaa (sama UDP-portti), ja
// väärän sormenjäljen kortti ei saa yhteyttä.
//   node --experimental-websocket drive-ringserver.mjs PAGE_URL KORTTI DEVTOOLS_PORT
// PAGE_URL on palvelin.html (esim. http://localhost:8090/palvelin.html).
const [page, card, port] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(url) {
  const t = await (await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let n = 0; const wait = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); wait.get(m.id)?.(m); };
  const ev = (expression) => new Promise((ok) => {
    const id = ++n; wait.set(id, (m) => ok(m.result?.result?.value));
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  return { ev, close: () => fetch(`http://localhost:${port}/json/close/${t.id}`) };
}

async function until(t, expr, ms) {
  for (let i = 0; i < ms / 250; i++) { const v = await t.ev(expr); if (v) return v; await sleep(250); }
  return null;
}

let ok = true;
const check = (what, fine, detail = '') => { console.log(`${what}: ${fine ? 'OK' : 'VIRHE'}${detail ? ` (${detail})` : ''}`); ok &&= fine; };

const tabs = await Promise.all([1, 2, 3].map(() => open(`${page}#${card}`)));
const res = await Promise.all(tabs.map((t) => until(t, `window.servertest?.pongs.length > 0 && window.servertest`, 30000)));
res.forEach((r, i) => check(`välilehti ${i + 1}: yhteys kortilla ja vastaus palvelimelta`, !!r,
  r ? `${r.ms} ms, ${r.pair}, palvelin näki ${r.pongs[0].from}` : ''));
check('kolme asiakasta samassa UDP-portissa eri osoitteista', new Set(res.filter(Boolean).map((r) => r.pongs[0].from)).size === 3);

// Väärä sormenjälki: sama osoite ja portti, muutettu sormenjälki.
const f = card.split('.');
const fp = f[1];
f[1] = (fp[0] === 'A' ? 'B' : 'A') + fp.slice(1);
const bad = await open(`${page}#${f.join('.')}`);
const st = await until(bad, `['failed', 'open'].includes(window.servertest?.state) && window.servertest.state`, 40000);
check('väärän sormenjäljen kortti ei saa yhteyttä', st !== 'open', st ?? 'ei avautunut 40 s:ssa');

for (const t of [...tabs, bad]) await t.close();
console.log(ok ? 'PALVELIN TOIMII' : 'VIRHE');
process.exit(ok ? 0 : 1);
