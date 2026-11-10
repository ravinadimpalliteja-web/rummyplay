'use strict';
/**
 * Royal Club Ludo - rules engine and live room.
 *
 * Rules:
 *  - 2 to 4 real players; the host can start once two or more have joined. Colours: 2 players play red and
 *    yellow (opposite corners), 3 play red, green, yellow, 4 play all four.
 *  - A six is needed to bring a token out onto your start square.
 *  - Tokens move clockwise round the 52-square track, then up their own home lane (5 squares) to the centre.
 *    An exact roll is needed to reach the centre.
 *  - Landing on an opponent cuts it back to its yard, except on the start squares and the starred squares.
 *  - A six, a cut, or bringing a token home gives another roll. Three sixes in a row end the turn.
 *  - Play continues after the first finish, for 2nd and 3rd, until one player is left.
 * The server rolls the die. Clients only send intents: 'start', 'roll', 'move', 'react', 'again', 'leave'.
 */
const crypto = require('crypto');

const COLORS = ['red', 'green', 'yellow', 'blue'];
const START = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const REACTIONS = 8;                       // index into the client's quick phrases

/* ---------- pure rules ---------- */
const colorsFor = (n) => (n === 2 ? ['red', 'yellow'] : n === 3 ? ['red', 'green', 'yellow'] : COLORS.slice());

function newGame(order) {
  if (!Array.isArray(order) || order.length < 2 || order.length > 4) throw new Error('Ludo needs 2 to 4 players');
  const cols = colorsFor(order.length), colors = {}, tokens = {}, caps = {};
  order.forEach((s, i) => {
    colors[s] = cols[i];
    tokens[s] = [0, 1, 2, 3].map(() => ({ s: 'base', r: 0, l: 0 }));
    caps[s] = 0;
  });
  return { order: order.slice(), colors, tokens, caps, turnIdx: 0, sixes: 0, dice: 0, phase: 'roll', moves: [], ranks: [], last: null, n: 0 };
}
const turnOf = (g) => g.order[g.turnIdx];
const absOf = (color, r) => (START[color] + r) % 52;

/** The squares a token passes through for a roll of v, or null if it cannot move. */
function pathOf(g, seat, t, v) {
  if (t.s === 'home') return null;
  if (t.s === 'base') return v === 6 ? [{ s: 'track', r: 0, l: 0 }] : null;
  let s = t.s, r = t.r, l = t.l; const out = [];
  for (let k = 0; k < v; k++) {
    if (s === 'track') { if (r === 50) { s = 'lane'; l = 0; } else r++; }
    else if (s === 'lane') { if (l === 4) s = 'home'; else l++; }
    else return null;
    out.push({ s, r, l });
  }
  return out;
}
const movable = (g, seat, v) => g.tokens[seat].map((t, i) => (pathOf(g, seat, t, v) ? i : -1)).filter((i) => i >= 0);
/** The move to play automatically: only when every legal choice is the same (e.g. all tokens still in the yard). */
function forcedMove(g, seat) {
  const keys = new Set(g.moves.map((i) => { const t = g.tokens[seat][i]; return `${t.s}.${t.r}.${t.l}`; }));
  return keys.size === 1 ? g.moves[0] : null;
}

function advance(g) {
  g.sixes = 0; g.moves = []; g.phase = 'roll';
  do { g.turnIdx = (g.turnIdx + 1) % g.order.length; } while (g.ranks.includes(turnOf(g)));
}

function roll(g, seat, value) {
  if (g.phase === 'gameEnd') throw new Error('The game is over');
  if (seat !== turnOf(g)) throw new Error('It is not your turn');
  if (g.phase !== 'roll') throw new Error('Move a token first');
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('Bad roll');
  g.dice = value;
  g.sixes = value === 6 ? g.sixes + 1 : 0;
  const base = { n: ++g.n, kind: 'roll', seat, value };
  if (value === 6 && g.sixes >= 3) { g.last = { ...base, outcome: 'three-sixes' }; advance(g); return g; }
  const moves = movable(g, seat, value);
  if (!moves.length) { g.last = { ...base, outcome: 'none' }; advance(g); return g; }
  g.phase = 'move'; g.moves = moves;
  g.last = { ...base, outcome: 'choose', forced: forcedMove(g, seat) };
  return g;
}

function victimsAt(g, seat, a) {
  const out = [];
  for (const o of g.order) {
    if (o === seat) continue;
    g.tokens[o].forEach((t, i) => { if (t.s === 'track' && absOf(g.colors[o], t.r) === a) out.push({ seat: o, token: i }); });
  }
  return out;
}

function move(g, seat, i) {
  if (g.phase === 'gameEnd') throw new Error('The game is over');
  if (seat !== turnOf(g)) throw new Error('It is not your turn');
  if (g.phase !== 'move') throw new Error('Roll first');
  if (!g.moves.includes(i)) throw new Error('That token cannot move');
  const tok = g.tokens[seat][i], from = { ...tok }, steps = pathOf(g, seat, tok, g.dice);
  Object.assign(tok, steps[steps.length - 1]);
  const cuts = [];
  if (tok.s === 'track') {
    const a = absOf(g.colors[seat], tok.r);
    if (!SAFE.has(a)) for (const v of victimsAt(g, seat, a)) {
      const vt = g.tokens[v.seat][v.token];
      cuts.push({ ...v, from: { ...vt } });
      Object.assign(vt, { s: 'base', r: 0, l: 0 });
    }
  }
  g.caps[seat] += cuts.length;
  const home = tok.s === 'home';
  let finished = false;
  if (g.tokens[seat].every((t) => t.s === 'home')) { g.ranks.push(seat); finished = true; }
  const bonus = !finished && (g.dice === 6 || cuts.length > 0 || home);
  g.last = { n: ++g.n, kind: 'move', seat, token: i, from, steps, cuts, home, finished, bonus, value: g.dice };
  g.moves = [];
  const left = g.order.filter((s) => !g.ranks.includes(s));
  if (left.length <= 1) { g.ranks.push(...left); g.phase = 'gameEnd'; return g; }
  if (bonus) { g.phase = 'roll'; if (g.dice !== 6) g.sixes = 0; }
  else advance(g);
  return g;
}

/** The move the game plays for a player who is away or out of time: cut, go home, escape danger, then progress. */
function bestMove(g, seat) {
  const color = g.colors[seat], v = g.dice;
  const danger = (a) => {
    let n = 0;
    for (const o of g.order) {
      if (o === seat || g.ranks.includes(o)) continue;
      for (const t of g.tokens[o]) { if (t.s !== 'track') continue; const d = (a - absOf(g.colors[o], t.r) + 52) % 52; if (d >= 1 && d <= 6) n++; }
    }
    return n;
  };
  const prog = (t) => (t.s === 'track' ? t.r : t.s === 'lane' ? 51 + t.l : t.s === 'home' ? 57 : -1);
  let best = g.moves[0], bs = -Infinity;
  for (const i of g.moves) {
    const t = g.tokens[seat][i], steps = pathOf(g, seat, t, v), f = steps[steps.length - 1];
    let s = 0;
    if (t.s === 'base') s += 55;
    if (f.s === 'home') s += 95;
    if (f.s === 'lane' && t.s === 'track') s += 45;
    if (f.s === 'track') {
      const a = absOf(color, f.r);
      if (SAFE.has(a)) s += 22;
      else { const vic = victimsAt(g, seat, a); if (vic.length) s += 130 + vic.reduce((m, x) => m + g.tokens[x.seat][x.token].r, 0); s -= 38 * danger(a); }
    }
    if (t.s === 'track') { const a0 = absOf(color, t.r); if (!SAFE.has(a0)) s += 28 * danger(a0); }
    s += prog(f) * 0.35;
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}

/** How long clients spend animating an event. The server waits this long before the next one. */
const ANIM = { die: 1000, step: 160, cut: 550, home: 350, pass: 450 };
function animMs(last) {
  if (!last) return 0;
  if (last.kind === 'roll') return ANIM.die + (last.outcome === 'choose' ? 100 : ANIM.pass);
  return last.steps.length * ANIM.step + (last.cuts.length ? ANIM.cut : 0) + (last.home ? ANIM.home : 0) + 200;
}

/* ---------- live room ---------- */
const TURN_SECS = 15;              // time to roll, and again to choose a token, before the game plays for you
const AWAY_DELAY_MS = 1500;        // a player who left / is offline / missed 2 turns is played for after this
const AWAY_AFTER_MISSES = 2;

class LudoRoom {
  constructor(code, passcode, speed = 1) {
    this.kind = 'ludo';
    this.code = code;
    this.passcode = passcode;
    this.speed = speed;
    this.seats = [null, null, null, null];
    this.hostToken = null;
    this.game = null;
    this.timer = null;
    this.deadline = null;
    this.pauseUntil = 0;
    this.lastReact = [0, 0, 0, 0];
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
      t: 'state', game: 'ludo', code: this.code, passcode: this.passcode, now: Date.now(), you: seat,
      host: this.hostSeat() === seat,
      phase: g ? (g.phase === 'gameEnd' ? 'gameEnd' : 'playing') : 'lobby',
      seats: this.seats.map((s, i) => (s ? { seat: i, name: s.name, connected: s.connected, away: g ? this.isAway(i) : false } : null)),
    };
    if (!g) return base;
    return {
      ...base,
      order: g.order, colors: g.colors, tokens: g.tokens, turn: turnOf(g), stage: g.phase, dice: g.dice, sixes: g.sixes,
      moves: g.moves, ranks: g.ranks, last: g.last, deadline: this.deadline, moving: Date.now() < this.pauseUntil,
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
    this.game.turnIdx = crypto.randomInt(order.length);
    for (const s of this.humans()) s.missed = 0;
    this.pauseUntil = 0;
    this.schedule();
  }

  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.deadline = null; }

  schedule() {
    this.clearTimer();
    const g = this.game;
    if (!g || g.phase === 'gameEnd') return this.broadcast();
    if (this.connectedHumans().length === 0) return;                 // nobody here: the game pauses
    const at = (delay, fn) => { this.timer = setTimeout(() => { this.timer = null; fn(); }, Math.max(0, delay)); };
    const wait = this.pauseUntil - Date.now();
    if (wait > 0) { at(wait, () => this.schedule()); return this.broadcast(); }
    const seat = turnOf(g);
    if (g.phase === 'move') {
      const forced = forcedMove(g, seat);
      if (forced !== null) at(this.ms(250), () => this.autoMove(seat, false, forced));
      else if (this.isAway(seat)) at(this.ms(AWAY_DELAY_MS), () => this.autoMove(seat, false));
      else { const limit = this.ms(TURN_SECS * 1000); this.deadline = Date.now() + limit; at(limit, () => this.autoMove(seat, true)); }
    } else if (this.isAway(seat)) at(this.ms(AWAY_DELAY_MS), () => this.autoRoll(seat, false));
    else { const limit = this.ms(TURN_SECS * 1000); this.deadline = Date.now() + limit; at(limit, () => this.autoRoll(seat, true)); }
    this.broadcast();
  }

  after() { this.pauseUntil = Date.now() + this.ms(animMs(this.game.last)); this.schedule(); }
  doRoll(seat) { roll(this.game, seat, crypto.randomInt(1, 7)); this.after(); }
  doMove(seat, i) { move(this.game, seat, i); this.after(); }

  autoRoll(seat, missed) {
    try {
      const g = this.game;
      if (!g || g.phase !== 'roll' || turnOf(g) !== seat) return this.schedule();
      if (missed && this.seats[seat]) this.seats[seat].missed++;
      this.doRoll(seat);
    } catch (e) { console.error('ludo autoRoll', e); this.schedule(); }
  }
  autoMove(seat, missed, forced = null) {
    try {
      const g = this.game;
      if (!g || g.phase !== 'move' || turnOf(g) !== seat) return this.schedule();
      if (missed && this.seats[seat]) this.seats[seat].missed++;
      this.doMove(seat, forced !== null ? forced : bestMove(g, seat));
    } catch (e) { console.error('ludo autoMove', e); this.schedule(); }
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
      case 'move': {
        if (!g) throw new Error('The game has not started');
        if (g.phase === 'gameEnd') throw new Error('The game is over');
        if (turnOf(g) !== seat) throw new Error('It is not your turn');
        if (Date.now() < this.pauseUntil) throw new Error('Wait for the last move to finish');
        this.seats[seat].missed = 0;
        return m.t === 'roll' ? this.doRoll(seat) : this.doMove(seat, Number(m.token));
      }
      case 'react': {
        const i = Number(m.i), now = Date.now();
        if (!Number.isInteger(i) || i < 0 || i >= REACTIONS || now - this.lastReact[seat] < 1200) return;
        this.lastReact[seat] = now;
        const out = JSON.stringify({ t: 'react', game: 'ludo', seat, i });
        for (const s of this.seats) if (s && s.ws && s.ws.open) s.ws.send(out);
        return;
      }
      case 'leave': {
        const s = this.seats[seat];
        if (!g) {                                   // lobby: free the seat
          this.seats[seat] = null;
          if (this.humans().length === 0) this.destroy(); else this.broadcast();
        } else {                                    // in a game: the game plays for them; they may rejoin from the same device
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
    if (g && g.phase !== 'gameEnd' && turnOf(g) === seat) this.schedule(); else this.broadcast();
  }

  destroy() { this.clearTimer(); this.dead = true; for (const s of this.seats) if (s && s.ws) s.ws.terminate(); }
}

module.exports = { COLORS, START, SAFE, TURN_SECS, ANIM, newGame, roll, move, movable, pathOf, bestMove, forcedMove, animMs, turnOf, absOf, LudoRoom };
