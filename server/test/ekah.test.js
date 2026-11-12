'use strict';
process.env.SPEED = '50';        // shorten every timer; the real turn timer is 30s
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../ekah-engine');

/* ---------- the website and the server use the same rules file ---------- */
assert.strictEqual(
  fs.readFileSync(path.join(__dirname, '..', 'ekah-engine.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'public', 'ekah', 'engine.js'), 'utf8'),
  'server/ekah-engine.js and web/public/ekah/engine.js must be identical'
);

/* ---------- rules ---------- */
const card = (id, type, suit, value) => ({ id, type, suit: suit || null, value: value || null });
function table(n, top, hands) {
  const s = E.createGame(Array.from({ length: n }, (_, i) => ({ name: 'P' + i })));
  s.discard = [top]; s.color = top.suit; s.direction = 1; s.turn = 0; s.vulnerable = null; s.pendingDrawn = null;
  s.players.forEach((p, i) => { p.hand = hands[i] || [card(900 + i, 'num', 'VAYU', 9), card(950 + i, 'num', 'VAYU', 8)]; });
  return s;
}
{
  const deck = E.buildDeck();
  assert.strictEqual(deck.length, 104);
  assert.strictEqual(deck.filter((c) => c.type === 'num').length, 72);
  assert.strictEqual(deck.filter((c) => c.type === 'brahma').length, 4);
  assert.strictEqual(deck.filter((c) => c.type === 'mahakal').length, 4);
  for (const t of ['maya', 'chakra', 'rin']) assert.strictEqual(deck.filter((c) => c.type === t).length, 8);
  assert(!deck.some((c) => c.type === 'num' && c.value === 0), 'no zero cards');
}
{
  // Matching: same suit or same number; anything else is refused.
  const s = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'num', 'JAL', 7), card(3, 'num', 'JAL', 5), card(4, 'num', 'AGNI', 2)]]);
  assert.deepStrictEqual(E.legalCards(s, 0).sort(), [2, 4]);
  assert(!E.applyAction(s, 0, { type: 'play', cardId: 3 }).ok);
  assert(!E.applyAction(s, 1, { type: 'draw' }).ok, 'not your turn');
}
{
  // Maya skips the next player.
  const s = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'maya', 'AGNI'), card(3, 'num', 'JAL', 1)]]);
  assert(E.applyAction(s, 0, { type: 'play', cardId: 2 }).ok);
  assert.strictEqual(s.turn, 2);
}
{
  // Chakra reverses with 3+ players and acts as a skip with 2.
  const s = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'chakra', 'AGNI'), card(3, 'num', 'JAL', 1)]]);
  E.applyAction(s, 0, { type: 'play', cardId: 2 });
  assert.strictEqual(s.direction, -1); assert.strictEqual(s.turn, 2);
  const t = table(2, card(1, 'num', 'AGNI', 7), [[card(2, 'chakra', 'AGNI'), card(3, 'num', 'JAL', 1)]]);
  E.applyAction(t, 0, { type: 'play', cardId: 2 });
  assert.strictEqual(t.turn, 0, 'two players: you play again');
}
{
  // Rin: next player draws 2 and is skipped. Mahakal needs a suit and gives 4.
  const s = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'rin', 'AGNI'), card(3, 'mahakal'), card(4, 'num', 'JAL', 1)]]);
  E.applyAction(s, 0, { type: 'play', cardId: 2 });
  assert.strictEqual(s.players[1].hand.length, 4); assert.strictEqual(s.turn, 2);
  s.turn = 0;
  assert(!E.applyAction(s, 0, { type: 'play', cardId: 3 }).ok, 'a wild needs a suit');
  E.applyAction(s, 0, { type: 'play', cardId: 3, color: 'JAL' });
  assert.strictEqual(s.color, 'JAL'); assert.strictEqual(s.players[1].hand.length, 8); assert.strictEqual(s.turn, 2);
}
{
  // Forgetting EKAH: anyone can catch you for 2 until the next player acts. Calling it protects you.
  const s = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'num', 'AGNI', 3), card(3, 'num', 'JAL', 1)]]);
  E.applyAction(s, 0, { type: 'play', cardId: 2 });
  assert.strictEqual(s.vulnerable, 0);
  assert(E.applyAction(s, 2, { type: 'catch', target: 0 }).ok);
  assert.strictEqual(s.players[0].hand.length, 3); assert.strictEqual(s.vulnerable, null);
  const t = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'num', 'AGNI', 3), card(3, 'num', 'JAL', 1)]]);
  E.applyAction(t, 0, { type: 'play', cardId: 2, ekah: true });
  assert.strictEqual(t.vulnerable, null);
  assert(!E.applyAction(t, 2, { type: 'catch', target: 0 }).ok);
}
{
  // Drawing: a playable drawn card may be played or kept; only that card can be played.
  const s = table(2, card(1, 'num', 'AGNI', 7), [[card(3, 'num', 'JAL', 1)]]);
  s.deck = [card(5, 'num', 'AGNI', 4)];
  E.applyAction(s, 0, { type: 'draw' });
  assert.strictEqual(s.pendingDrawn, 5); assert.strictEqual(s.turn, 0);
  assert.deepStrictEqual(E.legalCards(s, 0), [5]);
  assert(E.applyAction(s, 0, { type: 'pass' }).ok); assert.strictEqual(s.turn, 1);
}
{
  // Winning scores the cards left in other hands (numbers face value, actions 15, wilds 40).
  const s = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'num', 'AGNI', 3)], [card(3, 'num', 'JAL', 9), card(4, 'maya', 'JAL')], [card(5, 'brahma')]]);
  E.applyAction(s, 0, { type: 'play', cardId: 2 });
  assert.strictEqual(s.phase, 'roundOver'); assert.strictEqual(s.winner, 0); assert.strictEqual(s.players[0].score, 9 + 15 + 40);
}
{
  // Default and allowed winning scores.
  assert.strictEqual(E.createGame([{ name: 'a' }, { name: 'b' }]).target, 250);
  assert.strictEqual(E.createGame([{ name: 'a' }, { name: 'b' }], { target: 50 }).target, 50);
  assert.strictEqual(E.createGame([{ name: 'a' }, { name: 'b' }], { target: 1000 }).target, 1000);
}
{
  // Jodi: both copies of a number card together. Only number cards, only when the card can be played.
  const s = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'num', 'AGNI', 4), card(3, 'num', 'AGNI', 4), card(4, 'num', 'JAL', 5), card(5, 'num', 'JAL', 5), card(6, 'num', 'VAYU', 1)]]);
  assert.deepStrictEqual(E.jodiCards(s, 0).sort(), [2, 3], 'the Jal pair cannot be played on an Agni 7');
  assert(!E.applyAction(s, 0, { type: 'play', cardId: 6, jodi: true }).ok, 'no partner');
  // Agni: next player draws 1 and is not skipped.
  assert(E.applyAction(s, 0, { type: 'play', cardId: 2, jodi: true }).ok);
  assert.strictEqual(s.players[0].hand.length, 3); assert.strictEqual(s.players[1].hand.length, 3); assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.discard[s.discard.length - 1].suit, 'AGNI');
}
{
  // Jal: choose an opponent and see one of their cards (only the player who used it sees it).
  const s = table(3, card(1, 'num', 'JAL', 7), [[card(2, 'num', 'JAL', 4), card(3, 'num', 'JAL', 4), card(4, 'num', 'VAYU', 1)], [card(7, 'rin', 'VAYU')]]);
  assert(!E.applyAction(s, 0, { type: 'play', cardId: 2, jodi: true }).ok, 'needs a player');
  assert(!E.applyAction(s, 0, { type: 'play', cardId: 2, jodi: true, power: { target: 0 } }).ok, 'not yourself');
  assert(E.applyAction(s, 0, { type: 'play', cardId: 2, jodi: true, power: { target: 1 }, ekah: true }).ok);
  assert.strictEqual(E.viewFor(s, 0).peek.card.id, 7);
  assert.strictEqual(E.viewFor(s, 1).peek, null); assert.strictEqual(E.viewFor(s, 2).peek, null);
  assert.strictEqual(s.vulnerable, null, 'EKAH was called');
}
{
  // Prithvi: discard one extra number card; it goes under the Jodi so the top card does not change.
  const s = table(3, card(1, 'num', 'PRITHVI', 7), [[card(2, 'num', 'PRITHVI', 4), card(3, 'num', 'PRITHVI', 4), card(4, 'maya', 'JAL'), card(5, 'num', 'JAL', 9), card(6, 'num', 'AGNI', 2)]]);
  assert(!E.applyAction(s, 0, { type: 'play', cardId: 2, jodi: true, power: { cardId: 4 } }).ok, 'only a number card');
  assert(E.applyAction(s, 0, { type: 'play', cardId: 2, jodi: true, power: { cardId: 5 } }).ok);
  assert.deepStrictEqual(s.players[0].hand.map((c) => c.id).sort(), [4, 6]);
  assert.strictEqual(s.discard[s.discard.length - 1].id, 2); assert.strictEqual(s.discard[s.discard.length - 2].id, 5);
}
{
  // Vayu: give one card to the next player. Forgetting EKAH after it can be caught.
  const s = table(3, card(1, 'num', 'VAYU', 7), [[card(2, 'num', 'VAYU', 4), card(3, 'num', 'VAYU', 4), card(4, 'brahma'), card(5, 'num', 'JAL', 9)]]);
  assert(E.applyAction(s, 0, { type: 'play', cardId: 2, jodi: true, power: { cardId: 4 } }).ok);
  assert(s.players[1].hand.some((c) => c.id === 4)); assert.strictEqual(s.players[0].hand.length, 1);
  assert.strictEqual(s.vulnerable, 0);
}
{
  // A Jodi of your last two cards wins at once; a power that empties your hand also wins.
  const s = table(3, card(1, 'num', 'AGNI', 7), [[card(2, 'num', 'AGNI', 4), card(3, 'num', 'AGNI', 4)]]);
  assert(E.applyAction(s, 0, { type: 'play', cardId: 2, jodi: true }).ok);
  assert.strictEqual(s.phase, 'roundOver'); assert.strictEqual(s.winner, 0);
  const t = table(3, card(1, 'num', 'VAYU', 7), [[card(2, 'num', 'VAYU', 4), card(3, 'num', 'VAYU', 4), card(4, 'num', 'JAL', 2)]]);
  assert(E.applyAction(t, 0, { type: 'play', cardId: 2, jodi: true, power: { cardId: 4 } }).ok);
  assert.strictEqual(t.phase, 'roundOver'); assert.strictEqual(t.winner, 0);
}
{
  // After drawing, only the drawn card may be played, so no Jodi.
  const s = table(2, card(1, 'num', 'AGNI', 7), [[card(2, 'num', 'AGNI', 4), card(3, 'num', 'JAL', 1)]]);
  s.deck = [card(5, 'num', 'AGNI', 4)];
  E.applyAction(s, 0, { type: 'draw' });
  assert.deepStrictEqual(E.jodiCards(s, 0), []);
  assert(!E.applyAction(s, 0, { type: 'play', cardId: 5, jodi: true }).ok);
}
{
  // Many computer-only rounds with 2 to 10 players: no lost cards, no stuck rounds, every bot move is legal.
  let rounds = 0;
  for (let g = 0; g < 90; g++) {
    const n = 2 + (g % 9);
    const s = E.createGame(Array.from({ length: n }, (_, i) => ({ name: 'B' + i, isBot: true })));
    for (let r = 0; r < 2; r++, rounds++) {
      for (let k = 0; s.phase === 'play'; k++) {
        assert.strictEqual(E.totalCards(s), 104);
        if (s.vulnerable !== null && Math.random() < 0.3) assert(E.applyAction(s, (s.vulnerable + 1) % n, { type: 'catch', target: s.vulnerable }).ok);
        const res = E.applyAction(s, s.turn, E.botAction(s, s.turn));
        assert(res.ok, res.error);
        assert(k < 5000, 'round stuck');
      }
      assert.strictEqual(s.players[s.winner].hand.length, 0);
      E.applyAction(s, 0, { type: 'nextRound' });
    }
  }
  console.log('ekah rules: ok (' + rounds + ' simulated rounds)');
}

/* ---------- live room over real sockets ---------- */
const { server, rooms } = require('../server');
const open = (port) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, errs: [], waiters: [], left: false, none: false };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.state = m; else if (m.t === 'err') c.errs.push(m.msg); else if (m.t === 'left') c.left = true; else if (m.t === 'none') c.none = true;
    c.waiters = c.waiters.filter((w) => !w());
    if (c.auto && m.t === 'state') c.auto();
  };
  ws.onopen = () => res(c); ws.onerror = rej;
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, ms = 15000) => new Promise((ok, no) => {
    if (pred()) return ok();
    const to = setTimeout(() => no(new Error('timeout; phase=' + (c.state && c.state.phase) + ' errs=' + c.errs)), ms);
    c.waiters.push(() => { if (pred()) { clearTimeout(to); ok(); return true; } return false; });
  });
});
const tok = () => 'tok' + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
/* A test player that always makes a legal move when it is their turn. */
const autoplay = (c) => {
  c.auto = () => {
    const v = c.state.view;
    if (!v || v.phase !== 'play' || v.turn !== v.you) return;
    const seq = v.seq;
    setTimeout(() => {
      const w = c.state.view;
      if (!w || w.seq !== seq || w.turn !== w.you || w.phase !== 'play') return;
      if (w.legal.length) {
        const k = w.hand.find((x) => x.id === w.legal[0]);
        c.send({ t: 'act', action: { type: 'play', cardId: k.id, color: k.suit ? undefined : 'JAL', ekah: w.hand.length === 2 } });
      } else c.send({ t: 'act', action: { type: w.pendingDrawn !== null ? 'pass' : 'draw' } });
    }, 5);
  };
  c.auto();
};

server.listen(0, async () => {
  try {
    const port = server.address().port;
    const [a, b, c, s] = await Promise.all([1, 2, 3, 4].map(() => open(port)));
    const ta = tok(), tb = tok(), tc = tok(), ts = tok();

    a.send({ t: 'create', game: 'ekah', token: ta, name: 'Ravi', passcode: '4321' }); await a.until(() => a.state);
    const code = a.state.code;
    assert.strictEqual(a.state.game, 'ekah'); assert.strictEqual(a.state.phase, 'lobby'); assert(a.state.host);
    assert.strictEqual(a.state.seats.length, 10);

    // A Spades or Snakes client cannot join an EKAH room.
    s.send({ t: 'join', token: ts, name: 'Sp', code, passcode: '4321' }); await s.until(() => s.errs.length);
    assert(/EKAH/.test(s.errs[0]));
    s.send({ t: 'join', game: 'ekah', token: ts, name: 'Sp', code, passcode: '0000' }); await s.until(() => s.errs.length > 1);
    assert(/passcode/.test(s.errs[1]), 'wrong passcode refused');

    a.send({ t: 'start' }); await a.until(() => a.errs.length);
    assert(/at least one more/.test(a.errs[0]), 'cannot start alone');
    b.send({ t: 'join', game: 'ekah', token: tb, name: 'Sita', code, passcode: '4321' }); await b.until(() => b.state);
    b.send({ t: 'addBot' }); await b.until(() => b.errs.length);
    assert(/host/.test(b.errs[0]));
    a.send({ t: 'addBot' }); a.send({ t: 'addBot' }); a.send({ t: 'removeBot' });
    await a.until(() => a.state.seats.filter(Boolean).length === 3 && a.state.seats.some((x) => x && x.bot));
    assert.deepStrictEqual(a.state.seats.filter(Boolean).map((x) => x.bot), [false, false, true]);

    assert.strictEqual(a.state.target, 250);
    b.send({ t: 'target', value: 100 }); await b.until(() => b.errs.some((e) => /host/.test(e) && /score/.test(e)));
    a.send({ t: 'target', value: 333 }); await a.until(() => a.errs.some((e) => /50 to 1000/.test(e)));
    a.send({ t: 'target', value: 500 }); await b.until(() => b.state.target === 500);
    a.send({ t: 'start' });
    await Promise.all([a, b].map((x) => x.until(() => x.state.phase === 'game')));
    assert.strictEqual(a.state.view.target, 500);
    assert.strictEqual(a.state.view.players.length, 3);
    assert.strictEqual(a.state.view.hand.length, 7);
    assert(b.state.view.players[0].hand === undefined, 'nobody sees other hands during play');
    c.send({ t: 'join', game: 'ekah', token: tc, name: 'Cy', code, passcode: '4321' }); await c.until(() => c.errs.length);
    assert(/already started/.test(c.errs[0]));

    // Out-of-turn play is refused.
    const notTurn = a.state.view.turn === 0 ? b : a;
    const before = notTurn.errs.length;
    notTurn.send({ t: 'act', action: { type: 'draw' } }); await notTurn.until(() => notTurn.errs.length > before);
    assert(/not your turn/i.test(notTurn.errs[notTurn.errs.length - 1]), 'got: ' + notTurn.errs.join(' / '));

    // Ravi plays; Sita drops out and the computer plays her seat; she then comes back on the same device.
    autoplay(a);
    b.ws.close();
    await a.until(() => a.state.seats[1].away);
    const b2 = await open(port);
    b2.send({ t: 'hello', game: 'ekah', code, token: tb }); await b2.until(() => b2.state && b2.state.view);
    assert.strictEqual(b2.state.you, 1);
    await a.until(() => !a.state.seats[1].away || a.state.seats[1].connected);
    autoplay(b2);

    await a.until(() => a.state.view && a.state.view.phase !== 'play', 60000);
    assert(['roundOver', 'matchOver'].includes(a.state.view.phase));
    const w = a.state.view.winner;
    assert.strictEqual(a.state.view.players[w].count, 0);
    assert(a.state.view.players.every((p, i) => i === a.state.view.you || Array.isArray(p.hand)), 'hands are shown after the round');

    // Next round starts when a player asks for it.
    const round = a.state.view.round;
    b2.send({ t: 'act', action: { type: 'nextRound' } });
    await a.until(() => a.state.view.round === round + 1 && a.state.view.phase === 'play');

    // Leaving in the lobby frees the seat; the last human leaving closes the room.
    const [d, e] = await Promise.all([open(port), open(port)]);
    d.send({ t: 'create', game: 'ekah', token: tok(), name: 'Dee', passcode: '1111' }); await d.until(() => d.state);
    const code2 = d.state.code;
    e.send({ t: 'join', game: 'ekah', token: tok(), name: 'Eli', code: code2, passcode: '1111' }); await e.until(() => e.state);
    e.send({ t: 'leave' }); await e.until(() => e.left);
    await d.until(() => d.state.seats.filter(Boolean).length === 1);
    d.send({ t: 'leave' }); await d.until(() => d.left);
    assert(!rooms.has(code2), 'empty room removed');

    console.log('ekah room: ok');
    server.close(); process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
});
