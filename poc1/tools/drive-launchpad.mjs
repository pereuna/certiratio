// Launchpad-testi CDP:llä. node --experimental-websocket drive-lp.mjs BASEURL [puhelin] [kannettava...]
// Puhelin: DevTools portissa 9223 (adb forward), kannettava: Chromium 9222.
const [base, ...who] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let n = 0; const wait = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
  const send = (method, params = {}) => new Promise((ok) => { const id = ++n; wait.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  return { ws, send };
}

async function openTab(label, url) {
  const port = label.startsWith('puhelin') ? 9223 : 9222;
  const b = await cdp((await (await fetch(`http://localhost:${port}/json/version`)).json()).webSocketDebuggerUrl);
  const { result } = await b.send('Target.createTarget', { url });
  b.ws.close();
  let t;
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(250);
    t = (await (await fetch(`http://localhost:${port}/json/list`)).json()).find((x) => x.id === result.targetId);
  }
  const c = await cdp(t.webSocketDebuggerUrl);
  const ev = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(`${label}: ${JSON.stringify(r.result.exceptionDetails).slice(0, 400)}`);
    return r.result?.result?.value;
  };
  for (let i = 0; i < 60 && !(await ev(`!!window.launchpad`)); i++) await sleep(250);
  return { label, ev, close: () => { c.ws.close(); return fetch(`http://localhost:${port}/json/close/${t.id}`); } };
}

const room = `lp${Date.now().toString(36)}`;
const url = `${base}#${room}`;
const tabs = [];
for (const w of who) tabs.push(await openTab(w, url));
for (const t of tabs) {
  for (let i = 0; i < 40 && !(await t.ev('!!launchpad.v6')); i++) await sleep(250);
  await t.ev(`(() => { document.getElementById('nick').value = ${JSON.stringify(t.label)}; document.getElementById('pad').requestSubmit(); })()`);
  await sleep(1500);
}
const STATE = `(() => ({ me: launchpad.me, summary: document.getElementById('info-sum').textContent,
  cands: document.getElementById('cands').textContent,
  peers: [...document.querySelectorAll('#peers tr')].map((tr) => [...tr.children].map((td) => td.textContent).join(' | ')),
  stream: [...document.querySelectorAll('#stream span')].map((s) => [s.dataset.author, s.textContent]),
  log: [...document.querySelectorAll('#log li')].map((l) => l.textContent).reverse() }))()`;
for (let i = 0; i < 25; i++) {
  const st = await Promise.all(tabs.map((t) => t.ev(STATE)));
  if (st.every((s) => s.peers.length === tabs.length - 1 && s.peers.every((p) => /auki|failed/.test(p)) && !s.peers.some((p) => /unknown/.test(p)))) break;
  await sleep(1000);
}
// Kaikki kirjoittavat yhtä aikaa merkki kerrallaan (input-tapahtuma kuten näppäimistö).
const lines = tabs.map((t) => `hei ${t.label} täällä`);
const longest = Math.max(...lines.map((l) => l.length));
for (let i = 1; i <= longest; i++) {
  await Promise.all(tabs.map((t, k) => i <= lines[k].length && t.ev(`(() => { const e = document.getElementById('text');
    e.value = ${JSON.stringify(lines[k])}.slice(0, ${i}); e.dispatchEvent(new Event('input')); })()`)));
  await sleep(60);
}
for (const t of tabs) await t.ev(`document.getElementById('say').requestSubmit()`);
await sleep(1500);
let ok = true;
for (const t of tabs) {
  const s = await t.ev(STATE);
  const text = (a) => s.stream.filter(([x]) => x.startsWith(a)).map(([, y]) => y).join('');
  console.log(`== ${t.label} (${s.me}) ${s.summary}`);
  for (const p of s.peers) console.log('   ', p);
  console.log('   ', s.cands);
  console.log('    virta:', JSON.stringify(s.stream.map(([a, x]) => `${a}:${x}`).join(' ').slice(0, 300)));
  for (let k = 0; k < tabs.length; k++) {
    const got = text(tabs[k].label);
    const want = lines[k] + '\n';
    if (got !== want) { ok = false; console.log(`    PUUTTUU ${tabs[k].label}: ${JSON.stringify(got)}`); }
  }
  if (process.env.LOG) console.log(s.log.join('\n'));
}
console.log(ok ? 'KAIKKI MERKIT PERILLÄ' : 'VIRHE');
if (!process.env.KEEP) for (const t of tabs) await t.close();
process.exit(ok ? 0 : 1);
