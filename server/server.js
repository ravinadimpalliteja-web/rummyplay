'use strict';
/**
 * Royal Club Spades - live room server.
 *   node server.js        (PORT env, default 3000; SPEED=20 shortens every timer, for tests only)
 *
 * Rules built in: four REAL players per room (no computer players), room code + 4-digit passcode,
 * the server is the only authority (clients send intents; the engine validates everything), and a player
 * who runs out of time or leaves is played by the timeout rules in engine.js.
 */
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('./wslite');
const { Game, CONFIG, timeoutCard } = require('./engine');
const { SnakesRoom } = require('./snakes');
const { LudoRoom } = require('./ludo');
const { EkahRoom } = require('./ekah');

const PORT = Number(process.env.PORT) || 3000;
const SPEED = Number(process.env.SPEED) || 1;
const AWAY_DELAY_MS = 3000;       // a player who left / is offline / missed 2 turns in a row is auto-played after this
const NEXT_ROUND_SECS = 5;        // after the 15s scoreboard (or everyone pressing Continue)
const TRICK_PAUSE_MS = 1700;
const AWAY_AFTER_MISSES = 2;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_FAILED_JOINS = 8;

const rooms = new Map();
const ms = (n) => n / SPEED;
const sameSecret = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

class Room {
  constructor(code, passcode) {
    this.kind = 'spades';
    this.code = code;
    this.passcode = passcode;
    this.seats = [null, null, null, null]; // { token, name, connected, ws, missed }
    this.hostToken = null;
    this.game = null;
    this.stage = 'review';                 // between rounds: 'review' (scoreboard) then 'starting' (5s)
    this.timer = null;
    this.deadline = null;
    this.lastActive = Date.now();
  }

  humans() { return this.seats.filter(Boolean); }
  connectedHumans() { return this.humans().filter((s) => s.connected); }
  seatOf(token) { return this.seats.findIndex((s) => s && s.token === token); }
  hostSeat() {
    let i = this.seatOf(this.hostToken);
    if (i < 0) { i = this.seats.findIndex(Boolean); this.hostToken = i >= 0 ? this.seats[i].token : null; }
    return i;
  }
  isAway(seat) { const s = this.seats[seat]; return !s.connected || s.missed >= AWAY_AFTER_MISSES; }

  view(seat) {
    const base = {
      t: 'state', code: this.code, passcode: this.passcode, now: Date.now(), you: seat,
      host: this.hostSeat() === seat,
      phase: this.game ? this.game.phase : 'lobby',
      seats: this.seats.map((s, i) => (s ? { seat: i, name: s.name, connected: s.connected, away: this.game ? this.isAway(i) : false } : null)),
    };
    const g = this.game;
    if (!g) return base;
    const me = g.players[seat];
    return {
      ...base,
      round: g.round, rounds: g.cfg.rounds, cards: g.cards, dealer: g.dealer, turn: g.turn,
      trick: g.trick, trickWinner: g.trickWinner, ledSuit: g.ledSuit, spadesBroken: g.spadesBroken,
      deadline: this.deadline, stage: this.stage,
      players: g.players.map((p, i) => ({ seat: i, bid: p.bid, blind: p.blind, tricks: p.tricks, total: p.total, bags: p.bags, handCount: p.hand.length })),
      hand: me.seen ? me.hand : null,
      legal: g.phase === 'playing' && g.turn === seat ? g.legal(seat) : [],
      bidStage: g.phase === 'bidding' && g.turn === seat && me.bid === null
        ? { max: g.cards, canBlind: g.round === g.blindRound && !me.seen } : null,
      history: g.history, final: g.final,
      continued: [...g.continued],
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
    if (this.seats.some((s) => !s || !s.connected)) throw new Error('All four players must be in the room');
    this.newGame();
  }

  newGame() {
    this.game = new Game();
    for (const s of this.seats) s.missed = 0;
    this.game.startRound();
    this.stage = 'review';
    this.schedule();
  }

  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.deadline = null; }

  schedule() {
    this.clearTimer();
    const g = this.game;
    if (!g) return this.broadcast();
    if (this.connectedHumans().length === 0) return;            // nobody here: the game pauses
    const at = (delay, fn) => { this.timer = setTimeout(() => { this.timer = null; fn(); }, delay); };

    if (g.phase === 'bidding' || g.phase === 'playing') {
      const seat = g.turn;
      if (this.isAway(seat)) {
        at(ms(AWAY_DELAY_MS), () => this.autoAct(seat, false));
      } else {
        const limit = ms((g.phase === 'bidding' ? g.cfg.bidTime : g.cfg.playTime) * 1000);
        this.deadline = Date.now() + limit;
        at(limit, () => this.autoAct(seat, true));
      }
    } else if (g.phase === 'trickPause') {
      at(ms(TRICK_PAUSE_MS), () => { g.finishTrick(); this.schedule(); });
    } else if (g.phase === 'roundEnd') {
      if (this.stage === 'review') {
        this.humans().forEach((s, _i) => { const i = this.seats.indexOf(s); if (!s.connected) g.continued.add(i); });
        if (this.allContinued()) return this.beginStarting();
        this.deadline = Date.now() + ms(g.cfg.scoreTime * 1000);
        at(ms(g.cfg.scoreTime * 1000), () => this.beginStarting());
      } else {
        this.deadline = Date.now() + ms(NEXT_ROUND_SECS * 1000);
        at(ms(NEXT_ROUND_SECS * 1000), () => this.nextRound());
      }
    }
    this.broadcast();
  }

  allContinued() {
    const g = this.game;
    return this.connectedHumans().every((s) => g.continued.has(this.seats.indexOf(s)));
  }
  beginStarting() { if (this.game && this.game.phase === 'roundEnd') { this.stage = 'starting'; this.schedule(); } }
  nextRound() { if (this.game && this.game.phase === 'roundEnd') { this.game.startRound(); this.stage = 'review'; this.schedule(); } }

  /** The timeout policy: bid 0 / lowest-card rules. `missed` is true when the player's own timer ran out. */
  autoAct(seat, missed) {
    const g = this.game;
    try {
      if (missed) this.seats[seat].missed++;
      if (g.phase === 'bidding' && g.turn === seat) {
        if (g.round === g.blindRound && !g.players[seat].seen) g.seeCards(seat);
        g.placeBid(seat, 0);
      } else if (g.phase === 'playing' && g.turn === seat) {
        g.play(seat, timeoutCard(g, seat));
      }
    } catch (e) { console.error('autoAct', e); }
    this.schedule();
  }

  act(seat, m) {
    const g = this.game;
    if (!g) throw new Error('The game has not started');
    switch (m.t) {
      case 'see': g.seeCards(seat); break;
      case 'blind': g.placeBlind(seat); break;
      case 'bid': g.placeBid(seat, m.value); break;
      case 'play': if (typeof m.card !== 'string') throw new Error('Bad card'); g.play(seat, m.card); break;
      case 'continue':
        if (g.phase !== 'roundEnd' || this.stage !== 'review') return;
        g.continued.add(seat);
        if (this.allContinued()) return this.beginStarting();
        return this.broadcast();
      default: return;
    }
    this.seats[seat].missed = 0;
    this.schedule();
  }

  destroy() { this.clearTimer(); for (const s of this.seats) if (s && s.ws) s.ws.terminate(); }
}

const { botSeatForJoin } = require('./room-bots');
const send = (ws, o) => ws.open && ws.send(JSON.stringify(o));
const gameKind = (m) => (m && (m.game === 'snakes' || m.game === 'ludo' || m.game === 'ekah') ? m.game : 'spades');
const GAME_NAME = { spades: 'Spades', snakes: 'Snakes & Ladders', ludo: 'Ludo', ekah: 'EKAH' };
const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16) || 'Player';

function attach(ws, room, seat) {
  const s = room.seats[seat];
  if (s.ws && s.ws !== ws && s.ws.open) { s.ws.ctx = null; s.ws.terminate(); }
  s.ws = ws; s.connected = true; s.missed = 0;
  ws.ctx = { room, seat };
  room.lastActive = Date.now();
  if (room.game && !room.timer && room.game.phase !== 'gameEnd') room.schedule(); else room.broadcast();
}

function detach(ws) {
  const c = ws.ctx; ws.ctx = null;
  if (!c) return;
  const { room, seat } = c;
  const s = room.seats[seat];
  if (!s || s.ws !== ws) return;
  s.ws = null; s.connected = false;
  room.lastActive = Date.now();
  if (room.kind !== 'spades') return room.onDetach(seat);
  const g = room.game;
  if (!g) { room.broadcast(); return; }
  if (g.phase === 'bidding' || g.phase === 'playing') {
    if (g.turn === seat) room.schedule(); else room.broadcast();
  } else if (g.phase === 'roundEnd' && room.stage === 'review' && room.allContinued()) room.beginStarting();
  else room.broadcast();
}

function handle(ws, m) {
  const tokenOk = (t) => typeof t === 'string' && TOKEN_RE.test(t);
  const failJoin = (msg) => { ws.fails = (ws.fails || 0) + 1; if (ws.fails >= MAX_FAILED_JOINS) ws.terminate(); throw new Error(msg); };
  switch (m.t) {
    case 'hello': {
      const room = rooms.get(String(m.code || '').toUpperCase());
      const seat = room && room.kind === gameKind(m) && tokenOk(m.token) ? room.seatOf(m.token) : -1;
      if (seat < 0) return send(ws, { t: 'none' });
      return attach(ws, room, seat);
    }
    case 'create': {
      if (ws.ctx) throw new Error('You are already in a room');
      if (!tokenOk(m.token)) throw new Error('Bad session');
      if (!/^\d{4}$/.test(String(m.passcode))) throw new Error('The passcode must be 4 digits');
      if (rooms.size >= 500) throw new Error('The server is busy - try again soon');
      let code;
      do { code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.has(code));
      const kind = gameKind(m);
      const room = kind === 'snakes' ? new SnakesRoom(code, String(m.passcode), SPEED)
        : kind === 'ludo' ? new LudoRoom(code, String(m.passcode), SPEED)
        : kind === 'ekah' ? new EkahRoom(code, String(m.passcode), SPEED) : new Room(code, String(m.passcode));
      rooms.set(code, room);
      room.seats[0] = { token: m.token, name: cleanName(m.name), connected: false, ws: null, missed: 0 };
      room.hostToken = m.token;
      return attach(ws, room, 0);
    }
    case 'join': {
      if (ws.ctx) throw new Error('You are already in a room');
      if (!tokenOk(m.token)) throw new Error('Bad session');
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room || !sameSecret(room.passcode, m.passcode)) return failJoin('Room not found, or the passcode is wrong');
      if (room.kind !== gameKind(m)) throw new Error(`That room code is for a ${GAME_NAME[room.kind]} game`);
      let seat = room.seatOf(m.token);
      if (seat < 0) {
        if (room.game) throw new Error('That game has already started');
        seat = room.seats.findIndex((s) => !s);
        if (seat < 0 && room.kind !== 'spades') seat = botSeatForJoin(room);   // a friend takes a computer player's seat
        if (seat < 0) throw new Error('That room is full');
        room.seats[seat] = { token: m.token, name: cleanName(m.name), connected: false, ws: null, missed: 0 };
      }
      return attach(ws, room, seat);
    }
  }
  const c = ws.ctx;
  if (!c) throw new Error('Join a room first');
  const { room, seat } = c;
  room.lastActive = Date.now();
  if (room.kind !== 'spades') {
    const left = room.handle(seat, m);
    if (left) { ws.ctx = null; if (room.dead) rooms.delete(room.code); send(ws, { t: 'left' }); }
    return;
  }
  switch (m.t) {
    case 'start':
      if (room.hostSeat() !== seat) throw new Error('Only the host can start the game');
      room.start(); return;
    case 'again':
      if (room.hostSeat() !== seat) throw new Error('Only the host can start a new game');
      if (room.game && room.game.phase === 'gameEnd') room.newGame();
      return;
    case 'leave': {
      const s = room.seats[seat];
      ws.ctx = null;
      if (!room.game) {                       // lobby: free the seat
        room.seats[seat] = null; s.ws = null;
        if (room.humans().length === 0) { room.destroy(); rooms.delete(room.code); } else room.broadcast();
      } else {                                // in a game: the timeout rules play for them; they may rejoin with the same device
        s.ws = null; s.connected = false;
        if (room.connectedHumans().length === 0) room.clearTimer();
        else if (room.game.phase === 'bidding' || room.game.phase === 'playing') { if (room.game.turn === seat) room.schedule(); else room.broadcast(); }
        else if (room.game.phase === 'roundEnd' && room.stage === 'review' && room.allContinued()) room.beginStarting();
        else room.broadcast();
      }
      return send(ws, { t: 'left' });
    }
    default:
      return room.act(seat, m);
  }
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Royal Club room server is running.\n');
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.alive = true; ws.ctx = null;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    try { handle(ws, m); } catch (e) { send(ws, { t: 'err', msg: e.message || 'Error' }); }
  });
  ws.on('close', () => detach(ws));
});

setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 20000).unref();
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (room.connectedHumans().length === 0 && now - room.lastActive > ROOM_IDLE_MS) { room.destroy(); rooms.delete(code); }
}, 60000).unref();

if (require.main === module) server.listen(PORT, () => console.log(`Royal Club room server on port ${PORT} (${CONFIG.rounds} rounds, speed x${SPEED})`));
module.exports = { server, rooms };
