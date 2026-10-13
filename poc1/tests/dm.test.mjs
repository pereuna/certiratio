import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DM, acceptDm, cleanDm, restoreDms } from '../web/src/dm.js';

const ok = { type: 'dm', from: 'aaaaaaaa', to: 'bbbbbbbb', id: '0123456789abcdef', text: 'Myyn sinulle 5 kg perunoita.' };
const ctx = { me: 'bbbbbbbb', peer: 'aaaaaaaa', member: true };

test('cleanDm: reunat pois, tyhjä ja liian pitkä hylätään', () => {
  assert.equal(cleanDm('  moi\nhei  '), 'moi\nhei');
  assert.equal(cleanDm('   '), null);
  assert.equal(cleanDm(42), null);
  assert.equal(cleanDm('x'.repeat(MAX_DM)), 'x'.repeat(MAX_DM));
  assert.equal(cleanDm('x'.repeat(MAX_DM + 1)), null);
});

test('acceptDm: vain minulle, vain suoralta todennetulta jäseneltä', () => {
  assert.equal(acceptDm(ok, ctx), true);
  assert.equal(acceptDm({ ...ok, to: 'cccccccc' }, ctx), false, 'toiselle osoitettu');
  assert.equal(acceptDm({ ...ok, from: 'cccccccc' }, ctx), false, 'lähettäjä eri kuin suora vertainen');
  assert.equal(acceptDm(ok, { ...ctx, member: false }), false, 'ei jäsen (esim. palvelin tai liittyjä)');
  assert.equal(acceptDm({ ...ok, text: ' väli ' }, ctx), false, 'ei siistitty');
  assert.equal(acceptDm({ ...ok, text: 'x'.repeat(MAX_DM + 1) }, ctx), false, 'liian pitkä');
  assert.equal(acceptDm({ ...ok, type: 'chars' }, ctx), false);
  assert.equal(acceptDm({ ...ok, id: undefined }, ctx), false, 'ilman tunnistetta');
  assert.equal(acceptDm({ ...ok, id: 'xyz' }, ctx), false, 'kelvoton tunniste');
});

test('restoreDms: kelvolliset talteen, kuittaamaton takaisin lähtevään', () => {
  const at = 1791867264301;
  const got = restoreDms([
    { id: '0123456789abcdef', out: true, text: 'a', at, state: 'sent' },
    { id: '1123456789abcdef', out: true, text: 'b', at, state: 'delivered' },
    { id: '2123456789abcdef', out: false, text: 'c', at, seen: true },
    { id: '3123456789abcdef', out: true, text: 'd', at, state: 'outo' },
    { id: 'bad', out: false, text: 'e', at },
    { id: '4123456789abcdef', out: false, text: ' f', at },
    null,
  ]);
  assert.deepEqual(got.map((m) => [m.text, m.state]), [['a', 'pending'], ['b', 'delivered'], ['c', undefined]]);
  assert.deepEqual(restoreDms('x'), []);
  assert.equal(restoreDms(Array.from({ length: 9 }, (_, i) => ({ id: `${i}123456789abcdef`, out: false, text: String(i), at })), 3).length, 3);
});
