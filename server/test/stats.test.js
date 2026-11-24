'use strict';
// Player stats: when a room game ends, each real player's running totals get one result (win / loss / draw, place,
// score or time). Only games with two or more different real players count; leaving before the end is a loss.
const assert = require('assert');
const R = require('../results');
const { LudoRoom, roll } = require('../ludo');
const { ChessRoom } = require('../chess');
const { SudokuRoom } = require('../sudoku');
const { EkahRoom } = require('../ekah');

let saved = [];
R.setStatsRecorder(async (e) => { saved.push(e); return true; });
R.setRecorder(async () => true);                                   // Ludo's win counter is tested elsewhere
const tick = () => new Promise((r) => setImmediate(r));
const human = (token, uid) => ({ token, uid, name: token, connected: true, ws: null, missed: 0 });
const bot = (name) => ({ token: null, uid: null, name, bot: true, connected: true, ws: null, missed: 0 });
const byUid = () => Object.fromEntries(saved.map((e) => [e.uid, e]));

(async () => {
  // --- the shared helpers ---
  assert.deepStrictEqual(R.byPlace([2, 0], ['a', null, 'b']).map((e) => [e.uid, e.outcome, e.place]),
    [['b', 'win', null], ['a', 'loss', null]]);                   // two players: no places
  assert.deepStrictEqual(R.byPlace([1, 0, 2], ['a', 'b', 'c']).map((e) => [e.uid, e.outcome, e.place]),
    [['b', 'win', 1], ['a', 'loss', 2], ['c', 'loss', 3]]);
  const seats = [human('a', 'a'), bot('Maya'), { ...human('c', 'c'), quit: true }, human('x', 'someone-else')];
  assert.deepStrictEqual(R.quitters(seats, ['a', 'b', 'c', 'd']), [false, true, true, true]);

  // one real player only (others are computers): nothing saved
  assert.strictEqual(await R.recordGame('ludo', [{ uid: 'a', outcome: 'win' }, { uid: null, outcome: 'loss' }]), 0);
  // the same account in two seats is still one real player
  assert.strictEqual(await R.recordGame('ludo', [{ uid: 'a', outcome: 'win' }, { uid: 'a', outcome: 'loss' }]), 0);
  // a quitter's result is a loss with no place
  saved = [];
  assert.strictEqual(await R.recordGame('ludo', [{ uid: 'a', outcome: 'win', place: 1, quit: true }, { uid: 'b', outcome: 'loss', place: 2 }]), 2);
  assert.deepStrictEqual(byUid().a, { uid: 'a', game: 'ludo', outcome: 'loss' });
  assert.strictEqual(byUid().b.place, 2);

  // --- Ludo: 3 real players and a computer; the game ends with every place set ---
  saved = [];
  const at = (s, r = 0, l = 0) => ({ s, r, l });
  const room = new LudoRoom('AAAA', '1111', 1000);
  room.seats[0] = human('a', 'user-a'); room.seats[1] = human('b', 'user-b'); room.seats[2] = bot('Maya'); room.seats[3] = human('c', 'user-c');
  room.newGame();
  const g = room.game;
  g.ranks = [3, 0];                                                // c 1st, a 2nd already
  g.tokens[1] = [at('home'), at('home'), at('home'), at('lane', 0, 4)];
  g.turnIdx = g.order.indexOf(1); g.phase = 'roll'; g.sixes = 0;
  roll(g, 1, 1); room.doMove(1, 3); room.clearTimer();             // b finishes 3rd: the computer is last
  await tick();
  assert.strictEqual(g.phase, 'gameEnd');
  const u = byUid();
  assert.deepStrictEqual([u['user-c'].outcome, u['user-c'].place], ['win', 1]);
  assert.deepStrictEqual([u['user-a'].outcome, u['user-a'].place], ['loss', 2]);
  assert.deepStrictEqual([u['user-b'].outcome, u['user-b'].place], ['loss', 3]);
  assert.strictEqual(saved.length, 3);
  room.saveResult(); await tick(); assert.strictEqual(saved.length, 3);   // never twice

  // --- Chess: resignation, and a draw ---
  saved = [];
  const ch = new ChessRoom('CCCC', '2222', 1000);
  ch.seats[0] = human('w', 'user-w'); ch.seats[1] = human('b', 'user-b');
  ch.newGame({ w: 0, b: 1 }); ch.end('0-1', 'resignation'); ch.clearTimer(); await tick();
  assert.deepStrictEqual([byUid()['user-w'].outcome, byUid()['user-b'].outcome], ['loss', 'win']);
  saved = [];
  ch.newGame({ w: 1, b: 0 }); ch.end('1/2-1/2', 'agreement'); ch.clearTimer(); await tick();
  assert.deepStrictEqual(saved.map((e) => e.outcome), ['draw', 'draw']);

  // --- Sudoku race: the winner's time counts ---
  saved = [];
  const su = new SudokuRoom('SSSS', '3333', 1000);
  su.seats[0] = human('a', 'user-a'); su.seats[1] = human('b', 'user-b');
  su.start(); su.clearTimers();
  su.game.phase = 'playing';
  su.game.players[1].finishedMs = 95000; su.game.players[0].filled = 20;
  su.finish(); await tick();
  assert.deepStrictEqual([byUid()['user-b'].outcome, byUid()['user-b'].timeMs], ['win', 95000]);
  assert.deepStrictEqual([byUid()['user-a'].outcome, byUid()['user-a'].timeMs], ['loss', undefined]);

  // --- EKAH: match over; places by match score, scores count; a player who left gets a loss ---
  saved = [];
  const ek = new EkahRoom('EEEE', '4444', 1000);
  ek.seats[0] = human('a', 'user-a'); ek.seats[1] = human('b', 'user-b'); ek.seats[2] = human('c', 'user-c');
  ek.newGame(); ek.clearTimer();
  ek.seats[2].quit = true;
  ek.game.phase = 'matchOver'; ek.game.matchWinner = 1;
  ek.game.players[0].score = 120; ek.game.players[1].score = 260; ek.game.players[2].score = 180;
  ek.saveStats(); ek.saveStats(); await tick();
  assert.strictEqual(saved.length, 3);
  assert.deepStrictEqual([byUid()['user-b'].outcome, byUid()['user-b'].place, byUid()['user-b'].score], ['win', 1, 260]);
  assert.deepStrictEqual([byUid()['user-a'].outcome, byUid()['user-a'].place, byUid()['user-a'].score], ['loss', 3, 120]);
  assert.deepStrictEqual(byUid()['user-c'], { uid: 'user-c', game: 'ekah', outcome: 'loss' });

  // --- Snakes & Ladders: the last roll that ends the game records every place ---
  saved = [];
  const { SnakesRoom } = require('../snakes');
  const sn = new SnakesRoom('NNNN', '6666', 1000);
  sn.seats[0] = human('a', 'user-a'); sn.seats[1] = human('b', 'user-b');
  sn.newGame(); sn.clearTimer();
  sn.game.pos[1] = 99; sn.game.turnIdx = sn.game.order.indexOf(1);
  for (let i = 0; i < 40 && sn.game.phase !== 'gameEnd'; i++) { sn.game.turnIdx = sn.game.order.indexOf(1); sn.game.pos[1] = 99; sn.doRoll(1); sn.clearTimer(); }
  await tick();
  assert.strictEqual(sn.game.phase, 'gameEnd');
  assert.deepStrictEqual([byUid()['user-b'].outcome, byUid()['user-a'].outcome], ['win', 'loss']);

  // --- Spades: highest score wins, places and scores count ---
  saved = [];
  const hub = require('../hub');
  const Room = hub.Room || (hub._test && hub._test.Room);
  if (Room) {
    const sp = new Room('PPPP', '7777');
    ['a', 'b', 'c', 'd'].forEach((x, i) => { sp.seats[i] = human(x, 'user-' + x); });
    sp.newGame(); sp.clearTimer();
    sp.game.phase = 'gameEnd';
    sp.game.final = { ranking: [{ seat: 2, total: 310, rank: 1, winner: true }, { seat: 0, total: 250, rank: 2, winner: false },
      { seat: 1, total: 120, rank: 3, winner: false }, { seat: 3, total: -40, rank: 4, winner: false }] };
    sp.saveStats(); sp.saveStats(); await tick();
    assert.strictEqual(saved.length, 4);
    assert.deepStrictEqual([byUid()['user-c'].outcome, byUid()['user-c'].place, byUid()['user-c'].score], ['win', 1, 310]);
    assert.deepStrictEqual([byUid()['user-d'].outcome, byUid()['user-d'].place], ['loss', 4]);
  } else console.log('(spades room class not exported: skipped)');

  // --- against computers only: nothing is saved ---
  saved = [];
  const solo = new ChessRoom('DDDD', '5555', 1000);
  solo.seats[0] = human('a', 'user-a'); solo.seats[1] = human('g', null);
  solo.newGame({ w: 0, b: 1 }); solo.end('1-0', 'checkmate'); solo.clearTimer(); await tick();
  assert.strictEqual(saved.length, 0);

  console.log('stats: ok (Ludo places, Chess win/loss/draw, Sudoku time, EKAH scores, quitters, computers-only skipped)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
