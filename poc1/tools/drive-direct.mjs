// Suoran verkon (direct.html) testi DevTools-protokollalla. Jokainen puhelin on
// oma Chromium (oma portti). A ja B pariutuvat QR-linkillä, A kutsuu C:n ja C
// kutsuu D:n; C ja D yhdistyvät muihin pelkän verkon kautta tulleen esittelyn
// avulla. Kutsujan vastausvälilehti avataan kutsujan selaimeen, kuten
// puhelimen kamera tekisi.
//   node --experimental-websocket drive-direct.mjs URL PORT_A PORT_B [PORT_C PORT_D [PORT_E]] [--cut]
// Chromium: --remote-debugging-port=PORT --disable-features=WebRtcHideLocalIpsWithMdns
const [base, ...ports] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const cut = process.argv.includes('--cut');
// --cut: neljä ensin, viides (E) liittyy vasta katkaisun jälkeen.
const names = 'ABCDEFGH'.slice(0, cut ? Math.min(4, ports.length) : ports.length).split('');
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
  return { label, port, ev, close: () => fetch(`http://localhost:${port}/json/close/${t.id}`) };
}

const until = async (t, expr, ms = 20000) => {
  for (let i = 0; i < ms / 250; i++) { const v = await t.ev(expr); if (v) return v; await sleep(250); }
  throw new Error(`${t.label}: aikakatkaisu: ${expr} / ${await t.ev("document.getElementById('step').textContent + ' | ' + document.getElementById('log').textContent")}`);
};

const nodes = {};
const extra = [];
/** inviter näyttää koodin, uusi skannaa sen, inviter skannaa vastauksen. */
async function join(name, inviter) {
  const prev = await inviter.ev('direct.url');
  await inviter.ev(`document.getElementById(${JSON.stringify(inviter === nodes.A && !prev ? 'start' : 'invite')}).click()`);
  const offer = await until(inviter, `direct.url !== ${JSON.stringify(prev)} && direct.url`);
  const node = await open(ports[names.indexOf(name)], offer, name);
  const answer = await until(node, `direct.url`);
  const cam = await open(inviter.port, answer, `${inviter.label}-kamera`);
  extra.push(cam);
  await until(cam, "document.getElementById('step').textContent.includes('✅')");
  nodes[name] = node;
  console.log(`${name} liittyi ${inviter.label}:n kutsulla (tarjous ${offer.length}, vastaus ${answer.length} merkkiä)`);
}

nodes.A = await open(ports[0], base, 'A');
await join('B', nodes.A);
if (names.includes('C')) await join('C', nodes.A);
for (let i = 3; i < names.length; i++) await join(names[i], nodes[names[i - 1]]); // D C:n, E D:n kutsulla…

const all = Object.values(nodes);
const n = all.length;
for (const t of all) await until(t, `direct.open.length === ${n - 1}`, 40000);
console.log(`kaikilla ${n - 1} suoraa yhteyttä`);
await sleep(3500); // reittiluokat getStatsista

const lines = Object.fromEntries(all.map((t) => [t.label, `${t.label.toLowerCase()}${t.label.toLowerCase()} hei`]));
for (let i = 1; i <= 7; i++) {
  await Promise.all(all.map((t) => t.ev(`(() => { const e = document.getElementById('text');
    e.value = ${JSON.stringify(lines[t.label])}.slice(0, ${i}); e.dispatchEvent(new Event('input')); })()`)));
  await sleep(40);
}
await sleep(1500);
const ids = Object.fromEntries(await Promise.all(all.map(async (t) => [await t.ev('direct.id'), t.label])));
let ok = true;
for (const t of all) {
  const s = await t.ev(`({ status: document.getElementById('status').textContent,
    peers: [...document.querySelectorAll('#peers tr')].map((tr) => [...tr.children].map((td) => td.textContent).join(' | ')),
    stream: [...document.querySelectorAll('#stream span[data-author]')].map((x) => [x.dataset.author, x.textContent]) })`);
  console.log(`${t.label}: ${s.status}`);
  for (const p of s.peers) console.log(`   ${p.replace(/^([0-9a-f]{8})/, (m) => `${ids[m] ?? '?'} ${m}`)}`);
  for (const o of all) {
    if (o === t) continue;
    const oid = Object.keys(ids).find((k) => ids[k] === o.label);
    const got = s.stream.filter(([a]) => a === oid).map(([, x]) => x).join('');
    if (got !== lines[o.label]) { ok = false; console.log(`   PUUTTUU ${o.label}: ${JSON.stringify(got)}`); }
  }
}
// Kiertoreitti: A katkaisee suoran yhteyden D:hen; A:n teksti kulkee D:lle muiden kautta.
if (cut && nodes.D) {
  const dId = await nodes.D.ev('direct.id');
  await nodes.A.ev(`direct.cut(${JSON.stringify(dId)})`);
  await until(nodes.D, `!direct.open.includes(${JSON.stringify(await nodes.A.ev('direct.id'))})`);
  await nodes.A.ev(`(() => { const e = document.getElementById('text'); e.value = 'kierto'; e.dispatchEvent(new Event('input')); })()`);
  await sleep(1000);
  const aId = await nodes.A.ev('direct.id');
  const got = await nodes.D.ev(`[...document.querySelectorAll('#stream span[data-author]')].filter((x) => x.dataset.author === ${JSON.stringify(aId)}).map((x) => x.textContent).join('')`);
  const fine = got.endsWith('kierto');
  console.log(`A–D katkaistu, A:n teksti D:lle muiden kautta: ${fine ? 'perillä' : `PUUTTUU (${JSON.stringify(got)})`}`);
  ok &&= fine;
  // E liittyy D:n kutsulla: A:n ja E:n esittely kulkee kahden hypyn kautta (A → B/C → E).
  if (ports.length > 4) {
    names.push('E');
    await join('E', nodes.D);
    const e = nodes.E;
    await until(e, `direct.open.includes(${JSON.stringify(aId)})`, 40000);
    console.log('E:n loki:', (await e.ev("[...document.querySelectorAll('#log li')].map((l) => l.textContent.replace(/^\\S+\\s+/, '')).reverse().join(' / ')")).replace(/[0-9a-f]{8}/g, (m) => ids[m] ?? m));
    console.log(`E: suorat yhteydet ${JSON.stringify((await e.ev('direct.open')).map((x) => ids[x] ?? 'D'))} (A ei ollut D:n naapuri, joten esittely kulki välittäjän kautta)`);
    all.push(e);
  }
}
console.log(ok ? 'VERKKO TOIMII' : 'VIRHE');
if (!process.env.KEEP) for (const t of [...all, ...extra]) await t.close();
process.exit(ok ? 0 : 1);
