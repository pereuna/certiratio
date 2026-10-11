// Ajaa certiration poc1-verkkotestin CDP:llä: puhelin (9223) + kaksi Chromium-välilehteä (9222).
// node --experimental-websocket drive.mjs <nimi> [--stun URL|--no-stun] [--relay] [--t5 PID] [--wait S]
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const name = args[0];
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const stun = args.includes('--no-stun') ? '' : (opt('--stun') ?? 'stun:stun.l.google.com:19302');
const relay = args.includes('--relay');
const t5pid = opt('--t5');
const waitS = Number(opt('--wait') ?? 30);
const room = `${name}-${Date.now().toString(36)}`;
const url = `http://localhost:8080/#${room}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openTab(port, label) {
  let t;
  if (port === 9223) {
    const b = new WebSocket('ws://localhost:9223/devtools/browser');
    await new Promise((ok) => { b.onopen = ok; });
    await new Promise((ok) => { b.onmessage = ok; b.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url } })); });
    b.close();
    for (let i = 0; i < 40 && !t; i++) {
      await sleep(250);
      t = (await (await fetch(`http://localhost:${port}/json/list`)).json()).find((x) => x.type === 'page' && x.url === url);
    }
  } else t = await (await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let n = 0; const wait = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
  const send = (method, params = {}) => new Promise((ok) => { const id = ++n; wait.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(`${label}: ${JSON.stringify(r.result.exceptionDetails)}`);
    return r.result?.result?.value;
  };
  for (let i = 0; i < 50 && (await ev(`!!document.getElementById('join') && document.readyState`)) !== 'complete'; i++) await sleep(200);
  return { label, port, id: t.id, ev, close: () => { ws.close(); return fetch(`http://localhost:${port}/json/close/${t.id}`); } };
}

const STATE = `(() => {
  const rows = [...document.querySelectorAll('#peers tr')].map((tr) => [...tr.children].slice(0, 7).map((td) => td.textContent));
  return { self: document.getElementById('self-id').textContent.slice(0, 6), status: document.getElementById('status').textContent,
    signal: document.getElementById('signal-state').textContent, open: document.getElementById('peer-count').textContent,
    rows, gathered: [...document.querySelectorAll('#gathered li')].map((l) => l.textContent),
    log: [...document.querySelectorAll('#log li')].map((l) => l.textContent) };
})()`;

const tabs = [await openTab(9223, 'puhelin'), await openTab(9222, 'kannettava-1'), await openTab(9222, 'kannettava-2')];
for (const t of tabs) {
  await t.ev(`(() => { const $ = (i) => document.getElementById(i);
    $('room').value = ${JSON.stringify(room)}; $('stun').value = ${JSON.stringify(stun)}; $('relay-only').checked = ${relay};
    const orig = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blob = b; return orig(b); };
    HTMLAnchorElement.prototype.click = function () {}; $('join').click(); })()`);
  await sleep(1500);
}
const settled = (s) => s.rows.length === 2 && s.rows.every((r) => r[2] === 'open' || ['failed', 'closed'].includes(r[1]));
for (let i = 0; i < waitS; i++) {
  const st = await Promise.all(tabs.map((t) => t.ev(STATE)));
  if (st.every(settled) && i >= 6) break;
  await sleep(1000);
}
for (const t of tabs) await t.ev(`document.getElementById('ping-all').click()`);
await sleep(2500);

const out = { name, room, stun, relay, tabs: {} };
for (const t of tabs) {
  await t.ev(`document.getElementById('export').click()`);
  out.tabs[t.label] = { state: await t.ev(STATE), exported: JSON.parse(await t.ev(`window.__blob ? window.__blob.text() : 'null'`)) };
}

if (t5pid) {
  for (const t of tabs) await t.ev(`document.getElementById('stop-signal').click()`);
  process.kill(Number(t5pid));
  await sleep(2000);
  const token = `T5-${Date.now().toString(36)}`;
  for (const t of tabs) await t.ev(`(() => { document.getElementById('message').value = ${JSON.stringify(token)} + '-' + document.getElementById('self-id').textContent.slice(0,6); document.getElementById('ping-all').click(); })()`);
  await sleep(4000);
  out.t5 = { token, tabs: {} };
  for (const t of tabs) {
    const s = await t.ev(STATE);
    out.t5.tabs[t.label] = { signal: s.signal, status: s.status, rows: s.rows,
      received: s.log.filter((l) => l.includes('vastaanotettu') && l.includes(token)).length,
      echoed: s.log.filter((l) => l.includes('kaiku') && l.includes(token)).length };
  }
}
for (const t of tabs) await t.close();
writeFileSync(new URL(`./result-${name}.json`, import.meta.url), JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(out.tabs)) {
  console.log(`== ${k} (${v.state.self}) open=${v.state.open} ${v.state.status}`);
  for (const r of v.state.rows) console.log('   ', r.join(' | '));
  console.log('    kerätty:', v.state.gathered.join('; '));
}
if (out.t5) console.log('T5', JSON.stringify(out.t5, null, 1));
process.exit(0);
