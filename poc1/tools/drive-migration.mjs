// Siirtymätesti (docs/JEDI_SIIRTO.md): Törtön vanha rengaspalvelin (malli 1,
// yksi operaattori) korvataan itsenäisellä rengassolmulla. DevTools-protokolla,
// kolme Chromiumia; ajetaan kahdessa vaiheessa samoilla selainprofiileilla:
//
//   --phase=old  vanha sivu ja vanha palvelin: isi perustaa, Törttö liittyy,
//                Törttö liittää Nokian (operaattori Törttö), Hanna liittyy isin
//                ja Törtön väliin. Kuten oikea rengas 13.10.2026.
//   --phase=new  uusi sivu, Nokia päivitetty samalla tilalla ja Jedi uutena:
//                isi liittää Jedin rengassolmuksi, Hanna hyväksyy (huoltajat).
//                Sitten Nokia pysäytetään (SIGSTOP, ei sammuteta), ja kaikki
//                palvelutoiminnot tarkistetaan pelkän Jedin varassa: paluu ilman
//                koodeja, esittely, rekisteri, kortin päivitys, Jedin
//                uudelleenkäynnistys. Lopuksi Törttö poistaa Nokian
//                palvelinroolin (retire).
//
//   node --experimental-websocket drive-migration.mjs --phase=old BASE NOKIA_LINK PORT_ISI PORT_TORTTO PORT_HANNA
//   node --experimental-websocket drive-migration.mjs --phase=new BASE JEDI_LINK PORT_ISI PORT_TORTTO PORT_HANNA
// Uusi vaihe käyttää ympäristömuuttujia NOKIA_STOP, NOKIA_CONT, JEDI_RESTART
// ja JEDI_READDR (komennot, jotka testiympäristö ajaa) sekä JEDI_LOG (Jedin loki).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [phaseArg, base, enrollLink, ...ports] = process.argv.slice(2);
const phase = phaseArg.replace('--phase=', '');
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
  const tab = { label, ev, close: () => { tabs.splice(tabs.indexOf(tab), 1); return fetch(`http://localhost:${port}/json/close/${t.id}`); } };
  tabs.push(tab);
  return tab;
}
const tabs = [];
const until = async (t, expr, ms = 30000) => {
  for (let i = 0; i < ms / 250; i++) { const v = await t.ev(expr); if (v) return v; await sleep(250); }
  const state = await Promise.all(tabs.map(async (x) => `${x.label}: ${await x.ev(`direct.step + ' | ' + [...document.querySelectorAll('#log li')].slice(0, 8).map((l) => l.textContent).join(' / ')`)}`));
  throw new Error(`${t.label}: aikakatkaisu ${expr}\n${state.join('\n')}`);
};
const profile = (t, name, icon) => t.ev(`(() => { document.getElementById('name').value = ${J(name)};
  document.querySelector('[data-icon="${icon}"]').click(); document.getElementById('primary').click(); })()`);
let ok = true;
const check = (what, fine, detail = '') => { console.log(`${what}: ${fine ? 'OK' : 'VIRHE'}${detail ? ` (${detail})` : ''}`); ok &&= fine; };
const run = (name) => { if (process.env[name]) execSync(process.env[name], { stdio: 'inherit' }); };

if (phase === 'old') {
  const isi = await open(ports[0], page, 'isi');
  await profile(isi, 'isi', '👨');
  await until(isi, 'direct.ring.length === 1');
  await isi.ev(`document.getElementById('invite').click()`);
  const offer = await until(isi, `direct.url?.includes('#2.o.') && direct.url`);
  const tortto = await open(ports[1], offer.replace('#', '?signal=off#'), 'Törttö');
  await until(tortto, `!document.getElementById('profile').hidden`);
  await profile(tortto, 'Törttö', '🐈');
  const answer = await until(tortto, `direct.url?.includes('#2.a.') && direct.url`);
  await isi.ev(`document.getElementById('primary').click()`);
  await isi.ev(`direct.scan(${J(answer)})`);
  await until(isi, `direct.ring.join() === 'isi,Törttö'`);
  await tortto.ev(`direct.server(${J(enrollLink)})`);
  await until(tortto, `direct.step.includes('liitetty renkaaseen')`);
  await until(isi, 'direct.servers.length === 1');
  // Hanna isin ja Törtön väliin: isi kutsuu, Törttö vahvistaa.
  await until(isi, `!document.getElementById('invite').hidden`);
  await isi.ev(`document.getElementById('close')?.click()`);
  await isi.ev(`document.getElementById('invite').click()`);
  const hoffer = await until(isi, `direct.url?.includes('#2.o.') && direct.url !== ${J(offer)} && direct.url`);
  const hanna = await open(ports[2], hoffer.replace('#', '?signal=off#'), 'Hanna');
  await until(hanna, `!document.getElementById('profile').hidden`);
  await profile(hanna, 'Hanna', '👩');
  const hans = await until(hanna, `direct.url?.includes('#2.a.') && direct.url`);
  await isi.ev(`document.getElementById('primary').click()`);
  await isi.ev(`direct.scan(${J(hans)})`);
  const vouch = await until(tortto, `direct.url?.includes('#2.c.') && direct.url`);
  await until(hanna, `direct.step.includes(" · Skannaa koodi, jonka")`);
  await hanna.ev(`direct.scan(${J(vouch)})`);
  for (const t of [isi, tortto, hanna]) await until(t, `direct.ring.join() === 'isi,Hanna,Törttö' && direct.servers.length === 1`);
  check('vanha rengas: isi → Hanna → Törttö, Nokia (operaattori Törttö)', true);
  for (const t of [isi, tortto, hanna]) await t.close();
  await sleep(1000);
  console.log(ok ? 'VANHA RENGAS VALMIS' : 'VIRHE');
  process.exit(ok ? 0 : 1);
}

// --- Uusi vaihe -------------------------------------------------------------
let isi = await open(ports[0], page, 'isi');
let tortto = await open(ports[1], page, 'Törttö');
let hanna = await open(ports[2], page, 'Hanna');
const all = () => [isi, tortto, hanna];
for (const t of all()) await until(t, `direct.ring.join() === 'isi,Hanna,Törttö'`);
for (const t of all()) await until(t, 'direct.open.length === 2 && direct.servers.length === 1', 45000);
check('päivitetty sivu ja päivitetty Nokia: rengas palaa ennallaan', true, J(await isi.ev('direct.order')));
const id = { isi: await isi.ev('direct.id'), tortto: await tortto.ev('direct.id'), hanna: await hanna.ev('direct.id') };
const nokia = (await isi.ev('direct.registeredServers'))[0];

// 2. Jedi rinnalle omalla identiteetillään: isi pyytää, Hanna (oikea naapuri) hyväksyy.
await isi.ev(`direct.server(${J(enrollLink)})`);
await until(isi, `direct.step.includes('Odotetaan, että Hanna hyväksyy')`);
await until(hanna, `direct.step.includes('pyytää: liitetäänkö rengassolmu')`);
await hanna.ev(`document.getElementById('primary').click()`);
await until(isi, `direct.step.includes('Rengassolmu') && direct.step.includes('liitetty')`);
const jedi = (await isi.ev('direct.registeredServers')).find((s) => s !== nokia);
for (const t of all()) await until(t, `direct.registeredServers.length === 2 && direct.servers.length === 2 && direct.cards.length === 2`);
const views = await Promise.all(all().map((t) => t.ev('JSON.stringify([direct.order, direct.serverInfo])')));
check('rekisteri yhdenmukainen kaikilla', views.every((v) => v === views[0]), views[0]);
const info = JSON.parse(views[0])[1];
check('Jedi rengassolmuna: huoltajat isi ja Hanna, Nokia vanhana rinnalla',
  J(info[jedi]?.guardians) === J([id.isi, id.hanna]) && info[nokia]?.operator === id.tortto, J(info));

// 4. Nokia estetään sammuttamatta sitä; kaikki suljetaan ja avataan uudelleen.
run('NOKIA_STOP');
for (const t of all()) await t.close();
await sleep(3000);
const t0 = Date.now();
hanna = await open(ports[2], page, 'Hanna');
tortto = await open(ports[1], page, 'Törttö');
for (const t of [hanna, tortto]) await until(t, `direct.open.length === 1 && direct.servers.join() === ${J(jedi)}`, 60000);
check('Nokia pysäytetty: Hanna ja Törttö palaavat pelkän Jedin esittelemänä, ilman koodeja', true, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
const sent = await hanna.ev(`direct.dm(${J(id.tortto)}, 'Jedin kautta tavattiin, viesti kulkee suoraan')`);
await until(tortto, `(direct.dms[${J(id.hanna)}] ?? []).some((m) => m.text.startsWith('Jedin kautta'))`, 10000);
check('kahdenkeskinen viesti suoraan Hannalta Törtölle (ei palvelimen kautta)', sent === 'sent', String(sent));

// Jedi käynnistetään uudelleen: jäsenet palaavat siihen itsestään (uudet todennukset Jedin lokissa).
const jediLog = () => readFileSync(process.env.JEDI_LOG, 'utf8');
let mark = jediLog().length;
run('JEDI_RESTART');
const back = async (who) => {
  for (let i = 0; i < 360; i++) {
    const tail = jediLog().slice(mark);
    if (who.every((m) => tail.includes(`${m}: todennettu`))) return true;
    await sleep(250);
  }
  return false;
};
check('Jedin uudelleenkäynnistys: Hanna ja Törttö yhdistivät siihen uudelleen itsestään', await back([id.hanna, id.tortto]));
for (const t of [hanna, tortto]) await until(t, `direct.servers.join() === ${J(jedi)}`, 30000);

// Jedin osoite muuttuu: uusi kortti leviää.
run('JEDI_READDR');
await until(hanna, `direct.cards.find((c) => c.server === ${J(jedi)})?.addrs.includes('fd00:c0de::7')`, 90000);
check('Jedin kortti päivittyi uuteen osoitteeseen', true, J(await hanna.ev(`direct.cards.find((c) => c.server === ${J(jedi)}).addrs`)));

// isi palaa myöhemmin: rekisteri ja yhteydet pelkän Jedin kautta.
isi = await open(ports[0], page, 'isi');
for (const t of all()) await until(t, `direct.open.length === 2 && direct.servers.join() === ${J(jedi)}`, 60000);
check('isi palasi: kaikki kolme yhteydessä pelkän Jedin varassa', true);

// Väärennös: Hanna julkaisee solmun, jonka vain hän on hyväksynyt (toinen allekirjoitus hänen omansa).
const forged = await hanna.ev(`(async () => {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
  const key = btoa(String.fromCharCode(...raw)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  const member = [...h.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sig = btoa('x'.repeat(64)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  return direct.inject({ kind: 'node', id: member + ':n', ring: direct.ringId, left: ${J(id.hanna)}, right: ${J(id.tortto)}, member, key,
    name: 'Huijari', legacy: [], sigs: { member: sig, left: sig, right: sig } });
})()`);
await sleep(2000);
const after = await Promise.all(all().map((t) => t.ev('direct.registeredServers.length')));
check('väärennetty solmu (ei kelvollisia allekirjoituksia) hylätään kaikilla selaimilla', forged === true && after.every((n) => n === 2), J(after));
check('Jedi hylkäsi väärennetyn solmun', jediLog().includes(':n), hylätty'), jediLog().split('\n').filter((l) => l.includes('hylätty')).join(' / '));

// 5. Nokian palvelinrooli pois: Törttö (operaattori) allekirjoittaa.
await tortto.ev(`window.confirm = () => true`);
await tortto.ev(`direct.retire(${J(nokia)})`);
for (const t of all()) await until(t, `direct.retired.includes(${J(nokia)}) && direct.registeredServers.join() === ${J(jedi)} && !direct.cards.some((c) => c.server === ${J(nokia)})`);
const order = await isi.ev('direct.order');
check('Nokian palvelinrooli poistettu ja kortti mitätöity kaikilla; Jedi jäljellä', true, J(order));
run('NOKIA_CONT');

for (const t of all()) await t.close();
console.log(ok ? 'JEDI KORVAA NOKIAN' : 'VIRHE');
process.exit(ok ? 0 : 1);
