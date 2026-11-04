'use strict';
/**
 * Minimal dependency-free WebSocket server (RFC 6455): text frames, ping/pong, close, fragmentation.
 * Enough for this game; attaches to an existing http.Server.
 */
const crypto = require('crypto');
const EventEmitter = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 8192;

class Socket extends EventEmitter {
  constructor(sock) {
    super();
    this.sock = sock;
    this.open = true;
    this.buf = Buffer.alloc(0);
    this.frag = null; // { chunks, size }
    sock.setNoDelay(true);
    sock.on('data', (d) => this._data(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }

  _closed() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
  }

  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > MAX_PAYLOAD * 4) return this.terminate();
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (!masked || len > MAX_PAYLOAD) return this.terminate(); // clients must mask
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      this._frame(fin, op, payload);
      if (!this.open) return;
    }
  }

  _frame(fin, op, payload) {
    if (op === 0x8) { this._send(0x8, payload.subarray(0, 2)); return this.terminate(); }
    if (op === 0x9) return this._send(0xa, payload);
    if (op === 0xa) return this.emit('pong');
    if (op === 0x1 || op === 0x0) {
      if (op === 0x1) this.frag = { chunks: [], size: 0 };
      if (!this.frag) return this.terminate();
      this.frag.chunks.push(payload);
      this.frag.size += payload.length;
      if (this.frag.size > MAX_PAYLOAD) return this.terminate();
      if (fin) {
        const text = Buffer.concat(this.frag.chunks).toString('utf8');
        this.frag = null;
        this.emit('message', text);
      }
    }
  }

  _send(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.sock.write(Buffer.concat([head, payload]));
  }

  send(text) { this._send(0x1, Buffer.from(text)); }
  ping() { this._send(0x9, Buffer.alloc(0)); }
  terminate() { this.sock.destroy(); this._closed(); }
}

class WebSocketServer extends EventEmitter {
  constructor({ server, verifyOrigin }) {
    super();
    this.clients = new Set();
    server.on('upgrade', (req, sock) => {
      const key = req.headers['sec-websocket-key'];
      if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !key ||
          (verifyOrigin && !verifyOrigin(req))) {
        sock.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      const ws = new Socket(sock);
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      this.emit('connection', ws, req);
    });
  }
}

module.exports = { WebSocketServer };
