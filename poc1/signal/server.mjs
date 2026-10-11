// Certiratio PoC 1 — minimaalinen signaling-palvelin (POC1-BROWSER-P2P.md §3.2).
//
// Jakaa poc1/web-hakemiston staattisina tiedostoina ja välittää polussa /signal
// WebSocket-sanomia (SDP offer/answer, ICE) saman huoneen istuntojen välillä.
// Ei tietokantaa eikä kirjanpitotapahtumia; huoneet ovat vain muistissa.
// Ei ulkoisia riippuvuuksia: WebSocket (RFC 6455) on toteutettu tässä suppeasti.
//
// Käyttö:  node poc1/signal/server.mjs [--port 8443] [--host ::] [--cert c.pem --key k.pem]

import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const MAX_PEERS_PER_ROOM = 3;
const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// --- WebSocket-kehykset ---------------------------------------------------

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

class WsConnection {
  constructor(socket, onText, onClose) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.onText = onText;
    this.onClose = onClose;
    socket.on('data', (chunk) => this.#receive(chunk));
    // Upgrade-socket on half-open-tilassa: vertaisen sulkeminen näkyy vain 'end'-tapahtumana.
    socket.on('end', () => this.#finish());
    socket.on('close', () => this.#finish());
    socket.on('error', () => this.#finish());
  }

  send(obj) {
    if (this.closed) return;
    this.socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(obj), 'utf8')));
  }

  close(code = 1000) {
    if (this.closed) return;
    const body = Buffer.alloc(2);
    body.writeUInt16BE(code, 0);
    this.socket.end(encodeFrame(0x8, body));
    this.#finish();
  }

  #finish() {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.onClose();
  }

  #receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (!this.closed) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        len = big > BigInt(MAX_MESSAGE_BYTES) ? MAX_MESSAGE_BYTES + 1 : Number(big);
        offset = 10;
      }
      // Koko tarkistetaan ennen kuin sanomaa puskuroidaan tai jäsennetään (§7.2).
      if (len > MAX_MESSAGE_BYTES) return this.close(1009);
      if (!masked || !fin || opcode === 0x0) return this.close(1002);
      if (b.length < offset + 4 + len) return;
      const mask = b.subarray(offset, offset + 4);
      const payload = Buffer.from(b.subarray(offset + 4, offset + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = b.subarray(offset + 4 + len);

      if (opcode === 0x1) this.onText(payload.toString('utf8'));
      else if (opcode === 0x8) return this.close();
      else if (opcode === 0x9) this.socket.write(encodeFrame(0xa, payload));
      else if (opcode !== 0xa) return this.close(1003);
    }
  }
}

// --- Huoneet ja signalointi ------------------------------------------------

export function createSignalHandler() {
  const rooms = new Map(); // room -> Map(sessionId -> WsConnection)

  function attach(conn) {
    let room = null;
    let id = null;

    conn.onText = (text) => {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return conn.send({ type: 'error', reason: 'invalid-json' });
      }
      if (msg?.type === 'join') {
        if (room) return conn.send({ type: 'error', reason: 'already-joined' });
        if (typeof msg.room !== 'string' || !ROOM_RE.test(msg.room)) {
          return conn.send({ type: 'error', reason: 'invalid-room' });
        }
        const members = rooms.get(msg.room) ?? new Map();
        if (members.size >= MAX_PEERS_PER_ROOM) {
          return conn.send({ type: 'error', reason: 'room-full' });
        }
        room = msg.room;
        id = randomBytes(8).toString('hex');
        conn.send({ type: 'welcome', id, peers: [...members.keys()] });
        for (const other of members.values()) other.send({ type: 'peer-joined', id });
        members.set(id, conn);
        rooms.set(room, members);
      } else if (msg?.type === 'signal') {
        if (!room) return conn.send({ type: 'error', reason: 'not-joined' });
        const target = rooms.get(room)?.get(msg.to);
        if (!target) return conn.send({ type: 'error', reason: 'unknown-peer' });
        target.send({ type: 'signal', from: id, data: msg.data });
      } else {
        conn.send({ type: 'error', reason: 'unknown-type' });
      }
    };

    conn.onClose = () => {
      if (!room) return;
      const members = rooms.get(room);
      members.delete(id);
      if (members.size === 0) rooms.delete(room);
      else for (const other of members.values()) other.send({ type: 'peer-left', id });
    };
  }

  return { attach, rooms };
}

// --- HTTP(S) -------------------------------------------------------------

export function startServer({ port = 8443, host = '::', cert, key, webRoot } = {}) {
  const root = resolve(webRoot ?? fileURLToPath(new URL('../web/', import.meta.url)));
  const signal = createSignalHandler();

  async function serveStatic(req, res) {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(root, urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
    }
  }

  const handler = (req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    serveStatic(req, res);
  };
  const server = cert && key
    ? createHttps({ cert: readFileSync(cert), key: readFileSync(key) }, handler)
    : createHttp(handler);

  server.on('upgrade', (req, socket) => {
    const wsKey = req.headers['sec-websocket-key'];
    if (new URL(req.url, 'http://x').pathname !== '/signal' || !wsKey ||
        req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const accept = createHash('sha1').update(wsKey + WS_GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n' +
      `Connection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    signal.attach(new WsConnection(socket, () => {}, () => {}));
  });

  return new Promise((ok) => server.listen(port, host, () => ok({ server, signal })));
}

// --- Komentorivi -----------------------------------------------------------

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const cert = opt('cert');
  const port = Number(opt('port', cert ? 8443 : 8080));
  const host = opt('host', '::');
  const { server } = await startServer({ port, host, cert, key: opt('key') });
  const scheme = cert ? 'https' : 'http';
  console.log(`signaling + web: ${scheme}://localhost:${server.address().port}/  (host ${host})`);
}
