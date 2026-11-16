'use strict';
// The owner's timeout rules: EKAH plays the lowest number card of the element (never wilds or action cards),
// otherwise draws; on the last card it always draws. Snakes & Ladders Quick game enters on any roll.
const assert = require('assert');
const E = require('../ekah-engine');
const S = require('../snakes');

function game(hand, top, color) {
  const g = E.createGame([{ name: 'A' }, { name: 'B' }], { seed: 7 });
  E.startRound(g);
  g.players[0].hand = hand; g.discard.push(top); g.color = color; g.turn = 0; g.pendingDrawn = null;
  return g;
}
const n = (id, suit, value) => ({ id, suit, type: 'num', value });
const top = n(900, 'AGNI', 5);

// lowest number card of the element
let g = game([n(1, 'AGNI', 7), n(2, 'AGNI', 2), n(3, 'JAL', 1), { id: 4, suit: null, type: 'brahma', value: null }], top, 'AGNI');
assert.deepStrictEqual(E.timeoutAction(g, 0), { type: 'play', cardId: 2 });

// only wilds / action cards of the element: draw, never spend them
g = game([{ id: 5, suit: 'AGNI', type: 'maya', value: null }, { id: 6, suit: null, type: 'mahakal', value: null }, n(7, 'JAL', 9)], top, 'AGNI');
assert.deepStrictEqual(E.timeoutAction(g, 0), { type: 'draw' });

// last card: draw even when it matches
g = game([n(8, 'AGNI', 1)], top, 'AGNI');
assert.deepStrictEqual(E.timeoutAction(g, 0), { type: 'draw' });

// a drawn card waiting: pass (keep it)
g = game([n(9, 'AGNI', 3), n(10, 'JAL', 4)], top, 'AGNI'); g.pendingDrawn = 9;
assert.deepStrictEqual(E.timeoutAction(g, 0), { type: 'pass' });
console.log('ekah timeout rule: ok');

// Snakes Quick game: any roll enters on square 1; classic still needs a six
let s = S.newGame([0, 1], { quick: true });
S.roll(s, 0, 3);
assert.strictEqual(s.last.outcome, 'enter'); assert.strictEqual(s.pos[0], 1);
s = S.newGame([0, 1]);
S.roll(s, 0, 3);
assert.strictEqual(s.last.outcome, 'need-six'); assert.strictEqual(s.pos[0], 0);
console.log('snakes quick game: ok');
