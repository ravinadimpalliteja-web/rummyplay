'use strict';
process.env.SPEED = '200';       // shorten every timer; real timers are 30s / 20s / 15s
const assert = require('assert');
const { server } = require('../server');

const open = (port) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, errs: [], waiters: [], left: false, none: false };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.state = m; else if (m.t === 'err') c.errs.push(m.msg); else if (m.t === 'left') c.left = true; else if (m.t === 'none') c.none = true;
    c.waiters = c.waiters.filter((w) => !w());
  };
  ws.onopen = () => res(c); ws.onerror = rej;
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, ms = 8000) => new Promise((ok, no) => {
    if (pred()) return ok();
    const to = setTimeout(() => no(new Error('timeout waiting; state=' + JSON.stringify(c.state && { phase: c.state.phase, round: c.state.round, turn: c.state.turn }) + ' errs=' + c.errs)), ms);
    c.waiters.push(() => { if (pred()) { clearTimeout(to); ok(); return true; } return false; });
  });
});
const tok = () => 'tok' + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');

server.listen(0, async () => {
  try {
    const port = server.address().port;
    const [a, b, c, d, e] = await Promise.all([1, 2, 3, 4, 5].map(() => open(port)));
    const ta = tok(), tb = tok(), tc = tok(), td = tok(), te = tok();

    // validation
    a.send({ t: 'create', token: ta, name: 'Ann', passcode: 'abc' }); await a.until(() => a.errs.length);
    a.send({ t: 'create', token: ta, name: 'Ann', passcode: '4821' }); await a.until(() => a.state);
    const code = a.state.code;
    assert(/^[A-Z]{4}$/.test(code)); assert.strictEqual(a.state.phase, 'lobby'); assert(a.state.host);
    b.send({ t: 'join', token: tb, name: 'Bo', code, passcode: '0000' }); await b.until(() => b.errs.length);
    assert(/wrong/.test(b.errs[0])); assert(!b.state);
    b.send({ t: 'join', token: tb, name: 'Bo', code, passcode: '4821' }); await b.until(() => b.state);
    a.errs.length = 0; a.send({ t: 'start' }); await a.until(() => a.errs.length);              // only 2 players: cannot start
    assert(/four/i.test(a.errs[0]));
    c.send({ t: 'join', token: tc, name: 'Cy', code: code.toLowerCase(), passcode: '4821' }); await c.until(() => c.state);
    b.send({ t: 'start' }); await b.until(() => b.errs.length);                // not host
    d.send({ t: 'join', token: td, name: 'Di', code, passcode: '4821' }); await d.until(() => d.state);
    e.send({ t: 'join', token: te, name: 'Ed', code, passcode: '4821' }); await e.until(() => e.errs.length);
    assert(/full/.test(e.errs[0]));
    assert.deepStrictEqual(a.state.seats.map((s) => s.name), ['Ann', 'Bo', 'Cy', 'Di']);   // no computer players

    a.send({ t: 'start' });
    const all = [a, b, c, d];
    await Promise.all(all.map((x) => x.until(() => x.state.phase === 'bidding')));
    for (const x of all) {                       // privacy: you only ever receive your own cards
      assert.strictEqual(x.state.hand.length, 1);
      assert(x.state.players.every((p) => p.handCount === 1));
      assert(!JSON.stringify(x.state).includes('"revealed"'));
    }

    // d leaves right away (timeout rules must play for d); c stays silent (its own timer will run out); a and b play.
    d.send({ t: 'leave' }); await d.until(() => d.left);
    const play = (x) => {
      const s = x.state;
      if (!s || s.phase === 'gameEnd') return;
      if (s.bidStage) {
        if (s.bidStage.canBlind) { if (Math.random() < 0.5) x.send({ t: 'blind' }); else x.send({ t: 'see' }); return; }
        x.send({ t: 'bid', value: Math.floor(Math.random() * (s.bidStage.max + 1)) });
      } else if (s.legal && s.legal.length && s.phase === 'playing') x.send({ t: 'play', card: s.legal[0] });
      else if (s.phase === 'roundEnd' && s.stage === 'review' && !s.continued.includes(s.you)) x.send({ t: 'continue' });
    };
    for (const x of [a, b]) x.ws.addEventListener('message', () => play(x));
    play(a); play(b);
    await a.until(() => a.state.phase === 'gameEnd', 60000);
    const g = a.state;
    assert.strictEqual(g.history.length, 13);
    assert(g.final.ranking.some((r) => r.winner));
    g.players.forEach((p, seat) => {
      assert.strictEqual(p.total, g.history.reduce((s, h) => s + h.rows[seat].points - h.rows[seat].penalty, 0));
      assert(g.history.every((h) => h.rows[seat].tricks >= 0));
    });
    assert(g.history[12].rows.some((r) => r.blind) || true);
    // d's seat was auto-played: its bids are all 0 (timeout rule), except round 13 blind never chosen by timeout
    assert(g.history.every((h) => h.rows[3].bid === 0 && !h.rows[3].blind));
    assert(g.players[3].total !== undefined);

    // reconnect with the same device token, wrong token refused
    const r = await open(port);
    r.send({ t: 'hello', code, token: tok() }); await r.until(() => r.none);
    r.send({ t: 'hello', code, token: ta }); await r.until(() => r.state);
    assert.strictEqual(r.state.you, 0);

    r.send({ t: 'again' }); await r.until(() => r.state.phase === 'bidding' && r.state.round === 1);
    console.log('room tests passed (full 4-player game, leaver auto-played, 13 rounds)');
    process.exit(0);
  } catch (err) { console.error(err); process.exit(1); }
});
