'use strict';
process.env.SPEED = '50';        // shorten every timer and animation pause; the real roll timer is 15s
const assert = require('assert');
const { newGame, roll, turnOf, LADDERS, SNAKES } = require('../snakes');

/* ---------- rules ---------- */
{
  // A six is needed to enter; anything else passes the turn.
  const g = newGame([0, 2]);
  roll(g, 0, 5);
  assert.strictEqual(g.pos[0], 0); assert.strictEqual(g.last.outcome, 'need-six'); assert.strictEqual(turnOf(g), 2);
  assert.throws(() => roll(g, 0, 3), /not your turn/);
  roll(g, 2, 6);
  assert.strictEqual(g.pos[2], 1); assert.strictEqual(g.last.outcome, 'enter'); assert(g.last.extra);
  assert.strictEqual(turnOf(g), 2, 'a six gives another roll');
  roll(g, 2, 2);                                   // 1 -> 3
  assert.strictEqual(g.pos[2], 3); assert.strictEqual(turnOf(g), 0);
}
{
  // Ladders and snakes.
  const g = newGame([0, 1]); g.pos[0] = 1;
  roll(g, 0, 3);                                   // lands on 4 -> ladder to 25
  assert.strictEqual(g.last.landed, 4); assert.strictEqual(g.last.via, 'ladder'); assert.strictEqual(g.pos[0], LADDERS[4]);
  g.pos[1] = 23; roll(g, 1, 4);                    // lands on 27 -> snake to 5
  assert.strictEqual(g.last.via, 'snake'); assert.strictEqual(g.pos[1], SNAKES[27]);
}
{
  // Three sixes in a row cancel the whole turn.
  const g = newGame([0, 1]); g.pos[0] = 10;
  roll(g, 0, 6); assert.strictEqual(g.pos[0], 16); assert.strictEqual(turnOf(g), 0);
  roll(g, 0, 6); assert.strictEqual(g.pos[0], 22); assert.strictEqual(turnOf(g), 0);
  roll(g, 0, 6);
  assert.strictEqual(g.last.outcome, 'three-sixes'); assert.strictEqual(g.pos[0], 10, 'back to where the turn began');
  assert.strictEqual(turnOf(g), 1, 'turn passes'); assert.strictEqual(g.streak, 0);
  // Three sixes from off the board: entered on the first six, sent back off the board on the third.
  const h = newGame([0, 1]);
  roll(h, 0, 6); roll(h, 0, 6); assert.strictEqual(h.pos[0], 7); roll(h, 0, 6);
  assert.strictEqual(h.pos[0], 0); assert.strictEqual(turnOf(h), 1);
  // Sixes on different turns do not add up.
  const k = newGame([0, 1]); k.pos[0] = 10; k.pos[1] = 10;
  roll(k, 0, 6); roll(k, 0, 1); roll(k, 1, 2); roll(k, 0, 6); roll(k, 0, 6);
  assert.strictEqual(k.last.outcome, 'move'); assert.strictEqual(turnOf(k), 0);
}
{
  // Exact roll to 100; overshoot does not move; a six that overshoots still rolls again.
  const g = newGame([0, 1]); g.pos[0] = 97;
  roll(g, 0, 5); assert.strictEqual(g.pos[0], 97); assert.strictEqual(g.last.outcome, 'overshoot'); assert.strictEqual(turnOf(g), 1);
  roll(g, 1, 1); g.pos[0] = 96;
  roll(g, 0, 6); assert.strictEqual(g.pos[0], 96); assert(g.last.extra); assert.strictEqual(turnOf(g), 0);
  roll(g, 0, 4);
  assert.strictEqual(g.pos[0], 100); assert(g.last.win); assert.strictEqual(g.phase, 'gameEnd'); assert.strictEqual(g.winner, 0);
  assert.throws(() => roll(g, 1, 2), /over/);
}
{
  // Board sanity: no ladder ends on a snake head and no snake ends on a ladder foot.
  for (const top of Object.values(LADDERS)) assert(!SNAKES[top] && !LADDERS[top]);
  for (const tail of Object.values(SNAKES)) assert(!SNAKES[tail] && !LADDERS[tail]);
  assert.throws(() => newGame([0]), /2 to 4/);
}
console.log('snakes rules: ok');

/* ---------- live room over real sockets ---------- */
const { server, rooms } = require('../server');
const open = (port) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, errs: [], waiters: [], left: false, none: false };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.state = m; else if (m.t === 'err') c.errs.push(m.msg); else if (m.t === 'left') c.left = true; else if (m.t === 'none') c.none = true;
    c.waiters = c.waiters.filter((w) => !w());
  };
  ws.onopen = () => res(c); ws.onerror = rej;
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, ms = 8000) => new Promise((ok, no) => {
    if (pred()) return ok();
    const to = setTimeout(() => no(new Error('timeout; state=' + JSON.stringify(c.state && { phase: c.state.phase, turn: c.state.turn }) + ' errs=' + c.errs)), ms);
    c.waiters.push(() => { if (pred()) { clearTimeout(to); ok(); return true; } return false; });
  });
});
const tok = () => 'tok' + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');

server.listen(0, async () => {
  try {
    const port = server.address().port;
    const [a, b, c, s] = await Promise.all([1, 2, 3, 4].map(() => open(port)));
    const ta = tok(), tb = tok(), tc = tok(), ts = tok();

    a.send({ t: 'create', game: 'snakes', token: ta, name: 'Ann', passcode: '1234' }); await a.until(() => a.state);
    const code = a.state.code;
    assert.strictEqual(a.state.game, 'snakes'); assert.strictEqual(a.state.phase, 'lobby'); assert(a.state.host);

    // A Spades client cannot join or resume a Snakes room, and the reverse.
    s.send({ t: 'join', token: ts, name: 'Sp', code, passcode: '1234' }); await s.until(() => s.errs.length);
    assert(/Snakes/.test(s.errs[0])); assert(!s.state);
    s.send({ t: 'hello', code, token: ta }); await s.until(() => s.none);

    a.send({ t: 'start' }); await a.until(() => a.errs.length);              // alone: cannot start
    assert(/two players/.test(a.errs[0]));
    b.send({ t: 'join', game: 'snakes', token: tb, name: 'Bo', code, passcode: '1234' }); await b.until(() => b.state);
    b.send({ t: 'start' }); await b.until(() => b.errs.length);              // not host
    assert(/host/.test(b.errs[0]));

    a.send({ t: 'start' });                                                  // two players is enough
    await Promise.all([a, b].map((x) => x.until(() => x.state.phase === 'playing')));
    assert.deepStrictEqual(a.state.order, [0, 1]);
    assert(a.state.players.every((p) => p.sq === 0));
    c.send({ t: 'join', game: 'snakes', token: tc, name: 'Cy', code, passcode: '1234' }); await c.until(() => c.errs.length);
    assert(/already started/.test(c.errs[0]));

    // Out-of-turn roll is refused.
    const notTurn = a.state.turn === 0 ? b : a;
    notTurn.send({ t: 'roll' }); await notTurn.until(() => notTurn.errs.some((e) => /not your turn/.test(e)));

    // b leaves: the server must keep rolling for b. a rolls whenever it is a's turn.
    b.send({ t: 'leave' }); await b.until(() => b.left);
    let rolls = 0;
    const play = () => { const st = a.state; if (st.phase === 'playing' && st.turn === 0 && !st.moving) { rolls++; a.send({ t: 'roll' }); } };
    a.ws.addEventListener('message', play); play();
    const seen = new Set();
    a.ws.addEventListener('message', () => { const l = a.state.last; if (l) seen.add(l.outcome); });
    await a.until(() => a.state.phase === 'gameEnd', 120000);
    const st = a.state;
    assert(st.winner === 0 || st.winner === 1);
    assert.strictEqual(st.players.find((p) => p.seat === st.winner).sq, 100);
    assert(st.seats[1].away, 'b is shown as away');
    assert(seen.has('enter'), [...seen].join());
    assert(rolls > 0);

    // Host can start a new game; b can resume b's seat from the same device.
    a.send({ t: 'again' }); await a.until(() => a.state.phase === 'playing');
    assert(a.state.players.every((p) => p.sq === 0));
    const b2 = await open(port);
    b2.send({ t: 'hello', game: 'snakes', code, token: tb }); await b2.until(() => b2.state);
    assert.strictEqual(b2.state.you, 1); assert(!b2.state.host);

    // Leaving in the lobby frees the room.
    const [x, y] = await Promise.all([open(port), open(port)]);
    x.send({ t: 'create', game: 'snakes', token: tok(), name: 'Xi', passcode: '9999' }); await x.until(() => x.state);
    const code2 = x.state.code;
    x.send({ t: 'leave' }); await x.until(() => x.left);
    assert(!rooms.has(code2));
    y.send({ t: 'join', game: 'snakes', token: tok(), name: 'Yu', code: code2, passcode: '9999' }); await y.until(() => y.errs.length);

    console.log('snakes room: ok (' + rolls + ' rolls by the host, the rest by the server)');
    for (const k of [a, b, c, s, b2, x, y]) k.ws.close();
    server.close(); process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
});
