// Jäsenen identiteetti (direct.html): ECDSA P-256 -avainpari WebCryptolla.
// Yksityistä avainta ei voi viedä selaimesta. Jäsentunniste johdetaan
// julkisesta avaimesta, ja rekisteritapahtumat ja yhteyden todennus
// allekirjoitetaan (docs/REKISTEROITYMINEN_JA_IDENTITEETTI.md, vaihe 2).
//
//   id   = hex8(SHA-256(key))                 key = julkinen avain raw, base64url
//   ring = hex8(SHA-256(perustajan key + '.' + salt))
//
// Lyhyt tunniste riittää reititykseen ja koodeihin: todiste on rekisteriin
// kirjattu koko avain. PoC: 32 bittiä, väärennys vaatisi noin 2^32 yritystä.

const subtle = globalThis.crypto.subtle;
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIG = { name: 'ECDSA', hash: 'SHA-256' };
const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hex8(text) {
  const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode(text)));
  return [...h.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const idOf = (key) => hex8(String(key));
export const ringIdOf = (key, salt) => hex8(`${key}.${salt}`);

/** Uusi avainpari: { priv, pub, key, id }. CryptoKey-oliot voi tallentaa IndexedDB:hen. */
export async function createIdentity() {
  const kp = await subtle.generateKey(ALG, false, ['sign', 'verify']);
  const key = b64url(new Uint8Array(await subtle.exportKey('raw', kp.publicKey)));
  return { priv: kp.privateKey, pub: kp.publicKey, key, id: await idOf(key) };
}

export async function sign(priv, payload) {
  return b64url(new Uint8Array(await subtle.sign(SIG, priv, enc.encode(JSON.stringify(payload)))));
}

const imported = new Map();
export async function verify(key, payload, sig) {
  try {
    let k = imported.get(key);
    if (!k) {
      k = await subtle.importKey('raw', unb64url(key), ALG, false, ['verify']);
      imported.set(key, k);
    }
    return await subtle.verify(SIG, k, unb64url(sig), enc.encode(JSON.stringify(payload)));
  } catch {
    return false;
  }
}

/** Allekirjoitettava sisältö (kanoninen taulukko). */
export function payloadOf(ev) {
  if (ev.kind === 'found') return ['found', ev.ring, ev.member, ev.key, ev.salt, ev.name, ev.icon];
  if (ev.kind === 'server') return ['server', ev.ring, ev.member, ev.key, ev.operator, ev.name];
  return ['admit', ev.ring, ev.left, ev.right, ev.member, ev.key, ev.name, ev.icon, ev.proof];
}

/** Rengaspalvelimen kortti (osoitteet ja sormenjälki), palvelimen allekirjoittama; seq kasvaa osoitteen vaihtuessa. */
export const cardPayload = (ring, c) => ['card', ring, c.server, String(c.seq), String(c.port), c.fp, c.addrs.join(',')];

export const authPayload = (nonce, signer, verifier) => ['auth', nonce, signer, verifier];

/**
 * Tarkistaa tapahtuman allekirjoitukset. `keyOf(id)` palauttaa rekisteriin jo
 * hyväksytyn jäsenen avaimen. Palauttaa true, false tai null (allekirjoittajan
 * avainta ei vielä tunneta: tarkistetaan myöhemmin uudelleen).
 */
export async function verifyEvent(ev, keyOf) {
  if (await idOf(ev.key) !== ev.member) return false;
  const p = payloadOf(ev);
  if (!(await verify(ev.key, p, ev.sigs?.member))) return false;
  if (ev.kind === 'found') return (await ringIdOf(ev.key, ev.salt)) === ev.ring;
  if (ev.kind === 'server') {
    const k = keyOf(ev.operator);
    if (!k) return null;
    return verify(k, p, ev.sigs?.operator);
  }
  const signers = ev.left === ev.right ? [ev.left] : [ev.left, ev.right];
  for (const s of signers) {
    const k = keyOf(s);
    if (!k) return null;
    if (!(await verify(k, p, ev.sigs?.[s === ev.left ? 'left' : 'right']))) return false;
  }
  return true;
}
