'use strict';
process.env.SPEED = '50';        // shorten every timer and animation pause; the real turn timer is 15s
const assert = require('assert');
const { newGame, roll, move, movable, turnOf, absOf, bestMove, START } = require('../ludo');

const at = (s, r = 0, l = 0) => ({ s, r, l });

/* ---------- rules ---------- */
{
  // Colours: 2 players sit opposite (red, yellow).
  assert.deepStrictEqual(newGame([0, 2]).colors, { 0: 'red', 2: 'yellow' });
  assert.deepStrictEqual(Object.values(newGame([0, 1, 3]).colors), ['red', 'green', 'yellow']);
  assert.throws(() => newGame([0]), /2 to 4/);
}
{
  // A six is needed to come out; no move passes the turn.
  const g = newGame([0, 1]);
  roll(g, 0, 4);
  assert.strictEqual(g.last.outcome, 'none'); assert.strictEqual(turnOf(g), 1);
  assert.throws(() => roll(g, 0, 3), /not your turn/);
  roll(g, 1, 6);
  assert.strictEqual(g.phase, 'move'); assert.strictEqual(g.last.forced, 0, 'all tokens in the yard: one real choice');
  assert.throws(() => roll(g, 1, 2), /Move a token/);
  move(g, 1, 0);
  assert.deepStrictEqual(g.tokens[1][0], at('track', 0)); assert(g.last.bonus); assert.strictEqual(turnOf(g), 1, 'a six rolls again');
}
{
  // A cut sends the opponent home and gives another roll; safe squares protect.
  const g = newGame([0, 1]);                        // red starts at 0, yellow at 26
  g.tokens[0][0] = at('track', 10);
  g.tokens[1][0] = at('track', 52 - 26 + 13);       // yellow on absolute square 13 (green's start: safe)
  g.tokens[1][1] = at('track', 52 - 26 + 12);       // yellow on absolute square 12
  assert.strictEqual(absOf('yellow', g.tokens[1][1].r), 12);
  roll(g, 0, 2); move(g, 0, 0);
  assert.strictEqual(g.last.cuts.length, 1); assert.deepStrictEqual(g.tokens[1][1], at('base'));
  assert(g.last.bonus); assert.strictEqual(turnOf(g), 0); assert.strictEqual(g.caps[0], 1);
  roll(g, 0, 1); move(g, 0, 0);                     // onto 13: safe, no cut
  assert.strictEqual(g.last.cuts.length, 0); assert.strictEqual(g.tokens[1][0].s, 'track');
  assert.strictEqual(turnOf(g), 1);
}
{
  // Home lane, exact roll to the centre, finishing, rankings.
  const g = newGame([0, 1, 2]);
  g.tokens[0] = [at('home'), at('home'), at('home'), at('lane', 0, 3)];
  roll(g, 0, 3);
  assert.deepStrictEqual(movable(g, 0, 3), []); assert.strictEqual(g.last.outcome, 'none');    // needs exactly 2
  g.turnIdx = 0; g.phase = 'roll';
  roll(g, 0, 2); move(g, 0, 3);
  assert(g.last.home && g.last.finished); assert.deepStrictEqual(g.ranks, [0]);
  assert.strictEqual(turnOf(g), 1, 'finishing ends the turn');
  // track 50 -> lane -> centre in 6
  const h = newGame([0, 1]); h.tokens[0][0] = at('track', 50);
  roll(h, 0, 6); move(h, 0, 0);
  assert.strictEqual(h.tokens[0][0].s, 'home'); assert.strictEqual(h.last.steps.length, 6);
  // the last player left gets the final place and the game ends
  const k = newGame([0, 1]); k.tokens[0] = [at('home'), at('home'), at('home'), at('lane', 0, 4)];
  roll(k, 0, 1); move(k, 0, 3);
  assert.strictEqual(k.phase, 'gameEnd'); assert.deepStrictEqual(k.ranks, [0, 1]);
}
{
  // Three sixes in a row end the turn.
  const g = newGame([0, 1]); g.tokens[0][0] = at('track', 5);
  roll(g, 0, 6); move(g, 0, 0); roll(g, 0, 6); move(g, 0, 0);
  roll(g, 0, 6);
  assert.strictEqual(g.last.outcome, 'three-sixes'); assert.strictEqual(turnOf(g), 1); assert.strictEqual(g.tokens[0][0].r, 17);
  // A cut with a non-six resets the six count.
  const h = newGame([0, 1]); h.tokens[0][0] = at('track', 5);
  roll(h, 0, 6); move(h, 0, 0); assert.strictEqual(h.sixes, 1);
}
{
  // The auto-player prefers a cut.
  const g = newGame([0, 1]);
  g.tokens[0][0] = at('track', 2); g.tokens[0][1] = at('track', 20);
  g.tokens[1][0] = at('track', (START.red + 23 - START.yellow + 52) % 52);
  roll(g, 0, 3);
  assert.strictEqual(bestMove(g, 0), 1);
}
console.log('ludo rules: ok');

/* ---------- live room over real sockets ---------- */
const { server, rooms } = require('../server');
const open = (port) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, errs: [], reacts: [], waiters: [], left: false, none: false };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.state = m; else if (m.t === 'err') c.errs.push(m.msg); else if (m.t === 'left') c.left = true;
    else if (m.t === 'none') c.none = true; else if (m.t === 'react') c.reacts.push(m);
    c.waiters = c.waiters.filter((w) => !w());
  };
  ws.onopen = () => res(c); ws.onerror = rej;
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, ms = 8000) => new Promise((ok, no) => {
    if (pred()) return ok();
    const to = setTimeout(() => no(new Error('timeout; state=' + JSON.stringify(c.state && { phase: c.state.phase, turn: c.state.turn, stage: c.state.stage }) + ' errs=' + c.errs)), ms);
    c.waiters.push(() => { if (pred()) { clearTimeout(to); ok(); return true; } return false; });
  });
});
const tok = () => 'tok' + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');

server.listen(0, async () => {
  try {
    const port = server.address().port;
    const [a, b, c, s] = await Promise.all([1, 2, 3, 4].map(() => open(port)));
    const ta = tok(), tb = tok(), tc = tok();

    a.send({ t: 'create', game: 'ludo', token: ta, name: 'Ann', passcode: '1234' }); await a.until(() => a.state);
    const code = a.state.code;
    assert.strictEqual(a.state.game, 'ludo'); assert.strictEqual(a.state.phase, 'lobby');

    // Other games cannot use a Ludo code.
    s.send({ t: 'join', game: 'snakes', token: tok(), name: 'Sn', code, passcode: '1234' }); await s.until(() => s.errs.length);
    assert(/Ludo/.test(s.errs[0]));

    a.send({ t: 'start' }); await a.until(() => a.errs.length);
    assert(/two players/.test(a.errs[0]));
    b.send({ t: 'join', game: 'ludo', token: tb, name: 'Bo', code, passcode: '1234' }); await b.until(() => b.state);
    c.send({ t: 'join', game: 'ludo', token: tc, name: 'Cy', code, passcode: '1234' }); await c.until(() => c.state);
    a.send({ t: 'start' });
    await Promise.all([a, b, c].map((x) => x.until(() => x.state.phase === 'playing')));
    assert.deepStrictEqual(Object.values(a.state.colors), ['red', 'green', 'yellow']);

    // Out of turn is refused; reactions reach everyone.
    const notTurn = [a, b, c].find((x) => x.state.turn !== x.state.you);
    notTurn.send({ t: 'roll' }); await notTurn.until(() => notTurn.errs.some((e) => /not your turn/.test(e)));
    a.send({ t: 'react', i: 2 }); await c.until(() => c.reacts.length);
    assert.deepStrictEqual([c.reacts[0].seat, c.reacts[0].i], [0, 2]);

    // c leaves (the server plays for c). a and b play: roll on their turn, choose the last legal token.
    c.send({ t: 'leave' }); await c.until(() => c.left);
    let acts = 0;
    const seen = new Set();
    for (const x of [a, b]) {
      const act = () => {
        const st = x.state;
        if (st.last) seen.add(st.last.kind + ':' + (st.last.outcome || (st.last.cuts.length ? 'cut' : 'step')));
        if (st.phase !== 'playing' || st.turn !== st.you || st.moving) return;
        if (st.stage === 'roll') { acts++; x.send({ t: 'roll' }); }
        else if (st.stage === 'move' && st.last && st.last.forced == null) { acts++; x.send({ t: 'move', token: st.moves[st.moves.length - 1] }); }
      };
      x.ws.addEventListener('message', act); act();
    }
    await a.until(() => a.state.phase === 'gameEnd', 240000);
    const st = a.state;
    assert.strictEqual(st.ranks.length, 3); assert.strictEqual(new Set(st.ranks).size, 3);
    for (const r of st.ranks.slice(0, 2)) assert(st.tokens[r].every((t) => t.s === 'home'));
    assert(st.seats[2].away, 'c is shown as away');
    assert(seen.has('move:cut'), 'a cut happened: ' + [...seen].join());

    // Host starts again; c resumes from the same device.
    a.send({ t: 'again' }); await a.until(() => a.state.phase === 'playing' && a.state.last === null);
    const c2 = await open(port);
    c2.send({ t: 'hello', game: 'ludo', code, token: tc }); await c2.until(() => c2.state);
    assert.strictEqual(c2.state.you, 2);

    // Leaving in the lobby frees the room.
    const x = await open(port);
    x.send({ t: 'create', game: 'ludo', token: tok(), name: 'Xi', passcode: '9999' }); await x.until(() => x.state);
    const code2 = x.state.code;
    x.send({ t: 'leave' }); await x.until(() => x.left);
    assert(!rooms.has(code2));

    console.log('ludo room: ok (' + acts + ' player actions, the rest by the server; finish order ' + st.ranks.join(' > ') + ')');
    for (const k of [a, b, c, s, c2, x]) k.ws.close();
    server.close(); process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
});
