// Signaling-palvelimen integraatiotesti raa'alla WebSocket-asiakkaalla
// (Node 20:ssä ei ole sisäänrakennettua WebSocket-asiakasta).

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { randomBytes } from 'node:crypto';
import { startServer, MAX_MESSAGE_BYTES } from '../signal/server.mjs';

let server;
let port;

before(async () => {
  ({ server } = await startServer({ port: 0, host: '127.0.0.1' }));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

function frame(opcode, payload) {
  const mask = randomBytes(4);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, 0x80 | len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
  return Buffer.concat([header, mask, body]);
}

function client() {
  return new Promise((ok, fail) => {
    const sock = connect(port, '127.0.0.1');
    const queue = [];
    const waiters = [];
    let buf = Buffer.alloc(0);
    let upgraded = false;
    let closed = false;
    const push = (m) => (waiters.length ? waiters.shift()(m) : queue.push(m));
    const c = {
      send: (obj) => sock.write(frame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)))),
      raw: (b) => sock.write(b),
      next: () => new Promise((r) => (queue.length ? r(queue.shift()) : waiters.push(r))),
      close: () => sock.destroy(),
      get closed() { return closed; },
    };
    sock.on('connect', () => sock.write(
      `GET /signal HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    sock.on('close', () => { closed = true; push({ type: '__closed' }); });
    sock.on('error', fail);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        if (!buf.subarray(0, end).toString().startsWith('HTTP/1.1 101')) return fail(new Error('no upgrade'));
        upgraded = true;
        buf = buf.subarray(end + 4);
        ok(c);
      }
      while (buf.length >= 2) {
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
        if (buf.length < off + len) return;
        const opcode = buf[0] & 0x0f;
        const payload = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (opcode === 0x1) push(JSON.parse(payload.toString()));
        else if (opcode === 0x8) push({ type: '__close', code: payload.readUInt16BE(0) });
      }
    });
  });
}

test('huone: welcome, peer-joined, signal-välitys ja peer-left', async () => {
  const a = await client();
  a.send({ type: 'join', room: 'r1' });
  const wa = await a.next();
  assert.equal(wa.type, 'welcome');
  assert.deepEqual(wa.peers, []);

  const b = await client();
  b.send({ type: 'join', room: 'r1' });
  const wb = await b.next();
  assert.deepEqual(wb.peers, [wa.id]);
  assert.deepEqual(await a.next(), { type: 'peer-joined', id: wb.id });

  b.send({ type: 'signal', to: wa.id, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
  assert.deepEqual(await a.next(), { type: 'signal', from: wb.id, data: { sdp: { type: 'offer', sdp: 'v=0' } } });

  b.send({ type: 'signal', to: 'ffff', data: {} });
  assert.equal((await b.next()).reason, 'unknown-peer');

  b.close();
  assert.deepEqual(await a.next(), { type: 'peer-left', id: wb.id });
  a.close();
});

test('huoneet ovat erillisiä ja täynnä oleva huone hylkää', async () => {
  const cs = [];
  for (let i = 0; i < 3; i++) {
    const c = await client();
    c.send({ type: 'join', room: 'full' });
    assert.equal((await c.next()).type, 'welcome');
    cs.push(c);
  }
  const other = await client();
  other.send({ type: 'join', room: 'other' });
  assert.deepEqual((await other.next()).peers, []);

  const extra = await client();
  extra.send({ type: 'join', room: 'full' });
  assert.equal((await extra.next()).reason, 'room-full');
  [...cs, other, extra].forEach((c) => c.close());
});

test('virheelliset syötteet', async () => {
  const c = await client();
  c.send('{not json');
  assert.equal((await c.next()).reason, 'invalid-json');
  c.send({ type: 'join', room: '../etc' });
  assert.equal((await c.next()).reason, 'invalid-room');
  c.send({ type: 'signal', to: 'x', data: {} });
  assert.equal((await c.next()).reason, 'not-joined');
  c.close();
});

test('yli 64 KiB sanoma katkaisee yhteyden ennen jäsennystä', async () => {
  const c = await client();
  c.raw(frame(0x1, Buffer.alloc(MAX_MESSAGE_BYTES + 1, 0x20)));
  assert.deepEqual(await c.next(), { type: '__close', code: 1009 });
});

test('staattinen sivu ja polun ohitus estetty', async () => {
  const ok = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /IPv6 P2P/);
  const js = await fetch(`http://127.0.0.1:${port}/src/classify.js`);
  assert.match(js.headers.get('content-type'), /javascript/);
  const bad = await fetch(`http://127.0.0.1:${port}/..%2f..%2fsignal%2fserver.mjs`);
  assert.notEqual(bad.status, 200);
});
