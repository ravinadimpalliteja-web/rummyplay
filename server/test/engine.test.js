'use strict';
const assert = require('assert');
const { Game, scoreRound, beats, parse } = require('../engine');

// --- scoring table from the spec (section 7A / 7B / 8) ---
const S = (b, t, blind) => scoreRound(b, t, blind).points;
// Blind (Round 13): 0 tricks +100, any trick -100, no multiplier
assert.strictEqual(S(0, 0, true), 100);
assert.strictEqual(S(0, 1, true), -100);
assert.strictEqual(S(0, 5, true), -100);
assert.strictEqual(scoreRound(0, 3, true).bags, 0);
assert.strictEqual(S(0, 0), 0);
assert.strictEqual(S(0, 2), 0);
assert.strictEqual(S(3, 3), 30);
assert.strictEqual(S(3, 4), 30);
assert.strictEqual(S(3, 5), 30);
assert.strictEqual(S(3, 2), -30);
assert.strictEqual(S(5, 3), -50);
assert.strictEqual(scoreRound(3, 4, false).bags, 1);
assert.strictEqual(scoreRound(3, 5, false).bags, 2);
assert.strictEqual(scoreRound(0, 2, false).bags, 2);
assert.strictEqual(scoreRound(3, 2, false).bags, 0);

// --- trick resolution ---
assert(beats('S2', 'H14', 'H'));          // spade trumps
assert(!beats('D14', 'H3', 'H'));         // off-suit can't win
assert(beats('H5', 'H3', 'H'));
assert(beats('S9', 'S3', 'H'));

// --- bag penalties ---
{
  const g = new Game();
  const cases = [[4, 0, 4], [9, 0, 9], [10, 100, 0], [13, 100, 3], [20, 200, 0]];
  for (const [bags, pen, rem] of cases) {
    const p = g.players[0];
    p.bags = 0; p.total = 0; p.bid = 0; p.tricks = 0; p.blind = false;
    // emulate: add bags then apply the same loop used by endRound
    p.bags += bags; let penalty = 0;
    while (p.bags >= g.cfg.bagLimit) { p.bags -= g.cfg.bagLimit; penalty += g.cfg.bagPenalty; }
    assert.strictEqual(penalty, pen); assert.strictEqual(p.bags, rem);
  }
}

// --- full simulated games ---
function simulate() {
  const g = new Game();
  const seenDealers = [];
  while (g.phase !== 'gameEnd') {
    g.startRound();
    assert.strictEqual(g.cards, g.round);
    for (const p of g.players) assert.strictEqual(p.hand.length, g.round);
    const all = g.players.flatMap((p) => p.hand);
    assert.strictEqual(new Set(all).size, 4 * g.round, 'no duplicate cards');
    assert.strictEqual(g.turn, (g.dealer + 1) % 4);
    seenDealers.push(g.dealer);
    // bidding
    for (let i = 0; i < 4; i++) {
      const seat = g.turn;
      assert.strictEqual(seat, (g.dealer + 1 + i) % 4, 'bid order clockwise from dealer left');
      if (g.round === 13 && Math.random() < 0.4) { /* blind */ g.placeBlind(seat); assert(g.players[seat].blind && g.players[seat].bid === 0); }
      else { if (g.round === 13) g.seeCards(seat); g.placeBid(seat, Math.floor(Math.random() * (g.cards + 1))); }
    }
    assert.strictEqual(g.phase, 'playing');
    // play
    let tricks = 0;
    while (g.phase === 'playing') {
      const seat = g.turn;
      const legal = g.legal(seat);
      assert(legal.length > 0);
      // illegal attempts must throw
      for (const c of g.players[seat].hand) if (!legal.includes(c)) assert.throws(() => g.play(seat, c));
      assert.throws(() => g.play((seat + 1) % 4, g.players[(seat + 1) % 4].hand[0]));
      // spades can't be led unless broken or only spades
      if (g.trick.length === 0 && !g.spadesBroken) {
        const hasNon = g.players[seat].hand.some((c) => parse(c).s !== 'S');
        if (hasNon) assert(legal.every((c) => parse(c).s !== 'S'));
      }
      g.play(seat, legal[Math.floor(Math.random() * legal.length)]);
      if (g.phase === 'trickPause') {
        tricks++;
        const w = g.trickWinner; g.finishTrick();
        if (g.phase === 'playing') assert.strictEqual(g.turn, w, 'winner leads next');
      }
    }
    assert.strictEqual(tricks, g.round);
    assert.strictEqual(g.players.reduce((a, p) => a + p.tricks, 0), g.round);
    for (const p of g.players) assert(p.bags >= 0 && p.bags < 10);
  }
  assert.deepStrictEqual(seenDealers, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0]);
  assert.strictEqual(g.history.length, 13);
  // totals equal sum of history
  g.players.forEach((p, seat) => {
    const sum = g.history.reduce((a, h) => a + h.rows[seat].points - h.rows[seat].penalty, 0);
    assert.strictEqual(p.total, sum);
  });
  assert(g.final.ranking.some((r) => r.winner));
  return g;
}
for (let i = 0; i < 300; i++) simulate();

// --- ties: equal scores share the win, no bag tie-breaker ---
{
  const g = new Game();
  g.players[0].total = 100; g.players[0].bags = 2;
  g.players[1].total = 100; g.players[1].bags = 5;
  g.players[2].total = 100; g.players[2].bags = 5;
  g.players[3].total = 50;
  const f = g.computeFinal().ranking;
  assert.deepStrictEqual(f.filter((r) => r.winner).map((r) => r.seat).sort(), [0, 1, 2]);
  assert.strictEqual(f.find((r) => r.seat === 3).rank, 4);
}

// --- timeout policy ---
{
  const { timeoutCard } = require('../engine');
  const g = new Game(); g.startRound();
  const set = (seat, hand, trick, led) => { g.players[seat].hand = hand; g.trick = trick.map((card, i) => ({ seat: (seat + 1 + i) % 4, card })); g.ledSuit = led; g.spadesBroken = true; g.phase = 'playing'; g.turn = seat; };
  set(0, ['H9', 'H3', 'H12', 'S14', 'D2'], [], null);
  assert.strictEqual(timeoutCard(g, 0), 'D2');                 // leading: lowest legal card
  set(0, ['H9', 'H3', 'H12', 'S14', 'D2'], ['H5'], 'H');
  assert.strictEqual(timeoutCard(g, 0), 'H3');                 // follow suit: lowest of the led suit
  set(0, ['D9', 'C14', 'S2', 'D13'], ['H5'], 'H');
  assert.strictEqual(timeoutCard(g, 0), 'C14');                // cannot follow: highest non-spade, any suit
  set(0, ['S9', 'S3', 'S12'], ['H5'], 'H');
  assert.strictEqual(timeoutCard(g, 0), 'S3');                 // only spades: lowest spade
}
console.log('engine tests passed (300 simulated games)');
