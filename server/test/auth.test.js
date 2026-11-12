'use strict';
// Rooms require a signed-in Royal Club account: no token / guest / no username are refused, the username is used
// as the seat name, and the same account on a second device takes back its own seat.
process.env.SPEED = '200';
delete process.env.ROOM_AUTH;
const assert = require('assert');
const { server } = require('../server');
const { setVerifier, AuthError } = require('../auth');

const ACCOUNTS = {
  'tok-ravi': { id: 'u-ravi', username: 'RaviKing' },
  'tok-sita': { id: 'u-sita', username: 'Sita_7' },
};
setVerifier(async (token) => {
  if (token === 'tok-guest') throw new AuthError('Create a Royal Club username to play with friends.');
  if (ACCOUNTS[token]) return ACCOUNTS[token];
  throw new AuthError('Your sign-in has expired. Please sign in again.');
});

const open = (port) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, state: null, errs: [], errMsgs: [], waiters: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.state = m; else if (m.t === 'err') { c.errs.push(m.msg); c.errMsgs.push(m); }
    c.waiters = c.waiters.filter((w) => !w());
  };
  ws.onopen = () => res(c); ws.onerror = rej;
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, ms = 5000) => new Promise((ok, no) => {
    if (pred()) return ok();
    const to = setTimeout(() => no(new Error('timeout; errs=' + c.errs)), ms);
    c.waiters.push(() => { if (pred()) { clearTimeout(to); ok(); return true; } return false; });
  });
});
const tok = () => 'tok' + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');

server.listen(0, async () => {
  try {
    const port = server.address().port;
    const [a, b, g, n, b2] = await Promise.all([1, 2, 3, 4, 5].map(() => open(port)));

    // no sign-in at all
    n.send({ t: 'create', game: 'ludo', token: tok(), name: 'Nobody', passcode: '1234' });
    await n.until(() => n.errs.length);
    assert(/sign in/i.test(n.errs[0]) && n.errMsgs[0].auth === true && !n.state);

    // guest sign-in
    g.send({ t: 'create', game: 'ludo', token: tok(), name: 'Guest', passcode: '1234', auth: 'tok-guest' });
    await g.until(() => g.errs.length);
    assert(/username/i.test(g.errs[0]) && !g.state);

    // a real account creates a room; the typed name is ignored in favour of the username
    const ta = tok();
    a.send({ t: 'create', game: 'ludo', token: ta, name: 'Typed name', passcode: '1234', auth: 'tok-ravi' });
    await a.until(() => a.state);
    assert.strictEqual(a.state.seats[0].name, 'RaviKing');
    const code = a.state.code;

    // guest cannot join
    g.send({ t: 'join', game: 'ludo', token: tok(), name: 'Guest', code, passcode: '1234', auth: 'tok-guest' });
    await g.until(() => g.errs.length > 1);
    assert(!g.state);

    // a second account joins under its username
    b.send({ t: 'join', game: 'ludo', token: tok(), name: 'whatever', code, passcode: '1234', auth: 'tok-sita' });
    await b.until(() => b.state);
    assert.deepStrictEqual(b.state.seats.filter(Boolean).map((s) => s.name), ['RaviKing', 'Sita_7']);

    // the same account from another device takes back its own seat (no duplicate seat)
    b2.send({ t: 'join', game: 'ludo', token: tok(), name: 'x', code, passcode: '1234', auth: 'tok-sita' });
    await b2.until(() => b2.state);
    assert.strictEqual(b2.state.you, b.state.you);
    assert.strictEqual(b2.state.seats.filter(Boolean).length, 2);

    // reconnecting with the device token (hello) still works without sending the sign-in again
    const c2 = await open(port);
    c2.send({ t: 'hello', game: 'ludo', code, token: ta });
    await c2.until(() => c2.state);
    assert.strictEqual(c2.state.you, 0);

    console.log('auth tests passed');
    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
});
