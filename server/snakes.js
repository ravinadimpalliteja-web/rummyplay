'use strict';
/**
 * Royal Club Snakes & Ladders - rules engine and live room.
 *
 * Rules (owner-confirmed):
 *  - 2 to 4 real players; the host can start once two or more have joined.
 *  - A six is needed to enter the board (you enter on square 1).
 *  - A six gives another roll. Three sixes in a row cancel that whole turn: the token goes back to where it was
 *    when the turn began, and play passes on.
 *  - You must land exactly on 100 to win; a roll that would go past 100 does not move.
 * The server rolls the die. Clients only send intents: 'start', 'roll', 'again', 'leave'.
 */
const crypto = require('crypto');

const LADDERS = Object.freeze({ 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 });
const SNAKES = Object.freeze({ 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 });
const TARGET = 100;

/* ---------- pure rules ---------- */
function newGame(order) {
  if (!Array.isArray(order) || order.length < 2 || order.length > 4) throw new Error('Snakes & Ladders needs 2 to 4 players');
  const pos = {};
  for (const s of order) pos[s] = 0;
  return { order: order.slice(), pos, turnIdx: 0, streak: 0, turnStart: 0, phase: 'playing', winner: null, last: null, rolls: 0 };
}
const turnOf = (g) => g.order[g.turnIdx];

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
  g.last = { n: ++g.rolls, seat, value, from, landed, to, via, outcome, extra, win, streak: g.streak };
  if (win) { g.phase = 'gameEnd'; g.winner = seat; }
  else if (!extra) { g.streak = 0; g.turnIdx = (g.turnIdx + 1) % g.order.length; }
  return g;
}

/** How long clients spend animating a roll (die spin + steps + ladder/snake). The server waits this long. */
function animMs(last) {
  if (!last) return 0;
  let t = 1220;                                                  // die thrown across the board, plus a short pause
  if (last.outcome === 'move') t += Math.abs(last.landed - last.from) * 230;
  if (last.outcome === 'enter') t += 300;
  if (last.outcome === 'three-sixes') t += 800;
  if (last.via === 'ladder') t += 850;
  if (last.via === 'snake') t += 1250;
  return t + 250;
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
      t: 'state', game: 'snakes', code: this.code, passcode: this.passcode, now: Date.now(), you: seat,
      host: this.hostSeat() === seat,
      phase: g ? g.phase : 'lobby',
      seats: this.seats.map((s, i) => (s ? { seat: i, name: s.name, connected: s.connected, away: g ? this.isAway(i) : false } : null)),
    };
    if (!g) return base;
    return {
      ...base,
      order: g.order, players: g.order.map((s) => ({ seat: s, sq: g.pos[s] })),
      turn: turnOf(g), streak: g.streak, last: g.last, winner: g.winner,
      deadline: this.deadline, moving: Date.now() < this.pauseUntil,
    };
  }

  broadcast() {
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
        if (g && g.phase === 'gameEnd') this.newGame();
        return;
      case 'roll':
        if (!g) throw new Error('The game has not started');
        if (g.phase !== 'playing') throw new Error('The game is over');
        if (turnOf(g) !== seat) throw new Error('It is not your turn');
        if (Date.now() < this.pauseUntil) throw new Error('Wait for the last move to finish');
        this.seats[seat].missed = 0;
        return this.doRoll(seat);
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

module.exports = { LADDERS, SNAKES, TARGET, ROLL_SECS, newGame, roll, animMs, turnOf, SnakesRoom };
