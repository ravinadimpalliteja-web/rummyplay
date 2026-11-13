'use strict';
/**
 * Royal Club Sudoku race - live room.
 *
 * Everyone in the room solves the same puzzle at the same time; the fastest correct solve wins.
 * Rules live in sudoku-engine.js (the same file the website serves at /sudoku/engine.js; a test checks they match).
 * Room rules:
 *  - 2 to 4 seats. The host picks the level (Easy to Expert) and can fill open seats with computer players.
 *  - The host can start once two or more seats are filled and every human in the room is online.
 *  - A 3-second countdown, then the race. Each correct number counts; a wrong number is a mistake, and
 *    three mistakes put that player out of the race (they can keep watching). No hints in a race.
 *  - The race ends when everyone has finished or is out, or 90 seconds after the first player finishes.
 *    Ranking: finishers by time, then everyone else by how many squares they filled (fewer mistakes breaks a tie).
 *  - A player who leaves or goes offline keeps their progress and can rejoin from the same device.
 * Clients only send intents: 'level', 'addBot', 'removeBot', 'start', 'place' {i, v}, 'again', 'leave'.
 */
const Sudoku = require('./sudoku-engine');
const { addBot, removeBot } = require('./room-bots');

const MAX_SEATS = 4;
const MAX_MISTAKES = 3;
const COUNTDOWN_MS = 3000;
const FINISH_WINDOW_MS = 90 * 1000;
/* Computer players fill one correct square every few seconds (average, per level), with some randomness. */
const BOT_SECS = { easy: 7, medium: 9, hard: 12, expert: 15 };

class SudokuRoom {
  constructor(code, passcode, speed = 1) {
    this.kind = 'sudoku';
    this.code = code;
    this.passcode = passcode;
    this.speed = speed;
    this.seats = new Array(MAX_SEATS).fill(null); // humans: { token, name, connected, ws, missed }; computers: { bot: true, name }
    this.hostToken = null;
    this.level = 'medium';
    this.game = null;          // { phase, puzzle, solution, need, startAt, firstFinishAt, endAt, players: { [seat]: P }, ranking }
    this.timer = null;
    this.botTimers = new Map();
    this.lastActive = Date.now();
  }

  ms(n) { return n / this.speed; }
  humans() { return this.seats.filter((s) => s && !s.bot); }
  connectedHumans() { return this.humans().filter((s) => s.connected); }
  seatOf(token) { return this.seats.findIndex((s) => s && !s.bot && s.token === token); }
  hostSeat() {
    let i = this.seatOf(this.hostToken);
    if (i < 0) { i = this.seats.findIndex((s) => s && !s.bot); this.hostToken = i >= 0 ? this.seats[i].token : null; }
    return i;
  }

  view(seat) {
    const g = this.game;
    const base = {
      t: 'state', game: 'sudoku', code: this.code, passcode: this.passcode, now: Date.now(), you: seat,
      host: this.hostSeat() === seat, hostSeat: this.hostSeat(),
      phase: g ? g.phase : 'lobby', level: this.level,
      seats: this.seats.map((s, i) => (s ? { seat: i, name: s.name, bot: !!s.bot, connected: !!s.bot || s.connected } : null)),
    };
    if (!g) return base;
    const me = g.players[seat];
    return {
      ...base,
      puzzle: g.puzzle, solution: g.solution, need: g.need,
      startAt: g.startAt, endAt: g.endAt, firstFinishAt: g.firstFinishAt,
      players: Object.keys(g.players).map(Number).map((i) => {
        const p = g.players[i];
        return { seat: i, filled: p.filled, mistakes: p.mistakes, out: p.out, finishedMs: p.finishedMs };
      }),
      mine: me ? me.cells : null,            // the squares this player has filled correctly
      ranking: g.ranking,
    };
  }

  broadcast() {
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = this.seats[i];
      if (s && !s.bot && s.ws && s.ws.open) s.ws.send(JSON.stringify(this.view(i)));
    }
  }

  start() {
    if (this.game && this.game.phase !== 'gameEnd') return;
    const filled = this.seats.filter(Boolean);
    if (filled.length < 2) throw new Error('Invite a friend or add a computer player to start the race');
    if (this.humans().some((s) => !s.connected)) throw new Error('Wait until every player in the room is online');
    const p = Sudoku.generate(this.level);
    const players = {};
    this.seats.forEach((s, i) => { if (s) players[i] = { cells: [], filled: 0, mistakes: 0, out: false, finishedMs: null }; });
    const now = Date.now();
    this.game = {
      phase: 'countdown', puzzle: p.puzzle, solution: p.solution, need: p.puzzle.filter((v) => !v).length,
      startAt: now + this.ms(COUNTDOWN_MS), firstFinishAt: null, endAt: null, players, ranking: null,
    };
    this.clearTimers();
    this.timer = setTimeout(() => { this.timer = null; this.beginRace(); }, this.ms(COUNTDOWN_MS));
    this.broadcast();
  }

  beginRace() {
    const g = this.game;
    if (!g || g.phase !== 'countdown') return;
    g.phase = 'playing';
    this.seats.forEach((s, i) => { if (s && s.bot) this.scheduleBot(i); });
    this.broadcast();
  }

  scheduleBot(seat) {
    const g = this.game;
    if (!g || g.phase !== 'playing') return;
    const mean = BOT_SECS[this.level] || 10;
    const delay = this.ms(mean * 1000 * (0.6 + Math.random() * 0.8));
    this.botTimers.set(seat, setTimeout(() => {
      this.botTimers.delete(seat);
      const game = this.game, p = game && game.players[seat];
      if (!game || game.phase !== 'playing' || !p || p.finishedMs !== null) return;
      if (this.connectedHumans().length === 0) return this.scheduleBot(seat);   // nobody watching: wait
      const filled = new Set(p.cells);
      const open = [];
      for (let i = 0; i < 81; i++) if (!game.puzzle[i] && !filled.has(i)) open.push(i);
      if (open.length) this.applyPlace(seat, open[Math.floor(Math.random() * open.length)], null);
      this.scheduleBot(seat);
    }, delay));
  }

  /** A number placed by a player. v === null means "the correct number" (computer players). Returns 'ok' | 'wrong' | 'ignored'. */
  applyPlace(seat, i, v) {
    const g = this.game, p = g && g.players[seat];
    if (!g || g.phase !== 'playing' || !p || p.out || p.finishedMs !== null) return 'ignored';
    if (!Number.isInteger(i) || i < 0 || i > 80 || g.puzzle[i] || p.cells.includes(i)) return 'ignored';
    const value = v === null ? g.solution[i] : v;
    if (!Number.isInteger(value) || value < 1 || value > 9) return 'ignored';
    if (value !== g.solution[i]) {
      p.mistakes++;
      if (p.mistakes >= MAX_MISTAKES) p.out = true;
      this.afterChange();
      return 'wrong';
    }
    p.cells.push(i); p.filled++;
    if (p.filled >= g.need) {
      p.finishedMs = Date.now() - g.startAt;
      if (g.firstFinishAt === null) {
        g.firstFinishAt = Date.now();
        g.endAt = g.firstFinishAt + this.ms(FINISH_WINDOW_MS);
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.timer = null; this.finish(); }, this.ms(FINISH_WINDOW_MS));
      }
    }
    this.afterChange();
    return 'ok';
  }

  afterChange() {
    const g = this.game;
    const done = Object.values(g.players).every((p) => p.out || p.finishedMs !== null);
    if (done) this.finish(); else this.broadcast();
  }

  finish() {
    const g = this.game;
    if (!g || g.phase === 'gameEnd') return;
    g.phase = 'gameEnd';
    this.clearTimers();
    g.ranking = Object.keys(g.players).map(Number).sort((a, b) => {
      const A = g.players[a], B = g.players[b];
      if ((A.finishedMs !== null) !== (B.finishedMs !== null)) return A.finishedMs !== null ? -1 : 1;
      if (A.finishedMs !== null) return A.finishedMs - B.finishedMs;
      return B.filled - A.filled || A.mistakes - B.mistakes;
    });
    this.broadcast();
  }

  clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const t of this.botTimers.values()) clearTimeout(t);
    this.botTimers.clear();
  }

  /** Messages from a seated player. Returns true when the player left the room. */
  handle(seat, m) {
    const g = this.game;
    const host = this.hostSeat() === seat;
    const inLobby = !g || g.phase === 'gameEnd';
    switch (m.t) {
      case 'level': {
        if (!host) throw new Error('Only the host can choose the level');
        if (!inLobby) throw new Error('The race has already started');
        if (!Sudoku.LEVELS[m.value]) throw new Error('Pick Easy, Medium, Hard or Expert');
        this.level = m.value;
        if (g) this.game = null;                    // back to the waiting room for the next race
        return this.broadcast();
      }
      case 'addBot':
        if (g && g.phase === 'gameEnd') this.game = null;
        return addBot(this, seat);
      case 'removeBot':
        if (g && g.phase === 'gameEnd') this.game = null;
        return removeBot(this, seat);
      case 'start':
        if (!host) throw new Error('Only the host can start the race');
        return this.start();
      case 'again':
        if (!host) throw new Error('Only the host can start a new race');
        if (g && g.phase === 'gameEnd') { this.game = null; this.broadcast(); }
        return;
      case 'place': {
        const r = this.applyPlace(seat, Number(m.i), Number(m.v));
        const s = this.seats[seat];
        if (r !== 'ignored' && s && s.ws && s.ws.open) s.ws.send(JSON.stringify({ t: 'placed', i: Number(m.i), v: Number(m.v), ok: r === 'ok' }));
        return;
      }
      case 'leave': {
        const s = this.seats[seat];
        if (inLobby) {                              // waiting room (or results): free the seat; with no humans left the room closes
          this.seats[seat] = null;
          if (g) delete g.players[seat];
          if (this.humans().length === 0) this.destroy(); else this.broadcast();
        } else {                                    // mid-race: keep their progress; they may rejoin from the same device
          s.ws = null; s.connected = false;
          this.broadcast();
        }
        return true;
      }
      default:
        return;
    }
  }

  /** Called by server.js after a seated player's connection is attached again. */
  schedule() { this.broadcast(); }

  onDetach() { this.broadcast(); }

  destroy() { this.clearTimers(); this.dead = true; for (const s of this.humans()) if (s.ws) s.ws.terminate(); }
}

module.exports = { SudokuRoom, MAX_SEATS, MAX_MISTAKES, FINISH_WINDOW_MS };
