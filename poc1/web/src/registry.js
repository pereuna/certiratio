// Rekisteri tapahtumajoukosta (docs/PROTOKOLLA.md, "Rekisterin rakentaminen"):
// allekirjoitukset tarkistetaan, ja jokaisesta tunnisteesta käytetään
// tarkistetuista versioista se, jonka preferred() valitsee. Sama tulos kuin
// direct.js:n vähittäisellä mergellä, saapumisjärjestyksestä riippumatta.
// Yhteensopivuustestit (tests/vectors/conformance.json) ajetaan tällä ja
// Go-toteutuksen Resolve-funktiolla.

import { verifyEvent } from './identity.js';
import { build, preferred, validEvent } from './ring.js';

export async function resolve(ringId, list) {
  const pool = new Map(); // versio (JSON) → tapahtuma
  for (const ev of list) if (validEvent(ev) && ev.ring === ringId) pool.set(JSON.stringify(ev), ev);
  const events = new Map();
  const keyOf = (id) => (events.get(`${id}:f`) ?? events.get(`${id}:a`))?.key ?? null;
  const targetOf = (id) => events.get(`${id}:n`) ?? events.get(`${id}:s`) ?? null;
  const invalid = new Set();
  for (let progress = true; progress;) {
    progress = false;
    for (const [k, ev] of pool) {
      const ok = await verifyEvent(ev, keyOf, targetOf);
      if (ok === null) continue;
      pool.delete(k);
      progress = true;
      if (ok) events.set(ev.id, preferred(events.get(ev.id), ev));
      else invalid.add(ev.id);
    }
  }
  return {
    state: build(ringId, [...events.values()]),
    events,
    invalid: [...invalid].filter((id) => !events.has(id)).sort(),
    unverified: [...new Set([...pool.values()].map((e) => e.id))].filter((id) => !events.has(id)).sort(),
  };
}

/** Rekisterin vertailukelpoinen yhteenveto (testivektorien `expect`). */
export function summary(r) {
  const s = r.state;
  return {
    members: s.members,
    order: s.order,
    servers: Object.fromEntries([...s.servers].sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, v]) => [id, v.node ? { node: true, guardians: v.guardians } : { operator: v.operator }])),
    retired: [...s.retired].sort(),
    rejected: s.rejected.map((x) => x.id).sort(),
    pending: [...s.pending].sort(),
    invalid: r.invalid,
    unverified: r.unverified,
  };
}
