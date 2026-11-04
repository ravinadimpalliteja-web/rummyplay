'use strict';
/**
 * Royal Club Spades — authoritative game engine.
 * Pure game logic: no networking, no timers. The server drives it.
 * Implements ROYAL CLUB – SPADES rules spec (4-player cutthroat, 13 rounds).
 */
const crypto = require('crypto');

const CONFIG = Object.freeze({
  rounds: 13,
  bidTime: 30,        // seconds (enforced by server)
  playTime: 20,
  scoreTime: 15,
  bagLimit: 10,
  bagPenalty: 100,
  normalMultiplier: 10,
  // Round 13 "Blind": the player commits to winning ZERO tricks before seeing their cards.
  // No number is chosen and there is no multiplier. (Owner's rule, 2026-11-04.)
  blindWinPoints: 100,    // 0 tricks won
  blindLosePoints: -100,  // 1 or more tricks won
  blindBags: false,       // not specified by the owner: tricks won in a failed blind do NOT become bags
});

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };

class GameError extends Error {}

const parse = (c) => ({ s: c[0], r: parseInt(c.slice(1), 10) });

function buildDeck() {
  const d = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push(s + r);
  return d;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(h) {
  return h.sort((a, b) => {
    const x = parse(a), y = parse(b);
    return SUIT_ORDER[x.s] - SUIT_ORDER[y.s] || y.r - x.r;
  });
}

/** Does card a beat card b, given the led suit? Spades are always trump. */
function beats(a, b, led) {
  const x = parse(a), y = parse(b);
  if (x.s === y.s) return x.r > y.r;
  if (x.s === 'S') return true;
  if (y.s === 'S') return false;
  return x.s === led; // y is off-suit (not led, not spade)
}

/** Spec section 7 + 8. Returns raw points and bags gained for a round. */
function scoreRound(bid, tricks, blind, cfg = CONFIG) {
  if (blind) {
    return { points: tricks === 0 ? cfg.blindWinPoints : cfg.blindLosePoints, bags: cfg.blindBags ? tricks : 0 };
  }
  const mult = cfg.normalMultiplier;
  // Owner's final rules: a zero bid scores 0 and every trick won is a bag; a made bid scores bid x 10;
  // overtricks are bags only (never points); a failed bid loses bid x 10.
  if (bid === 0) return { points: 0, bags: tricks };
  if (tricks >= bid) return { points: bid * mult, bags: tricks - bid };
  return { points: -bid * mult, bags: 0 };
}

class Game {
  constructor(cfg = {}) {
    this.cfg = { ...CONFIG, ...cfg };
    this.players = [0, 1, 2, 3].map(() => ({
      hand: [], bid: null, blind: false, seen: true,
      tricks: 0, total: 0, bags: 0,
    }));
    this.round = 0;
    this.cards = 0;
    this.dealer = 0;
    this.turn = 0;
    this.leader = 0;
    this.phase = 'idle'; // idle | bidding | playing | trickPause | roundEnd | gameEnd
    this.trick = [];
    this.trickWinner = null;
    this.ledSuit = null;
    this.spadesBroken = false;
    this.history = [];
    this.lastRound = null;
    this.final = null;
    this.continued = new Set();
  }

  get blindRound() { return this.cfg.rounds; }

  startRound() {
    if (this.round >= this.cfg.rounds) throw new GameError('Game is over');
    this.round++;
    this.cards = this.round;                         // 1..13 cards each
    this.dealer = (this.round - 1) % 4;              // dealer moves clockwise
    const deck = shuffle(buildDeck());
    for (const p of this.players) {
      p.hand = []; p.bid = null; p.blind = false; p.tricks = 0;
      p.seen = this.round !== this.blindRound;       // Round 13: cards hidden until the player chooses
    }
    for (let i = 0; i < this.cards; i++) for (let s = 0; s < 4; s++) this.players[s].hand.push(deck.pop());
    for (const p of this.players) sortHand(p.hand);
    this.turn = this.leader = (this.dealer + 1) % 4; // player to dealer's left bids and leads first
    this.trick = []; this.trickWinner = null; this.ledSuit = null;
    this.spadesBroken = false;
    this.lastRound = null;
    this.continued = new Set();
    this.phase = 'bidding';
  }

  /** Round 13 only: player chooses to look at their cards (normal bid). */
  seeCards(seat) {
    const p = this.players[seat];
    if (this.phase !== 'bidding' || this.turn !== seat) throw new GameError('Not your turn');
    if (this.round !== this.blindRound || p.seen || p.bid !== null) throw new GameError('Cannot do that now');
    p.seen = true;
  }

  placeBid(seat, value) {
    const p = this.players[seat];
    if (this.phase !== 'bidding') throw new GameError('Not the bidding phase');
    if (this.turn !== seat) throw new GameError('Not your turn to bid');
    if (p.bid !== null) throw new GameError('Already bid');
    if (this.round === this.blindRound && !p.seen) throw new GameError('Choose Blind or See my cards first');
    if (!Number.isInteger(value) || value < 0 || value > this.cards) throw new GameError('Invalid bid');
    p.bid = value;
    this.afterBid(seat);
  }

  /** Round 13 only: commit to zero tricks without looking. +100 if 0 tricks, -100 otherwise. */
  placeBlind(seat) {
    const p = this.players[seat];
    if (this.phase !== 'bidding' || this.turn !== seat) throw new GameError('Not your turn to bid');
    if (this.round !== this.blindRound || p.seen || p.bid !== null) throw new GameError('Cannot do that now');
    p.bid = 0; p.blind = true; p.seen = true;
    this.afterBid(seat);
  }

  afterBid(seat) {
    if (this.players.every((q) => q.bid !== null)) {
      this.phase = 'playing';
      this.turn = this.leader;
    } else {
      this.turn = (seat + 1) % 4;
    }
  }

  /** Legal cards for a seat right now (spec section 6). */
  legal(seat) {
    const hand = this.players[seat].hand;
    if (this.trick.length === 0) {
      // Spades can't be led until broken (unless only spades remain). Leading a spade never
      // breaks them, which also covers the Round-1 single-spade lead rule.
      if (!this.spadesBroken) {
        const non = hand.filter((c) => parse(c).s !== 'S');
        if (non.length) return non;
      }
      return hand.slice();
    }
    const follow = hand.filter((c) => parse(c).s === this.ledSuit);
    return follow.length ? follow : hand.slice();
  }

  play(seat, card) {
    if (this.phase !== 'playing') throw new GameError('Not the playing phase');
    if (this.turn !== seat) throw new GameError('Not your turn');
    const p = this.players[seat];
    if (!p.hand.includes(card)) throw new GameError('You do not hold that card');
    if (!this.legal(seat).includes(card)) throw new GameError('Illegal card: follow suit / spades not broken');
    p.hand.splice(p.hand.indexOf(card), 1);
    this.trick.push({ seat, card });
    const c = parse(card);
    if (this.trick.length === 1) this.ledSuit = c.s;
    else if (c.s === 'S' && this.ledSuit !== 'S') this.spadesBroken = true; // spade used to trump
    if (this.trick.length === 4) {
      let best = this.trick[0];
      for (const t of this.trick.slice(1)) if (beats(t.card, best.card, this.ledSuit)) best = t;
      this.trickWinner = best.seat;
      this.players[best.seat].tricks++;
      this.phase = 'trickPause';
    } else {
      this.turn = (seat + 1) % 4;
    }
  }

  /** Called by the server after the completed trick has been shown. */
  finishTrick() {
    if (this.phase !== 'trickPause') throw new GameError('No trick to finish');
    const w = this.trickWinner;
    this.trick = []; this.trickWinner = null; this.ledSuit = null;
    if (this.players.every((p) => p.hand.length === 0)) return this.endRound();
    this.turn = w;
    this.phase = 'playing';
  }

  endRound() {
    const rows = this.players.map((p, seat) => {
      const { points, bags } = scoreRound(p.bid, p.tricks, p.blind, this.cfg);
      p.bags += bags;
      let penalty = 0;
      while (p.bags >= this.cfg.bagLimit) { p.bags -= this.cfg.bagLimit; penalty += this.cfg.bagPenalty; }
      p.total += points - penalty;
      return { seat, bid: p.bid, blind: p.blind, tricks: p.tricks, points, bagsGained: bags, bags: p.bags, penalty, total: p.total };
    });
    this.lastRound = { round: this.round, rows };
    this.history.push(this.lastRound);
    if (this.round >= this.cfg.rounds) {
      this.final = this.computeFinal();
      this.phase = 'gameEnd';
    } else {
      this.phase = 'roundEnd';
    }
  }

  /** Highest score wins; equal scores share the win (no bag tie-breaker, per the owner's rules). */
  computeFinal() {
    const list = this.players.map((p, seat) => ({ seat, total: p.total, bags: p.bags }));
    list.sort((a, b) => b.total - a.total);
    let rank = 0;
    list.forEach((r, i) => {
      if (i === 0 || r.total !== list[i - 1].total) rank = i + 1;
      r.rank = rank;
      r.winner = rank === 1;
    });
    return { ranking: list };
  }
}

/**
 * Timeout policy (owner's rules). Used when a player's timer runs out or they have left:
 *  - bid: 0 (Round 13: "See my cards" first, then 0)
 *  - leading: lowest legal card
 *  - following: lowest card of the led suit
 *  - cannot follow: the single highest non-spade card across all suits
 *  - only spades left: lowest spade
 */
function timeoutCard(game, seat) {
  const legal = game.legal(seat);
  const lo = (a) => a.slice().sort((x, y) => parse(x).r - parse(y).r)[0];
  const hi = (a) => a.slice().sort((x, y) => parse(y).r - parse(x).r)[0];
  if (game.trick.length === 0) return lo(legal);
  const follow = legal.filter((c) => parse(c).s === game.ledSuit);
  if (follow.length) return lo(follow);
  const non = legal.filter((c) => parse(c).s !== 'S');
  return non.length ? hi(non) : lo(legal);
}

module.exports = { timeoutCard, Game, GameError, CONFIG, SUITS, parse, beats, scoreRound, buildDeck, shuffle, sortHand };
