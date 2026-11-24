'use strict';
/**
 * Royal Club Chess - live room for two friends.
 *
 * Rules live in chess-engine.js (the same file the website serves at /chess/engine.js; a test checks they match), so
 * every move is checked here before it is shown to the other player.
 * Room rules:
 *  - 2 seats, no computer players. The host picks their colour (White, Black or Random) and the time control
 *    (no timer, 2+1, 5 or 10 minutes) in the waiting room, and starts once the friend is online.
 *  - Clocks are kept by the server: a player's clock runs on their turn from White's first move; running out loses
 *    (a draw if the other side has only a king).
 *  - Resign, or offer a draw (the other player accepts by offering back); an offer lapses when a move is made.
 *  - A player who goes offline during a game has ABANDON_SECS to come back from the same device (or another device on
 *    the same account); otherwise the other player wins. Both offline: nothing runs until someone returns.
 *  - Rematch (host): same settings, colours swapped.
 * Clients only send intents: 'side', 'time', 'start', 'move' {from, to, promotion}, 'resign', 'draw', 'again', 'leave'.
 */
const { Chess } = require('./chess-engine');
const { recordGame } = require('./results');

const MAX_SEATS = 2;
const ABANDON_SECS = 90;
const TIME = { '2+1': [120, 1], '5+0': [300, 0], '10+0': [600, 0] };

class ChessRoom {
  constructor(code, passcode, speed = 1) {
    this.kind = 'chess';
    this.code = code;
    this.passcode = passcode;
    this.speed = speed;
    this.seats = new Array(MAX_SEATS).fill(null);   // { token, uid, name, connected, ws, missed }
    this.hostToken = null;
    this.side = 'w';           // the host's colour: 'w', 'b' or 'r' (random)
    this.tc = 'none';
    this.game = null;          // { phase, colors: {w: seat, b: seat}, chess, clock, turnStart, result, drawOffer, abandon }
    this.timer = null;
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
  colorOf(seat) { const g = this.game; return !g ? null : g.colors.w === seat ? 'w' : g.colors.b === seat ? 'b' : null; }

  /** Time left on a clock right now (ms). */
  left(c) {
    const g = this.game;
    if (!g || !g.clock) return null;
    let t = g.clock[c];
    if (g.phase === 'playing' && g.chess.history().length > 0 && g.chess.turn() === c) t -= Date.now() - g.turnStart;
    return Math.max(0, t);
  }

  view(seat) {
    const g = this.game;
    const base = {
      t: 'state', game: 'chess', code: this.code, passcode: this.passcode, now: Date.now(), you: seat,
      host: this.hostSeat() === seat, hostSeat: this.hostSeat(),
      phase: g ? g.phase : 'lobby', side: this.side, tc: this.tc,
      seats: this.seats.map((s, i) => (s ? { seat: i, name: s.name, connected: s.connected } : null)),
    };
    if (!g) return base;
    return {
      ...base,
      colors: g.colors, color: this.colorOf(seat), sans: g.chess.history().map((m) => m.san), tcGame: g.tc,
      clock: g.clock ? { w: this.left('w'), b: this.left('b'), running: g.phase === 'playing' && g.chess.history().length > 0 ? g.chess.turn() : null } : null,
      result: g.result, drawOffer: g.drawOffer, abandon: g.abandon,
    };
  }

  broadcast() {
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = this.seats[i];
      if (s && s.ws && s.ws.open) s.ws.send(JSON.stringify(this.view(i)));
    }
  }

  start() {
    if (this.game && this.game.phase === 'playing') return;
    if (this.humans().length < 2) throw new Error('Wait for your friend to join');
    if (this.humans().some((s) => !s.connected)) throw new Error('Wait until both players are online');
    const host = this.hostSeat(), other = host === 0 ? 1 : 0;
    const hostColor = this.side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : this.side;
    this.newGame(hostColor === 'w' ? { w: host, b: other } : { w: other, b: host });
  }

  newGame(colors) {
    const tc = TIME[this.tc] ? this.tc : null;
    this.game = {
      phase: 'playing', colors, chess: new Chess(), tc,
      clock: tc ? { w: TIME[tc][0] * 1000, b: TIME[tc][0] * 1000 } : null,
      turnStart: Date.now(), result: null, drawOffer: null, abandon: null,
      uids: { w: (this.seats[colors.w] || {}).uid || null, b: (this.seats[colors.b] || {}).uid || null },   // for stats
    };
    this.schedule();
  }

  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  end(result, reason) {
    const g = this.game;
    if (!g || g.phase !== 'playing') return;
    if (g.clock) { g.clock.w = this.left('w'); g.clock.b = this.left('b'); }
    g.phase = 'gameEnd'; g.result = { result, reason }; g.drawOffer = null; g.abandon = null;
    this.clearTimer();
    // stats: win / loss / draw for both players (a player who abandoned already lost by the result)
    const out = (c) => (result === '1/2-1/2' ? 'draw' : (result === '1-0') === (c === 'w') ? 'win' : 'loss');
    recordGame('chess', [{ uid: g.uids && g.uids.w, outcome: out('w') }, { uid: g.uids && g.uids.b, outcome: out('b') }]);
  }

  onlyKing(color) {
    for (const row of this.game.chess.board()) for (const p of row) if (p && p.toLowerCase() !== 'k' && (p === p.toUpperCase() ? 'w' : 'b') === color) return false;
    return true;
  }

  /** Sets the one timer the room needs (a flag falling, or an absent player's last chance), then tells everyone. */
  schedule() {
    this.clearTimer();
    const g = this.game;
    if (g && g.phase === 'playing') {
      const st = g.chess.status();
      if (st.over) { this.end(st.result, st.reason); return this.broadcast(); }
      const away = [g.colors.w, g.colors.b].filter((s) => this.seats[s] && !this.seats[s].connected);
      if (away.length === 1) {
        if (!g.abandon || g.abandon.seat !== away[0]) g.abandon = { seat: away[0], at: Date.now() + this.ms(ABANDON_SECS * 1000) };
      } else g.abandon = null;
      if (away.length === 2) return this.broadcast();          // nobody here: everything waits
      const waits = [];
      if (g.abandon) waits.push(g.abandon.at - Date.now());
      const c = g.chess.turn();
      if (g.clock && g.chess.history().length > 0) waits.push(this.left(c));
      if (waits.length) {
        this.timer = setTimeout(() => this.tick(), Math.max(0, Math.min(...waits)) + 20);
      }
    }
    this.broadcast();
  }

  tick() {
    this.timer = null;
    const g = this.game;
    if (!g || g.phase !== 'playing') return;
    if (g.abandon && this.seats[g.abandon.seat] && this.seats[g.abandon.seat].connected) g.abandon = null;   // came back
    if (g.abandon && Date.now() >= g.abandon.at) {
      const lost = this.colorOf(g.abandon.seat);
      this.end(lost === 'w' ? '0-1' : '1-0', 'abandoned');
      return this.broadcast();
    }
    if (g.clock && g.chess.history().length > 0) {
      const c = g.chess.turn();
      if (this.left(c) <= 0) {
        const opp = c === 'w' ? 'b' : 'w';
        if (this.onlyKing(opp)) this.end('1/2-1/2', 'timeout vs insufficient material');
        else this.end(opp === 'w' ? '1-0' : '0-1', 'timeout');
        return this.broadcast();
      }
    }
    this.schedule();
  }

  /** Messages from a seated player. Returns true when the player left the room. */
  handle(seat, m) {
    const g = this.game;
    const host = this.hostSeat() === seat;
    switch (m.t) {
      case 'side':
        if (!host) throw new Error('Only the host can choose the colours');
        if (g && g.phase === 'playing') throw new Error('The game has already started');
        if (!['w', 'b', 'r'].includes(m.value)) throw new Error('Pick White, Black or Random');
        this.side = m.value; return this.broadcast();
      case 'time':
        if (!host) throw new Error('Only the host can choose the time');
        if (g && g.phase === 'playing') throw new Error('The game has already started');
        if (m.value !== 'none' && !TIME[m.value]) throw new Error('Pick a time control');
        this.tc = m.value; return this.broadcast();
      case 'addBot': case 'removeBot':
        throw new Error('Chess rooms are for two friends');
      case 'start':
        if (!host) throw new Error('Only the host can start the game');
        return this.start();
      case 'again': {
        if (!host) throw new Error('Only the host can start a rematch');
        if (!g || g.phase !== 'gameEnd') return;
        if (this.humans().length < 2 || this.humans().some((s) => !s.connected)) throw new Error('Wait until both players are online');
        return this.newGame({ w: g.colors.b, b: g.colors.w });               // colours swap
      }
      case 'move': {
        if (!g || g.phase !== 'playing') throw new Error('The game is not running');
        const c = this.colorOf(seat);
        if (!c || g.chess.turn() !== c) throw new Error('Not your move');
        if (g.clock && g.chess.history().length > 0 && this.left(c) <= 0) { this.tick(); throw new Error('Your time ran out'); }
        const promotion = ['q', 'r', 'b', 'n'].includes(m.promotion) ? m.promotion : undefined;
        const mv = g.chess.move({ from: String(m.from || ''), to: String(m.to || ''), promotion });
        if (!mv) throw new Error('That move is not allowed');
        if (g.clock) {
          if (g.chess.history().length > 1) g.clock[c] -= Date.now() - g.turnStart;   // White's first move is free
          g.clock[c] = Math.max(0, g.clock[c]) + (TIME[g.tc][1] || 0) * 1000;
        }
        g.turnStart = Date.now(); g.drawOffer = null;
        this.seats[seat].missed = 0;
        return this.schedule();
      }
      case 'resign': {
        if (!g || g.phase !== 'playing') throw new Error('The game is not running');
        const c = this.colorOf(seat); if (!c) throw new Error('You are not playing');
        this.end(c === 'w' ? '0-1' : '1-0', 'resignation');
        return this.broadcast();
      }
      case 'draw': {
        if (!g || g.phase !== 'playing') throw new Error('The game is not running');
        const c = this.colorOf(seat); if (!c) throw new Error('You are not playing');
        if (g.drawOffer && g.drawOffer !== c) { this.end('1/2-1/2', 'agreement'); return this.broadcast(); }
        g.drawOffer = g.drawOffer === c ? null : c;          // offering again takes it back
        return this.broadcast();
      }
      case 'leave': {
        const s = this.seats[seat];
        if (!g || g.phase !== 'playing') {                    // waiting room or finished game: free the seat
          this.seats[seat] = null;
          if (this.humans().length === 0) this.destroy();
          else { if (g) this.game = null; this.broadcast(); }
        } else {                                              // in a game: they may come back before the abandon time
          s.ws = null; s.connected = false;
          if (this.connectedHumans().length === 0) this.clearTimer(); else this.schedule();
        }
        return true;
      }
      default:
        return;
    }
  }

  /** A player (re)connected: an absent player's countdown stops at once. */
  onAttach() {
    if (this.game && this.game.phase === 'playing') this.schedule(); else this.broadcast();
  }

  onDetach() {
    if (!this.game || this.game.phase !== 'playing') return this.broadcast();
    this.schedule();
  }

  destroy() { this.clearTimer(); this.dead = true; for (const s of this.humans()) if (s.ws) s.ws.terminate(); }
}

module.exports = { ChessRoom, MAX_SEATS, ABANDON_SECS };
