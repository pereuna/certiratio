// Suoran parin (direct.html) testi DevTools-protokollalla, kaksi selainta:
// A portissa PORTA, B portissa PORTB. A:n vastausvälilehti avataan A:n selaimeen,
// kuten puhelimen kamera tekisi.
//   node --experimental-websocket drive-direct.mjs URL [PORTA PORTB] [--stun-retry]
const [base, portA = '9222', portB = '9224'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const stunRetry = process.argv.includes('--stun-retry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let n = 0; const wait = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); wait.get(m.id)?.(m); };
  const send = (method, params = {}) => new Promise((ok) => { const id = ++n; wait.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  return { ws, send };
}

async function open(port, url, label) {
  const t = await (await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const c = await cdp(t.webSocketDebuggerUrl);
  const ev = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(`${label}: ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`);
    return r.result?.result?.value;
  };
  for (let i = 0; i < 40 && !(await ev('!!window.direct')); i++) await sleep(250);
  return { label, ev, close: () => fetch(`http://localhost:${port}/json/close/${t.id}`) };
}

const until = async (t, expr, ms = 15000) => {
  for (let i = 0; i < ms / 250; i++) { const v = await t.ev(expr); if (v) return v; await sleep(250); }
  throw new Error(`${t.label}: aikakatkaisu: ${expr} / ${await t.ev("document.getElementById('step').textContent + ' | ' + document.getElementById('check').textContent")}`);
};
const retry = async (t) => {
  if (stunRetry && await t.ev("!document.getElementById('start').hidden && document.getElementById('start').textContent.includes('STUN')")) {
    console.log(`${t.label}: selain piilotti osoitteet → STUN-uusinta`);
    await t.ev("document.getElementById('start').click()");
  }
};

const A = await open(portA, base, 'A');
await A.ev("document.getElementById('start').click()");
await sleep(5500); await retry(A);
const offer = await until(A, 'direct.url');
console.log('tarjous', offer.length, 'merkkiä');
const B = await open(portB, offer, 'B');
await sleep(5500); await retry(B);
const answer = await until(B, 'direct.url');
console.log('vastaus', answer.length, 'merkkiä');
const R = await open(portA, answer, 'A-kamera');
console.log('A-kamera:', await until(R, "document.getElementById('step').textContent.includes('✅') && document.getElementById('step').textContent"));
for (const t of [A, B]) await until(t, "direct.channel?.readyState === 'open'", 30000);
await sleep(1500);
const lines = { A: 'moi täältä A', B: 'B vastaa' };
for (let i = 1; i <= 12; i++) {
  await Promise.all([A, B].map((t) => t.ev(`(() => { const e = document.getElementById('text');
    e.value = ${JSON.stringify(lines[t.label])}.slice(0, ${i}); e.dispatchEvent(new Event('input')); })()`)));
  await sleep(50);
}
await sleep(1000);
let ok = true;
for (const t of [A, B]) {
  const s = await t.ev(`({ status: document.getElementById('status').textContent,
    stream: [...document.querySelectorAll('#stream span[data-author]')].map((x) => [x.dataset.author, x.textContent]) })`);
  const other = t.label === 'A' ? 'B' : 'A';
  const got = s.stream.filter(([a]) => a === 'toinen').map(([, x]) => x).join('');
  console.log(`${t.label}: ${s.status}\n   virta: ${s.stream.map(([a, x]) => `${a}:${x}`).join(' ')}`);
  if (got !== lines[other]) { ok = false; console.log(`   PUUTTUU: ${JSON.stringify(got)} ≠ ${JSON.stringify(lines[other])}`); }
}
console.log(ok ? 'PARI TOIMII' : 'VIRHE');
if (!process.env.KEEP) for (const t of [A, B, R]) await t.close();
process.exit(ok ? 0 : 1);
