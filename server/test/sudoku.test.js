'use strict';
process.env.SPEED = '50';        // shorten every timer (countdown, computer players, finish window)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { server, rooms } = require('../server');

/* ---------- the website and the server use the same Sudoku engine ---------- */
assert.strictEqual(
  fs.readFileSync(path.join(__dirname, '..', 'sudoku-engine.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'public', 'sudoku', 'engine.js'), 'utf8'),
  'server/sudoku-engine.js and web/public/sudoku/engine.js must be identical'
);

const open = (port) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, errs: [], placed: [], waiters: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.state = m; else if (m.t === 'err') c.errs.push(m.msg); else if (m.t === 'placed') c.placed.push(m);
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
const empties = (st) => st.puzzle.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

server.listen(0, async () => {
  try {
    const port = server.address().port;

    /* 1. Two friends race; the faster one wins; a third mistake puts a player out. */
    const [h, f] = await Promise.all([open(port), open(port)]);
    h.send({ t: 'create', game: 'sudoku', token: tok(), name: 'Host', passcode: '1234' }); await h.until(() => h.state);
    assert.strictEqual(h.state.phase, 'lobby'); assert.strictEqual(h.state.level, 'medium');
    h.send({ t: 'start' }); await h.until(() => h.errs.length); assert(/Invite a friend/.test(h.errs.pop()));
    f.send({ t: 'join', game: 'sudoku', code: h.state.code, passcode: '1234', token: tok(), name: 'Friend' }); await f.until(() => f.state);
    f.send({ t: 'level', value: 'easy' }); await f.until(() => f.errs.length); assert(/Only the host/.test(f.errs.pop()));
    h.send({ t: 'level', value: 'easy' }); await f.until(() => f.state.level === 'easy');
    h.send({ t: 'start' }); await h.until(() => h.state.phase === 'countdown'); await f.until(() => f.state.phase !== 'lobby');
    assert.deepStrictEqual(h.state.puzzle, f.state.puzzle, 'everyone gets the same puzzle');
    assert.strictEqual(Sudoku().countSolutions(h.state.puzzle, 2), 1);
    await h.until(() => h.state.phase === 'playing'); await f.until(() => f.state.phase === 'playing');
    // friend makes three mistakes and is out
    const e = empties(f.state);
    for (let k = 0; k < 3; k++) f.send({ t: 'place', i: e[k], v: f.state.solution[e[k]] % 9 + 1 });
    await f.until(() => f.placed.length === 3);
    assert(f.placed.every((p) => !p.ok));
    await f.until(() => f.state.players.find((p) => p.seat === f.state.you).out);
    f.send({ t: 'place', i: e[0], v: f.state.solution[e[0]] });
    // host solves the whole puzzle: the race ends (everyone finished or out)
    for (const i of empties(h.state)) h.send({ t: 'place', i, v: h.state.solution[i] });
    await h.until(() => h.state.phase === 'gameEnd');
    assert.deepStrictEqual(h.state.ranking, [h.state.you, f.state.you]);
    const me = h.state.players.find((p) => p.seat === h.state.you);
    assert.strictEqual(me.filled, h.state.need); assert(me.finishedMs >= 0);
    assert.strictEqual(h.state.players.find((p) => p.seat === f.state.you).filled, 0, 'nothing counts after being out');
    // the host starts another race from the results
    h.send({ t: 'again' }); await f.until(() => f.state.phase === 'lobby');
    for (const k of [h, f]) k.ws.close();

    /* 2. Against a computer player: it fills squares by itself and the race ends after the finish window. */
    const solo = await open(port);
    solo.send({ t: 'create', game: 'sudoku', token: tok(), name: 'Solo', passcode: '5555' }); await solo.until(() => solo.state);
    solo.send({ t: 'addBot' }); await solo.until(() => solo.state.seats.filter((s) => s && s.bot).length === 1);
    solo.send({ t: 'level', value: 'easy' }); await solo.until(() => solo.state.level === 'easy');
    solo.send({ t: 'start' }); await solo.until(() => solo.state.phase === 'playing', 5000);
    const botSeat = solo.state.seats.find((s) => s && s.bot).seat;
    await solo.until(() => solo.state.players.find((p) => p.seat === botSeat).filled >= 3, 10000);
    const half = empties(solo.state).slice(0, 10);
    for (const i of half) solo.send({ t: 'place', i, v: solo.state.solution[i] });
    await solo.until(() => solo.state.phase === 'gameEnd', 60000);
    const bot = solo.state.players.find((p) => p.seat === botSeat);
    assert.strictEqual(bot.filled, solo.state.need, 'the computer player finished');
    assert.strictEqual(solo.state.ranking[0], botSeat);
    solo.ws.close();

    console.log('sudoku race: all good');
    server.close(); for (const r of rooms.values()) r.destroy && r.destroy();
    process.exit(0);
  } catch (err) { console.error(err); process.exit(1); }
});
function Sudoku() { return require('../sudoku-engine'); }
