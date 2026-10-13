// Renkaan (direct.html) testi DevTools-protokollalla. Jokainen puhelin on oma
// Chromium (oma portti). Tarina: isi aloittaa renkaan, Törttö liittyy toiseksi
// perustajaksi, Liisa isin ja Törtön väliin, äiti isin ja Liisan väliin.
// Kamera korvataan direct.scan()-kutsulla tai avaamalla koodin linkki: linkki
// luetaan näytöltä (direct.url) ja syötetään toiselle puhelimelle. Kutsu on
// 2.j (kohtaamispaikka, paikallinen rtcsignal), joten vastausta ei skannata.
// Pysyvyys: Liisan välilehti suljetaan ja avataan uudelleen (sama selainprofiili),
// ja hän yhdistyy itsestään renkaan huoneen kautta. Sitten sama ?signal=off-tilassa:
// paluu yhdistämiskoodilla (Liisa näyttää, äiti skannaa; Yhdistä-nappi vain Liisalla). Viestit ovat kahdenkeskisiä: vain vastaanottaja saa ne. Lisäksi toinen välilehti samassa profiilissa,
// väärennetyt tapahtumat ja viides selain Q (käytetty kutsu, vieras, oma rengas).
// Profiilihakemistojen on oltava tyhjiä ajon alussa. URL on rtcsignalin jakama sivu.
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
const codes = {};
async function join(name, icon, port, inviter) {
  const right = await inviter.ev(`document.getElementById('invite').textContent`);
  const prev = await inviter.ev('direct.url');
  await inviter.ev(`document.getElementById('invite').click()`);
  const offer = await until(inviter, `direct.url !== ${J(prev)} && direct.url?.includes('#2.j.') && direct.url`);
  codes[name] = offer;
  const node = await open(port, offer, name);
  await until(node, `!document.getElementById('profile').hidden`);
  await profile(node, name, icon);
  const sponsor = Object.values(nodes).find((t) => t !== inviter && right.endsWith(` ${t.label}`));
  if (sponsor) {
    const vouch = await until(sponsor, `direct.url?.includes('#2.c.') && direct.step.includes(${J(name)}) && direct.url`);
    await until(node, `direct.step.includes('2/2 · Skannaa koodi')`);
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

for (const t of all) {
  const s = await t.ev(`({ status: document.getElementById('status').textContent,
    ring: document.getElementById('ringview').textContent,
    invite: document.getElementById('invite').textContent,
    peers: [...document.querySelectorAll('#peers tr')].map((tr) => [...tr.children].map((td) => td.textContent).join(' | ')) })`);
  console.log(`${t.label}: ${s.ring} · ${s.status} · [${s.invite}]`);
  for (const p of s.peers) console.log(`   ${p}`);
}

const check = (what, fine, detail = '') => {
  console.log(`${what}: ${fine ? 'OK' : 'VIRHE'}${detail ? ` (${detail})` : ''}`);
  ok &&= fine;
};

// Kahdenkeskiset viestit: vain vastaanottaja saa viestin, muut eivät näe sitä.
const id = {};
for (const t of all) id[t.label] = await t.ev('direct.id');
const got = (t, from, text) => until(t, `(direct.dms[${J(from)}] ?? []).some((m) => !m.out && m.text === ${J(text)})`, 10000).then(() => true, () => false);
const silent = async (t) => Object.keys(await t.ev('direct.dms')).length === 0;
{
  const a = 'Myyn sinulle 5 kg perunoita.';
  const b = 'Sopii. Hinta 10 yksikköä?';
  check('isi → Törttö lähti suoraan', (await nodes.isi.ev(`direct.dm(${J(id.Törttö)}, ${J(a)})`)) === 'sent');
  check('Törttö sai viestin, isi sai kuittauksen', await got(nodes.Törttö, id.isi, a) &&
    !!(await until(nodes.isi, `direct.dms[${J(id.Törttö)}].find((m) => m.out).state === 'delivered'`, 5000).catch(() => false)));
  check('Törttö → isi (vastaus)', (await nodes.Törttö.ev(`direct.dm(${J(id.isi)}, ${J(b)})`)) === 'sent' && await got(nodes.isi, id.Törttö, b));
  await sleep(1000);
  check('Liisa ja äiti eivät saaneet kummankaan viestiä', await silent(nodes.Liisa) && await silent(nodes.äiti));
  // Käyttöliittymän kautta: äiti valitsee Liisan renkaasta ja lähettää lomakkeella.
  await nodes.äiti.ev(`[...document.querySelectorAll('#ringview button.member')].find((b) => b.textContent.includes('Liisa')).click()`);
  const path = await nodes.äiti.ev(`document.getElementById('chat-path').textContent`);
  await nodes.äiti.ev(`(() => { document.getElementById('dm-text').value = '  hei Liisa\u0020 '; document.getElementById('dm').requestSubmit(); })()`);
  check('äiti → Liisa lomakkeella', await got(nodes.Liisa, id.äiti, 'hei Liisa') &&
    (await nodes.äiti.ev(`document.getElementById('dm-text').value`)) === '' &&
    (await nodes.äiti.ev(`document.querySelector('#msgs .msg.out')?.firstChild.textContent`)) === 'hei Liisa', path);
  const badge = await nodes.Liisa.ev(`document.getElementById('ringview').textContent`);
  check('Liisalla lukematon äidiltä renkaassa', badge.includes('äiti (1)'), badge);
  check('isi ja Törttö eivät saaneet äidin viestiä', (await nodes.isi.ev(`Object.keys(direct.dms).join()`)) === id.Törttö &&
    (await nodes.Törttö.ev(`Object.keys(direct.dms).join()`)) === id.isi);
  check('itselle, renkaaseen kuulumattomalle ja tyhjää ei lähetetä', !(await nodes.isi.ev(`direct.dm(${J(id.isi)}, 'x')`)) &&
    !(await nodes.isi.ev(`direct.dm('ffffffff', 'x')`)) && !(await nodes.isi.ev(`direct.dm(${J(id.Törttö)}, '  ')`)));
}

// Väärennökset: äidin liittymä muutetulla nimellä ja vieras tunniste samalla avaimella.
{
  const evs = await nodes.isi.ev('direct.events');
  const aiti = evs.find((e) => e.name === 'äiti');
  await nodes.Liisa.ev(`direct.merge(${J([{ ...aiti, name: 'aaa huijari' }, { ...aiti, member: 'ffffffff', id: 'ffffffff:a' }])})`);
  check('väärennetyt tapahtumat hylätään', (await nodes.Liisa.ev('direct.ring.join()')) === want.join() &&
    (await nodes.Liisa.ev(`document.getElementById('log').textContent`)).includes('allekirjoitus ei kelpaa'));
}


// Pysyvyys: Liisa sulkee välilehden ja avaa sivun uudelleen. Yhteydet palaavat itsestään.
{
  const liisaId = await nodes.Liisa.ev('direct.id');
  await nodes.Liisa.close();
  for (const t of [nodes.isi, nodes.äiti, nodes.Törttö]) await until(t, `!direct.open.includes(${J(liisaId)})`, 60000);
  // Liisa ei ole paikalla: isin viesti jää lähtevään.
  check('poissa olevalle jäsenelle viesti jää lähtevään', (await nodes.isi.ev(`direct.dm(${J(liisaId)}, 'odotan sinua')`)) === 'queued' &&
    (await nodes.isi.ev(`document.getElementById('ringview').textContent`)).includes('Liisa ⏳'));
  const t0 = Date.now();
  const back = await open(ports[2], base, 'Liisa');
  await until(back, `direct.ring.join() === ${J(want.join())}`);
  check('Liisa palaa: sama tunniste ja rengas tallesta', (await back.ev('direct.id')) === liisaId);
  await until(back, `direct.open.length === 3`, 60000);
  check('Liisa yhdistyy itsestään kohtaamispaikan kautta (ei koodeja)', true,
    `${((Date.now() - t0) / 1000).toFixed(1)} s · ${await back.ev(`document.getElementById('status').textContent`)}`);
  check('lähtevä perillä, kun Liisa palasi, ja kuitattu', await got(back, id.isi, 'odotan sinua') &&
    !!(await until(nodes.isi, `direct.dms[${J(liisaId)}].every((m) => m.state === 'delivered')`, 5000).catch(() => false)));
  check('Liisan keskustelu äidin kanssa tallessa uudelleenavauksen jälkeen',
    !!(await until(back, `(direct.dms[${J(id.äiti)}] ?? []).map((m) => m.text).join() === 'hei Liisa'`, 5000).catch(() => false)),
    await back.ev(`new Promise((ok) => { const r = indexedDB.open('certiratio-direct'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('dms'); g.onsuccess = () => ok(JSON.stringify(g.result).slice(0, 400) + ' ring=' + direct.ringId + ' dms=' + JSON.stringify(direct.dms).slice(0, 200)); }; })`));
  check('viesti perillä paluun jälkeen', await back.ev(`direct.dm(${J(id.Törttö)}, 'olen taas täällä')`) &&
    await got(nodes.Törttö, liisaId, 'olen taas täällä'));
  // Katkos: viesti jää lähtevään ja lähtee, kun yhteys palaa itsestään; rekisteri ei muutu.
  await back.ev(`direct.cut(${J(id.Törttö)})`);
  check('katkenneelle yhteydelle viesti jää lähtevään, rengas ennallaan', (await back.ev(`direct.dm(${J(id.Törttö)}, 'katkos')`)) === 'queued' &&
    (await back.ev('direct.ring.join()')) === want.join());
  await until(back, `direct.open.length === 3`, 60000);
  check('lähtevä perillä, kun yhteys palasi', await got(nodes.Törttö, liisaId, 'katkos'));
  check('ei kaksoiskappaleita', (await nodes.Törttö.ev(`direct.dms[${J(liisaId)}].filter((m) => m.text === 'katkos').length`)) === 1);
  // Toinen välilehti samassa profiilissa ei aukea jäsenenä.
  const second = await open(ports[2], base, 'Liisa-2', `!!document.getElementById('step')?.textContent`);
  check('toinen välilehti samassa selaimessa', (await second.ev('direct.step')).includes('toisessa välilehdessä'));
  await second.close();

  // Ilman kohtaamispaikkaa (?signal=off): äiti näyttää yhdistämiskoodin, Liisa skannaa sen, äiti skannaa vastauksen.
  await back.close();
  for (const t of [nodes.isi, nodes.äiti, nodes.Törttö]) await until(t, `!direct.open.includes(${J(liisaId)})`, 60000);
  const back2 = await open(ports[2], `${base}?signal=off`, 'Liisa');
  await until(back2, `direct.ring.join() === ${J(want.join())}`);
  await sleep(3000);
  check('?signal=off: ei yhteyksiä ilman koodia', (await back2.ev('direct.open.length')) === 0,
    await back2.ev(`document.getElementById('status').textContent`));
  check('Yhdistä-nappi vain sillä, joka ei saa yhteyttä itsestään', (await nodes.äiti.ev(`document.getElementById('reconnect').hidden`)) &&
    !!(await until(back2, `!document.getElementById('reconnect').hidden`, 5000).catch(() => false)));
  // Liisa näyttää yhdistämiskoodin, äiti skannaa sen ja näyttää vastauksen, jonka Liisa skannaa.
  await back2.ev(`document.getElementById('reconnect').click()`);
  await back2.ev(`document.getElementById('primary').click()`); // Näytä yhdistämiskoodi
  const rcode = await until(back2, `direct.url?.includes('#2.r.') && direct.url`);
  await nodes.äiti.ev(`direct.scan(${J(rcode)})`);
  const answer = await until(nodes.äiti, `direct.url?.includes('#2.a.') && direct.url`);
  await back2.ev(`document.getElementById('primary').click()`); // Skannaa hänen vastauksensa
  await back2.ev(`direct.scan(${J(answer)})`);
  await until(back2, `direct.open.length === 3`, 60000);
  await until(back2, `direct.step.includes('taas mukana') || document.getElementById('pair').hidden`);
  nodes.Liisa = back2;
  all.splice(all.findIndex((t) => t.label === 'Liisa'), 1, back2);
  check('?signal=off: Liisa yhdistetty koodilla (Liisa näyttää, äiti skannaa), suorat yhteydet kaikkiin ja viesti perillä',
    await back2.ev(`direct.dm(${J(id.Törttö)}, 'palasin')`) && await got(nodes.Törttö, liisaId, 'palasin'));

  // Käytetty kutsu, vieras (Q:n selain, ei jäsen) ja toinen rengas eivät pääse sisään.
  if (ports[4]) {
    const used = await open(ports[4], codes.äiti, 'Q');
    await until(used, `!document.getElementById('profile').hidden`);
    await profile(used, 'Q', '🧑');
    await until(used, `direct.step.includes('Yhteys ei syntynyt')`);
    check('käytetty kutsukoodi ei kelpaa', (await used.ev('direct.step')).includes('käytetty'), await used.ev('direct.step'));
    await used.close();
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
