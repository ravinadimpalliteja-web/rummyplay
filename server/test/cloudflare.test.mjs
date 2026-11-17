// The Cloudflare room server (cloudflare/worker.mjs) with stand-ins for Cloudflare's WebSockets:
// create + join a room, the {"t":"ping"} heartbeat, stray and oversized messages.
import assert from 'node:assert/strict';
process.env.ROOM_AUTH = 'off';

class FakeWS {
  constructor() { this.closed = false; this.peer = null; this.inbox = []; }
  send(t) { if (this.closed) throw new Error('closed'); this.peer.inbox.push(JSON.parse(t)); }
  close() { this.closed = true; }
}
globalThis.WebSocketPair = class { constructor() { const c = new FakeWS(), s = new FakeWS(); s.peer = c; c.peer = s; return { 0: c, 1: s }; } };
globalThis.Response = class { constructor(body, init = {}) { this.status = init.status || 200; this.webSocket = init.webSocket; this.body = body; } };

const mod = await import('../cloudflare/worker.mjs');
const hub = (await import('../hub.js')).default;
const accepted = [];
const dobj = new mod.Rooms({ acceptWebSocket: (ws) => accepted.push(ws) }, {});
const env = { ROOMS: { idFromName: (n) => n, get: (_id, opt) => { assert.equal(opt.locationHint, 'apac'); return dobj; } } };
const req = (upgrade, path = '/') => ({ url: 'https://rooms.test' + path, headers: { get: (h) => (h === 'Upgrade' ? upgrade : null) } });
const open = async () => { const r = await mod.default.fetch(req('websocket'), env); assert.equal(r.status, 101); return { client: r.webSocket, server: accepted.at(-1) }; };
const say = (c, o) => dobj.webSocketMessage(c.server, JSON.stringify(o));
const last = (c, t) => [...c.client.inbox].reverse().find((m) => m.t === t);
const tick = () => new Promise((r) => setTimeout(r, 20));

assert.equal((await mod.default.fetch(req(null, '/healthz'), env)).body, 'ok');

const a = await open(), b = await open();
say(a, { t: 'create', game: 'ludo', token: 'tokenAAAAAAAA', passcode: '1234', name: 'Ravi' }); await tick();
const code = last(a, 'state').code;
assert.match(code, /^[A-Z]{4}$/);
say(b, { t: 'join', game: 'ludo', code, token: 'tokenBBBBBBBB', passcode: '1234', name: 'Priya' }); await tick();
assert.deepEqual(last(a, 'state').seats.filter(Boolean).map((s) => s.name), ['Ravi', 'Priya']);

const c = await open();
say(c, { t: 'join', game: 'ludo', code, token: 'tokenCCCCCCCC', passcode: '9999' }); await tick();
assert.match(last(c, 'err').msg, /passcode is wrong/);

hub.heartbeat();
assert.ok(last(a, 'ping'), 'the heartbeat sends {"t":"ping"}');
say(a, { t: 'pong' }); say(c, { t: 'pong' });
hub.heartbeat();                                   // b never answered
assert.equal(b.server.closed, true);
assert.equal(a.server.closed, false);
assert.equal(last(a, 'state').seats[1].connected, false, 'the silent player shows as offline');

const stray = new FakeWS();
dobj.webSocketMessage(stray, '{"t":"hello"}');
assert.equal(stray.closed, true, 'a socket from before a restart is closed so the game reconnects');

dobj.webSocketMessage(a.server, 'x'.repeat(9000));
assert.equal(a.server.closed, true, 'oversized messages close the connection');

assert.ok(hub.busy() && dobj.timer, 'the room is kept (for rejoining) and the timer keeps it in memory');
clearInterval(dobj.timer);
for (const r of hub.rooms.values()) r.destroy();
console.log('cloudflare room server: ok (create, join, wrong passcode, ping/pong heartbeat, stray and oversized messages)');
