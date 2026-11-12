'use strict';
/**
 * Royal Club EKAH - live room.
 *
 * Rules live in ekah-engine.js (the same file the website uses at /ekah/engine.js; a test checks they match).
 * Room rules:
 *  - 2 to 10 seats. The host can fill open seats with computer players; friends join with code + passcode.
 *  - The host picks the winning score in the waiting room (50 to 1000 in steps of 50, default 250).
 *  - The host can start once two or more seats are filled and every human in the room is online.
 *  - 30 seconds per turn. A player who runs out of time, leaves or goes offline is played by the computer
 *    (after 2 seconds once they have missed two turns or are offline). They can rejoin from the same device.
 *  - After a round the next one starts when any player presses Next round, or automatically after 25 seconds.
 * Clients only send intents: 'addBot', 'removeBot', 'target', 'start', 'act' (with an engine action), 'again', 'leave'.
 */
const Engine = require('./ekah-engine');

const MAX_SEATS = 10;
const TURN_SECS = 30;
const BOT_DELAY_MS = 1800;          // computer players take 1.8 to 2.8 seconds, like a person thinking
const BOT_DELAY_SPREAD_MS = 1000;
const AWAY_DELAY_MS = 2000;
const AWAY_AFTER_MISSES = 2;
const NEXT_ROUND_SECS = 25;
const BOT_NAMES = ['Arjun', 'Meera', 'Kabir', 'Ananya', 'Vikram', 'Priya', 'Rohan', 'Isha', 'Dev'];

class EkahRoom {
  constructor(code, passcode, speed = 1) {
    this.kind = 'ekah';
    this.code = code;
    this.passcode = passcode;
    this.speed = speed;
    this.seats = new Array(MAX_SEATS).fill(null); // humans: { token, name, connected, ws, missed }; computers: { bot: true, name }
    this.hostToken = null;
    this.game = null;
    this.target = Engine.TARGET;
    this.order = [];          // engine player index -> seat
    this.timer = null;
    this.catchTimer = null;
    this.deadline = null;
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
  isAway(seat) { const s = this.seats[seat]; return !s || (!s.bot && (!s.connected || s.missed >= AWAY_AFTER_MISSES)); }
  playerOf(seat) { return this.order.indexOf(seat); }

  view(seat) {
    const g = this.game;
    const base = {
      t: 'state', game: 'ekah', code: this.code, passcode: this.passcode, now: Date.now(), you: seat,
      host: this.hostSeat() === seat,
      phase: g ? 'game' : 'lobby', target: this.target,
      seats: this.seats.map((s, i) => (s ? { seat: i, name: s.name, bot: !!s.bot, connected: !!s.bot || s.connected, away: g ? this.isAway(i) && !s.bot : false } : null)),
    };
    if (!g) return base;
    const pi = this.playerOf(seat);
    const v = Engine.viewFor(g, pi);
    v.players.forEach((p, i) => { const s = this.seats[this.order[i]]; p.away = !!(s && !s.bot && this.isAway(this.order[i])); });
    return { ...base, deadline: this.deadline, view: v };
  }

  broadcast() {
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = this.seats[i];
      if (s && !s.bot && s.ws && s.ws.open) s.ws.send(JSON.stringify(this.view(i)));
    }
  }

  start() {
    if (this.game) return;
    const filled = this.seats.filter(Boolean);
    if (filled.length < 2) throw new Error('Add at least one more player or computer to start');
    if (this.humans().some((s) => !s.connected)) throw new Error('Wait until every player in the room is online');
    this.newGame();
  }

  newGame() {
    this.order = this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    this.game = Engine.createGame(this.order.map((i) => ({ name: this.seats[i].name, isBot: !!this.seats[i].bot })), { target: this.target });
    for (const s of this.humans()) s.missed = 0;
    this.schedule();
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    if (this.catchTimer) clearTimeout(this.catchTimer);
    this.timer = null; this.catchTimer = null; this.deadline = null;
  }

  schedule() {
    this.clearTimer();
    const g = this.game;
    if (!g) return this.broadcast();
    if (this.connectedHumans().length === 0) return;               // nobody here: the game pauses
    const at = (delay, fn) => { this.timer = setTimeout(() => { this.timer = null; fn(); }, Math.max(0, delay)); };

    if (g.phase === 'play') {
      const seat = this.order[g.turn];
      const s = this.seats[seat];
      if (s.bot) at(this.ms(BOT_DELAY_MS + Math.random() * BOT_DELAY_SPREAD_MS), () => this.autoAct(seat, false));
      else if (this.isAway(seat)) at(this.ms(AWAY_DELAY_MS), () => this.autoAct(seat, false));
      else {
        const limit = this.ms(TURN_SECS * 1000);
        this.deadline = Date.now() + limit;
        at(limit, () => this.autoAct(seat, true));
      }
      this.scheduleCatch();
    } else if (g.phase === 'roundOver') {
      const limit = this.ms(NEXT_ROUND_SECS * 1000);
      this.deadline = Date.now() + limit;
      at(limit, () => { if (this.game && this.game.phase === 'roundOver') { Engine.applyAction(this.game, 0, { type: 'nextRound' }); this.schedule(); } });
    }
    this.broadcast();
  }

  /* Computer players sometimes catch a player who forgot to call EKAH. */
  scheduleCatch() {
    const g = this.game;
    if (g.vulnerable === null) return;
    const target = g.vulnerable;
    const catchers = this.order.map((seat, pi) => ({ seat, pi })).filter((x) => x.pi !== target && this.seats[x.seat].bot);
    if (!catchers.length || Math.random() >= 0.55) return;
    const by = catchers[Math.floor(Math.random() * catchers.length)].pi;
    this.catchTimer = setTimeout(() => {
      this.catchTimer = null;
      if (this.game && this.game.phase === 'play' && this.game.vulnerable === target) {
        Engine.applyAction(this.game, by, { type: 'catch', target });
        this.schedule();
      }
    }, this.ms(700 + Math.random() * 500));
  }

  autoAct(seat, missed) {
    try {
      const g = this.game;
      const pi = this.playerOf(seat);
      if (!g || g.phase !== 'play' || g.turn !== pi) return this.schedule();
      if (missed && this.seats[seat] && !this.seats[seat].bot) this.seats[seat].missed++;
      const r = Engine.applyAction(g, pi, Engine.botAction(g, pi));
      if (!r.ok) Engine.applyAction(g, pi, g.pendingDrawn !== null ? { type: 'pass' } : { type: 'draw' });
    } catch (e) { console.error('ekah autoAct', e); }
    this.schedule();
  }

  /** Messages from a seated player. Returns true when the player left the room. */
  handle(seat, m) {
    const g = this.game;
    const host = this.hostSeat() === seat;
    switch (m.t) {
      case 'addBot': {
        if (!host) throw new Error('Only the host can add computer players');
        if (g) throw new Error('The game has already started');
        const i = this.seats.findIndex((s) => !s);
        if (i < 0) throw new Error('The room is full');
        const used = new Set(this.seats.filter(Boolean).map((s) => s.name));
        this.seats[i] = { bot: true, name: BOT_NAMES.find((n) => !used.has(n)) || 'Computer ' + (i + 1) };
        return this.broadcast();
      }
      case 'removeBot': {
        if (!host) throw new Error('Only the host can remove computer players');
        if (g) throw new Error('The game has already started');
        for (let i = MAX_SEATS - 1; i >= 0; i--) if (this.seats[i] && this.seats[i].bot) { this.seats[i] = null; break; }
        return this.broadcast();
      }
      case 'target': {
        if (!host) throw new Error('Only the host can choose the winning score');
        if (g) throw new Error('The game has already started');
        const v = Number(m.value);
        if (!Number.isInteger(v) || v < Engine.TARGET_MIN || v > Engine.TARGET_MAX || v % Engine.TARGET_STEP)
          throw new Error('Pick a winning score from 50 to 1000, in steps of 50');
        this.target = v;
        return this.broadcast();
      }
      case 'start':
        if (!host) throw new Error('Only the host can start the game');
        return this.start();
      case 'again':
        if (!host) throw new Error('Only the host can start a new match');
        if (g && g.phase === 'matchOver') { Engine.applyAction(g, 0, { type: 'nextRound' }); this.schedule(); }
        return;
      case 'act': {
        if (!g) throw new Error('The game has not started');
        const a = m.action;
        if (!a || typeof a !== 'object' || typeof a.type !== 'string') throw new Error('Bad move');
        if (a.type === 'nextRound' && g.phase === 'matchOver' && !host) throw new Error('Only the host can start a new match');
        const r = Engine.applyAction(g, this.playerOf(seat), {
          type: a.type, cardId: Number(a.cardId), color: typeof a.color === 'string' ? a.color : undefined, ekah: a.ekah === true, target: Number(a.target),
          jodi: a.jodi === true,
          power: a.power && typeof a.power === 'object' ? { target: Number(a.power.target), cardId: Number(a.power.cardId) } : undefined,
        });
        if (!r.ok) throw new Error(r.error);
        this.seats[seat].missed = 0;
        return this.schedule();
      }
      case 'leave': {
        const s = this.seats[seat];
        if (!g) {                                   // lobby: free the seat; with no humans left the room closes
          this.seats[seat] = null;
          if (this.humans().length === 0) this.destroy(); else this.broadcast();
        } else {                                    // in a game: the computer plays for them; they may rejoin from the same device
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
    if (g && g.phase === 'play' && this.order[g.turn] === seat) this.schedule();
    else if (g && !this.timer) this.schedule();
    else this.broadcast();
  }

  destroy() { this.clearTimer(); this.dead = true; for (const s of this.humans()) if (s.ws) s.ws.terminate(); }
}

module.exports = { EkahRoom, MAX_SEATS, TURN_SECS };
