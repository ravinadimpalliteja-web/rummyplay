'use strict';
/**
 * Royal Club Snakes & Ladders - rules engine and live room.
 *
 * Rules (owner-confirmed):
 *  - 2 to 4 real players; the host can start once two or more have joined.
 *  - A six is needed to enter the board (you enter on square 1).
 *  - A six gives another roll. Three sixes in a row cancel that whole turn: the token goes back to where it was
 *    when the turn began, and play passes on.
 *  - You must land exactly on 100; a roll that would go past 100 does not move.
 *  - Rankings: the game goes on after someone reaches 100. Each finisher takes the next place (1st, 2nd, 3rd);
 *    the game ends when only one player is left, who takes last place.
 * The server rolls the die. Clients only send intents: 'start', 'roll', 'again', 'leave', 'chat'.
 */
const crypto = require('crypto');

/* A tougher board: ten long snakes, six short ladders. Must match web/src/snakes/engine.ts (a test checks this). */
const LADDERS = Object.freeze({ 14: 28, 22: 43, 35: 54, 59: 63, 74: 95 });
const SNAKES = Object.freeze({ 49: 7, 60: 19, 64: 17, 73: 51, 82: 43, 93: 55, 98: 44 });
const BOARD_VERSION = 2;          // must match web/src/snakes/engine.ts; clients won't start a room game on another board
const TARGET = 100;

/* Quick chat: players pick from these by index; no free text yet. Must match the web client's lists. */
const CHAT_PHRASES = 8;   // Nice move! · Good luck · Well played · Oops! · Hurry up · So close! · Haha · Thank you
const CHAT_EMOJIS = 12;
const CHAT_GAP_MS = 1200;

/* Player tokens: three collections (4 pawns, 8 people, 9 animals). Must match web/src/snakes/tokens.ts (a test checks this).
   Every seat always holds a token, and no two seats share one. */
const PIECE_IDS = Object.freeze([
  'pawn-gold', 'pawn-green', 'pawn-red', 'pawn-blue',
  'young-explorer', 'jungle-adventurer', 'mountain-adventurer', 'outdoor-explorer', 'cricketer', 'chef', 'dancer', 'scholar',
  'lion', 'panda', 'elephant', 'rabbit', 'peacock', 'monkey', 'fox', 'tiger', 'deer',
]);
const DEFAULT_PIECES = Object.freeze(['pawn-gold', 'pawn-green', 'pawn-red', 'pawn-blue']);

/* ---------- pure rules ---------- */
function newGame(order) {
  if (!Array.isArray(order) || order.length < 2 || order.length > 4) throw new Error('Snakes & Ladders needs 2 to 4 players');
  const pos = {};
  for (const s of order) pos[s] = 0;
  return { order: order.slice(), pos, turnIdx: 0, streak: 0, turnStart: 0, phase: 'playing', winner: null, last: null, rolls: 0, finished: [] };
}
const turnOf = (g) => g.order[g.turnIdx];
function nextTurn(g) {
  for (let i = 0; i < g.order.length; i++) {
    g.turnIdx = (g.turnIdx + 1) % g.order.length;
    if (!g.finished.includes(g.order[g.turnIdx])) return;
  }
}

/** Applies one roll for `seat`. Mutates and returns the game; `g.last` describes what happened. */
function roll(g, seat, value) {
  if (g.phase !== 'playing') throw new Error('The game is over');
  if (seat !== turnOf(g)) throw new Error('It is not your turn');
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('Bad roll');
  const from = g.pos[seat];
  if (g.streak === 0) g.turnStart = from;
  if (value === 6) g.streak++;

  let outcome, landed = from, to = from, via = null;
  if (value === 6 && g.streak >= 3) { outcome = 'three-sixes'; to = landed = g.turnStart; }
  else if (from === 0 && value !== 6) outcome = 'need-six';
  else if (from === 0) { outcome = 'enter'; to = landed = 1; }
  else if (from + value > TARGET) outcome = 'overshoot';
  else { outcome = 'move'; to = landed = from + value; }
  if (outcome === 'move' || outcome === 'enter') {
    if (LADDERS[landed]) { via = 'ladder'; to = LADDERS[landed]; }
    else if (SNAKES[landed]) { via = 'snake'; to = SNAKES[landed]; }
  }
  g.pos[seat] = to;
  const win = to === TARGET;
  const extra = value === 6 && outcome !== 'three-sixes' && !win;
  let rank = null, ended = false;
  if (win) {
    g.finished.push(seat); rank = g.finished.length;
    const left = g.order.filter((s) => !g.finished.includes(s));
    if (left.length <= 1) { g.finished.push(...left); g.phase = 'gameEnd'; g.winner = g.finished[0]; ended = true; }
  }
  g.last = { n: ++g.rolls, seat, value, from, landed, to, via, outcome, extra, win, rank, ended, streak: g.streak };
  if (!ended && !extra) { g.streak = 0; nextTurn(g); }
  return g;
}

/* ---------- animation timing, shared with the web client (web/src/snakes/engine.ts) ---------- */
const TIMING = Object.freeze({ die: 1100, settle: 120, step: 230, enter: 300, ret: 800, rung: 120, ladderBase: 150,
  mouth: 380, slideBase: 500, slidePerSquare: 230, pop: 320, finish1: 3200, finishN: 1700, gap: 250 });
const sqXY = (n) => { const row = Math.floor((n - 1) / 10); let col = (n - 1) % 10; if (row % 2) col = 9 - col; return [col, row]; };
const dist = (a, b) => { const [x1, y1] = sqXY(a), [x2, y2] = sqXY(b); return Math.hypot(x2 - x1, y2 - y1); };
const rungsOf = (a, b) => Math.max(3, Math.floor((dist(a, b) * 60) / 19));
const ladderMs = (a, b) => TIMING.ladderBase + rungsOf(a, b) * TIMING.rung;
const snakeMs = (h, t) => Math.round(TIMING.mouth + TIMING.slideBase + dist(h, t) * TIMING.slidePerSquare + TIMING.pop);

/** How long clients spend animating a roll (die spin + steps + ladder/snake). The server waits this long. */
function animMs(last) {
  if (!last) return 0;
  let t = TIMING.die + TIMING.settle;
  if (last.outcome === 'move') t += Math.abs(last.landed - last.from) * TIMING.step;
  if (last.outcome === 'enter') t += TIMING.enter;
  if (last.outcome === 'three-sixes') t += TIMING.ret;
  if (last.via === 'ladder') t += ladderMs(last.landed, last.to);
  if (last.via === 'snake') t += snakeMs(last.landed, last.to);
  if (last.win) t += last.rank === 1 ? TIMING.finish1 : TIMING.finishN;
  return t + TIMING.gap;
}

/* ---------- live room ---------- */
const ROLL_SECS = 15;              // time to roll before the server rolls for you
const AWAY_DELAY_MS = 1500;        // a player who left / is offline / missed 2 turns is rolled for after this
const AWAY_AFTER_MISSES = 2;

class SnakesRoom {
  constructor(code, passcode, speed = 1) {
    this.kind = 'snakes';
    this.code = code;
    this.passcode = passcode;
    this.speed = speed;
    this.seats = [null, null, null, null];
    this.hostToken = null;
    this.game = null;
    this.timer = null;
    this.deadline = null;
    this.pauseUntil = 0;
    this.lastActive = Date.now();
  }

  ms(n) { return n / this.speed; }
  humans() { return this.seats.filter(Boolean); }
  connectedHumans() { return this.humans().filter((s) => s.connected); }
  seatOf(token) { return this.seats.findIndex((s) => s && s.token === token); }
  hostSeat() {
    let i = this.seatOf(this.hostToken);
    if (i < 0) { i = this.seats.findIndex(Boolean); this.hostToken = i >= 0 ? this.seats[i].token : null; }
    return i;
  }
  isAway(seat) { const s = this.seats[seat]; return !s || !s.connected || s.missed >= AWAY_AFTER_MISSES; }

  view(seat) {
    const g = this.game;
    const base = {
      t: 'state', game: 'snakes', board: BOARD_VERSION, code: this.code, passcode: this.passcode, now: Date.now(), you: seat,
      host: this.hostSeat() === seat,
      phase: g ? g.phase : 'lobby',
      seats: this.seats.map((s, i) => (s ? { seat: i, name: s.name, connected: s.connected, away: g ? this.isAway(i) : false, piece: s.piece } : null)),
    };
    if (!g) return base;
    return {
      ...base,
      order: g.order, players: g.order.map((s) => ({ seat: s, sq: g.pos[s] })),
      turn: turnOf(g), streak: g.streak, last: g.last, winner: g.winner, finished: g.finished,
      deadline: this.deadline, moving: Date.now() < this.pauseUntil,
    };
  }

  /** Gives any seat without a token the first free one (its seat's pawn colour first). */
  assignPieces() {
    for (let i = 0; i < 4; i++) {
      const s = this.seats[i];
      if (!s || (s.piece && PIECE_IDS.includes(s.piece) && !this.seats.some((o, j) => j !== i && o && o.piece === s.piece))) continue;
      const taken = new Set(this.seats.filter((o, j) => o && j !== i && o.piece).map((o) => o.piece));
      s.piece = [DEFAULT_PIECES[i], ...DEFAULT_PIECES, ...PIECE_IDS].find((p) => !taken.has(p));
    }
  }

  broadcast() {
    this.assignPieces();
    for (let i = 0; i < 4; i++) {
      const s = this.seats[i];
      if (s && s.ws && s.ws.open) s.ws.send(JSON.stringify(this.view(i)));
    }
  }

  start() {
    if (this.game) return;
    const seated = this.humans();
    if (seated.length < 2) throw new Error('At least two players are needed to start');
    if (seated.some((s) => !s.connected)) throw new Error('Wait until every player in the room is online');
    this.newGame();
  }

  newGame() {
    const order = this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    this.game = newGame(order);
    for (const s of this.humans()) s.missed = 0;
    this.pauseUntil = 0;
    this.schedule();
  }

  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.deadline = null; }

  schedule() {
    this.clearTimer();
    const g = this.game;
    if (!g || g.phase !== 'playing') return this.broadcast();
    if (this.connectedHumans().length === 0) return;                 // nobody here: the game pauses
    const at = (delay, fn) => { this.timer = setTimeout(() => { this.timer = null; fn(); }, Math.max(0, delay)); };
    const wait = this.pauseUntil - Date.now();
    if (wait > 0) { at(wait, () => this.schedule()); return this.broadcast(); }
    const seat = turnOf(g);
    if (this.isAway(seat)) at(this.ms(AWAY_DELAY_MS), () => this.autoRoll(seat, false));
    else {
      const limit = this.ms(ROLL_SECS * 1000);
      this.deadline = Date.now() + limit;
      at(limit, () => this.autoRoll(seat, true));
    }
    this.broadcast();
  }

  doRoll(seat) {
    roll(this.game, seat, crypto.randomInt(1, 7));
    this.pauseUntil = Date.now() + this.ms(animMs(this.game.last));
    this.schedule();
  }

  autoRoll(seat, missed) {
    try {
      const g = this.game;
      if (!g || g.phase !== 'playing' || turnOf(g) !== seat) return this.schedule();
      if (missed && this.seats[seat]) this.seats[seat].missed++;
      this.doRoll(seat);
    } catch (e) { console.error('snakes autoRoll', e); this.schedule(); }
  }

  /** Messages from a seated player. Returns true when the player left the room. */
  handle(seat, m) {
    const g = this.game;
    switch (m.t) {
      case 'start':
        if (this.hostSeat() !== seat) throw new Error('Only the host can start the game');
        return this.start();
      case 'again':
        if (this.hostSeat() !== seat) throw new Error('Only the host can start a new game');
        // back to the waiting room, so everyone can pick a token before the next match
        if (g && g.phase === 'gameEnd') {
          this.clearTimer(); this.game = null; this.pauseUntil = 0;
          for (let i = 0; i < 4; i++) if (this.seats[i] && !this.seats[i].connected) this.seats[i] = null;   // players who left
          this.hostSeat(); this.broadcast();
        }
        return;
      case 'piece': {
        if (g) throw new Error('Tokens are chosen before the match starts');
        const id = String(m.id || '');
        if (!PIECE_IDS.includes(id)) throw new Error('Unknown token');
        const other = this.seats.find((o, j) => o && j !== seat && o.piece === id);
        if (other) throw new Error(`${other.name} already has that token`);
        this.seats[seat].piece = id;
        return this.broadcast();
      }
      case 'roll':
        if (!g) throw new Error('The game has not started');
        if (g.phase !== 'playing') throw new Error('The game is over');
        if (turnOf(g) !== seat) throw new Error('It is not your turn');
        if (Date.now() < this.pauseUntil) throw new Error('Wait for the last move to finish');
        this.seats[seat].missed = 0;
        return this.doRoll(seat);
      case 'chat': {
        const kind = m.k === 'e' ? 'e' : 'p', i = Number(m.i);
        if (!Number.isInteger(i) || i < 0 || i >= (kind === 'e' ? CHAT_EMOJIS : CHAT_PHRASES)) throw new Error('Unknown chat message');
        const s = this.seats[seat], now = Date.now();
        if (s.lastChat && now - s.lastChat < CHAT_GAP_MS) return;           // quietly drop rapid repeats
        s.lastChat = now;
        const out = JSON.stringify({ t: 'chat', seat, k: kind, i, at: now });
        for (const x of this.seats) if (x && x.ws && x.ws.open) x.ws.send(out);
        return;
      }
      case 'leave': {
        const s = this.seats[seat];
        if (!g) {                                   // lobby: free the seat
          this.seats[seat] = null;
          if (this.humans().length === 0) this.destroy(); else this.broadcast();
        } else {                                    // in a game: the server rolls for them; they may rejoin from the same device
          s.ws = null; s.connected = false;
          if (this.connectedHumans().length === 0) this.clearTimer(); else this.onTurnHolderChange(seat);
        }
        return true;
      }
      default:
        return;
    }
  }

  onDetach(seat) {
    if (!this.game) return this.broadcast();
    if (this.connectedHumans().length === 0) return this.clearTimer();
    this.onTurnHolderChange(seat);
  }

  onTurnHolderChange(seat) {
    const g = this.game;
    if (g && g.phase === 'playing' && turnOf(g) === seat) this.schedule(); else this.broadcast();
  }

  destroy() { this.clearTimer(); this.dead = true; for (const s of this.seats) if (s && s.ws) s.ws.terminate(); }
}

module.exports = { LADDERS, SNAKES, BOARD_VERSION, TARGET, ROLL_SECS, TIMING, CHAT_PHRASES, CHAT_EMOJIS, PIECE_IDS, DEFAULT_PIECES, newGame, roll, animMs, turnOf, rungsOf, SnakesRoom };
