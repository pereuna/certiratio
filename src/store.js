// Pysyvä tallennus (direct.html): IndexedDB, avain–arvo. CryptoKey-oliot
// tallentuvat sellaisinaan, eikä yksityistä avainta voi lukea ulos.
//   identity: { priv, pub, key, id }      ring: { ringId, events }
// Jos selain estää tallennuksen (yksityinen ikkuna), sivu toimii ilman sitä.

const DB = 'certiratio-direct';
const STORE = 'kv';
let db = null;

function open() {
  db ??= new Promise((ok, bad) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
  return db;
}

async function run(mode, fn) {
  const d = await open();
  return new Promise((ok, bad) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = () => bad(tx.error);
    tx.onabort = () => bad(tx.error);
  });
}

export const load = (key) => run('readonly', (s) => s.get(key));
export const save = (key, value) => run('readwrite', (s) => s.put(value, key));
export const clear = () => run('readwrite', (s) => s.clear());
