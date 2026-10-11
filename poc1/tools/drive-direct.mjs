// Renkaan (direct.html) testi DevTools-protokollalla. Jokainen puhelin on oma
// Chromium (oma portti). Tarina: isi aloittaa renkaan, Törttö liittyy toiseksi
// perustajaksi, Liisa isin ja Törtön väliin, äiti isin ja Liisan väliin.
// Kamera korvataan direct.scan()-kutsulla: koodin linkki luetaan näytöltä
// (direct.url) ja syötetään toiselle puhelimelle.
// Pysyvyys: Liisan välilehti suljetaan ja avataan uudelleen (sama selainprofiili),
// ja hän palaa äidin yhdistämiskoodilla. Lisäksi toinen välilehti samassa
// profiilissa, väärennetyt tapahtumat ja viides selain Q (vieras, sitten oma rengas).
// Profiilihakemistojen on oltava tyhjiä ajon alussa.
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

async function open(port, url, label, ready = '!!window.direct?.id') {
  const t = await (await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const c = await cdp(t.webSocketDebuggerUrl);
  const ev = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(`${label}: ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`);
    return r.result?.result?.value;
  };
  for (let i = 0; i < 40 && !(await ev(ready)); i++) await sleep(250);
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

const check = (what, fine, detail = '') => {
  console.log(`${what}: ${fine ? 'OK' : 'VIRHE'}${detail ? ` (${detail})` : ''}`);
  ok &&= fine;
};

// Väärennökset: äidin liittymä muutetulla nimellä ja vieras tunniste samalla avaimella.
{
  const evs = await nodes.isi.ev('direct.events');
  const aiti = evs.find((e) => e.name === 'äiti');
  await nodes.Liisa.ev(`direct.merge(${J([{ ...aiti, name: 'aaa huijari' }, { ...aiti, member: 'ffffffff', id: 'ffffffff:a' }])})`);
  check('väärennetyt tapahtumat hylätään', (await nodes.Liisa.ev('direct.ring.join()')) === want.join() &&
    (await nodes.Liisa.ev(`document.getElementById('log').textContent`)).includes('allekirjoitus ei kelpaa'));
}

// Pysyvyys: Liisa sulkee välilehden ja avaa sivun uudelleen.
{
  const liisaId = await nodes.Liisa.ev('direct.id');
  await nodes.Liisa.close();
  for (const t of [nodes.isi, nodes.äiti, nodes.Törttö]) await until(t, `!direct.open.includes(${J(liisaId)})`, 60000);
  const back = await open(ports[2], base, 'Liisa');
  await until(back, `direct.ring.join() === ${J(want.join())}`);
  check('Liisa palaa: sama tunniste ja rengas tallesta', (await back.ev('direct.id')) === liisaId,
    await back.ev(`document.getElementById('status').textContent`));
  // Toinen välilehti samassa profiilissa ei aukea jäsenenä.
  const second = await open(ports[2], base, 'Liisa-2', `!!document.getElementById('step')?.textContent`);
  check('toinen välilehti samassa selaimessa', (await second.ev('direct.step')).includes('toisessa välilehdessä'));
  await second.close();
  // äiti näyttää yhdistämiskoodin, Liisa skannaa sen, äiti skannaa vastauksen.
  await nodes.äiti.ev(`document.getElementById('reconnect').click()`);
  await nodes.äiti.ev(`document.getElementById('primary').click()`); // Näytä yhdistämiskoodi
  const rcode = await until(nodes.äiti, `direct.url?.includes('#2.r.') && direct.url`);
  await back.ev(`direct.scan(${J(rcode)})`);
  const answer = await until(back, `direct.url?.includes('#2.a.') && direct.url`);
  await nodes.äiti.ev(`document.getElementById('primary').click()`); // Skannaa hänen vastauksensa
  await nodes.äiti.ev(`direct.scan(${J(answer)})`);
  await until(back, `direct.open.length === 3`, 60000);
  await until(nodes.äiti, `direct.step.includes('taas mukana') || document.getElementById('pair').hidden`);
  nodes.Liisa = back;
  all.splice(all.findIndex((t) => t.label === 'Liisa'), 1, back);
  await back.ev(`(() => { const e = document.getElementById('text'); e.value = 'palasin'; e.dispatchEvent(new Event('input')); })()`);
  await sleep(1000);
  const got = await nodes.Törttö.ev(`[...document.querySelectorAll('#stream span[data-author]')].filter((x) => x.dataset.author === ${J(liisaId)}).map((x) => x.textContent).join('')`);
  check('Liisa yhdistetty äidin koodilla: suorat yhteydet kaikkiin ja teksti perillä', got.endsWith('palasin'), got);

  // Vieras (Q:n selain, ei jäsen) ja toinen rengas eivät pääse yhdistämiskoodilla.
  if (ports[4]) {
    const q = await open(ports[4], base, 'Q');
    check('vieras ei voi käyttää yhdistämiskoodia', (await q.ev(`direct.scan(${J(rcode)})`)) === false && (await q.ev('direct.note')).includes('jäsenille'));
    await profile(q, 'Q', '🧑');
    await until(q, `direct.ring.length === 1`);
    check('toisen renkaan yhdistämiskoodi hylätään', (await q.ev(`direct.scan(${J(rcode)})`)) === false && (await q.ev('direct.note')).includes('toiseen renkaaseen'));
    all.push(q);
  }
}
console.log(ok ? 'RENGAS TOIMII' : 'VIRHE');
if (!process.env.KEEP) for (const t of all) await t.close();
process.exit(ok ? 0 : 1);
