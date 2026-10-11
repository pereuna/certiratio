// Renkaan (direct.html) testi DevTools-protokollalla. Jokainen puhelin on oma
// Chromium (oma portti). Tarina: isi aloittaa renkaan, Törttö liittyy toiseksi
// perustajaksi, Liisa isin ja Törtön väliin, äiti isin ja Liisan väliin.
// Kamera korvataan direct.scan()-kutsulla: koodin linkki luetaan näytöltä
// (direct.url) ja syötetään toiselle puhelimelle.
// Lisäksi viides selain aloittaa oman renkaan Q; toisen renkaan vastaus hylätään.
//   node --experimental-websocket drive-direct.mjs URL PORT_ISI PORT_TORTTO PORT_LIISA PORT_AITI [PORT_Q]
// Chromium: --remote-debugging-port=PORT --disable-features=WebRtcHideLocalIpsWithMdns
//           --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
const [base, ...ports] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

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

const until = async (t, expr, ms = 30000) => {
  for (let i = 0; i < ms / 250; i++) { const v = await t.ev(expr); if (v) return v; await sleep(250); }
  throw new Error(`${t.label}: aikakatkaisu: ${expr} / ${await t.ev("direct.step + ' | ' + document.getElementById('pair-note').textContent + ' | ' + document.getElementById('log').textContent")}`);
};

/** Nimi ja kuva lomakkeeseen ja päänappi. */
const profile = (t, name, icon) => t.ev(`(() => { document.getElementById('name').value = ${J(name)};
  document.querySelector('[data-icon="${icon}"]').click(); document.getElementById('primary').click(); })()`);

const nodes = {};
/** inviter kutsuu uuden jäsenen väliin "minä → seuraava"; seuraava vahvistaa. */
async function join(name, icon, port, inviter) {
  const right = await inviter.ev(`document.getElementById('invite').textContent`);
  const prev = await inviter.ev('direct.url');
  await inviter.ev(`document.getElementById('invite').click()`);
  const offer = await until(inviter, `direct.url !== ${J(prev)} && direct.url?.includes('#2.o.') && direct.url`);
  const node = await open(port, offer, name);
  await until(node, `!document.getElementById('profile').hidden`);
  await profile(node, name, icon);
  const answer = await until(node, `direct.url?.includes('#2.a.') && direct.url`);
  await inviter.ev(`document.getElementById('primary').click()`); // "Skannaa hänen vastauksensa"
  await inviter.ev(`direct.scan(${J(answer)})`);
  const sponsor = Object.values(nodes).find((t) => t !== inviter && right.endsWith(` ${t.label}`));
  if (sponsor) {
    const vouch = await until(sponsor, `direct.url?.includes('#2.c.') && direct.step.includes(${J(name)}) && direct.url`);
    await until(node, `direct.step.includes('3/3')`);
    await node.ev(`direct.scan(${J(vouch)})`);
  }
  nodes[name] = node;
  await until(node, `direct.ring.includes(${J(name)})`);
  console.log(`${name} liittyi: kutsuja ${inviter.label}${sponsor ? `, vahvistaja ${sponsor.label}` : ' (perustaja)'} → ${(await node.ev('direct.ring')).join(' → ')}`);
}

nodes.isi = await open(ports[0], base, 'isi');
await profile(nodes.isi, 'isi', '👨');
await until(nodes.isi, `direct.ring.length === 1`);
await join('Törttö', '🐈', ports[1], nodes.isi);
await join('Liisa', '👧', ports[2], nodes.isi);
await join('äiti', '👩', ports[3], nodes.isi);

const all = Object.values(nodes);
const want = ['isi', 'äiti', 'Liisa', 'Törttö'];
let ok = true;
for (const t of all) {
  await until(t, `direct.ring.join() === ${J(want.join())}`);
  await until(t, `direct.open.length === ${all.length - 1}`, 40000);
}
console.log(`kaikilla rengas ${want.join(' → ')} ↺ ja ${all.length - 1} suoraa yhteyttä`);
await sleep(3500); // reittiluokat getStatsista

const lines = Object.fromEntries(all.map((t) => [t.label, `${t.label} hei`]));
const longest = Math.max(...Object.values(lines).map((l) => l.length));
for (let i = 1; i <= longest; i++) {
  await Promise.all(all.map((t) => t.ev(`(() => { const e = document.getElementById('text');
    e.value = ${J(lines[t.label])}.slice(0, ${i}); e.dispatchEvent(new Event('input')); })()`)));
  await sleep(40);
}
await sleep(1500);
const ids = Object.fromEntries(await Promise.all(all.map(async (t) => [await t.ev('direct.id'), t.label])));
for (const t of all) {
  const s = await t.ev(`({ status: document.getElementById('status').textContent,
    ring: document.getElementById('ringview').textContent,
    invite: document.getElementById('invite').textContent,
    peers: [...document.querySelectorAll('#peers tr')].map((tr) => [...tr.children].map((td) => td.textContent).join(' | ')),
    stream: [...document.querySelectorAll('#stream span[data-author]')].map((x) => [x.dataset.author, x.textContent]) })`);
  console.log(`${t.label}: ${s.ring} · ${s.status} · [${s.invite}]`);
  for (const p of s.peers) console.log(`   ${p}`);
  for (const o of all) {
    if (o === t) continue;
    const oid = Object.keys(ids).find((k) => ids[k] === o.label);
    const got = s.stream.filter(([a]) => a === oid).map(([, x]) => x).join('');
    if (got !== lines[o.label]) { ok = false; console.log(`   PUUTTUU ${o.label}: ${J(got)}`); }
  }
}

// Toinen rengas: Q aloittaa omansa ja kutsuu. Isin renkaan vastaus ei kelpaa Q:lle.
if (ports[4]) {
  const q = await open(ports[4], base, 'Q');
  await profile(q, 'Q', '🧑');
  await until(q, `direct.ring.length === 1`);
  await q.ev(`document.getElementById('invite').click()`);
  await until(q, `direct.url?.includes('#2.o.')`);
  const prev = await nodes.isi.ev('direct.url');
  await nodes.isi.ev(`document.getElementById('invite').click()`);
  const offer = await until(nodes.isi, `direct.url !== ${J(prev)} && direct.url?.includes('#2.o.') && direct.url`);
  const stranger = await open(ports[4], offer, 'vieras');
  await until(stranger, `!document.getElementById('profile').hidden`);
  await profile(stranger, 'vieras', '🐕');
  const answer = await until(stranger, `direct.url?.includes('#2.a.') && direct.url`);
  await q.ev(`direct.scan(${J(answer)})`);
  const msg = await q.ev(`document.getElementById('pair-note').textContent`);
  const rejected = msg.includes('toiseen renkaaseen') && (await q.ev('direct.open.length')) === 0;
  console.log(`toisen renkaan vastaus Q:lle: ${rejected ? 'hylätty' : 'HYVÄKSYTTY'} (${msg})`);
  ok &&= rejected;
  // Väärä vahvistuskoodi: offer-koodi jäsenelle ei käy.
  const wrong = await q.ev(`direct.scan(${J(offer)})`);
  ok &&= wrong === false;
  all.push(q, stranger);
}
console.log(ok ? 'RENGAS TOIMII' : 'VIRHE');
if (!process.env.KEEP) for (const t of all) await t.close();
process.exit(ok ? 0 : 1);
