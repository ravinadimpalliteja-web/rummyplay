'use strict';
// Ludo room wins: a 1st place against at least one other real (signed-in) player is saved once on the winner's
// account; games against computer players only, or without accounts, are not.
const assert = require('assert');
const { setRecorder } = require('../results');
const { LudoRoom, roll } = require('../ludo');

const saved = [];
setRecorder(async (uid, game) => { saved.push([uid, game]); return true; });

const human = (token, uid) => ({ token, uid, name: token, connected: true, ws: null, missed: 0 });
const bot = (name) => ({ token: null, uid: null, name, bot: true, connected: true, ws: null, missed: 0 });
const at = (s, r = 0, l = 0) => ({ s, r, l });

/** Plays the winning move for `seat` in a fresh game: three tokens home, the last one step away. */
function finish(room, seat) {
  room.newGame();
  const g = room.game;
  g.tokens[seat] = [at('home'), at('home'), at('home'), at('lane', 0, 4)];
  g.turnIdx = g.order.indexOf(seat); g.phase = 'roll'; g.sixes = 0;
  roll(g, seat, 1);
  room.doMove(seat, 3);
  room.clearTimer();
  return g;
}

(async () => {
  // 1. Two real players: the winner's 1st place is saved, once.
  let room = new LudoRoom('AAAA', '1111', 1000);
  room.seats[0] = human('a', 'user-a'); room.seats[2] = human('b', 'user-b');
  let g = finish(room, 0);
  assert.strictEqual(g.phase, 'gameEnd'); assert.strictEqual(g.ranks[0], 0);
  room.saveResult(); room.saveResult();                       // repeated calls do not save twice
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(saved, [['user-a', 'ludo']]);
  assert.strictEqual(room.view(0).winCounts, true);

  // 2. A real player who later left (a bot took the seat) still makes the win count.
  room = new LudoRoom('BBBB', '2222', 1000);
  room.seats[1] = human('a', 'user-a'); room.seats[3] = human('c', 'user-c');
  room.newGame();
  room.seats[3] = { ...room.seats[3], connected: false };
  g = finish.call(null, Object.assign(room, { newGame() { /* keep the started game */ } }), 1);
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(saved.at(-1), ['user-a', 'ludo']);

  // 3. Against computer players only: not saved.
  const before = saved.length;
  room = new LudoRoom('CCCC', '3333', 1000);
  room.seats[0] = human('a', 'user-a'); room.seats[1] = bot('Maya'); room.seats[2] = bot('Alex');
  finish(room, 0);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(saved.length, before);
  assert.strictEqual(room.view(0).winCounts, false);

  // 4. A computer player wins against real players: nothing to save.
  room = new LudoRoom('DDDD', '4444', 1000);
  room.seats[0] = human('a', 'user-a'); room.seats[1] = bot('Maya'); room.seats[2] = human('b', 'user-b');
  finish(room, 1);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(saved.length, before);

  // 5. Players without accounts (sign-in turned off): not saved.
  room = new LudoRoom('EEEE', '5555', 1000);
  room.seats[0] = human('a', null); room.seats[2] = human('b', null);
  finish(room, 0);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(saved.length, before);

  // 6. Two seats of the same account do not count as a real opponent.
  room = new LudoRoom('FFFF', '6666', 1000);
  room.seats[0] = human('a', 'user-a'); room.seats[2] = human('a2', 'user-a');
  finish(room, 0);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(saved.length, before);

  // 7. The win is still a normal game end for everyone (rankings are complete).
  assert.strictEqual(g.ranks.length, 2);

  console.log('ludo wins: ok (' + saved.length + ' wins saved)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
