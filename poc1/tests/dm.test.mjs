import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DM, acceptDm, cleanDm } from '../web/src/dm.js';

const ok = { type: 'dm', from: 'aaaaaaaa', to: 'bbbbbbbb', text: 'Myyn sinulle 5 kg perunoita.' };
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
});
