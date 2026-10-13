import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardPayload, payloadOf, verify } from '../web/src/identity.js';
import { MODEL } from '../web/src/ring.js';
import { resolve, summary } from '../web/src/registry.js';

// Samat vektorit ajetaan Go-toteutuksella (ringserver/ringcore) ja ringcheck-ohjelmalla muilla alustoilla.
const v = JSON.parse(readFileSync(new URL('./vectors/conformance.json', import.meta.url)));

test('rekisterimalli', () => assert.equal(v.model, MODEL));

for (const c of v.cases) {
  test(`yhteensopivuus: ${c.name}`, async () => {
    assert.deepEqual(summary(await resolve(c.ring, c.events)), c.expect);
    // Saapumisjärjestys ei vaikuta.
    assert.deepEqual(summary(await resolve(c.ring, [...c.events].reverse())), c.expect);
  });
}

test('kanoninen allekirjoitettava sisältö ja kortti', async () => {
  for (const p of v.payloads) assert.equal(JSON.stringify(payloadOf(p.event)), p.payload);
  assert.equal(JSON.stringify(cardPayload(v.card.ring, v.card.card)), v.card.payload);
  const jedi = v.cases[0].events.find((e) => e.kind === 'node');
  assert.equal(await verify(jedi.key, cardPayload(v.card.ring, v.card.card), v.card.card.sig), true);
});
