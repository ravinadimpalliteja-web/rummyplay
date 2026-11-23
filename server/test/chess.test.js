'use strict';
process.env.SPEED = '50';        // shorten every timer (abandon countdown)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { server, rooms } = require('../server');

/* ---------- the website and the server use the same chess rules ---------- */
assert.strictEqual(
  fs.readFileSync(path.join(__dirname, '..', 'chess-engine.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'public', 'chess', 'engine.js'), 'utf8'),
  'server/chess-engine.js and web/public/chess/engine.js must be identical'
);

const open = (port) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, errs: [], waiters: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.state = m; else if (m.t === 'err') c.errs.push(m.msg);
    c.waiters = c.waiters.filter((w) => !w());
  };
  ws.onopen = () => res(c); ws.onerror = rej;
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, ms = 8000) => new Promise((ok, no) => {
    if (pred()) return ok();
    const to = setTimeout(() => no(new Error('timeout; phase=' + (c.state && c.state.phase) + ' errs=' + c.errs)), ms);
    c.waiters.push(() => { if (pred()) { clearTimeout(to); ok(); return true; } return false; });
  });
  return c;
});
const tok = () => 'tok' + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');

server.listen(0, async () => {
  try {
    const port = server.address().port;

    /* 1. Waiting room: the host picks colour and time; only the host can; the friend joins; start. */
    const [h, f] = await Promise.all([open(port), open(port)]);
    const ht = tok(), ft = tok();
    h.send({ t: 'create', game: 'chess', token: ht, name: 'Host', passcode: '1234' }); await h.until(() => h.state);
    assert.strictEqual(h.state.phase, 'lobby'); assert.strictEqual(h.state.side, 'w'); assert.strictEqual(h.state.tc, 'none');
    h.send({ t: 'start' }); await h.until(() => h.errs.length); assert(/friend/.test(h.errs.pop()));
    h.send({ t: 'addBot' }); await h.until(() => h.errs.length); assert(/two friends/.test(h.errs.pop()));
    f.send({ t: 'join', game: 'chess', code: h.state.code, passcode: '1234', token: ft, name: 'Friend' }); await f.until(() => f.state);
    f.send({ t: 'side', value: 'b' }); await f.until(() => f.errs.length); assert(/Only the host/.test(f.errs.pop()));
    h.send({ t: 'side', value: 'b' }); h.send({ t: 'time', value: '5+0' });
    await f.until(() => f.state.side === 'b' && f.state.tc === '5+0');
    h.send({ t: 'start' });
    await Promise.all([h, f].map((x) => x.until(() => x.state.phase === 'playing')));
    assert.strictEqual(h.state.color, 'b'); assert.strictEqual(f.state.color, 'w');
    assert.deepStrictEqual(h.state.clock && [h.state.clock.w, h.state.clock.b], [300000, 300000]);

    /* 2. Moves: only on your turn, only legal ones; both players see them. */
    h.send({ t: 'move', from: 'e7', to: 'e5' }); await h.until(() => h.errs.length); assert(/Not your move/.test(h.errs.pop()));
    f.send({ t: 'move', from: 'e2', to: 'e5' }); await f.until(() => f.errs.length); assert(/not allowed/.test(f.errs.pop()));
    f.send({ t: 'move', from: 'f2', to: 'f3' }); await h.until(() => h.state.sans.length === 1);
    h.send({ t: 'move', from: 'e7', to: 'e5' }); await f.until(() => f.state.sans.length === 2);
    f.send({ t: 'move', from: 'g2', to: 'g4' }); await h.until(() => h.state.sans.length === 3);
    assert.strictEqual(h.state.clock.running, 'b');

    /* 3. Draw offers: offering, then the other offering back, agrees the draw; a move cancels an offer. */
    f.send({ t: 'draw' }); await h.until(() => h.state.drawOffer === 'w');
    h.send({ t: 'move', from: 'd8', to: 'h4' }); await f.until(() => f.state.phase === 'gameEnd');   // Fool's mate
    assert.deepStrictEqual(f.state.result, { result: '0-1', reason: 'checkmate' });
    assert.strictEqual(f.state.drawOffer, null);

    /* 4. Rematch: colours swap; resign ends the game. */
    f.send({ t: 'again' }); await f.until(() => f.errs.length); assert(/Only the host/.test(f.errs.pop()));
    h.send({ t: 'again' }); await h.until(() => h.state.phase === 'playing' && h.state.sans.length === 0);
    await f.until(() => f.state.phase === 'playing' && f.state.sans.length === 0);
    assert.strictEqual(h.state.color, 'w'); assert.strictEqual(f.state.color, 'b');
    f.send({ t: 'draw' }); await h.until(() => h.state.drawOffer === 'b');
    h.send({ t: 'draw' }); await f.until(() => f.state.phase === 'gameEnd');
    assert.deepStrictEqual(f.state.result, { result: '1/2-1/2', reason: 'agreement' });
    h.send({ t: 'again' }); await f.until(() => f.state.phase === 'playing' && f.state.color === 'w');
    h.send({ t: 'resign' }); await f.until(() => f.state.phase === 'gameEnd');
    assert.deepStrictEqual(f.state.result, { result: '1-0', reason: 'resignation' });

    /* 5. A player who drops out can come back from the same device; one who stays away loses. */
    h.send({ t: 'again' }); await f.until(() => f.state.phase === 'playing' && f.state.color === 'b');
    f.ws.close();
    await h.until(() => h.state.abandon && h.state.abandon.seat === 1);
    const f2 = await open(port);
    f2.send({ t: 'hello', game: 'chess', code: h.state.code, token: ft }); await f2.until(() => f2.state && f2.state.phase === 'playing');
    await h.until(() => h.state.abandon === null);
    await new Promise((r) => setTimeout(r, 2200));     // longer than the (shortened) abandon time
    assert.strictEqual(h.state.phase, 'playing', 'coming back cancels the countdown');
    f2.ws.close();
    await h.until(() => h.state.phase === 'gameEnd', 6000);
    assert.deepStrictEqual(h.state.result, { result: '1-0', reason: 'abandoned' });

    /* 6. A Chess room code cannot be used for another game. */
    const x = await open(port);
    x.send({ t: 'join', game: 'ludo', code: h.state.code, passcode: '1234', token: tok(), name: 'X' }); await x.until(() => x.errs.length);
    assert(/Chess/.test(x.errs.pop()));
    x.ws.close(); h.ws.close();

    console.log('chess room: all good (moves checked, clocks, draw by agreement, rematch swaps colours, rejoin, abandon)');
    server.close(); for (const r of rooms.values()) r.destroy && r.destroy();
    process.exit(0);
  } catch (err) { console.error(err); process.exit(1); }
});
