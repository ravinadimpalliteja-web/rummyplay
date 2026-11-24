'use strict';
// Quick Ludo: a room created as quick deals 2 tokens to each player, and a game plays to the end.
const assert = require('assert');
const { LudoRoom, newGame, roll, move, bestMove, turnOf } = require('../ludo');

const g4 = newGame([0, 2]), g2 = newGame([0, 2], 2);
assert.strictEqual(g4.tokens[0].length, 4);
assert.strictEqual(g2.tokens[0].length, 2);
assert.strictEqual(g2.tokens[2].length, 2);

// a quick game finishes, and the winner had both tokens home
let g = newGame([0, 1, 2, 3], 2), steps = 0;
while (g.phase !== 'gameEnd' && steps++ < 20000) {
  const s = turnOf(g);
  if (g.phase === 'roll') roll(g, s, 1 + Math.floor(Math.random() * 6));
  else move(g, s, bestMove(g, s));
}
assert.strictEqual(g.phase, 'gameEnd');
assert(g.tokens[g.ranks[0]].every((t) => t.s === 'home'));

// rooms: the host's choice is kept and shown to everyone
const room = new LudoRoom('QQQQ', '1234', 1000, { quick: true });
room.seats[0] = { token: 'a', uid: null, name: 'a', connected: true, ws: null, missed: 0 };
room.seats[2] = { token: 'b', uid: null, name: 'b', connected: true, ws: null, missed: 0 };
assert.strictEqual(room.view(0).quick, true);
room.newGame(); room.clearTimer();
assert.strictEqual(room.game.tokens[0].length, 2);
assert.strictEqual(new LudoRoom('CCCC', '1234').quick, false);

console.log('ludo quick: ok (' + steps + ' steps)');
