'use strict';
process.env.SPEED = '50';        // shorten every timer and animation pause
const assert = require('assert');
const { server, rooms } = require('../server');

/* Computer players in Snakes & Ladders and Ludo rooms: the host adds or removes them in the waiting room, they play
   their own turns, and a friend joining a full waiting room takes a computer player's seat. */
const open = (port) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, errs: [], waiters: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.state = m; else if (m.t === 'err') c.errs.push(m.msg);
    c.waiters = c.waiters.filter((w) => !w());
  };
  ws.onopen = () => res(c); ws.onerror = rej;
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, ms = 8000) => new Promise((ok, no) => {
    if (pred()) return ok();
    const to = setTimeout(() => no(new Error('timeout; phase=' + (c.state && c.state.phase) + ' errs=' + c.errs)), ms);
    c.waiters.push(() => { if (pred()) { clearTimeout(to); ok(); return true; } return false; });
  });
  return c;
});
const tok = () => 'tok' + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
const bots = (st) => st.seats.filter((s) => s && s.bot);

server.listen(0, async () => {
  try {
    const port = server.address().port;
    for (const game of ['snakes', 'ludo']) {
      const [h, f, g2] = await Promise.all([open(port), open(port), open(port)]);
      h.send({ t: 'create', game, token: tok(), name: 'Host', passcode: '4321' }); await h.until(() => h.state);
      const code = h.state.code;
      // alone, the host cannot start
      h.send({ t: 'start' }); await h.until(() => h.errs.length);
      assert(/invite a friend or add a computer/.test(h.errs.pop()));
      h.send({ t: 'addBot' }); await h.until(() => bots(h.state).length === 1);
      h.send({ t: 'addBot' }); h.send({ t: 'addBot' }); await h.until(() => bots(h.state).length === 3);
      assert(h.state.seats.every(Boolean), 'room is full');
      assert(bots(h.state).every((s) => s.connected && s.name), 'computer players have names and count as present');
      h.send({ t: 'addBot' }); await h.until(() => h.errs.length); assert(/full/.test(h.errs.pop()));
      // a friend joins the full waiting room and takes a computer player's seat
      f.send({ t: 'join', game, code, passcode: '4321', token: tok(), name: 'Friend' }); await f.until(() => f.state);
      assert.strictEqual(bots(f.state).length, 2); assert(f.state.seats.some((s) => s && s.name === 'Friend'));
      assert(!f.state.host);
      f.send({ t: 'addBot' }); await f.until(() => f.errs.length); assert(/Only the host/.test(f.errs.pop()));
      h.send({ t: 'removeBot' }); await h.until(() => bots(h.state).length === 1);
      // the game runs to the end with the computer player taking its own turns
      h.send({ t: 'start' }); await h.until(() => h.state.phase === 'playing');
      assert.strictEqual(h.state.order.length, 3);
      const botSeat = h.state.seats.find((s) => s && s.bot).seat;
      let botMoved = false;
      h.ws.addEventListener('message', () => { const l = h.state && h.state.last; if (l && l.seat === botSeat) botMoved = true; });
      await h.until(() => h.state.phase === 'gameEnd', 120000);
      assert(botMoved, 'the computer player took its own turns');
      // joining after the start is refused, even with computer players seated
      g2.send({ t: 'join', game, code, passcode: '4321', token: tok(), name: 'Late' }); await g2.until(() => g2.errs.length);
      assert(/already started|full/.test(g2.errs[0]));
      for (const k of [h, f, g2]) k.ws.close();
      rooms.delete(code);
      console.log(`${game} room with computer players: ok (host adds/removes them, a friend takes a computer's seat, game finishes)`);
    }
    server.close(); process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
});
